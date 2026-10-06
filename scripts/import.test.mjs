// 純函式單元測試 (不連資料庫); 用 Node 內建 test runner, 不裝額外套件
// 執行: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockedPoEmail, detailKey, detectImStatus, detectType, findImStatusKeyword, groupRcRecords, inferImStatus, isCancelled, pickTargetHeader, planDetailSync, snake, toNull } from './import.mjs';

test('toNull 把空字串轉成 null, 其餘原樣保留', () => {
  assert.equal(toNull(''), null);
  assert.equal(toNull('0'), '0');
  assert.equal(toNull('abc'), 'abc');
});

test('snake 把檔案欄位名轉成小寫底線格式', () => {
  assert.equal(snake('Customer_Code'), 'customer_code');
  assert.equal(snake('Units per Carton'), 'units_per_carton');
  assert.equal(snake('Item Desc'), 'item_desc');
});

test('detectType 依第一行判斷 .im / .rc', () => {
  assert.equal(detectType(['Customer_Code|SKU|...']), 'im');
  assert.equal(detectType(['RCPHDR|TS260930|...']), 'rc');
});

test('detectType 對無法辨識的內容丟出錯誤', () => {
  assert.throws(() => detectType(['garbage']), /無法判斷檔案類型/);
});

test('detectImStatus 依檔名判斷 ADD/UPDATE/DELETE (不分大小寫)', () => {
  assert.equal(detectImStatus('832_Item_Add_G53_003.txt.im'), 'ADD');
  assert.equal(detectImStatus('832_Item_Update_G53_001.txt.im'), 'UPDATE');
  assert.equal(detectImStatus('832_Item_Delete_G53_002.txt.im'), 'DELETE');
  assert.equal(detectImStatus('SET 01 832_Item_add_G53_003 new .im'), 'ADD');
});

test('detectImStatus 對沒有 Add/Update/Delete 關鍵字的檔名丟出錯誤', () => {
  assert.throws(() => detectImStatus('832_Item_G53_003.im'), /檔名無法判斷事件類型/);
});

test('findImStatusKeyword 檔名有關鍵字回傳事件類型, 沒有回傳 null', () => {
  assert.equal(findImStatusKeyword('832_Item_Update_G53_001.txt.im'), 'UPDATE');
  assert.equal(findImStatusKeyword('GAPTWN_832_202610052329_000143730.x12.pgp.im'), null);
});

test('inferImStatus: SKU 全部是新的 -> ADD', () => {
  const rows = [{ customer_code: '0001', sku: '1' }, { customer_code: '0001', sku: '2' }];
  assert.equal(inferImStatus(rows, new Map()), 'ADD');
});

test('inferImStatus: 有 SKU 已存在 (最新狀態不是 DELETE) -> UPDATE', () => {
  const rows = [{ customer_code: '0001', sku: '1' }, { customer_code: '0001', sku: '2' }];
  assert.equal(inferImStatus(rows, new Map([['0001|1', 'ADD']])), 'UPDATE');
  assert.equal(inferImStatus(rows, new Map([['0001|1', 'ADD'], ['0001|2', 'UPDATE']])), 'UPDATE');
});

test('inferImStatus: 已被 DELETE 的 SKU 再出現視為新增; 同 SKU 不同客戶代碼視為不同商品', () => {
  const rows = [{ customer_code: '0001', sku: '1' }];
  assert.equal(inferImStatus(rows, new Map([['0001|1', 'DELETE']])), 'ADD');
  assert.equal(inferImStatus(rows, new Map([['0003|1', 'ADD']])), 'ADD');
});

test('inferImStatus: 沒有資料列視為 ADD', () => {
  assert.equal(inferImStatus([], new Map()), 'ADD');
});

test('planDetailSync: 同品號更新(數量變更)、新品號新增、檔案裡沒有的舊行刪除', () => {
  const existing = [
    { id: 10, key: 'A' },
    { id: 11, key: 'B' },
  ];
  const incoming = [
    { key: 'A', fields: ['A200'] },
    { key: 'C', fields: ['C1'] },
  ];

  const plan = planDetailSync(existing, incoming);

  assert.deepEqual(plan.updates, [{ id: 10, fields: ['A200'] }]);
  assert.deepEqual(plan.inserts, [['C1']]);
  assert.deepEqual(plan.deleteIds, [11]);
});

test('planDetailSync: 檔案內同一品號出現多次時依出現順序與舊行配對', () => {
  const existing = [
    { id: 1, key: 'A' },
    { id: 2, key: 'A' },
  ];
  const incoming = [
    { key: 'A', fields: ['first'] },
    { key: 'A', fields: ['second'] },
    { key: 'A', fields: ['third'] },
  ];

  const plan = planDetailSync(existing, incoming);

  assert.deepEqual(plan.updates, [
    { id: 1, fields: ['first'] },
    { id: 2, fields: ['second'] },
  ]);
  assert.deepEqual(plan.inserts, [['third']]);
  assert.deepEqual(plan.deleteIds, []);
});

test('planDetailSync: 沒有舊行時全部新增, 沒有新行時全部刪除', () => {
  assert.deepEqual(planDetailSync([], [{ key: 'A', fields: ['a'] }]), { updates: [], inserts: [['a']], deleteIds: [] });
  assert.deepEqual(planDetailSync([{ id: 5, key: 'A' }], []), { updates: [], inserts: [], deleteIds: [5] });
});

test('detailKey: 完整品號 = f05 + f26, f26 為空時只用 f05', () => {
  assert.equal(detailKey('32408433', '8'), '324084338');
  assert.equal(detailKey('32408433', null), '32408433');
  // 2026-10 新格式: f05 已是 9 碼, f26 為空
  assert.equal(detailKey('324084338', null), '324084338');
  assert.equal(detailKey('324084338', ''), '324084338');
});

const HDR = ['RCPHDR', 'P1'];
const DET = ['RCPDETL', 'item1'];
const CTN = ['RCPCTNDR', 'c1'];

test('groupRcRecords: 依 RCPHDR 分組, 明細與箱明細掛在最近一個表頭底下', () => {
  const groups = groupRcRecords([HDR, DET, DET, CTN, ['RCPHDR', 'P2'], DET]);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].details.length, 2);
  assert.deepEqual(groups[0].cartons.length, 1);
  assert.deepEqual(groups[1].header, ['RCPHDR', 'P2']);
  assert.equal(groups[1].details.length, 1);
});

test('groupRcRecords: RCPHDR 之前出現明細時丟出錯誤並指出行號', () => {
  assert.throws(() => groupRcRecords([DET, HDR]), /第 1 行 RCPDETL 之前沒有 RCPHDR/);
});

test('pickTargetHeader: 有效的 PO 原地更新, 包含被改成 CANCEL (只改狀態, 不新增不刪除)', () => {
  assert.equal(pickTargetHeader([{ id: 1, status: 'ACTIVE' }], 'CANCEL'), 1);
  assert.equal(pickTargetHeader([{ id: 1, status: 'ACTIVE' }], 'ACTIVE'), 1);
});

test('pickTargetHeader: 只剩已取消的 PO 再收到 ACTIVE -> 新增 (null), 舊筆保留', () => {
  assert.equal(pickTargetHeader([{ id: 1, status: 'CANCEL' }], 'ACTIVE'), null);
});

test('pickTargetHeader: 已取消的 PO 再收到 CANCEL 不重複新增, 更新最新一筆已取消的', () => {
  assert.equal(pickTargetHeader([{ id: 1, status: 'CANCEL' }, { id: 2, status: 'CANCELLED' }], 'CANCEL'), 2);
});

test('pickTargetHeader: 取消歷史 + 一筆有效 -> 更新有效那筆; 沒有任何舊筆 -> 新增', () => {
  assert.equal(pickTargetHeader([{ id: 1, status: 'CANCEL' }, { id: 2, status: 'ACTIVE' }], 'ACTIVE'), 2);
  assert.equal(pickTargetHeader([], 'ACTIVE'), null);
});

test('isCancelled: 認 CANCEL / CANCELLED, 忽略大小寫與空白, null 視為未取消', () => {
  assert.equal(isCancelled(' cancelled '), true);
  assert.equal(isCancelled('ACTIVE'), false);
  assert.equal(isCancelled(null), false);
});

test('buildBlockedPoEmail: 主旨與內文符合 GAP 範本 (doc/alert email.md)', () => {
  const { subject, body } = buildBlockedPoEmail('850_PO_62028556_Active.rc', { poNumber: '62028556', missing: ['323891228', '323891352'] });
  assert.equal(subject, '[Missing Item Master Data] DPO 62028556 Unable to Receive in WMS');
  assert.equal(
    body,
    [
      'Imported File: 850_PO_62028556_Active.rc',
      'PO Number: 62028556',
      '',
      'The EDI 850 DPO was not received in WMS during processing as the following item master data could not be matched to any existing 832 Item Master records:',
      '',
      '1. 323891228',
      '2. 323891352',
      '',
      'As a result, the DPO was not created. Please review and ensure the corresponding EDI 832 Item Master Data are available before resubmitting the DPO.',
    ].join('\n')
  );
});

test('buildBlockedPoEmail: 沒有 PO 號時主旨與內文都顯示 (unknown)', () => {
  const { subject, body } = buildBlockedPoEmail('x.rc', { poNumber: null, missing: ['1'] });
  assert.match(subject, /DPO \(unknown\) Unable/);
  assert.match(body, /PO Number: \(unknown\)/);
});
