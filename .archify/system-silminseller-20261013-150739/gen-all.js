// สร้าง candidate JSON ของ archify ทุก diagram (ไทย/อังกฤษ) จากข้อมูลชุดเดียว
const fs = require('fs'), path = require('path');
const dir = __dirname;
const rel = path.relative(process.cwd(), dir).split(path.sep).join('/');
const REPO = { url: 'https://github.com/silmemobile104/silminseller.git', provider: 'github', revision: 'dcf694923433006facd22a0fd73d70b1cb354edb' };
const TH_LEGEND_ARCH = { mode: 'auto', entries: {
  frontend: { label: 'ฝั่งเบราว์เซอร์' }, backend: { label: 'ตรรกะฝั่งเซิร์ฟเวอร์' }, database: { label: 'ข้อมูลที่เก็บไว้' },
  cloud: { label: 'ไฟล์สแตติก' }, security: { label: 'ตรวจสิทธิ์ / ปฏิเสธ' }, messagebus: { label: 'ตัวกลาง' }, external: { label: 'ผู้ใช้ / ภายนอก' } } };
const TH_LEGEND = {
  architecture: TH_LEGEND_ARCH, workflow: TH_LEGEND_ARCH,
  lifecycle: { mode: 'auto', entries: { start: { label: 'จุดเริ่มต้น' }, active: { label: 'กำลังดำเนินการ' }, waiting: { label: 'รอดำเนินการ' }, decision: { label: 'ตัดสินใจ' }, success: { label: 'สำเร็จ' }, failure: { label: 'ยกเลิก / ล้มเหลว' }, neutral: { label: 'ระบบปิดให้' }, external: { label: 'ภายนอก' } } },
  sequence: { mode: 'auto', entries: { default: { label: 'คำขอ' }, emphasis: { label: 'เส้นทางหลัก' }, security: { label: 'ตรวจสิทธิ์' }, dashed: { label: 'งานเสริม' }, return: { label: 'ตอบกลับ' } } },
  dataflow: { mode: 'auto', entries: { default: { label: 'การไหลของข้อมูล' }, emphasis: { label: 'เส้นทางหลัก' }, security: { label: 'ควบคุม / ตรวจสิทธิ์' }, dashed: { label: 'เส้นรอง' }, database: { label: 'ที่เก็บข้อมูล' } } }
};
const src = (p, line, end, label) => ({ path: p, line, end_line: end, label });
const API = 'routes/api.js';

const diagrams = [];
const add = (id, type, build) => diagrams.push({ id, type, build });

// ---------------------------------------------------------------- 1 login (sequence)
add('login', 'sequence', (t) => ({
  schema_version: 1, diagram_type: 'sequence',
  meta: { title: t('Login and Session Sequence', 'ลำดับการเข้าสู่ระบบและเซสชัน'), viewBox: [1000, 560], column_fit: 'spread' },
  participants: [
    { id: 'staff', type: 'external', label: t('Staff', 'พนักงาน'), sublabel: t('emp_id + password', 'รหัสพนักงาน + รหัสผ่าน') },
    { id: 'web', type: 'frontend', label: t('Web shell', 'เว็บเชลล์'), sublabel: 'index.html · script.js', sources: [src('script.js', 53, 53, 'authFetch')] },
    { id: 'api', type: 'backend', label: 'POST /auth/login', sublabel: API, sources: [src(API, 1650, 1770, 'login handler')] },
    { id: 'db', type: 'database', label: 'MongoDB', sublabel: 'Employee · Role', sources: [src(API, 1662, 1662, 'Employee.findOne'), src(API, 1689, 1689, 'Role.findOne')] },
    { id: 'audit', type: 'database', label: 'AuditLog', sublabel: t('LOGIN entry', 'บันทึก LOGIN'), sources: [src(API, 1738, 1747, 'AuditLog.create')] }
  ],
  segments: [
    { from: 150, to: 245, label: t('Credentials', 'ตรวจรหัส') },
    { from: 250, to: 325, label: t('Permissions', 'โหลดสิทธิ์') },
    { from: 330, to: 410, label: t('Session', 'เปิดเซสชัน') }
  ],
  messages: [
    { id: 'enter', from: 'staff', to: 'web', y: 165, label: t('enter ID + password', 'กรอกรหัส + รหัสผ่าน') },
    { id: 'post-login', from: 'web', to: 'api', y: 195, label: 'POST /auth/login', variant: 'emphasis' },
    { id: 'find-emp', from: 'api', to: 'db', y: 225, label: t('find Employee by emp_id', 'ค้นพนักงานด้วย emp_id') },
    { id: 'emp-row', from: 'db', to: 'api', y: 253, label: t('employee + hash', 'พนักงาน + hash'), variant: 'return' },
    { id: 'find-role', from: 'api', to: 'db', y: 283, label: t('bcrypt ok → load Role', 'bcrypt ผ่าน → โหลด Role') },
    { id: 'role-row', from: 'db', to: 'api', y: 311, label: t('permissions', 'สิทธิ์'), variant: 'return' },
    { id: 'log-login', from: 'api', to: 'audit', y: 341, label: t('log LOGIN', 'บันทึก LOGIN'), variant: 'dashed' },
    { id: 'jwt', from: 'api', to: 'web', y: 369, label: t('JWT 24h + permissions', 'JWT 24 ชม. + สิทธิ์'), variant: 'security' },
    { id: 'open-view', from: 'web', to: 'staff', y: 397, label: t('open default view', 'เข้าหน้าเริ่มต้น'), variant: 'return' }
  ],
  activations: [
    { participant: 'web', from: 185, to: 405, type: 'frontend' },
    { participant: 'api', from: 190, to: 375, type: 'backend' },
    { participant: 'db', from: 220, to: 318, type: 'database' }
  ],
  cards: [
    { dot: 'rose', title: t('Rejected', 'ถูกปฏิเสธ'), items: [
      t('Missing fields → 400', 'ไม่กรอกครบ → 400'),
      t('Unknown ID or wrong password → 401 (same message)', 'รหัสไม่มี/รหัสผิด → 401 (ข้อความเดียวกัน)'),
      t('Suspended account → 403', 'บัญชีถูกระงับ → 403')] },
    { dot: 'emerald', title: t('Token', 'โทเค็น'), items: [
      t('JWT carries employee, role, branch and permissions', 'JWT เก็บพนักงาน บทบาท สาขา และสิทธิ์'),
      t('Missing new permissions fall back to related ones', 'สิทธิ์ใหม่ที่ขาดจะอิงสิทธิ์เดิมที่เกี่ยวข้อง')] },
    { dot: 'cyan', title: t('Every later call', 'ทุกคำขอหลังจากนั้น'), items: [
      t('verifyToken checks the Bearer JWT on all /api routes', 'verifyToken ตรวจ Bearer JWT ทุก route ใต้ /api'),
      t('401 = expired session; 403 = lacks permission', '401 = เซสชันหมดอายุ; 403 = ไม่มีสิทธิ์')] }
  ]
}));

// ---------------------------------------------------------------- 2 POS sale (workflow)
add('pos-sale', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('POS Sale Workflow (POST /transactions)', 'ขั้นตอนการขาย POS (POST /transactions)') },
  lanes: [
    { id: 'ui', label: t('Cashier · POS page', 'แคชเชียร์ · หน้า POS') },
    { id: 'api', label: t('Sale endpoint', 'API ขาย') },
    { id: 'exc', label: t('Rejected', 'ถูกปฏิเสธ'), variant: 'exception' },
    { id: 'records', label: t('Stock + money records', 'ข้อมูลสต็อก + การเงิน') }
  ],
  mainPath: ['cart', 'pos', 'validate', 'deduct', 'savetx', 'after', 'done'],
  nodes: [
    { id: 'cart', lane: 'ui', col: 0, type: 'external', label: t('Cashier', 'แคชเชียร์'), sublabel: t('builds the cart', 'จัดตะกร้า') },
    { id: 'pos', lane: 'ui', col: 1, type: 'frontend', label: t('POS page', 'หน้า POS'), sublabel: 'authFetch POST' },
    { id: 'done', lane: 'ui', col: 5, type: 'frontend', label: t('Receipt', 'ใบเสร็จ'), sublabel: t('201 + INV number', '201 + เลข INV') },
    { id: 'validate', lane: 'api', col: 1, type: 'backend', label: t('Validate', 'ตรวจข้อมูล'), sublabel: t('items + payment', 'สินค้า + ช่องทางจ่าย'), sources: [src(API, 2787, 2803, 'basic validation')] },
    { id: 'deduct', lane: 'api', col: 2, type: 'backend', width: 140, label: t('Deduct stock', 'ตัดสต็อก'), sublabel: t('item by item, own branch', 'ทีละชิ้น ตามสาขา'), sources: [src(API, 2837, 2883, 'per-item deduction')] },
    { id: 'savetx', lane: 'api', col: 3, type: 'backend', label: t('Save sale', 'บันทึกบิล'), sublabel: 'Transaction INV-…', sources: [src(API, 2901, 2934, 'Transaction.save')] },
    { id: 'after', lane: 'api', col: 4, type: 'backend', label: t('Post-sale', 'หลังขาย'), sublabel: t('deposit + financing', 'มัดจำ + ไฟแนนซ์'), sources: [src(API, 2939, 2950, 'applied deposit'), src(API, 2955, 3005, 'financing split')] },
    { id: 'reject', lane: 'exc', col: 1, type: 'security', label: t('Reject', 'ปฏิเสธ'), sublabel: '400 / 404', sources: [src(API, 2851, 2877, 'missing branch/IMEI/qty')] },
    { id: 'bal', lane: 'records', col: 2, type: 'database', label: 'stock_balances', sublabel: t('−IMEI or −qty', '−IMEI หรือ −จำนวน'), sources: [src('models/index.js', 297, 297, 'Product')] },
    { id: 'mov', lane: 'records', col: 3, type: 'database', label: 'Movement', sublabel: t('action ขายออก', 'action ขายออก'), sources: [src(API, 2887, 2897, 'createMovementsForItem')] },
    { id: 'cash', lane: 'records', col: 4, type: 'database', label: 'CashMovement', sublabel: t('immediate cash', 'เงินสดรับทันที'), sources: [src(API, 2981, 2990, 'CashMovement.save')] },
    { id: 'recv', lane: 'records', col: 5, type: 'database', label: t('Receivable', 'ลูกหนี้'), sublabel: t('FinanceReceivable', 'FinanceReceivable'), width: 132, sources: [src(API, 2993, 3004, 'FinanceReceivable.save')] }
  ],
  edges: [
    { id: 'e-cart', from: 'cart', to: 'pos' },
    { id: 'e-submit', from: 'pos', to: 'validate', label: 'POST', variant: 'emphasis' },
    { id: 'e-valid', from: 'validate', to: 'deduct' },
    { id: 'e-deduct', from: 'deduct', to: 'savetx' },
    { id: 'e-save', from: 'savetx', to: 'after' },
    { id: 'e-done', from: 'after', to: 'done', variant: 'emphasis', role: 'return' },
    { id: 'e-bad', from: 'validate', to: 'reject', label: t('invalid', 'ไม่ถูกต้อง'), variant: 'security', role: 'error' },
    { id: 'e-miss', from: 'deduct', to: 'reject', label: t('no stock', 'ของไม่พอ'), variant: 'security', role: 'error' },
    { id: 'e-bal', from: 'deduct', to: 'bal', variant: 'dashed', role: 'branch' },
    { id: 'e-mov', from: 'bal', to: 'mov', label: t('log', 'บันทึก'), variant: 'dashed', role: 'branch' },
    { id: 'e-cash', from: 'after', to: 'cash', label: t('financing', 'ไฟแนนซ์'), variant: 'dashed', role: 'branch' },
    { id: 'e-recv', from: 'cash', to: 'recv', label: t('queue', 'เข้าคิว'), variant: 'dashed', role: 'branch' }
  ],
  cards: [
    { dot: 'emerald', title: t('Normal sale', 'ขายปกติ'), items: [
      t('Branch comes from the request or the user', 'สาขามาจากคำขอหรือสาขาของผู้ใช้'),
      t('IMEI items remove the IMEI; accessories reduce quantity', 'สินค้ามี IMEI ตัด IMEI; อุปกรณ์เสริมลดจำนวน'),
      t('Cash sale starts as paid; financing starts unpaid', 'ซื้อสดเริ่มเป็นชำระแล้ว; ไฟแนนซ์เริ่มเป็นยังไม่ชำระ')] },
    { dot: 'amber', title: t('Cancel sale', 'ยกเลิกบิล'), items: [
      t('Needs cancel_sale or admin/manager, plus a reason', 'ต้องมี cancel_sale หรือแอดมิน/ผู้จัดการ และระบุเหตุผล'),
      t('Puts stock back and logs Movement ยกเลิกการขาย', 'คืนสต็อกและบันทึก Movement ยกเลิกการขาย'),
      t('Does not touch FinanceReceivable or CashMovement', 'ไม่แก้ FinanceReceivable หรือ CashMovement')] },
    { dot: 'rose', title: t('Known gap', 'ข้อสังเกตจากโค้ด'), items: [
      t('Items are saved one by one; a later failure keeps earlier deductions', 'ตัดสต็อกทีละชิ้น ถ้าชิ้นหลังล้มเหลว ชิ้นก่อนหน้ายังถูกตัดอยู่'),
      t('No transaction wraps the loop', 'ไม่มี transaction ครอบลูปนี้')] }
  ]
}));

// ---------------------------------------------------------------- 3 transfer (lifecycle)
add('transfer', 'lifecycle', (t) => ({
  schema_version: 2, diagram_type: 'lifecycle',
  meta: { title: t('Branch Transfer Lifecycle', 'วงจรการโอนย้ายสินค้าระหว่างสาขา') },
  lanes: [
    { id: 'main', label: t('Source branch', 'สาขาต้นทาง') },
    { id: 'dest', label: t('Destination branch', 'สาขาปลายทาง') },
    { id: 'terminal', label: t('Cancelled', 'ยกเลิก') }
  ],
  states: [
    { id: 'create', type: 'start', label: t('Created', 'สร้างใบโอน'), sublabel: t('stock leaves source', 'สต็อกออกจากต้นทาง'), lane: 'main', col: 0, step: '01', tag: 'manage_transfers', sources: [src(API, 2482, 2597, 'POST /transfers')] },
    { id: 'pending', type: 'waiting', label: t('Pending', 'รอดำเนินการ'), sublabel: t('in transit', 'อยู่ระหว่างขนส่ง'), lane: 'main', col: 1, step: '02', tag: 'รอดำเนินการ', sources: [src('models/index.js', 449, 449, 'status default')] },
    { id: 'received', type: 'success', label: t('Received', 'รับเข้าแล้ว'), sublabel: t('stock enters destination', 'สต็อกเข้าปลายทาง'), lane: 'dest', col: 1, tag: 'รับเข้าแล้ว', sources: [src(API, 2606, 2693, 'PUT /transfers/:id/receive')] },
    { id: 'cancelled', type: 'failure', label: t('Cancelled', 'ยกเลิกแล้ว'), sublabel: t('stock returns to source', 'สต็อกกลับต้นทาง'), lane: 'terminal', col: 1, tag: 'ยกเลิกแล้ว', sources: [src(API, 2697, 2783, 'PUT /transfers/:id/cancel')] }
  ],
  transitions: [
    { from: 'create', to: 'pending', label: t('saved', 'บันทึก') },
    { from: 'pending', to: 'received', label: t('destination confirms', 'ปลายทางยืนยันรับ'), variant: 'emphasis' },
    { from: 'pending', to: 'cancelled', label: t('source cancels', 'ต้นทางยกเลิก'), variant: 'security' }
  ],
  cards: [
    { dot: 'cyan', title: t('Who may act', 'ใครทำได้'), items: [
      t('Staff: source branch cancels, destination branch receives', 'พนักงาน: ต้นทางยกเลิก ปลายทางรับเข้า'),
      t('Administrator / แอดมิน / ผู้จัดการ bypass the branch check', 'บทบาท Administrator / แอดมิน / ผู้จัดการ ข้ามการตรวจสาขา'),
      t('All three actions need manage_transfers', 'ทั้งสามการกระทำต้องมี manage_transfers')] },
    { dot: 'emerald', title: t('Stock effects', 'ผลต่อสต็อก'), items: [
      t('Create deducts IMEIs or quantity at the source', 'สร้างใบ: ตัด IMEI/จำนวนที่ต้นทาง'),
      t('Receive adds them to the destination (no duplicate IMEI)', 'รับเข้า: เพิ่มที่ปลายทาง (ไม่ซ้ำ IMEI)'),
      t('Every step logs a Movement with the transfer number', 'ทุกขั้นบันทึก Movement ผูกเลขที่โอน')] },
    { dot: 'amber', title: t('Note', 'หมายเหตุ'), items: [
      t('The creator may add a note (max 500 chars), shown in history', 'ผู้สร้างใส่หมายเหตุได้ (ไม่เกิน 500 ตัวอักษร) แสดงในประวัติ')] }
  ]
}));

// ---------------------------------------------------------------- 4 purchase order (lifecycle)
add('purchase-order', 'lifecycle', (t) => ({
  schema_version: 2, diagram_type: 'lifecycle',
  meta: { title: t('Purchase Order Lifecycle', 'วงจรใบสั่งซื้อ (PO)') },
  lanes: [
    { id: 'main', label: t('Delivery and import', 'การจัดส่งและนำเข้า') },
    { id: 'pay', label: t('Payment', 'การชำระเงิน') },
    { id: 'terminal', label: t('Cancelled', 'ยกเลิก') }
  ],
  states: [
    { id: 'pending', type: 'start', label: t('Awaiting shipment', 'รอจัดส่ง'), sublabel: t('PO created', 'สร้าง PO แล้ว'), lane: 'main', col: 0, step: '01', tag: 'manage_po', sources: [src(API, 5258, 5305, 'POST /purchase-orders')] },
    { id: 'arrived', type: 'active', label: t('Arrived', 'ของถึงสาขาแล้ว'), sublabel: t('IMEIs reported', 'แจ้ง IMEI แล้ว'), lane: 'main', col: 1, step: '02', tag: 'report_arrival', sources: [src(API, 5487, 5574, 'report-arrival')] },
    { id: 'receiving', type: 'active', label: t('Receiving', 'กำลังตรวจรับ'), sublabel: t('scan + set price', 'สแกน + ตั้งราคา'), lane: 'main', col: 2, step: '03', tag: 'receive_po', sources: [src(API, 5578, 5672, 'scan-item')] },
    { id: 'imported', type: 'success', label: t('Imported', 'นำเข้าสำเร็จ'), sublabel: t('stock added', 'เพิ่มเข้าสต็อกแล้ว'), lane: 'main', col: 3, step: '04', tag: 'นำเข้าสำเร็จ', sources: [src(API, 412, 660, 'executeFinalizeImport'), src(API, 5676, 5693, 'finalize-import')] },
    { id: 'unpaid', type: 'start', label: t('Unpaid', 'ยังไม่ได้ชำระ'), sublabel: t('owed to supplier', 'ค้างจ่ายผู้จัดจำหน่าย'), lane: 'pay', col: 2, tag: 'default', sources: [src('models/index.js', 533, 533, 'payment_status')] },
    { id: 'paid', type: 'success', label: t('Paid', 'ชำระเงินแล้ว'), sublabel: t('full amount − discount', 'ยอดเต็ม − ส่วนลด'), lane: 'pay', col: 3, tag: 'pay_po', sources: [src(API, 6012, 6100, 'PUT /accounting/po-pay/:id')] },
    { id: 'cancelled', type: 'failure', label: t('Cancelled', 'ยกเลิก'), sublabel: t('before shipment only', 'ก่อนจัดส่งเท่านั้น'), lane: 'terminal', col: 0, sources: [src(API, 5454, 5483, 'cancel')] }
  ],
  transitions: [
    { from: 'pending', to: 'arrived', label: t('branch reports arrival', 'สาขาแจ้งของถึง') },
    { from: 'arrived', to: 'receiving', label: t('scan items', 'สแกนตรวจรับ') },
    { from: 'receiving', to: 'imported', label: t('all imported', 'นำเข้าครบ'), variant: 'emphasis' },
    { from: 'receiving', to: 'pending', label: t('partly imported', 'นำเข้าไม่ครบ'), variant: 'dashed' },
    { from: 'pending', to: 'cancelled', label: t('cancel', 'ยกเลิก'), variant: 'security' },
    { from: 'unpaid', to: 'paid', label: t('pay in full', 'จ่ายเต็มจำนวน'), variant: 'emphasis' }
  ],
  cards: [
    { dot: 'cyan', title: t('Delivery track', 'สายการรับของ'), items: [
      t('Edit and cancel only while awaiting shipment', 'แก้ไข/ยกเลิกได้เฉพาะตอนรอจัดส่ง'),
      t('Scanning can start without the arrival report', 'สแกนตรวจรับได้โดยไม่ต้องแจ้งของถึงก่อน'),
      t('Import creates one Product per IMEI; accessories by quantity', 'นำเข้าสร้าง Product ต่อ IMEI; อุปกรณ์เสริมนับตามจำนวน')] },
    { dot: 'amber', title: t('Payment track', 'สายการจ่ายเงิน'), items: [
      t('Independent of delivery; needs pay_po', 'แยกจากสายรับของ; ต้องมี pay_po'),
      t('Server computes the amount; client value ignored', 'เซิร์ฟเวอร์คำนวณยอดเอง ไม่เชื่อค่าจากหน้าเว็บ'),
      t('Writes a CashMovement; discount needs a remark', 'บันทึก CashMovement; ส่วนลดต้องมีหมายเหตุ')] },
    { dot: 'slate', title: t('Also in the data', 'ที่มีในข้อมูล'), items: [
      t('Status ชำระเงินบางส่วน exists in the enum but full-only pay never sets it', 'สถานะ ชำระเงินบางส่วน มีใน enum แต่การจ่ายเต็มจำนวนไม่ตั้งค่านี้')] }
  ]
}));

// ---------------------------------------------------------------- 5 finance receivable (lifecycle)
add('finance-receivable', 'lifecycle', (t) => ({
  schema_version: 2, diagram_type: 'lifecycle',
  meta: { title: t('Finance Receivable Lifecycle', 'วงจรลูกหนี้จัดไฟแนนซ์') },
  lanes: [
    { id: 'main', label: t('Receivable status', 'สถานะลูกหนี้') },
    { id: 'terminal', label: t('Cancelled', 'ยกเลิก') }
  ],
  states: [
    { id: 'awaiting', type: 'start', label: t('Awaiting approval', 'รออนุมัติ'), sublabel: t('created by a financed sale', 'เกิดจากการขายไฟแนนซ์'), lane: 'main', col: 0, step: '01', tag: 'default', sources: [src(API, 2993, 3004, 'created with the sale'), src('models/index.js', 589, 589, 'status enum')] },
    { id: 'pending', type: 'waiting', label: t('Transfer pending', 'ค้างโอน'), sublabel: t('finance not yet paid', 'ไฟแนนซ์ยังไม่โอน'), lane: 'main', col: 1, step: '02', tag: 'ค้างโอน', sources: [src(API, 6207, 6252, 'settle')] },
    { id: 'settled', type: 'success', label: t('Settled', 'ชำระแล้ว'), sublabel: t('verified as paid', 'ยืนยันว่าชำระแล้ว'), lane: 'main', col: 2, step: '03', tag: 'ชำระแล้ว', sources: [src(API, 3511, 3520, 'order verification')] },
    { id: 'received', type: 'success', label: t('Fully received', 'ได้รับเงินครบแล้ว'), sublabel: t('payout confirmed', 'ยืนยันรับเงินโอน'), lane: 'main', col: 3, step: '04', tag: 'manage_finance', sources: [src(API, 6402, 6436, 'POST /finance/payout/:id')] },
    { id: 'cancelled', type: 'failure', label: t('Cancelled', 'ยกเลิก'), sublabel: t('set by accounting', 'ฝ่ายบัญชีตั้งสถานะ'), lane: 'terminal', col: 1, sources: [src(API, 6213, 6224, 'valid statuses')] }
  ],
  transitions: [
    { from: 'awaiting', to: 'pending', label: t('mark pending', 'ตั้งค้างโอน') },
    { from: 'pending', to: 'settled', label: t('mark paid', 'ตั้งชำระแล้ว'), variant: 'emphasis' },
    { from: 'settled', to: 'received', label: t('payout', 'ยืนยันรับเงิน'), variant: 'emphasis' },
    { from: 'settled', to: 'pending', label: t('re-open', 'เปิดใหม่'), variant: 'dashed' },
    { from: 'pending', to: 'cancelled', label: t('cancel', 'ยกเลิก'), variant: 'security' }
  ],
  cards: [
    { dot: 'cyan', title: t('Who changes it', 'ใครเปลี่ยนสถานะ'), items: [
      t('Accounting page: settle and payout need manage_finance', 'หน้าบัญชี: settle และ payout ต้องมี manage_finance'),
      t('Order verification: paid / unpaid toggle needs verify_orders', 'หน้าตรวจสอบออเดอร์: สลับชำระ/ค้างโอน ต้องมี verify_orders')] },
    { dot: 'emerald', title: t('Reporting', 'การนำไปรายงาน'), items: [
      t('Settled and Fully received both count as paid', 'ชำระแล้ว และ ได้รับเงินครบแล้ว นับเป็นชำระเงินแล้วเหมือนกัน'),
      t('Amount = total − down payment − iCloud fee − contract fee', 'ยอด = ราคารวม − ดาวน์ − ค่า iCloud − ค่าใบสัญญา')] },
    { dot: 'amber', title: t('Transitions are loose', 'ข้อสังเกต'), items: [
      t('settle accepts any of the four statuses; arrows show common paths', 'settle รับสถานะได้ทั้งสี่ค่า ลูกศรคือเส้นทางที่ใช้บ่อย')] }
  ]
}));

// ---------------------------------------------------------------- 6 deposit (lifecycle)
add('deposit', 'lifecycle', (t) => ({
  schema_version: 2, diagram_type: 'lifecycle',
  meta: { title: t('Deposit (Reservation) Lifecycle', 'วงจรใบมัดจำสินค้า') },
  lanes: [
    { id: 'main', label: t('Deposit', 'ใบมัดจำ') },
    { id: 'terminal', label: t('Cancelled', 'ยกเลิก') }
  ],
  states: [
    { id: 'created', type: 'start', label: t('Deposit taken', 'รับเงินมัดจำ'), sublabel: 'DEP-YYYYMMDD-####', lane: 'main', col: 0, step: '01', tag: 'manage_deposits', sources: [src(API, 6907, 6984, 'POST /deposits')] },
    { id: 'waiting', type: 'waiting', label: t('Pending', 'รอดำเนินการ'), sublabel: t('4 stages, editable', '4 ขั้นย่อย แก้ไขได้'), lane: 'main', col: 1, step: '02', tag: 'รอดำเนินการ', sources: [src('models/index.js', 658, 659, 'status + stage')] },
    { id: 'done', type: 'success', label: t('Completed', 'สำเร็จ'), sublabel: t('bill number linked', 'ผูกเลขบิลแล้ว'), lane: 'main', col: 2, step: '03', tag: 'สำเร็จ', sources: [src(API, 7033, 7123, 'PUT /deposits/:id/complete'), src(API, 2939, 2950, 'applied in a POS sale')] },
    { id: 'cancelled', type: 'failure', label: t('Cancelled', 'ยกเลิก'), sublabel: t('reason recorded', 'เก็บเหตุผล'), lane: 'terminal', col: 1, sources: [src(API, 7126, 7152, 'PUT /deposits/:id/cancel')] }
  ],
  transitions: [
    { from: 'created', to: 'waiting', label: t('saved', 'บันทึก') },
    { from: 'waiting', to: 'done', label: t('deliver, or apply in POS', 'ส่งมอบ หรือหักในบิลขาย'), variant: 'emphasis' },
    { from: 'waiting', to: 'cancelled', label: t('cancel', 'ยกเลิก'), variant: 'security' }
  ],
  cards: [
    { dot: 'cyan', title: t('Stages while pending', 'ขั้นย่อยระหว่างรอ'), items: [
      t('รอลูกค้ารับเครื่อง · รอโอนย้ายจากสาขาอื่น', 'รอลูกค้ารับเครื่อง · รอโอนย้ายจากสาขาอื่น'),
      t('รอสินค้าเข้า · รอฝ่ายจัดซื้อสั่งสินค้า', 'รอสินค้าเข้า · รอฝ่ายจัดซื้อสั่งสินค้า')] },
    { dot: 'emerald', title: t('Money', 'เงิน'), items: [
      t('Taking a deposit writes a CashMovement (income)', 'รับมัดจำ: บันทึก CashMovement ประเภทรายรับ'),
      t('Delivery creates a cash-sale Transaction for the full price', 'ส่งมอบ: สร้างบิลซื้อสดราคาเต็ม'),
      t('Only completed or cancelled stops further edits', 'แก้ไขได้เฉพาะตอนรอดำเนินการ')] },
    { dot: 'rose', title: t('Known gap', 'ข้อสังเกตจากโค้ด'), items: [
      t('The deliver route creates the bill but does not deduct stock_balances', 'เส้นทางส่งมอบสร้างบิลแต่ไม่ได้ตัด stock_balances'),
      t('Applying the deposit in POS does deduct stock', 'การหักมัดจำผ่านหน้า POS จะตัดสต็อกตามปกติ')] }
  ]
}));

// ---------------------------------------------------------------- 7 stock audit (lifecycle)
add('stock-audit', 'lifecycle', (t) => ({
  schema_version: 2, diagram_type: 'lifecycle',
  meta: { title: t('Daily Stock Audit Lifecycle', 'วงจรตรวจนับสต็อกประจำวัน') },
  lanes: [
    { id: 'main', label: t('Audit session', 'รอบตรวจนับ') },
    { id: 'terminal', label: t('Closed by system', 'ระบบปิดให้') }
  ],
  states: [
    { id: 'counting', type: 'active', label: t('Counting', 'กำลังตรวจนับ'), sublabel: t('branch scans IMEIs', 'สาขาสแกน IMEI'), lane: 'main', col: 0, step: '01', tag: 'do_stock_audit', sources: [src('utils/cronTasks.js', 57, 76, 'daily 00:05 scheduler'), src(API, 6442, 6493, 'open session'), src(API, 6657, 6717, 'scan')] },
    { id: 'review', type: 'waiting', label: t('Awaiting review', 'รอการอนุมัติ'), sublabel: t('submitted to stock team', 'ส่งให้ทีมสต็อก'), lane: 'main', col: 1, step: '02', tag: 'manage_stock_audit', sources: [src(API, 6741, 6761, 'submit'), src(API, 6764, 6800, 'review item')] },
    { id: 'approved', type: 'success', label: t('Approved', 'อนุมัติแล้ว'), sublabel: t('all items judged', 'ตัดสินครบทุกรายการ'), lane: 'main', col: 2, step: '03', tag: 'อนุมัติแล้ว', sources: [src(API, 6803, 6831, 'close session')] },
    { id: 'auto', type: 'neutral', label: t('Auto-closed', 'ปิดโดยอัตโนมัติ'), sublabel: t('a newer session replaced it', 'มีรอบใหม่แทนที่'), lane: 'terminal', col: 1, sources: [src(API, 6466, 6470, 'auto-close stale'), src('utils/cronTasks.js', 21, 26, 'cron auto-close')] }
  ],
  transitions: [
    { from: 'counting', to: 'review', label: t('submit', 'ส่งตรวจ'), variant: 'emphasis' },
    { from: 'review', to: 'approved', label: t('close session', 'ปิดรอบ'), variant: 'emphasis' },
    { from: 'review', to: 'counting', label: t('recheck item', 'ตรวจใหม่'), variant: 'dashed' },
    { from: 'review', to: 'auto', label: t('new session opens', 'เปิดรอบใหม่'), variant: 'security' }
  ],
  cards: [
    { dot: 'cyan', title: t('Per item', 'รายชิ้น'), items: [
      t('Scan stores the IMEI and an optional box photo (on Drive)', 'สแกนเก็บ IMEI และรูปกล่อง (ถ้ามี) บน Drive'),
      t('Judged ผ่าน / ไม่ผ่าน / ตรวจใหม่; recheck deletes the scan', 'ตัดสิน ผ่าน / ไม่ผ่าน / ตรวจใหม่; ตรวจใหม่ลบรายการสแกน')] },
    { dot: 'emerald', title: t('Rules', 'กฎ'), items: [
      t('One active session per branch per day', 'หนึ่งสาขามีรอบที่ยังไม่จบได้รอบเดียวต่อวัน'),
      t('Closing is blocked while any item awaits a verdict', 'ปิดรอบไม่ได้ถ้ายังมีรายการรอตัดสิน'),
      t('Counts devices only (unit เครื่อง)', 'นับเฉพาะหน่วย เครื่อง')] },
    { dot: 'amber', title: t('Effect', 'ผลลัพธ์'), items: [
      t('The audit does not change stock_balances', 'การตรวจนับไม่ปรับ stock_balances')] }
  ]
}));

require('./dataflows.js')(add, src, API);

// ---------------------------------------------------------------- write
const only = process.argv[2];
const manifest = [];
for (const d of diagrams) {
  if (only && d.id !== only) continue;
  for (const lang of ['en', 'th']) {
    const t = (en, th) => (lang === 'en' ? en : th);
    const j = d.build(t);
    if (d.id === 'pos-sale') j.nodes.forEach(n => { n.width = Math.max(n.width || 0, 156); });
    j.meta.output = `${rel}/${d.id}.${lang}.html`;
    j.meta.quality_profile = 'showcase';
    j.meta.repository = REPO;
    if (lang === 'en') j.meta.locale = 'en'; else j.meta.legend = TH_LEGEND[d.type];
    fs.writeFileSync(path.join(dir, `${d.id}.${lang}.json`), JSON.stringify(j, null, 2));
  }
  manifest.push({ id: d.id, type: d.type });
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(diagrams.map(d => ({ id: d.id, type: d.type })), null, 2));
console.log(manifest.map(m => `${m.id}(${m.type})`).join(' '));
