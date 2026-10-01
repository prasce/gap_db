// 單元測試: readResponse 的 SMTP 回應解析邏輯、sendAlertEmail 的環境變數檢查、以及信件 MIME 編碼 (中文主旨/寄件人/內文不可變亂碼)
// 執行: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readResponse, sendAlertEmail, encodeHeader, parseRecipients, buildMessage } from './email-alert.mjs';

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

// 把 =?UTF-8?B?...?= 編碼字還原成文字 (測試用)
const decodeWords = (value) =>
  value
    .replace(/\r\n /g, '')
    .replace(/=\?UTF-8\?B\?([^?]*)\?=/g, (_, b64) => Buffer.from(b64, 'base64').toString('utf8'));

const ASCII_ONLY = /^[\x00-\x7f]*$/;

test('encodeHeader: 純 ASCII 原樣回傳', () => {
  assert.equal(encodeHeader('hello PO TEST0001'), 'hello PO TEST0001');
});

test('encodeHeader: 含中文時編成 RFC 2047 UTF-8 編碼字, 解碼後與原文相同', () => {
  const text = '[GAP測試環境] 850 收到未知品號警示 - PO TEST0002';
  const encoded = encodeHeader(text);
  assert.match(encoded, /^=\?UTF-8\?B\?/);
  assert.match(encoded, ASCII_ONLY); // 標頭裡不能再有任何非 ASCII 字元
  assert.equal(decodeWords(encoded), text);
});

test('encodeHeader: 很長的中文主旨會切成多個編碼字 (每個不超過 75 字元), 且不會把一個中文字切成兩半', () => {
  const text = '測試'.repeat(60);
  const encoded = encodeHeader(text);
  for (const word of encoded.split('\r\n ')) assert.ok(word.length <= 75, word);
  assert.equal(decodeWords(encoded), text);
});

test('parseRecipients: 支援分號與逗號分隔, 去掉空白與空項目', () => {
  assert.deepEqual(parseRecipients('a@x.com; b@y.com, c@z.com;'), ['a@x.com', 'b@y.com', 'c@z.com']);
  assert.deepEqual(parseRecipients('a@x.com'), ['a@x.com']);
});

test('buildMessage: 標頭與內文都是純 ASCII, 帶 MIME 標頭, 解碼後能還原中文', () => {
  const message = buildMessage({
    from: 'GAP測試環境異常通知 <ezlogistics.ai@gmail.com>',
    recipients: ['a@x.com', 'b@y.com'],
    subject: '[GAP測試環境] 警示',
    body: '匯入檔案: SET 07.rc\nPO 號: TEST0002',
  });
  assert.match(message, ASCII_ONLY);
  assert.match(message, /MIME-Version: 1\.0/);
  assert.match(message, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(message, /Content-Transfer-Encoding: base64/);
  assert.match(message, /To: a@x\.com, b@y\.com/);
  const [head, body] = message.split('\r\n\r\n');
  assert.equal(decodeWords(head.match(/Subject: (.*(?:\r\n .*)*)/)[1]), '[GAP測試環境] 警示');
  assert.equal(
    decodeWords(head.match(/From: (.*(?:\r\n .*)*)/)[1]),
    'GAP測試環境異常通知 <ezlogistics.ai@gmail.com>'
  );
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), '匯入檔案: SET 07.rc\nPO 號: TEST0002');
});
