// แผนภาพภาพรวมการทำงาน — ใช้เฉพาะคำที่เห็นบนเว็บ (ชื่อเมนู กลุ่มเมนู สิทธิ์ สถานะ)
const fs = require('fs'), path = require('path');
const dir = __dirname;
const rel = path.relative(process.cwd(), dir).split(path.sep).join('/');

const LEG = {
  arch: { mode: 'auto', entries: { frontend: { label: 'หน้าที่ผู้ใช้เห็น' }, backend: { label: 'ขั้นตอนของระบบ' }, database: { label: 'ข้อมูลที่ถูกบันทึก' }, cloud: { label: 'ภาพรวม' }, security: { label: 'ตรวจสอบ / สิทธิ์' }, messagebus: { label: 'ขั้นตอนระหว่างกัน' }, external: { label: 'ผู้ใช้งาน' } } },
  groups: { mode: 'auto', entries: { frontend: { label: 'การขายและลูกค้า' }, backend: { label: 'สต็อกและคลังสินค้า' }, messagebus: { label: 'การสั่งซื้อและรับสินค้า' }, database: { label: 'บัญชีและการเงิน' }, security: { label: 'ตั้งค่าระบบ' }, cloud: { label: 'ภาพรวม' }, external: { label: 'ผู้ใช้งาน' } } }
};
const LEG_EN = {
  groups: { mode: 'auto', entries: { frontend: { label: 'Sales & customers' }, backend: { label: 'Stock & warehouse' }, messagebus: { label: 'Purchasing & receiving' }, database: { label: 'Accounting & finance' }, security: { label: 'System settings' }, cloud: { label: 'Overview' }, external: { label: 'People' } } }
};

const diagrams = [];
const add = (id, type, build) => diagrams.push({ id, type, build });

// ============================================================ 1 ภาพรวมกลุ่มเมนู
add('overview', 'architecture', (t) => ({
  schema_version: 1, diagram_type: 'architecture',
  meta: { title: t('How the menu groups connect', 'กลุ่มเมนูทั้งหมดเชื่อมกันอย่างไร') },
  components: [
    { id: 'settings', type: 'security', label: t('System settings', 'ตั้งค่าระบบ'), sublabel: t('Staff · Branches · Permissions', 'พนักงาน · สาขา · สิทธิ์'), pos: [40, 150], size: [160, 64] },
    { id: 'dash', type: 'cloud', label: t('Overview', 'ภาพรวม'), sublabel: t('Dashboard', 'แดชบอร์ด'), pos: [290, 150], size: [160, 64] },
    { id: 'user', type: 'external', label: t('Staff', 'พนักงาน'), sublabel: t('Logs in with staff ID', 'เข้าสู่ระบบด้วยรหัสพนักงาน'), pos: [40, 300], size: [160, 64] },
    { id: 'sales', type: 'frontend', label: t('Sales & customers', 'การขายและลูกค้า'), sublabel: t('Sales · Deposits · Members', 'รายการขาย · มัดจำ · สมาชิก'), pos: [290, 300], size: [160, 64] },
    { id: 'stock', type: 'backend', label: t('Stock & warehouse', 'สต็อกและคลังสินค้า'), sublabel: t('Stock · Daily count', 'จัดการสต็อก · ตรวจนับ'), pos: [540, 300], size: [160, 64] },
    { id: 'po', type: 'messagebus', label: t('Purchasing & receiving', 'การสั่งซื้อและรับสินค้า'), sublabel: t('PO · Transfers · Receiving', 'PO · โอนย้าย · ตรวจรับ'), pos: [790, 300], size: [160, 64] },
    { id: 'acct', type: 'database', label: t('Accounting & finance', 'บัญชีและการเงิน'), sublabel: t('Order verification · Accounts', 'ตรวจสอบออเดอร์ · บัญชี'), pos: [540, 450], size: [160, 64] }
  ],
  connections: [
    { id: 'c-role', from: 'settings', to: 'user', label: t('role + permissions', 'บทบาท · สิทธิ์'), variant: 'security', fromSide: 'bottom', toSide: 'top' },
    { id: 'c-sell', from: 'user', to: 'sales', label: t('sell', 'ขายสินค้า'), variant: 'emphasis' },
    { id: 'c-sum', from: 'sales', to: 'dash', label: t('sales totals', 'สรุปยอดขาย'), variant: 'dashed', fromSide: 'top', toSide: 'bottom' },
    { id: 'c-cut', from: 'sales', to: 'stock', label: t('stock goes down', 'สต็อกลดลง'), variant: 'emphasis' },
    { id: 'c-recv', from: 'po', to: 'stock', label: t('goods received', 'ของเข้าสต็อก'), variant: 'emphasis' },
    { id: 'c-verify', from: 'sales', to: 'acct', label: t('verify orders', 'ตรวจสอบออเดอร์'), fromSide: 'bottom', toSide: 'left' },
    { id: 'c-pay', from: 'po', to: 'acct', label: t('pay PO', 'จ่ายเงิน PO'), fromSide: 'bottom', toSide: 'right' }
  ],
  cards: [
    { dot: 'cyan', title: t('Selling', 'ฝั่งขาย'), items: [
      t('A sale in Sales lowers stock in that branch', 'ขายในรายการขาย จำนวนสินค้าในสาขานั้นลดลง'),
      t('Every sale then waits for Order verification', 'ทุกบิลขายไปรอที่ตรวจสอบออเดอร์'),
      t('Dashboard and Daily sales summary read the sales', 'แดชบอร์ดและสรุปยอดขายรายวันอ่านจากบิลขาย')] },
    { dot: 'emerald', title: t('Buying', 'ฝั่งซื้อ'), items: [
      t('Goods arrive via PO, Arrival report and Goods receiving', 'ของเข้าผ่าน PO → แจ้งของถึงสาขา → ตรวจรับของเข้า'),
      t('Branch transfers move stock between branches', 'โอนย้ายสินค้าระหว่างสาขา ย้ายสต็อกจากสาขาหนึ่งไปอีกสาขา'),
      t('PO payments are tracked in Accounting & finance', 'การจ่ายเงิน PO ไปอยู่ในบัญชีและการเงิน')] },
    { dot: 'rose', title: t('Who sees what', 'ใครเห็นอะไร'), items: [
      t('Roles and permissions decide which menus appear', 'บทบาทและสิทธิ์กำหนดว่าเห็นเมนูไหน'),
      t('Every important action is kept in Activity log', 'ทุกการกระทำสำคัญถูกเก็บใน ประวัติกิจกรรมระบบ')] }
  ]
}));

// ============================================================ 2 บทบาท สิทธิ์ เมนู
add('roles', 'architecture', (t) => ({
  schema_version: 1, diagram_type: 'architecture',
  meta: { title: t('Roles, permissions and menus', 'บทบาท สิทธิ์ และเมนู เชื่อมกันอย่างไร') },
  components: [
    { id: 'emp', type: 'external', label: t('Staff member', 'พนักงาน'), sublabel: t('Staff: set role + branch', 'จัดการพนักงาน'), pos: [40, 300], size: [160, 64] },
    { id: 'role', type: 'security', label: t('Role', 'บทบาท'), sublabel: t('Admin · Manager · Sales', 'แอดมิน · ผู้จัดการ · พนักงานขาย'), pos: [290, 300], size: [160, 64] },
    { id: 'perm', type: 'security', label: t('Permissions', 'สิทธิ์ใช้งาน'), sublabel: t('Roles & permissions', 'จัดการสิทธิ์ใช้งาน'), pos: [540, 300], size: [160, 64] },
    { id: 'menu', type: 'frontend', label: t('Menus shown', 'เมนูที่เห็น'), sublabel: t('hidden if no permission', 'ไม่มีสิทธิ์ = ไม่เห็นเมนู'), pos: [790, 300], size: [160, 64] },
    { id: 'branch', type: 'database', label: t('Branch', 'สาขา'), sublabel: t('Branches: staff belong to one', 'จัดการสาขา'), pos: [40, 450], size: [160, 64] },
    { id: 'data', type: 'backend', label: t('Data shown', 'ข้อมูลที่เห็น'), sublabel: t('own branch or all branches', 'สาขาตนเอง หรือทุกสาขา'), pos: [790, 450], size: [160, 64] }
  ],
  connections: [
    { id: 'r-has', from: 'emp', to: 'role', label: t('has', 'มีบทบาท') },
    { id: 'r-gets', from: 'role', to: 'perm', label: t('gets', 'ได้สิทธิ์'), variant: 'security' },
    { id: 'r-open', from: 'perm', to: 'menu', label: t('opens', 'เปิดเมนู'), variant: 'emphasis' },
    { id: 'r-in', from: 'emp', to: 'branch', label: t('works at', 'สังกัดสาขา'), fromSide: 'bottom', toSide: 'top' },
    { id: 'r-scope', from: 'perm', to: 'data', label: t('branch filter', 'กรองสาขา'), variant: 'security', fromSide: 'bottom', toSide: 'left' },
    { id: 'r-show', from: 'menu', to: 'data', label: t('shows', 'แสดงข้อมูล'), fromSide: 'bottom', toSide: 'top' },
    { id: 'r-own', from: 'branch', to: 'data', label: t('own branch', 'สาขาของตน'), variant: 'dashed' }
  ],
  cards: [
    { dot: 'rose', title: t('Admin (แอดมิน)', 'แอดมิน'), items: [
      t('Every menu, every branch', 'ทุกเมนู ทุกสาขา')] },
    { dot: 'amber', title: t('Manager (ผู้จัดการ)', 'ผู้จัดการ'), items: [
      t('Every menu except Roles & permissions, Import approval, Database management', 'ทุกเมนู ยกเว้น จัดการสิทธิ์ใช้งาน · ตรวจสอบนำเข้า · จัดการฐานข้อมูล'),
      t('Sees all branches', 'เห็นข้อมูลทุกสาขา')] },
    { dot: 'cyan', title: t('Sales staff (พนักงานขาย)', 'พนักงานขาย'), items: [
      t('Daily sales summary, Sales, Members, Warranty check, Sales history, Deposits', 'สรุปยอดขายรายวัน · รายการขาย · สมาชิก · เช็คประกัน · ประวัติการขาย · การมัดจำสินค้า'),
      t('Stock management, Stock issue, Movement history, Daily stock count', 'จัดการสต็อก · จ่ายออกสินค้า · ประวัติการเคลื่อนไหว · ตรวจนับสต็อกประจำวัน'),
      t('Arrival report, Goods receiving', 'แจ้งของถึงสาขา · ตรวจรับของเข้า'),
      t('Own branch only', 'เห็นเฉพาะสาขาของตน')] },
    { dot: 'emerald', title: t('Custom roles', 'บทบาทที่สร้างเอง'), items: [
      t('Tick permissions one by one in Roles & permissions', 'ติ๊กสิทธิ์ทีละข้อใน จัดการสิทธิ์ใช้งาน'),
      t('The same page can show every branch for one role', 'เปิดสิทธิ์ กรองสาขาในเมนู จัดการสต็อก เพื่อดูทุกสาขา')] }
  ]
}));

// ============================================================ 3 ขายสินค้า
add('sell', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('Selling a product', 'การขายสินค้า') },
  lanes: [
    { id: 'sales', label: t('Sales staff · Sales', 'พนักงานขาย · รายการขาย') },
    { id: 'stock', label: t('Stock & warehouse', 'สต็อกและคลังสินค้า') },
    { id: 'acct', label: t('Accounting & finance', 'บัญชีและการเงิน') }
  ],
  mainPath: ['pick', 'pay', 'cut', 'bill', 'verify', 'books'],
  nodes: [
    { id: 'pick', lane: 'sales', col: 0, type: 'external', label: t('Pick products', 'เลือกสินค้า'), sublabel: t('scan IMEI or search', 'สแกน IMEI หรือค้นหา') },
    { id: 'pay', lane: 'sales', col: 1, type: 'frontend', label: t('Choose payment', 'เลือกการชำระเงิน'), sublabel: t('cash or financing', 'ซื้อสด / จัดไฟแนนซ์') },
    { id: 'bill', lane: 'sales', col: 3, type: 'frontend', label: t('Receipt', 'ใบเสร็จ'), sublabel: t('Sales history', 'ประวัติการขาย') },
    { id: 'cut', lane: 'stock', col: 2, type: 'backend', label: t('Stock goes down', 'จำนวนสินค้าลดลง'), sublabel: t('Branch inventory', 'สินค้าในสาขา') },
    { id: 'log', lane: 'stock', col: 3, type: 'database', label: t('Movement recorded', 'บันทึกการเคลื่อนไหว'), sublabel: t('Movement history', 'ประวัติการเคลื่อนไหว') },
    { id: 'verify', lane: 'acct', col: 4, type: 'security', label: t('Order verification', 'ตรวจสอบออเดอร์'), sublabel: t('ชำระแล้ว / ยังไม่ชำระ', 'ชำระแล้ว / ยังไม่ชำระ') },
    { id: 'books', lane: 'acct', col: 5, type: 'database', label: t('Accounting & finance', 'บัญชีและการเงิน'), sublabel: t('financing = receivable', 'จัดไฟแนนซ์ = ลูกหนี้') }
  ],
  edges: [
    { id: 'e1', from: 'pick', to: 'pay' },
    { id: 'e2', from: 'pay', to: 'cut', label: t('confirm sale', 'ยืนยันการขาย'), variant: 'emphasis' },
    { id: 'e3', from: 'cut', to: 'bill', label: t('receipt', 'ออกใบเสร็จ'), variant: 'emphasis' },
    { id: 'e4', from: 'bill', to: 'verify', label: t('to verify', 'ไปตรวจสอบ') },
    { id: 'e5', from: 'verify', to: 'books', variant: 'emphasis' },
    { id: 'e6', from: 'cut', to: 'log', variant: 'dashed', role: 'branch' }
  ],
  cards: [
    { dot: 'emerald', title: t('Related menus', 'เมนูที่เกี่ยวข้อง'), items: [
      t('Members: attach a member to the sale', 'สมาชิก: ผูกสมาชิกกับบิลขาย'),
      t('Deposits: deduct a deposit while selling', 'การมัดจำสินค้า: หักมัดจำตอนขาย'),
      t('Daily sales summary + Dashboard add up the sales', 'สรุปยอดขายรายวัน และ แดชบอร์ด รวมยอดจากบิลขาย')] },
    { dot: 'amber', title: t('Cancelling', 'การยกเลิก'), items: [
      t('Needs the permission "Cancel sale" and a reason', 'ต้องมีสิทธิ์ ยกเลิกบิลขาย และระบุเหตุผล'),
      t('The product goes back into stock', 'สินค้ากลับเข้าสต็อกของสาขา')] }
  ]
}));

// ============================================================ 4 สั่งซื้อ
add('buy', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('Ordering and receiving goods (PO)', 'การสั่งซื้อและรับสินค้า (PO)') },
  lanes: [
    { id: 'buyer', label: t('Purchasing · Purchase orders (PO)', 'ฝ่ายสั่งซื้อ · ระบบสั่งซื้อ (PO)') },
    { id: 'branch', label: t('Branch', 'สาขา') },
    { id: 'stock', label: t('Stock & warehouse', 'สต็อกและคลังสินค้า') }
  ],
  mainPath: ['create', 'arrive', 'scan', 'in'],
  nodes: [
    { id: 'create', lane: 'buyer', col: 0, type: 'frontend', label: t('Create PO', 'สร้างใบสั่งซื้อ'), sublabel: t('status รอจัดส่ง', 'สถานะ รอจัดส่ง') },
    { id: 'pay', lane: 'buyer', col: 4, type: 'security', label: t('Pay the PO', 'จ่ายเงินใบสั่งซื้อ'), sublabel: t('การชำระเงินระบบสั่งซื้อ', 'การชำระเงินระบบสั่งซื้อ') },
    { id: 'arrive', lane: 'branch', col: 1, type: 'frontend', label: t('Arrival report', 'แจ้งของถึงสาขา'), sublabel: t('status ของถึงสาขาแล้ว', 'สถานะ ของถึงสาขาแล้ว') },
    { id: 'scan', lane: 'branch', col: 2, type: 'frontend', label: t('Goods receiving', 'ตรวจรับของเข้า'), sublabel: t('scan IMEI · check qty', 'สแกน IMEI · นับจำนวน') },
    { id: 'in', lane: 'stock', col: 3, type: 'backend', label: t('Stock goes up', 'สินค้าเข้าสต็อก'), sublabel: t('status นำเข้าสำเร็จ', 'สถานะ นำเข้าสำเร็จ') }
  ],
  edges: [
    { id: 'b1', from: 'create', to: 'arrive', label: t('goods shipped', 'ของถูกส่งมา'), variant: 'emphasis' },
    { id: 'b2', from: 'arrive', to: 'scan', label: t('scan', 'สแกน') },
    { id: 'b3', from: 'scan', to: 'in', label: t('confirm', 'ยืนยัน'), variant: 'emphasis' },
    { id: 'b4', from: 'create', to: 'pay', label: t('pay when due', 'จ่ายตามกำหนด'), variant: 'dashed', role: 'branch' }
  ],
  cards: [
    { dot: 'cyan', title: t('Good to know', 'ควรรู้'), items: [
      t('Part of the goods arrived: the PO goes back to รอจัดส่ง for the rest', 'รับของไม่ครบ: ใบสั่งซื้อกลับไป รอจัดส่ง เพื่อรอของที่เหลือ'),
      t('A PO can be edited or cancelled only before goods ship', 'แก้ไขหรือยกเลิกใบสั่งซื้อได้เฉพาะก่อนของถูกส่ง'),
      t('Paying is separate from receiving; it needs its own permission', 'การจ่ายเงินแยกจากการรับของ และต้องมีสิทธิ์การชำระเงินระบบสั่งซื้อ')] },
    { dot: 'amber', title: t('Goods without a PO', 'ของที่ไม่มี PO'), items: [
      t('Branch reports them; a manager approves in Import approval', 'สาขาแจ้งเอง แล้วผู้มีสิทธิ์อนุมัติที่ ตรวจสอบนำเข้า')] }
  ]
}));

// ============================================================ 5 โอนย้าย
add('transfer', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('Branch transfers', 'โอนย้ายสินค้าระหว่างสาขา') },
  lanes: [
    { id: 'src', label: t('Source branch', 'สาขาต้นทาง') },
    { id: 'dst', label: t('Destination branch', 'สาขาปลายทาง') },
    { id: 'hist', label: t('Movement history', 'ประวัติการเคลื่อนไหว') }
  ],
  mainPath: ['create', 'wait', 'recv', 'log'],
  nodes: [
    { id: 'create', lane: 'src', col: 0, type: 'frontend', label: t('Create transfer', 'สร้างรายการโอนย้าย'), sublabel: t('pick branch + scan IMEI', 'เลือกสาขา + สแกน IMEI') },
    { id: 'cancel', lane: 'src', col: 3, type: 'security', label: t('Cancel transfer', 'ยกเลิกการโอนย้าย'), sublabel: t('status ยกเลิกแล้ว', 'สถานะ ยกเลิกแล้ว') },
    { id: 'wait', lane: 'dst', col: 1, type: 'messagebus', label: t('Waiting', 'รอดำเนินการ'), sublabel: t('shown as a notice', 'มีแจ้งเตือนที่สาขาปลายทาง') },
    { id: 'recv', lane: 'dst', col: 2, type: 'frontend', label: t('Confirm receipt', 'ยืนยันรับเข้า'), sublabel: t('status รับเข้าแล้ว', 'สถานะ รับเข้าแล้ว') },
    { id: 'log', lane: 'hist', col: 3, type: 'database', label: t('Recorded', 'บันทึกประวัติ'), sublabel: t('sent · received · cancelled', 'ส่งโอน · รับโอน · ยกเลิก') }
  ],
  edges: [
    { id: 't1', from: 'create', to: 'wait', label: t('send', 'ส่งไป'), variant: 'emphasis' },
    { id: 't2', from: 'wait', to: 'recv', label: t('arrives', 'ของถึง'), variant: 'emphasis' },
    { id: 't3', from: 'recv', to: 'log', variant: 'dashed' },
    { id: 't4', from: 'wait', to: 'cancel', label: t('before receipt', 'ก่อนรับเข้า'), variant: 'security', role: 'error' }
  ],
  cards: [
    { dot: 'cyan', title: t('Who does what', 'ใครทำอะไร'), items: [
      t('Source branch creates and may cancel while waiting', 'สาขาต้นทางสร้างรายการ และยกเลิกได้ตอนรอดำเนินการ'),
      t('Destination branch confirms receipt', 'สาขาปลายทางเป็นผู้ยืนยันรับเข้า'),
      t('Admin and Manager can do either for any branch', 'แอดมินและผู้จัดการทำแทนได้ทุกสาขา')] },
    { dot: 'emerald', title: t('Stock', 'สต็อก'), items: [
      t('Stock leaves the source when the transfer is created', 'สต็อกออกจากต้นทางทันทีที่สร้างรายการ'),
      t('It joins the destination when received; cancelling returns it', 'เข้าปลายทางเมื่อรับเข้า; ถ้ายกเลิกจะกลับต้นทาง'),
      t('You can add a note (หมายเหตุ); it shows in ประวัติทั้งหมด', 'ใส่หมายเหตุได้ และเห็นใน ประวัติทั้งหมด')] }
  ]
}));

// ============================================================ 6 มัดจำ
add('deposit', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('Deposits', 'การมัดจำสินค้า') },
  lanes: [
    { id: 'dep', label: t('Deposits', 'การมัดจำสินค้า') },
    { id: 'sale', label: t('Sales', 'รายการขาย') },
    { id: 'no', label: t('Cancelled', 'ยกเลิก'), variant: 'exception' }
  ],
  mainPath: ['take', 'wait', 'done'],
  nodes: [
    { id: 'take', lane: 'dep', col: 0, type: 'frontend', label: t('Take a deposit', 'รับเงินมัดจำ'), sublabel: t('customer + product + amount', 'ลูกค้า + สินค้า + ยอดมัดจำ') },
    { id: 'wait', lane: 'dep', col: 1, type: 'messagebus', label: t('Waiting', 'รอดำเนินการ'), sublabel: t('รอลูกค้ารับเครื่อง ฯลฯ', 'รอลูกค้ารับเครื่อง ฯลฯ') },
    { id: 'done', lane: 'dep', col: 4, type: 'database', label: t('Completed', 'สำเร็จ'), sublabel: t('linked to a bill number', 'ผูกกับเลขบิลขาย') },
    { id: 'apply', lane: 'sale', col: 3, type: 'frontend', label: t('Use deposit in a sale', 'หักมัดจำในรายการขาย'), sublabel: t('pay the rest', 'จ่ายส่วนที่เหลือ') },
    { id: 'cancel', lane: 'no', col: 2, type: 'security', label: t('Cancel deposit', 'ยกเลิกใบมัดจำ'), sublabel: t('with a reason', 'ระบุเหตุผล') }
  ],
  edges: [
    { id: 'd1', from: 'take', to: 'wait', variant: 'emphasis' },
    { id: 'd2', from: 'wait', to: 'done', label: t('hand over', 'ส่งมอบสินค้า'), variant: 'emphasis' },
    { id: 'd3', from: 'wait', to: 'apply', label: t('or sell', 'หรือขาย'), variant: 'dashed', role: 'branch' },
    { id: 'd4', from: 'apply', to: 'done', variant: 'dashed', role: 'branch' },
    { id: 'd5', from: 'wait', to: 'cancel', variant: 'security', role: 'error' }
  ],
  cards: [
    { dot: 'cyan', title: t('Good to know', 'ควรรู้'), items: [
      t('While waiting, the deposit can still be edited', 'ระหว่างรอดำเนินการ แก้ไขใบมัดจำได้'),
      t('Four waiting steps: waiting for the customer, a transfer, goods, or purchasing', 'ขั้นย่อย: รอลูกค้ารับเครื่อง · รอโอนย้ายจากสาขาอื่น · รอสินค้าเข้า · รอฝ่ายจัดซื้อสั่งสินค้า'),
      t('Order verification has a Deposits tab for accounting', 'ตรวจสอบออเดอร์ มีแท็บมัดจำให้ฝ่ายบัญชีดู')] }
  ]
}));

// ============================================================ 7 ตรวจนับ
add('count', 'workflow', (t) => ({
  schema_version: 2, diagram_type: 'workflow',
  meta: { title: t('Daily stock count', 'ตรวจนับสต็อกประจำวัน') },
  lanes: [
    { id: 'branch', label: t('Branch staff · Daily stock count', 'พนักงานสาขา · ตรวจนับสต็อกประจำวัน') },
    { id: 'team', label: t('Stock team · Stock count review', 'ทีมสต็อก · ตรวจสอบผลสต็อก') }
  ],
  mainPath: ['open', 'scan', 'send', 'review', 'close'],
  nodes: [
    { id: 'open', lane: 'branch', col: 0, type: 'backend', label: t('Round opens', 'เปิดรอบตรวจนับ'), sublabel: t('every day, per branch', 'ทุกวัน แยกตามสาขา') },
    { id: 'scan', lane: 'branch', col: 1, type: 'frontend', label: t('Scan devices', 'สแกนเครื่อง'), sublabel: t('IMEI + box photo', 'IMEI + รูปกล่อง') },
    { id: 'send', lane: 'branch', col: 2, type: 'frontend', label: t('Send for review', 'ส่งตรวจ'), sublabel: t('status รอการอนุมัติ', 'สถานะ รอการอนุมัติ') },
    { id: 'review', lane: 'team', col: 3, type: 'security', label: t('Check each item', 'ตรวจทีละรายการ'), sublabel: t('ผ่าน / ไม่ผ่าน / ตรวจใหม่', 'ผ่าน / ไม่ผ่าน / ตรวจใหม่') },
    { id: 'close', lane: 'team', col: 4, type: 'database', label: t('Close the round', 'ปิดรอบ'), sublabel: t('status อนุมัติแล้ว', 'สถานะ อนุมัติแล้ว') }
  ],
  edges: [
    { id: 'k1', from: 'open', to: 'scan', variant: 'emphasis' },
    { id: 'k2', from: 'scan', to: 'send', variant: 'emphasis' },
    { id: 'k3', from: 'send', to: 'review', variant: 'emphasis' },
    { id: 'k4', from: 'review', to: 'close', label: t('all judged', 'ตัดสินครบ'), variant: 'emphasis' },
    { id: 'k5', from: 'review', to: 'scan', label: t('scan again', 'ตรวจใหม่'), variant: 'dashed', role: 'return' }
  ],
  cards: [
    { dot: 'cyan', title: t('Good to know', 'ควรรู้'), items: [
      t('Counts devices only, compared with the branch inventory', 'นับเฉพาะเครื่อง เทียบกับสินค้าในสาขา'),
      t('A round cannot close while any item is still waiting for a verdict', 'ปิดรอบไม่ได้ถ้ายังมีรายการรอตัดสิน'),
      t('The count itself does not change stock quantities', 'การตรวจนับไม่ได้ปรับจำนวนสต็อก')] }
  ]
}));

// ============================================================ write
const only = process.argv[2];
for (const d of diagrams) {
  if (only && d.id !== only) continue;
  for (const lang of ['en', 'th']) {
    const t = (en, th) => (lang === 'en' ? en : th);
    const j = d.build(t);
    if (d.type === 'workflow') j.nodes.forEach(n => { n.width = Math.max(n.width || 0, 160); });
    j.meta.output = `${rel}/${d.id}.${lang}.html`;
    j.meta.quality_profile = 'showcase';
    if (lang === 'en') j.meta.locale = 'en';
    if (d.id === 'overview') j.meta.legend = lang === 'en' ? LEG_EN.groups : LEG.groups;
    else if (lang === 'th') j.meta.legend = LEG.arch;
    fs.writeFileSync(path.join(dir, `${d.id}.${lang}.json`), JSON.stringify(j, null, 2));
  }
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(diagrams.map(d => ({ id: d.id, type: d.type })), null, 2));
console.log(diagrams.map(d => d.id + '(' + d.type + ')').join(' '));
