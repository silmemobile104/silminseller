const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'silminseller_jwt_secret_key';

// Import Models
const { 
    Employee, 
    Product, 
    Movement, 
    Branch, 
    Supplier, 
    ProductType, 
    ProductUnit, 
    ProductColor, 
    ProductCapacity, 
    ProductCondition, 
    ProductName, 
    Transaction, 
    Transfer, 
    Role 
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

// ==========================================
// ERP Helpers (Stock Balances + Movement)
// ==========================================
const getRequestedBranchId = (req) => {
    const userRole = req.user && req.user.role ? req.user.role : '';
    const userBranchId = req.user && req.user.branch_id ? req.user.branch_id : null;

    // Admin/ผู้จัดการ: เลือกสาขาได้ผ่าน query
    if (userRole === 'Administrator' || userRole === 'ผู้จัดการ') {
        if (req.query && req.query.branch_id) return req.query.branch_id;
        return userBranchId; // ถ้าไม่ส่งมา ให้ fallback
    }

    // พนักงานขาย: บังคับสาขาตามตัวเอง
    return userBranchId;
};

const injectBranchStockVirtuals = (product, branchId) => {
    const p = product.toObject ? product.toObject() : { ...product };
    const bId = branchId ? branchId.toString() : '';
    const balances = Array.isArray(p.stock_balances) ? p.stock_balances : [];
    const bal = balances.find(x => {
        if (!x.branch_id) return false;
        const idStr = x.branch_id._id ? x.branch_id._id.toString() : x.branch_id.toString();
        return idStr === bId;
    });
    p.quantity = bal ? Number(bal.quantity || 0) : 0;
    p.imeis = bal && Array.isArray(bal.imeis) ? bal.imeis : [];
    p.branch_id = bal && bal.branch_id ? bal.branch_id : branchId; // แนบข้อมูลสาขาที่เกี่ยวข้องกลับไปด้วยเพื่อใช้แสดงผลและแก้ไข
    return p;
};

const ensureBranchBalance = (productDoc, branchId) => {
    if (!productDoc.stock_balances) productDoc.stock_balances = [];
    const bId = branchId.toString();
    let bal = productDoc.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);
    if (!bal) {
        productDoc.stock_balances.push({ branch_id: branchId, quantity: 0, imeis: [] });
        bal = productDoc.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);
    }
    return bal;
};

const createMovementsForItem = async ({
    productId,
    action,
    fromBranch,
    toBranch,
    referenceNo,
    createdBy,
    transitHours,
    imeis,
    quantity
}) => {
    const listImeis = Array.isArray(imeis) ? imeis.map(x => x.toString().trim()).filter(Boolean) : [];
    if (listImeis.length > 0) {
        const docs = listImeis.map(imei => ({
            product_id: productId,
            imei,
            action,
            from_branch: fromBranch || null,
            to_branch: toBranch || null,
            reference_no: referenceNo || '',
            transit_hours: Number(transitHours || 0),
            created_by: createdBy,
            created_at: new Date()
        }));
        await Movement.insertMany(docs);
        return;
    }

    await Movement.create({
        product_id: productId,
        imei: '',
        action,
        from_branch: fromBranch || null,
        to_branch: toBranch || null,
        reference_no: referenceNo || '',
        transit_hours: Number(transitHours || 0),
        created_by: createdBy,
        created_at: new Date(),
        quantity: Number(quantity || 0)
    });
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

        const branchId = productData.branch_id || (req.user && req.user.branch_id ? req.user.branch_id : null);
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุสาขาที่ต้องการรับเข้าสินค้า' });
        }

        // ป้องกันสินค้าซ้ำ: ใช้ product_code เป็นตัวระบุหลัก ถ้ามี
        let product = null;
        if (productData.product_code) {
            product = await Product.findOne({ product_code: productData.product_code });
        }

        if (!product) {
            product = new Product({
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
                stock_balances: []
            });
        }

        const bal = ensureBranchBalance(product, branchId);
        const incomingImeis = Array.isArray(productData.imeis) ? productData.imeis.map(x => x.toString().trim()).filter(Boolean) : [];
        const incomingQty = Number(productData.quantity || 0) || incomingImeis.length || 1;

        if (incomingImeis.length > 0) {
            const set = new Set((bal.imeis || []).map(x => x.toString().trim()));
            for (const imei of incomingImeis) {
                if (!set.has(imei)) {
                    bal.imeis.push(imei);
                    set.add(imei);
                }
            }
            bal.quantity = (bal.imeis || []).length;
        } else {
            bal.quantity = Number(bal.quantity || 0) + incomingQty;
        }

        const savedProduct = await product.save();

        // Movement: รับเข้าสต็อก
        await createMovementsForItem({
            productId: savedProduct._id,
            action: 'รับเข้าสต็อก',
            fromBranch: null,
            toBranch: branchId,
            referenceNo: '',
            createdBy: req.user.employee_id,
            transitHours: 0,
            imeis: incomingImeis,
            quantity: incomingImeis.length > 0 ? incomingImeis.length : incomingQty
        });

        res.status(201).json({
            success: true,
            message: 'บันทึกข้อมูลสินค้าใหม่สำเร็จ',
            data: injectBranchStockVirtuals(savedProduct, branchId)
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
        const branchId = getRequestedBranchId(req);
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาที่ต้องการใช้งาน' });
        }

        // ดึงสินค้าแบบ Master Catalog และคัดเฉพาะสินค้าที่มีสต็อกในสาขาที่ต้องการ (ถ้ามี)
        const productsRaw = await Product.find({ 'stock_balances.branch_id': branchId })
            .populate('type_id', 'name')
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .populate('supplier_id', 'name')
            .populate('stock_balances.branch_id', 'name')
            .sort({ createdAt: -1 });

        const products = productsRaw.map(p => injectBranchStockVirtuals(p, branchId));

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

// GET /api/products/search
// หน้าที่: ค้นหาสินค้าตาม product_code หรือ IMEI (สำหรับสแกนบาร์โค้ด)
router.get('/products/search', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสสินค้า' });
        }

        const branchId = getRequestedBranchId(req);
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาที่ต้องการใช้งาน' });
        }

        const query = {
            $or: [
                { product_code: code },
                { 'stock_balances.imeis': code }
            ]
        };

        // กรองให้เจอเฉพาะสต็อกของสาขาที่ต้องการ
        query['stock_balances.branch_id'] = branchId;

        const product = await Product.findOne(query)
            .populate('type_id', 'name')
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .populate('supplier_id', 'name');

        if (!product) {
            return res.status(404).json({ success: false, message: 'ไม่พบสินค้า' });
        }

        res.status(200).json({
            success: true,
            message: 'ค้นหาสินค้าสำเร็จ',
            product: injectBranchStockVirtuals(product, branchId)
        });
    } catch (error) {
        console.error('API Error GET /api/products/search:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการค้นหาสินค้า'
        });
    }
});

// PUT /api/products/:id
// หน้าที่: แก้ไขข้อมูลสินค้า
router.put('/products/:id', async (req, res) => {
    try {
        const productData = req.body;

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'ไม่พบสินค้าที่ระบุ' });
        }

        // Update master fields
        product.product_code = productData.product_code || product.product_code || '';
        product.supplier_id = productData.supplier_id || null;
        product.name = productData.name;
        product.cost_price = productData.cost_price;
        product.selling_price = productData.selling_price;
        product.type_id = productData.type_id;
        product.unit_id = productData.unit_id || null;
        product.color_id = productData.color_id || null;
        product.capacity_id = productData.capacity_id || null;
        product.condition_id = productData.condition_id || null;

        // Update stock for a branch (optional)
        const branchId = productData.branch_id || null;
        let stockDeltaQty = 0;
        let incomingImeis = [];
        if (branchId) {
            const bal = ensureBranchBalance(product, branchId);
            const prevQty = Number(bal.quantity || 0);

            incomingImeis = Array.isArray(productData.imeis) ? productData.imeis.map(x => x.toString().trim()).filter(Boolean) : [];
            if (incomingImeis.length > 0) {
                const set = new Set((bal.imeis || []).map(x => x.toString().trim()));
                const added = [];
                for (const imei of incomingImeis) {
                    if (!set.has(imei)) {
                        bal.imeis.push(imei);
                        set.add(imei);
                        added.push(imei);
                    }
                }
                bal.quantity = (bal.imeis || []).length;
                stockDeltaQty = added.length;
                incomingImeis = added;
            } else if (typeof productData.quantity !== 'undefined') {
                // quantity ที่ส่งมาถือเป็น "จำนวนรวมของสาขานั้น" (เพื่อให้ backward compatible)
                const nextQty = Number(productData.quantity || 0);
                stockDeltaQty = nextQty - prevQty;
                bal.quantity = nextQty;
            }
        }

        const updatedProduct = await product.save();

        // Movement: รับเข้าสต็อก (เฉพาะกรณี stock เพิ่ม)
        if (branchId && stockDeltaQty > 0) {
            await createMovementsForItem({
                productId: updatedProduct._id,
                action: 'รับเข้าสต็อก',
                fromBranch: null,
                toBranch: branchId,
                referenceNo: '',
                createdBy: req.user.employee_id,
                transitHours: 0,
                imeis: incomingImeis,
                quantity: incomingImeis.length > 0 ? incomingImeis.length : stockDeltaQty
            });
        }

        res.status(200).json({
            success: true,
            message: 'แก้ไขข้อมูลสินค้าสำเร็จ',
            data: branchId ? injectBranchStockVirtuals(updatedProduct, branchId) : updatedProduct
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

        console.log(`[MASTER] กำลังเพิ่มข้อมูลใหม่ใน ${collection}: "${name}"`);
        const newItem = new Model({ name });
        const savedItem = await newItem.save();

        console.log(`[MASTER] เพิ่มข้อมูลสำเร็จ: ${collection} -> ${name} (ID: ${savedItem._id})`);
        res.status(201).json({
            success: true,
            message: 'เพิ่มข้อมูลสำเร็จ',
            data: savedItem
        });
    } catch (error) {
        console.error(`API Error POST /api/master/${req.params.collection}:`, error);
        
        // Handle duplicate key error
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'ข้อมูลนี้มีอยู่ในระบบแล้ว' });
        }
        
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มข้อมูล: ' + error.message });
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

// ==========================================
// Transfer APIs (โอนย้ายสินค้าระหว่างสาขา)
// ==========================================

// GET /api/transfers
// หน้าที่: ดึงรายการโอนย้ายที่เกี่ยวข้องกับสาขาของผู้ใช้งาน (ต้นทาง/ปลายทาง)
router.get('/transfers', async (req, res) => {
    try {
        const branchId = req.user && req.user.branch_id ? req.user.branch_id : null;
        if (!branchId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาของผู้ใช้งาน' });
        }

        const transfers = await Transfer.find({
            $or: [
                { from_branch: branchId },
                { to_branch: branchId }
            ]
        })
            .populate('from_branch', 'name address')
            .populate('to_branch', 'name')
            .populate('created_by', 'name emp_id')
            .populate('received_by', 'name emp_id')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลรายการโอนย้ายสำเร็จ',
            data: transfers
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงรายการโอนย้าย:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการโอนย้าย' });
    }
});

// GET /api/transfers/:id
// หน้าที่: ดึงรายการโอนย้ายรายการเดียว (สำหรับพิมพ์เอกสาร)
router.get('/transfers/:id', async (req, res) => {
    try {
        const transfer = await Transfer.findById(req.params.id)
            .populate('from_branch', 'name address')
            .populate('to_branch', 'name')
            .populate('created_by', 'name emp_id')
            .populate('received_by', 'name emp_id');

        if (!transfer) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการโอนย้ายที่ระบุ' });
        }

        // Convert to plain object to allow modification
        const transferObj = transfer.toObject();

        // Populate color, capacity, condition, unit from product data for old transfers
        if (transferObj.items && transferObj.items.length > 0) {
            for (let i = 0; i < transferObj.items.length; i++) {
                const item = transferObj.items[i];
                if (!item.color || !item.capacity || !item.condition || !item.unit) {
                    const product = await Product.findOne({ product_code: item.product_code })
                        .populate('color_id', 'name')
                        .populate('capacity_id', 'name')
                        .populate('condition_id', 'name')
                        .populate('unit_id', 'name');
                    if (product) {
                        if (!item.color) transferObj.items[i].color = product.color_id?.name || '';
                        if (!item.capacity) transferObj.items[i].capacity = product.capacity_id?.name || '';
                        if (!item.condition) transferObj.items[i].condition = product.condition_id?.name || '';
                        if (!item.unit) transferObj.items[i].unit = product.unit_id?.name || 'ชิ้น';
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลรายการโอนย้ายสำเร็จ',
            data: transferObj
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงรายการโอนย้าย:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการโอนย้าย' });
    }
});

// POST /api/transfers
// หน้าที่: สร้างรายการโอนย้าย และตัดสต็อกจากสาขาต้นทาง
router.post('/transfers', async (req, res) => {
    try {
        const { to_branch, items } = req.body;
        const fromBranch = req.user && req.user.branch_id ? req.user.branch_id : null;
        if (!fromBranch) return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาต้นทางของผู้ใช้งาน' });
        if (!to_branch) return res.status(400).json({ success: false, message: 'กรุณาเลือกสาขาปลายทาง' });
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการเพื่อทำการโอนย้าย' });
        }

        if (to_branch.toString() === fromBranch.toString()) {
            return res.status(400).json({ success: false, message: 'ไม่สามารถโอนย้ายไปสาขาเดียวกันได้' });
        }

        // สร้างเลขที่โอน: TRF-วันที่-สุ่ม
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const transfer_number = `TRF-${dateStr}-${randomStr}`;

        const normalizedItems = items.map(it => ({
            product_name: (it.product_name || '').toString(),
            product_code: (it.product_code || '').toString(),
            imeis: Array.isArray(it.imeis) ? it.imeis.map(x => x.toString().trim()).filter(Boolean) : [],
            quantity: Number(it.quantity) || 1,
            unit: (it.unit || 'ชิ้น').toString(),
            color: (it.color || '').toString(),
            capacity: (it.capacity || '').toString(),
            condition: (it.condition || '').toString()
        }));

        // ตัดสต็อกจากสาขาต้นทางแบบปลอดภัย
        for (const item of normalizedItems) {
            if (!item.product_code) {
                return res.status(400).json({ success: false, message: 'พบรายการที่ไม่มีรหัสสินค้า' });
            }

            const product = await Product.findOne({ product_code: item.product_code });
            if (!product) {
                return res.status(404).json({ success: false, message: `ไม่พบสินค้าในสาขาต้นทาง: ${item.product_name || item.product_code}` });
            }

            const fromBal = ensureBranchBalance(product, fromBranch);
            const hasImeisInStock = Array.isArray(fromBal.imeis) && fromBal.imeis.length > 0;
            if (hasImeisInStock) {
                // โอนแบบระบุ IMEI
                if (!item.imeis || item.imeis.length === 0) {
                    return res.status(400).json({ success: false, message: `กรุณาระบุ IMEI สำหรับสินค้า: ${product.name}` });
                }

                // กันโอนเกินจำนวน
                if (item.imeis.length !== item.quantity) {
                    return res.status(400).json({ success: false, message: `จำนวน IMEI ไม่ตรงกับจำนวนที่โอนสำหรับสินค้า: ${product.name}` });
                }

                for (const imei of item.imeis) {
                    const idx = (fromBal.imeis || []).indexOf(imei);
                    if (idx === -1) {
                        return res.status(400).json({ success: false, message: `ไม่พบ IMEI: ${imei} ในสต็อกสาขาต้นทาง (${product.name})` });
                    }
                    fromBal.imeis.splice(idx, 1);
                }
                fromBal.quantity = Math.max(0, Number(fromBal.quantity || 0) - item.quantity);
            } else {
                // อุปกรณ์เสริม: ตัดตามจำนวน
                if (Number(fromBal.quantity || 0) < item.quantity) {
                    return res.status(400).json({ success: false, message: `สินค้า ${product.name} มีไม่เพียงพอสำหรับโอนย้าย (คงเหลือ: ${Number(fromBal.quantity || 0)})` });
                }
                fromBal.quantity = Math.max(0, Number(fromBal.quantity || 0) - item.quantity);
            }

            await product.save();

            // Movement: ส่งโอนย้าย
            await createMovementsForItem({
                productId: product._id,
                action: 'ส่งโอนย้าย',
                fromBranch,
                toBranch: to_branch,
                referenceNo: transfer_number,
                createdBy: req.user.employee_id,
                transitHours: 0,
                imeis: item.imeis,
                quantity: item.imeis && item.imeis.length > 0 ? item.imeis.length : item.quantity
            });
        }

        const transfer = new Transfer({
            transfer_number,
            from_branch: fromBranch,
            to_branch,
            items: normalizedItems,
            status: 'รอดำเนินการ',
            created_by: req.user.employee_id,
            received_by: null,
            created_at: now
        });

        const saved = await transfer.save();
        console.log(`[โอนย้ายสินค้า] สร้างรายการโอนสำเร็จ: ${transfer_number}`);

        res.status(201).json({ success: true, message: 'สร้างรายการโอนย้ายสำเร็จ', data: saved });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการสร้างรายการโอนย้าย:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างรายการโอนย้าย' });
    }
});

// PUT /api/transfers/:id/receive
// หน้าที่: รับเข้าสินค้าจากรายการโอนย้าย และเพิ่มสต็อกเข้าที่สาขาปลายทาง
router.put('/transfers/:id/receive', async (req, res) => {
    try {
        const transfer = await Transfer.findById(req.params.id);
        if (!transfer) return res.status(404).json({ success: false, message: 'ไม่พบรายการโอนย้ายที่ระบุ' });

        if (transfer.status === 'รับเข้าแล้ว') {
            return res.status(400).json({ success: false, message: 'รายการนี้ถูกรับเข้าแล้ว' });
        }

        const userBranchId = req.user && req.user.branch_id ? req.user.branch_id.toString() : '';
        const toBranchId = transfer.to_branch ? transfer.to_branch.toString() : '';
        const userRole = req.user && req.user.role ? req.user.role : '';

        // ตรวจสอบสิทธิ์: Admin/ผู้จัดการ สามารถรับเข้าได้จากทุกสาขา
        // พนักงานทั่วไปต้องอยู่ที่สาขาปลายทาง
        if (userRole !== 'Administrator' && userRole !== 'ผู้จัดการ') {
            if (!userBranchId || userBranchId !== toBranchId) {
                return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์รับเข้าสินค้ารายการนี้' });
            }
        }

        const transitHours = transfer.created_at
            ? (Date.now() - new Date(transfer.created_at).getTime()) / (1000 * 60 * 60)
            : 0;

        // รับเข้า: เพิ่มสต็อกเข้าปลายทาง (อัปเดต master product ที่เดียว)
        for (const item of transfer.items || []) {
            const productCode = (item.product_code || '').toString();
            if (!productCode) continue;

            const product = await Product.findOne({ product_code: productCode });
            if (!product) {
                return res.status(400).json({ success: false, message: `ไม่พบสินค้าในระบบ: ${productCode}` });
            }

            const toBal = ensureBranchBalance(product, transfer.to_branch);

            const incomingImeis = Array.isArray(item.imeis) ? item.imeis.map(x => x.toString().trim()).filter(Boolean) : [];
            if (incomingImeis.length > 0) {
                const set = new Set((toBal.imeis || []).map(x => x.toString().trim()));
                for (const imei of incomingImeis) {
                    if (!set.has(imei)) {
                        toBal.imeis.push(imei);
                        set.add(imei);
                    }
                }
                toBal.quantity = (toBal.imeis || []).length;
            } else {
                toBal.quantity = Number(toBal.quantity || 0) + Number(item.quantity || 0);
            }

            await product.save();

            // Movement: รับโอนย้าย
            await createMovementsForItem({
                productId: product._id,
                action: 'รับโอนย้าย',
                fromBranch: transfer.from_branch,
                toBranch: transfer.to_branch,
                referenceNo: transfer.transfer_number,
                createdBy: req.user.employee_id,
                transitHours,
                imeis: incomingImeis,
                quantity: incomingImeis.length > 0 ? incomingImeis.length : Number(item.quantity || 0)
            });
        }

        transfer.status = 'รับเข้าแล้ว';
        transfer.received_by = req.user.employee_id;
        transfer.updatedAt = new Date();
        const saved = await transfer.save();

        console.log(`[โอนย้ายสินค้า] รับเข้าสำเร็จ: ${transfer.transfer_number}`);
        res.status(200).json({ success: true, message: 'รับเข้าสินค้าสำเร็จ', data: saved });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการรับเข้าสินค้า:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการรับเข้าสินค้า' });
    }
});

// POST /api/transactions
// หน้าที่: บันทึกรายการขายและหักสต็อกอัตโนมัติ
router.post('/transactions', async (req, res) => {
    try {
        const { items, total_amount, payment_method, down_payment, branch_id } = req.body;

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

        // Normalize items to ensure imei/downstream fields are persisted
        const normalizedItems = (items || []).map(it => ({
            product_id: it.product_id,
            product_name: it.product_name,
            imei_sold: (it.imei_sold || it.imei || it.imeiSold || it.serial || it.serial_number || '').toString().trim(),
            quantity: Number(it.quantity) || 1,
            price: Number(it.price) || 0
        }));

        // ==========================================
        // CRITICAL: Stock Deduction Logic (หักสต็อกแยกตามสาขา)
        // ==========================================
        for (const item of normalizedItems) {
            const product = await Product.findById(item.product_id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `ไม่พบสินค้า: ${item.product_name} ในระบบ`
                });
            }

            const bId = branch_id ? branch_id.toString() : '';
            if (!product.stock_balances) product.stock_balances = [];
            let bal = product.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);

            if (!bal) {
                return res.status(400).json({
                    success: false,
                    message: `สินค้า ${item.product_name} ไม่มีอยู่ในคลังของสาขานี้`
                });
            }

            const hasImeisInStock = Array.isArray(bal.imeis) && bal.imeis.length > 0;
            if (hasImeisInStock && item.imei_sold && item.imei_sold.trim() !== '') {
                // กรณีมี IMEI (อุปกรณ์มือถือ/แท็บเล็ต): ลบ IMEI ที่ขายออกจาก array ของสาขานี้
                const imeiIndex = bal.imeis.indexOf(item.imei_sold.trim());
                if (imeiIndex === -1) {
                    return res.status(400).json({
                        success: false,
                        message: `ไม่พบ IMEI: ${item.imei_sold} ในคลังสาขานี้ของสินค้า ${item.product_name}`
                    });
                }
                bal.imeis.splice(imeiIndex, 1);
                bal.quantity = Math.max(0, bal.quantity - 1);
            } else {
                // กรณีไม่มี IMEI (อุปกรณ์เสริม): ลดจำนวนตามที่ซื้อของสาขานี้
                if (bal.quantity < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `สินค้า ${item.product_name} ในสาขานี้มีไม่เพียงพอ (คงเหลือ: ${bal.quantity})`
                    });
                }
                bal.quantity = Math.max(0, bal.quantity - item.quantity);
            }

            // แจ้งเตือน Mongoose ว่ามีการแก้ไขในอาเรย์ย่อยเพื่อให้ระบบทำการเซฟข้อมูลอย่างถูกต้อง
            product.markModified('stock_balances');
            await product.save();
        }

        // บันทึกรายการขาย
        const newTransaction = new Transaction({
            receipt_number,
            branch_id: branch_id || null,
            employee_id: req.user.employee_id, // เก็บ ID พนักงานที่ขาย
            items: normalizedItems,
            total_amount: Number(total_amount) || 0,
            payment_method,
            down_payment: Number(down_payment) || 0,
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
// หน้าที่: ดึงประวัติรายการขายทั้งหมด รองรับการกรองข้อมูล
router.get('/transactions', async (req, res) => {
    try {
        const { date, branch_id, search } = req.query;
        let filter = {};

        // Date filtering
        if (date) {
            const now = new Date();
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(now);
            todayEnd.setHours(23, 59, 59, 999);

            if (date === 'today') {
                filter.created_at = { $gte: todayStart, $lte: todayEnd };
            } else if (date === 'week') {
                const weekStart = new Date(todayStart);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                filter.created_at = { $gte: weekStart, $lte: todayEnd };
            } else if (date === 'month') {
                const monthStart = new Date(todayStart);
                monthStart.setDate(1);
                filter.created_at = { $gte: monthStart, $lte: todayEnd };
            }
        }

        // Branch filtering
        if (branch_id) {
            filter.branch_id = branch_id;
        }

        // Search filtering (receipt_number or items.imei_sold)
        if (search) {
            filter.$or = [
                { receipt_number: { $regex: search, $options: 'i' } },
                { 'items.imei_sold': { $regex: search, $options: 'i' } }
            ];
        }

        const transactions = await Transaction.find(filter)
            .populate('branch_id', 'name')
            .populate('employee_id', 'name emp_id')
            .populate('items.product_id', 'name')
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

// GET /api/transactions/:id - ดึงข้อมูลรายการขายรายใบ
router.get('/transactions/:id', async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id)
            .populate('branch_id')
            .populate('employee_id', 'name emp_id')
            .populate('items.product_id', 'name');

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการ' });
        }

        res.status(200).json({ success: true, data: transaction });
    } catch (error) {
        console.error('API Error GET /api/transactions/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการขาย' });
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

        const branchFilter = {};
        if (req.user && req.user.role === 'พนักงานขาย') {
            branchFilter.branch_id = req.user.branch_id;
        }

        // 1. ยอดขายวันนี้ (Today's Sales)
        const todayTransactions = await Transaction.find({
            created_at: { $gte: todayStart, $lte: todayEnd },
            ...branchFilter
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
        const stockMatchStage = Object.keys(branchFilter).length > 0
            ? [{ $match: { branch_id: branchFilter.branch_id } }]
            : [];

        const stockAgg = await Product.aggregate([
            ...stockMatchStage,
            { $group: { _id: null, totalQuantity: { $sum: '$quantity' }, totalProducts: { $sum: 1 } } }
        ]);
        const totalStock = stockAgg.length > 0 ? stockAgg[0].totalQuantity : 0;
        const totalProducts = stockAgg.length > 0 ? stockAgg[0].totalProducts : 0;

        // 4. สินค้าใกล้หมด (Low Stock: quantity < 5)
        const lowStockCount = await Product.countDocuments({
            quantity: { $lt: 5 },
            ...branchFilter
        });

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
        const recentTransactions = await Transaction.find(branchFilter)
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
