const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'silmin-default-secret-key';
const {
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
    seedDefaultRoles
} = require('../models');

// ==========================================
// JWT Verification Middleware (ตรวจสอบ Token)
// ==========================================
const verifyToken = (req, res, next) => {
    // ข้าม middleware สำหรับ route login
    if (req.path === '/auth/login') {
        return next();
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง (ไม่พบ Token)'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { employee_id, role, branch_id }
        next();
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        return res.status(403).json({
            success: false,
            message: 'เซสชั่นหมดอายุ กรุณาเข้าสู่ระบบใหม่'
        });
    }
};

// ใช้ middleware กับทุก route
router.use(verifyToken);

// 1. GET /api/master-data
// หน้าที่: ดึงข้อมูลจากทุก Master Data collections พร้อมกัน เพื่อไปแสดงผลที่หน้าเว็บ
router.get('/master-data', async (req, res) => {

    try {
        const [
            branches,
            productTypes,
            productUnits,
            productColors,
            productCapacities,
            productConditions,
            productNames,
            suppliers
        ] = await Promise.all([
            Branch.find(),
            ProductType.find(),
            ProductUnit.find(),
            ProductColor.find(),
            ProductCapacity.find(),
            ProductCondition.find(),
            ProductName.find(),
            Supplier.find()
        ]);

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูล Master Data สำเร็จ',
            data: {
                branches,
                productTypes,
                productUnits,
                productColors,
                productCapacities,
                productConditions,
                productNames,
                suppliers
            }
        });
    } catch (error) {
        console.error('API Error /api/master-data:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Master Data จากระบบ'
        });
    }
});

// 2. POST /api/products
// หน้าที่: บันทึกข้อมูลสินค้าใหม่ลงใน collection product
router.post('/products', async (req, res) => {
    try {
        const productData = req.body;

        // ตรวจสอบข้อมูลเบื้องต้น
        if (!productData || !productData.name || !productData.type_id) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกข้อมูลสินค้าให้ครบถ้วน'
            });
        }

        const newProduct = new Product({
            product_code: productData.product_code || '',
            supplier_id: productData.supplier_id || null,
            name: productData.name,
            cost_price: productData.cost_price,
            selling_price: productData.selling_price,
            type_id: productData.type_id,
            color_id: productData.color_id || null,
            capacity_id: productData.capacity_id || null,
            condition_id: productData.condition_id || null,
            unit_id: productData.unit_id || null,
            imeis: productData.imeis || [],
            quantity: productData.quantity || 1,
            branch_id: productData.branch_id || null
        });

        const savedProduct = await newProduct.save();

        res.status(201).json({
            success: true,
            message: 'บันทึกข้อมูลสินค้าใหม่สำเร็จ',
            data: savedProduct
        });
    } catch (error) {
        console.error('API Error /api/products:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถบันทึกข้อมูลสินค้าได้ กรุณาตรวจสอบข้อมูลอีกครั้ง'
        });
    }
});

// 4. GET /api/products
// หน้าที่: ดึงข้อมูลสินค้าทั้งหมดพร้อมข้อมูล Master Data ที่เกี่ยวข้อง
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find()
            .populate('type_id', 'name')
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .populate('branch_id', 'name')
            .populate('supplier_id', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลสินค้าสำเร็จ',
            data: products
        });
    } catch (error) {
        console.error('API Error GET /api/products:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า'
        });
    }
});

// PUT /api/products/:id
// หน้าที่: แก้ไขข้อมูลสินค้า
router.put('/products/:id', async (req, res) => {
    try {
        const productData = req.body;

        const updatedProductData = {
            product_code: productData.product_code || '',
            supplier_id: productData.supplier_id || null,
            name: productData.name,
            cost_price: productData.cost_price,
            selling_price: productData.selling_price,
            type_id: productData.type_id,
            unit_id: productData.unit_id || null,
            color_id: productData.color_id || null,
            capacity_id: productData.capacity_id || null,
            condition_id: productData.condition_id || null,
            branch_id: productData.branch_id || null,
            imeis: productData.imeis || [],
            quantity: productData.quantity || 1
        };

        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            updatedProductData,
            { returnDocument: 'after' }
        );

        if (!updatedProduct) {
            return res.status(404).json({ success: false, message: 'ไม่พบสินค้าที่ระบุ' });
        }

        res.status(200).json({
            success: true,
            message: 'แก้ไขข้อมูลสินค้าสำเร็จ',
            data: updatedProduct
        });
    } catch (error) {
        console.error('API Error PUT /api/products/:id:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถแก้ไขข้อมูลสินค้าได้'
        });
    }
});

// DELETE /api/products/:id
// หน้าที่: ลบข้อมูลสินค้า
router.delete('/products/:id', async (req, res) => {
    try {
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        
        if (!deletedProduct) {
            return res.status(404).json({ success: false, message: 'ไม่พบสินค้าที่ระบุ' });
        }

        res.status(200).json({
            success: true,
            message: 'ลบข้อมูลสินค้าสำเร็จ'
        });
    } catch (error) {
        console.error('API Error DELETE /api/products/:id:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการลบข้อมูลสินค้า'
        });
    }
});

// ==========================================
// Authentication APIs (ระบบยืนยันตัวตน JWT)
// ==========================================

// POST /api/auth/login
// หน้าที่: ตรวจสอบพนักงาน → ส่งคืน JWT Token
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกรหัสพนักงานและรหัสผ่าน'
            });
        }

        // ค้นหาพนักงานจากรหัสพนักงาน (emp_id)
        const employee = await Employee.findOne({ emp_id: username }).populate('branch_id', 'name');

        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // เช็ครหัสผ่านด้วย bcrypt
        const isMatch = await bcrypt.compare(password, employee.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // ค้นหา Role เพื่อดึง permissions
        const roleDoc = await Role.findOne({ name: employee.role });
        const permissions = roleDoc ? roleDoc.permissions.toObject() : {
            view_dashboard: true, manage_stock: true, delete_stock: true,
            do_pos: true, manage_personnel: true, manage_branches: true,
            manage_settings: true, manage_roles: true
        };

        // สร้าง JWT Token (รวม permissions)
        const tokenPayload = {
            employee_id: employee._id,
            emp_id: employee.emp_id,
            name: employee.name,
            role: employee.role,
            permissions,
            branch_id: employee.branch_id ? employee.branch_id._id : null
        };

        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

        console.log(`[AUTH] เข้าสู่ระบบสำเร็จ: ${employee.name} (${employee.role})`);

        res.status(200).json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            data: {
                id: employee._id,
                name: employee.name,
                emp_id: employee.emp_id,
                role: employee.role,
                permissions,
                branch: employee.branch_id
            }
        });

    } catch (error) {
        console.error('API Error POST /api/auth/login:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// ==========================================
// Employee Management APIs (จัดการพนักงาน)
// ==========================================

// GET /api/employees
router.get('/employees', async (req, res) => {
    try {
        const employees = await Employee.find()
            .select('-password')
            .populate('branch_id', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: employees });
    } catch (error) {
        console.error('API Error GET /api/employees:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน' });
    }
});

// POST /api/employees
router.post('/employees', async (req, res) => {
    try {
        const { name, emp_id, password, role, branch_id } = req.body;

        if (!name || !emp_id || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อ, รหัสพนักงาน, รหัสผ่าน)' });
        }

        // ตรวจสอบรหัสพนักงานซ้ำ
        const existingEmp = await Employee.findOne({ emp_id });
        if (existingEmp) {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้ถูกใช้งานแล้ว' });
        }

        // Hash รหัสผ่านด้วย bcrypt
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newEmployee = new Employee({
            name,
            emp_id,
            password: hashedPassword,
            role: role || 'พนักงานขาย',
            branch_id: branch_id || null
        });

        const saved = await newEmployee.save();
        const populatedEmp = await Employee.findById(saved._id).select('-password').populate('branch_id', 'name');

        console.log(`[EMPLOYEE] เพิ่มพนักงานใหม่: ${name} (${emp_id})`);

        res.status(201).json({ success: true, message: 'เพิ่มพนักงานใหม่สำเร็จ', data: populatedEmp });
    } catch (error) {
        console.error('API Error POST /api/employees:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มพนักงาน' });
    }
});

// PUT /api/employees/:id
router.put('/employees/:id', async (req, res) => {
    try {
        const { name, emp_id, password, role, branch_id } = req.body;

        if (!name || !emp_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // ตรวจสอบรหัสพนักงานซ้ำ (ยกเว้นตัวเอง)
        const existingEmp = await Employee.findOne({ emp_id, _id: { $ne: req.params.id } });
        if (existingEmp) {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้ถูกใช้งานแล้ว' });
        }

        const updateData = { name, emp_id, role: role || 'พนักงานขาย', branch_id: branch_id || null };

        // ถ้ามีการส่งรหัสผ่านใหม่มา → Hash ใหม่
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updated = await Employee.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' })
            .select('-password')
            .populate('branch_id', 'name');

        if (!updated) return res.status(404).json({ success: false, message: 'ไม่พบพนักงานที่ระบุ' });

        console.log(`[EMPLOYEE] แก้ไขข้อมูลพนักงาน: ${name} (${emp_id})`);

        res.status(200).json({ success: true, message: 'แก้ไขข้อมูลพนักงานสำเร็จ', data: updated });
    } catch (error) {
        console.error('API Error PUT /api/employees:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลพนักงาน' });
    }
});

// DELETE /api/employees/:id
router.delete('/employees/:id', async (req, res) => {
    try {
        const deleted = await Employee.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'ไม่พบพนักงานที่ระบุ' });

        console.log(`[EMPLOYEE] ลบพนักงาน: ${deleted.name} (${deleted.emp_id})`);

        res.status(200).json({ success: true, message: 'ลบพนักงานสำเร็จ' });
    } catch (error) {
        console.error('API Error DELETE /api/employees:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบพนักงาน' });
    }
});

// ==========================================
// Branch Management APIs
// ==========================================

// GET /api/branches
router.get('/branches', async (req, res) => {
    try {
        const branches = await Branch.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: branches });
    } catch (error) {
        console.error('API Error GET /api/branches:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสาขา' });
    }
});

// POST /api/branches
router.post('/branches', async (req, res) => {
    try {
        const { name, address } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสาขา' });

        const newBranch = new Branch({ name, address });
        const savedBranch = await newBranch.save();
        res.status(201).json({ success: true, message: 'เพิ่มสาขาใหม่สำเร็จ', data: savedBranch });
    } catch (error) {
        console.error('API Error POST /api/branches:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มสาขา' });
    }
});

// PUT /api/branches/:id
router.put('/branches/:id', async (req, res) => {
    try {
        const { name, address } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสาขา' });

        const updatedBranch = await Branch.findByIdAndUpdate(
            req.params.id,
            { name, address },
            { returnDocument: 'after' }
        );

        if (!updatedBranch) return res.status(404).json({ success: false, message: 'ไม่พบสาขาที่ระบุ' });

        res.status(200).json({ success: true, message: 'แก้ไขข้อมูลสาขาสำเร็จ', data: updatedBranch });
    } catch (error) {
        console.error('API Error PUT /api/branches:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขสาขา' });
    }
});

// DELETE /api/branches/:id
router.delete('/branches/:id', async (req, res) => {
    try {
        const deletedBranch = await Branch.findByIdAndDelete(req.params.id);
        if (!deletedBranch) return res.status(404).json({ success: false, message: 'ไม่พบสาขาที่ระบุ' });

        res.status(200).json({ success: true, message: 'ลบสาขาสำเร็จ' });
    } catch (error) {
        console.error('API Error DELETE /api/branches:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบสาขา' });
    }
});

// ==========================================
// Master Data Management APIs
// ==========================================

// 4. POST /api/master/:collection
// หน้าที่: เพิ่มข้อมูล Master Data ใหม่
router.post('/master/:collection', async (req, res) => {
    try {
        const collection = req.params.collection.toLowerCase();
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ' });
        }

        let Model;
        switch (collection) {
            case 'producttype': Model = ProductType; break;
            case 'productunit': Model = ProductUnit; break;
            case 'productcolor': Model = ProductColor; break;
            case 'productcapacity': Model = ProductCapacity; break;
            case 'productcondition': Model = ProductCondition; break;
            case 'productname': Model = ProductName; break;
            case 'supplier': Model = Supplier; break;
            default:
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
        }

        const newItem = new Model({ name });
        const savedItem = await newItem.save();

        res.status(201).json({
            success: true,
            message: 'เพิ่มข้อมูลสำเร็จ',
            data: savedItem
        });
    } catch (error) {
        console.error(`API Error POST /api/master/${req.params.collection}:`, error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล' });
    }
});

// 5. DELETE /api/master/:collection/:id
// หน้าที่: ลบข้อมูล Master Data
router.delete('/master/:collection/:id', async (req, res) => {
    try {
        const collection = req.params.collection.toLowerCase();
        const id = req.params.id;

        let Model;
        switch (collection) {
            case 'producttype': Model = ProductType; break;
            case 'productunit': Model = ProductUnit; break;
            case 'productcolor': Model = ProductColor; break;
            case 'productcapacity': Model = ProductCapacity; break;
            case 'productcondition': Model = ProductCondition; break;
            case 'productname': Model = ProductName; break;
            case 'supplier': Model = Supplier; break;
            default:
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
        }

        const deletedItem = await Model.findByIdAndDelete(id);

        if (!deletedItem) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลที่ต้องการลบ' });
        }

        res.status(200).json({
            success: true,
            message: 'ลบข้อมูลสำเร็จ'
        });
    } catch (error) {
        console.error(`API Error DELETE /api/master/${req.params.collection}:`, error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
    }
});

// 6. PUT /api/master/:collection/:id
// หน้าที่: แก้ไขข้อมูล Master Data
router.put('/master/:collection/:id', async (req, res) => {
    try {
        const collection = req.params.collection.toLowerCase();
        const id = req.params.id;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ' });
        }

        let Model;
        switch (collection) {
            case 'producttype': Model = ProductType; break;
            case 'productunit': Model = ProductUnit; break;
            case 'productcolor': Model = ProductColor; break;
            case 'productcapacity': Model = ProductCapacity; break;
            case 'productcondition': Model = ProductCondition; break;
            case 'productname': Model = ProductName; break;
            case 'supplier': Model = Supplier; break;
            default:
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
        }

        const updatedItem = await Model.findByIdAndUpdate(id, { name }, { returnDocument: 'after' });

        if (!updatedItem) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลที่ต้องการแก้ไข' });
        }

        res.status(200).json({
            success: true,
            message: 'แก้ไขข้อมูลสำเร็จ',
            data: updatedItem
        });
    } catch (error) {
        console.error(`API Error PUT /api/master/${req.params.collection}:`, error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล' });
    }
});

// ==========================================
// Transaction / POS APIs (รายการขาย)
// ==========================================

// POST /api/transactions
// หน้าที่: บันทึกรายการขายและหักสต็อกอัตโนมัติ
router.post('/transactions', async (req, res) => {
    try {
        const { items, total_amount, payment_method, branch_id } = req.body;

        // ตรวจสอบข้อมูลเบื้องต้น
        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณาเพิ่มสินค้าลงในตะกร้าก่อนทำรายการ' });
        }
        if (!payment_method) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกช่องทางการชำระเงิน' });
        }

        // สร้างเลขที่ใบเสร็จอัตโนมัติ: INV-วันที่-สุ่ม
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const receipt_number = `INV-${dateStr}-${randomStr}`;

        // ==========================================
        // CRITICAL: Stock Deduction Logic (หักสต็อก)
        // ==========================================
        for (const item of items) {
            const product = await Product.findById(item.product_id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `ไม่พบสินค้า: ${item.product_name} ในระบบ`
                });
            }

            if (item.imei_sold && item.imei_sold.trim() !== '') {
                // กรณีมี IMEI (อุปกรณ์มือถือ/แท็บเล็ต): ลบ IMEI ที่ขายออกจาก array
                const imeiIndex = product.imeis.indexOf(item.imei_sold.trim());
                if (imeiIndex === -1) {
                    return res.status(400).json({
                        success: false,
                        message: `ไม่พบ IMEI: ${item.imei_sold} ในสต็อกสินค้า ${item.product_name}`
                    });
                }
                product.imeis.splice(imeiIndex, 1);
                product.quantity = Math.max(0, product.quantity - 1);
            } else {
                // กรณีไม่มี IMEI (อุปกรณ์เสริม): ลดจำนวนตามที่ซื้อ
                if (product.quantity < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `สินค้า ${item.product_name} มีไม่เพียงพอ (คงเหลือ: ${product.quantity})`
                    });
                }
                product.quantity = Math.max(0, product.quantity - item.quantity);
            }

            await product.save();
        }

        // บันทึกรายการขาย
        const newTransaction = new Transaction({
            receipt_number,
            branch_id: branch_id || null,
            items,
            total_amount,
            payment_method,
            created_at: now
        });

        const savedTransaction = await newTransaction.save();

        console.log(`[POS] ทำรายการขายสำเร็จ - ใบเสร็จ: ${receipt_number} | ยอดรวม: ฿${total_amount}`);

        res.status(201).json({
            success: true,
            message: 'ทำรายการขายสำเร็จ',
            data: savedTransaction
        });

    } catch (error) {
        console.error('API Error POST /api/transactions:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการทำรายการขาย กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// GET /api/transactions
// หน้าที่: ดึงประวัติรายการขายทั้งหมด
router.get('/transactions', async (req, res) => {
    try {
        const transactions = await Transaction.find()
            .populate('branch_id', 'name')
            .sort({ created_at: -1 });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลรายการขายสำเร็จ',
            data: transactions
        });
    } catch (error) {
        console.error('API Error GET /api/transactions:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการขาย'
        });
    }
});

// ==========================================
// Dashboard Statistics API (สถิติแดชบอร์ด)
// ==========================================

// GET /api/dashboard-stats
// หน้าที่: คำนวณสถิติแบบ real-time จากฐานข้อมูล
router.get('/dashboard-stats', async (req, res) => {
    try {
        // กำหนดช่วงเวลาวันนี้ (00:00 - 23:59)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // 1. ยอดขายวันนี้ (Today's Sales)
        const todayTransactions = await Transaction.find({
            created_at: { $gte: todayStart, $lte: todayEnd }
        }).populate('branch_id', 'name');

        const todaySales = todayTransactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);
        const todayTransactionCount = todayTransactions.length;

        // 2. กำไรโดยประมาณวันนี้ (Estimated Profit)
        // คำนวณจาก selling_price - cost_price ของสินค้าที่ขายวันนี้
        let estimatedProfit = 0;
        for (const txn of todayTransactions) {
            for (const item of txn.items) {
                if (item.product_id) {
                    const product = await Product.findById(item.product_id);
                    if (product) {
                        const profit = (item.price - (product.cost_price || 0)) * item.quantity;
                        estimatedProfit += profit;
                    }
                }
            }
        }

        // 3. จำนวนสินค้าในคลัง (Total Stock)
        const stockAgg = await Product.aggregate([
            { $group: { _id: null, totalQuantity: { $sum: '$quantity' }, totalProducts: { $sum: 1 } } }
        ]);
        const totalStock = stockAgg.length > 0 ? stockAgg[0].totalQuantity : 0;
        const totalProducts = stockAgg.length > 0 ? stockAgg[0].totalProducts : 0;

        // 4. สินค้าใกล้หมด (Low Stock: quantity < 5)
        const lowStockCount = await Product.countDocuments({ quantity: { $lt: 5 } });

        // 5. ยอดขายแยกตามสาขา (Sales by Branch) - วันนี้
        const salesByBranch = {};
        for (const txn of todayTransactions) {
            const branchName = txn.branch_id ? txn.branch_id.name : 'ไม่ระบุสาขา';
            if (!salesByBranch[branchName]) {
                salesByBranch[branchName] = { total: 0, count: 0 };
            }
            salesByBranch[branchName].total += txn.total_amount || 0;
            salesByBranch[branchName].count += 1;
        }

        // 6. รายการขายล่าสุด (Recent Transactions) - 10 รายการ
        const recentTransactions = await Transaction.find()
            .populate('branch_id', 'name')
            .sort({ created_at: -1 })
            .limit(10);

        res.status(200).json({
            success: true,
            data: {
                todaySales,
                todayTransactionCount,
                estimatedProfit,
                totalStock,
                totalProducts,
                lowStockCount,
                salesByBranch,
                recentTransactions: recentTransactions.map(t => ({
                    _id: t._id,
                    receipt_number: t.receipt_number,
                    total_amount: t.total_amount,
                    payment_method: t.payment_method,
                    items_count: t.items.length,
                    branch_name: t.branch_id ? t.branch_id.name : '-',
                    created_at: t.created_at
                }))
            }
        });

    } catch (error) {
        console.error('API Error GET /api/dashboard-stats:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติแดชบอร์ด'
        });
    }
});

// ==========================================
// Role Management APIs (จัดการระดับสิทธิ์)
// ==========================================

// GET /api/roles - ดึงรายการ Role ทั้งหมด
router.get('/roles', async (req, res) => {
    try {
        const roles = await Role.find().sort({ createdAt: 1 });
        res.status(200).json({ success: true, data: roles });
    } catch (error) {
        console.error('API Error GET /api/roles:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสิทธิ์' });
    }
});

// POST /api/roles - สร้าง Role ใหม่
router.post('/roles', async (req, res) => {
    try {
        const { name, permissions } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อตำแหน่ง' });

        const exists = await Role.findOne({ name });
        if (exists) return res.status(400).json({ success: false, message: 'ชื่อตำแหน่งนี้มีอยู่แล้ว' });

        const role = new Role({ name, permissions: permissions || {} });
        await role.save();

        console.log(`[ROLE] สร้างตำแหน่งใหม่: ${name}`);
        res.status(201).json({ success: true, data: role, message: 'สร้างตำแหน่งสำเร็จ' });
    } catch (error) {
        console.error('API Error POST /api/roles:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างตำแหน่ง' });
    }
});

// PUT /api/roles/:id - แก้ไข Role
router.put('/roles/:id', async (req, res) => {
    try {
        const { name, permissions } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (permissions) updateData.permissions = permissions;

        const role = await Role.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!role) return res.status(404).json({ success: false, message: 'ไม่พบตำแหน่งที่ต้องการแก้ไข' });

        console.log(`[ROLE] แก้ไขตำแหน่ง: ${role.name}`);
        res.status(200).json({ success: true, data: role, message: 'แก้ไขตำแหน่งสำเร็จ' });
    } catch (error) {
        console.error('API Error PUT /api/roles/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขตำแหน่ง' });
    }
});

// DELETE /api/roles/:id - ลบ Role
router.delete('/roles/:id', async (req, res) => {
    try {
        const role = await Role.findByIdAndDelete(req.params.id);
        if (!role) return res.status(404).json({ success: false, message: 'ไม่พบตำแหน่งที่ต้องการลบ' });

        console.log(`[ROLE] ลบตำแหน่ง: ${role.name}`);
        res.status(200).json({ success: true, message: `ลบตำแหน่ง "${role.name}" สำเร็จ` });
    } catch (error) {
        console.error('API Error DELETE /api/roles/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบตำแหน่ง' });
    }
});

module.exports = router;
