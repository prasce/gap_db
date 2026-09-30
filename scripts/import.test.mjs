// 純函式單元測試 (不連資料庫); 用 Node 內建 test runner, 不裝額外套件
// 執行: node --test scripts/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImStatus, detectType, snake, toNull } from './import.mjs';

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
