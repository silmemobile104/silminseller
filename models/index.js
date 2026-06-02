const mongoose = require('mongoose');
const Member = require('./member');

// 1. Branch (สาขา)
const branchSchema = new mongoose.Schema({
    name: { type: String, required: true }, // ชื่อสาขา
    address: { type: String } // ที่อยู่
}, { timestamps: true });
const Branch = mongoose.model('Branch', branchSchema, 'branch');

// 2. Role (ระดับสิทธิ์ & Permissions)
const roleSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // ชื่อตำแหน่ง
    permissions: {
        view_dashboard: { type: Boolean, default: false },   // อนุญาตให้ดูแดชบอร์ด
        manage_stock: { type: Boolean, default: false },     // อนุญาตให้จัดการสต็อก
        delete_stock: { type: Boolean, default: false },     // อนุญาตให้ลบสินค้า
        do_pos: { type: Boolean, default: false },           // อนุญาตให้ขายสินค้า (POS)
        manage_personnel: { type: Boolean, default: false }, // อนุญาตให้จัดการพนักงาน
        manage_branches: { type: Boolean, default: false },  // อนุญาตให้จัดการสาขา
        manage_settings: { type: Boolean, default: false },  // อนุญาตให้ตั้งค่าระบบ
        manage_roles: { type: Boolean, default: false },      // อนุญาตให้จัดการสิทธิ์
        filter_stock_branch: { type: Boolean, default: false }, // อนุญาตกรองสาขาในเมนูจัดการสต็อก
        cancel_sale: { type: Boolean, default: false },      // อนุญาตให้ยกเลิกบิลขาย
        report_arrival: { type: Boolean, default: false },   // แจ้งของถึงสาขา
        approve_import: { type: Boolean, default: false },   // อนุมัตินำเข้าสต็อก
        manage_po: { type: Boolean, default: false },        // จัดการ PO (สร้าง/ดูทั้งหมด)
        receive_po: { type: Boolean, default: false },       // ตรวจรับ PO (ที่สาขา)
        manage_transfers: { type: Boolean, default: false }, // โอนย้ายสินค้า
        manage_finance: { type: Boolean, default: false },   // อนุญาตให้จัดการระบบบัญชีและการเงิน
        view_audit_logs: { type: Boolean, default: false }   // อนุญาตดูประวัติกิจกรรมระบบ
    }
}, { timestamps: true });
const Role = mongoose.model('Role', roleSchema, 'role');

// Seed Default Roles (สร้างข้อมูลสิทธิ์เริ่มต้น)
const seedDefaultRoles = async () => {
    const defaults = [
        {
            name: 'แอดมิน',
            permissions: {
                view_dashboard: true, manage_stock: true, delete_stock: true,
                do_pos: true, manage_personnel: true, manage_branches: true,
                manage_settings: true, manage_roles: true, filter_stock_branch: true, cancel_sale: true,
                report_arrival: true, approve_import: true, manage_po: true, receive_po: true,
                manage_transfers: true, manage_finance: true, view_audit_logs: true
            }
        },
        {
            name: 'ผู้จัดการ',
            permissions: {
                view_dashboard: true, manage_stock: true, delete_stock: true,
                do_pos: true, manage_personnel: true, manage_branches: true,
                manage_settings: true, manage_roles: false, filter_stock_branch: true, cancel_sale: true,
                report_arrival: true, approve_import: false, manage_po: true, receive_po: true,
                manage_transfers: true, manage_finance: true, view_audit_logs: true
            }
        },
        {
            name: 'พนักงานขาย',
            permissions: {
                view_dashboard: false, manage_stock: true, delete_stock: false,
                do_pos: true, manage_personnel: false, manage_branches: false,
                manage_settings: false, manage_roles: false, filter_stock_branch: false, cancel_sale: false,
                report_arrival: true, approve_import: false, manage_po: false, receive_po: true,
                manage_transfers: false, manage_finance: false, view_audit_logs: false
            }
        }
    ];

    let inserted = 0;
    let updated = 0;
    for (const r of defaults) {
        const existing = await Role.findOne({ name: r.name });
        if (!existing) {
            await Role.create(r);
            inserted++;
        } else {
            let changed = false;
            for (const key of Object.keys(r.permissions)) {
                if (existing.permissions[key] === undefined || existing.permissions[key] === null) {
                    existing.permissions[key] = r.permissions[key];
                    changed = true;
                }
            }
            // Always ensure Admin has all true just in case
            if (r.name === 'แอดมิน') {
                existing.permissions.report_arrival = true;
                existing.permissions.approve_import = true;
                existing.permissions.manage_po = true;
                existing.permissions.receive_po = true;
                existing.permissions.manage_transfers = true;
                existing.permissions.manage_finance = true;
                existing.permissions.view_audit_logs = true;
                changed = true;
            }
            if (changed) {
                await existing.save();
                updated++;
            }
        }
    }
    if (inserted > 0 || updated > 0) {
        console.log(`[SEED] จัดการข้อมูลระดับสิทธิ์เริ่มต้นสำเร็จ (เพิ่ม: ${inserted}, อัพเดท: ${updated})`);
    }
};

// 3. Employee (พนักงาน)
const employeeSchema = new mongoose.Schema({
    name: { type: String, required: true }, // ชื่อ-นามสกุล
    emp_id: { type: String, required: true, unique: true }, // รหัสพนักงาน (ใช้เป็น username)
    password: { type: String, required: true }, // รหัสผ่าน (hashed with bcrypt)
    role: { type: String, default: 'พนักงานขาย' }, // ระดับสิทธิ์ (ดึงจาก Role collection)
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' } // สังกัดสาขา
}, { timestamps: true });
const Employee = mongoose.model('Employee', employeeSchema, 'employee');

// 4. ProductType (ประเภทสินค้า: iPhone, iPad, อุปกรณ์เสริม)
const productTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductType = mongoose.model('ProductType', productTypeSchema, 'producttype');

// 5. ProductUnit (หน่วยนับ: เครื่อง, ชิ้น)
const productUnitSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductUnit = mongoose.model('ProductUnit', productUnitSchema, 'productunit');

// 6. ProductColor (สี: ดำ, ขาว, เทา)
const productColorSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductColor = mongoose.model('ProductColor', productColorSchema, 'productcolor');

// 7. ProductCapacity (ความจุ: 64GB, 128GB...)
const productCapacitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductCapacity = mongoose.model('ProductCapacity', productCapacitySchema, 'productcapacity');

// 8. ProductCondition (สภาพ: มือ1, มือ2)
const productConditionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductCondition = mongoose.model('ProductCondition', productConditionSchema, 'productcondition');

// 9. ProductName (ชื่อสินค้า)
const productNameSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    code: { type: String }
});
const ProductName = mongoose.model('ProductName', productNameSchema, 'productname');

// 10. Supplier (ผู้จัดจำหน่าย)
const supplierSchema = new mongoose.Schema({
    name: { type: String, required: true }
}, { timestamps: true });
const Supplier = mongoose.model('Supplier', supplierSchema, 'supplier');

// 11. Product (ข้อมูลสินค้าหลัก)
const productSchema = new mongoose.Schema({
    product_code: { type: String, index: true }, // รหัสสินค้า / SKU
    supplier_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' }, // ผู้จัดจำหน่าย
    name: { type: String, required: true }, // ชื่อสินค้า
    cost_price: { type: Number, required: true }, // ราคาต้นทุน
    selling_price: { type: Number, required: true }, // ราคาขาย

    // Reference IDs (เชื่อมโยงกับ Master Data)
    type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductType', required: true },
    unit_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductUnit' },
    color_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductColor' },
    capacity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCapacity' },
    condition_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductCondition' },

    // ERP: Stock per branch (คงเหลือแยกตามสาขา)
    stock_balances: [{
        branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
        quantity: { type: Number, default: 0 },
        imeis: [{ type: String }]
    }]

}, { timestamps: true });
const Product = mongoose.model('Product', productSchema, 'product');

// 11.1 Movement Ledger (บันทึกการเคลื่อนไหวสินค้า)
const movementSchema = new mongoose.Schema({
    product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    imei: { type: String, default: '' },
    action: { type: String, required: true },
    from_branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    to_branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    reference_no: { type: String, default: '' },
    transit_hours: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });
const Movement = mongoose.model('Movement', movementSchema, 'movement');

// Auto-migration helper (จะถูกเรียกตอนเริ่มรันเซิร์ฟเวอร์)
async function migrateProductsToERP() {
    const products = await Product.find({ stock_balances: { $exists: false } });
    if (!products || products.length === 0) return;

    for (const p of products) {
        const legacyBranchId = p.branch_id;
        const legacyQty = Number(p.quantity || 0);
        const legacyImeis = Array.isArray(p.imeis) ? p.imeis.map(x => x.toString().trim()).filter(Boolean) : [];

        p.stock_balances = [];
        if (legacyBranchId) {
            p.stock_balances.push({
                branch_id: legacyBranchId,
                quantity: legacyQty,
                imeis: legacyImeis
            });
        }

        p.branch_id = undefined;
        p.quantity = undefined;
        p.imeis = undefined;

        await p.save();
    }

    console.log(`[MIGRATE] ย้ายข้อมูลสินค้าเข้าสู่โครงสร้าง ERP สำเร็จ: ${products.length} รายการ`);
}

// 12. Transaction (รายการขาย)
const transactionSchema = new mongoose.Schema({
    receipt_number: { type: String, required: true, unique: true }, // เลขที่ใบเสร็จ (Auto-generated: INV-วันที่-สุ่ม)
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // สาขาที่ทำรายการ
    member_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', default: null }, // สมาชิกที่ซื้อสินค้า
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // พนักงานที่ทำรายการ
    items: [{
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        product_name: { type: String }, // ชื่อสินค้า
        imei_sold: { type: String, default: '' }, // IMEI ที่ขาย (ถ้ามี)
        quantity: { type: Number, default: 1 }, // จำนวน
        price: { type: Number, default: 0 }, // ราคาต่อชิ้น
        warranty_period: { type: String }, // ระยะเวลาประกัน (เช่น "1 เดือน", "1 ปี")
        warranty_expiry: { type: Date } // วันหมดอายุประกัน
    }],
    total_amount: { type: Number, required: true }, // ยอดรวมทั้งหมด
    payment_method: { type: String, required: true }, // วิธีชำระเงิน: ซื้อสด, จัดไฟแนนซ์ (และ legacy: เงินสด, โอนเงิน)
    down_payment: { type: Number, default: 0 }, // ยอดเงินดาวน์ / รับเงินมา
    // ข้อมูลการชำระเงินแบบละเอียด
    payment_type: { type: String, enum: ['ซื้อสด', 'จัดไฟแนนซ์'], default: 'ซื้อสด' },
    cash_amount: { type: Number, default: 0 }, // เงินสดที่รับมา (กรณีซื้อสด)
    transfer_amount: { type: Number, default: 0 }, // เงินโอนที่รับมา (กรณีซื้อสด)
    finance_company: { type: String, default: '' }, // ชื่อบริษัทไฟแนนซ์
    finance_payment_day: { type: Number, default: 0 }, // ชำระเงินทุกวันที่เท่าไหร่
    finance_months: { type: Number, default: 0 }, // ผ่อนชำระกี่เดือน
    finance_down_payment_cash: { type: Number, default: 0 }, // เงินดาวน์ที่เป็นเงินสด
    finance_down_payment_transfer: { type: Number, default: 0 }, // เงินดาวน์ที่เป็นเงินโอน
    contract_fee: { type: Number, default: 0 }, // ค่าใบสัญญา
    icloud_fee: { type: Number, default: 0 }, // ค่าบริการ iCloud
    status: { type: String, default: 'เสร็จสิ้น', enum: ['เสร็จสิ้น', 'ยกเลิกแล้ว'] }, // สถานะรายการ
    cancel_reason: { type: String }, // เหตุผลที่ยกเลิก
    cancelled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // ผู้ที่กดยกเลิก
    cancelled_at: { type: Date }, // วันที่ยกเลิก
    created_at: { type: Date, default: Date.now } // วันที่ทำรายการ
}, { timestamps: true });
const Transaction = mongoose.model('Transaction', transactionSchema, 'transaction');

// 13. Transfer (โอนย้ายสินค้าระหว่างสาขา)
const transferSchema = new mongoose.Schema({
    transfer_number: { type: String, required: true, unique: true }, // เลขที่โอน (TRF-วันที่-สุ่ม)
    from_branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }, // สาขาต้นทาง
    to_branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true }, // สาขาปลายทาง
    items: [{
        product_name: { type: String, required: true },
        product_code: { type: String, required: true },
        imeis: [{ type: String }],
        quantity: { type: Number, default: 1 }
    }],
    status: { type: String, default: 'รอดำเนินการ' }, // รอดำเนินการ | รับเข้าแล้ว
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });
const Transfer = mongoose.model('Transfer', transferSchema, 'transfer');

// 14. Finance Company (บริษัทจัดไฟแนนซ์)
const financeCompanySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    status: { type: String, default: 'ปกติ' }
}, { timestamps: true });
const FinanceCompany = mongoose.model('FinanceCompany', financeCompanySchema, 'financecompany');

// 15. Import Notification (แจ้งสินค้าเข้า)
const importNotificationSchema = new mongoose.Schema({
    product_name: { type: String, required: true },
    imeis: [{ type: String }],
    color_name: { type: String },
    capacity_name: { type: String },
    type_name: { type: String },
    condition_name: { type: String },
    supplier_name: { type: String },
    unit_name: { type: String },
    notes: { type: String },
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    reported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    status: { type: String, enum: ['รอดำเนินการ', 'อนุมัติแล้ว', 'ปฏิเสธ'], default: 'รอดำเนินการ' },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    approved_at: { type: Date }
}, { timestamps: true });
const ImportNotification = mongoose.model('ImportNotification', importNotificationSchema, 'importnotification');

// 16. Purchase Order (ใบสั่งซื้อ)
const purchaseOrderSchema = new mongoose.Schema({
    po_number: { type: String, required: true, unique: true }, // Auto-generated: PO-YYYYMMDD-XXXX
    supplier_name: { type: String, required: true },
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    status: { type: String, default: 'รอจัดส่ง', enum: ['รอจัดส่ง', 'ของถึงสาขาแล้ว', 'กำลังตรวจรับ', 'นำเข้าสำเร็จ', 'ยกเลิก'] },
    items: [{
        product_name: { type: String, required: true },
        product_code: { type: String, required: true },
        category: { type: String },
        color: { type: String },
        capacity: { type: String },
        unit: { type: String },
        track_imei: { type: Boolean, default: false },
        ordered_qty: { type: Number, required: true },
        received_qty: { type: Number, default: 0 },
        cost_price: { type: Number, required: true },
        selling_price: { type: Number, required: true },
        imeis_scanned: [{ type: String }]
    }],
    arrival_reported_at: { type: Date },
    arrival_reported_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    received_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    payment_status: { type: String, default: 'ยังไม่ได้ชำระ', enum: ['ยังไม่ได้ชำระ', 'ชำระเงินแล้ว'] }
}, { timestamps: true });
const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema, 'purchaseorder');

// 17. Audit Log (บันทึกกิจกรรมพนักงานและประวัติการทำงานระบบ)
const auditLogSchema = new mongoose.Schema({
    action: { type: String, required: true }, // ประเภทการกระทำ e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'CANCEL', 'APPROVE'
    module: { type: String, required: true }, // โมดูลที่ทำรายการ e.g., 'PO', 'STOCK', 'POS', 'MEMBER', 'BRANCH', 'AUTH'
    description: { type: String, required: true }, // รายละเอียดกิจกรรมเป็นข้อความเข้าใจง่าย
    target_id: { type: String, default: null }, // ID ของเอกสารหลักที่เกี่ยวข้อง
    reference_no: { type: String, default: null }, // เลขที่เอกสารอ้างอิง e.g., PO Number, Receipt Number
    details: { type: mongoose.Schema.Types.Mixed, default: null }, // รายละเอียดเพิ่มเติมหรือ Change Snapshot
    ip_address: { type: String, default: null }, // IP Address ผู้ทำรายการ
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, // รหัสพนักงานผู้ทำรายการ
    user_name: { type: String, required: true } // ชื่อพนักงานผู้ทำรายการ
}, { timestamps: true });
const AuditLog = mongoose.model('AuditLog', auditLogSchema, 'auditlog');

// 18. Cash Movement (รายการเงินเคลื่อนไหวในระบบบัญชี)
const cashMovementSchema = new mongoose.Schema({
    transaction_id: { type: String, required: true, unique: true }, // TXN-YYYYMMDD-XXXX
    type: { type: String, required: true, enum: ['รายรับ', 'รายจ่าย'] },
    category: { type: String, required: true, enum: ['ขายสินค้า', 'ซื้อสินค้า (PO)', 'ค่าเช่า', 'ค่าไฟ/น้ำ', 'เงินเดือน', 'อื่นๆ'] },
    amount: { type: Number, required: true },
    reference_id: { type: mongoose.Schema.Types.ObjectId, default: null }, // can refer to PurchaseOrder or Transaction (receipt)
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });
const CashMovement = mongoose.model('CashMovement', cashMovementSchema, 'cashmovement');

// 19. Finance Receivable (ระบบบัญชีลูกหนี้จัดไฟแนนซ์)
const financeReceivableSchema = new mongoose.Schema({
    transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    finance_company: { type: String, required: true },
    total_finance_price: { type: Number, required: true }, // ยอดจัดไฟแนนซ์รวมตั้งต้น
    down_payment: { type: Number, default: 0 }, // เงินดาวน์
    icloud_fee: { type: Number, default: 0 }, // ค่า iCloud
    contract_fee: { type: Number, default: 0 }, // ค่าใบสัญญา
    financed_amount: { type: Number, required: true }, // ยอดคงเหลือค้างโอน (คำนวณอัตโนมัติ)
    status: { type: String, default: 'รออนุมัติ', enum: ['รออนุมัติ', 'ค้างโอน', 'ชำระแล้ว', 'ยกเลิก'] },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    settled_at: { type: Date, default: null } // วันที่ผ่านรายการ/โอนเงินครบ
}, { timestamps: true });

// คำนวณยอดค้างโอนอัตโนมัติก่อนตรวจสอบข้อมูล (Validation)
financeReceivableSchema.pre('validate', function() {
    this.financed_amount = this.total_finance_price - this.down_payment - this.icloud_fee - this.contract_fee;
});

const FinanceReceivable = mongoose.model('FinanceReceivable', financeReceivableSchema, 'financereceivable');

module.exports = {
    Branch,
    Role,
    Employee,
    ProductType,
    ProductUnit,
    ProductColor,
    ProductCapacity,
    ProductCondition,
    ProductName,
    Supplier,
    Product,
    Movement,
    Transaction,
    Transfer,
    Member,
    FinanceCompany,
    ImportNotification,
    PurchaseOrder,
    AuditLog,
    CashMovement,
    FinanceReceivable,
    seedDefaultRoles,
    migrateProductsToERP
};
