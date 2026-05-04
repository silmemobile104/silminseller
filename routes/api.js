const express = require('express');
const router = express.Router();
const {
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
} = require('../models');

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

// 5. POST /api/login
// หน้าที่: ตรวจสอบพนักงานจาก collection employee โดยเช็คชื่อผู้ใช้งานและรหัสผ่าน
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน'
            });
        }

        // ค้นหาพนักงานจากรหัสพนักงาน (username) - ใช้ emp_id
        const employee = await Employee.findOne({ emp_id: username }).populate('branch_id', 'name');

        if (!employee) {
            return res.status(401).json({
                success: false,
                message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // เช็ครหัสผ่าน
        if (employee.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // ลบรหัสผ่านออกจากข้อมูลที่จะส่งกลับไปให้ Frontend
        const employeeData = {
            id: employee._id,
            name: employee.name,
            emp_id: employee.emp_id,
            branch: employee.branch_id
        };

        res.status(200).json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            data: employeeData
        });

    } catch (error) {
        console.error('API Error /api/login:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง'
        });
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

module.exports = router;
