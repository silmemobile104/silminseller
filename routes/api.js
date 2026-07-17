const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
    AuditLog,
    CashMovement,
    FinanceReceivable,
    StockAuditSession,
    StockAuditItem,
    Deposit,
    Requisition
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
        if (decoded && decoded.permissions) {
            if (decoded.permissions.manage_stock_audit === undefined) {
                decoded.permissions.manage_stock_audit = (decoded.role === 'แอดมิน' || decoded.role === 'ผู้จัดการ' || decoded.permissions.manage_settings || false);
            }
            if (decoded.permissions.do_stock_audit === undefined) {
                decoded.permissions.do_stock_audit = (decoded.role === 'แอดมิน' || decoded.role === 'ผู้จัดการ' || decoded.permissions.do_pos || false);
            }
        }
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
        if (item.track_imei) {
            const imeisScanned = Array.isArray(item.imeis_scanned) ? item.imeis_scanned : [];
            const importedImeis = Array.isArray(item.imported_imeis) ? item.imported_imeis : [];

            // ดึงเฉพาะ IMEI ใหม่ที่ยังไม่เคยนำเข้าสต็อก
            const newImeis = imeisScanned.filter(imei => !importedImeis.includes(imei));
            if (newImeis.length === 0) continue;

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
                const defaultUnitName = 'เครื่อง';
                const u = await ProductUnit.findOne({ name: defaultUnitName });
                unitId = u ? u._id : null;
            }

            // For devices tracked by IMEI, create/update a SEPARATE product per IMEI
            for (const imei of newImeis) {
                let product = await Product.findOne({ product_code: imei });
                if (product) {
                    // หากมีสินค้าตัวนี้ในสต็อกแล้ว (เช่น ในกรณีที่เคยนำเข้าบิลอื่นหรือเคยบันทึกไปแล้ว)
                    // ให้บันทึกเข้ารายการ imported_imeis และทำรายการถัดไปโดยไม่โยนข้อผิดพลาด
                    if (!item.imported_imeis.includes(imei)) {
                        item.imported_imeis.push(imei);
                    }
                    continue;
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

                if (!item.imported_imeis.includes(imei)) {
                    item.imported_imeis.push(imei);
                }
            }
            item.imported_qty = item.imported_imeis.length;
        } else {
            // Accessories (General Products)
            const currentReceived = Number(item.received_qty || 0);
            const prevImported = Number(item.imported_qty || 0);
            const qtyToProcess = currentReceived - prevImported;
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
                const defaultUnitName = 'ชิ้น';
                const u = await ProductUnit.findOne({ name: defaultUnitName });
                unitId = u ? u._id : null;
            }

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

            item.imported_qty = prevImported + qtyToProcess;
        }
    }

    // Check if fully imported
    const isFullyImported = po.items.every(item => {
        const targetQty = item.ordered_qty;
        const currentQty = item.track_imei ? (item.imported_imeis ? item.imported_imeis.length : 0) : (item.imported_qty || 0);
        return currentQty >= targetQty;
    });

    if (isFullyImported) {
        po.status = 'นำเข้าสำเร็จ';
    } else {
        // หากยังนำเข้าไม่ครบ ให้รีเซ็ตกลับสถานะ 'รอจัดส่ง' เพื่อให้สามารถแจ้งของที่เหลือเพิ่มทีหลังได้
        po.status = 'รอจัดส่ง';
    }

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

        // ป้องกันสินค้าซ้ำ: หากข้อมูลสินค้าที่เพิ่มใหม่เหมือนกับสินค้าที่มีอยู่แล้วทุกอย่าง ให้ใช้รายการเดิม (เพื่อบวกจำนวนเพิ่ม)
        // แต่หากต่างกันเพียงแม้แต่ช่องเดียว ให้สร้างรายการสินค้าใหม่ทันที
        let product = null;
        const searchCode = productData.product_code ? productData.product_code.trim() : '';
        const candidates = await Product.find({ product_code: searchCode });

        for (const cand of candidates) {
            const sameSupplier = (cand.supplier_id ? cand.supplier_id.toString() : '') === (productData.supplier_id ? productData.supplier_id.toString() : '');
            const sameName = cand.name === productData.name;
            const sameCost = Number(cand.cost_price) === Number(productData.cost_price);
            const sameSelling = Number(cand.selling_price) === Number(productData.selling_price);
            const sameType = (cand.type_id ? cand.type_id.toString() : '') === (productData.type_id ? productData.type_id.toString() : '');
            const sameColor = (cand.color_id ? cand.color_id.toString() : '') === (productData.color_id ? productData.color_id.toString() : '');
            const sameCapacity = (cand.capacity_id ? cand.capacity_id.toString() : '') === (productData.capacity_id ? productData.capacity_id.toString() : '');
            const sameCondition = (cand.condition_id ? cand.condition_id.toString() : '') === (productData.condition_id ? productData.condition_id.toString() : '');
            const sameUnit = (cand.unit_id ? cand.unit_id.toString() : '') === (productData.unit_id ? productData.unit_id.toString() : '');

            if (sameSupplier && sameName && sameCost && sameSelling && sameType && sameColor && sameCapacity && sameCondition && sameUnit) {
                product = cand;
                break;
            }
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

        // Fetch branch name for logging
        let branchName = 'ไม่ระบุสาขา';
        try {
            const branchObj = await Branch.findById(branchId);
            if (branchObj) {
                branchName = branchObj.name;
            }
        } catch (branchErr) {
            console.error('Failed to fetch branch name for audit log:', branchErr);
        }

        const importSource = productData.import_source === 'EXCEL' ? 'EXCEL' : 'MANUAL';
        const importSourceText = importSource === 'EXCEL' ? 'ผ่าน Excel' : 'แบบปกติ';

        // Log product creation with structured details
        await logActivity(req, 'CREATE', 'STOCK', `รับเข้าสต็อกสินค้าใหม่ (${importSourceText}): ${product.name} (รหัสสินค้า: ${product.product_code || '-'}) จำนวน ${incomingQty}`, product.product_code, savedProduct._id, {
            branch_id: branchId,
            branch_name: branchName,
            import_source: importSource,
            quantity: incomingQty,
            imeis: incomingImeis,
            product_name: product.name,
            product_code: product.product_code
        });

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

// GET /api/products/direct-imports-history
router.get('/products/direct-imports-history', async (req, res) => {
    try {
        const filter = {
            module: 'STOCK',
            action: 'CREATE'
        };

        // If a search query is provided, search in description or user_name or reference_no
        if (req.query.search && req.query.search.trim() !== '') {
            const searchRegex = new RegExp(req.query.search.trim(), 'i');
            filter.$or = [
                { description: searchRegex },
                { user_name: searchRegex },
                { reference_no: searchRegex }
            ];
        }

        const logs = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(100);

        res.status(200).json({
            success: true,
            data: logs
        });
    } catch (error) {
        console.error('API Error GET /api/products/direct-imports-history:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการนำเข้าโดยตรง'
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

// POST /api/products/validate-prices
// หน้าที่: ตรวจสอบราคาต้นทุนและราคาขายแนะนำของสินค้าในตะกร้าจากฐานข้อมูลเพื่อความปลอดภัย
router.post('/products/validate-prices', async (req, res) => {
    try {
        const { product_ids } = req.body;
        if (!product_ids || !Array.isArray(product_ids)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุรายการรหัสสินค้าให้ถูกต้อง' });
        }

        const products = await Product.find({ _id: { $in: product_ids } }, 'cost_price selling_price');
        const priceMap = {};
        products.forEach(p => {
            priceMap[p._id.toString()] = {
                cost_price: p.cost_price,
                selling_price: p.selling_price
            };
        });

        res.status(200).json({
            success: true,
            data: priceMap
        });
    } catch (error) {
        console.error('API Error POST /api/products/validate-prices:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงราคาสินค้าจากฐานข้อมูล' });
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

        // ตรวจสอบสถานะการระงับบัญชี
        if (employee.status === 'ระงับ') {
            return res.status(403).json({
                success: false,
                message: 'บัญชีของคุณถูกระงับ'
            });
        }

        // ค้นหา Role เพื่อดึง permissions
        const roleDoc = await Role.findOne({ name: employee.role });
        const defaultPermissions = {
            view_dashboard: false, manage_stock: false, delete_stock: false,
            do_pos: false, manage_personnel: false, manage_branches: false,
            manage_settings: false, manage_roles: false, filter_stock_branch: false,
            cancel_sale: false, report_arrival: false, approve_import: false,
            view_audit_logs: false, view_daily_summary: true
        };
        const dbPerms = roleDoc ? roleDoc.permissions.toObject() : {
            view_dashboard: true, manage_stock: true, delete_stock: true,
            do_pos: true, manage_personnel: true, manage_branches: true,
            manage_settings: true, manage_roles: true,
            filter_stock_branch: true, cancel_sale: true,
            report_arrival: true, approve_import: true,
            view_audit_logs: true, view_daily_summary: true
        };
        // Merge: DB values override defaults. For old roles missing new fields,
        // fall back to related existing permissions (do_pos → report_arrival, manage_stock → approve_import)
        const permissions = {
            ...defaultPermissions,
            ...dbPerms,
            report_arrival: dbPerms.report_arrival !== undefined ? dbPerms.report_arrival : (dbPerms.do_pos || false),
            approve_import: dbPerms.approve_import !== undefined ? dbPerms.approve_import : (dbPerms.manage_stock || false),
            view_audit_logs: dbPerms.view_audit_logs !== undefined ? dbPerms.view_audit_logs : (dbPerms.manage_settings || false),
            view_daily_summary: dbPerms.view_daily_summary !== undefined ? dbPerms.view_daily_summary : true,
            manage_stock_audit: dbPerms.manage_stock_audit !== undefined ? dbPerms.manage_stock_audit : (employee.role === 'แอดมิน' || employee.role === 'ผู้จัดการ' || dbPerms.manage_settings || false),
            do_stock_audit: dbPerms.do_stock_audit !== undefined ? dbPerms.do_stock_audit : (employee.role === 'แอดมิน' || employee.role === 'ผู้จัดการ' || dbPerms.do_pos || false)
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
            view_audit_logs: false, view_daily_summary: true
        };
        const dbPerms = roleDoc ? roleDoc.permissions.toObject() : {
            view_dashboard: true, manage_stock: true, delete_stock: true,
            do_pos: true, manage_personnel: true, manage_branches: true,
            manage_settings: true, manage_roles: true,
            filter_stock_branch: true, cancel_sale: true,
            report_arrival: true, approve_import: true,
            view_audit_logs: true, view_daily_summary: true
        };
        const permissions = {
            ...defaultPermissions,
            ...dbPerms,
            report_arrival: dbPerms.report_arrival !== undefined ? dbPerms.report_arrival : (dbPerms.do_pos || false),
            approve_import: dbPerms.approve_import !== undefined ? dbPerms.approve_import : (dbPerms.manage_stock || false),
            view_audit_logs: dbPerms.view_audit_logs !== undefined ? dbPerms.view_audit_logs : (dbPerms.manage_settings || false),
            view_daily_summary: dbPerms.view_daily_summary !== undefined ? dbPerms.view_daily_summary : true,
            manage_stock_audit: dbPerms.manage_stock_audit !== undefined ? dbPerms.manage_stock_audit : (employee.role === 'แอดมิน' || employee.role === 'ผู้จัดการ' || dbPerms.manage_settings || false),
            do_stock_audit: dbPerms.do_stock_audit !== undefined ? dbPerms.do_stock_audit : (employee.role === 'แอดมิน' || employee.role === 'ผู้จัดการ' || dbPerms.do_pos || false)
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
        const { name, emp_id, password, role, branch_id, status } = req.body;

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
            branch_id: branch_id || null,
            status: status || 'ปกติ'
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
        const { name, emp_id, password, role, branch_id, status } = req.body;

        if (!name || !emp_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }

        // ตรวจสอบรหัสพนักงานซ้ำ (ยกเว้นตัวเอง)
        const existingEmp = await Employee.findOne({ emp_id, _id: { $ne: req.params.id } });
        if (existingEmp) {
            return res.status(400).json({ success: false, message: 'รหัสพนักงานนี้ถูกใช้งานแล้ว' });
        }

        const updateData = { name, emp_id, role: role || 'พนักงานขาย', branch_id: branch_id || null, status: status || 'ปกติ' };

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
        const { name, address, phone } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสาขา' });

        const newBranch = new Branch({ name, address, phone });
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
        const { name, address, phone } = req.body;
        if (!name) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อสาขา' });

        const updatedBranch = await Branch.findByIdAndUpdate(
            req.params.id,
            { name, address, phone },
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
            finance_payment_day, finance_months, finance_down_payment_cash, finance_down_payment_transfer,
            contract_fee, icloud_fee, applied_deposit_id, applied_deposit_amount
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
                warranty_expiry: expiry,
                is_gift: it.is_gift === true
            };
        });

        // ==========================================
        // CRITICAL: Stock Deduction Logic (หักสต็อกแยกตามสาขา)
        // ==========================================
        const targetBranchId = branch_id || (req.user && req.user.branch_id ? req.user.branch_id : '');
        for (const item of normalizedItems) {
            const product = await Product.findById(item.product_id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `ไม่พบสินค้า: ${item.product_name} ในระบบ`
                });
            }

            const bId = targetBranchId ? targetBranchId.toString() : '';
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
                fromBranch: targetBranchId,
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
            branch_id: targetBranchId || null,
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
            contract_fee: Number(contract_fee) || 0,
            icloud_fee: Number(icloud_fee) || 0,
            member_id: member_id || null,
            applied_deposit_id: applied_deposit_id || null,
            applied_deposit_amount: Number(applied_deposit_amount) || 0,
            created_at: now
        });

        const savedTransaction = await newTransaction.save();

        // ==========================================
        // อัปเดตสถานะใบมัดจำที่ถูกนำมาหัก (ถ้ามี)
        // ==========================================
        if (applied_deposit_id) {
            const linkedDeposit = await Deposit.findById(applied_deposit_id);
            if (linkedDeposit && linkedDeposit.status === 'รอดำเนินการ') {
                linkedDeposit.status = 'สำเร็จ';
                linkedDeposit.bill_number = receipt_number;
                linkedDeposit.completed_by = req.user.employee_id;
                linkedDeposit.completed_at = now;
                await linkedDeposit.save();
                
                await logActivity(req, 'UPDATE', 'DEPOSIT', `หักยอดมัดจำใบจอง ${linkedDeposit.deposit_number} ในรายการขาย ${receipt_number}`, null, linkedDeposit._id);
            }
        }

        // ===================================================================
        // Split-Accounting for Financing (การแยกบัญชีจัดไฟแนนซ์)
        // ===================================================================
        if (payment_method === 'จัดไฟแนนซ์' || payment_type === 'จัดไฟแนนซ์') {
            let devicesTotal = 0;
            const itemsSubtotal = normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            for (const item of normalizedItems) {
                const product = await Product.findById(item.product_id).populate('unit_id');
                const unitName = product && product.unit_id ? product.unit_id.name : 'ชิ้น';
                if (unitName === 'เครื่อง') {
                    devicesTotal += item.price * item.quantity;
                }
            }

            const inferredDiscount = Math.max(0, itemsSubtotal + (Number(contract_fee) || 0) + (Number(icloud_fee) || 0) - (Number(total_amount) || 0));
            const netDevicesTotal = Math.max(0, devicesTotal - inferredDiscount);
            const finalFinancedAmount = Math.max(0, netDevicesTotal - (Number(down_payment) || 0));
            const immediateCash = Math.max(0, (Number(total_amount) || 0) - finalFinancedAmount);

            // 1. Immediately create a CashMovement record for immediate cash collected
            const dateStr = now.getFullYear() +
                String(now.getMonth() + 1).padStart(2, '0') +
                String(now.getDate()).padStart(2, '0');
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
            const count = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
            const txn_id = `TXN-${dateStr}-${String(count + 1).padStart(4, '0')}`;

            const cashMove = new CashMovement({
                transaction_id: txn_id,
                type: 'รายรับ',
                category: 'ขายสินค้า',
                amount: immediateCash,
                reference_id: savedTransaction._id,
                recorded_by: req.user.employee_id,
                created_at: now
            });
            await cashMove.save();

            // 2. Create the FinanceReceivable queue tracking entry with remaining balance as financed_amount
            const financeReceivable = new FinanceReceivable({
                transaction_id: savedTransaction._id,
                finance_company: finance_company || '',
                total_finance_price: Number(total_amount) || 0,
                down_payment: Number(down_payment) || 0,
                icloud_fee: Number(icloud_fee) || 0,
                contract_fee: Number(contract_fee) || 0,
                financed_amount: finalFinancedAmount,
                status: 'รออนุมัติ', // stays in รออนุมัติ / ค้างโอน
                recorded_by: req.user.employee_id
            });
            await financeReceivable.save();
        }

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
        const { date, branch_id, search, employee_id, payment_type, status, startDate, endDate } = req.query;
        let filter = {};

        // Date filtering (presets or custom date range)
        if (startDate || endDate) {
            filter.created_at = {};
            if (startDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                filter.created_at.$gte = start;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.created_at.$lte = end;
            }
        } else if (date) {
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

        // Employee filtering
        if (employee_id) {
            filter.employee_id = employee_id;
        }

        // Payment type filtering
        if (payment_type) {
            filter.payment_type = payment_type;
        }

        // Status filtering
        if (status) {
            filter.status = status;
        }

        // Search filtering (receipt_number, items.imei_sold, items.product_name, or member details)
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            const orQuery = [
                { receipt_number: searchRegex },
                { 'items.imei_sold': searchRegex },
                { 'items.product_name': searchRegex }
            ];

            // Match member by name or phone
            const matchingMembers = await Member.find({
                $or: [
                    { first_name: searchRegex },
                    { last_name: searchRegex },
                    { phone: searchRegex }
                ]
            });

            if (matchingMembers.length > 0) {
                orQuery.push({ member_id: { $in: matchingMembers.map(m => m._id) } });
            }

            filter.$or = orQuery;
        }

        const transactions = await Transaction.find(filter)
            .populate('branch_id', 'name')
            .populate('employee_id', 'name emp_id')
            .populate('items.product_id', 'name')
            .populate('member_id', 'first_name last_name phone')
            .sort({ created_at: -1 });

        const financeCompanies = await FinanceCompany.find({});
        const companyMap = {};
        financeCompanies.forEach(c => {
            companyMap[c._id.toString()] = c.name;
        });

        const resolvedTransactions = transactions.map(txn => {
            const doc = txn.toObject();
            if (companyMap[doc.finance_company]) {
                doc.finance_company = companyMap[doc.finance_company];
            }
            return doc;
        });

        res.status(200).json({
            success: true,
            message: 'ดึงข้อมูลรายการขายสำเร็จ',
            data: resolvedTransactions
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

        const doc = transaction.toObject();
        if (doc.finance_company && mongoose.Types.ObjectId.isValid(doc.finance_company)) {
            const fc = await FinanceCompany.findById(doc.finance_company);
            if (fc) {
                doc.finance_company = fc.name;
            }
        }

        res.status(200).json({ success: true, data: doc });
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

// GET /api/sales/daily-summary
// สรุปยอดขายรายวันสำหรับพนักงานขายตามสาขาของตนเอง
router.get('/sales/daily-summary', async (req, res) => {
    try {
        // ตรวจสอบสิทธิ์จาก permissions.view_daily_summary
        if (!req.user || !req.user.permissions || !req.user.permissions.view_daily_summary) {
            return res.status(403).json({
                success: false,
                message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (ต้องการสิทธิ์ดูสรุปยอดขายรายวัน)'
            });
        }

        const branchId = req.user.branch_id;

        // กำหนดช่วงเวลาวันนี้ (00:00 - 23:59)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        // ดึงรายการขายวันนี้ (กรองตามสาขาถ้าระบุไว้) และไม่ยกเลิก
        const query = {
            created_at: { $gte: todayStart, $lte: todayEnd },
            status: { $ne: 'ยกเลิกแล้ว' }
        };
        if (branchId) {
            query.branch_id = branchId;
        }

        const todayTransactions = await Transaction.find(query)
            .populate('employee_id', 'name emp_id')
            .populate('member_id', 'first_name last_name phone')
            .sort({ created_at: -1 });

        let totalSales = 0;
        let cashReceived = 0;
        let financeDownpayment = 0;
        let devicesSold = 0;

        for (const txn of todayTransactions) {
            totalSales += txn.total_amount || 0;

            if (txn.payment_method === 'จัดไฟแนนซ์' || txn.payment_type === 'จัดไฟแนนซ์') {
                financeDownpayment += txn.down_payment || 0;
                cashReceived += txn.down_payment || 0;
            } else {
                cashReceived += txn.total_amount || 0;
            }

            for (const item of txn.items) {
                const product = await Product.findById(item.product_id).populate('unit_id');
                const unitName = product && product.unit_id ? product.unit_id.name : '';
                if (unitName === 'เครื่อง') {
                    devicesSold += item.quantity || 0;
                }
            }
        }

        res.json({
            success: true,
            data: {
                total_sales: totalSales,
                cash_received: cashReceived,
                finance_downpayment: financeDownpayment,
                devices_sold: devicesSold,
                bills: todayTransactions
            }
        });
    } catch (error) {
        console.error('Error fetching daily sales summary:', error);
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุปยอดขายรายวัน'
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
                const matches = data.card_front_photo_base64.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
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
                const matches = data.card_front_photo_base64.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
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
        if (!req.user.permissions.manage_po && !req.user.permissions.manage_finance && !req.user.permissions.view_finance) {
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
            const data = received_items[item._id.toString()] || { imeis: item.imeis_scanned || [], qty: item.received_qty || 0 };

            if (item.track_imei) {
                const listImeis = Array.isArray(data.imeis) ? data.imeis.map(x => x.toString().trim()).filter(Boolean) : [];

                // ตรวจสอบว่าจำนวน IMEI ไม่เกินจำนวนที่สั่งซื้อ
                if (listImeis.length > item.ordered_qty) {
                    return res.status(400).json({
                        success: false,
                        message: `สินค้า ${item.product_name} ได้รับเกินจำนวนที่สั่งซื้อ (${item.ordered_qty} รายการ)`
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

                // ตรวจสอบเฉพาะ IMEI ใหม่ที่ยังไม่เคยสแกนมาก่อน ว่าซ้ำกับในคลังสินค้าหลักหรือไม่
                const prevImeis = Array.isArray(item.imeis_scanned) ? item.imeis_scanned : [];
                const newImeisOnly = listImeis.filter(imei => !prevImeis.includes(imei));

                if (newImeisOnly.length > 0) {
                    const existingProduct = await Product.findOne({
                        $or: [
                            { product_code: { $in: newImeisOnly } },
                            { 'stock_balances.imeis': { $in: newImeisOnly } }
                        ]
                    });
                    if (existingProduct) {
                        return res.status(400).json({
                            success: false,
                            message: `หมายเลข IMEI บางรายการสำหรับ ${item.product_name} มีอยู่ในสต็อกระบบแล้ว กรุณาตรวจสอบ`
                        });
                    }
                }

                item.imeis_scanned = listImeis;
                item.received_qty = listImeis.length;
            } else {
                // สินค้าทั่วไป (ไม่มี IMEI)
                const qty = Number(data.qty || 0);
                if (qty > item.ordered_qty) {
                    return res.status(400).json({
                        success: false,
                        message: `สินค้า ${item.product_name} ได้รับเกินจำนวนที่สั่งซื้อ (${item.ordered_qty} ชิ้น)`
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

                    // Validate only new IMEIs (not already imported for this item) against the database
                    const importedImeis = Array.isArray(item.imported_imeis) ? item.imported_imeis : [];
                    const actualNewImeis = newImeis.filter(imei => !importedImeis.includes(imei));

                    for (const imei of actualNewImeis) {
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

// ==========================================
// Accounting & Finance Module (ระบบบัญชีและการเงิน)
// ==========================================

// GET /api/accounting/profit-loss
router.get('/accounting/profit-loss', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        let { startDate, endDate } = req.query;
        let start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        let end = endDate ? new Date(endDate) : new Date();

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        // 1. Revenue from POS transactions
        const posTxns = await Transaction.find({
            created_at: { $gte: start, $lte: end },
            status: { $ne: 'ยกเลิกแล้ว' }
        }).populate('employee_id', 'name emp_id');

        const txnIds = posTxns.map(t => t._id);
        const receivables = await FinanceReceivable.find({ transaction_id: { $in: txnIds } });
        const recMap = {};
        receivables.forEach(r => {
            recMap[r.transaction_id.toString()] = r;
        });

        let salesRevenue = 0;
        let ledger = [];

        posTxns.forEach(t => {
            const rec = recMap[t._id.toString()];
            if (t.payment_type === 'จัดไฟแนนซ์' || t.payment_method === 'จัดไฟแนนซ์') {
                const immediateCash = (t.down_payment || 0) + (t.icloud_fee || 0) + (t.contract_fee || 0);
                const isSettledInPeriod = rec && (rec.status === 'ชำระแล้ว' || rec.status === 'ได้รับเงินครบแล้ว') && rec.settled_at && rec.settled_at <= end;

                if (isSettledInPeriod) {
                    salesRevenue += (t.total_amount || 0);
                    ledger.push({
                        _id: t._id,
                        transaction_id: t.receipt_number,
                        created_at: t.created_at || t.createdAt,
                        type: 'รายรับ',
                        category: 'ขายสินค้า (จัดไฟแนนซ์ - ชำระเงินครบ)',
                        amount: t.total_amount,
                        recorded_by: t.employee_id ? t.employee_id.name : 'พนักงานขาย'
                    });
                } else {
                    salesRevenue += immediateCash;
                    ledger.push({
                        _id: t._id,
                        transaction_id: t.receipt_number,
                        created_at: t.created_at || t.createdAt,
                        type: 'รายรับ',
                        category: 'ขายสินค้า (จัดไฟแนนซ์ - รับเงินดาวน์และค่าธรรมเนียม)',
                        amount: immediateCash,
                        recorded_by: t.employee_id ? t.employee_id.name : 'พนักงานขาย'
                    });
                }
            } else {
                salesRevenue += (t.total_amount || 0);
                ledger.push({
                    _id: t._id,
                    transaction_id: t.receipt_number,
                    created_at: t.created_at || t.createdAt,
                    type: 'รายรับ',
                    category: 'ขายสินค้า',
                    amount: t.total_amount,
                    recorded_by: t.employee_id ? t.employee_id.name : 'พนักงานขาย'
                });
            }
        });

        // 1.2 Revenue from Finance receivables settled in this period (but sold in a previous period)
        const settledReceivablesOutsidePeriod = await FinanceReceivable.find({
            status: { $in: ['ชำระแล้ว', 'ได้รับเงินครบแล้ว'] },
            settled_at: { $gte: start, $lte: end }
        }).populate({
            path: 'transaction_id',
            match: { created_at: { $lt: start } }
        }).populate('recorded_by', 'name emp_id');

        settledReceivablesOutsidePeriod.forEach(r => {
            if (r.transaction_id) {
                salesRevenue += (r.financed_amount || 0);
                ledger.push({
                    _id: r._id,
                    transaction_id: r.transaction_id.receipt_number,
                    created_at: r.settled_at,
                    type: 'รายรับ',
                    category: 'ขายสินค้า (รับชำระยอดค้างโอนไฟแนนซ์)',
                    amount: r.financed_amount,
                    recorded_by: r.recorded_by ? r.recorded_by.name : 'ผู้ผ่านรายการ'
                });
            }
        });

        // 2. Other revenues from CashMovement
        const otherRevenuesMovements = await CashMovement.find({
            created_at: { $gte: start, $lte: end },
            type: 'รายรับ',
            category: { $ne: 'ขายสินค้า' }
        }).populate('recorded_by', 'name emp_id');

        const otherRevenue = otherRevenuesMovements.reduce((sum, c) => sum + (c.amount || 0), 0);

        // 3. Purchase Cost from finalized POs
        const finalizedPOs = await PurchaseOrder.find({
            updatedAt: { $gte: start, $lte: end },
            status: 'นำเข้าสำเร็จ'
        });

        const poCost = finalizedPOs.reduce((sum, po) => {
            const poSum = po.items.reduce((itemSum, item) => itemSum + (item.cost_price * (item.received_qty || 0)), 0);
            return sum + poSum;
        }, 0);

        // 4. Other expenses from CashMovement
        const otherExpensesMovements = await CashMovement.find({
            created_at: { $gte: start, $lte: end },
            type: 'รายจ่าย',
            category: { $ne: 'ซื้อสินค้า (PO)' }
        }).populate('recorded_by', 'name emp_id');

        const otherExpenses = otherExpensesMovements.reduce((sum, c) => sum + (c.amount || 0), 0);

        // 5. Calculate VAT metrics
        const salesVat = (salesRevenue * 7) / 107;
        const purchaseVat = (poCost * 7) / 107;
        const taxPayable = Math.max(0, salesVat - purchaseVat);

        const totalRevenue = salesRevenue + otherRevenue;
        const totalExpense = poCost + otherExpenses;
        const netProfit = totalRevenue - totalExpense;

        otherRevenuesMovements.forEach(c => {
            ledger.push({
                _id: c._id,
                transaction_id: c.transaction_id,
                created_at: c.created_at || c.createdAt,
                type: c.type,
                category: c.category,
                amount: c.amount,
                recorded_by: c.recorded_by ? c.recorded_by.name : 'ผู้บันทึก'
            });
        });

        otherExpensesMovements.forEach(c => {
            ledger.push({
                _id: c._id,
                transaction_id: c.transaction_id,
                created_at: c.created_at || c.createdAt,
                type: c.type,
                category: c.category,
                amount: c.amount,
                recorded_by: c.recorded_by ? c.recorded_by.name : 'ผู้บันทึก'
            });
        });

        // Also add paid PO cash movements if any (category = 'ซื้อสินค้า (PO)')
        const poPaidMovements = await CashMovement.find({
            created_at: { $gte: start, $lte: end },
            category: 'ซื้อสินค้า (PO)'
        }).populate('recorded_by', 'name emp_id');

        poPaidMovements.forEach(c => {
            ledger.push({
                _id: c._id,
                transaction_id: c.transaction_id,
                created_at: c.created_at || c.createdAt,
                type: c.type,
                category: c.category,
                amount: c.amount,
                recorded_by: c.recorded_by ? c.recorded_by.name : 'ผู้บันทึก'
            });
        });

        // Sort by date descending
        ledger.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.status(200).json({
            success: true,
            data: {
                salesRevenue,
                otherRevenue,
                totalRevenue,
                poCost,
                otherExpenses,
                totalExpense,
                netProfit,
                outputVat: salesVat,
                inputVat: purchaseVat,
                taxPayable,
                ledger
            }
        });
    } catch (error) {
        console.error('API Error GET /api/accounting/profit-loss:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการคำนวณงบกำไรขาดทุน' });
    }
});

// POST /api/accounting/expenses
router.post('/accounting/expenses', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์บันทึกค่าใช้จ่าย' });
        }

        const { category, amount } = req.body;
        if (!category || !amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลหมวดหมู่และจำนวนเงินให้ถูกต้อง' });
        }

        const validCategories = ['ค่าเช่า', 'ค่าไฟ/น้ำ', 'เงินเดือน', 'อื่นๆ'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({ success: false, message: 'หมวดหมู่ค่าใช้จ่ายไม่ถูกต้อง' });
        }

        // Generate transaction_id: TXN-YYYYMMDD-XXXX
        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const count = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
        const txn_id = `TXN-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        const newMovement = new CashMovement({
            transaction_id: txn_id,
            type: 'รายจ่าย',
            category,
            amount: Number(amount),
            recorded_by: req.user.employee_id
        });

        const saved = await newMovement.save();

        await logActivity(req, 'CREATE', 'ACCOUNTING', `บันทึกค่าใช้จ่ายทั่วไป หมวดหมู่ ${category} จำนวน ฿${amount}`, txn_id, saved._id);

        res.status(201).json({
            success: true,
            message: 'บันทึกค่าใช้จ่ายสำเร็จ',
            data: saved
        });
    } catch (error) {
        console.error('API Error POST /api/accounting/expenses:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกค่าใช้จ่าย' });
    }
});

// PUT /api/accounting/po-pay/:id
router.put('/accounting/po-pay/:id', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการชำระเงินใบสั่งซื้อ' });
        }

        const po = await PurchaseOrder.findById(req.params.id);
        if (!po) {
            return res.status(404).json({ success: false, message: 'ไม่พบใบสั่งซื้อสินค้า' });
        }

        if (po.payment_status === 'ชำระเงินแล้ว') {
            return res.status(400).json({ success: false, message: 'ใบสั่งซื้อนี้ชำระเงินเรียบร้อยแล้ว' });
        }

        const paymentAmount = req.body.payment_amount !== undefined ? Number(req.body.payment_amount) : 0;
        const discountAmount = req.body.discount_amount !== undefined ? Number(req.body.discount_amount) : 0;
        const discountRemark = req.body.discount_remark || '';

        if (isNaN(paymentAmount) || paymentAmount < 0) {
            return res.status(400).json({ success: false, message: 'จำนวนเงินที่ชำระไม่ถูกต้อง' });
        }
        if (isNaN(discountAmount) || discountAmount < 0) {
            return res.status(400).json({ success: false, message: 'จำนวนส่วนลดไม่ถูกต้อง' });
        }
        if (paymentAmount === 0 && discountAmount === 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกจำนวนเงินชำระหรือส่วนลดอย่างใดอย่างหนึ่ง' });
        }
        if (discountAmount > 0 && !discountRemark.trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหมายเหตุของส่วนลด' });
        }

        const payDate = req.body.payment_date ? new Date(req.body.payment_date) : new Date();

        // คำนวณราคาทุนรวมของสินค้าในใบ PO
        const totalCost = po.items.reduce((sum, item) => sum + (item.cost_price * item.ordered_qty), 0);
        const currentPaid = po.paid_amount || 0;
        const currentDiscount = po.discount || 0;
        const outstanding = totalCost - currentPaid - currentDiscount;

        if (paymentAmount + discountAmount > outstanding + 0.01) {
            return res.status(400).json({
                success: false,
                message: `ยอดรวมจ่ายและส่วนลด (฿${(paymentAmount + discountAmount).toFixed(2)}) เกินยอดค้างจ่ายปัจจุบัน (฿${outstanding.toFixed(2)})`
            });
        }

        // อัปเดตข้อมูลการจ่าย
        po.paid_amount = currentPaid + paymentAmount;
        po.discount = currentDiscount + discountAmount;

        if (discountAmount > 0) {
            const dateLabel = payDate.toLocaleDateString('th-TH');
            const remarkText = `[วันที่ ${dateLabel} ลด ฿${discountAmount}]: ${discountRemark}`;
            po.discount_remark = po.discount_remark ? po.discount_remark + '\n' + remarkText : remarkText;
        }

        if (po.paid_amount + po.discount >= totalCost - 0.01) {
            po.payment_status = 'ชำระเงินแล้ว';
            po.paid_at = payDate;
        } else {
            po.payment_status = 'ชำระเงินบางส่วน';
        }

        await po.save();

        // บันทึก CashMovement เฉพาะถ้ามียอดจ่ายจริง
        if (paymentAmount > 0) {
            const dateStr = payDate.getFullYear() +
                String(payDate.getMonth() + 1).padStart(2, '0') +
                String(payDate.getDate()).padStart(2, '0');

            const todayStart = new Date(payDate); todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(payDate); todayEnd.setHours(23, 59, 59, 999);
            const count = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
            const txn_id = `TXN-${dateStr}-${String(count + 1).padStart(4, '0')}`;

            const cashMove = new CashMovement({
                transaction_id: txn_id,
                type: 'รายจ่าย',
                category: 'ซื้อสินค้า (PO)',
                amount: paymentAmount,
                reference_id: po._id,
                recorded_by: req.user.employee_id,
                created_at: payDate
            });

            await cashMove.save();
        }

        await logActivity(
            req,
            'UPDATE',
            'ACCOUNTING',
            `บันทึกจ่ายเงินใบ PO เลขที่ ${po.po_number} (จ่ายจริง ฿${paymentAmount.toLocaleString()}, ส่วนลด ฿${discountAmount.toLocaleString()}) สถานะ: ${po.payment_status}`,
            po.po_number,
            po._id
        );

        res.status(200).json({
            success: true,
            message: 'บันทึกการชำระเงินเรียบร้อยแล้ว',
            data: po
        });
    } catch (error) {
        console.error('API Error PUT /api/accounting/po-pay/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการชำระเงินใบสั่งซื้อ' });
    }
});

// GET /api/accounting/po-payments/:id
router.get('/accounting/po-payments/:id', async (req, res) => {
    try {
        if (!req.user.permissions.view_finance && !req.user.permissions.manage_finance) {
            // ลองให้ผู้จัดการ/เจ้าของร้านหรือผู้มีสิทธิ์อื่นๆ ดูได้
            if (req.user.role !== 'เจ้าของร้าน' && req.user.role !== 'ผู้จัดการ') {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการดูข้อมูลการชำระเงิน' });
            }
        }

        const payments = await CashMovement.find({ reference_id: req.params.id })
            .populate('recorded_by', 'name')
            .sort({ created_at: 1 });

        res.status(200).json({
            success: true,
            data: payments
        });
    } catch (error) {
        console.error('API Error GET /api/accounting/po-payments/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการชำระเงิน' });
    }
});

// GET /api/accounting/receivables
// หน้าที่: ดึงข้อมูลรายการลูกหนี้ไฟแนนซ์ทั้งหมด
router.get('/accounting/receivables', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        const receivables = await FinanceReceivable.find()
            .populate('transaction_id')
            .populate('recorded_by', 'name emp_id')
            .sort({ createdAt: -1 });

        // Resolve finance company names if stored as ObjectIds
        const financeCompanies = await FinanceCompany.find({});
        const companyMap = {};
        financeCompanies.forEach(c => {
            companyMap[c._id.toString()] = c.name;
        });

        const resolvedReceivables = receivables.map(rec => {
            const doc = rec.toObject();
            if (companyMap[doc.finance_company]) {
                doc.finance_company = companyMap[doc.finance_company];
            }
            return doc;
        });

        res.status(200).json({
            success: true,
            data: resolvedReceivables
        });
    } catch (error) {
        console.error('API Error GET /api/accounting/receivables:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีลูกหนี้' });
    }
});

// PUT /api/accounting/receivables/:id/settle
// หน้าที่: ยืนยันยอดโอนสำเร็จและปรับสถานะเป็นชำระเงินแล้ว
router.put('/accounting/receivables/:id/settle', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        const { status } = req.body;
        const validStatuses = ['รออนุมัติ', 'ค้างโอน', 'ชำระแล้ว', 'ยกเลิก'];
        const targetStatus = status || 'ชำระแล้ว';

        if (!validStatuses.includes(targetStatus)) {
            return res.status(400).json({ success: false, message: 'สถานะไม่ถูกต้อง' });
        }

        const receivable = await FinanceReceivable.findById(req.params.id).populate('transaction_id');
        if (!receivable) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการลูกหนี้ที่ระบุ' });
        }

        if (receivable.status === 'ชำระแล้ว' && targetStatus === 'ชำระแล้ว') {
            return res.status(400).json({ success: false, message: 'รายการนี้ได้รับการชำระเงินเรียบร้อยแล้ว' });
        }

        receivable.status = targetStatus;
        if (targetStatus === 'ชำระแล้ว') {
            receivable.settled_at = new Date();
        } else {
            receivable.settled_at = null;
        }

        const savedReceivable = await receivable.save();

        // บันทึกกิจกรรมสำเร็จ
        const receiptNo = receivable.transaction_id ? receivable.transaction_id.receipt_number : '';
        await logActivity(req, 'UPDATE', 'ACCOUNTING', `ปรับสถานะรายการลูกหนี้จัดไฟแนนซ์เป็น ${targetStatus} ยอดเงิน ฿${receivable.financed_amount}`, receiptNo, savedReceivable._id);

        res.status(200).json({
            success: true,
            message: 'อัปเดตสถานะลูกหนี้สำเร็จ',
            data: savedReceivable
        });
    } catch (error) {
        console.error('API Error PUT /api/accounting/receivables/:id/settle:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกหนี้' });
    }
});

// GET /api/accounting/ap-summary
// หน้าที่: ดึงข้อมูลสรุปยอดเจ้าหนี้ค้างจ่าย (AP) แยกตาม Supplier
router.get('/accounting/ap-summary', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        const summary = await PurchaseOrder.aggregate([
            {
                $match: {
                    status: { $ne: 'ยกเลิก' },
                    payment_status: { $ne: 'ชำระเงินแล้ว' }
                }
            },
            {
                $project: {
                    supplier_name: 1,
                    paid_amount: 1,
                    discount: 1,
                    po_cost: {
                        $sum: {
                            $map: {
                                input: "$items",
                                as: "item",
                                in: { $multiply: ["$$item.cost_price", { $ifNull: ["$$item.ordered_qty", 0] }] }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    supplier_name: 1,
                    outstanding: {
                        $subtract: [
                            "$po_cost",
                            { $add: [{ $ifNull: ["$paid_amount", 0] }, { $ifNull: ["$discount", 0] }] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$supplier_name",
                    supplier_name: { $first: "$supplier_name" },
                    pending_bill_count: { $sum: 1 },
                    total_outstanding: { $sum: "$outstanding" }
                }
            },
            {
                $sort: { supplier_name: 1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('API Error GET /api/accounting/ap-summary:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการคำนวณข้อมูลสรุปบัญชีเจ้าหนี้' });
    }
});

// GET /api/finance/summary
// หน้าที่: ดึงข้อมูลสรุปยอดจัดไฟแนนซ์แยกตามคู่ค้าไฟแนนซ์
router.get('/finance/summary', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        const summary = await FinanceReceivable.aggregate([
            {
                $group: {
                    _id: "$finance_company",
                    finance_partner_name: { $first: "$finance_company" },
                    total_pending: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["รออนุมัติ", "ค้างโอน"]] },
                                "$financed_amount",
                                0
                            ]
                        }
                    },
                    total_settled: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["ชำระแล้ว", "ได้รับเงินครบแล้ว"]] },
                                "$financed_amount",
                                0
                            ]
                        }
                    },
                    payout_received: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["ชำระแล้ว", "ได้รับเงินครบแล้ว"]] },
                                "$financed_amount",
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Resolve finance company names and merge duplicates
        const financeCompanies = await FinanceCompany.find({});
        const companyMap = {};
        financeCompanies.forEach(c => {
            companyMap[c._id.toString()] = c.name;
        });

        const mergedSummaryMap = {};
        summary.forEach(s => {
            const resolvedName = companyMap[s.finance_partner_name] || s.finance_partner_name;
            if (!mergedSummaryMap[resolvedName]) {
                mergedSummaryMap[resolvedName] = {
                    finance_partner_name: resolvedName,
                    total_pending: 0,
                    total_settled: 0,
                    payout_received: 0
                };
            }
            mergedSummaryMap[resolvedName].total_pending += s.total_pending;
            mergedSummaryMap[resolvedName].total_settled += s.total_settled;
            mergedSummaryMap[resolvedName].payout_received += s.payout_received;
        });

        const finalSummary = Object.values(mergedSummaryMap).sort((a, b) =>
            a.finance_partner_name.localeCompare(b.finance_partner_name, 'th')
        );

        res.status(200).json({
            success: true,
            data: finalSummary
        });
    } catch (error) {
        console.error('API Error GET /api/finance/summary:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุปการเงิน' });
    }
});

// POST /api/finance/payout/:id
// หน้าที่: ยืนยันการรับเงินโอนจากคู่ค้าไฟแนนซ์ ปรับสถานะเป็นได้รับเงินครบแล้ว และเก็บวันเวลาที่รับยอดโอน
router.post('/finance/payout/:id', async (req, res) => {
    try {
        if (!req.user.permissions.manage_finance) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชีและการเงิน' });
        }

        const receivable = await FinanceReceivable.findById(req.params.id).populate('transaction_id');
        if (!receivable) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการลูกหนี้ที่ระบุ' });
        }

        if (receivable.status === 'ได้รับเงินครบแล้ว') {
            return res.status(400).json({ success: false, message: 'รายการนี้ได้รับการชำระเงินเรียบร้อยแล้ว' });
        }

        const settledAt = req.body.settled_at ? new Date(req.body.settled_at) : new Date();
        receivable.status = 'ได้รับเงินครบแล้ว';
        receivable.settled_at = settledAt;

        const savedReceivable = await receivable.save();

        // บันทึกกิจกรรมสำเร็จ
        const receiptNo = receivable.transaction_id ? receivable.transaction_id.receipt_number : '';
        await logActivity(req, 'UPDATE', 'ACCOUNTING', `เคลียร์ยอดรับเงินโอนจัดไฟแนนซ์สำเร็จ ยอดเงิน ฿${receivable.financed_amount}`, receiptNo, savedReceivable._id);

        res.status(200).json({
            success: true,
            message: 'เคลียร์ยอดโอนจัดไฟแนนซ์สำเร็จ',
            data: savedReceivable
        });
    } catch (error) {
        console.error('API Error POST /api/finance/payout/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลการเคลียร์ยอดโอน' });
    }
});

// ==========================================
// Stock Audit APIs (ระบบตรวจนับสต็อกประจำวัน)
// ==========================================

router.post('/stock-audit/sessions', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.do_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจนับสต็อกประจำวัน' });
        }
        const branchId = req.user.branch_id;
        if (!branchId) return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาของพนักงาน กรุณาตรวจสอบการตั้งค่า' });

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const existingToday = await StockAuditSession.findOne({
            branch_id: branchId,
            session_date: { $gte: todayStart, $lte: todayEnd },
            status: { $in: ['กำลังตรวจนับ', 'รอการอนุมัติ'] }
        });
        if (existingToday) {
            return res.status(400).json({
                success: false,
                message: 'มีรอบการตรวจนับสต็อกที่ยังไม่เสร็จสมบูรณ์ของวันนี้อยู่แล้ว กรุณาดำเนินการต่อจาก session เดิม',
                data: existingToday
            });
        }

        // Auto-close sessions เก่าที่ค้างอยู่
        await StockAuditSession.updateMany(
            { branch_id: branchId, status: { $in: ['กำลังตรวจนับ', 'รอการอนุมัติ'] } },
            { $set: { status: 'ปิดโดยอัตโนมัติ', closed_at: new Date() } }
        );

        // นับ IMEI ที่คาดว่าจะมีในสาขา
        const products = await Product.find({ 'stock_balances': { $elemMatch: { branch_id: branchId } } }).populate('unit_id');
        let totalExpected = 0;
        for (const p of products) {
            const bal = p.stock_balances.find(b => b.branch_id && b.branch_id.toString() === branchId.toString());
            if (bal && p.unit_id && p.unit_id.name === 'เครื่อง' && Array.isArray(bal.imeis)) {
                totalExpected += bal.imeis.length;
            }
        }

        const newSession = await StockAuditSession.create({
            session_date: todayStart, branch_id: branchId, status: 'กำลังตรวจนับ',
            created_by: req.user.employee_id, total_items_expected: totalExpected, total_items_scanned: 0
        });

        await logActivity(req, 'CREATE', 'STOCK_AUDIT', `เปิดรอบตรวจนับสต็อกประจำวัน (คาดหวัง ${totalExpected} เครื่อง)`, null, newSession._id);
        res.status(201).json({ success: true, message: 'เปิดรอบตรวจนับสต็อกสำเร็จ', data: newSession });
    } catch (error) {
        console.error('API Error POST /api/stock-audit/sessions:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเปิดรอบตรวจนับสต็อก' });
    }
});

// GET /api/stock-audit/sessions/today — ดู session วันนี้ของสาขาตัวเอง
router.get('/stock-audit/sessions/today', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.do_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจนับสต็อกประจำวัน' });
        }
        const branchId = req.user.branch_id;
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

        const session = await StockAuditSession.findOne({
            branch_id: branchId,
            session_date: { $gte: todayStart, $lte: todayEnd }
        }).sort({ createdAt: -1 }).populate('created_by', 'name emp_id').populate('branch_id', 'name');

        if (!session) return res.json({ success: true, data: null });

        const items = await StockAuditItem.find({ session_id: session._id })
            .populate('scanned_by', 'name emp_id').sort({ scanned_at: -1 });

        // Query transactions created in this branch since this session started to find items sold during the audit
        const soldTxns = await Transaction.find({
            branch_id: branchId,
            status: { $ne: 'ยกเลิกแล้ว' },
            createdAt: { $gte: session.createdAt }
        }).lean();

        const soldImeisMap = new Map();
        for (const txn of soldTxns) {
            if (Array.isArray(txn.items)) {
                for (const item of txn.items) {
                    if (item.imei) {
                        soldImeisMap.set(item.imei, {
                            imei: item.imei,
                            product_id: item.product_id,
                            product_name: item.product_name,
                            sold: true,
                            sold_at: txn.createdAt
                        });
                    }
                }
            }
        }

        // รายการ IMEI ที่ควรมีในสาขา — ใช้ populate แบบเดียวกับ /api/products
        const products = await Product.find({ 'stock_balances': { $elemMatch: { branch_id: branchId } } })
            .populate('unit_id', 'name')
            .populate('color_id', 'name')
            .populate('capacity_id', 'name')
            .populate('condition_id', 'name')
            .lean();

        const expectedImeis = [];
        const addedImeis = new Set();

        for (const p of products) {
            const bal = p.stock_balances.find(b => b.branch_id && b.branch_id.toString() === branchId.toString());
            if (bal && p.unit_id && p.unit_id.name === 'เครื่อง' && Array.isArray(bal.imeis)) {
                bal.imeis.forEach(imei => {
                    expectedImeis.push({
                        imei,
                        product_id: p._id,
                        product_name: p.name,
                        color: p.color_id ? p.color_id.name : '',
                        capacity: (p.capacity_id ? p.capacity_id.name : '') + (p.condition_id ? ' / ' + p.condition_id.name : ''),
                        sold: soldImeisMap.has(imei)
                    });
                    addedImeis.add(imei);
                });
            }
        }

        // Add sold items that are no longer in stock balances but were expected because they were sold after the session opened
        for (const [imei, soldData] of soldImeisMap.entries()) {
            if (!addedImeis.has(imei)) {
                let colorStr = '';
                let capacityStr = '';
                const pDoc = products.find(p => p._id.toString() === soldData.product_id?.toString());
                if (pDoc) {
                    colorStr = pDoc.color_id ? pDoc.color_id.name : '';
                    capacityStr = (pDoc.capacity_id ? pDoc.capacity_id.name : '') + (pDoc.condition_id ? ' / ' + pDoc.condition_id.name : '');
                }
                expectedImeis.push({
                    imei,
                    product_id: soldData.product_id,
                    product_name: soldData.product_name,
                    color: colorStr,
                    capacity: capacityStr,
                    sold: true
                });
                addedImeis.add(imei);
            }
        }

        res.json({ success: true, data: { session, items, expectedImeis } });
    } catch (error) {
        console.error('API Error GET /api/stock-audit/sessions/today:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรอบตรวจนับ' });
    }
});

// GET /api/stock-audit/sessions — ดูรายการ sessions ทั้งหมด (manage_stock_audit)
router.get('/stock-audit/sessions', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
        }

        // Auto-create missing daily sessions for all branches when reviewer enters the screen
        try {
            const { generateDailySessionsForAllBranches } = require('../utils/cronTasks');
            await generateDailySessionsForAllBranches();
        } catch (cronErr) {
            console.error('Error auto-creating sessions in GET /sessions:', cronErr);
        }

        const { status, branch_id, startDate, endDate } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (branch_id) filter.branch_id = branch_id;
        if (startDate || endDate) {
            filter.session_date = {};
            if (startDate) { const s = new Date(startDate); s.setHours(0, 0, 0, 0); filter.session_date.$gte = s; }
            if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); filter.session_date.$lte = e; }
        }
        const sessions = await StockAuditSession.find(filter)
            .populate('branch_id', 'name').populate('created_by', 'name emp_id').populate('closed_by', 'name emp_id')
            .sort({ session_date: -1 });
        res.json({ success: true, data: sessions, total: sessions.length });
    } catch (error) {
        console.error('API Error GET /api/stock-audit/sessions:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงรายการรอบตรวจนับ' });
    }
});

// GET /api/stock-audit/sessions/:id — ดูรายละเอียด session + items
router.get('/stock-audit/sessions/:id', async (req, res) => {
    try {
        const session = await StockAuditSession.findById(req.params.id)
            .populate('branch_id', 'name').populate('created_by', 'name emp_id').populate('closed_by', 'name emp_id');
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบรอบตรวจนับสต็อกที่ระบุ' });

        const items = await StockAuditItem.find({ session_id: session._id })
            .populate('scanned_by', 'name emp_id').populate('reviewed_by', 'name emp_id').sort({ scanned_at: 1 });

        const summary = {
            total: items.length,
            passed: items.filter(i => i.scan_status === 'ผ่าน').length,
            failed: items.filter(i => i.scan_status === 'ไม่ผ่าน').length,
            recheck: items.filter(i => i.scan_status === 'ตรวจใหม่').length,
            pending: items.filter(i => i.scan_status === 'รอตรวจสอบ').length
        };
        res.json({ success: true, data: { session, items, summary } });
    } catch (error) {
        console.error('API Error GET /api/stock-audit/sessions/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงรายละเอียดรอบตรวจนับ' });
    }
});

// POST /api/stock-audit/sessions/:id/scan — สแกน IMEI + upload รูปกล่อง
router.post('/stock-audit/sessions/:id/scan', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.do_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจนับสต็อกประจำวัน' });
        }
        const { imei, box_photo_base64, scan_notes } = req.body;
        if (!imei || imei.trim() === '') return res.status(400).json({ success: false, message: 'กรุณาระบุหมายเลข IMEI' });

        const session = await StockAuditSession.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบรอบตรวจนับสต็อกที่ระบุ' });
        if (session.status !== 'กำลังตรวจนับ') return res.status(400).json({ success: false, message: `ไม่สามารถสแกนได้ รอบนี้มีสถานะ: ${session.status}` });

        const imeiClean = imei.trim();
        const alreadyScanned = await StockAuditItem.findOne({ session_id: session._id, imei: imeiClean });
        if (alreadyScanned) return res.status(400).json({ success: false, message: `หมายเลข IMEI ${imeiClean} ถูกสแกนไปแล้วในรอบนี้` });

        // ตรวจว่า IMEI อยู่ในสต็อกสาขา
        const branchId = session.branch_id;
        let foundProduct = null; let isExpected = false;
        const allProducts = await Product.find({ 'stock_balances': { $elemMatch: { branch_id: branchId } } });
        for (const p of allProducts) {
            const bal = p.stock_balances.find(b => b.branch_id && b.branch_id.toString() === branchId.toString());
            if (bal && Array.isArray(bal.imeis) && bal.imeis.includes(imeiClean)) { foundProduct = p; isExpected = true; break; }
        }

        // Upload รูปกล่อง → Google Drive
        let boxPhotoUrl = '';
        if (box_photo_base64 && box_photo_base64.trim() !== '') {
            try {
                const matches = box_photo_base64.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
                let buffer, mimeType;
                if (matches && matches.length === 3) { mimeType = matches[1]; buffer = Buffer.from(matches[2], 'base64'); }
                else { mimeType = 'image/jpeg'; buffer = Buffer.from(box_photo_base64, 'base64'); }
                const dateStr = new Date().toISOString().slice(0, 10);
                boxPhotoUrl = await uploadBufferToDriveInFolder(buffer, mimeType, `AUDIT_${imeiClean}_${Date.now()}.jpg`, `ตรวจสต็อกประจำวัน/${dateStr}`);
            } catch (err) {
                console.error('Drive upload error (audit photo):', err.message || err);
                return res.status(500).json({ success: false, message: `เกิดข้อผิดพลาดในการอัพโหลดภาพถ่ายไปยัง Google Drive: ${err.message || 'Unknown error'}` });
            }
        }

        const newItem = await StockAuditItem.create({
            session_id: session._id,
            product_id: foundProduct ? foundProduct._id : null,
            product_name: foundProduct ? foundProduct.name : `ไม่พบในระบบ: ${imeiClean}`,
            imei: imeiClean, box_photo_url: boxPhotoUrl,
            scanned_by: req.user.employee_id, scanned_at: new Date(),
            scan_notes: scan_notes || '', scan_status: 'รอตรวจสอบ', is_expected: isExpected
        });
        await StockAuditSession.findByIdAndUpdate(session._id, { $inc: { total_items_scanned: 1 } });

        res.status(201).json({
            success: true,
            message: isExpected ? `สแกน IMEI ${imeiClean} สำเร็จ ✓ พบในระบบ` : `⚠️ IMEI ${imeiClean} ไม่พบในคลังสาขา`,
            data: newItem, is_expected: isExpected
        });
    } catch (error) {
        console.error('API Error POST /api/stock-audit/sessions/:id/scan:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลการสแกน' });
    }
});

// DELETE /api/stock-audit/sessions/:id/scan/:imei — ลบรายการที่สแกนผิด
router.delete('/stock-audit/sessions/:id/scan/:imei', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.do_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจนับสต็อกประจำวัน' });
        }
        const session = await StockAuditSession.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบรอบตรวจนับสต็อกที่ระบุ' });
        if (session.status !== 'กำลังตรวจนับ') return res.status(400).json({ success: false, message: 'รอบนี้ถูกส่งตรวจแล้ว ไม่สามารถลบรายการได้' });

        const item = await StockAuditItem.findOneAndDelete({ session_id: session._id, imei: req.params.imei });
        if (!item) return res.status(404).json({ success: false, message: 'ไม่พบรายการ IMEI ที่ระบุในรอบนี้' });

        await StockAuditSession.findByIdAndUpdate(session._id, { $inc: { total_items_scanned: -1 } });
        res.json({ success: true, message: `ลบรายการ IMEI ${req.params.imei} สำเร็จ` });
    } catch (error) {
        console.error('API Error DELETE /api/stock-audit/sessions/:id/scan/:imei:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบรายการ' });
    }
});

// POST /api/stock-audit/sessions/:id/submit — ส่งให้พนักงานสต็อกตรวจ
router.post('/stock-audit/sessions/:id/submit', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.do_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจนับสต็อกประจำวัน' });
        }
        const session = await StockAuditSession.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบรอบตรวจนับสต็อกที่ระบุ' });
        if (session.status !== 'กำลังตรวจนับ') return res.status(400).json({ success: false, message: `สถานะปัจจุบัน: ${session.status} ไม่สามารถส่งตรวจได้` });

        const itemCount = await StockAuditItem.countDocuments({ session_id: session._id });
        if (itemCount === 0) return res.status(400).json({ success: false, message: 'ยังไม่มีรายการสแกนใดๆ กรุณาสแกนสินค้าก่อนส่งตรวจ' });

        session.status = 'รอการอนุมัติ';
        await session.save();
        await logActivity(req, 'UPDATE', 'STOCK_AUDIT', `ส่งผลการตรวจนับสต็อกให้ตรวจสอบ (${itemCount} รายการ)`, null, session._id);
        res.json({ success: true, message: 'ส่งผลการตรวจนับสต็อกสำเร็จ รอการอนุมัติ', data: session });
    } catch (error) {
        console.error('API Error POST /api/stock-audit/sessions/:id/submit:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งผลการตรวจนับ' });
    }
});

// POST /api/stock-audit/items/:id/review — ตัดสิน: ผ่าน / ไม่ผ่าน / ตรวจใหม่ (พนักงานสต็อก)
router.post('/stock-audit/items/:id/review', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ตรวจสอบรายการสต็อก' });
        }
        const { scan_status, review_notes } = req.body;
        const allowed = ['ผ่าน', 'ไม่ผ่าน', 'ตรวจใหม่'];
        if (!scan_status || !allowed.includes(scan_status)) return res.status(400).json({ success: false, message: `สถานะต้องเป็น: ${allowed.join(', ')}` });

        const item = await StockAuditItem.findById(req.params.id).populate('session_id');
        if (!item) return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ระบุ' });

        const session = item.session_id;
        if (!session || (session.status !== 'รอการอนุมัติ' && session.status !== 'กำลังตรวจนับ')) {
            return res.status(400).json({ success: false, message: 'รอบนี้ยังไม่ถูกส่งตรวจ หรืออนุมัติแล้ว' });
        }

        item.scan_status = scan_status;
        item.review_notes = review_notes || '';
        item.reviewed_by = req.user.employee_id;
        item.reviewed_at = new Date();
        await item.save();

        if (scan_status === 'ตรวจใหม่') {
            await StockAuditSession.findByIdAndUpdate(session._id, { status: 'กำลังตรวจนับ' });
            await StockAuditItem.findByIdAndDelete(item._id);
            await StockAuditSession.findByIdAndUpdate(session._id, { $inc: { total_items_scanned: -1 } });
            return res.json({ success: true, message: `ส่งกลับให้ตรวจใหม่: IMEI ${item.imei} — รอบนี้เปิดให้สแกนใหม่แล้ว` });
        }

        await logActivity(req, 'UPDATE', 'STOCK_AUDIT', `ตรวจสอบ IMEI ${item.imei}: ${scan_status}`, null, item._id);
        res.json({ success: true, message: `บันทึกผล IMEI ${item.imei}: ${scan_status}`, data: item });
    } catch (error) {
        console.error('API Error POST /api/stock-audit/items/:id/review:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกผลการตรวจสอบ' });
    }
});

// POST /api/stock-audit/sessions/:id/close — ปิด session (พนักงานสต็อก)
router.post('/stock-audit/sessions/:id/close', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_stock_audit) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ปิดรอบตรวจนับสต็อก' });
        }
        const { notes } = req.body;
        const session = await StockAuditSession.findById(req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'ไม่พบรอบตรวจนับสต็อกที่ระบุ' });
        if (session.status !== 'รอการอนุมัติ' && session.status !== 'กำลังตรวจนับ') {
            return res.status(400).json({ success: false, message: `สถานะปัจจุบัน: ${session.status}` });
        }

        const pendingCount = await StockAuditItem.countDocuments({ session_id: session._id, scan_status: 'รอตรวจสอบ' });
        if (pendingCount > 0) return res.status(400).json({ success: false, message: `ยังมีสินค้ารอตรวจสอบอีก ${pendingCount} รายการ` });

        session.status = 'อนุมัติแล้ว';
        session.closed_by = req.user.employee_id;
        session.closed_at = new Date();
        if (notes) session.notes = notes;
        await session.save();

        const items = await StockAuditItem.find({ session_id: session._id });
        const summary = { passed: items.filter(i => i.scan_status === 'ผ่าน').length, failed: items.filter(i => i.scan_status === 'ไม่ผ่าน').length };
        res.json({ success: true, message: 'ปิดรอบตรวจนับสต็อกสำเร็จ', data: session, summary });
    } catch (error) {
        console.error('API Error POST /api/stock-audit/sessions/:id/close:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการปิดรอบตรวจนับสต็อก' });
    }
});

// ==========================================
// DEPOSIT MODULE (การมัดจำสินค้า)
// ==========================================

// GET /api/deposits — ดึงข้อมูลรายการมัดจำสินค้า
router.get('/deposits', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_deposits) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลมัดจำสินค้า' });
        }

        const userRole = req.user.role || '';
        const userBranchId = req.user.branch_id ? req.user.branch_id.toString() : '';
        const canFilterBranch = req.user.permissions.filter_stock_branch || userRole === 'Administrator' || userRole === 'ผู้จัดการ';

        const query = {};

        // คัดกรองตามสิทธิ์สาขา
        if (!canFilterBranch) {
            if (!userBranchId) return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาของผู้ใช้งาน' });
            query.branch_id = userBranchId;
        } else {
            if (req.query.branch_id && req.query.branch_id !== 'ALL') {
                query.branch_id = req.query.branch_id;
            }
        }

        // คัดกรองตามสถานะ
        if (req.query.status && req.query.status !== 'ALL') {
            query.status = req.query.status;
        }

        // คัดกรองตามขั้นตอนย่อย (stage)
        if (req.query.stage && req.query.stage !== 'ALL') {
            query.stage = req.query.stage;
        }

        // คัดกรองตามช่วงวันที่ (วันที่ทำรายการมัดจำ)
        if (req.query.startDate && req.query.endDate) {
            const start = new Date(req.query.startDate);
            start.setHours(0, 0, 0, 0);
            const end = new Date(req.query.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: start, $lte: end };
        }

        // ค้นหาตามชื่อลูกค้า หรือเบอร์โทร
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search.trim(), 'i');
            query.$or = [
                { customer_name: searchRegex },
                { customer_phone: searchRegex }
            ];
        }

        const list = await Deposit.find(query)
            .populate('branch_id', 'name')
            .populate('created_by', 'name')
            .populate('completed_by', 'name')
            .populate('cancelled_by', 'name')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: list });
    } catch (error) {
        console.error('API Error GET /api/deposits:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการมัดจำ' });
    }
});

// POST /api/deposits — บันทึกใบจองมัดจำใหม่
router.post('/deposits', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_deposits) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการจองมัดจำสินค้า' });
        }

        const {
            customer_name, customer_phone, product_id, product_name, product_price,
            deposit_amount, appointment_date, imei, payment_method, cash_amount,
            transfer_amount, stage, notes
        } = req.body;

        if (!customer_name || !customer_phone || !product_id || !product_name || !product_price || !deposit_amount || !payment_method) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' });
        }

        const userBranchId = req.user.branch_id ? req.user.branch_id.toString() : '';
        if (!userBranchId) return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลสาขาของผู้ใช้' });

        // สร้างเลขที่ใบจองอัตโนมัติ: DEP-YYYYMMDD-XXXX
        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
        const count = await Deposit.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } });
        const deposit_number = `DEP-${dateStr}-${String(count + 1).padStart(4, '0')}`;

        const remaining_amount = Math.max(0, Number(product_price) - Number(deposit_amount));

        const deposit = new Deposit({
            deposit_number,
            branch_id: userBranchId,
            customer_name,
            customer_phone,
            product_id,
            product_name,
            product_price: Number(product_price),
            deposit_amount: Number(deposit_amount),
            remaining_amount,
            appointment_date: appointment_date ? new Date(appointment_date) : null,
            imei: (imei || '').trim(),
            payment_method,
            cash_amount: Number(cash_amount) || 0,
            transfer_amount: Number(transfer_amount) || 0,
            stage: stage || 'รอลูกค้ารับเครื่อง',
            created_by: req.user.employee_id,
            notes: notes || ''
        });

        const saved = await deposit.save();

        // บันทึกเงินมัดจำลงในตารางเงินบัญชีหมุนเวียน (CashMovement)
        if (Number(deposit_amount) > 0) {
            const countMove = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
            const txn_id = `TXN-${dateStr}-${String(countMove + 1).padStart(4, '0')}`;

            const cashMove = new CashMovement({
                transaction_id: txn_id,
                type: 'รายรับ',
                category: 'อื่นๆ',
                amount: Number(deposit_amount),
                reference_id: saved._id,
                recorded_by: req.user.employee_id,
                created_at: new Date()
            });
            await cashMove.save();
        }

        await logActivity(req, 'CREATE', 'DEPOSIT', `สร้างใบมัดจำสินค้าใหม่ เลขที่ ${deposit_number} ยอดมัดจำ ฿${deposit_amount}`, deposit_number, saved._id);

        res.status(201).json({ success: true, message: 'บันทึกใบมัดจำสินค้าสำเร็จ', data: saved });
    } catch (error) {
        console.error('API Error POST /api/deposits:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างใบมัดจำสินค้า' });
    }
});

// PUT /api/deposits/:id — แก้ไขข้อมูลใบจองมัดจำ
router.put('/deposits/:id', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_deposits) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการแก้ไขใบมัดจำ' });
        }

        const {
            customer_name, customer_phone, product_id, product_name, product_price,
            deposit_amount, appointment_date, imei, payment_method, cash_amount,
            transfer_amount, stage, notes
        } = req.body;

        const deposit = await Deposit.findById(req.params.id);
        if (!deposit) return res.status(404).json({ success: false, message: 'ไม่พบรายการมัดจำที่ระบุ' });
        if (deposit.status !== 'รอดำเนินการ') {
            return res.status(400).json({ success: false, message: 'ไม่สามารถแก้ไขใบมัดจำที่เสร็จสมบูรณ์หรือยกเลิกแล้วได้' });
        }

        if (customer_name) deposit.customer_name = customer_name;
        if (customer_phone) deposit.customer_phone = customer_phone;
        if (product_id) deposit.product_id = product_id;
        if (product_name) deposit.product_name = product_name;
        if (product_price !== undefined) deposit.product_price = Number(product_price);
        if (deposit_amount !== undefined) deposit.deposit_amount = Number(deposit_amount);
        if (appointment_date !== undefined) deposit.appointment_date = appointment_date ? new Date(appointment_date) : null;
        if (imei !== undefined) deposit.imei = (imei || '').trim();
        if (payment_method) deposit.payment_method = payment_method;
        if (cash_amount !== undefined) deposit.cash_amount = Number(cash_amount) || 0;
        if (transfer_amount !== undefined) deposit.transfer_amount = Number(transfer_amount) || 0;
        if (stage) deposit.stage = stage;
        if (notes !== undefined) deposit.notes = notes;

        // คืนค่าค้างชำระใหม่
        deposit.remaining_amount = Math.max(0, deposit.product_price - deposit.deposit_amount);

        const updated = await deposit.save();
        await logActivity(req, 'UPDATE', 'DEPOSIT', `แก้ไขใบมัดจำสินค้า เลขที่ ${deposit.deposit_number}`, deposit.deposit_number, updated._id);

        res.json({ success: true, message: 'แก้ไขข้อมูลสำเร็จ', data: updated });
    } catch (error) {
        console.error('API Error PUT /api/deposits/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการแก้ไขใบมัดจำ' });
    }
});

// PUT /api/deposits/:id/complete — ส่งมอบสินค้าและตัดสต็อกเปลี่ยนเป็นบิล POS
router.put('/deposits/:id/complete', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_deposits) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ดำเนินการส่งมอบสินค้า' });
        }
        const { final_payment_method, final_cash_amount, final_transfer_amount, imei } = req.body;

        const deposit = await Deposit.findById(req.params.id);
        if (!deposit) return res.status(404).json({ success: false, message: 'ไม่พบรายการมัดจำที่ระบุ' });
        if (deposit.status !== 'รอดำเนินการ') {
            return res.status(400).json({ success: false, message: `รายการนี้อยู่ในสถานะ ${deposit.status} แล้ว` });
        }

        const selectedImei = (imei || deposit.imei || '').trim();

        // 1. ดึงข้อมูลสินค้า (ตรวจสอบว่าสินค้ายังคงมีอยู่ในระบบ)
        const product = await Product.findById(deposit.product_id);
        if (!product) return res.status(404).json({ success: false, message: 'ไม่พบสินค้าในระบบ' });

        // 2. สร้างใบเสร็จ Transaction (POS)
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
        const receipt_number = `INV-${dateStr}-${randomStr}`;

        const period = '1 เดือน'; // ค่าตั้งต้นระยะประกัน
        const expiry = new Date(now);
        expiry.setMonth(expiry.getMonth() + 1);

        const transaction = new Transaction({
            receipt_number,
            branch_id: deposit.branch_id,
            employee_id: req.user.employee_id,
            items: [{
                product_id: product._id,
                product_name: deposit.product_name,
                imei_sold: selectedImei,
                quantity: 1,
                price: deposit.product_price,
                warranty_period: period,
                warranty_expiry: expiry,
                is_gift: false
            }],
            total_amount: deposit.product_price,
            payment_type: 'ซื้อสด',
            payment_method: final_payment_method || deposit.payment_method,
            down_payment: 0,
            cash_amount: (Number(deposit.cash_amount) || 0) + (Number(final_cash_amount) || 0),
            transfer_amount: (Number(deposit.transfer_amount) || 0) + (Number(final_transfer_amount) || 0),
            status: 'เสร็จสิ้น'
        });

        const savedTransaction = await transaction.save();

        // 3. บันทึก CashMovement เฉพาะเงินที่จ่ายเพิ่มวันนี้ (ส่วนต่างค้างชำระ)
        const diffAmount = (Number(final_cash_amount) || 0) + (Number(final_transfer_amount) || 0);
        if (diffAmount > 0) {
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
            const count = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
            const txnDateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const txn_id = `TXN-${txnDateStr}-${String(count + 1).padStart(4, '0')}`;

            const cashMove = new CashMovement({
                transaction_id: txn_id,
                type: 'รายรับ',
                category: 'ขายสินค้า',
                amount: diffAmount,
                reference_id: savedTransaction._id,
                recorded_by: req.user.employee_id,
                created_at: new Date()
            });
            await cashMove.save();
        }

        // 5. อัปเดตใบมัดจำ
        deposit.status = 'สำเร็จ';
        deposit.bill_number = receipt_number;
        deposit.imei = selectedImei;
        deposit.completed_by = req.user.employee_id;
        deposit.completed_at = new Date();
        await deposit.save();

        await logActivity(req, 'UPDATE', 'DEPOSIT', `ดำเนินการส่งมอบเครื่องมัดจำสำเร็จ เลขใบเสร็จ: ${receipt_number}`, null, deposit._id);

        res.json({ success: true, message: 'ดำเนินการส่งมอบสินค้าสำเร็จ', data: deposit });
    } catch (error) {
        console.error('API Error PUT /api/deposits/:id/complete:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งมอบสินค้า' });
    }
});

// PUT /api/deposits/:id/cancel — ยกเลิกรายการจองมัดจำสินค้า
router.put('/deposits/:id/cancel', async (req, res) => {
    try {
        if (!req.user.permissions || !req.user.permissions.manage_deposits) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ในการยกเลิกรายการมัดจำ' });
        }
        const { reason } = req.body;

        const deposit = await Deposit.findById(req.params.id);
        if (!deposit) return res.status(404).json({ success: false, message: 'ไม่พบรายการมัดจำที่ระบุ' });
        if (deposit.status !== 'รอดำเนินการ') {
            return res.status(400).json({ success: false, message: 'ไม่สามารถยกเลิกรายการจองที่ดำเนินการเสร็จสิ้นหรือยกเลิกแล้วได้' });
        }

        deposit.status = 'ยกเลิก';
        deposit.cancelled_by = req.user.employee_id;
        deposit.cancelled_at = new Date();
        deposit.cancel_reason = reason || 'ไม่ระบุ';
        await deposit.save();

        await logActivity(req, 'CANCEL', 'DEPOSIT', `ยกเลิกใบมัดจำสินค้า เลขที่ ${deposit.deposit_number} เนื่องจาก: ${reason || 'ไม่ระบุ'}`, deposit.deposit_number, deposit._id);

        res.json({ success: true, message: 'ยกเลิกรายการมัดจำสำเร็จ', data: deposit });
    } catch (error) {
        console.error('API Error PUT /api/deposits/:id/cancel:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการยกเลิกรายการมัดจำ' });
    }
});

// ==========================================
// Requisition (แจ้งเบิกสินค้า) Routes
// ==========================================

// GET /api/requisitions - ดึงข้อมูลแจ้งเบิกสินค้า
router.get('/requisitions', async (req, res) => {
    try {
        let query = {};
        const { date, search, status, branch } = req.query;

        // Security / Filter:
        const canManage = ['แอดมิน', 'ผู้จัดการ', 'ฝ่ายจัดซื้อ', 'พนักงานสต็อก'].includes(req.user.role) || (req.user.permissions && req.user.permissions.manage_requisitions);
        
        if (!canManage) {
            query.requested_by = req.user.employee_id;
        } else if (branch && branch !== 'all') {
            const employeesInBranch = await Employee.find({ branch_id: branch }).select('_id');
            const employeeIds = employeesInBranch.map(emp => emp._id);
            query.requested_by = { $in: employeeIds };
        }

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: startDate, $lte: endDate };
        }

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { 'items.name': { $regex: search, $options: 'i' } }
            ];
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        const requisitions = await Requisition.find(query)
            .populate({
                path: 'requested_by',
                select: 'name branch_id',
                populate: { path: 'branch_id', select: 'name' }
            })
            .sort({ createdAt: -1 });

        res.json({ success: true, data: requisitions });
    } catch (error) {
        console.error('API Error GET /api/requisitions:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลแจ้งเบิกสินค้า' });
    }
});

// POST /api/requisitions - สร้างรายการแจ้งเบิกใหม่
router.post('/requisitions', async (req, res) => {
    try {
        const { title, items, notes } = req.body;
        const requested_by = req.user.employee_id;

        if (!title || !items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน กรุณาระบุชื่อรายการและรายการสินค้า' });
        }

        const newReq = new Requisition({
            title,
            items,
            notes,
            requested_by,
            status: 'รอตรวจสอบ'
        });

        await newReq.save();
        await logActivity(req, 'CREATE', 'REQUISITION', `สร้างรายการแจ้งเบิกสินค้า: ${title}`, null, newReq._id);

        res.json({ success: true, message: 'สร้างรายการแจ้งเบิกสำเร็จ', data: newReq });
    } catch (error) {
        console.error('API Error POST /api/requisitions:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้างรายการแจ้งเบิก' });
    }
});

// PUT /api/requisitions/:id - อัปเดตรายการแจ้งเบิกสินค้า
router.put('/requisitions/:id', async (req, res) => {
    try {
        const canManage = ['แอดมิน', 'ผู้จัดการ', 'ฝ่ายจัดซื้อ', 'พนักงานสต็อก'].includes(req.user.role) || (req.user.permissions && req.user.permissions.manage_requisitions);
        
        const reqDoc = await Requisition.findById(req.params.id);
        if (!reqDoc) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการที่ต้องการแก้ไข' });
        }

        if (!canManage) {
            // Check if it's the user's own requisition and it's still waiting
            if (reqDoc.requested_by.toString() !== req.user.employee_id.toString()) {
                return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์แก้ไขรายการเบิกสินค้านี้' });
            }
            if (reqDoc.status !== 'รอตรวจสอบ') {
                return res.status(400).json({ success: false, message: 'ไม่สามารถแก้ไขรายการที่ถูกดำเนินการไปแล้วได้' });
            }
        }

        const { title, items, notes, status, expected_date } = req.body;

        if (title) reqDoc.title = title;
        if (items) reqDoc.items = items;
        if (notes !== undefined) reqDoc.notes = notes;
        if (status) reqDoc.status = status;
        if (expected_date !== undefined) reqDoc.expected_date = expected_date;

        await reqDoc.save();
        await logActivity(req, 'UPDATE', 'REQUISITION', `อัปเดตรายการเบิกสินค้า: ${reqDoc.title}`, null, reqDoc._id);

        res.json({ success: true, message: 'บันทึกการแก้ไขเรียบร้อยแล้ว', data: reqDoc });
    } catch (error) {
        console.error('API Error PUT /api/requisitions/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดตรายการเบิกสินค้า' });
    }
});

// DELETE /api/requisitions/:id - ลบรายการแจ้งเบิก
router.delete('/requisitions/:id', async (req, res) => {
    try {
        const reqId = req.params.id;
        const requisition = await Requisition.findById(reqId);

        if (!requisition) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งเบิก' });
        }

        const canManage = ['แอดมิน', 'ผู้จัดการ', 'ฝ่ายจัดซื้อ', 'พนักงานสต็อก'].includes(req.user.role) || (req.user.permissions && req.user.permissions.manage_requisitions);
        // Only allow delete if can manage OR if it's the user's own requisition and it's still waiting
        if (!canManage && (requisition.requested_by.toString() !== req.user.employee_id || requisition.status !== 'รอตรวจสอบ')) {
            return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์ลบรายการแจ้งเบิกสินค้านี้' });
        }

        await Requisition.findByIdAndDelete(reqId);
        await logActivity(req, 'DELETE', 'REQUISITION', `ลบรายการแจ้งเบิกสินค้า: ${requisition.title}`, null, reqId);

        res.json({ success: true, message: 'ลบรายการแจ้งเบิกสำเร็จ' });
    } catch (error) {
        console.error('API Error DELETE /api/requisitions/:id:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบรายการแจ้งเบิก' });
    }
});

module.exports = router;
