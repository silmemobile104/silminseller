const mongoose = require('mongoose');

// 1. Branch (สาขา)
const branchSchema = new mongoose.Schema({
    name: { type: String, required: true }, // ชื่อสาขา
    address: { type: String } // ที่อยู่
}, { timestamps: true });
const Branch = mongoose.model('Branch', branchSchema, 'branch');

// 2. Employee (พนักงาน)
const employeeSchema = new mongoose.Schema({
    name: { type: String, required: true }, // ชื่อพนักงาน
    emp_id: { type: String, required: true, unique: true }, // รหัสพนักงาน (ใช้เป็น username)
    password: { type: String, required: true }, // รหัสผ่าน
    branch_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' } // สังกัดสาขา
}, { timestamps: true });
const Employee = mongoose.model('Employee', employeeSchema, 'employee');

// 3. ProductType (ประเภทสินค้า: iPhone, iPad, อุปกรณ์เสริม)
const productTypeSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductType = mongoose.model('ProductType', productTypeSchema, 'producttype');

// 4. ProductUnit (หน่วยนับ: เครื่อง, ชิ้น)
const productUnitSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductUnit = mongoose.model('ProductUnit', productUnitSchema, 'productunit');

// 5. ProductColor (สี: ดำ, ขาว, เทา)
const productColorSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductColor = mongoose.model('ProductColor', productColorSchema, 'productcolor');

// 6. ProductCapacity (ความจุ: 64GB, 128GB...)
const productCapacitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductCapacity = mongoose.model('ProductCapacity', productCapacitySchema, 'productcapacity');

// 7. ProductCondition (สภาพ: มือ1, มือ2)
const productConditionSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductCondition = mongoose.model('ProductCondition', productConditionSchema, 'productcondition');

// 8. ProductName (ชื่อสินค้า)
const productNameSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});
const ProductName = mongoose.model('ProductName', productNameSchema, 'productname');

// 9. Supplier (ผู้จัดจำหน่าย)
const supplierSchema = new mongoose.Schema({
    name: { type: String, required: true }
}, { timestamps: true });
const Supplier = mongoose.model('Supplier', supplierSchema, 'supplier');

// 10. Product (ข้อมูลสินค้าหลัก)
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

module.exports = {
    Branch,
    Employee,
    ProductType,
    ProductUnit,
    ProductColor,
    ProductCapacity,
    ProductCondition,
    ProductName,
    Supplier,
    Product
};
