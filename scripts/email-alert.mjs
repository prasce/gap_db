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

// RFC 2047: 標頭 (主旨/寄件人名稱) 含中文時必須編成 =?UTF-8?B?...?=, 否則 Gmail 會當成未知編碼, 中文全部變成 ?。
// 每個編碼字不超過 75 字元 (去掉前後綴後 base64 最多 63 字元 = 45 bytes), 以字元為單位切, 不會把一個中文字切成兩半
export function encodeHeader(text) {
  if (/^[\x00-\x7f]*$/.test(text)) return text;
  const words = [];
  let chunk = '';
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch) > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w).toString('base64')}?=`).join('\r\n ');
}

// ALERT_EMAIL_TO 可以用分號或逗號放多個收件人, 例如 "a@x.com;b@y.com"
export function parseRecipients(text) {
  return text
    .split(/[;,]/)
    .map((r) => r.trim())
    .filter(Boolean);
}

// "名稱 <信箱>" 只編碼名稱部分, 信箱維持 ASCII
function formatAddress(value) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match || !match[1]) return value;
  return `${encodeHeader(match[1].replace(/^"|"$/g, ''))} <${match[2]}>`;
}

// 組成完整信件 (不含結尾的 "." 行): 標頭與內文全部是 ASCII, 內文以 UTF-8 + base64 傳輸, 所以中文與開頭是 "." 的行都不會出問題
export function buildMessage({ from, recipients, subject, body }) {
  const base64Body = Buffer.from(body, 'utf8').toString('base64').match(/.{1,76}/g) ?? [];
  return [
    `From: ${formatAddress(from)}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    ...base64Body,
  ].join('\r\n');
}

async function smtpCommand(socket, line) {
  socket.write(line + '\r\n');
  return readResponse(socket);
}

// subject/body: 信件內容; to 預設寄給 EMAIL_USER 自己 (可用 ALERT_EMAIL_TO 覆寫收件人, 多個收件人以分號或逗號分隔)
export async function sendAlertEmail({ subject, body, to }) {
  const { EMAIL_USER, EMAIL_PASS, EMAIL_FROM, ALERT_EMAIL_TO } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) {
    throw new Error('缺少 EMAIL_USER / EMAIL_PASS 環境變數, 無法寄送警示信');
  }
  const recipients = parseRecipients(to ?? ALERT_EMAIL_TO ?? EMAIL_USER);
  if (recipients.length === 0) throw new Error('沒有收件人 (ALERT_EMAIL_TO 是空的)');

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
        for (const recipient of recipients) {
          const rcptRes = await smtpCommand(socket, `RCPT TO:<${recipient.replace(/^.*<|>$/g, '')}>`);
          if (!rcptRes.startsWith('250')) throw new Error(`收件人 ${recipient} 被拒絕: ` + rcptRes.trim());
        }
        await smtpCommand(socket, 'DATA');
        const message = buildMessage({ from: EMAIL_FROM || EMAIL_USER, recipients, subject, body });
        const sendRes = await smtpCommand(socket, message + '\r\n.');
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
