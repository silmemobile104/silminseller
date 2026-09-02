// แคตตาล็อกฐานข้อมูล — แหล่งความจริงเดียวว่าแต่ละ collection เก็บอะไรและผูกกับหน้าไหน
//
// ใช้โดย GET /api/database/overview (routes/database.js) ซึ่งเอาไปรวมกับจำนวนเอกสารจริงจาก Atlas
// ตัวเลขทั้งหมดมาจากฐานข้อมูลตอนเรียก ไฟล์นี้เก็บเฉพาะ "คำอธิบาย" ที่ดึงอัตโนมัติไม่ได้
//
// relations ดึงมาจาก ref: ในสคีมาจริง (models/index.js) ไม่ได้เดา
// pages คือชื่อ view ตามที่ใช้ใน switchView() ของ script.js
//
// ⚠️ เพิ่ม model ใหม่ใน models/index.js แล้วต้องเพิ่มรายการที่นี่ด้วย
//    tools/build-js.js ตรวจให้ ถ้าลืมจะ build ไม่ผ่าน

const IMPORTANCE = {
    critical: 'เสียหายแล้วระบบทำงานต่อไม่ได้ หรือสต็อก/เงินคลาดเคลื่อนทันที',
    high: 'เสียหายแล้วบางเมนูใช้งานไม่ได้ หรือรายงานผิด',
    normal: 'เป็นข้อมูลอ้างอิง เสียหายแล้วแก้กลับได้ไม่ยาก'
};

const GROUPS = [
    'ข้อมูลพื้นฐาน',
    'สินค้าและสต็อก',
    'การขาย',
    'จัดซื้อและรับเข้า',
    'บัญชีและการเงิน',
    'ผู้ใช้และระบบ'
];

const catalogue = [
    // ---------- ข้อมูลพื้นฐาน ----------
    {
        key: 'branch', model: 'Branch', title: 'สาขา', group: 'ข้อมูลพื้นฐาน', importance: 'critical',
        purpose: 'รายชื่อสาขาทั้งหมดของบริษัท เป็นแกนกลางที่เกือบทุก collection อ้างถึง เพราะสต็อก ยอดขาย และสิทธิ์การเข้าถึงล้วนแยกตามสาขา',
        pages: ['branches', 'stock', 'branch-inventory', 'transfers', 'personnel', 'accounting-po', 'dashboard'],
        keyFields: [
            { name: 'name', note: 'ชื่อสาขาที่แสดงทุกที่ในระบบ' },
            { name: 'address, phone', note: 'ใช้พิมพ์บนใบเสร็จ' }
        ],
        relations: [],
        notes: 'ผู้ใช้ที่ไม่มีสิทธิ์ filter_stock_branch จะถูกบังคับให้เห็นเฉพาะสาขาตัวเองผ่าน getRequestedBranchId()'
    },
    {
        key: 'producttype', model: 'ProductType', title: 'ประเภทสินค้า', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'ประเภทของสินค้า เช่น มือถือ, iPad, อุปกรณ์เสริม ใช้เป็นตัวเลือกตอนเพิ่มสินค้าและตัวกรองในหน้าสต็อก',
        pages: ['settings', 'stock', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ชื่อประเภท ต้องไม่ซ้ำ' }],
        relations: [],
        notes: 'อยู่ในแคช utils/masterDataCache.js — แก้แล้วต้องเรียก mdCache.invalidate()'
    },
    {
        key: 'productunit', model: 'ProductUnit', title: 'หน่วยนับ', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'หน่วยนับสินค้า เช่น เครื่อง, ชิ้น ใช้แสดงต่อท้ายจำนวนในเอกสารและรายงาน',
        pages: ['settings', 'stock', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ชื่อหน่วย ต้องไม่ซ้ำ' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'productcolor', model: 'ProductColor', title: 'สีสินค้า', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'รายชื่อสีของเครื่อง เก็บแค่ชื่อ ไม่ได้เก็บรหัสสี ระบบแปลงชื่อเป็นสีที่แสดงผลเองผ่านตารางกลางใน script.js',
        pages: ['settings', 'stock', 'transactions', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ชื่อสี — ถ้าตั้งชื่อที่ไม่มีในตารางแปลงสี จุดสีจะขึ้นเป็นสีเทา' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'productcapacity', model: 'ProductCapacity', title: 'ความจุ', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'ความจุของเครื่อง เช่น 64, 128, 256 ใช้เป็นตัวเลือกตอนเพิ่มสินค้าและแยกรุ่นย่อย',
        pages: ['settings', 'stock', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ค่าความจุ ต้องไม่ซ้ำ' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'productcondition', model: 'ProductCondition', title: 'สภาพสินค้า', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'สภาพเครื่อง เช่น มือ1, มือ2 TH, มือ2 JP ใช้แยกราคาและเงื่อนไขการรับประกัน',
        pages: ['settings', 'stock', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ชื่อสภาพ ต้องไม่ซ้ำ' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'productname', model: 'ProductName', title: 'ชื่อรุ่นสินค้า', group: 'ข้อมูลพื้นฐาน', importance: 'normal',
        purpose: 'รายชื่อรุ่นที่ร้านขาย เช่น iPhone 15 ใช้เป็นตัวเลือกตอนสร้างสินค้าใหม่ กันพิมพ์ชื่อรุ่นไม่ตรงกันจนสินค้าซ้ำ',
        pages: ['settings', 'stock', 'report-arrival'],
        keyFields: [{ name: 'name', note: 'ชื่อรุ่น ต้องไม่ซ้ำ' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'supplier', model: 'Supplier', title: 'ซัพพลายเออร์', group: 'ข้อมูลพื้นฐาน', importance: 'high',
        purpose: 'ผู้ขายส่งที่ร้านสั่งของเข้า ใช้อ้างอิงในใบสั่งซื้อ (PO) และในการแจ้งของเข้านอกระบบ PO',
        pages: ['settings', 'accounting-po', 'report-arrival', 'stock'],
        keyFields: [{ name: 'name', note: 'ชื่อซัพพลายเออร์' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },
    {
        key: 'financecompany', model: 'FinanceCompany', title: 'บริษัทไฟแนนซ์', group: 'ข้อมูลพื้นฐาน', importance: 'high',
        purpose: 'บริษัทไฟแนนซ์ที่ร้านส่งเรื่องผ่อนให้ ใช้ตอนขายแบบผ่อนและใช้ตามยอดที่ไฟแนนซ์ต้องโอนคืนร้าน',
        pages: ['settings', 'transactions', 'accounting'],
        keyFields: [{ name: 'name', note: 'ชื่อบริษัทไฟแนนซ์' }],
        relations: [],
        notes: 'อยู่ในแคช masterDataCache'
    },

    // ---------- สินค้าและสต็อก ----------
    {
        key: 'product', model: 'Product', title: 'สินค้าและสต็อก', group: 'สินค้าและสต็อก', importance: 'critical',
        purpose: 'หัวใจของระบบ เก็บข้อมูลสินค้าแต่ละรุ่นพร้อมยอดคงเหลือแยกรายสาขาและ IMEI รายเครื่อง สต็อกทั้งบริษัทอยู่ที่ collection นี้ที่เดียว',
        pages: ['stock', 'transactions', 'branch-inventory', 'movements', 'transfers', 'stock-audit', 'warranty-check'],
        keyFields: [
            { name: 'stock_balances[]', note: 'หนึ่งรายการต่อหนึ่งสาขา — ยอดคงเหลือทั้งหมดอยู่ในนี้' },
            { name: 'stock_balances[].imeis[]', note: 'IMEI รายเครื่อง ใช้เช็คประกันและกันขายเครื่องเดียวกันซ้ำ' },
            { name: 'cost_price, selling_price', note: 'ต้นทุนและราคาขาย ใช้คำนวณกำไรในแดชบอร์ดและงบกำไรขาดทุน' }
        ],
        relations: ['supplier', 'producttype', 'productunit', 'productcolor', 'productcapacity', 'productcondition', 'branch'],
        notes: 'ไม่มีฟิลด์ branch_id/quantity ที่ระดับบนสุดแล้ว (ย้ายไป stock_balances ตอน migrateProductsToERP) การ query ต้อง $unwind stock_balances'
    },
    {
        key: 'movement', model: 'Movement', title: 'ประวัติการเคลื่อนไหวสินค้า', group: 'สินค้าและสต็อก', importance: 'high',
        purpose: 'บันทึกทุกครั้งที่สต็อกเปลี่ยน — รับเข้า ขายออก โอนย้าย ปรับปรุง ใช้ย้อนรอยว่าของหายไปตอนไหนและใครทำ',
        pages: ['movements', 'stock'],
        keyFields: [
            { name: 'type', note: 'ประเภทการเคลื่อนไหว ใช้แยกว่าเข้าหรือออก' },
            { name: 'quantity, imeis[]', note: 'จำนวนและเครื่องที่เกี่ยวข้องในครั้งนั้น' }
        ],
        relations: ['product', 'branch', 'employee'],
        notes: 'เขียนอย่างเดียว ไม่ควรแก้ย้อนหลัง เพราะเป็นหลักฐานการเคลื่อนไหวสต็อก'
    },
    {
        key: 'transfer', model: 'Transfer', title: 'การโอนย้ายสินค้า', group: 'สินค้าและสต็อก', importance: 'critical',
        purpose: 'ใบโอนสินค้าระหว่างสาขา เก็บสถานะตั้งแต่ส่งออกจนปลายทางยืนยันรับ ระหว่างทางของจะไม่ถูกนับเป็นสต็อกของสาขาไหน',
        pages: ['transfers', 'stock', 'branch-inventory'],
        keyFields: [
            { name: 'from_branch_id, to_branch_id', note: 'ต้นทางกับปลายทาง กำหนดว่าใครยกเลิกได้ใครรับได้' },
            { name: 'status', note: 'สถานะใบโอน — ของจะเข้าสต็อกปลายทางเมื่อยืนยันรับเท่านั้น' }
        ],
        relations: ['branch', 'employee'],
        notes: 'สาขาต้นทางส่ง/ยกเลิกได้เท่านั้น ปลายทางยืนยันรับได้เท่านั้น สลับกันไม่ได้แม้เป็นแอดมิน'
    },
    {
        key: 'stockauditsession', model: 'StockAuditSession', title: 'รอบตรวจนับสต็อก', group: 'สินค้าและสต็อก', importance: 'high',
        purpose: 'หัวรอบการตรวจนับสต็อกประจำวันของแต่ละสาขา ระบบสร้างให้อัตโนมัติทุกวันเวลา 00:05 ผ่าน cron',
        pages: ['stock-audit', 'stock-audit-review'],
        keyFields: [
            { name: 'audit_date', note: 'วันที่ของรอบตรวจนับ' },
            { name: 'status', note: 'สถานะรอบ — รอตรวจ / ตรวจแล้ว / อนุมัติแล้ว' }
        ],
        relations: ['branch', 'employee'],
        notes: 'สร้างโดย utils/cronTasks.js ถ้า cron ไม่ทำงานจะไม่มีรอบให้พนักงานตรวจนับ'
    },
    {
        key: 'stockaudititem', model: 'StockAuditItem', title: 'รายการตรวจนับรายเครื่อง', group: 'สินค้าและสต็อก', importance: 'high',
        purpose: 'ผลตรวจนับรายสินค้าในแต่ละรอบ เทียบยอดในระบบกับยอดที่นับได้จริง เพื่อหาส่วนต่างและของหาย',
        pages: ['stock-audit', 'stock-audit-review'],
        keyFields: [
            { name: 'system_qty, counted_qty', note: 'ยอดในระบบเทียบกับยอดนับจริง ส่วนต่างคือของขาด/เกิน' },
            { name: 'missing_imeis[]', note: 'IMEI ที่ระบบบอกว่ามีแต่หาไม่เจอตอนนับ' }
        ],
        relations: ['stockauditsession', 'product', 'employee'],
        notes: 'เป็น collection ที่โตเร็วที่สุด เพราะสร้างรายการใหม่ทุกสินค้าทุกวันทุกสาขา'
    },

    // ---------- การขาย ----------
    {
        key: 'transaction', model: 'Transaction', title: 'บิลขาย', group: 'การขาย', importance: 'critical',
        purpose: 'บิลขายทุกใบ ทั้งเงินสด โอน บัตร และผ่อนไฟแนนซ์ เป็นต้นทางของยอดขาย กำไร และรายงานทั้งหมด',
        pages: ['transactions', 'sales-history', 'daily-summary', 'dashboard', 'warranty-check'],
        keyFields: [
            { name: 'items[]', note: 'รายการสินค้าในบิล พร้อม IMEI ที่ขายออกไป' },
            { name: 'payment_method', note: 'ช่องทางชำระ กำหนดว่าเงินเข้าสดหรือค้างรับจากไฟแนนซ์' },
            { name: 'status', note: 'บิลที่ถูกยกเลิกจะคืนสต็อกกลับและไม่ถูกนับในรายงาน' }
        ],
        relations: ['branch', 'member', 'employee', 'product', 'deposit'],
        notes: 'authFetch ไม่ retry POST โดยตั้งใจ — ถ้า retry บิลขายจะซ้ำและตัดสต็อกสองรอบ'
    },
    {
        key: 'member', model: 'Member', title: 'สมาชิก / ลูกค้า', group: 'การขาย', importance: 'high',
        purpose: 'ข้อมูลลูกค้าที่สมัครสมาชิก ใช้ผูกกับบิลขาย ติดตามประกัน และตรวจสอบตอนทำเรื่องผ่อน',
        pages: ['members', 'transactions', 'warranty-check'],
        keyFields: [
            { name: 'member_number', note: 'เลขสมาชิก ใช้ค้นหาหน้าขาย' },
            { name: 'citizen_id', note: 'เลขบัตรประชาชน — ข้อมูลอ่อนไหว ใช้ตอนทำเรื่องไฟแนนซ์' },
            { name: 'photo, card_front_photo', note: 'เก็บเป็น URL ของ Google Drive ไม่ได้เก็บรูปลงฐานข้อมูล' }
        ],
        relations: [],
        notes: 'มีข้อมูลส่วนบุคคล (เลขบัตรประชาชน เบอร์โทร ที่อยู่) ควรจำกัดคนเข้าถึง'
    },
    {
        key: 'deposit', model: 'Deposit', title: 'มัดจำสินค้า', group: 'การขาย', importance: 'high',
        purpose: 'เงินมัดจำที่ลูกค้าวางไว้เพื่อจองเครื่อง เครื่องที่ถูกจองจะกันไว้ไม่ให้ขายให้คนอื่น และยอดมัดจำจะไปหักตอนออกบิลจริง',
        pages: ['deposits', 'transactions'],
        keyFields: [
            { name: 'deposit_amount', note: 'ยอดมัดจำที่รับมา จะถูกหักออกตอนปิดการขาย' },
            { name: 'customer_phone', note: 'เบอร์ลูกค้าสำหรับติดต่อรับเครื่อง' },
            { name: 'status', note: 'สถานะมัดจำ — ยังจองอยู่ / ปิดการขายแล้ว / ยกเลิก' }
        ],
        relations: ['branch', 'product', 'employee'],
        notes: 'ถูกอ้างถึงจากบิลขาย ถ้าลบมัดจำทิ้งบิลที่หักมัดจำไปแล้วจะอ้างถึงของที่ไม่มี'
    },

    // ---------- จัดซื้อและรับเข้า ----------
    {
        key: 'purchaseorder', model: 'PurchaseOrder', title: 'ใบสั่งซื้อ (PO)', group: 'จัดซื้อและรับเข้า', importance: 'critical',
        purpose: 'ใบสั่งซื้อจากซัพพลายเออร์ ตั้งแต่เปิด PO จนของถึงสาขาและตรวจรับครบ เป็นต้นทางของต้นทุนสินค้าที่เข้าสต็อก',
        pages: ['accounting-po', 'report-arrival', 'branch-receive', 'approve-import', 'accounting'],
        keyFields: [
            { name: 'po_number', note: 'เลขที่ใบสั่งซื้อ ใช้อ้างอิงทุกขั้นตอน' },
            { name: 'items[]', note: 'รายการที่สั่ง พร้อมต้นทุนต่อหน่วยที่จะกลายเป็นต้นทุนสินค้า' },
            { name: 'status', note: 'สถานะ PO — ของเข้าสต็อกเมื่อตรวจรับแล้วเท่านั้น' }
        ],
        relations: ['branch', 'employee'],
        notes: 'ต้นทุนถูกบันทึกตอน "รับของเข้าสต็อก" (เกณฑ์คงค้าง) ส่วนเงินออกตอน "จ่ายซัพพลายเออร์" (เกณฑ์เงินสด) — คนละจังหวะกัน'
    },
    {
        key: 'importnotification', model: 'ImportNotification', title: 'แจ้งของเข้านอกระบบ PO', group: 'จัดซื้อและรับเข้า', importance: 'high',
        purpose: 'ใบแจ้งของเข้าสาขากรณีพิเศษที่ไม่ได้มาจาก PO เช่น รับซื้อเครื่องมือสอง ต้องผ่านการอนุมัติก่อนของจะเข้าสต็อก',
        pages: ['report-arrival', 'approve-import'],
        keyFields: [
            { name: 'imeis[]', note: 'เครื่องที่แจ้งเข้า จะถูกสร้างเป็นสต็อกเมื่ออนุมัติ' },
            { name: 'status', note: 'รอดำเนินการ / อนุมัติแล้ว / ปฏิเสธ — แก้ไขและลบได้เฉพาะตอนยังรอดำเนินการ' },
            { name: 'reported_by', note: 'คนที่แจ้ง มีสิทธิ์แก้ไขและลบเฉพาะใบของตัวเอง' }
        ],
        relations: ['branch', 'employee'],
        notes: 'อนุมัติแล้วแก้ไม่ได้ เพราะของเข้าสต็อกไปแล้ว การแก้ย้อนหลังจะทำให้สต็อกกับใบแจ้งไม่ตรงกัน'
    },

    // ---------- บัญชีและการเงิน ----------
    {
        key: 'cashmovement', model: 'CashMovement', title: 'เดินบัญชี (เงินเข้า-ออก)', group: 'บัญชีและการเงิน', importance: 'critical',
        purpose: 'บันทึกเงินเข้าออกทุกรายการตามเกณฑ์เงินสด เป็นสมุดเดินบัญชีหลักที่หน้าบัญชีใช้สรุปกระแสเงินสด',
        pages: ['accounting', 'daily-summary', 'deposits'],
        keyFields: [
            { name: 'transaction_id', note: 'เลขอ้างอิงรายการ ต้องไม่ซ้ำ' },
            { name: 'amount, type', note: 'จำนวนเงินและทิศทาง เข้าหรือออก' }
        ],
        relations: ['employee'],
        notes: 'รายการ "ซื้อสินค้า (PO)" ที่นี่คือตอนจ่ายเงินซัพพลายเออร์ ไม่ใช่ตอนรับของ อย่าเอาไปบวกกับต้นทุนใน KPI จะนับซ้ำ'
    },
    {
        key: 'financereceivable', model: 'FinanceReceivable', title: 'ลูกหนี้ไฟแนนซ์', group: 'บัญชีและการเงิน', importance: 'high',
        purpose: 'ยอดที่บริษัทไฟแนนซ์ต้องโอนคืนร้านจากการขายแบบผ่อน ใช้ติดตามว่าบิลไหนได้เงินแล้วบิลไหนยังค้าง',
        pages: ['accounting', 'sales-history'],
        keyFields: [
            { name: 'amount', note: 'ยอดที่ไฟแนนซ์ต้องโอน' },
            { name: 'status', note: 'ยังค้างรับ หรือรับเงินแล้ว' }
        ],
        relations: ['transaction', 'employee'],
        notes: 'ผูกกับบิลขายหนึ่งต่อหนึ่ง ถ้าบิลถูกยกเลิกต้องจัดการรายการค้างรับด้วย'
    },
    {
        key: 'accountcategory', model: 'AccountCategory', title: 'หมวดบัญชี', group: 'บัญชีและการเงิน', importance: 'normal',
        purpose: 'ชั้นบนสุดของผังบัญชี เช่น สินทรัพย์ หนี้สิน รายได้ ค่าใช้จ่าย ใช้จัดกลุ่มผังบัญชีทั้งหมด',
        pages: ['accounting-settings'],
        keyFields: [{ name: 'name', note: 'ชื่อหมวดบัญชี' }],
        relations: [],
        notes: 'สร้างให้อัตโนมัติตอนเริ่มระบบผ่าน seedDefaultCOA'
    },
    {
        key: 'accountgroup', model: 'AccountGroup', title: 'กลุ่มบัญชี', group: 'บัญชีและการเงิน', importance: 'normal',
        purpose: 'ชั้นกลางของผังบัญชี อยู่ใต้หมวดบัญชี ใช้ซอยหมวดใหญ่ให้ละเอียดขึ้นก่อนถึงผังบัญชีจริง',
        pages: ['accounting-settings'],
        keyFields: [{ name: 'name', note: 'ชื่อกลุ่มบัญชี' }],
        relations: ['accountcategory'],
        notes: 'สร้างให้อัตโนมัติผ่าน seedDefaultCOA'
    },
    {
        key: 'accountchart', model: 'AccountChart', title: 'ผังบัญชี', group: 'บัญชีและการเงิน', importance: 'high',
        purpose: 'ผังบัญชีระดับล่างสุดที่ใช้ลงรายการจริง ทุกใบสำคัญจ่ายต้องระบุบัญชีเดบิตและเครดิตจากที่นี่',
        pages: ['accounting-settings', 'disbursement', 'accounting'],
        keyFields: [
            { name: 'code', note: 'เลขที่บัญชี ใช้เรียงและอ้างอิง' },
            { name: 'name', note: 'ชื่อบัญชีที่แสดงในใบสำคัญจ่าย' }
        ],
        relations: ['accountcategory', 'accountgroup'],
        notes: 'ถูกอ้างถึงจากใบสำคัญจ่าย ถ้าลบบัญชีที่เคยใช้แล้วเอกสารเก่าจะอ้างถึงของที่ไม่มี'
    },
    {
        key: 'pnlconfig', model: 'PnLConfig', title: 'ผังงบกำไรขาดทุน', group: 'บัญชีและการเงิน', importance: 'normal',
        purpose: 'กำหนดว่าบัญชีไหนไปอยู่บรรทัดไหนของงบกำไรขาดทุน ใช้ประกอบรายงาน P&L ในหน้าบัญชี',
        pages: ['accounting-settings', 'accounting'],
        keyFields: [{ name: 'ลำดับและการจับคู่บัญชี', note: 'กำหนดโครงสร้างรายงาน P&L' }],
        relations: ['accountcategory', 'accountgroup', 'accountchart'],
        notes: 'ตั้งค่าผิดจะทำให้งบกำไรขาดทุนแสดงตัวเลขผิด แต่ไม่กระทบข้อมูลต้นทาง'
    },
    {
        key: 'disbursementvoucher', model: 'DisbursementVoucher', title: 'ใบสำคัญจ่าย', group: 'บัญชีและการเงิน', importance: 'high',
        purpose: 'เอกสารการจ่ายเงินออกจากบริษัท พร้อมบัญชีเดบิต/เครดิต ภาษี และหลักฐานการโอน',
        pages: ['disbursement', 'accounting'],
        keyFields: [
            { name: 'voucher_no', note: 'เลขที่ใบสำคัญจ่าย ต้องไม่ซ้ำ' },
            { name: 'amount, vat_amount, net_amount', note: 'ยอดก่อนภาษี ภาษี และยอดสุทธิที่จ่ายจริง' },
            { name: 'proof_image_url', note: 'หลักฐานการโอน เก็บเป็น URL ของ Google Drive' }
        ],
        relations: ['branch', 'accountchart', 'employee'],
        notes: 'เป็นหลักฐานทางบัญชี ไม่ควรลบย้อนหลัง'
    },

    // ---------- ผู้ใช้และระบบ ----------
    {
        key: 'employee', model: 'Employee', title: 'พนักงาน', group: 'ผู้ใช้และระบบ', importance: 'critical',
        purpose: 'บัญชีผู้ใช้ทั้งหมดของระบบ ใช้เข้าสู่ระบบ กำหนดสาขาที่สังกัด และผูกกับบทบาทเพื่อกำหนดสิทธิ์',
        pages: ['personnel'],
        keyFields: [
            { name: 'emp_id', note: 'รหัสพนักงานที่ใช้ล็อกอิน' },
            { name: 'password', note: 'รหัสผ่านที่ hash ด้วย bcrypt แล้ว — ไม่ได้เก็บรหัสจริง' },
            { name: 'role', note: 'ชื่อบทบาท ใช้ดึงสิทธิ์จาก collection role ตอนล็อกอิน' },
            { name: 'branch_id', note: 'สาขาที่สังกัด กำหนดขอบเขตข้อมูลที่เห็นได้' }
        ],
        relations: ['branch'],
        notes: 'สิทธิ์ถูกฝังลง JWT ตอนล็อกอินและมีอายุ 24 ชม. แก้สิทธิ์แล้วผู้ใช้ต้องออกจากระบบและเข้าใหม่'
    },
    {
        key: 'role', model: 'Role', title: 'บทบาทและสิทธิ์', group: 'ผู้ใช้และระบบ', importance: 'critical',
        purpose: 'นิยามบทบาทและสิทธิ์แต่ละข้อ เป็นตัวกำหนดว่าใครเห็นเมนูไหนและทำอะไรได้ ทั้งฝั่งหน้าจอและฝั่งเซิร์ฟเวอร์',
        pages: ['roles', 'personnel'],
        keyFields: [
            { name: 'name', note: 'ชื่อบทบาท เช่น แอดมิน ผู้จัดการ พนักงานขาย' },
            { name: 'permissions', note: 'สิทธิ์รายข้อแบบเปิด/ปิด เซิร์ฟเวอร์ตรวจจากค่านี้ ไม่ใช่แค่ซ่อนเมนู' }
        ],
        relations: [],
        notes: 'seedDefaultRoles จะเติมสิทธิ์ข้อใหม่ให้บทบาทเดิมอัตโนมัติตอนเริ่มเซิร์ฟเวอร์'
    },
    {
        key: 'auditlog', model: 'AuditLog', title: 'ประวัติการทำงานระบบ', group: 'ผู้ใช้และระบบ', importance: 'high',
        purpose: 'บันทึกทุกการเปลี่ยนแปลงสำคัญ ใครทำอะไรเมื่อไหร่จากไอพีไหน ใช้ตรวจสอบย้อนหลังเวลามีปัญหา',
        pages: ['audit-logs'],
        keyFields: [
            { name: 'action, module', note: 'ประเภทการกระทำและโมดูลที่ทำ ใช้กรองตอนค้นหา' },
            { name: 'details', note: 'ภาพข้อมูลก่อนเปลี่ยน ใช้ดูว่าแก้อะไรไปบ้าง' },
            { name: 'ip_address', note: 'ไอพีของผู้ทำรายการ' }
        ],
        relations: ['employee'],
        notes: 'เขียนอย่างเดียว ไม่มีการแก้หรือลบ เป็น collection ที่โตต่อเนื่องตามการใช้งาน'
    }
];

const byKey = new Map(catalogue.map(c => [c.key, c]));

module.exports = { catalogue, byKey, GROUPS, IMPORTANCE };
