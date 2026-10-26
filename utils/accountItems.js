// แคตตาล็อก "รายการ" ทางการเงินทั้งหมดที่ระบบมียอดเงินจริง — ให้พนักงานบัญชีเลือกเชื่อมกับรหัสบัญชี (AccountItemLink)
// ยอดของแต่ละรายการถูกบันทึกลง AccountItemEvent โดย utils/accountEntries.js
//
// หลักการ
//  - ระบบแค่จัดข้อมูลรายการให้ครบ ส่วนจะเชื่อมรายการไหนกับรหัสบัญชีไหนเป็นสิทธิ์ของพนักงานบัญชี
//  - key ห้ามเปลี่ยนหลังมีคนเชื่อมแล้ว (AccountItemLink และ AccountItemEvent เก็บ key นี้) · ลบรายการออกได้ แต่ลิงก์/ยอดเก่าจะถูกมองข้าม
//  - เพิ่มเฉพาะรายการที่มีเหตุการณ์และยอดเงินอยู่ในระบบจริง · source = จุดเกิดเหตุการณ์ ไว้ให้นักพัฒนาตามต่อ ไม่ได้โชว์ผู้ใช้
//  - flow = ทิศทางของยอด (ค่าเริ่มต้น): in เข้า · out ออก · receivable ค้างรับ (เงินที่จะได้ในอนาคต) · payable ค้างจ่าย
//    บางรายการเปลี่ยน flow ตามสถานะได้ (เช่น ค่าคอมมิชชัน ค้างรับ → เข้า เมื่อไฟแนนซ์โอน) — ตัวบันทึกยอดเป็นผู้กำหนดตอนบันทึก
//  - รายการที่ไม่ใช่ยอดเงิน (ยกเลิกบิล แก้ยอดบิล แก้ไขมัดจำ) ไม่อยู่ในแคตตาล็อก: การยกเลิก/แก้ไขทำให้ยอดของรายการอื่นเปลี่ยนเองอยู่แล้ว
//  - ไม่รวม VAT (เป็นตัวเลขที่รายงานคำนวณ ไม่ใช่ยอดจากเอกสาร) และการเพิ่มสินค้าตรงจากหน้าสินค้า (ไม่มีเอกสารต้นทางที่ระบุยอดได้)

const ACCOUNT_ITEM_GROUPS = ['ขาย', 'ไฟแนนซ์', 'มัดจำ', 'เคลมซัพพลายเออร์', 'ซื้อสินค้าและสต็อก', 'ค่าใช้จ่ายและรายการอื่นๆ'];

const ACCOUNT_FLOW_LABELS = { in: 'เข้า', out: 'ออก', receivable: 'ค้างรับ', payable: 'ค้างจ่าย' };

const ACCOUNT_ITEMS = [
    // ---------- ขาย ----------
    { key: 'sale_device_cash', name: 'ขายเครื่อง (ซื้อสด)', group: 'ขาย', flow: 'in', description: 'ราคาเครื่องในบิลซื้อสด (ก่อนหักส่วนลดและมัดจำ)', source: 'Transaction.items (หน่วย "เครื่อง") payment_type ซื้อสด' },
    { key: 'sale_accessory', name: 'ขายอุปกรณ์เสริม', group: 'ขาย', flow: 'in', description: 'ราคาสินค้าที่ไม่ใช่ "เครื่อง" ในบิลขาย (ทั้งบิลซื้อสดและจัดไฟแนนซ์)', source: 'Transaction.items (ไม่ใช่เครื่อง, ไม่ใช่ของแถม)' },
    { key: 'sale_device_finance', name: 'ขายเครื่องจัดไฟแนนซ์', group: 'ขาย', flow: 'in', description: 'ราคาเต็มของเครื่องในบิลจัดไฟแนนซ์ = เงินดาวน์ + ทุนเช่าซื้อที่ไฟแนนซ์จ่าย (ก่อนค่าคอมมิชชัน)', source: 'Transaction.items (หน่วย "เครื่อง") payment_type จัดไฟแนนซ์' },
    { key: 'sale_down_payment', name: 'เงินดาวน์ (ขายจัดไฟแนนซ์)', group: 'ขาย', flow: 'in', description: 'เงินดาวน์ที่ลูกค้าจ่ายหน้าร้านตอนจัดไฟแนนซ์ (ไม่รวมมัดจำ)', source: 'Transaction.down_payment' },
    { key: 'sale_receive_cash', name: 'รับชำระเป็นเงินสด', group: 'ขาย', flow: 'in', description: 'เงินสดที่ได้รับจริงจากลูกค้าในบิล (บิลจัดไฟแนนซ์ = ดาวน์ + ค่าธรรมเนียมส่วนที่จ่ายเงินสด) ไม่รวมส่วนที่หักจากมัดจำ', source: 'Transaction.cash_amount / splitFinanceReceived' },
    { key: 'sale_receive_transfer', name: 'รับชำระเป็นเงินโอน', group: 'ขาย', flow: 'in', description: 'เงินโอนที่ได้รับจริงจากลูกค้าในบิล (บิลจัดไฟแนนซ์ = ดาวน์ + ค่าธรรมเนียมส่วนที่จ่ายโอน) ไม่รวมส่วนที่หักจากมัดจำ', source: 'Transaction.transfer_amount / splitFinanceReceived' },
    { key: 'sale_contract_fee', name: 'ค่าใบสัญญา (ขายจัดไฟแนนซ์)', group: 'ขาย', flow: 'in', description: 'ค่าทำสัญญาที่เก็บจากลูกค้าตอนขายจัดไฟแนนซ์', source: 'Transaction.contract_fee' },
    { key: 'sale_icloud_fee', name: 'ค่า iCloud (ขายจัดไฟแนนซ์)', group: 'ขาย', flow: 'in', description: 'ค่าปลด iCloud ที่เก็บจากลูกค้าตอนขายจัดไฟแนนซ์', source: 'Transaction.icloud_fee' },
    { key: 'sale_discount', name: 'ส่วนลดท้ายบิล', group: 'ขาย', flow: 'out', description: 'ส่วนลดที่ให้ลูกค้าตอนขาย (บิลเก่าที่ไม่ได้เก็บส่วนลดไว้ ระบบคำนวณย้อนจากยอดบิล)', source: 'Transaction.discount_amount / คำนวณย้อน' },
    { key: 'sale_gift', name: 'ของแถม (ต้นทุน)', group: 'ขาย', flow: 'out', description: 'ต้นทุนของสินค้าที่แถมให้ลูกค้าในบิล (ราคาขาย 0 แต่ของออกจากสต็อก)', source: 'Transaction.items[].is_gift × Product.cost_price' },
    { key: 'sale_cogs', name: 'ต้นทุนสินค้าที่ขาย', group: 'ขาย', flow: 'out', description: 'ราคาทุนของสินค้าที่ขายออกไป ไม่รวมของแถม (อ่านจากราคาทุนปัจจุบันของสินค้า ไม่ได้เก็บในบิล)', source: 'Transaction.items × Product.cost_price' },

    // ---------- ไฟแนนซ์ ----------
    { key: 'finance_receivable', name: 'ลูกหนี้ไฟแนนซ์ (ค้างโอน)', group: 'ไฟแนนซ์', flow: 'receivable', description: 'สินเชื่อที่ไฟแนนซ์ต้องจ่ายให้ร้าน (ทุนเช่าซื้อ + ค่าคอมมิชชัน) และยังไม่ได้โอน — หายไปเมื่อไฟแนนซ์โอน', source: 'buildOrderFinanceSheet.credit_amount' },
    { key: 'finance_settle', name: 'รับชำระจากไฟแนนซ์', group: 'ไฟแนนซ์', flow: 'in', description: 'สินเชื่อที่ไฟแนนซ์โอนเข้าร้านแล้ว (ทุนเช่าซื้อ + ค่าคอมมิชชัน) นับตามวันที่ไฟแนนซ์โอน', source: 'FinanceReceivable.settled_at / Transaction.finance_paid_at' },
    { key: 'finance_commission', name: 'ค่าคอมมิชชันจากไฟแนนซ์', group: 'ไฟแนนซ์', flow: 'receivable', description: 'ส่วนค่าคอมมิชชันในสินเชื่อ — ค้างรับจนกว่าไฟแนนซ์โอน แล้วนับเป็นเงินเข้า (เป็นส่วนหนึ่งของสินเชื่อ ไม่ควรนับซ้ำกับรายการลูกหนี้/รับชำระถ้าเชื่อมรหัสเดียวกัน)', source: 'buildOrderFinanceSheet.commission' },

    // ---------- มัดจำ ----------
    { key: 'deposit_receive', name: 'รับเงินมัดจำสินค้า', group: 'มัดจำ', flow: 'in', description: 'เงินมัดจำที่รับจากลูกค้า (เงินสด โอน หรือผสม) นับตามวันที่รับ', source: 'Deposit.deposit_amount' },
    { key: 'deposit_refund', name: 'คืนเงินมัดจำ (ยกเลิกใบมัดจำ)', group: 'มัดจำ', flow: 'out', description: 'ยกเลิกใบมัดจำ ถือว่าคืนเงินมัดจำให้ลูกค้าเต็มจำนวน นับตามวันที่ยกเลิก (ระบบยังไม่มีช่องบันทึกจำนวนเงินคืนจริง)', source: 'Deposit.status ยกเลิก' },
    { key: 'deposit_applied', name: 'หักมัดจำในบิลขาย', group: 'มัดจำ', flow: 'in', description: 'เงินมัดจำที่นำมาหักเป็นค่าสินค้าตอนลูกค้ารับของ (ส่วนที่ไม่เกินยอดบิล)', source: 'Transaction.applied_deposit_amount / Deposit ที่ส่งมอบ' },
    { key: 'deposit_forfeit', name: 'มัดจำที่ยึดเป็นรายได้', group: 'มัดจำ', flow: 'in', description: 'ลูกค้าไม่มารับสินค้าภายในวันครบกำหนด พนักงานกดยึดมัดจำ เงินมัดจำทั้งก้อนเป็นรายได้', source: 'Deposit.status ยึดมัดจำ' },
    { key: 'deposit_excess_income', name: 'เงินมัดจำส่วนเกินค่าสินค้า (ไม่ทอนคืน)', group: 'มัดจำ', flow: 'in', description: 'ลูกค้ามารับตามกำหนดแต่เลือกสินค้าราคาต่ำกว่ามัดจำ (เช่น อุปกรณ์เสริมแทนเครื่อง) ส่วนที่เหลือไม่ทอนคืนและนับเป็นรายได้', source: 'Transaction.applied_deposit_amount − ยอดบิล' },

    // ---------- เคลมซัพพลายเออร์ ----------
    { key: 'claim_send', name: 'สินค้าส่งเคลมรอผลซัพพลายเออร์', group: 'เคลมซัพพลายเออร์', flow: 'receivable', description: 'มูลค่าต้นทุนสินค้าที่ส่งเคลมและยังรอผล — หายไปเมื่อปิดเคลมหรือซัพปฏิเสธ', source: 'Claim.total_cost (status ส่งเคลมแล้ว)' },
    { key: 'claim_cash', name: 'เงินสดที่ได้จากการเคลมซัพ', group: 'เคลมซัพพลายเออร์', flow: 'in', description: 'ซัพพลายเออร์จ่ายเงินสดชดเชยเมื่อปิดเคลม นับตามวันที่รับเงิน', source: 'Claim.resolution.cash_amount' },
    { key: 'claim_discount', name: 'ส่วนลดที่ได้จากการเคลมซัพ', group: 'เคลมซัพพลายเออร์', flow: 'in', description: 'ซัพพลายเออร์ให้ส่วนลดแทนเมื่อปิดเคลม (ยอดสำหรับหักค่าสินค้าครั้งถัดไป)', source: 'Claim.resolution.discount_amount' },
    { key: 'claim_goods', name: 'ได้รับสินค้าทดแทนจากการเคลม', group: 'เคลมซัพพลายเออร์', flow: 'in', description: 'ซัพพลายเออร์ส่งสินค้ากลับ/ทดแทนเมื่อปิดเคลม มูลค่าตามต้นทุนเดิม', source: 'Claim.total_cost (ปิดเคลมแบบรับสินค้า)' },
    { key: 'claim_reject_writeoff', name: 'ซัพปฏิเสธเคลม — ตัดทิ้งขาดทุน', group: 'เคลมซัพพลายเออร์', flow: 'out', description: 'ซัพพลายเออร์ปฏิเสธเคลมและร้านตัดสินค้าทิ้ง ขาดทุนตามราคาทุน', source: 'Claim.total_cost (ปฏิเสธ ไม่คืนสต็อก)' },
    { key: 'claim_reject_restock', name: 'ซัพปฏิเสธเคลม — คืนเข้าสต็อก', group: 'เคลมซัพพลายเออร์', flow: 'in', description: 'ซัพพลายเออร์ปฏิเสธเคลมและร้านนำสินค้ากลับเข้าสต็อก มูลค่าตามราคาทุน', source: 'Claim.total_cost (ปฏิเสธ คืนสต็อก)' },

    // ---------- ซื้อสินค้าและสต็อก ----------
    { key: 'po_receive', name: 'รับสินค้าเข้าร้านตามใบสั่งซื้อ (PO)', group: 'ซื้อสินค้าและสต็อก', flow: 'in', description: 'มูลค่าสินค้าที่ตรวจรับตาม PO = ราคาทุน × จำนวนที่รับ (ก่อนหักส่วนลดตอนจ่ายเงิน)', source: 'PurchaseOrder.items cost_price × received_qty' },
    { key: 'po_pay', name: 'จ่ายเงินซัพพลายเออร์ (ใบสั่งซื้อ PO)', group: 'ซื้อสินค้าและสต็อก', flow: 'out', description: 'เงินที่จ่ายค่าสินค้าตาม PO (จ่ายเต็มจำนวนครั้งเดียว หลังหักส่วนลด) นับตามวันที่จ่าย', source: 'PurchaseOrder.paid_amount / paid_at' },
    { key: 'po_discount', name: 'ส่วนลดใบสั่งซื้อตอนจ่ายเงิน', group: 'ซื้อสินค้าและสต็อก', flow: 'in', description: 'ส่วนลดจากซัพพลายเออร์ที่ระบุตอนจ่ายเงิน PO', source: 'PurchaseOrder.discount' },
    { key: 'ap_trade', name: 'เจ้าหนี้การค้า (ค้างจ่ายซัพพลายเออร์)', group: 'ซื้อสินค้าและสต็อก', flow: 'payable', description: 'ยอดค้างจ่ายซัพพลายเออร์ของ PO ที่ตรวจรับแล้วแต่ยังไม่ได้จ่ายเงิน — หายไปเมื่อจ่ายเงิน', source: 'PurchaseOrder (ต้นทุนรับ − จ่ายแล้ว − ส่วนลด)' },
    { key: 'receive_no_po', name: 'รับสินค้าเข้าโดยไม่ผ่านใบสั่งซื้อ (แจ้งสินค้าเข้า)', group: 'ซื้อสินค้าและสต็อก', flow: 'in', description: 'อนุมัติแจ้งสินค้าเข้า สินค้าเข้าสต็อกด้วยราคาทุนที่ระบุ × จำนวน (ไม่มีการจ่ายเงินในระบบ)', source: 'ImportNotification.cost_price × จำนวน (อนุมัติแล้ว)' },
    { key: 'stock_loss', name: 'สินค้าชำรุด/สูญหาย (ใบจ่ายออกแบบขาดทุน)', group: 'ซื้อสินค้าและสต็อก', flow: 'out', description: 'ใบจ่ายออกประเภทขาดทุน สินค้าออกจากสต็อกโดยไม่มีรายรับ ขาดทุนตามราคาทุน', source: 'StockIssue.items (claim_type loss)' },

    // ---------- ค่าใช้จ่ายและรายการอื่นๆ ----------
    { key: 'exp_rent', name: 'ค่าเช่า', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ค่าเช่าที่บันทึกจากหน้า "ระบบบัญชีและการเงิน"', source: 'CashMovement รายจ่าย ค่าเช่า' },
    { key: 'exp_utilities', name: 'ค่าไฟ/น้ำ', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ค่าไฟ ค่าน้ำที่บันทึกจากหน้า "ระบบบัญชีและการเงิน"', source: 'CashMovement รายจ่าย ค่าไฟ/น้ำ' },
    { key: 'exp_salary', name: 'เงินเดือน', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'เงินเดือนที่บันทึกจากหน้า "ระบบบัญชีและการเงิน"', source: 'CashMovement รายจ่าย เงินเดือน' },
    { key: 'exp_other_accounting', name: 'ค่าใช้จ่ายอื่นๆ (ระบบบัญชีและการเงิน)', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ค่าใช้จ่ายหมวด "อื่นๆ" ที่บันทึกจากหน้า "ระบบบัญชีและการเงิน"', source: 'CashMovement รายจ่าย อื่นๆ (ไม่ใช่ใบสำคัญจ่าย)' },
    { key: 'exp_contract_prep', name: 'ค่าทำใบสัญญา (หน้าตรวจสอบออเดอร์)', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ค่าทำใบสัญญาให้ไฟแนนซ์ ที่ฝ่ายบัญชีบันทึกหน้าตรวจสอบออเดอร์', source: 'Expense (category ทำใบสัญญา)' },
    { key: 'exp_other_order', name: 'ค่าใช้จ่ายอื่นๆ (หน้าตรวจสอบออเดอร์)', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ค่าใช้จ่ายหมวด "อื่นๆ" ที่ฝ่ายบัญชีบันทึกหน้าตรวจสอบออเดอร์', source: 'Expense (category อื่นๆ)' },
    { key: 'disbursement', name: 'ใบสำคัญจ่าย', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'ยอดจ่ายตามใบสำคัญจ่าย (รวม VAT ถ้ามี)', source: 'DisbursementVoucher (net_amount + vat_amount)' },
    { key: 'other_income', name: 'รายได้อื่นๆ', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'in', description: 'รายได้ที่บันทึกเองที่เมนู "รายได้และรายจ่ายอื่นๆ"', source: 'OtherEntry (income)' },
    { key: 'other_expense', name: 'รายจ่ายอื่นๆ', group: 'ค่าใช้จ่ายและรายการอื่นๆ', flow: 'out', description: 'รายจ่ายที่บันทึกเองที่เมนู "รายได้และรายจ่ายอื่นๆ"', source: 'OtherEntry (expense)' }
];

const ACCOUNT_ITEM_KEYS = new Set(ACCOUNT_ITEMS.map(i => i.key));
const ACCOUNT_ITEM_BY_KEY = new Map(ACCOUNT_ITEMS.map(i => [i.key, i]));

module.exports = { ACCOUNT_ITEMS, ACCOUNT_ITEM_GROUPS, ACCOUNT_ITEM_KEYS, ACCOUNT_ITEM_BY_KEY, ACCOUNT_FLOW_LABELS };
