-- =====================================================================
-- gap_db.sql
-- PostgreSQL 資料表定義
--   item_master        : 3M ItemMaster mapping spec 的 SCALE ITM 輸出格式 (278 欄)
--   gapwmc_832_item    : Gap 832 轉出的 WMS 商品檔 (.im, 26 欄)
--   gapwmc_850_header  : Gap 850 轉出的 WMS 收貨檔 (.rc) RCPHDR
--   gapwmc_850_detail  : 同上 RCPDETL
--   gapwmc_850_carton  : 同上 RCPCTNDR
-- 來源:
--   doc/01.WMSc_IB_ItemMaster_832(888)_PH_3M_v0.0.8.xlsx  (工作表 Output Format / MappingSpecs IM)
--   doc/O832502D_3PLDC_Guidelines.doc, doc/832_Item_Add_G53_003.txt(.im)
--   doc/O850502D_3PLDC_PO_Guidelines.docx, doc/850_PO_62028556_Active.txt(_PO_62028556_000084.rc)
--
-- 在 pgAdmin 中的使用方式:
--   1. 先連到 postgres 資料庫, 單獨執行下面這行建立資料庫 (CREATE DATABASE 不能在交易內執行):
--        CREATE DATABASE gap_db ENCODING 'UTF8';
--   2. 在 pgAdmin 左側選取 gap_db, 開啟 Query Tool, 執行本檔其餘內容。
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. item_master: 3M ItemMaster 輸出格式 (SCALE ITM, '|' 分隔), 共 278 個欄位
--    型別對應: nvarchar(n) -> VARCHAR(n), nchar(n) -> CHAR(n), numeric(p,s) -> NUMERIC(p,s)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS item_master (
    id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    record_type                  VARCHAR(25) NOT NULL DEFAULT 'ITM',
    interface_record_id          VARCHAR(25) NOT NULL,
    item                         VARCHAR(50) NOT NULL,
    active                       CHAR(1) NOT NULL,
    company                      VARCHAR(25),
    description                  VARCHAR(100),
    long_description             VARCHAR(2000),
    item_template                VARCHAR(25),
    template_field_1             VARCHAR(25),
    template_field_2             VARCHAR(25),
    template_field_3             VARCHAR(25),
    template_field_4             VARCHAR(25),
    template_field_5             VARCHAR(25),
    allocation_rule              VARCHAR(25),
    locating_rule                VARCHAR(25),
    inventory_tracking           CHAR(1),
    nmfc_code                    VARCHAR(25),
    item_class                   VARCHAR(25),
    packing_class                VARCHAR(25),
    storage_template             VARCHAR(25),
    item_size                    VARCHAR(25),
    item_color                   VARCHAR(25),
    item_style                   VARCHAR(25),
    division                     VARCHAR(25),
    department                   VARCHAR(25),
    bom_action                   CHAR(1),
    cost                         NUMERIC(19,5),
    list_price                   NUMERIC(19,5),
    net_price                    NUMERIC(19,5),
    epc_company_prefix           VARCHAR(12),
    epc_item_reference           VARCHAR(6),
    epc_cage_code                VARCHAR(5),
    fedex_itn                    VARCHAR(17),
    fedex_xtn                    VARCHAR(17),
    item_gtin_enabled            CHAR(1),
    item_app_identifier          VARCHAR(10),
    immediate_needs_eligible     CHAR(1),
    immediate_needs_loc_rule     VARCHAR(25),
    inbound_qc_eligible          CHAR(1),
    inbound_qc_amount_type       CHAR(1),
    inbound_qc_amount            NUMERIC(19,5),
    inbound_qc_um                VARCHAR(25),
    inbound_qc_loc_rule          VARCHAR(25),
    catch_weight_reqd            CHAR(1),
    lot_controlled               CHAR(1),
    lot_template                 VARCHAR(25),
    days_to_expire               NUMERIC(9,0),
    serial_num_track_inbound     CHAR(1),
    serial_num_track_inventory   CHAR(1),
    serial_num_track_outbound    CHAR(1),
    serial_num_template          VARCHAR(25),
    available_on_web             CHAR(1),
    preference_crit              CHAR(1),
    harmonized_code              VARCHAR(25),
    country_of_origin            VARCHAR(25),
    producer                     CHAR(1),
    net_cost                     CHAR(1),
    item_category1               VARCHAR(50),
    item_category2               VARCHAR(50),
    item_category3               VARCHAR(50),
    item_category4               VARCHAR(50),
    item_category5               VARCHAR(50),
    item_category6               VARCHAR(50),
    item_category7               VARCHAR(50),
    item_category8               VARCHAR(50),
    item_category9               VARCHAR(50),
    item_category10              VARCHAR(50),
    user_def1                    VARCHAR(25),
    user_def2                    VARCHAR(25),
    user_def3                    VARCHAR(25),
    user_def4                    VARCHAR(25),
    user_def5                    VARCHAR(25),
    user_def6                    VARCHAR(25),
    user_def7                    NUMERIC(19,5),
    user_def8                    NUMERIC(19,5),
    sequence_1                   NUMERIC(3,0),
    quantity_um_1                VARCHAR(25),
    conversion_qty_1             NUMERIC(19,5),
    treat_full_pct_1             NUMERIC(3,0),
    length_1                     NUMERIC(19,5),
    width_1                      NUMERIC(19,5),
    height_1                     NUMERIC(19,5),
    dimension_um_1               VARCHAR(25),
    weight_1                     NUMERIC(19,5),
    weight_um_1                  VARCHAR(25),
    movement_cls_1               VARCHAR(25),
    treat_as_loose_1             CHAR(1),
    epc_package_id1              NUMERIC(1,0),
    slotting_id_1                CHAR(1),
    slotting_pallet_ti_1         NUMERIC(9,0),
    slotting_pallet_hi_1         NUMERIC(9,0),
    sequence_2                   NUMERIC(3,0),
    quantity_um_2                VARCHAR(25),
    conversion_qty_2             NUMERIC(19,5),
    treat_full_pct_2             NUMERIC(3,0),
    length_2                     NUMERIC(19,5),
    width_2                      NUMERIC(19,5),
    height_2                     NUMERIC(19,5),
    dimension_um_2               VARCHAR(25),
    weight_2                     NUMERIC(19,5),
    weight_um_2                  VARCHAR(25),
    movement_cls_2               VARCHAR(25),
    treat_as_loose_2             CHAR(1),
    epc_package_id2              NUMERIC(1,0),
    slotting_id_2                CHAR(1),
    slotting_pallet_ti_2         NUMERIC(9,0),
    slotting_pallet_hi_2         NUMERIC(9,0),
    sequence_3                   NUMERIC(3,0),
    quantity_um_3                VARCHAR(25),
    conversion_qty_3             NUMERIC(19,5),
    treat_full_pct_3             NUMERIC(3,0),
    length_3                     NUMERIC(19,5),
    width_3                      NUMERIC(19,5),
    height_3                     NUMERIC(19,5),
    dimension_um_3               VARCHAR(25),
    weight_3                     NUMERIC(19,5),
    weight_um_3                  VARCHAR(25),
    movement_cls_3               VARCHAR(25),
    treat_as_loose_3             CHAR(1),
    epc_package_id3              NUMERIC(1,0),
    slotting_id_3                CHAR(1),
    slotting_pallet_ti_3         NUMERIC(9,0),
    slotting_pallet_hi_3         NUMERIC(9,0),
    sequence_4                   NUMERIC(3,0),
    quantity_um_4                VARCHAR(25),
    conversion_qty_4             NUMERIC(19,5),
    treat_full_pct_4             NUMERIC(3,0),
    length_4                     NUMERIC(19,5),
    width_4                      NUMERIC(19,5),
    height_4                     NUMERIC(19,5),
    dimension_um_4               VARCHAR(25),
    weight_4                     NUMERIC(19,5),
    weight_um_4                  VARCHAR(25),
    movement_cls_4               VARCHAR(25),
    treat_as_loose_4             CHAR(1),
    epc_package_id4              NUMERIC(1,0),
    slotting_id_4                CHAR(1),
    slotting_pallet_ti_4         NUMERIC(9,0),
    slotting_pallet_hi_4         NUMERIC(9,0),
    sequence_5                   NUMERIC(3,0),
    quantity_um_5                VARCHAR(25),
    conversion_qty_5             NUMERIC(19,5),
    treat_full_pct_5             NUMERIC(3,0),
    length_5                     NUMERIC(19,5),
    width_5                      NUMERIC(19,5),
    height_5                     NUMERIC(19,5),
    dimension_um_5               VARCHAR(25),
    weight_5                     NUMERIC(19,5),
    weight_um_5                  VARCHAR(25),
    movement_cls_5               VARCHAR(25),
    treat_as_loose_5             CHAR(1),
    epc_package_id5              NUMERIC(1,0),
    slotting_id_5                CHAR(1),
    slotting_pallet_ti_5         NUMERIC(9,0),
    slotting_pallet_hi_5         NUMERIC(9,0),
    sequence_6                   NUMERIC(3,0),
    quantity_um_6                VARCHAR(25),
    conversion_qty_6             NUMERIC(19,5),
    treat_full_pct_6             NUMERIC(3,0),
    length_6                     NUMERIC(19,5),
    width_6                      NUMERIC(19,5),
    height_6                     NUMERIC(19,5),
    dimension_um_6               VARCHAR(25),
    weight_6                     NUMERIC(19,5),
    weight_um_6                  VARCHAR(25),
    movement_cls_6               VARCHAR(25),
    treat_as_loose_6             CHAR(1),
    epc_package_id6              NUMERIC(1,0),
    slotting_id_6                CHAR(1),
    slotting_pallet_ti_6         NUMERIC(9,0),
    slotting_pallet_hi_6         NUMERIC(9,0),
    sequence_7                   NUMERIC(3,0),
    quantity_um_7                VARCHAR(25),
    conversion_qty_7             NUMERIC(19,5),
    treat_full_pct_7             NUMERIC(3,0),
    length_7                     NUMERIC(19,5),
    width_7                      NUMERIC(19,5),
    height_7                     NUMERIC(19,5),
    dimension_um_7               VARCHAR(25),
    weight_7                     NUMERIC(19,5),
    weight_um_7                  VARCHAR(25),
    movement_cls_7               VARCHAR(25),
    treat_as_loose_7             CHAR(1),
    epc_package_id7              NUMERIC(1,0),
    slotting_id_7                CHAR(1),
    slotting_pallet_ti_7         NUMERIC(9,0),
    slotting_pallet_hi_7         NUMERIC(9,0),
    sequence_8                   NUMERIC(3,0),
    quantity_um_8                VARCHAR(25),
    conversion_qty_8             NUMERIC(19,5),
    treat_full_pct_8             NUMERIC(3,0),
    length_8                     NUMERIC(19,5),
    width_8                      NUMERIC(19,5),
    height_8                     NUMERIC(19,5),
    dimension_um_8               VARCHAR(25),
    weight_8                     NUMERIC(19,5),
    weight_um_8                  VARCHAR(25),
    movement_cls_8               VARCHAR(25),
    treat_as_loose_8             CHAR(1),
    epc_package_id8              NUMERIC(1,0),
    slotting_id_8                CHAR(1),
    slotting_pallet_ti_8         NUMERIC(9,0),
    slotting_pallet_hi_8         NUMERIC(9,0),
    sequence_9                   NUMERIC(3,0),
    quantity_um_9                VARCHAR(25),
    conversion_qty_9             NUMERIC(19,5),
    treat_full_pct_9             NUMERIC(3,0),
    length_9                     NUMERIC(19,5),
    width_9                      NUMERIC(19,5),
    height_9                     NUMERIC(19,5),
    dimension_um_9               VARCHAR(25),
    weight_9                     NUMERIC(19,5),
    weight_um_9                  VARCHAR(25),
    movement_cls_9               VARCHAR(25),
    treat_as_loose_9             CHAR(1),
    epc_package_id9              NUMERIC(1,0),
    slotting_id_9                CHAR(1),
    slotting_pallet_ti_9         NUMERIC(9,0),
    slotting_pallet_hi_9         NUMERIC(9,0),
    sequence_10                  NUMERIC(3,0),
    quantity_um_10               VARCHAR(25),
    conversion_qty_10            NUMERIC(19,5),
    treat_full_pct_10            NUMERIC(3,0),
    length_10                    NUMERIC(19,5),
    width_10                     NUMERIC(19,5),
    height_10                    NUMERIC(19,5),
    dimension_um_10              VARCHAR(25),
    weight_10                    NUMERIC(19,5),
    weight_um_10                 VARCHAR(25),
    movement_cls_10              VARCHAR(25),
    treat_as_loose_10            CHAR(1),
    epc_package_id10             NUMERIC(1,0),
    slotting_id_10               CHAR(1),
    slotting_pallet_ti_10        NUMERIC(9,0),
    slotting_pallet_hi_10        NUMERIC(9,0),
    x_ref_item_1                 VARCHAR(25),
    xref_item1_um                VARCHAR(25),
    xref_item1_app_identifier    VARCHAR(10),
    xref_item1_gtin_enabled      CHAR(1),
    x_ref_item_2                 VARCHAR(25),
    xref_item2_um                VARCHAR(25),
    xref_item2_app_identifier    VARCHAR(10),
    xref_item2_gtin_enabled      CHAR(1),
    x_ref_item_3                 VARCHAR(25),
    xref_item3_um                VARCHAR(25),
    xref_item3_app_identifier    VARCHAR(10),
    xref_item3_gtin_enabled      CHAR(1),
    x_ref_item_4                 VARCHAR(25),
    xref_item4_um                VARCHAR(25),
    xref_item4_app_identifier    VARCHAR(10),
    xref_item4_gtin_enabled      CHAR(1),
    x_ref_item_5                 VARCHAR(25),
    xref_item5_um                VARCHAR(25),
    xref_item5_app_identifier    VARCHAR(10),
    xref_item5_gtin_enabled      CHAR(1),
    x_ref_item_6                 VARCHAR(25),
    xref_item6_um                VARCHAR(25),
    xref_item6_app_identifier    VARCHAR(10),
    xref_item6_gtin_enabled      CHAR(1),
    x_ref_item_7                 VARCHAR(25),
    xref_item7_um                VARCHAR(25),
    xref_item7_app_identifier    VARCHAR(10),
    xref_item7_gtin_enabled      CHAR(1),
    x_ref_item_8                 VARCHAR(25),
    xref_item8_um                VARCHAR(25),
    xref_item8_app_identifier    VARCHAR(10),
    xref_item8_gtin_enabled      CHAR(1),
    x_ref_item_9                 VARCHAR(25),
    xref_item9_um                VARCHAR(25),
    xref_item9_app_identifier    VARCHAR(10),
    xref_item9_gtin_enabled      CHAR(1),
    x_ref_item_10                VARCHAR(25),
    xref_item10_um               VARCHAR(25),
    xref_item10_app_identifier   VARCHAR(10),
    xref_item10_gtin_enabled     CHAR(1),
    user_stamp                   VARCHAR(30),
    process_stamp                VARCHAR(100),
    date_time_stamp              TIMESTAMP,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_item_master_item_company ON item_master (item, company);

COMMENT ON TABLE item_master IS 'WMS (SCALE) Item Master 介面資料, 依 ItemMaster mapping spec v0.0.8 的 Output Format';
COMMENT ON COLUMN item_master.record_type IS '#1 必填; 記錄類型, 固定值 ITM';
COMMENT ON COLUMN item_master.interface_record_id IS '#2 必填; Complex Mapping: 5 digits running number, reset after 99999';
COMMENT ON COLUMN item_master.item IS '#3 必填; 來源: [MM Data] Material Number';
COMMENT ON COLUMN item_master.active IS '#4 必填; 固定值: Y';
COMMENT ON COLUMN item_master.company IS '#5 選填; 來源: [MM Data] Plant';
COMMENT ON COLUMN item_master.description IS '#6 選填; 來源: [MM Data] Material Description';
COMMENT ON COLUMN item_master.long_description IS '#7 選填; 來源: [MM Data] Dangerous Goods Ind Profile Desc';
COMMENT ON COLUMN item_master.item_template IS '#8 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.template_field_1 IS '#9 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.template_field_2 IS '#10 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.template_field_3 IS '#11 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.template_field_4 IS '#12 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.template_field_5 IS '#13 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.allocation_rule IS '#14 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.locating_rule IS '#15 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inventory_tracking IS '#16 選填; 固定值: Y';
COMMENT ON COLUMN item_master.nmfc_code IS '#17 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_class IS '#18 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.packing_class IS '#19 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.storage_template IS '#20 選填; Complex Mapping: IF quantity_um_3 IS NULL quantity_um_1 + ''-'' + quantity_um_2 ELSE quantity_um_1 + ''-'' + quantity_um_2 + ''-'' + quantity_um_3';
COMMENT ON COLUMN item_master.item_size IS '#21 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_color IS '#22 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_style IS '#23 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.division IS '#24 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.department IS '#25 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.bom_action IS '#26 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.cost IS '#27 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.list_price IS '#28 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.net_price IS '#29 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_company_prefix IS '#30 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_item_reference IS '#31 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_cage_code IS '#32 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.fedex_itn IS '#33 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.fedex_xtn IS '#34 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_gtin_enabled IS '#35 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_app_identifier IS '#36 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.immediate_needs_eligible IS '#37 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.immediate_needs_loc_rule IS '#38 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inbound_qc_eligible IS '#39 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inbound_qc_amount_type IS '#40 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inbound_qc_amount IS '#41 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inbound_qc_um IS '#42 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.inbound_qc_loc_rule IS '#43 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.catch_weight_reqd IS '#44 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.lot_controlled IS '#45 選填; 固定值: Hardcode to ''Y''';
COMMENT ON COLUMN item_master.lot_template IS '#46 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.days_to_expire IS '#47 選填; Complex Mapping: CASE WHEN [MM Data] Period Indicator for Shelf Life Expiration Date = ''Y'', THEN [MM Data] Total shelf life x 365 WHEN [MM Data] Period Indicator for Shelf Life Expiration Date = ''M'', THEN [MM Data] Total shelf life x 30 WHEN [MM Data] Period Indicator for Shelf Life Expiration Date = ''W'', THEN [MM Data] Total shelf life x 7 WHEN [MM Data] Period Indicator for Shelf Life Expiration Date = ''D'', THEN [MM Data] Total shelf life';
COMMENT ON COLUMN item_master.serial_num_track_inbound IS '#48 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.serial_num_track_inventory IS '#49 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.serial_num_track_outbound IS '#50 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.serial_num_template IS '#51 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.available_on_web IS '#52 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.preference_crit IS '#53 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.harmonized_code IS '#54 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.country_of_origin IS '#55 選填; 來源: [MM Data] Country of origin of the material';
COMMENT ON COLUMN item_master.producer IS '#56 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.net_cost IS '#57 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category1 IS '#58 選填; Map input field';
COMMENT ON COLUMN item_master.item_category2 IS '#59 選填; 來源: [MM Data] Stock placement';
COMMENT ON COLUMN item_master.item_category3 IS '#60 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category4 IS '#61 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category5 IS '#62 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category6 IS '#63 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category7 IS '#64 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category8 IS '#65 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category9 IS '#66 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.item_category10 IS '#67 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_def1 IS '#68 選填; 來源: [MM Data] Legacy 3M ID';
COMMENT ON COLUMN item_master.user_def2 IS '#69 選填; 來源: [MM Data] Batch Management Type';
COMMENT ON COLUMN item_master.user_def3 IS '#70 選填; Complex Mapping: IF [MM Data] Batch Management = ''X'' THEN ''Y'' ELSE ''N''';
COMMENT ON COLUMN item_master.user_def4 IS '#71 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_def5 IS '#72 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_def6 IS '#73 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_def7 IS '#74 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_def8 IS '#75 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_1 IS '#76 選填; 固定值: 1';
COMMENT ON COLUMN item_master.quantity_um_1 IS '#77 選填; 來源: [MM Data] Base Unit of Measure';
COMMENT ON COLUMN item_master.conversion_qty_1 IS '#78 選填; Complex Mapping: IF [Alt UOM] Alternative Unit of Measure = [MM Data] Base Unit of Measure THEN [Alt UOM] Numerator';
COMMENT ON COLUMN item_master.treat_full_pct_1 IS '#79 選填; 固定值: 100';
COMMENT ON COLUMN item_master.length_1 IS '#80 選填; Complex Mapping: IF [Alt UOM] Alternative Unit of Measure = [MM Data] Base Unit of Measure AND [Alt UOM] Length <> 0 THEN [Alt UOM] Length ELSE [Alt UOM] Length = 1';
COMMENT ON COLUMN item_master.width_1 IS '#81 選填; Complex Mapping: IF [Alt UOM] Alternative Unit of Measure = [MM Data] Base Unit of Measure AND [Alt UOM] Width <> 0 THEN [Alt UOM] Width ELSE [Alt UOM] Width = 1';
COMMENT ON COLUMN item_master.height_1 IS '#82 選填; Complex Mapping: IF [Alt UOM] Alternative Unit of Measure = [MM Data] Base Unit of Measure AND (length_1 = 1 AND width_1 = 1 AND [Alt UOM] Volume>0) THEN height_1 = [Alt UOM] Volume ELSE IF [Alt UOM] Height = 0 THEN height_1 = 1 ELSE height_1 = [Alt UOM] Height';
COMMENT ON COLUMN item_master.dimension_um_1 IS '#83 選填; 來源: [Alt UOM] Unit of Dimension';
COMMENT ON COLUMN item_master.weight_1 IS '#84 選填; 來源: [MM Data] Net Weight';
COMMENT ON COLUMN item_master.weight_um_1 IS '#85 選填; 來源: [MM Data] Weight Unit';
COMMENT ON COLUMN item_master.movement_cls_1 IS '#86 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_1 IS '#87 選填; 固定值: Y';
COMMENT ON COLUMN item_master.epc_package_id1 IS '#88 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_1 IS '#89 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_1 IS '#90 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_1 IS '#91 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_2 IS '#92 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [Alt UOM] Alternative Unit of Measure = quantity_um_1) THEN sequence_2 = blank ELSE sequence_2 = 2 ELSE NULL';
COMMENT ON COLUMN item_master.quantity_um_2 IS '#93 選填; Complex Mapping: If Exists 6S IF [Alt UOM] Pack Level = 6S AND [Alt UOM] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S quantity_um_2 = [MM Data] Alternative Unit of Measure ELSE NULL';
COMMENT ON COLUMN item_master.conversion_qty_2 IS '#94 選填; Complex Mapping: If Exists 6S IF [Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S conversion_qty_2 = [Alt UOM] Numerator ELSE NULL';
COMMENT ON COLUMN item_master.treat_full_pct_2 IS '#95 選填; Complex Mapping: IF Exists 6S IF [Alt UOM] Pack Level = 6S AND [Alt UOM] Alternative Unit of Measure = quantity_um_1 THEN treat_full_pct_2 = blank ELSE treat_full_pct_2 = 100';
COMMENT ON COLUMN item_master.length_2 IS '#96 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S IF [Alt UOM] Length = 0, length_2 = 1 ELSE length_2 = [Alt UOM] Length ELSE NULL';
COMMENT ON COLUMN item_master.width_2 IS '#97 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S IF [Alt UOM] Width = 0, width_2 = 1 ELSE width_2 = [Alt UOM] Width ELSE NULL';
COMMENT ON COLUMN item_master.height_2 IS '#98 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S IF (length_2 = 1 AND width_2 = 1 AND [Alt UOM] Volume>0) THEN height_2 = [Alt UOM] Volume ELSE IF [Alt UOM] Height = 0 THEN height_2 = 1 ELSE height_2 = [Alt UOM] Height ELSE NULL';
COMMENT ON COLUMN item_master.dimension_um_2 IS '#99 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S dimension_um_2 = [Alt UOM] Unit of Dimension ELSE NULL';
COMMENT ON COLUMN item_master.weight_2 IS '#100 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S weight_2 = [Alt UOM] Gross Weight ELSE NULL';
COMMENT ON COLUMN item_master.weight_um_2 IS '#101 選填; Complex Mapping: If Exists 6S IF ([Alt UOM] Pack Level = 6S AND [MM Data] Alternative Unit of Measure = quantity_um_1) THEN Look into [Alt UOM] Pack Level = 8P, ELSE Look into [Alt UOM] Pack Level = 6S weight_um_2 = [Alt UOM] Weight Unit ELSE NULL';
COMMENT ON COLUMN item_master.movement_cls_2 IS '#102 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_2 IS '#103 選填; Complex Mapping: IF Exists 6S IF [Alt UOM] Pack Level = 6S AND [Alt UOM] Alternative Unit of Measure = quantity_um_1 THEN treat_as_loose_2 = blank ELSE treat_as_loose_2 = Y';
COMMENT ON COLUMN item_master.epc_package_id2 IS '#104 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_2 IS '#105 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_2 IS '#106 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_2 IS '#107 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_3 IS '#108 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN sequence_3 = blank ELSE sequence_3 = 3 ELSE NULL';
COMMENT ON COLUMN item_master.quantity_um_3 IS '#109 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN quantity_um_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P quantity_um_3 = [Alt UOM] Alternative Unit of Measure ELSE NULL';
COMMENT ON COLUMN item_master.conversion_qty_3 IS '#110 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN conversion_qty_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P conversion_qty_3 = [Alt UOM] Numerator ELSE NULL';
COMMENT ON COLUMN item_master.treat_full_pct_3 IS '#111 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN treat_full_pct_3 = blank ELSE treat_full_pct_3 = 100 ELSE NULL';
COMMENT ON COLUMN item_master.length_3 IS '#112 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN length_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P IF [Alt UOM] Length = 0, length_3 = 1 ELSE length_3 = [Alt UOM] Length ELSE NULL';
COMMENT ON COLUMN item_master.width_3 IS '#113 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN width_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P IF [Alt UOM] Width = 0, width_3 = 1 ELSE width_3 = [Alt UOM] Width ELSE NULL';
COMMENT ON COLUMN item_master.height_3 IS '#114 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN height_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P IF (length_3 = 1 AND width_3 = 1 AND [Alt UOM] Volume>0) THEN height_3 = [Alt UOM] Volume ELSE IF [Alt UOM] Height = 0 THEN height_3 = 1 ELSE height_3 = [Alt UOM] Height ELSE NULL';
COMMENT ON COLUMN item_master.dimension_um_3 IS '#115 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN dimension_um_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P dimension_um_3 = [Alt UOM] Unit of Dimension ELSE NULL';
COMMENT ON COLUMN item_master.weight_3 IS '#116 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN weight_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P weight_3 = [Alt UOM] Gross Weight ELSE NULL';
COMMENT ON COLUMN item_master.weight_um_3 IS '#117 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN weight_um_3 = blank ELSE Look into [Alt UOM] Pack Level = 8P weight_um_3 = [Alt UOM] Weight Unit ELSE NULL';
COMMENT ON COLUMN item_master.movement_cls_3 IS '#118 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_3 IS '#119 選填; Complex Mapping: IF Exists 6S AND exists 8P IF [Alt UOM] Pack Level = 8P AND [Alt UOM] Alternative Unit of Measure = quantity_um_2 THEN treat_as_loose_3 = blank ELSE treat_as_loose_3 = Y ELSE NULL';
COMMENT ON COLUMN item_master.epc_package_id3 IS '#120 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_3 IS '#121 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_3 IS '#122 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_3 IS '#123 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_4 IS '#124 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_4 IS '#125 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_4 IS '#126 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_4 IS '#127 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_4 IS '#128 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_4 IS '#129 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_4 IS '#130 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_4 IS '#131 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_4 IS '#132 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_4 IS '#133 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_4 IS '#134 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_4 IS '#135 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id4 IS '#136 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_4 IS '#137 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_4 IS '#138 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_4 IS '#139 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_5 IS '#140 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_5 IS '#141 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_5 IS '#142 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_5 IS '#143 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_5 IS '#144 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_5 IS '#145 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_5 IS '#146 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_5 IS '#147 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_5 IS '#148 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_5 IS '#149 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_5 IS '#150 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_5 IS '#151 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id5 IS '#152 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_5 IS '#153 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_5 IS '#154 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_5 IS '#155 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_6 IS '#156 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_6 IS '#157 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_6 IS '#158 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_6 IS '#159 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_6 IS '#160 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_6 IS '#161 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_6 IS '#162 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_6 IS '#163 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_6 IS '#164 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_6 IS '#165 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_6 IS '#166 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_6 IS '#167 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id6 IS '#168 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_6 IS '#169 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_6 IS '#170 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_6 IS '#171 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_7 IS '#172 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_7 IS '#173 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_7 IS '#174 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_7 IS '#175 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_7 IS '#176 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_7 IS '#177 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_7 IS '#178 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_7 IS '#179 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_7 IS '#180 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_7 IS '#181 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_7 IS '#182 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_7 IS '#183 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id7 IS '#184 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_7 IS '#185 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_7 IS '#186 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_7 IS '#187 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_8 IS '#188 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_8 IS '#189 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_8 IS '#190 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_8 IS '#191 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_8 IS '#192 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_8 IS '#193 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_8 IS '#194 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_8 IS '#195 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_8 IS '#196 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_8 IS '#197 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_8 IS '#198 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_8 IS '#199 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id8 IS '#200 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_8 IS '#201 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_8 IS '#202 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_8 IS '#203 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_9 IS '#204 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_9 IS '#205 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_9 IS '#206 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_9 IS '#207 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_9 IS '#208 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_9 IS '#209 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_9 IS '#210 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_9 IS '#211 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_9 IS '#212 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_9 IS '#213 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_9 IS '#214 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_9 IS '#215 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id9 IS '#216 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_9 IS '#217 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_9 IS '#218 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_9 IS '#219 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.sequence_10 IS '#220 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.quantity_um_10 IS '#221 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.conversion_qty_10 IS '#222 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_full_pct_10 IS '#223 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.length_10 IS '#224 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.width_10 IS '#225 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.height_10 IS '#226 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.dimension_um_10 IS '#227 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_10 IS '#228 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.weight_um_10 IS '#229 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.movement_cls_10 IS '#230 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.treat_as_loose_10 IS '#231 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.epc_package_id10 IS '#232 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_id_10 IS '#233 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_ti_10 IS '#234 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.slotting_pallet_hi_10 IS '#235 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_1 IS '#236 選填';
COMMENT ON COLUMN item_master.xref_item1_um IS '#237 選填';
COMMENT ON COLUMN item_master.xref_item1_app_identifier IS '#238 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item1_gtin_enabled IS '#239 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_2 IS '#240 選填';
COMMENT ON COLUMN item_master.xref_item2_um IS '#241 選填';
COMMENT ON COLUMN item_master.xref_item2_app_identifier IS '#242 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item2_gtin_enabled IS '#243 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_3 IS '#244 選填';
COMMENT ON COLUMN item_master.xref_item3_um IS '#245 選填';
COMMENT ON COLUMN item_master.xref_item3_app_identifier IS '#246 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item3_gtin_enabled IS '#247 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_4 IS '#248 選填';
COMMENT ON COLUMN item_master.xref_item4_um IS '#249 選填';
COMMENT ON COLUMN item_master.xref_item4_app_identifier IS '#250 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item4_gtin_enabled IS '#251 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_5 IS '#252 選填';
COMMENT ON COLUMN item_master.xref_item5_um IS '#253 選填';
COMMENT ON COLUMN item_master.xref_item5_app_identifier IS '#254 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item5_gtin_enabled IS '#255 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_6 IS '#256 選填';
COMMENT ON COLUMN item_master.xref_item6_um IS '#257 選填';
COMMENT ON COLUMN item_master.xref_item6_app_identifier IS '#258 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item6_gtin_enabled IS '#259 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_7 IS '#260 選填';
COMMENT ON COLUMN item_master.xref_item7_um IS '#261 選填';
COMMENT ON COLUMN item_master.xref_item7_app_identifier IS '#262 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item7_gtin_enabled IS '#263 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_8 IS '#264 選填';
COMMENT ON COLUMN item_master.xref_item8_um IS '#265 選填';
COMMENT ON COLUMN item_master.xref_item8_app_identifier IS '#266 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item8_gtin_enabled IS '#267 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_9 IS '#268 選填';
COMMENT ON COLUMN item_master.xref_item9_um IS '#269 選填';
COMMENT ON COLUMN item_master.xref_item9_app_identifier IS '#270 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item9_gtin_enabled IS '#271 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.x_ref_item_10 IS '#272 選填';
COMMENT ON COLUMN item_master.xref_item10_um IS '#273 選填';
COMMENT ON COLUMN item_master.xref_item10_app_identifier IS '#274 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.xref_item10_gtin_enabled IS '#275 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.user_stamp IS '#276 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.process_stamp IS '#277 選填; 無對應 (No Mapping Required)';
COMMENT ON COLUMN item_master.date_time_stamp IS '#278 選填; 無對應 (No Mapping Required); 規格為 date, 改用 TIMESTAMP 以保留時間';

-- ---------------------------------------------------------------------
-- 2. gapwmc_832_item: Gap 832 轉出的 WMS 商品檔 (.im, '|' 分隔, 第一行為欄位名稱)
--    欄位名稱取自檔案第一行 (轉成小寫加底線); 每欄的 832 來源已用 60 筆範例資料逐筆比對確認。
--    注意: 檔案的 Item Size / Item Colour / Division / Barcode 欄名與實際內容不符, 詳見欄位註解。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gapwmc_832_item (
    id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_file                  VARCHAR(255),
    line_no                      INTEGER,
    customer_code                VARCHAR(10) NOT NULL,
    sku                          VARCHAR(25) NOT NULL,
    item_desc                    VARCHAR(100),
    barcode                      VARCHAR(50),
    length                       NUMERIC(19,5),
    width                        NUMERIC(19,5),
    height                       NUMERIC(19,5),
    weight                       NUMERIC(19,5),
    units_per_carton             NUMERIC(19,5),
    units_per_pallet             NUMERIC(19,5),
    bundle_items                 VARCHAR(100),
    product_remarks              VARCHAR(200),
    long_description             VARCHAR(2000),
    item_size                    VARCHAR(48),
    item_colour                  VARCHAR(48),
    item_style                   VARCHAR(48),
    division                     VARCHAR(10),
    department                   VARCHAR(30),
    list_price                   NUMERIC(19,5),
    country_of_origin            VARCHAR(25),
    udf1                         VARCHAR(25),
    udf2                         VARCHAR(25),
    udf3                         VARCHAR(25),
    udf4                         VARCHAR(25),
    udf5                         VARCHAR(25),
    udf6                         VARCHAR(80),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gapwmc_832_item_sku ON gapwmc_832_item (sku, customer_code);

COMMENT ON TABLE gapwmc_832_item IS 'Gap 832 Item Definition 轉出的 WMS 商品檔 (.im)';
COMMENT ON COLUMN gapwmc_832_item.source_file IS '匯入來源檔名';
COMMENT ON COLUMN gapwmc_832_item.line_no IS '在來源檔中的行號 (不含標題行)';
COMMENT ON COLUMN gapwmc_832_item.customer_code IS '檔案第 1 欄 (Customer_Code); 832 REF*19 REF02 Division Id (品牌)';
COMMENT ON COLUMN gapwmc_832_item.sku IS '檔案第 2 欄 (SKU); 832 LIN03 Item Id 的前 8 碼; 最後一碼在 long_description 開頭';
COMMENT ON COLUMN gapwmc_832_item.item_desc IS '檔案第 3 欄 (Item_Desc); 832 PID*F*08 PID05 Item Description';
COMMENT ON COLUMN gapwmc_832_item.barcode IS '檔案第 4 欄 (Barcode); 實際放的是 832 TC2*J TC202 Harmonized Code (HS 碼), 不是條碼; 多數為空';
COMMENT ON COLUMN gapwmc_832_item.length IS '檔案第 5 欄 (Length); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.width IS '檔案第 6 欄 (Width); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.height IS '檔案第 7 欄 (Height); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.weight IS '檔案第 8 欄 (Weight); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.units_per_carton IS '檔案第 9 欄 (Units per Carton); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.units_per_pallet IS '檔案第 10 欄 (Units per pallet); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.bundle_items IS '檔案第 11 欄 (Bundle items); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.product_remarks IS '檔案第 12 欄 (Product Remarks); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.long_description IS '檔案第 13 欄 (Long Description); 組合值: LIN03 最後一碼 + ''-'' + PKG*F*35 Garment Type + ''-'' + PKG*F*67 Ticket Type (例 5-FLAT-0)';
COMMENT ON COLUMN gapwmc_832_item.item_size IS '檔案第 14 欄 (Item Size); 欄名為 Item Size, 實際放 832 LIN05 Color Code (BO)';
COMMENT ON COLUMN gapwmc_832_item.item_colour IS '檔案第 15 欄 (Item Colour); 欄名為 Item Colour, 實際放 832 LIN07 Size Code (IZ)';
COMMENT ON COLUMN gapwmc_832_item.item_style IS '檔案第 16 欄 (Item Style); 832 LIN09 Item Parent Id (KF)';
COMMENT ON COLUMN gapwmc_832_item.division IS '檔案第 17 欄 (Division); 欄名為 Division, 實際放 832 REF*6P Group Id';
COMMENT ON COLUMN gapwmc_832_item.department IS '檔案第 18 欄 (Department); 組合值: REF*DP Department Id + ''-'' + REF*ACD Class Id + ''-'' + REF*X2 SubClass Id + ''-'' + REF*19 Division Id';
COMMENT ON COLUMN gapwmc_832_item.list_price IS '檔案第 19 欄 (List Price); 832 CTP**RTL CTP03 Retail Price; 多數為空';
COMMENT ON COLUMN gapwmc_832_item.country_of_origin IS '檔案第 20 欄 (Country of Origin); 範例檔為空';
COMMENT ON COLUMN gapwmc_832_item.udf1 IS '檔案第 21 欄 (UDF1); 832 LIN11 EAN-13 Bar Code (EN)';
COMMENT ON COLUMN gapwmc_832_item.udf2 IS '檔案第 22 欄 (UDF2); 832 LIN19 Product Type Code (TP): 0 = Bulk, 1 = Prepack';
COMMENT ON COLUMN gapwmc_832_item.udf3 IS '檔案第 23 欄 (UDF3); 832 PID*F*63 PID05 Item Status';
COMMENT ON COLUMN gapwmc_832_item.udf4 IS '檔案第 24 欄 (UDF4); 832 REF*19 REF03 Division (Brand) name';
COMMENT ON COLUMN gapwmc_832_item.udf5 IS '檔案第 25 欄 (UDF5); 832 REF*MY REF03 Season Code Description';
COMMENT ON COLUMN gapwmc_832_item.udf6 IS '檔案第 26 欄 (UDF6); 832 REF*DP REF03 Department name';

-- ---------------------------------------------------------------------
-- 3. gapwmc_850_header / detail / carton: Gap 850 轉出的 WMS 收貨檔 (.rc, '|' 分隔)
--    依正確拋檔建立: RCPHDR 46 欄, RCPDETL 71 欄, RCPCTNDR 8 欄。
--    欄位名稱 fNN 的 NN = 檔案中的欄位順序; 有名稱的欄位已和 850 原始檔比對確認, 其餘保留 VARCHAR(255) 待確認。
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gapwmc_850_header (
    id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_file                  VARCHAR(255),
    f01_record_type              VARCHAR(10) NOT NULL DEFAULT 'RCPHDR',
    f02_interface_record_id      VARCHAR(22),
    f03_receipt_id               VARCHAR(22),
    f04_receipt_id_type          VARCHAR(10),
    f05_receipt_type             VARCHAR(10),
    f06_po_number                VARCHAR(22),
    f07                          VARCHAR(255),
    f08                          VARCHAR(255),
    f09                          VARCHAR(255),
    f10                          VARCHAR(255),
    f11                          VARCHAR(255),
    f12                          VARCHAR(255),
    f13                          VARCHAR(255),
    f14                          VARCHAR(255),
    f15                          VARCHAR(255),
    f16                          VARCHAR(255),
    f17                          VARCHAR(255),
    f18                          VARCHAR(255),
    f19                          VARCHAR(255),
    f20                          VARCHAR(255),
    f21                          VARCHAR(255),
    f22                          VARCHAR(255),
    f23                          VARCHAR(255),
    f24_vendor_name              VARCHAR(60),
    f25_vendor_number            VARCHAR(80),
    f26                          VARCHAR(255),
    f27                          VARCHAR(255),
    f28                          VARCHAR(255),
    f29                          VARCHAR(255),
    f30                          VARCHAR(255),
    f31_country_of_origin        VARCHAR(60),
    f32_order_status             VARCHAR(80),
    f33                          VARCHAR(255),
    f34                          VARCHAR(255),
    f35                          VARCHAR(255),
    f36                          VARCHAR(255),
    f37                          VARCHAR(255),
    f38                          VARCHAR(255),
    f39                          VARCHAR(255),
    f40                          VARCHAR(255),
    f41                          VARCHAR(255),
    f42                          VARCHAR(255),
    f43                          VARCHAR(255),
    f44                          VARCHAR(255),
    f45_in_dc_date               VARCHAR(14),
    f46_po_creation_date         VARCHAR(14),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gapwmc_850_header_irid ON gapwmc_850_header (f02_interface_record_id);
CREATE INDEX IF NOT EXISTS ix_gapwmc_850_header_po ON gapwmc_850_header (f06_po_number);

COMMENT ON TABLE gapwmc_850_header IS 'GAPWMC_850 收貨表頭 (RCPHDR)';
COMMENT ON COLUMN gapwmc_850_header.source_file IS '匯入來源檔名';
COMMENT ON COLUMN gapwmc_850_header.f01_record_type IS '檔案第 1 欄; 記錄類型 RCPHDR; 範例值: RCPHDR';
COMMENT ON COLUMN gapwmc_850_header.f02_interface_record_id IS '檔案第 2 欄; 介面記錄 ID; 範例值與 PO 號相同; 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_header.f03_receipt_id IS '檔案第 3 欄; 收貨單號; 範例值與 PO 號 (850 BEG03) 相同; 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_header.f04_receipt_id_type IS '檔案第 4 欄; 收貨單類型; 850 規格無此欄 (範例 DPO); 範例值: DPO';
COMMENT ON COLUMN gapwmc_850_header.f05_receipt_type IS '檔案第 5 欄; 收貨類型; 850 規格無此欄 (範例 DPO); 範例值: DPO';
COMMENT ON COLUMN gapwmc_850_header.f06_po_number IS '檔案第 6 欄; 850 BEG03 Purchase Order Number, AN 1/22 (Gap 說明長度 10); 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_header.f07 IS '檔案第 7 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f08 IS '檔案第 8 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f09 IS '檔案第 9 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f10 IS '檔案第 10 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f11 IS '檔案第 11 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f12 IS '檔案第 12 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f13 IS '檔案第 13 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f14 IS '檔案第 14 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f15 IS '檔案第 15 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f16 IS '檔案第 16 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f17 IS '檔案第 17 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f18 IS '檔案第 18 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f19 IS '檔案第 19 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f20 IS '檔案第 20 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f21 IS '檔案第 21 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f22 IS '檔案第 22 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f23 IS '檔案第 23 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f24_vendor_name IS '檔案第 24 欄; 850 N1*MF N102 Manufacturing Vendor Name, AN 1/60 (Gap 說明長度 35); 範例值: NINGBO LIGHT (HK) CO LIMITED';
COMMENT ON COLUMN gapwmc_850_header.f25_vendor_number IS '檔案第 25 欄; 850 N1*MF N104 Manufacturing Vendor Number, AN 2/80 (Gap 說明長度 10); 範例值: 700084780';
COMMENT ON COLUMN gapwmc_850_header.f26 IS '檔案第 26 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f27 IS '檔案第 27 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f28 IS '檔案第 28 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f29 IS '檔案第 29 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f30 IS '檔案第 30 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f31_country_of_origin IS '檔案第 31 欄; 850 N1*CT N102 Origin Country, 2 碼國家代碼; 範例值: ID';
COMMENT ON COLUMN gapwmc_850_header.f32_order_status IS '檔案第 32 欄; 850 PID*X*63 PID05 Order Status Description; 規格列 APPROVED / COMPLETED, 850 範例檔另有 ACTIVE / CANCELLED; 範例值: ACTIVE';
COMMENT ON COLUMN gapwmc_850_header.f33 IS '檔案第 33 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f34 IS '檔案第 34 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f35 IS '檔案第 35 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f36 IS '檔案第 36 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f37 IS '檔案第 37 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f38 IS '檔案第 38 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f39 IS '檔案第 39 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f40 IS '檔案第 40 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f41 IS '檔案第 41 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f42 IS '檔案第 42 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f43 IS '檔案第 43 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f44 IS '檔案第 44 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_header.f45_in_dc_date IS '檔案第 45 欄; 850 DTM*996 In DC Date (Due Date); 範例中 DTM*002 In Store Date 同一天, 待確認. 日期原始值 (YYYYMMDD 或 YYYYMMDDHHMISS); 查詢時用 to_date(left(欄位, 8), ''YYYYMMDD'') 轉換; 範例值: 20260925000000';
COMMENT ON COLUMN gapwmc_850_header.f46_po_creation_date IS '檔案第 46 欄; 850 DTM*ZZZ PO Creation Date (Set Up date). 日期原始值 (YYYYMMDD 或 YYYYMMDDHHMISS); 查詢時用 to_date(left(欄位, 8), ''YYYYMMDD'') 轉換; 範例值: 20260528';

CREATE TABLE IF NOT EXISTS gapwmc_850_detail (
    id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    header_id                    BIGINT NOT NULL REFERENCES gapwmc_850_header (id) ON DELETE CASCADE,
    f01_record_type              VARCHAR(10) NOT NULL DEFAULT 'RCPDETL',
    f02_interface_record_id      VARCHAR(22),
    f03_line_ref                 VARCHAR(30),
    f04_line_number              VARCHAR(20),
    f05_item_number              VARCHAR(25),
    f06_order_quantity           NUMERIC(15,5),
    f07_quantity_um              VARCHAR(2),
    f08                          VARCHAR(255),
    f09                          VARCHAR(255),
    f10                          VARCHAR(255),
    f11                          VARCHAR(255),
    f12                          VARCHAR(255),
    f13                          VARCHAR(255),
    f14                          VARCHAR(255),
    f15                          VARCHAR(255),
    f16                          VARCHAR(255),
    f17                          VARCHAR(255),
    f18                          VARCHAR(255),
    f19                          VARCHAR(255),
    f20                          VARCHAR(255),
    f21                          VARCHAR(255),
    f22                          VARCHAR(255),
    f23                          VARCHAR(255),
    f24                          VARCHAR(255),
    f25                          VARCHAR(255),
    f26_item_last_digit          VARCHAR(2),
    f27                          VARCHAR(255),
    f28                          VARCHAR(255),
    f29                          VARCHAR(255),
    f30                          VARCHAR(255),
    f31                          VARCHAR(255),
    f32                          VARCHAR(255),
    f33                          VARCHAR(255),
    f34                          VARCHAR(255),
    f35                          VARCHAR(255),
    f36                          VARCHAR(255),
    f37                          VARCHAR(255),
    f38                          VARCHAR(255),
    f39                          VARCHAR(255),
    f40                          VARCHAR(255),
    f41                          VARCHAR(255),
    f42                          VARCHAR(255),
    f43                          VARCHAR(255),
    f44                          VARCHAR(255),
    f45                          VARCHAR(255),
    f46                          VARCHAR(255),
    f47                          VARCHAR(255),
    f48                          VARCHAR(255),
    f49                          VARCHAR(255),
    f50                          VARCHAR(255),
    f51                          VARCHAR(255),
    f52                          VARCHAR(255),
    f53                          VARCHAR(255),
    f54                          VARCHAR(255),
    f55                          VARCHAR(255),
    f56                          VARCHAR(255),
    f57                          VARCHAR(255),
    f58                          VARCHAR(255),
    f59                          VARCHAR(255),
    f60                          VARCHAR(255),
    f61                          VARCHAR(255),
    f62                          VARCHAR(255),
    f63                          VARCHAR(255),
    f64                          VARCHAR(255),
    f65                          VARCHAR(255),
    f66                          VARCHAR(255),
    f67                          VARCHAR(255),
    f68                          VARCHAR(255),
    f69                          VARCHAR(255),
    f70                          VARCHAR(255),
    f71_product_type             VARCHAR(2),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gapwmc_850_detail_header ON gapwmc_850_detail (header_id);
CREATE INDEX IF NOT EXISTS ix_gapwmc_850_detail_item ON gapwmc_850_detail (f05_item_number);

COMMENT ON TABLE gapwmc_850_detail IS 'GAPWMC_850 收貨明細 (RCPDETL), 以 header_id 連到 gapwmc_850_header';
COMMENT ON COLUMN gapwmc_850_detail.header_id IS '對應 gapwmc_850_header.id';
COMMENT ON COLUMN gapwmc_850_detail.f01_record_type IS '檔案第 1 欄; 記錄類型 RCPDETL; 範例值: RCPDETL';
COMMENT ON COLUMN gapwmc_850_detail.f02_interface_record_id IS '檔案第 2 欄; 對應表頭 f02_interface_record_id; 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_detail.f03_line_ref IS '檔案第 3 欄; 明細參照 = PO 號 + ''-'' + 行號; 範例值: 62028556-1';
COMMENT ON COLUMN gapwmc_850_detail.f04_line_number IS '檔案第 4 欄; 行號 (依 PO1 順序由 1 起算); 範例值: 1';
COMMENT ON COLUMN gapwmc_850_detail.f05_item_number IS '檔案第 5 欄; 850 PO109 Item Number 的前 8 碼 (PO108=IN); 最後一碼在 f26; 範例值: 32389122';
COMMENT ON COLUMN gapwmc_850_detail.f06_order_quantity IS '檔案第 6 欄; 850 PO102 Order Quantity, R 1/15 (Gap 說明長度 10); 範例值: 114';
COMMENT ON COLUMN gapwmc_850_detail.f07_quantity_um IS '檔案第 7 欄; 850 PO103 Unit of Measure: UN = Unit, PH = Pack (未來使用); 範例值: UN';
COMMENT ON COLUMN gapwmc_850_detail.f08 IS '檔案第 8 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f09 IS '檔案第 9 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f10 IS '檔案第 10 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f11 IS '檔案第 11 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f12 IS '檔案第 12 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f13 IS '檔案第 13 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f14 IS '檔案第 14 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f15 IS '檔案第 15 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f16 IS '檔案第 16 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f17 IS '檔案第 17 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f18 IS '檔案第 18 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f19 IS '檔案第 19 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f20 IS '檔案第 20 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f21 IS '檔案第 21 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f22 IS '檔案第 22 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f23 IS '檔案第 23 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f24 IS '檔案第 24 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f25 IS '檔案第 25 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f26_item_last_digit IS '檔案第 26 欄; 850 PO109 Item Number 的最後一碼 (f05 + f26 = 完整商品編號); 範例值: 8';
COMMENT ON COLUMN gapwmc_850_detail.f27 IS '檔案第 27 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f28 IS '檔案第 28 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f29 IS '檔案第 29 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f30 IS '檔案第 30 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f31 IS '檔案第 31 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f32 IS '檔案第 32 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f33 IS '檔案第 33 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f34 IS '檔案第 34 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f35 IS '檔案第 35 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f36 IS '檔案第 36 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f37 IS '檔案第 37 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f38 IS '檔案第 38 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f39 IS '檔案第 39 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f40 IS '檔案第 40 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f41 IS '檔案第 41 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f42 IS '檔案第 42 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f43 IS '檔案第 43 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f44 IS '檔案第 44 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f45 IS '檔案第 45 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f46 IS '檔案第 46 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f47 IS '檔案第 47 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f48 IS '檔案第 48 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f49 IS '檔案第 49 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f50 IS '檔案第 50 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f51 IS '檔案第 51 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f52 IS '檔案第 52 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f53 IS '檔案第 53 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f54 IS '檔案第 54 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f55 IS '檔案第 55 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f56 IS '檔案第 56 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f57 IS '檔案第 57 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f58 IS '檔案第 58 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f59 IS '檔案第 59 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f60 IS '檔案第 60 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f61 IS '檔案第 61 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f62 IS '檔案第 62 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f63 IS '檔案第 63 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f64 IS '檔案第 64 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f65 IS '檔案第 65 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f66 IS '檔案第 66 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f67 IS '檔案第 67 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f68 IS '檔案第 68 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f69 IS '檔案第 69 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f70 IS '檔案第 70 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_detail.f71_product_type IS '檔案第 71 欄; 推測為 850 PO113 Product Type Code (PO112=TP): 0 = Bulk, 1 = Pack; 待確認; 範例值: 0';

CREATE TABLE IF NOT EXISTS gapwmc_850_carton (
    id                           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    header_id                    BIGINT NOT NULL REFERENCES gapwmc_850_header (id) ON DELETE CASCADE,
    f01_record_type              VARCHAR(10) NOT NULL DEFAULT 'RCPCTNDR',
    f02_interface_record_id      VARCHAR(22),
    f03_line_ref                 VARCHAR(30),
    f04                          VARCHAR(255),
    f05                          VARCHAR(255),
    f06                          VARCHAR(255),
    f07_po_number                VARCHAR(22),
    f08_line_number              VARCHAR(20),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_gapwmc_850_carton_header ON gapwmc_850_carton (header_id);

COMMENT ON TABLE gapwmc_850_carton IS 'GAPWMC_850 收貨箱明細 (RCPCTNDR), 每筆明細一行, 以 header_id 連到 gapwmc_850_header';
COMMENT ON COLUMN gapwmc_850_carton.header_id IS '對應 gapwmc_850_header.id';
COMMENT ON COLUMN gapwmc_850_carton.f01_record_type IS '檔案第 1 欄; 記錄類型 RCPCTNDR; 範例值: RCPCTNDR';
COMMENT ON COLUMN gapwmc_850_carton.f02_interface_record_id IS '檔案第 2 欄; 對應表頭 f02_interface_record_id; 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_carton.f03_line_ref IS '檔案第 3 欄; 對應明細 f03_line_ref; 範例值: 62028556-1';
COMMENT ON COLUMN gapwmc_850_carton.f04 IS '檔案第 4 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_carton.f05 IS '檔案第 5 欄; 範例值: 0; 用途待確認';
COMMENT ON COLUMN gapwmc_850_carton.f06 IS '檔案第 6 欄; 用途待確認';
COMMENT ON COLUMN gapwmc_850_carton.f07_po_number IS '檔案第 7 欄; PO 號 (850 BEG03); 範例值: 62028556';
COMMENT ON COLUMN gapwmc_850_carton.f08_line_number IS '檔案第 8 欄; 對應明細 f04_line_number; 範例值: 1';

COMMIT;
