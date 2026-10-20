// dataflow สองแผนภาพ: ออกแบบให้เส้นตรงเป็นหลัก (หลีกเลี่ยง fan-in ที่ทำให้เส้นซ้อนกัน)
module.exports = (add, src, API) => {

  // -------------------------------------------------------------- stock flow
  add('stock-flow', 'dataflow', (t) => ({
    schema_version: 1, diagram_type: 'dataflow',
    meta: { title: t('Stock Movement Data Flow', 'การไหลของข้อมูลสต็อก'), viewBox: [1060, 560] },
    stages: [{ label: t('Actions', 'การกระทำ') }, { label: t('Stock change', 'การเปลี่ยนสต็อก') }, { label: t('Stores', 'ที่เก็บข้อมูล') }, { label: t('Readers', 'ผู้อ่านข้อมูล') }],
    nodes: [
      { id: 'inb', type: 'backend', label: t('Stock in', 'สต็อกเข้า'), sublabel: t('PO · import · transfer in', 'PO · นำเข้า · รับโอน'), stage: 0, row: 0, width: 150, tag: '+',
        sources: [src(API, 412, 660, 'PO finalize import'), src(API, 4817, 4979, 'approve import'), src(API, 2606, 2693, 'transfer receive')] },
      { id: 'out', type: 'backend', label: t('Stock out', 'สต็อกออก'), sublabel: t('sale · transfer out · issue', 'ขาย · โอนออก · จ่ายออก'), stage: 0, row: 2, width: 150, tag: '−',
        sources: [src(API, 2787, 3025, 'POS sale'), src(API, 2482, 2597, 'transfer send'), src(API, 1379, 1495, 'stock issue')] },
      { id: 'hub', type: 'security', label: t('Stock change', 'เปลี่ยนสต็อก'), sublabel: t('branch + IMEI / quantity', 'ตามสาขา + IMEI/จำนวน'), stage: 1, row: 1, width: 140, tag: 'getRequestedBranchId',
        sources: [src(API, 192, 192, 'getRequestedBranchId'), src(API, 684, 725, 'createMovementsForItem')] },
      { id: 'bal', type: 'database', label: 'stock_balances', sublabel: t('per branch: qty + imeis[]', 'ต่อสาขา: จำนวน + imeis[]'), stage: 2, row: 0, width: 150,
        sources: [src('models/index.js', 297, 297, 'Product')] },
      { id: 'mov', type: 'database', label: 'Movement', sublabel: t('one row per IMEI', 'หนึ่งแถวต่อ IMEI'), stage: 2, row: 2, width: 150,
        sources: [src('models/index.js', 316, 316, 'Movement')] },
      { id: 'pos', type: 'frontend', label: t('Stock, POS, audit', 'สต็อก · POS · ตรวจนับ'), sublabel: t('availability, expected IMEIs', 'ของพร้อมขาย, IMEI ที่ควรมี'), stage: 3, row: 0, width: 140,
        sources: [src(API, 972, 972, 'GET /products'), src(API, 6540, 6565, 'audit expected IMEIs')] },
      { id: 'hist', type: 'frontend', label: t('Movement history', 'ประวัติเคลื่อนไหว'), sublabel: 'GET /movements/search', stage: 3, row: 2, width: 140,
        sources: [src(API, 1557, 1557, 'movements/search')] }
    ],
    flows: [
      { id: 'f-in', from: 'inb', to: 'hub', label: '+', classification: 'in' },
      { id: 'f-out', from: 'out', to: 'hub', label: '−', classification: 'out', variant: 'security' },
      { id: 'f-bal', from: 'hub', to: 'bal', label: t('update', 'อัปเดต'), classification: 'balance', variant: 'emphasis' },
      { id: 'f-mov', from: 'hub', to: 'mov', label: t('log', 'บันทึก'), classification: 'ledger', variant: 'dashed' },
      { id: 'f-pos', from: 'bal', to: 'pos', label: t('read', 'อ่าน'), classification: 'read' },
      { id: 'f-hist', from: 'mov', to: 'hist', label: t('trace', 'ย้อนรอย'), classification: 'read', variant: 'dashed' }
    ],
    cards: [
      { dot: 'emerald', title: t('Stock in', 'สต็อกเข้า'), items: [
        t('PO finalize import: one Product per IMEI, accessories by quantity', 'นำเข้าจาก PO: Product ต่อ IMEI, อุปกรณ์เสริมนับตามจำนวน'),
        t('Import approval for goods outside a PO', 'อนุมัตินำเข้าสินค้านอก PO'),
        t('Transfer receive; cancelled transfers and cancelled sales restock', 'รับโอน; ยกเลิกโอนและยกเลิกบิลขายคืนสต็อก')] },
      { dot: 'rose', title: t('Stock out', 'สต็อกออก'), items: [
        t('POS sale removes the sold IMEI or quantity', 'ขาย POS ตัด IMEI หรือจำนวนที่ขาย'),
        t('Transfer send and stock issue (damaged, lost, internal use)', 'โอนออกและจ่ายออก (ชำรุด สูญหาย ใช้ภายใน)')] },
      { dot: 'amber', title: t('Invariants', 'กฎสำคัญ'), items: [
        t('Stock lives only in Product.stock_balances, one entry per branch', 'สต็อกอยู่ใน Product.stock_balances เท่านั้น หนึ่งรายการต่อสาขา'),
        t('Every change writes a Movement for later tracing', 'ทุกการเปลี่ยนเขียน Movement เพื่อย้อนรอย'),
        t('Stock issue updates per IMEI atomically; sale and transfer save the whole document', 'จ่ายออก update รายตัวแบบ atomic; ขายและโอนบันทึกทั้งเอกสาร')] }
    ]
  }));

  // -------------------------------------------------------------- money flow
  add('money-flow', 'dataflow', (t) => ({
    schema_version: 1, diagram_type: 'dataflow',
    meta: { title: t('Money and Accounting Data Flow', 'การไหลของข้อมูลการเงินและบัญชี'), viewBox: [1060, 683] },
    stages: [{ label: t('Actions', 'การกระทำ') }, { label: t('Records', 'ข้อมูลที่บันทึก') }, { label: t('Reports', 'รายงาน') }],
    nodes: [
      { id: 'sales', type: 'backend', label: t('Sales + verify', 'ขาย + ตรวจออเดอร์'), sublabel: 'POST /transactions', stage: 0, row: 0, width: 140,
        sources: [src(API, 2787, 3025, 'sale'), src(API, 3418, 3622, 'order verification')] },
      { id: 'dep', type: 'backend', label: t('Deposits', 'มัดจำ'), sublabel: '/deposits', stage: 0, row: 1, width: 150, sources: [src(API, 6907, 7123, 'deposit routes')] },
      { id: 'exp', type: 'backend', label: t('Expenses', 'ค่าใช้จ่าย'), sublabel: 'accounting/expenses', stage: 0, row: 2, width: 150, sources: [src(API, 5961, 6009, 'POST /accounting/expenses')] },
      { id: 'popay', type: 'security', label: t('PO payment', 'จ่ายเงิน PO'), sublabel: 'pay_po', yOffset: -18, stage: 0, row: 3, width: 150, sources: [src(API, 6012, 6100, 'po-pay')] },
      { id: 'pv', type: 'backend', label: t('Voucher', 'ใบสำคัญจ่าย'), sublabel: 'acct/disbursements', yOffset: -36, stage: 0, row: 4, width: 150, sources: [src('routes/accounting.js', 554, 661, 'POST /disbursements')] },
      { id: 'tx', type: 'database', label: t('Sales bills', 'บิลขาย'), sublabel: t('bills + receivable', 'บิล + ลูกหนี้'), stage: 1, row: 0, width: 140,
        sources: [src('models/index.js', 436, 436, 'Transaction'), src('models/index.js', 599, 599, 'FinanceReceivable')] },
      { id: 'cash', type: 'database', label: 'CashMovement', sublabel: t('income / expense', 'รายรับ/รายจ่าย'), stage: 1, row: 1, height: 178, width: 140,
        sources: [src('models/index.js', 578, 578, 'CashMovement')] },
      { id: 'ppay', type: 'database', label: t('PO payments', 'การจ่าย PO'), sublabel: t('paid + cash line', 'ยอดจ่าย + รายการเงิน'), yOffset: -18, stage: 1, row: 3, width: 140,
        sources: [src('models/index.js', 543, 543, 'PurchaseOrder')] },
      { id: 'vch', type: 'database', label: t('Vouchers', 'ใบสำคัญจ่าย'), sublabel: t('accounts + cash', 'บัญชี + รายการเงิน'), yOffset: -36, stage: 1, row: 4, width: 140,
        sources: [src('models/index.js', 780, 780, 'DisbursementVoucher')] },
      { id: 'pnl', type: 'frontend', label: t('Profit & loss', 'งบกำไรขาดทุน'), sublabel: 'profit-loss', stage: 2, row: 0, height: 292, width: 140,
        sources: [src(API, 5750, 5958, 'profit-loss')] },
      { id: 'ap', type: 'frontend', label: t('Payables', 'เจ้าหนี้'), sublabel: 'ap-summary', yOffset: -18, stage: 2, row: 3, width: 140,
        sources: [src(API, 6256, 6317, 'ap-summary'), src(API, 2179, 2199, 'credit usage')] },
      { id: 'pnl2', type: 'frontend', label: t('P&L by account', 'งบตามผังบัญชี'), sublabel: 'pnl-report', yOffset: -36, stage: 2, row: 4, width: 140,
        sources: [src('routes/accounting.js', 690, 774, 'pnl-report')] }
    ],
    flows: [
      { id: 'm-sales-tx', from: 'sales', to: 'tx', label: t('bill', 'บิล'), classification: 'sale', variant: 'emphasis' },
      { id: 'm-dep-cash', from: 'dep', to: 'cash', label: t('deposit', 'มัดจำ'), classification: 'income' },
      { id: 'm-exp-cash', from: 'exp', to: 'cash', label: t('expense', 'รายจ่าย'), classification: 'expense' },
      { id: 'm-po-ppay', from: 'popay', to: 'ppay', label: t('paid', 'จ่าย'), classification: 'payable', variant: 'security' },
      { id: 'm-pv-vch', from: 'pv', to: 'vch', label: t('voucher', 'ใบสำคัญ'), classification: 'expense' },
      { id: 'm-tx-pnl', from: 'tx', to: 'pnl', label: t('revenue', 'รายได้'), classification: 'read' },
      { id: 'm-cash-pnl', from: 'cash', to: 'pnl', label: t('other', 'อื่น ๆ'), classification: 'read' },
      { id: 'm-ppay-ap', from: 'ppay', to: 'ap', label: t('owed', 'ค้างจ่าย'), classification: 'read' },
      { id: 'm-vch-pnl2', from: 'vch', to: 'pnl2', label: t('by account', 'ตามบัญชี'), classification: 'read' }
    ],
    cards: [
      { dot: 'cyan', title: t('Two reports', 'รายงานสองแบบ'), items: [
        t('profit-loss: sales bills + CashMovement + imported POs + PO cash lines', 'profit-loss: บิลขาย + CashMovement + PO ที่นำเข้าแล้ว + รายการจ่าย PO'),
        t('pnl-report: voucher debits per account + sales bills', 'pnl-report: ยอดเดบิตใบสำคัญจ่ายต่อบัญชี + บิลขาย')] },
      { dot: 'amber', title: t('Where cash lines come from', 'รายการเงินมาจากไหน'), items: [
        t('A plain cash sale writes no CashMovement; revenue comes from the bill', 'ขายสดปกติไม่เขียน CashMovement รายได้มาจากบิลโดยตรง'),
        t('Financing writes the immediate cash and a receivable', 'ไฟแนนซ์เขียนเงินสดรับทันที + ลูกหนี้'),
        t('Delivering a deposit also creates a cash-sale bill', 'ส่งมอบมัดจำจะสร้างบิลซื้อสดด้วย'),
        t('PO payments and vouchers each add an expense line to CashMovement', 'จ่าย PO และใบสำคัญจ่ายต่างเพิ่มรายการรายจ่ายใน CashMovement')] },
      { dot: 'rose', title: t('Access', 'สิทธิ์'), items: [
        t('All /api/acct routes require manage_finance', 'ทุก route ใต้ /api/acct ต้องมี manage_finance'),
        t('PO payment requires pay_po', 'จ่าย PO ต้องมี pay_po')] }
    ]
  }));
};
