// 將 WMS 拋檔匯入 gap_db
//   .im : 832 轉出的商品檔 (第一行為欄位名稱) -> gapwmc_832_item
//   .rc : 850 轉出的收貨檔 (RCPHDR / RCPDETL / RCPCTNDR) -> gapwmc_850_header / detail / carton
//
// 用法: pnpm import-wms [--dry-run] [--replace] <檔案...>
//   --dry-run  完整執行後 ROLLBACK, 只檢查不寫入
//   --replace  同檔名已匯入過時, 先刪除舊資料再匯入 (預設為略過)
// 連線設定讀取專案根目錄的 .env (PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD)

import { existsSync, readFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = resolve(projectRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const RC_TABLES = {
  RCPHDR: 'gapwmc_850_header',
  RCPDETL: 'gapwmc_850_detail',
  RCPCTNDR: 'gapwmc_850_carton',
};
const IM_TABLE = 'gapwmc_832_item';

const toNull = (v) => (v === '' ? null : v);
const snake = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function readLines(file) {
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '');
}

function detectType(lines) {
  if (lines[0]?.startsWith('Customer_Code|')) return 'im';
  if (lines[0]?.startsWith('RCPHDR|')) return 'rc';
  throw new Error(`無法判斷檔案類型 (第一行應為 Customer_Code|... 或 RCPHDR|...)`);
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

async function importIm(client, lines, sourceFile) {
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
    await insert(client, IM_TABLE, ['source_file', 'line_no', ...cols], [sourceFile, i + 1, ...fields.map(toNull)]);
  }
  return { [IM_TABLE]: rows.length };
}

async function importRc(client, lines, sourceFile) {
  const fieldCols = {};
  for (const [type, table] of Object.entries(RC_TABLES)) {
    fieldCols[type] = (await tableColumns(client, table)).filter((c) => /^f\d\d/.test(c));
  }

  const counts = Object.fromEntries(Object.values(RC_TABLES).map((t) => [t, 0]));
  let headerId = null;
  for (const [i, line] of lines.entries()) {
    const fields = line.split('|');
    const type = fields[0];
    const table = RC_TABLES[type];
    if (!table) throw new Error(`第 ${i + 1} 行: 未知的記錄類型 ${type}`);
    const cols = fieldCols[type];
    if (fields.length !== cols.length) {
      throw new Error(`第 ${i + 1} 行 ${type} 有 ${fields.length} 欄, ${table} 定義為 ${cols.length} 欄`);
    }

    if (type === 'RCPHDR') {
      headerId = await insert(client, table, ['source_file', ...cols], [sourceFile, ...fields.map(toNull)]);
    } else {
      if (headerId === null) throw new Error(`第 ${i + 1} 行 ${type} 之前沒有 RCPHDR`);
      await insert(client, table, ['header_id', ...cols], [headerId, ...fields.map(toNull)]);
    }
    counts[table]++;
  }
  return counts;
}

async function importFile(client, file, { replace }) {
  const lines = readLines(file);
  const type = detectType(lines);
  const sourceFile = basename(file);
  // 850 的 detail / carton 以 ON DELETE CASCADE 跟著表頭刪除
  const ownerTable = type === 'im' ? IM_TABLE : RC_TABLES.RCPHDR;

  const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${ownerTable} WHERE source_file = $1`, [
    sourceFile,
  ]);
  if (rows[0].n > 0) {
    if (!replace) return { skipped: `已匯入過 (${ownerTable} 有 ${rows[0].n} 筆), 加上 --replace 可重新匯入` };
    await client.query(`DELETE FROM ${ownerTable} WHERE source_file = $1`, [sourceFile]);
  }
  return type === 'im' ? importIm(client, lines, sourceFile) : importRc(client, lines, sourceFile);
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
        await client.query(dryRun ? 'ROLLBACK' : 'COMMIT');
        const summary = result.skipped ?? Object.entries(result).map(([t, n]) => `${t} ${n} 筆`).join(', ');
        console.log(`${dryRun ? '[dry-run] ' : ''}${file}: ${summary}`);
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

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
