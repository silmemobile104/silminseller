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
    FinanceCompany,
    ProductType,
    ProductUnit,
    ProductColor,
    ProductCapacity,
    ProductCondition,
    ProductName,
    Transaction,
    Transfer,
    Role,
    ImportNotification,
    Member,
    PurchaseOrder,
    AuditLog
} = require('../models');

const { uploadBufferToDriveInFolder } = require('../utils/googleDrive');

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
// Helper to log user activities in Audit Trail
// ==========================================
async function logActivity(req, action, module, description, referenceNo = null, targetId = null, details = null) {
    try {
        const userId = req.user ? req.user.employee_id : null;
        if (!userId) {
            console.warn('[AUDIT] No user found in request to log action:', action);
            return;
        }

        // Get employee name
        const emp = await Employee.findById(userId);
        const userName = emp ? emp.name : 'Unknown User';

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await AuditLog.create({
            action,
            module,
            description,
            target_id: targetId ? targetId.toString() : null,
            reference_no: referenceNo,
            details,
            ip_address: ip,
            user_id: userId,
            user_name: userName
        });
        console.log(`[AUDIT] Action logged: ${description}`);
    } catch (err) {
        console.error('[AUDIT] Failed to log activity:', err);
    }
}

// ==========================================
// ERP Helpers (Stock Balances + Movement)
// ==========================================
const getRequestedBranchId = (req) => {
    const userRole = req.user && req.user.role ? req.user.role : '';
    const userBranchId = req.user && req.user.branch_id ? req.user.branch_id : null;
    const userPermissions = req.user && req.user.permissions ? req.user.permissions : {};

    // Admin/ผู้จัดการ หรือมีสิทธิ์ filter_stock_branch สามารถเลือกสาขาผ่าน query หรือดูทั้งหมดได้
    const canFilterBranch = userPermissions.filter_stock_branch || userRole === 'Administrator' || userRole === 'ผู้จัดการ';

    if (canFilterBranch) {
        if (req.query && req.query.branch_id) return req.query.branch_id;
        return 'ALL'; // แทนที่จะบังคับให้ใช้สาขาตัวเอง ให้คืนค่า 'ALL' เพื่อบอกว่าดูได้ทุกสาขา
    }

    // พนักงานขาย/คนไม่มีสิทธิ์: บังคับสาขาตามตัวเอง
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
    if (!branchId) {
        throw new Error('ไม่พบข้อมูลรหัสสาขาสำหรับการบันทึกยอดสินค้าในคลัง');
    }
    const bId = branchId.toString();
    let bal = productDoc.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);
    if (!bal) {
        productDoc.stock_balances.push({ branch_id: branchId, quantity: 0, imeis: [] });
        bal = productDoc.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);
    }
    return bal;
};

// ฟังก์ชันกลางในการประมวลผลอนุมัตินำเข้าสต็อกสำเร็จ (Finalize PO Import)
const executeFinalizeImport = async (poId, employeeId) => {
    const po = await PurchaseOrder.findById(poId);
    if (!po) {
        const err = new Error('ไม่พบใบสั่งซื้อ');
        err.status = 404;
        throw err;
    }

    if (po.status === 'นำเข้าสำเร็จ' || po.status === 'ยกเลิก') {
        const err = new Error('ใบสั่งซื้อนี้ได้ทำการนำเข้าสต็อกเสร็จสมบูรณ์หรือถูกยกเลิกแล้ว');
        err.status = 400;
        throw err;
    }

    if (!po.branch_id) {
        const err = new Error('ใบสั่งซื้อนี้ไม่มีการระบุรหัสสาขาปลายทาง');
        err.status = 400;
        throw err;
    }

    // === Inventory Integration ===
    for (let item of po.items) {
        const imeisScanned = Array.isArray(item.imeis_scanned) ? item.imeis_scanned : [];
        const qtyToProcess = item.track_imei ? imeisScanned.length : Number(item.received_qty);
        if (qtyToProcess <= 0) continue;

        // Resolve master data IDs
        let typeId = null;
        let colorId = null;
        let capacityId = null;
        let conditionId = null;
        let supplierId = null;

        if (item.category) {
            const type = await ProductType.findOne({ name: item.category });
            typeId = type ? type._id : null;
        }
        if (!typeId) {
            const firstType = await ProductType.findOne();
            typeId = firstType ? firstType._id : null;
        }

        if (item.color) {
            const col = await ProductColor.findOne({ name: item.color });
            colorId = col ? col._id : null;
        }

        if (item.capacity) {
            const cap = await ProductCapacity.findOne({ name: item.capacity });
            capacityId = cap ? cap._id : null;
        }

        const cond = await ProductCondition.findOne({ name: 'มือ1' }) || await ProductCondition.findOne();
        conditionId = cond ? cond._id : null;

        if (po.supplier_name) {
            const supp = await Supplier.findOne({ name: po.supplier_name });
            supplierId = supp ? supp._id : null;
        }

        let unitId = null;
        if (item.unit) {
            const u = await ProductUnit.findOne({ name: item.unit });
            unitId = u ? u._id : null;
        }
        if (!unitId) {
            const defaultUnitName = item.track_imei ? 'เครื่อง' : 'ชิ้น';
            const u = await ProductUnit.findOne({ name: defaultUnitName });
            unitId = u ? u._id : null;
        }

        if (item.track_imei) {
            // For devices tracked by IMEI, create/update a SEPARATE product per IMEI
            const incomingImeis = imeisScanned.map(x => x.toString().trim()).filter(Boolean);
            for (const imei of incomingImeis) {
                let product = await Product.findOne({ product_code: imei });
                if (product) {
                    const err = new Error(`รหัสสินค้า/IMEI (${imei}) มีอยู่ในระบบแล้ว ไม่สามารถนำเข้าซ้ำได้`);
                    err.status = 400;
                    throw err;
                }
                product = new Product({
                    product_code: imei,
                    name: item.product_name,
                    cost_price: item.cost_price,
                    selling_price: item.selling_price,
                    type_id: typeId,
                    color_id: colorId,
                    capacity_id: capacityId,
                    condition_id: conditionId,
                    unit_id: unitId,
                    supplier_id: supplierId,
                    stock_balances: []
                });

                const bal = ensureBranchBalance(product, po.branch_id);
                if (!bal.imeis.includes(imei)) {
                    bal.imeis.push(imei);
                }
                bal.quantity = bal.imeis.length > 0 ? bal.imeis.length : 1;

                const savedProduct = await product.save();

                // Log Movement for this separate IMEI product
                await createMovementsForItem({
                    productId: savedProduct._id,
                    action: 'นำเข้าสินค้า (PO)',
                    fromBranch: null,
                    toBranch: po.branch_id,
                    referenceNo: po.po_number,
                    createdBy: employeeId,
                    transitHours: 0,
                    imeis: [imei],
                    quantity: 1
                });
            }
        } else {
            // For accessories (quantity-tracked), keep a single Product document with general product_code
            let product = await Product.findOne({ product_code: item.product_code });
            if (!product) {
                product = new Product({
                    product_code: item.product_code,
                    name: item.product_name,
                    cost_price: item.cost_price,
                    selling_price: item.selling_price,
                    type_id: typeId,
                    color_id: colorId,
                    capacity_id: capacityId,
                    condition_id: conditionId,
                    unit_id: unitId,
                    supplier_id: supplierId,
                    stock_balances: []
                });
            }

            const bal = ensureBranchBalance(product, po.branch_id);
            bal.quantity = Number(bal.quantity || 0) + qtyToProcess;

            const savedProduct = await product.save();

            // Log Movement for this accessory product
            await createMovementsForItem({
                productId: savedProduct._id,
                action: 'นำเข้าสินค้า (PO)',
                fromBranch: null,
                toBranch: po.branch_id,
                referenceNo: po.po_number,
                createdBy: employeeId,
                transitHours: 0,
                imeis: [],
                quantity: qtyToProcess
            });
        }
    }

    po.status = 'นำเข้าสำเร็จ';
    po.received_by = employeeId;
    await po.save();

    // Log successful finalize PO import to Audit Trail
    try {
        const emp = await Employee.findById(employeeId);
        const userName = emp ? emp.name : 'Unknown User';
        await AuditLog.create({
            action: 'APPROVE',
            module: 'PO',
            description: `อนุมัตินำเข้าและตรวจรับสต็อกสินค้าสำเร็จ ใบสั่งซื้อ เลขที่ ${po.po_number}`,
            target_id: po._id.toString(),
            reference_no: po.po_number,
            user_id: employeeId,
            user_name: userName
        });
    } catch (auditErr) {
        console.error('[AUDIT] Failed to log finalize po import:', auditErr);
    }

    console.log(`[PO] นำเข้าสำเร็จเสร็จสิ้น: PO ${po.po_number} บันทึกคลังสาขาเรียบร้อย`);
    return po;
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
            suppliers,
            financeCompanies
        ] = await Promise.all([
            Branch.find(),
            ProductType.find(),
            ProductUnit.find(),
            ProductColor.find(),
            ProductCapacity.find(),
            ProductCondition.find(),
            ProductName.find(),
            Supplier.find(),
            FinanceCompany.find()
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
                suppliers,
                financeCompanies
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

        // Log product creation
        await logActivity(req, 'CREATE', 'STOCK', `รับเข้าสต็อกสินค้าใหม่: ${product.name} (รหัสสินค้า: ${product.product_code || '-'}) จำนวน ${incomingQty}`, product.product_code, savedProduct._id);

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

// GET /api/products/check-existence
router.get('/products/check-existence', async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสสินค้า' });
        }

        const trimmedCode = code.trim();
        const exists = await Product.exists({
            $or: [
                { product_code: trimmedCode },
                { 'stock_balances.imeis': trimmedCode }
            ]
        });

        res.status(200).json({
            success: true,
            exists: !!exists
        });
    } catch (error) {
        console.error('API Error GET /api/products/check-existence:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบรหัสสินค้า' });
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

        const allBranches = await Branch.find();
        const branchMap = {};
        allBranches.forEach(b => { branchMap[b._id.toString()] = { _id: b._id, name: b.name }; });

        // Step A: Build In-Transit Map
        const pendingTransfers = await Transfer.find({ status: 'รอดำเนินการ' }).populate('from_branch to_branch');
        const inTransitItems = {};
        const transitCodes = new Set();

        pendingTransfers.forEach(tr => {
            const fromName = tr.from_branch ? tr.from_branch.name : 'ต้นทาง';
            const toName = tr.to_branch ? tr.to_branch.name : 'ปลายทาง';
            const toId = tr.to_branch ? tr.to_branch._id.toString() : null;
            const direction = `${fromName} > ${toName}`;

            tr.items.forEach(item => {
                if (item.product_code) {
                    transitCodes.add(item.product_code);
                    if (!inTransitItems[item.product_code]) inTransitItems[item.product_code] = [];
                    inTransitItems[item.product_code].push({
                        to_id: toId,
                        direction,
                        quantity: Number(item.quantity || 0),
                        imeis: item.imeis || []
                    });
                }
            });
        });

        // Step B: Query Filter
        let query = {};
        if (branchId !== 'ALL') {
            query['$or'] = [
                { 'stock_balances.branch_id': branchId },
                { 'product_code': { $in: Array.from(transitCodes) } }
            ];
        }

        // ดึงสินค้าแบบ Master Catalog
        const productsRaw = await Product.find(query)
            .populate('type_id', 'name')
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .populate('supplier_id', 'name')
            .populate('stock_balances.branch_id', 'name')
            .sort({ createdAt: -1 });

        // Step C & D: Map Products (The Core Fix + Clean Admin View)
        let products = [];

        productsRaw.forEach(p => {
            const po = p.toObject();
            const transits = inTransitItems[po.product_code] || [];
            let pushedAnyRow = false;

            // 1. Normal Stock
            if (po.stock_balances && po.stock_balances.length > 0) {
                po.stock_balances.forEach(b => {
                    const bId = b.branch_id ? (b.branch_id._id || b.branch_id).toString() : null;

                    // Filter normal stock if specific branch is requested
                    if (branchId !== 'ALL' && bId !== branchId) return;

                    const qty = Number(b.quantity || 0);

                    // Logic: In Admin view ('ALL'), hide 0-stock branches. For specific branch, show it.
                    if (branchId !== 'ALL' || qty > 0) {
                        const normalRow = { ...po };
                        normalRow.quantity = qty;
                        normalRow.imeis = b.imeis || [];
                        normalRow.branch_id = b.branch_id;
                        normalRow.is_transferring = false;
                        delete normalRow.stock_balances;
                        products.push(normalRow);
                        pushedAnyRow = true;
                    }
                });
            }

            // 2. In-Transit Stock (Synthetic Row)
            transits.forEach(transit => {
                // If specific branch, only append if the branch is the destination
                if (branchId !== 'ALL' && transit.to_id !== branchId) return;

                const syntheticRow = { ...po };
                syntheticRow.quantity = transit.quantity;
                syntheticRow.imeis = transit.imeis;
                syntheticRow.branch_id = { name: transit.direction };
                syntheticRow.is_transferring = true;
                delete syntheticRow.stock_balances;
                products.push(syntheticRow);
                pushedAnyRow = true;
            });

            // 3. Failsafe: If the product is out of stock EVERYWHERE and not transferring
            if (!pushedAnyRow) {
                const failsafeRow = { ...po };
                failsafeRow.quantity = 0;
                failsafeRow.imeis = [];
                failsafeRow.branch_id = null; // Unassigned
                failsafeRow.is_transferring = false;
                delete failsafeRow.stock_balances;
                products.push(failsafeRow);
            }
        });

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

// GET /api/products/global-stock
// หน้าที่: ดึงข้อมูลสินค้าทั้งหมดทุกสาขา เพื่อใช้สำหรับดูราคากลางและสต็อกรวม (Read-only)
router.get('/products/global-stock', async (req, res) => {
    try {
        const productsRaw = await Product.find({})
            .populate('type_id', 'name')
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .populate('supplier_id', 'name')
            .populate('stock_balances.branch_id', 'name')
            .sort({ createdAt: -1 });

        // Transform for frontend
        const products = productsRaw.map(p => {
            const po = p.toObject();
            let totalQty = 0;
            if (po.stock_balances) {
                po.stock_balances.forEach(b => {
                    totalQty += Number(b.quantity || 0);
                });
            }
            return {
                ...po,
                global_total_quantity: totalQty
            };
        });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลสินค้าส่วนกลางสำเร็จ',
            data: products
        });
    } catch (error) {
        console.error('API Error GET /api/products/global-stock:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าส่วนกลาง'
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

        // กรองให้เจอเฉพาะสต็อกของสาขาที่ต้องการ (ยกเว้นกรณีดูทั้งหมด)
        if (branchId !== 'ALL') {
            query['stock_balances.branch_id'] = branchId;
        }

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
        const oldBranchId = productData.old_branch_id || null;
        let stockDeltaQty = 0;
        let incomingImeis = [];

        if (branchId) {
            // กรณีมีการเปลี่ยนสาขา (Move Stock)
            if (oldBranchId && oldBranchId !== branchId) {
                const oldBal = product.stock_balances.find(x => x.branch_id && x.branch_id.toString() === oldBranchId.toString());
                if (oldBal) {
                    // เก็บ IMEIs ที่จะย้ายไปไว้ก่อน (ถ้าไม่ได้ส่งมาใหม่ใน payload)
                    const imeisToMove = (productData.imeis && productData.imeis.length > 0)
                        ? productData.imeis
                        : (oldBal.imeis || []);

                    // เคลียร์ค่าที่สาขาเดิม
                    oldBal.quantity = 0;
                    oldBal.imeis = [];

                    // ตั้งค่าสาขาใหม่
                    const newBal = ensureBranchBalance(product, branchId);
                    newBal.quantity = Number(productData.quantity || 0);
                    newBal.imeis = imeisToMove.map(x => x.toString().trim()).filter(Boolean);

                    incomingImeis = newBal.imeis;
                    stockDeltaQty = newBal.quantity;
                }
            } else {
                // กรณีไม่ได้เปลี่ยนสาขา หรือเป็นการเพิ่มสต็อกปกติ
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
                    const nextQty = Number(productData.quantity || 0);
                    stockDeltaQty = nextQty - prevQty;
                    bal.quantity = nextQty;
                }
            }
        }

        const updatedProduct = await product.save();

        // Log stock/product adjustment
        await logActivity(req, 'UPDATE', 'STOCK', `แก้ไขข้อมูล/ปรับสต็อกสินค้า: ${product.name} (รหัสสินค้า: ${product.product_code || '-'})`, product.product_code, updatedProduct._id);

        // Movement: บันทึกประวัติการเคลื่อนไหว
        if (branchId && stockDeltaQty > 0) {
            await createMovementsForItem({
                productId: updatedProduct._id,
                action: (oldBranchId && oldBranchId !== branchId) ? 'ย้ายสาขา (แก้ไข)' : 'รับเข้าสต็อก',
                fromBranch: (oldBranchId && oldBranchId !== branchId) ? oldBranchId : null,
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

        // Log product deletion
        await logActivity(req, 'DELETE', 'STOCK', `ลบสินค้าออกจากระบบ: ${deletedProduct.name} (รหัสสินค้า: ${deletedProduct.product_code || '-'})`, deletedProduct.product_code, deletedProduct._id);

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
// Movement Ledger APIs (ระบบประวัติการเคลื่อนไหว)
// ==========================================

// GET /api/movements/search
// หน้าที่: ค้นหาประวัติการเคลื่อนไหวของสินค้า/IMEI
router.get('/movements/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสสินค้า หรือ IMEI ที่ต้องการค้นหา' });
        }

        // ค้นหาว่าเป็น IMEI หรือ Product Code
        // ลองค้นหาด้วย Product Code ก่อน
        let product = await Product.findOne({ product_code: query })
            .populate('type_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name');

        let isImeiSearch = false;

        // ถ้าไม่เจอด้วย Product Code ให้ค้นหาด้วย IMEI (ค้นจากสต็อกทุกสาขา หรือจาก Movement)
        if (!product) {
            product = await Product.findOne({ 'stock_balances.imeis': query })
                .populate('type_id', 'name')
                .populate('color_id', 'name')
                .populate('capacity_id', 'name')
                .populate('condition_id', 'name');
            if (product) isImeiSearch = true;
        }

        // ถ้าค้นจาก Product ไม่เจอเลย ลองค้นจากประวัติ Movement โดยตรงเผื่อขายออกไปแล้ว
        if (!product) {
            const movementWithImei = await Movement.findOne({ imei: query }).populate('product_id');
            if (movementWithImei && movementWithImei.product_id) {
                product = await Product.findById(movementWithImei.product_id._id)
                    .populate('type_id', 'name')
                    .populate('color_id', 'name')
                    .populate('capacity_id', 'name')
                    .populate('condition_id', 'name');
                isImeiSearch = true;
            }
        }

        if (!product) {
            return res.status(404).json({ success: false, message: 'ไม่พบประวัติการเคลื่อนไหวของรหัสหรือ IMEI นี้' });
        }

        // สร้างเงื่อนไขการดึงข้อมูล Movement
        const movementQuery = { product_id: product._id };
        if (isImeiSearch) {
            movementQuery.imei = query;
        }

        const movements = await Movement.find(movementQuery)
            .populate('from_branch', 'name')
            .populate('to_branch', 'name')
            .populate('created_by', 'name')
            .sort({ created_at: -1 });

        res.status(200).json({
            success: true,
            message: 'ค้นหาประวัติการเคลื่อนไหวสำเร็จ',
            data: {
                product: {
                    _id: product._id,
                    name: product.name,
                    product_code: product.product_code,
                    type: product.type_id ? product.type_id.name : '',
                    color: product.color_id ? product.color_id.name : '',
                    capacity: product.capacity_id ? product.capacity_id.name : '',
                    condition: product.condition_id ? product.condition_id.name : ''
                },
                is_imei_search: isImeiSearch,
                searched_query: query,
                movements: movements
            }
        });
    } catch (error) {
        console.error('API Error GET /api/movements/search:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการค้นหาประวัติการเคลื่อนไหว'
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
        const defaultPermissions = {
            view_dashboard: false, manage_stock: false, delete_stock: false,
            do_pos: false, manage_personnel: false, manage_branches: false,
            manage_settings: false, manage_roles: false, filter_stock_branch: false,
            cancel_sale: false, report_arrival: false, approve_import: false,
            view_audit_logs: false
        };
        const dbPerms = roleDoc ? roleDoc.permissions.toObject() : {
            view_dashboard: true, manage_stock: true, delete_stock: true,
            do_pos: true, manage_personnel: true, manage_branches: true,
            manage_settings: true, manage_roles: true,
            filter_stock_branch: true, cancel_sale: true,
            report_arrival: true, approve_import: true,
            view_audit_logs: true
        };
        // Merge: DB values override defaults. For old roles missing new fields,
        // fall back to related existing permissions (do_pos → report_arrival, manage_stock → approve_import)
        const permissions = {
            ...defaultPermissions,
            ...dbPerms,
            report_arrival: dbPerms.report_arrival !== undefined ? dbPerms.report_arrival : (dbPerms.do_pos || false),
            approve_import: dbPerms.approve_import !== undefined ? dbPerms.approve_import : (dbPerms.manage_stock || false),
            view_audit_logs: dbPerms.view_audit_logs !== undefined ? dbPerms.view_audit_logs : (dbPerms.manage_settings || false)
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

        // Log successful login to Audit Trail
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await AuditLog.create({
            action: 'LOGIN',
            module: 'AUTH',
            description: `เข้าสู่ระบบสำเร็จ: พนักงาน ${employee.name} (${employee.role})`,
            target_id: employee._id.toString(),
            ip_address: ip,
            user_id: employee._id,
            user_name: employee.name
        }).catch(err => console.error('[AUDIT] Failed to log login activity:', err));

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

// GET /api/auth/me
router.get('/auth/me', async (req, res) => {
    try {
        if (!req.user || !req.user.employee_id) {
            return res.status(401).json({
                success: false,
                message: 'ไม่พบข้อมูลผู้เข้าใช้ระบบ'
            });
        }

        const employee = await Employee.findById(req.user.employee_id).populate('branch_id', 'name');
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบพนักงานในระบบ'
            });
        }

        // ค้นหา Role เพื่อดึง permissions
        const roleDoc = await Role.findOne({ name: employee.role });
        const defaultPermissions = {
            view_dashboard: false, manage_stock: false, delete_stock: false,
            do_pos: false, manage_personnel: false, manage_branches: false,
            manage_settings: false, manage_roles: false, filter_stock_branch: false,
            cancel_sale: false, report_arrival: false, approve_import: false,
            view_audit_logs: false
        };
        const dbPerms = roleDoc ? roleDoc.permissions.toObject() : {
            view_dashboard: true, manage_stock: true, delete_stock: true,
            do_pos: true, manage_personnel: true, manage_branches: true,
            manage_settings: true, manage_roles: true,
            filter_stock_branch: true, cancel_sale: true,
            report_arrival: true, approve_import: true,
            view_audit_logs: true
        };
        const permissions = {
            ...defaultPermissions,
            ...dbPerms,
            report_arrival: dbPerms.report_arrival !== undefined ? dbPerms.report_arrival : (dbPerms.do_pos || false),
            approve_import: dbPerms.approve_import !== undefined ? dbPerms.approve_import : (dbPerms.manage_stock || false),
            view_audit_logs: dbPerms.view_audit_logs !== undefined ? dbPerms.view_audit_logs : (dbPerms.manage_settings || false)
        };

        res.status(200).json({
            success: true,
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
        console.error('API Error GET /api/auth/me:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้งาน'
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
        
        // Log employee creation
        await logActivity(req, 'CREATE', 'PERSONNEL', `เพิ่มพนักงานใหม่: ${name} (รหัสพนักงาน: ${emp_id}, บทบาท: ${role || 'พนักงานขาย'})`, emp_id, saved._id);
        
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

        // Log employee update
        await logActivity(req, 'UPDATE', 'PERSONNEL', `แก้ไขข้อมูลพนักงาน: ${name} (รหัสพนักงาน: ${emp_id}, บทบาท: ${role || 'พนักงานขาย'})`, emp_id, updated._id);

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

        // Log employee deletion
        await logActivity(req, 'DELETE', 'PERSONNEL', `ลบพนักงานออกจากระบบ: ${deleted.name} (รหัสพนักงาน: ${deleted.emp_id})`, deleted.emp_id, deleted._id);

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
        const { name, code } = req.body;

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
            case 'financecompany': Model = FinanceCompany; break;
            default:
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
        }

        console.log(`[MASTER] กำลังเพิ่มข้อมูลใหม่ใน ${collection}: "${name}"`);
        const payload = { name };
        if (collection === 'productname' && code !== undefined) {
            payload.code = code;
        }
        const newItem = new Model(payload);
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
            case 'financecompany': Model = FinanceCompany; break;
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
        const { name, code } = req.body;

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
            case 'financecompany': Model = FinanceCompany; break;
            default:
                return res.status(400).json({ success: false, message: 'ไม่พบประเภทข้อมูลที่ระบุ' });
        }

        const updateFields = { name };
        if (collection === 'productname') {
            updateFields.code = code || '';
        }

        const updatedItem = await Model.findByIdAndUpdate(id, updateFields, { returnDocument: 'after' });

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

// GET /api/transfers/pending-count
// หน้าที่: ดึงจำนวนรายการโอนย้ายที่รอรับเข้าของสาขาปัจจุบัน
router.get('/transfers/pending-count', async (req, res) => {
    try {
        const branchId = req.user && req.user.branch_id ? req.user.branch_id : null;
        if (!branchId) {
            return res.status(200).json({ success: true, data: { count: 0, pendingTransfers: [] } });
        }

        const pendingTransfers = await Transfer.find({
            to_branch: branchId,
            status: 'รอดำเนินการ'
        }).populate('from_branch', 'name').sort({ created_at: -1 });

        const count = pendingTransfers.length;

        res.status(200).json({
            success: true,
            data: {
                count: count,
                pendingTransfers: pendingTransfers.map(t => ({
                    _id: t._id,
                    from_branch_name: t.from_branch ? t.from_branch.name : 'ไม่ทราบสาขา',
                    item_count: t.items.reduce((sum, item) => sum + (item.quantity || 1), 0),
                    created_at: t.created_at
                }))
            }
        });
    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึงข้อมูลรอรับเข้า:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอรับเข้า' });
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
        if (!req.user.permissions.manage_transfers) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการสร้างรายการโอนย้ายสินค้า' });
        }
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

        // Log transfer creation
        await logActivity(req, 'CREATE', 'TRANSFER', `ส่งคำขอโอนย้ายสินค้า เลขที่ ${transfer_number}`, transfer_number, saved._id);

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
        if (!req.user.permissions.manage_transfers) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการรับรายการโอนย้ายสินค้า' });
        }
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

        // Log transfer receipt
        await logActivity(req, 'APPROVE', 'TRANSFER', `รับเข้าสินค้าจากการโอนย้ายสำเร็จ เลขที่ ${transfer.transfer_number}`, transfer.transfer_number, saved._id);

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
        const {
            items, total_amount, payment_method, down_payment, branch_id, member_id,
            payment_type, cash_amount, transfer_amount, finance_company,
            finance_payment_day, finance_months, finance_down_payment_cash, finance_down_payment_transfer
        } = req.body;

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
        const normalizedItems = (items || []).map(it => {
            const period = it.warranty_period || '1 เดือน';
            let expiry = null;
            if (period) {
                expiry = new Date(now);
                if (period === '1 เดือน') expiry.setMonth(expiry.getMonth() + 1);
                else if (period === '2 เดือน') expiry.setMonth(expiry.getMonth() + 2);
                else if (period === '3 เดือน') expiry.setMonth(expiry.getMonth() + 3);
                else if (period === '1 ปี') expiry.setFullYear(expiry.getFullYear() + 1);
            }
            return {
                product_id: it.product_id,
                product_name: it.product_name,
                imei_sold: (it.imei_sold || it.imei || it.imeiSold || it.serial || it.serial_number || '').toString().trim(),
                quantity: Number(it.quantity) || 1,
                price: Number(it.price) || 0,
                warranty_period: period,
                warranty_expiry: expiry
            };
        });

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

            // Movement: ขายออก
            const imeiList = (item.imei_sold && item.imei_sold.trim() !== '') ? [item.imei_sold.trim()] : [];
            await createMovementsForItem({
                productId: product._id,
                action: 'ขายออก',
                fromBranch: branch_id,
                toBranch: null,
                referenceNo: receipt_number,
                createdBy: req.user.employee_id,
                transitHours: 0,
                imeis: imeiList,
                quantity: imeiList.length > 0 ? imeiList.length : item.quantity
            });
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
            payment_type: payment_type || payment_method,
            cash_amount: Number(cash_amount) || 0,
            transfer_amount: Number(transfer_amount) || 0,
            finance_company: finance_company || '',
            finance_payment_day: Number(finance_payment_day) || 0,
            finance_months: Number(finance_months) || 0,
            finance_down_payment_cash: Number(finance_down_payment_cash) || 0,
            finance_down_payment_transfer: Number(finance_down_payment_transfer) || 0,
            member_id: member_id || null,
            created_at: now
        });

        const savedTransaction = await newTransaction.save();

        // Log successful transaction
        await logActivity(req, 'CREATE', 'POS', `ทำรายการขายสำเร็จ เลขที่ใบเสร็จ ${receipt_number} ยอดรวม ฿${total_amount}`, receipt_number, savedTransaction._id);

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
            .populate('member_id', 'first_name last_name phone')
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
            .populate('items.product_id', 'name')
            .populate('member_id', 'prefix first_name last_name first_name_en last_name_en phone address citizen_id member_number')
            .populate('cancelled_by', 'name');

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการ' });
        }

        res.status(200).json({ success: true, data: transaction });
    } catch (error) {
        console.error('API Error GET /api/transactions/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการขาย' });
    }
});

// POST /api/transactions/:id/cancel - ยกเลิกการขาย
router.post('/transactions/:id/cancel', async (req, res) => {
    try {
        const userPerms = req.user && req.user.permissions ? req.user.permissions : {};
        const userRole = req.user ? req.user.role : '';
        const isAdminOrManager = userRole === 'Administrator' || userRole === 'ผู้จัดการ' || userRole === 'แอดมิน';

        if (!isAdminOrManager && !userPerms.cancel_sale) {
            return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์ยกเลิกบิลขาย' });
        }

        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการ' });
        }

        if (transaction.status === 'ยกเลิกแล้ว') {
            return res.status(400).json({ success: false, message: 'บิลนี้ถูกยกเลิกไปแล้ว' });
        }

        const { reason } = req.body;
        if (!reason || reason.trim() === '') {
            return res.status(400).json({ success: false, message: 'กรุณาระบุเหตุผลที่ยกเลิก' });
        }

        // คืนสต็อก
        for (const item of transaction.items) {
            if (!item.product_id) continue;
            const product = await Product.findById(item.product_id);
            if (!product) continue;

            const bId = transaction.branch_id ? transaction.branch_id.toString() : '';
            if (!product.stock_balances) product.stock_balances = [];
            let bal = product.stock_balances.find(x => x.branch_id && x.branch_id.toString() === bId);

            if (!bal) {
                bal = { branch_id: transaction.branch_id, quantity: 0, imeis: [] };
                product.stock_balances.push(bal);
            }

            const imeiList = (item.imei_sold && item.imei_sold.trim() !== '') ? [item.imei_sold.trim()] : [];

            if (imeiList.length > 0) {
                if (!bal.imeis.includes(imeiList[0])) {
                    bal.imeis.push(imeiList[0]);
                }
                bal.quantity += 1;
            } else {
                bal.quantity += item.quantity;
            }

            product.markModified('stock_balances');
            await product.save();

            // Movement: ยกเลิกการขาย
            await createMovementsForItem({
                productId: product._id,
                action: 'ยกเลิกการขาย',
                fromBranch: null,
                toBranch: transaction.branch_id,
                referenceNo: transaction.receipt_number,
                createdBy: req.user.employee_id,
                transitHours: 0,
                imeis: imeiList,
                quantity: imeiList.length > 0 ? imeiList.length : item.quantity
            });
        }

        transaction.status = 'ยกเลิกแล้ว';
        transaction.cancel_reason = reason.trim();
        transaction.cancelled_by = req.user.employee_id;
        transaction.cancelled_at = new Date();

        await transaction.save();

        // Log cancellation
        await logActivity(req, 'CANCEL', 'POS', `ยกเลิกบิลขาย เลขที่ใบเสร็จ ${transaction.receipt_number} เนื่องจาก: ${reason}`, transaction.receipt_number, transaction._id);

        res.status(200).json({ success: true, message: 'ยกเลิกบิลขายและคืนสต็อกสำเร็จ' });
    } catch (error) {
        console.error('API Error POST /api/transactions/:id/cancel:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการยกเลิกบิลขาย' });
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

        // Log role creation
        await logActivity(req, 'CREATE', 'ROLE', `สร้างระดับสิทธิ์/ตำแหน่งใหม่: ${name}`, null, role._id);

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

        // Log role update
        await logActivity(req, 'UPDATE', 'ROLE', `แก้ไขระดับสิทธิ์/ตำแหน่ง: ${role.name}`, null, role._id);

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

        // Log role deletion
        await logActivity(req, 'DELETE', 'ROLE', `ลบระดับสิทธิ์/ตำแหน่ง: ${role.name}`, null, role._id);

        console.log(`[ROLE] ลบตำแหน่ง: ${role.name}`);
        res.status(200).json({ success: true, message: `ลบตำแหน่ง "${role.name}" สำเร็จ` });
    } catch (error) {
        console.error('API Error DELETE /api/roles/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบตำแหน่ง' });
    }
});

// ==========================================
// Audit Logs (ประวัติกิจกรรมพนักงานและระบบ)
// ==========================================
router.get('/audit-logs', async (req, res) => {
    try {
        const userRole = req.user && req.user.role ? req.user.role : '';
        const userPermissions = req.user && req.user.permissions ? req.user.permissions : {};
        
        // จำกัดสิทธิ์เฉพาะผู้มีสิทธิ์ดูประวัติกิจกรรมระบบเท่านั้น
        const hasAccess = !!userPermissions.view_audit_logs;
                          
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลประวัติการทำงานของระบบ'
            });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const filter = {};

        // ค้นหาข้อความ (ครอบคลุม description, reference_no, user_name)
        if (req.query.search && req.query.search.trim() !== '') {
            const searchRegex = new RegExp(req.query.search.trim(), 'i');
            filter.$or = [
                { description: searchRegex },
                { reference_no: searchRegex },
                { user_name: searchRegex }
            ];
        }

        // กรองตาม Module
        if (req.query.module && req.query.module.trim() !== '' && req.query.module !== 'ALL') {
            filter.module = req.query.module.trim();
        }

        // กรองตาม Action
        if (req.query.action && req.query.action.trim() !== '' && req.query.action !== 'ALL') {
            filter.action = req.query.action.trim();
        }

        // กรองตามผู้ใช้
        if (req.query.user_name && req.query.user_name.trim() !== '') {
            filter.user_name = new RegExp(req.query.user_name.trim(), 'i');
        }

        const total = await AuditLog.countDocuments(filter);
        const logs = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.status(200).json({
            success: true,
            data: logs,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('API Error GET /api/audit-logs:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติกิจกรรม'
        });
    }
});

// ==========================================
// Member Management APIs (จัดการสมาชิก)
// ==========================================

// GET /api/members/search - ค้นหาสมาชิก
router.get('/members/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        if (!query || query.length < 2) return res.json({ success: true, data: [] });

        const members = await Member.find({
            $or: [
                { first_name: { $regex: query, $options: 'i' } },
                { last_name: { $regex: query, $options: 'i' } },
                { phone: { $regex: query, $options: 'i' } },
                { citizen_id: { $regex: query, $options: 'i' } },
                { member_number: { $regex: query, $options: 'i' } }
            ]
        }).limit(10);

        res.json({ success: true, data: members });
    } catch (error) {
        console.error('API Error GET /api/members/search:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /api/members - ดึงข้อมูลสมาชิกทั้งหมด
router.get('/members', async (req, res) => {
    try {
        const members = await Member.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: members });
    } catch (error) {
        console.error('API Error GET /api/members:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิก' });
    }
});

// POST /api/members - เพิ่มสมาชิกใหม่
router.post('/members', async (req, res) => {
    try {
        const data = req.body;

        const requiredFields = [
            'citizen_id', 'prefix', 'first_name', 'last_name', 'first_name_en', 'last_name_en',
            'birthdate', 'card_expiry', 'gender', 'address', 'zipcode', 'phone',
            'facebook_name', 'facebook_link', 'line_id', 'referral_source', 'photo'
        ];
        for (const field of requiredFields) {
            if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
                return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องรวมทั้งอ่านบัตรประชาชนด้วย' });
            }
        }
        if (!data.card_front_photo_base64 || data.card_front_photo_base64.trim() === '') {
            return res.status(400).json({ success: false, message: 'กรุณาแนบรูปถ่ายหน้าบัตรประชาชนด้วยทุกครั้ง' });
        }

        // ตรวจสอบเลขบัตรประชาชนซ้ำ (ถ้ามี)
        if (data.citizen_id && data.citizen_id.trim() !== '') {
            const existing = await Member.findOne({ citizen_id: data.citizen_id.trim() });
            if (existing) {
                return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว' });
            }
        }

        let cardFrontPhotoUrl = '';
        if (data.card_front_photo_base64) {
            try {
                const matches = data.card_front_photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                let buffer, mimeType;
                if (matches && matches.length === 3) {
                    mimeType = matches[1];
                    buffer = Buffer.from(matches[2], 'base64');
                } else {
                    mimeType = 'image/jpeg';
                    buffer = Buffer.from(data.card_front_photo_base64, 'base64');
                }
                const fileName = `ID_CARD_${(data.citizen_id || '').trim() || Date.now()}_FRONT_${Date.now()}.jpg`;
                const folderName = 'รูปหน้าบัตร';
                cardFrontPhotoUrl = await uploadBufferToDriveInFolder(buffer, mimeType, fileName, folderName);
            } catch (err) {
                console.error('Error uploading front card to Drive:', err);
            }
        }

        // Auto Generate Member Number: SMXXXXX (เช่น SM00001)
        const lastMember = await Member.findOne({ member_number: { $regex: /^SM\d+$/ } }).sort({ member_number: -1 });
        let nextSeq = 1;
        if (lastMember && lastMember.member_number) {
            const currentSeq = parseInt(lastMember.member_number.replace('SM', ''), 10);
            if (!isNaN(currentSeq)) {
                nextSeq = currentSeq + 1;
            }
        }
        const member_number = `SM${String(nextSeq).padStart(5, '0')}`;

        const newMember = new Member({
            member_number: member_number,
            citizen_id: (data.citizen_id || '').trim(),
            prefix: data.prefix || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            first_name_en: data.first_name_en || '',
            last_name_en: data.last_name_en || '',
            birthdate: data.birthdate || '',
            card_expiry: data.card_expiry || '',
            gender: data.gender || '',
            address: data.address || '',
            photo: data.photo || '',
            card_front_photo: cardFrontPhotoUrl,
            zipcode: data.zipcode || '',
            phone: data.phone || '',
            facebook_name: data.facebook_name || '',
            facebook_link: data.facebook_link || '',
            line_id: data.line_id || '',
            referral_source: data.referral_source || ''
        });

        const saved = await newMember.save();
        console.log(`[MEMBER] เพิ่มสมาชิกใหม่: ${data.first_name} ${data.last_name}`);
        res.status(201).json({ success: true, message: 'เพิ่มสมาชิกใหม่สำเร็จ', data: saved });
    } catch (error) {
        console.error('API Error POST /api/members:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว' });
        }
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มสมาชิก' });
    }
});

// PUT /api/members/:id - แก้ไขข้อมูลสมาชิก
router.put('/members/:id', async (req, res) => {
    try {
        const data = req.body;

        const requiredFields = [
            'citizen_id', 'prefix', 'first_name', 'last_name', 'first_name_en', 'last_name_en',
            'birthdate', 'card_expiry', 'gender', 'address', 'zipcode', 'phone',
            'facebook_name', 'facebook_link', 'line_id', 'referral_source', 'photo'
        ];
        for (const field of requiredFields) {
            if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
                return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องรวมทั้งอ่านบัตรประชาชนด้วย' });
            }
        }
        if (!data.card_front_photo && !data.card_front_photo_base64) {
            return res.status(400).json({ success: false, message: 'กรุณาแนบรูปถ่ายหน้าบัตรประชาชนด้วยทุกครั้ง' });
        }

        // ตรวจสอบเลขบัตรประชาชนซ้ำ (ยกเว้นตัวเอง)
        if (data.citizen_id && data.citizen_id.trim() !== '') {
            const existing = await Member.findOne({ citizen_id: data.citizen_id.trim(), _id: { $ne: req.params.id } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว' });
            }
        }

        let cardFrontPhotoUrl = data.card_front_photo || '';
        if (data.card_front_photo_base64) {
            try {
                const matches = data.card_front_photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                let buffer, mimeType;
                if (matches && matches.length === 3) {
                    mimeType = matches[1];
                    buffer = Buffer.from(matches[2], 'base64');
                } else {
                    mimeType = 'image/jpeg';
                    buffer = Buffer.from(data.card_front_photo_base64, 'base64');
                }
                const fileName = `ID_CARD_${(data.citizen_id || '').trim() || Date.now()}_FRONT_${Date.now()}.jpg`;
                const folderName = 'รูปหน้าบัตร';
                cardFrontPhotoUrl = await uploadBufferToDriveInFolder(buffer, mimeType, fileName, folderName);
            } catch (err) {
                console.error('Error uploading front card to Drive:', err);
            }
        }

        const updateData = {
            citizen_id: (data.citizen_id || '').trim(),
            prefix: data.prefix || '',
            first_name: data.first_name || '',
            last_name: data.last_name || '',
            first_name_en: data.first_name_en || '',
            last_name_en: data.last_name_en || '',
            birthdate: data.birthdate || '',
            card_expiry: data.card_expiry || '',
            gender: data.gender || '',
            address: data.address || '',
            photo: data.photo || '',
            card_front_photo: cardFrontPhotoUrl,
            zipcode: data.zipcode || '',
            phone: data.phone || '',
            facebook_name: data.facebook_name || '',
            facebook_link: data.facebook_link || '',
            line_id: data.line_id || '',
            referral_source: data.referral_source || ''
        };

        const updated = await Member.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updated) return res.status(404).json({ success: false, message: 'ไม่พบสมาชิกที่ระบุ' });

        console.log(`[MEMBER] แก้ไขข้อมูลสมาชิก: ${data.first_name} ${data.last_name}`);
        res.status(200).json({ success: true, message: 'แก้ไขข้อมูลสมาชิกสำเร็จ', data: updated });
    } catch (error) {
        console.error('API Error PUT /api/members/:id:', error);
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว' });
        }
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขข้อมูลสมาชิก' });
    }
});

// DELETE /api/members/:id - ลบสมาชิก
router.delete('/members/:id', async (req, res) => {
    try {
        const deleted = await Member.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: 'ไม่พบสมาชิกที่ระบุ' });

        console.log(`[MEMBER] ลบสมาชิก: ${deleted.first_name} ${deleted.last_name}`);
        res.status(200).json({ success: true, message: 'ลบสมาชิกสำเร็จ' });
    } catch (error) {
        console.error('API Error DELETE /api/members/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบสมาชิก' });
    }
});


// ==========================================
// Import Notifications (แจ้งสินค้าถึงสาขา / ตรวจสอบนำเข้า)
// ==========================================

// POST /api/import-notifications - พนักงานขายแจ้งของถึงสาขา
router.post('/import-notifications', async (req, res) => {
    try {
        const {
            product_name, imeis, color_name, capacity_name,
            type_name, condition_name, supplier_name, unit_name, notes, branch_id
        } = req.body;

        if (!product_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อสินค้า' });
        }

        const targetBranchId = branch_id || req.user.branch_id;
        if (!targetBranchId) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขา กรุณาระบุสาขา' });
        }

        const cleanImeis = Array.isArray(imeis)
            ? imeis.map(x => x.toString().trim()).filter(Boolean)
            : (typeof imeis === 'string' ? imeis.split('\n').map(x => x.trim()).filter(Boolean) : []);

        const notification = new ImportNotification({
            product_name: product_name.trim(),
            imeis: cleanImeis,
            color_name: color_name || '',
            capacity_name: capacity_name || '',
            type_name: type_name || '',
            condition_name: condition_name || '',
            supplier_name: supplier_name || '',
            unit_name: unit_name || '',
            notes: notes || '',
            branch_id: targetBranchId,
            reported_by: req.user.employee_id,
            status: 'รอดำเนินการ'
        });

        await notification.save();

        console.log(`[นำเข้า] แจ้งสินค้าถึงสาขาสำเร็จ: ${product_name} (${cleanImeis.length} IMEI) โดย ${req.user.employee_id}`);
        res.status(201).json({ success: true, message: 'แจ้งสินค้าถึงสาขาสำเร็จ', data: notification });
    } catch (error) {
        console.error('API Error POST /api/import-notifications:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแจ้งสินค้า' });
    }
});

// GET /api/import-notifications - ดึงรายการแจ้งสินค้า
router.get('/import-notifications', async (req, res) => {
    try {
        const { status, branch_id } = req.query;
        const filter = {};
        if (status) filter.status = status;

        // กรองสาขา: Admin/ผู้จัดการ ดูได้ทุกสาขา พนักงานขายดูได้เฉพาะสาขาตัวเอง
        const userPermissions = req.user.permissions || {};
        if (userPermissions.approve_import) {
            if (branch_id) filter.branch_id = branch_id;
        } else {
            filter.branch_id = req.user.branch_id;
        }

        const notifications = await ImportNotification.find(filter)
            .populate('branch_id', 'name')
            .populate('reported_by', 'name emp_id')
            .populate('approved_by', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, message: 'ดึงข้อมูลสำเร็จ', data: notifications });
    } catch (error) {
        console.error('API Error GET /api/import-notifications:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

// POST /api/import-notifications/:id/approve - อนุมัตินำเข้าสต็อก
router.post('/import-notifications/:id/approve', async (req, res) => {
    try {
        const { cost_price, selling_price, type_id, color_id, capacity_id, condition_id, supplier_id, unit_id, product_code } = req.body;

        if (!cost_price || !selling_price) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกราคาทุนและราคาขาย' });
        }
        if (!type_id) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกหมวดหมู่สินค้า' });
        }

        const notification = await ImportNotification.findById(req.params.id);
        if (!notification) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ระบุ' });
        if (notification.status === 'นำเข้าสำเร็จ') {
            return res.status(400).json({ success: false, message: 'รายการนี้ถูกอนุมัติไปแล้ว' });
        }

        let finalUnitId = unit_id;
        if (!finalUnitId && notification.unit_name) {
            const u = await ProductUnit.findOne({ name: notification.unit_name });
            finalUnitId = u ? u._id : null;
        }

        const branchId = notification.branch_id;
        const incomingImeis = notification.imeis || [];

        // Find or create Product(s)
        const savedProducts = [];
        if (incomingImeis.length > 0) {
            // Create a separate product for each IMEI
            for (const imei of incomingImeis) {
                let product = await Product.findOne({ product_code: imei });
                if (!product) {
                    product = new Product({
                        product_code: imei,
                        name: notification.product_name,
                        cost_price: Number(cost_price),
                        selling_price: Number(selling_price),
                        type_id,
                        color_id: color_id || null,
                        capacity_id: capacity_id || null,
                        condition_id: condition_id || null,
                        unit_id: finalUnitId || null,
                        supplier_id: supplier_id || null,
                        stock_balances: []
                    });
                } else {
                    product.cost_price = Number(cost_price);
                    product.selling_price = Number(selling_price);
                }

                const bal = ensureBranchBalance(product, branchId);
                const set = new Set((bal.imeis || []).map(x => x.toString().trim()));
                if (!set.has(imei)) {
                    bal.imeis.push(imei);
                }
                bal.quantity = bal.imeis.length > 0 ? bal.imeis.length : 1;

                const savedProduct = await product.save();
                savedProducts.push(savedProduct);

                // Log Movement for this single IMEI
                await createMovementsForItem({
                    productId: savedProduct._id,
                    action: 'นำเข้าสินค้า',
                    fromBranch: null,
                    toBranch: branchId,
                    referenceNo: `IMP-${notification._id.toString().slice(-6).toUpperCase()}`,
                    createdBy: req.user.employee_id,
                    transitHours: 0,
                    imeis: [imei],
                    quantity: 1
                });
            }
        } else {
            // No IMEIs, just one product
            let product = null;
            if (product_code) {
                product = await Product.findOne({ product_code });
            }
            if (!product) {
                const matchQuery = { name: notification.product_name, type_id };
                if (color_id) matchQuery.color_id = color_id;
                if (capacity_id) matchQuery.capacity_id = capacity_id;
                if (condition_id) matchQuery.condition_id = condition_id;
                product = await Product.findOne(matchQuery);
            }

            if (!product) {
                product = new Product({
                    product_code: product_code || '',
                    name: notification.product_name,
                    cost_price: Number(cost_price),
                    selling_price: Number(selling_price),
                    type_id,
                    color_id: color_id || null,
                    capacity_id: capacity_id || null,
                    condition_id: condition_id || null,
                    unit_id: finalUnitId || null,
                    supplier_id: supplier_id || null,
                    stock_balances: []
                });
            } else {
                product.cost_price = Number(cost_price);
                product.selling_price = Number(selling_price);
            }

            const bal = ensureBranchBalance(product, branchId);
            bal.quantity = Number(bal.quantity || 0) + 1;

            const savedProduct = await product.save();
            savedProducts.push(savedProduct);

            await createMovementsForItem({
                productId: savedProduct._id,
                action: 'นำเข้าสินค้า',
                fromBranch: null,
                toBranch: branchId,
                referenceNo: `IMP-${notification._id.toString().slice(-6).toUpperCase()}`,
                createdBy: req.user.employee_id,
                transitHours: 0,
                imeis: [],
                quantity: 1
            });
        }

        // Mark notification approved
        notification.status = 'นำเข้าสำเร็จ';
        notification.approved_by = req.user.employee_id;
        notification.approved_at = new Date();
        if (savedProducts.length > 0) {
            notification.product_id = savedProducts[0]._id; // Store first product ref
        }
        await notification.save();

        console.log(`[นำเข้า] อนุมัตินำเข้าสต็อกสำเร็จ: ${notification.product_name} → สาขา ${branchId} (${savedProducts.length} รายการ)`);
        res.status(200).json({ success: true, message: 'นำเข้าสต็อกสำเร็จ', data: { notification, products: savedProducts } });
    } catch (error) {
        console.error('API Error POST /api/import-notifications/:id/approve:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอนุมัตินำเข้า' });
    }
});

// GET /api/warranty/check - ตรวจสอบประกัน
router.get('/warranty/check', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุคำค้นหา' });
        }

        const qRegex = new RegExp(q, 'i');

        // Find members that match the query
        const members = await Member.find({
            $or: [
                { first_name: qRegex },
                { last_name: qRegex },
                { phone: qRegex }
            ]
        });
        const memberIds = members.map(m => m._id);

        // Find transactions matching member OR IMEI
        const transactions = await Transaction.find({
            status: 'เสร็จสิ้น',
            $or: [
                { member_id: { $in: memberIds } },
                { 'items.imei_sold': qRegex }
            ]
        })
            .populate('branch_id', 'name')
            .populate('member_id', 'first_name last_name phone')
            .sort({ created_at: -1 });

        const results = [];
        transactions.forEach(txn => {
            txn.items.forEach(item => {
                const matchesImei = item.imei_sold && item.imei_sold.match(qRegex);
                const matchesMember = txn.member_id && memberIds.some(id => id.equals(txn.member_id._id));

                if (matchesImei || matchesMember) {
                    if (item.imei_sold && item.warranty_expiry) {
                        results.push({
                            receipt_number: txn.receipt_number,
                            txn_id: txn._id,
                            created_at: txn.created_at,
                            product_name: item.product_name,
                            imei_sold: item.imei_sold,
                            warranty_period: item.warranty_period,
                            warranty_expiry: item.warranty_expiry,
                            member: txn.member_id,
                            branch: txn.branch_id
                        });
                    }
                }
            });
        });

        res.status(200).json({ success: true, message: 'ค้นหาข้อมูลสำเร็จ', data: results });
    } catch (error) {
        console.error('API Error GET /api/warranty/check:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบประกัน' });
    }
});

// ==========================================
// Purchase Order APIs (ระบบสั่งซื้อ)
// ==========================================

// POST /api/purchase-orders
// หน้าที่: สร้าง PO ใหม่ (ดั้งเดิม)
router.post('/purchase-orders', async (req, res) => {
    try {
        if (!req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการสร้างใบสั่งซื้อ' });
        }

        const { supplier_name, branch_id, items } = req.body;
        if (!supplier_name || !branch_id || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // Auto-generate po_number: PO-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await PurchaseOrder.countDocuments({ po_number: new RegExp(`^PO-${dateStr}`) });
        const po_number = `PO-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        const poItems = items.map(item => ({
            product_name: item.product_name,
            product_code: item.product_code,
            category: item.category,
            color: item.color,
            capacity: item.capacity,
            track_imei: item.track_imei,
            ordered_qty: Number(item.ordered_qty),
            cost_price: Number(item.cost_price),
            selling_price: Number(item.selling_price),
            imeis_scanned: []
        }));

        const newPO = new PurchaseOrder({
            po_number,
            supplier_name,
            branch_id,
            items: poItems,
            created_by: req.user.employee_id,
            status: 'รอจัดส่ง'
        });

        await newPO.save();

        await logActivity(req, 'CREATE', 'PO', `สร้างใบสั่งซื้อใหม่ เลขที่ ${po_number} สำหรับซัพพลายเออร์ ${supplier_name}`, po_number, newPO._id);

        res.status(201).json({
            success: true,
            message: 'สร้างใบสั่งซื้อสำเร็จ',
            data: newPO
        });
    } catch (error) {
        console.error('API Error POST /api/purchase-orders:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างใบสั่งซื้อ' });
    }
});

// POST /api/po/create
// หน้าที่: สร้าง PO ใหม่ (Connected Workflow - Purchasing)
router.post('/po/create', async (req, res) => {
    try {
        if (!req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการสร้างใบสั่งซื้อ' });
        }

        const { supplier_name, branch_id, items } = req.body;
        if (!supplier_name || !branch_id || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // Auto-generate po_number: PO-YYYYMMDD-XXXX
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await PurchaseOrder.countDocuments({ po_number: new RegExp(`^PO-${dateStr}`) });
        const po_number = `PO-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        const poItems = items.map(item => ({
            product_name: item.product_name,
            product_code: item.product_code,
            category: item.category,
            color: item.color,
            capacity: item.capacity,
            track_imei: item.track_imei,
            ordered_qty: Number(item.ordered_qty),
            cost_price: Number(item.cost_price),
            selling_price: Number(item.selling_price),
            imeis_scanned: []
        }));

        const newPO = new PurchaseOrder({
            po_number,
            supplier_name,
            branch_id,
            items: poItems,
            created_by: req.user.employee_id,
            status: 'รอจัดส่ง'
        });

        await newPO.save();

        await logActivity(req, 'CREATE', 'PO', `สร้างใบสั่งซื้อใหม่ เลขที่ ${po_number} สำหรับซัพพลายเออร์ ${supplier_name}`, po_number, newPO._id);

        res.status(201).json({
            success: true,
            message: 'สร้างใบสั่งซื้อสำเร็จ',
            data: newPO
        });
    } catch (error) {
        console.error('API Error POST /api/po/create:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างใบสั่งซื้อ' });
    }
});

// GET /api/purchase-orders
// หน้าที่: ดึงข้อมูลใบสั่งซื้อทั้งหมด
router.get('/purchase-orders', async (req, res) => {
    try {
        let query = {};
        if (!req.user.permissions.manage_po) {
            // สำหรับพนักงานสาขา / คลังสินค้า / สต็อก / ผู้จัดการ
            if (
                req.user.permissions.receive_po || 
                req.user.permissions.approve_import ||
                req.user.permissions.report_arrival ||
                req.user.role === 'พนักงานขาย' || 
                req.user.role === 'พนักงานสต็อก' || 
                req.user.role === 'พนักงานสาขา' ||
                req.user.role === 'ผู้จัดการ'
            ) {
                // หากมีสิทธิ์ filter_stock_branch (เช่น คลังสินค้าส่วนกลาง) ให้เห็น PO ของทุกสาขา
                if (!req.user.permissions.filter_stock_branch) {
                    query.branch_id = req.user.branch_id;
                }
            } else {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการดูใบสั่งซื้อ' });
            }
        }

        const pos = await PurchaseOrder.find(query)
            .populate('branch_id', 'name address')
            .populate('created_by', 'name role')
            .populate('received_by', 'name')
            .populate('arrival_reported_by', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลใบสั่งซื้อสำเร็จ',
            data: pos
        });
    } catch (error) {
        console.error('API Error GET /api/purchase-orders:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลใบสั่งซื้อ' });
    }
});

// POST /api/purchase-orders/:id/update
// หน้าที่: แก้ไขใบสั่งซื้อ
router.post('/purchase-orders/:id/update', async (req, res) => {
    try {
        if (!req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการแก้ไขใบสั่งซื้อ' });
        }

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ' });
        }

        if (po.status !== 'รอจัดส่ง' && po.status !== 'สั่งซื้อแล้ว') {
            return res.status(400).json({ success: false, message: 'ไม่สามารถแก้ไขใบสั่งซื้อที่ถูกจัดส่งหรือนำเข้าคลังแล้วได้' });
        }

        const { supplier_name, branch_id, items } = req.body;
        if (!supplier_name || !branch_id || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        const poItems = items.map(item => ({
            product_name: item.product_name,
            product_code: item.product_code,
            category: item.category,
            color: item.color,
            capacity: item.capacity,
            unit: item.unit,
            track_imei: !!item.track_imei,
            ordered_qty: Number(item.ordered_qty),
            cost_price: Number(item.cost_price),
            selling_price: Number(item.selling_price),
            imeis_scanned: []
        }));

        po.supplier_name = supplier_name;
        po.branch_id = branch_id;
        po.items = poItems;

        await po.save();

        await logActivity(req, 'UPDATE', 'PO', `แก้ไขใบสั่งซื้อ เลขที่ ${po.po_number} ซัพพลายเออร์ ${supplier_name}`, po.po_number, po._id);

        res.status(200).json({
            success: true,
            message: 'แก้ไขใบสั่งซื้อสำเร็จ',
            data: po
        });
    } catch (error) {
        console.error('API Error POST /api/purchase-orders/:id/update:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขใบสั่งซื้อ' });
    }
});

// POST /api/purchase-orders/:id/cancel
// หน้าที่: ยกเลิกใบสั่งซื้อ
router.post('/purchase-orders/:id/cancel', async (req, res) => {
    try {
        if (!req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการยกเลิกใบสั่งซื้อ' });
        }

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ' });
        }

        if (po.status !== 'รอจัดส่ง' && po.status !== 'สั่งซื้อแล้ว') {
            return res.status(400).json({ success: false, message: 'ไม่สามารถยกเลิกใบสั่งซื้อที่ถูกจัดส่งหรือนำเข้าคลังแล้วได้' });
        }

        po.status = 'ยกเลิก';
        await po.save();

        await logActivity(req, 'CANCEL', 'PO', `ยกเลิกใบสั่งซื้อ เลขที่ ${po.po_number}`, po.po_number, po._id);

        res.status(200).json({
            success: true,
            message: 'ยกเลิกใบสั่งซื้อสำเร็จ',
            data: po
        });
    } catch (error) {
        console.error('API Error POST /api/purchase-orders/:id/cancel:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการยกเลิกใบสั่งซื้อ' });
    }
});

// POST /api/po/:id/report-arrival
// หน้าที่: แจ้งของถึงสาขาแล้ว พร้อมสแกน/ระบุ IMEI ครบถ้วน (Sales / Front Store)
router.post('/po/:id/report-arrival', async (req, res) => {
    try {
        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ' });
        }

        const { received_items } = req.body;
        if (!received_items) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลสินค้าและ IMEI' });
        }

        for (let item of po.items) {
            const data = received_items[item._id.toString()];
            if (!data) {
                return res.status(400).json({ success: false, message: `กรุณากรอกข้อมูลสำหรับสินค้า ${item.product_name}` });
            }

            if (item.track_imei) {
                const listImeis = Array.isArray(data.imeis) ? data.imeis.map(x => x.toString().trim()).filter(Boolean) : [];
                
                // ตรวจสอบว่าจำนวน IMEI ครบตามจำนวนที่สั่งซื้อหรือไม่
                if (listImeis.length !== item.ordered_qty) {
                    return res.status(400).json({ 
                        success: false, 
                        message: `สินค้า ${item.product_name} ต้องการ IMEI จำนวน ${item.ordered_qty} รายการ (คุณระบุมา ${listImeis.length} รายการ)` 
                    });
                }

                // ตรวจสอบ IMEI ซ้ำกันเองในรายการที่ส่งมา
                const uniqueImeis = [...new Set(listImeis)];
                if (uniqueImeis.length !== listImeis.length) {
                    return res.status(400).json({
                        success: false,
                        message: `พบหมายเลข IMEI ซ้ำกันในสินค้า ${item.product_name}`
                    });
                }

                // ตรวจสอบว่า IMEI ซ้ำกับในคลังสินค้าหลักหรือไม่
                const existingProduct = await Product.findOne({
                    'stock_balances.imeis': { $in: listImeis }
                });
                if (existingProduct) {
                    return res.status(400).json({
                        success: false,
                        message: `หมายเลข IMEI บางรายการสำหรับ ${item.product_name} มีอยู่ในสต็อกระบบแล้ว กรุณาตรวจสอบ`
                    });
                }

                item.imeis_scanned = listImeis;
                item.received_qty = listImeis.length;
            } else {
                // สินค้าทั่วไป (ไม่มี IMEI)
                const qty = Number(data.qty || 0);
                if (qty !== item.ordered_qty) {
                    return res.status(400).json({
                        success: false,
                        message: `สินค้า ${item.product_name} ต้องระบุจำนวนให้ครบ ${item.ordered_qty} ชิ้น (คุณระบุมา ${qty} ชิ้น)`
                    });
                }
                item.received_qty = qty;
            }
        }

        po.status = 'ของถึงสาขาแล้ว';
        po.arrival_reported_by = req.user.employee_id;
        po.arrival_reported_at = new Date();
        await po.save();

        // Log to Audit Trail
        await logActivity(req, 'UPDATE', 'PO', `แจ้งของถึงสาขาสำเร็จพร้อมระบุ IMEI ใบสั่งซื้อ เลขที่ ${po.po_number}`, po.po_number, po._id);

        console.log(`[PO] แจ้งของถึงสาขาสำเร็จพร้อมสแกน IMEI: PO ${po.po_number} โดย ${req.user.name}`);
        res.status(200).json({
            success: true,
            message: 'แจ้งสถานะของถึงสาขาและบันทึก IMEI สำเร็จ',
            data: po
        });
    } catch (error) {
        console.error('API Error POST /api/po/:id/report-arrival:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแจ้งของถึงสาขา' });
    }
});

// POST /api/po/:id/scan-item
// หน้าที่: บันทึกข้อมูลสแกนสินค้าและ IMEI ชั่วคราว (Stock / Receive)
router.post('/po/:id/scan-item', async (req, res) => {
    try {
        if (!req.user.permissions.receive_po && !req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการตรวจรับสินค้า' });
        }

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ' });
        }

        if (po.status === 'นำเข้าสำเร็จ' || po.status === 'ยกเลิก') {
            return res.status(400).json({ success: false, message: 'ใบสั่งซื้อนี้ไม่สามารถสแกนตรวจรับได้แล้ว' });
        }

        const { received_items } = req.body; // { item_id: { qty: X, imeis: [] } }
        if (!received_items) {
            return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลตรวจรับสินค้า' });
        }

        for (let item of po.items) {
            const data = received_items[item._id.toString()];
            if (data) {
                if (item.track_imei) {
                    const newImeis = Array.isArray(data.imeis) ? data.imeis.map(x => x.toString().trim()).filter(Boolean) : [];
                    
                    // Validate each IMEI against existing products in database
                    for (const imei of newImeis) {
                        const exists = await Product.exists({
                            $or: [
                                { product_code: imei },
                                { 'stock_balances.imeis': imei }
                            ]
                        });
                        if (exists) {
                            return res.status(400).json({
                                success: false,
                                message: `รหัสสินค้า/IMEI (${imei}) นี้มีอยู่ในระบบแล้ว ไม่อนุญาตให้ดำเนินการตรวจรับต่อ`
                            });
                        }
                    }
                    
                    item.imeis_scanned = newImeis;
                    item.received_qty = item.imeis_scanned.length;
                } else {
                    item.received_qty = Number(data.qty) || 0;
                }
            }
        }

        po.status = 'กำลังตรวจรับ';
        await po.save();

        console.log(`[PO] อัพเดทข้อมูลสแกน: PO ${po.po_number}`);
        res.status(200).json({
            success: true,
            message: 'บันทึกข้อมูลสแกนชั่วคราวสำเร็จ',
            data: po
        });
    } catch (error) {
        console.error('API Error POST /api/po/:id/scan-item:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลสแกน' });
    }
});

// POST /api/po/:id/finalize-import
// หน้าที่: ตรวจสอบขั้นตอนสุดท้าย อนุมัตินำเข้าสต็อกสาขาและบันทึกประวัติการย้าย (Stock Finalize)
router.post('/po/:id/finalize-import', async (req, res) => {
    try {
        if (!req.user.permissions.receive_po && !req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการตรวจรับสินค้า' });
        }

        const po = await executeFinalizeImport(req.params.id, req.user.employee_id);

        res.status(200).json({
            success: true,
            message: 'ตรวจรับและนำเข้าสต็อกสำเร็จเรียบร้อย',
            data: po
        });
    } catch (error) {
        console.error('API Error POST /api/po/:id/finalize-import:', error);
        res.status(error.status || 500).json({ success: false, message: error.message || 'เกิดข้อผิดพลาดในการนำเข้าสต็อกสินค้า' });
    }
});

// POST /api/purchase-orders/:id/receive
// หน้าที่: ตรวจรับสินค้าจาก PO (ดั้งเดิม - ให้เรียกตรงไปที่ Finalize Import เพื่อไม่ให้กระทบระบบเก่า)
router.post('/purchase-orders/:id/receive', async (req, res) => {
    try {
        if (!req.user.permissions.receive_po && !req.user.permissions.manage_po) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการตรวจรับสินค้า' });
        }

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อ' });
        }

        if (po.status === 'นำเข้าสำเร็จ' || po.status === 'ยกเลิก') {
            return res.status(400).json({ success: false, message: 'ใบสั่งซื้อนี้ไม่สามารถตรวจรับได้อีก' });
        }

        const { received_items } = req.body; // { item_id: { qty: X, imeis: [] } }

        for (let item of po.items) {
            const receivedData = received_items[item._id.toString()];
            if (receivedData) {
                if (item.track_imei) {
                    const newImeis = Array.isArray(receivedData.imeis) ? receivedData.imeis : [];
                    item.imeis_scanned = newImeis;
                    item.received_qty = item.imeis_scanned.length;
                } else {
                    const qty = Number(receivedData.qty) || 0;
                    item.received_qty = qty;
                }
            }
        }

        po.status = 'กำลังตรวจรับ';
        await po.save();

        // ทริกเกอร์ Finalize Import ทันทีเพื่อให้ระบบเก่ายังทำงานแบบขั้นตอนเดียวจบได้ไร้รอยต่อ!
        const finalizedPo = await executeFinalizeImport(po._id, req.user.employee_id);

        res.status(200).json({
            success: true,
            message: 'ตรวจรับและนำเข้าสต็อกสำเร็จเรียบร้อย',
            data: finalizedPo
        });
    } catch (error) {
        console.error('API Error POST /api/purchase-orders/:id/receive:', error);
        res.status(error.status || 500).json({ success: false, message: error.message || 'เกิดข้อผิดพลาดในการตรวจรับสินค้า' });
    }
});

module.exports = router;

