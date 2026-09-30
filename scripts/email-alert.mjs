// 透過 Gmail SMTP 寄送警示信 (node:tls 手動走 SMTP, 不依賴額外套件)。
// 帳密讀取 .env 的 EMAIL_USER / EMAIL_PASS (Gmail 應用程式密碼, 需先開兩步驟驗證才能產生) / EMAIL_FROM。
import tls from 'node:tls';

// 連線整體逾時: Gmail 沒回應時避免呼叫端 (import.mjs / UAT 測試) 卡住轉圈圈轉不停
const SMTP_TIMEOUT_MS = 15000;

export function readResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (chunk) => {
      buf += chunk.toString();
      // buf 還沒以 \r\n 結尾代表最後一行還沒收完整 (可能被 TCP 切成兩個 chunk), 不能拿還沒收完的半行去判斷
      if (!buf.endsWith('\r\n')) return;
      // SMTP 多行回應的最後一行第 4 碼是空白 (非 '-')
      const lines = buf.split('\r\n').filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buf);
      }
    };
    const onError = (err) => { cleanup(); reject(err); };
    const cleanup = () => { socket.removeListener('data', onData); socket.removeListener('error', onError); };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function smtpCommand(socket, line) {
  socket.write(line + '\r\n');
  return readResponse(socket);
}

// subject/body: 信件內容; to 預設寄給 EMAIL_USER 自己 (可用 ALERT_EMAIL_TO 覆寫收件人)
export async function sendAlertEmail({ subject, body, to }) {
  const { EMAIL_USER, EMAIL_PASS, EMAIL_FROM, ALERT_EMAIL_TO } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('缺少 EMAIL_USER / EMAIL_PASS 環境變數, 無法寄送警示信');
  }
  const recipient = to ?? ALERT_EMAIL_TO ?? EMAIL_USER;

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const socket = tls.connect({ host: 'smtp.gmail.com', port: 465 }, async () => {
      try {
        await readResponse(socket);
        await smtpCommand(socket, 'EHLO localhost');
        await smtpCommand(socket, 'AUTH LOGIN');
        await smtpCommand(socket, Buffer.from(EMAIL_USER).toString('base64'));
        const authRes = await smtpCommand(socket, Buffer.from(EMAIL_PASS).toString('base64'));
        if (!authRes.startsWith('235')) throw new Error('Gmail 驗證失敗: ' + authRes.trim());

        await smtpCommand(socket, `MAIL FROM:<${EMAIL_USER}>`);
        await smtpCommand(socket, `RCPT TO:<${recipient}>`);
        await smtpCommand(socket, 'DATA');
        const message = [
          `From: ${EMAIL_FROM || EMAIL_USER}`,
          `To: ${recipient}`,
          `Subject: ${subject}`,
          '',
          body,
          '.',
        ].join('\r\n');
        const sendRes = await smtpCommand(socket, message);
        if (!sendRes.startsWith('250')) throw new Error('寄送失敗: ' + sendRes.trim());

        await smtpCommand(socket, 'QUIT');
        socket.end();
        finish(resolve);
      } catch (err) {
        socket.end();
        finish(reject, err);
      }
    });
    socket.on('error', (err) => finish(reject, err));

    const timer = setTimeout(() => {
      socket.destroy();
      finish(reject, new Error(`SMTP 連線逾時 (超過 ${SMTP_TIMEOUT_MS / 1000} 秒)`));
    }, SMTP_TIMEOUT_MS);
  });
}
