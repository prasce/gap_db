-- =====================================================================
-- gapwmc_832_item: Gap 832 轉出的 WMS 商品檔 (.im, '|' 分隔, 第一行為欄位名稱)
-- 依 832_item 1.0.9.csv 與測試檔 467_GAPTWN_832_...ga5.im 的標題列重建 (33 欄)。欄位順序必須與檔案欄位順序一致 (匯入器依 information_schema 順序對應)。
-- 欄名為標題經 import.mjs imColumnName() 轉換的結果 (snake() 加別名表): 資料方把 Old price period 拼成 Old proce period,
-- 價格欄標題帶括號 (List Price(Old_Price) / Net price(New_Price)), 這三個以別名對到下面乾淨的欄名。
--
-- 與 30 欄舊版 (gapwmc_832_item.1.0.8.sql) 的差異:
--   新增: old_price_period (第 17 欄), new_price_period (第 18 欄), net_price (第 27 欄)
--   其餘欄位順序不變, 檔案位置往後順移 (item_size 17 -> 19 ... department_name 30 -> 33)
--   list_price 改為舊價 (Old_Price), net_price 為新價 (New_Price)
--
-- 警告: 會先 DROP 舊表, 表內既有資料會一併消失。執行前請先確認資料已備份 (例如 pg_dump -t gapwmc_832_item)。
-- =====================================================================
DROP TABLE IF EXISTS gapwmc_832_item;

CREATE TABLE gapwmc_832_item (
    id                                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_file                                 VARCHAR(255),
    line_no                                     INTEGER,
    status                                      VARCHAR(10),
    customer_code                               VARCHAR(10) NOT NULL,
    sku                                         VARCHAR(25) NOT NULL,
    item_desc                                   VARCHAR(100),
    barcode                                     VARCHAR(50),
    length                                      NUMERIC(19,5),
    width                                       NUMERIC(19,5),
    height                                      NUMERIC(19,5),
    weight                                      NUMERIC(19,5),
    units_per_carton                            NUMERIC(19,5),
    units_per_pallet                            NUMERIC(19,5),
    bundle_items                                VARCHAR(100),
    product_remarks                             VARCHAR(200),
    garment_product_type_description            VARCHAR(50),
    ticket_type_description                     VARCHAR(50),
    maintenance_type_code                       VARCHAR(25),
    commodity_code                              VARCHAR(25),
    old_price_period                            DATE,
    new_price_period                            DATE,
    item_size                                   VARCHAR(48),
    item_colour                                 VARCHAR(48),
    item_style                                  VARCHAR(48),
    division                                    VARCHAR(10),
    reference_identification_division_id_brand  VARCHAR(10),
    class_id                                    VARCHAR(10),
    sub_class_id                                VARCHAR(10),
    list_price                                  NUMERIC(19,5),
    net_price                                   NUMERIC(19,5),
    currency_code                               VARCHAR(10),
    product_service_id                          VARCHAR(50),
    description                                 VARCHAR(100),
    division_name                               VARCHAR(80),
    season_code_description                     VARCHAR(80),
    department_name                             VARCHAR(80),
    created_at                                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gapwmc_832_item_sku ON gapwmc_832_item (sku, customer_code);

COMMENT ON TABLE gapwmc_832_item IS 'Gap 832 Item Definition 轉出的 WMS 商品檔 (.im), 33 欄 (832_item 1.0.9)';
COMMENT ON COLUMN gapwmc_832_item.source_file IS '匯入來源檔名';
COMMENT ON COLUMN gapwmc_832_item.line_no IS '在來源檔中的行號 (不含標題行); 同檔內容完全相同的重複列只匯入第一次出現的那列, 行號沿用原檔行號';
COMMENT ON COLUMN gapwmc_832_item.status IS '事件類型, 以該列 maintenance_type_code 判斷 (001=UPDATE / 002=DELETE / 003=ADD), 代碼認不得時依來源檔名, 檔名也沒有時從資料推斷: ADD (新增) / UPDATE (更新) / DELETE (刪除); 資料不覆寫, 何時發生以 created_at 為準';
COMMENT ON COLUMN gapwmc_832_item.customer_code IS '檔案第 1 欄 (Customer Code); 範例: 0001';
COMMENT ON COLUMN gapwmc_832_item.sku IS '檔案第 2 欄 (SKU); 832 LIN03 Item Id 完整 9 碼; 範例: 324011059';
COMMENT ON COLUMN gapwmc_832_item.item_desc IS '檔案第 3 欄 (Item Desc); 832 PID*F*08 PID05 Item Description; 範例: HK_ONL_TEST YELLOWPR';
COMMENT ON COLUMN gapwmc_832_item.barcode IS '檔案第 4 欄 (Barcode); 範例: 1200154482243';
COMMENT ON COLUMN gapwmc_832_item.length IS '檔案第 5 欄 (Length); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.width IS '檔案第 6 欄 (Width); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.height IS '檔案第 7 欄 (Height); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.weight IS '檔案第 8 欄 (Weight); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.units_per_carton IS '檔案第 9 欄 (Units per Carton); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.units_per_pallet IS '檔案第 10 欄 (Units per pallet); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.bundle_items IS '檔案第 11 欄 (Bundle items); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.product_remarks IS '檔案第 12 欄 (Product Remarks); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.garment_product_type_description IS '檔案第 13 欄 (Garment (Product) Type Description); 尚未對照 832 EDI 來源; 範例: 2';
COMMENT ON COLUMN gapwmc_832_item.ticket_type_description IS '檔案第 14 欄 (Ticket Type Description); 尚未對照 832 EDI 來源; 範例: 0';
COMMENT ON COLUMN gapwmc_832_item.maintenance_type_code IS '檔案第 15 欄 (Maintenance Type Code); 異動類型代碼: 001 = UPDATE (更新), 002 = DELETE (刪除), 003 = ADD (新增); 範例: 001';
COMMENT ON COLUMN gapwmc_832_item.commodity_code IS '檔案第 16 欄 (Commodity Code); 1.0.8 新增; 尚未對照 832 EDI 來源; 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.old_price_period IS '檔案第 17 欄 (Old price period; 實際檔案標題拼成 Old proce period); 1.0.9 新增; 舊價 (list_price) 的期間, 格式 YYYYMMDD; 尚未對照 832 EDI 來源; 範例: 20261001';
COMMENT ON COLUMN gapwmc_832_item.new_price_period IS '檔案第 18 欄 (New price period); 1.0.9 新增; 新價 (net_price) 的期間, 格式 YYYYMMDD; 尚未對照 832 EDI 來源; 範例: 20270820';
COMMENT ON COLUMN gapwmc_832_item.item_size IS '檔案第 19 欄 (Item Size); 尚未對照 832 EDI 來源; 1.0.8 起欄名與內容相符, 放尺寸 (舊格式曾放 LIN05 Color Code, 即顏色); 範例: M';
COMMENT ON COLUMN gapwmc_832_item.item_colour IS '檔案第 20 欄 (Item Colour); 尚未對照 832 EDI 來源; 1.0.8 起欄名與內容相符, 放顏色 (舊格式曾放 LIN07 Size Code, 即尺寸); 範例: YELLOWPR';
COMMENT ON COLUMN gapwmc_832_item.item_style IS '檔案第 21 欄 (Item Style); 尚未對照 832 EDI 來源 (舊格式為 LIN09 Item Parent Id); 範例: 001199434';
COMMENT ON COLUMN gapwmc_832_item.division IS '檔案第 22 欄 (Division); 尚未對照 832 EDI 來源 (舊格式為 REF*6P Group Id); 範例: 114';
COMMENT ON COLUMN gapwmc_832_item.reference_identification_division_id_brand IS '檔案第 23 欄 (Reference Identification-Division Id (Brand)); 尚未對照 832 EDI 來源; 範例: 1140';
COMMENT ON COLUMN gapwmc_832_item.class_id IS '檔案第 24 欄 (Class Id); 尚未對照 832 EDI 來源; 範例: 0003';
COMMENT ON COLUMN gapwmc_832_item.sub_class_id IS '檔案第 25 欄 (Sub-Class Id); 尚未對照 832 EDI 來源; 範例: 0001';
COMMENT ON COLUMN gapwmc_832_item.list_price IS '檔案第 26 欄 (實際標題 List Price(Old_Price)); 1.0.9 起為舊價; 尚未對照 832 EDI 來源 (舊格式為 CTP**RTL CTP03 Retail Price); 範例: 2099 (價格單位待資料方確認, 1.0.8 範例為 0.21)';
COMMENT ON COLUMN gapwmc_832_item.net_price IS '檔案第 27 欄 (實際標題 Net price(New_Price)); 1.0.9 新增; 新價; 尚未對照 832 EDI 來源; 範例: 2199';
COMMENT ON COLUMN gapwmc_832_item.currency_code IS '檔案第 28 欄 (Currency_code); 1.0.8 起取代舊版 Country of Origin (值本來就是幣別); 範例: TWD';
COMMENT ON COLUMN gapwmc_832_item.product_service_id IS '檔案第 29 欄 (Product/Service ID); 尚未對照 832 EDI 來源; 範例: 0';
COMMENT ON COLUMN gapwmc_832_item.description IS '檔案第 30 欄 (Description); 尚未對照 832 EDI 來源; 範例: 4';
COMMENT ON COLUMN gapwmc_832_item.division_name IS '檔案第 31 欄 (Division name); 尚未對照 832 EDI 來源 (舊格式為 REF*19 REF03); 範例: GAP';
COMMENT ON COLUMN gapwmc_832_item.season_code_description IS '檔案第 32 欄 (Season Code Description); 尚未對照 832 EDI 來源 (舊格式為 REF*MY REF03); 範例: 2027F07';
COMMENT ON COLUMN gapwmc_832_item.department_name IS '檔案第 33 欄 (Department name); 尚未對照 832 EDI 來源 (舊格式為 REF*DP REF03); 範例: WMS BTM';
