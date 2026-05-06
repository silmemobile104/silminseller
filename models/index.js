const mongoose = require('mongoose');

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
        manage_roles: { type: Boolean, default: false }      // อนุญาตให้จัดการสิทธิ์
    }
}, { timestamps: true });
const Role = mongoose.model('Role', roleSchema, 'role');

// Seed Default Roles (สร้างข้อมูลสิทธิ์เริ่มต้น)
const seedDefaultRoles = async () => {
    const count = await Role.countDocuments();
    if (count > 0) return; // มีข้อมูลแล้ว ไม่ต้อง seed

    const defaults = [
        {
            name: 'แอดมิน',
            permissions: {
                view_dashboard: true, manage_stock: true, delete_stock: true,
                do_pos: true, manage_personnel: true, manage_branches: true,
                manage_settings: true, manage_roles: true
            }
        },
        {
            name: 'ผู้จัดการ',
            permissions: {
                view_dashboard: true, manage_stock: true, delete_stock: true,
                do_pos: true, manage_personnel: true, manage_branches: true,
                manage_settings: true, manage_roles: false
            }
        },
        {
            name: 'พนักงานขาย',
            permissions: {
                view_dashboard: false, manage_stock: true, delete_stock: false,
                do_pos: true, manage_personnel: false, manage_branches: false,
                manage_settings: false, manage_roles: false
            }
        }
    ];

    await Role.insertMany(defaults);
    console.log('[SEED] สร้างข้อมูลระดับสิทธิ์เริ่มต้นสำเร็จ (3 roles)');
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
    name: { type: String, required: true, unique: true }
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
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // สาขาที่มีสต็อก

    // Devices specific (IMEIs array) vs Accessory specific (Quantity)
    imeis: [{ type: String }], // สแกนเลข IMEI ได้หลายค่า
    quantity: { type: Number, default: 1 } // จำนวนชิ้นสำหรับอุปกรณ์เสริม

}, { timestamps: true });
const Product = mongoose.model('Product', productSchema, 'product');

// 12. Transaction (รายการขาย)
const transactionSchema = new mongoose.Schema({
    receipt_number: { type: String, required: true, unique: true }, // เลขที่ใบเสร็จ (Auto-generated: INV-วันที่-สุ่ม)
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // สาขาที่ทำรายการ
    employee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }, // พนักงานที่ทำรายการ
    items: [{
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        product_name: { type: String }, // ชื่อสินค้า
        imei_sold: { type: String, default: '' }, // IMEI ที่ขาย (ถ้ามี)
        quantity: { type: Number, default: 1 }, // จำนวน
        price: { type: Number, default: 0 } // ราคาต่อชิ้น
    }],
    total_amount: { type: Number, required: true }, // ยอดรวมทั้งหมด
    payment_method: { type: String, required: true }, // วิธีชำระเงิน: เงินสด, โอนเงิน, จัดไฟแนนซ์
    down_payment: { type: Number, default: 0 }, // ยอดเงินดาวน์ / รับเงินมา
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
    Transaction,
    Transfer,
    seedDefaultRoles
};
