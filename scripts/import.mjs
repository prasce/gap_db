// 將 WMS 拋檔匯入 gap_db
//   .im : 832 轉出的商品檔 (第一行為欄位名稱) -> gapwmc_832_item
//   .rc : 850 轉出的收貨檔 (RCPHDR / RCPDETL / RCPCTNDR) -> gapwmc_850_header / detail / carton
//
// 用法: pnpm import-wms [--dry-run] [--replace] <檔案...>
//   --dry-run  完整執行後 ROLLBACK, 只檢查不寫入
//   --replace  同檔名已匯入過時重新套用 (預設為略過); .im 先刪除該檔舊資料再匯入, .rc 因為同一張 PO 本來就是原地更新, 不需要刪除
//
// 850 (.rc) 同一張 PO (f06_po_number) 同時只保留一份有效的: 第一次收到新增, 再收到就原地更新 header / 明細 (數量、狀態等),
// 明細以檔案內容為準 (新品號新增、檔案沒有的舊行刪除)。CANCEL 只改狀態、PO 保留 (不刪除);
// 已 CANCEL 的 PO 再收到 ACTIVE 時, 新增一筆 PO, 舊的 CANCEL 筆保留。832 (.im) 仍是 append-only。
// 連線設定讀取專案根目錄的 .env (PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD)

import { existsSync, readFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { sendAlertEmail } from './email-alert.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(projectRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const RC_TABLES = {
  RCPHDR: 'gapwmc_850_header',
  RCPDETL: 'gapwmc_850_detail',
  RCPCTNDR: 'gapwmc_850_carton',
};
const IM_TABLE = 'gapwmc_832_item';

export const toNull = (v) => (v === '' ? null : v);
export const snake = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function readLines(file) {
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
}

export function detectType(lines) {
  if (lines[0]?.startsWith('Customer_Code|')) return 'im';
  if (lines[0]?.startsWith('RCPHDR|')) return 'rc';
  throw new Error(`無法判斷檔案類型 (第一行應為 Customer_Code|... 或 RCPHDR|...)`);
}

const IM_STATUS_BY_KEYWORD = [
  [/_Add_/i, 'ADD'],
  [/_Update_/i, 'UPDATE'],
  [/_Delete_/i, 'DELETE'],
];

export function detectImStatus(sourceFile) {
  const match = IM_STATUS_BY_KEYWORD.find(([re]) => re.test(sourceFile));
  if (!match) throw new Error(`檔名無法判斷事件類型 (應含 Add/Update/Delete): ${sourceFile}`);
  return match[1];
}

async function tableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [table]
  );
  if (rows.length === 0) throw new Error(`資料表 ${table} 不存在, 請先執行 gap_db.sql`);
  return rows.map((r) => r.column_name);
}

async function insert(client, table, cols, values) {
  const params = cols.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await client.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${params}) RETURNING id`,
    values
  );
  return rows[0].id;
}

// 每個 importXxx 都回傳新物件描述這次匯入的結果, 不接受/修改呼叫端傳進來的物件 (out-parameter 是 mutation, 這裡改成純回傳值組合)
async function importIm(client, lines, sourceFile) {
  const status = detectImStatus(sourceFile);
  const header = lines[0].split('|');
  const tableCols = await tableColumns(client, IM_TABLE);
  const cols = header.map(snake);
  const missing = cols.filter((c) => !tableCols.includes(c));
  if (missing.length) throw new Error(`.im 欄位在 ${IM_TABLE} 中找不到: ${missing.join(', ')}`);

  const rows = lines.slice(1);
  for (const [i, line] of rows.entries()) {
    const fields = line.split('|');
    if (fields.length !== header.length) {
      throw new Error(`第 ${i + 2} 行有 ${fields.length} 欄, 應為 ${header.length} 欄`);
    }
    await insert(
      client,
      IM_TABLE,
      ['source_file', 'line_no', 'status', ...cols],
      [sourceFile, i + 1, status, ...fields.map(toNull)]
    );
  }
  return { counts: { [IM_TABLE]: rows.length }, type: 'im', poNumber: null, detailItems: [] };
}

// 明細行配對鍵: 完整品號 (f05_item_number + f26_item_last_digit), 與 832 的 sku || left(long_description, 1) 對應
export const detailKey = (itemNumber, lastDigit) => (itemNumber ?? '') + (lastDigit ?? '');

// 把 .rc 的記錄 (已用 | 切成欄位陣列) 依 RCPHDR 分組: 明細 / 箱明細掛在最近一個表頭底下。
// 一個檔案通常只有一張 PO, 但格式允許多個 RCPHDR
export function groupRcRecords(records) {
  const groups = [];
  for (const [i, fields] of records.entries()) {
    const type = fields[0];
    if (!RC_TABLES[type]) throw new Error(`第 ${i + 1} 行: 未知的記錄類型 ${type}`);
    if (type === 'RCPHDR') {
      groups.push({ header: fields, details: [], cartons: [] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (!current) throw new Error(`第 ${i + 1} 行 ${type} 之前沒有 RCPHDR`);
    (type === 'RCPDETL' ? current.details : current.cartons).push(fields);
  }
  return groups;
}

// 同一張 PO 再收到時, 明細以「檔案內容為準」同步: 品號相同 -> 原地更新 (例如數量), 檔案新出現的品號 -> 新增,
// 檔案裡已經沒有的舊行 -> 刪除。existing: [{id, key}] (依 id 排序), incoming: [{key, fields}] (依檔案順序)。
// 同一品號重複出現時依出現順序一對一配對。純函式, 不碰資料庫
export function planDetailSync(existing, incoming) {
  const idsByKey = new Map();
  for (const { id, key } of existing) idsByKey.set(key, [...(idsByKey.get(key) ?? []), id]);

  const updates = [];
  const inserts = [];
  for (const { key, fields } of incoming) {
    const ids = idsByKey.get(key) ?? [];
    if (ids.length > 0) {
      updates.push({ id: ids[0], fields });
      idsByKey.set(key, ids.slice(1));
    } else {
      inserts.push(fields);
    }
  }
  const deleteIds = [...idsByKey.values()].flat().sort((a, b) => a - b);
  return { updates, inserts, deleteIds };
}

async function updateRow(client, table, id, cols, values, extraSql = '') {
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  await client.query(`UPDATE ${table} SET ${sets}${extraSql} WHERE id = $${cols.length + 1}`, [...values, id]);
}

export const isCancelled = (status) => ['CANCEL', 'CANCELLED'].includes((status ?? '').trim().toUpperCase());

// 決定收到的 PO 要更新哪一筆 header (回傳 id), 回傳 null 代表要新增。existing: [{id, status}] (依 id 排序)
// - 有「未取消」的一筆 -> 更新它 (包含被改成 CANCEL)
// - 只剩已取消的: 檔案也是取消 -> 更新最新一筆已取消的; 檔案不是取消 (例如 CANCEL 之後重新 ACTIVE) -> 新增, 已取消的保留當歷史
export function pickTargetHeader(existing, incomingStatus) {
  const active = existing.filter((r) => !isCancelled(r.status));
  if (active.length > 0) return active[active.length - 1].id;
  if (existing.length > 0 && isCancelled(incomingStatus)) return existing[existing.length - 1].id;
  return null;
}

// 套用一張 PO: 沒有就新增 header / detail / carton; 已經有 (同 f06_po_number) 就原地更新, 同一張 PO 同時只有一份有效的。
// CANCEL 只改狀態、PO 保留; 已取消的 PO 再收到非取消狀態時新增一筆 (見 pickTargetHeader)。
// 箱明細 (RCPCTNDR) 只有檔案帶了才整批取代; 檔案沒帶箱明細 (例如只有兩層的 DPO) 時保留原本的, 不當成「全部刪除」
async function applyPo(client, group, sourceFile, fieldCols, poNumberIdx) {
  const poNumber = toNull(group.header[poNumberIdx]);
  if (!poNumber) throw new Error('RCPHDR 沒有 PO 號 (f06_po_number), 無法判斷是新增還是更新');
  const headerValues = group.header.map(toNull);
  const statusIdx = fieldCols.RCPHDR.indexOf('f13_order_status');

  const found = await client.query(
    `SELECT id, f13_order_status AS status FROM ${RC_TABLES.RCPHDR} WHERE f06_po_number = $1 ORDER BY id FOR UPDATE`,
    [poNumber]
  );
  const targetId = pickTargetHeader(found.rows, headerValues[statusIdx]);
  const isNew = targetId === null;
  const reactivated = isNew && found.rows.length > 0;
  let headerId;
  if (isNew) {
    headerId = await insert(client, RC_TABLES.RCPHDR, ['source_file', ...fieldCols.RCPHDR], [sourceFile, ...headerValues]);
  } else {
    headerId = targetId;
    await updateRow(client, RC_TABLES.RCPHDR, headerId, ['source_file', ...fieldCols.RCPHDR], [sourceFile, ...headerValues], ', updated_at = now()');
  }

  const itemIdx = fieldCols.RCPDETL.indexOf('f05_item_number');
  const digitIdx = fieldCols.RCPDETL.indexOf('f26_item_last_digit');
  const incoming = group.details.map((fields) => {
    const values = fields.map(toNull);
    return { key: detailKey(values[itemIdx], values[digitIdx]), fields: values };
  });
  const existingRows = isNew
    ? []
    : (
        await client.query(
          `SELECT id, f05_item_number, f26_item_last_digit FROM ${RC_TABLES.RCPDETL} WHERE header_id = $1 ORDER BY id`,
          [headerId]
        )
      ).rows;
  const plan = planDetailSync(
    existingRows.map((r) => ({ id: r.id, key: detailKey(r.f05_item_number, r.f26_item_last_digit) })),
    incoming
  );
  for (const { id, fields } of plan.updates) {
    await updateRow(client, RC_TABLES.RCPDETL, id, fieldCols.RCPDETL, fields, ', updated_at = now()');
  }
  for (const fields of plan.inserts) {
    await insert(client, RC_TABLES.RCPDETL, ['header_id', ...fieldCols.RCPDETL], [headerId, ...fields]);
  }
  if (plan.deleteIds.length > 0) {
    await client.query(`DELETE FROM ${RC_TABLES.RCPDETL} WHERE id = ANY($1)`, [plan.deleteIds]);
  }

  if (group.cartons.length > 0) {
    await client.query(`DELETE FROM ${RC_TABLES.RCPCTNDR} WHERE header_id = $1`, [headerId]);
    for (const fields of group.cartons) {
      await insert(client, RC_TABLES.RCPCTNDR, ['header_id', ...fieldCols.RCPCTNDR], [headerId, ...fields.map(toNull)]);
    }
  }

  return {
    poNumber,
    action: reactivated ? '新增 (取消後重新啟用, 舊筆保留)' : isNew ? '新增' : '更新',
    lines: { inserted: plan.inserts.length, updated: plan.updates.length, deleted: plan.deleteIds.length },
    detailItems: incoming.filter((l) => l.key).map((l) => ({ itemNumber: l.fields[itemIdx], lastDigit: l.fields[digitIdx] })),
  };
}

async function importRc(client, lines, sourceFile) {
  const fieldCols = {};
  for (const [type, table] of Object.entries(RC_TABLES)) {
    fieldCols[type] = (await tableColumns(client, table)).filter((c) => /^f\d\d/.test(c));
  }
  const poNumberIdx = fieldCols.RCPHDR.indexOf('f06_po_number');

  const records = lines.map((line) => line.split('|'));
  for (const [i, fields] of records.entries()) {
    const table = RC_TABLES[fields[0]];
    if (!table) throw new Error(`第 ${i + 1} 行: 未知的記錄類型 ${fields[0]}`);
    const cols = fieldCols[fields[0]];
    if (fields.length !== cols.length) {
      throw new Error(`第 ${i + 1} 行 ${fields[0]} 有 ${fields.length} 欄, ${table} 定義為 ${cols.length} 欄`);
    }
  }

  const counts = Object.fromEntries(Object.values(RC_TABLES).map((t) => [t, 0]));
  for (const fields of records) counts[RC_TABLES[fields[0]]]++;

  const groups = groupRcRecords(records);

  // 擋下規則: 明細品號只要有任何一個在 gapwmc_832_item 找不到 (未收到 Item Master 即收到 DPO), 整個檔案都不寫入
  // header / detail / carton (包含不寫入已存在 PO 的更新), 回報給呼叫端寄警示信
  const itemIdx = fieldCols.RCPDETL.indexOf('f05_item_number');
  const digitIdx = fieldCols.RCPDETL.indexOf('f26_item_last_digit');
  const detailItems = groups
    .flatMap((g) => g.details)
    .map((fields) => ({ itemNumber: toNull(fields[itemIdx]), lastDigit: toNull(fields[digitIdx]) }))
    .filter((item) => item.itemNumber);
  const missing = await findMissingItemMasters(client, detailItems);
  if (missing.length > 0) {
    return { type: 'rc', blocked: { poNumber: toNull(groups[0]?.header[poNumberIdx] ?? ''), missing } };
  }

  const changes = [];
  for (const group of groups) {
    changes.push(await applyPo(client, group, sourceFile, fieldCols, poNumberIdx));
  }
  return {
    counts,
    type: 'rc',
    poNumber: changes[0]?.poNumber ?? null,
    detailItems: changes.flatMap((c) => c.detailItems),
    changes,
  };
}

async function importFile(client, file, { replace }) {
  const lines = readLines(file);
  const type = detectType(lines);
  const sourceFile = basename(file);

  if (type === 'rc') {
    // 850: 同一張 PO 只保留一份, 再收到就原地更新 (見 applyPo), 所以 --replace 不需要先刪除。
    // header.source_file 記的是「最後一次更新這張 PO 的檔案」, 沒加 --replace 時同一個檔案不重複套用
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${RC_TABLES.RCPHDR} WHERE source_file = $1`, [sourceFile]);
    if (rows[0].n > 0 && !replace) {
      return { skipped: `已匯入過 (${RC_TABLES.RCPHDR} 有 ${rows[0].n} 筆), 加上 --replace 可重新套用` };
    }
    return importRc(client, lines, sourceFile);
  }

  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${IM_TABLE} WHERE source_file = $1`, [sourceFile]);
  if (rows[0].n > 0) {
    if (!replace) return { skipped: `已匯入過 (${IM_TABLE} 有 ${rows[0].n} 筆), 加上 --replace 可重新匯入` };
    await client.query(`DELETE FROM ${IM_TABLE} WHERE source_file = $1`, [sourceFile]);
  }
  return importIm(client, lines, sourceFile);
}

// 850 情境 6: 明細品號在 gapwmc_832_item 中完全找不到 (不論 status), 視為「未收到 Item Master 即收到 DPO」
async function findMissingItemMasters(client, detailItems) {
  const missing = [];
  for (const { itemNumber, lastDigit } of detailItems) {
    const fullItem = itemNumber + (lastDigit ?? '');
    const { rows } = await client.query(
      `SELECT 1 FROM gapwmc_832_item WHERE sku || left(long_description, 1) = $1 LIMIT 1`,
      [fullItem]
    );
    if (rows.length === 0) missing.push(fullItem);
  }
  return missing;
}

async function alertBlockedPo(sourceFile, { poNumber, missing }) {
  const body = [
    `Imported file: ${sourceFile}`,
    `PO number: ${poNumber ?? '(unknown)'}`,
    'The following item numbers have no matching 832 Item Master record. The DPO was blocked and nothing was written to header / detail / carton:',
    ...missing.map((item) => `- ${item}`),
  ].join('\n');
  await sendAlertEmail({ subject: `[GAP Test Environment] 850 blocked: unknown item number - PO ${poNumber ?? ''} (${sourceFile})`, body });
  console.log(`  -> 已寄出警示信: ${missing.length} 個品號未在 Item Master 中找到`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const replace = args.includes('--replace');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('用法: pnpm import-wms [--dry-run] [--replace] <檔案...>');
    process.exit(2);
  }

  const client = new pg.Client();
  await client.connect();
  let failed = 0;
  try {
    for (const file of files) {
      // 每個檔案各自一個交易, 失敗時整個檔案都不寫入
      await client.query('BEGIN');
      try {
        const result = await importFile(client, file, { replace });
        if (result.blocked) {
          // 被擋下的檔案什麼都沒寫入 (importRc 在寫入前就回傳), 以失敗計 (exit code 1), 但仍寄警示信通知
          await client.query('ROLLBACK');
          const { poNumber, missing } = result.blocked;
          console.error(`${file}: 已擋下, 未寫入任何資料 - PO ${poNumber ?? '(未知)'} 有 ${missing.length} 個品號在 gapwmc_832_item 找不到: ${missing.join(', ')}`);
          failed++;
          if (!dryRun) {
            try {
              await alertBlockedPo(basename(file), result.blocked);
            } catch (alertErr) {
              console.error(`  -> 警示信寄送失敗: ${alertErr.message}`);
            }
          }
          continue;
        }
        await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
        const summary = result.skipped ?? Object.entries(result.counts).map(([t, n]) => `${t} ${n} 筆`).join(', ');
        console.log(`${dryRun ? '[dry-run] ' : ''}${file}: ${summary}`);
        for (const c of result.changes ?? []) {
          const { inserted, updated, deleted } = c.lines;
          console.log(`  -> PO ${c.poNumber}: ${c.action} (明細 新增 ${inserted} / 更新 ${updated} / 刪除 ${deleted})`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`${file}: 失敗, 未寫入任何資料 - ${err.message}`);
        failed++;
      }
    }
  } finally {
    await client.end();
  }
  process.exit(failed ? 1 : 0);
}

// 只有直接執行這個檔案時才跑 main(); 被 import.test.mjs 用 `import` 載入時不會觸發
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
