// 單元測試: readResponse 的 SMTP 回應解析邏輯, 以及 sendAlertEmail 的環境變數檢查
// 執行: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readResponse, sendAlertEmail } from './email-alert.mjs';

// 假的 socket: 只需要支援 on('data')/on('error')/removeListener, 用 EventEmitter 模擬
function fakeSocket() {
  return new EventEmitter();
}

test('readResponse 在收到單行完整回應時 resolve', async () => {
  const socket = fakeSocket();
  const promise = readResponse(socket);
  socket.emit('data', Buffer.from('220 smtp.gmail.com ESMTP\r\n'));
  assert.match(await promise, /^220 /);
});

test('readResponse 會等多行回應的最後一行 (code + 空白) 才 resolve', async () => {
  const socket = fakeSocket();
  const promise = readResponse(socket);
  // 中間行是 "250-" (dash), 還沒結束, 不該 resolve
  socket.emit('data', Buffer.from('250-smtp.gmail.com at your service\r\n'));
  socket.emit('data', Buffer.from('250-SIZE 35882577\r\n'));
  socket.emit('data', Buffer.from('250 SMTPUTF8\r\n'));
  const result = await promise;
  assert.match(result, /250 SMTPUTF8/);
});

test('readResponse 在 TCP 分段送達 (一行被切成兩個 chunk) 時仍能正確組回完整回應', async () => {
  const socket = fakeSocket();
  const promise = readResponse(socket);
  socket.emit('data', Buffer.from('235 2.7'));
  socket.emit('data', Buffer.from('.0 Accepted\r\n'));
  assert.match(await promise, /235 2\.7\.0 Accepted/);
});

test('readResponse 在 socket 觸發 error 時 reject', async () => {
  const socket = fakeSocket();
  const promise = readResponse(socket);
  const err = new Error('連線中斷');
  socket.emit('error', err);
  await assert.rejects(promise, /連線中斷/);
});

test('sendAlertEmail 缺少 EMAIL_USER/EMAIL_PASS 時直接丟錯誤, 不會嘗試連線', async () => {
  const savedUser = process.env.EMAIL_USER;
  const savedPass = process.env.EMAIL_PASS;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;
  try {
    await assert.rejects(
      sendAlertEmail({ subject: 'test', body: 'test' }),
      /缺少 EMAIL_USER \/ EMAIL_PASS/
    );
  } finally {
    if (savedUser !== undefined) process.env.EMAIL_USER = savedUser;
    if (savedPass !== undefined) process.env.EMAIL_PASS = savedPass;
  }
});
