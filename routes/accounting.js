const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const {
    AccountCategory, AccountGroup, AccountChart, AccountBook, AccountDocument, AccountBookLink, DisbursementVoucher, OtherEntry,
    Employee, Branch, CashMovement, Transaction, PurchaseOrder, FinanceReceivable, AuditLog
} = require('../models');
const { uploadBufferToDriveInFolder } = require('../utils/googleDrive');


// ============================================
// Middleware: Token Verification
// ============================================
function verifyToken(req, res, next) {
    if (req.path === '/auth/login') return next();
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
}
router.use(verifyToken);

// ============================================
// Middleware: Require manage_finance permission
// ============================================
function requireFinancePermission(req, res, next) {
    if (!req.user || !req.user.permissions || !req.user.permissions.manage_finance) {
        return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึงระบบบัญชี (ต้องการสิทธิ์จัดการการเงิน)' });
    }
    next();
}
router.use(requireFinancePermission);

// Helper: total cash amount of a disbursement voucher (net + VAT)
function voucherTotalAmount(v) {
    return v.net_amount + v.vat_amount;
}

// Helpers: local-date parts (not toISOString, which is UTC and mis-dates
// documents created between 00:00-06:59 local time, ICT/UTC+7).
function localYearMonth(date) {
    return date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0');
}
function localYearMonthDay(date) {
    return localYearMonth(date) + String(date.getDate()).padStart(2, '0');
}

// Helper: Log activity
async function logActivity(req, action, module, description, targetId, refNo, details) {
    try {
        const emp = await Employee.findById(req.user.employee_id);
        await AuditLog.create({
            action, module, description,
            target_id: targetId || null,
            reference_no: refNo || '',
            details: details || null,
            ip_address: req.ip,
            user_id: req.user.employee_id,
            user_name: emp ? emp.name : 'ไม่ทราบ',
            branch_id: (emp && emp.branch_id) || req.user.branch_id || null
        });
    } catch (e) { console.error('Log error:', e.message); }
}

// กลุ่มบัญชีเริ่มต้นที่ seedDefaultCOA (models/index.js) สร้างให้ — ต้องตรงกับ defaultGroups ในนั้น
// seed ค้นกลุ่มด้วย group_code แล้วสร้างใหม่ถ้าไม่เจอ จึงห้ามลบหรือเปลี่ยนรหัส ไม่งั้นรีสตาร์ทแล้วจะได้กลุ่มซ้ำกลับมา
const SYSTEM_GROUP_CODES = new Set(['110', '210', '310', '410', '510']);
const isSystemGroup = (group) => SYSTEM_GROUP_CODES.has(group.group_code);

// ความยาวสูงสุดของรหัส/ชื่อ ต้องตรงกับ maxlength ในฟอร์ม (index.html) — กันคนยิง API ตรงข้ามฟอร์ม
const MAX_CODE_LEN = 20;
const MAX_NAME_LEN = 120;
const lengthError = (code, name) =>
    code.length > MAX_CODE_LEN ? `รหัสต้องไม่เกิน ${MAX_CODE_LEN} ตัวอักษร`
        : name.length > MAX_NAME_LEN ? `ชื่อต้องไม่เกิน ${MAX_NAME_LEN} ตัวอักษร` : null;

// ============================================
// 1. CHART OF ACCOUNTS APIs
// ============================================

// GET /api/acct/chart-of-accounts - Fetch all nested COA
router.get('/chart-of-accounts', async (req, res) => {
    try {
        const [categories, groups, accounts] = await Promise.all([
            AccountCategory.find().sort({ category_code: 1 }).lean(),
            AccountGroup.find().populate('category_id').sort({ group_code: 1 }).lean(),
            AccountChart.find().populate('category_id').populate('group_id').sort({ account_code: 1 }).lean()
        ]);
        // is_system ของกลุ่มคำนวณจากรหัส (schema ไม่มีฟิลด์นี้) — เพิ่มฟิลด์เฉยๆ ไม่เปลี่ยนรูปร่างเดิม
        groups.forEach(g => { g.is_system = isSystemGroup(g); });
        res.json({ success: true, categories, groups, accounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/chart-of-accounts - Add or Edit an account
// group_id ไม่บังคับ: หน้า "รหัสบัญชี" ส่งมาแค่ รหัส/ชื่อ/หมวด ส่วนหน้า "ตั้งค่าผังบัญชี" (เดิม) ส่งกลุ่มมาด้วย
router.post('/chart-of-accounts', async (req, res) => {
    try {
        const { _id, category_id, level } = req.body;
        const account_code = String(req.body.account_code || '').trim();
        const account_name = String(req.body.account_name || '').trim();
        const hasGroup = Object.prototype.hasOwnProperty.call(req.body, 'group_id');
        const group_id = req.body.group_id || null;
        const hasBook = Object.prototype.hasOwnProperty.call(req.body, 'book_id');
        const book_id = req.body.book_id || null;
        if (!account_code || !account_name || !category_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        const accLenErr = lengthError(account_code, account_name);
        if (accLenErr) return res.status(400).json({ success: false, message: accLenErr });
        const [category, group, book, dup] = await Promise.all([
            AccountCategory.findById(category_id).lean(),
            group_id ? AccountGroup.findById(group_id).lean() : null,
            book_id ? AccountBook.findById(book_id).lean() : null,
            AccountChart.findOne({ account_code, ...(_id ? { _id: { $ne: _id } } : {}) }).lean()
        ]);
        if (!category) return res.status(400).json({ success: false, message: 'ไม่พบหมวดบัญชีที่เลือก' });
        if (group_id && (!group || String(group.category_id) !== String(category._id))) {
            return res.status(400).json({ success: false, message: 'กลุ่มบัญชีไม่ตรงกับหมวดที่เลือก' });
        }
        if (book_id && (!book || String(book.category_id || '') !== String(category._id))) {
            return res.status(400).json({ success: false, message: 'สมุดบัญชีไม่ตรงกับหมวดที่เลือก' });
        }
        if (dup) return res.status(400).json({ success: false, message: 'รหัสบัญชีนี้มีอยู่แล้ว' });
        // เพิ่มรหัสบัญชีใหม่เข้ากลุ่มที่ปิดใช้งานไม่ได้ (แก้บัญชีเดิมที่อยู่ในกลุ่มนั้นยังทำได้)
        if (!_id && group && group.is_active === false) {
            return res.status(400).json({ success: false, message: 'กลุ่มบัญชีนี้ปิดการใช้งานอยู่ เปิดการใช้งานกลุ่มก่อนจึงจะเพิ่มรหัสบัญชีได้' });
        }

        let account;
        if (_id) {
            account = await AccountChart.findById(_id);
            if (!account) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
            // ย้ายบัญชีเดิมเข้ากลุ่มที่ปิดใช้งานไม่ได้ (บัญชีที่อยู่ในกลุ่มนั้นอยู่แล้วแก้ไขอย่างอื่นได้ตามปกติ)
            if (hasGroup && group && group.is_active === false && String(account.group_id || '') !== String(group._id)) {
                return res.status(400).json({ success: false, message: 'กลุ่มบัญชีนี้ปิดการใช้งานอยู่ ย้ายบัญชีเข้ากลุ่มนี้ไม่ได้' });
            }
            if (account.is_system && account.account_code !== account_code) {
                return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนรหัสบัญชีระบบได้' });
            }
            const categoryChanged = String(account.category_id) !== String(category._id);
            account.account_code = account_code;
            account.account_name = account_name;
            account.category_id = category._id;
            // ไม่ได้ส่งกลุ่มมา = คงกลุ่มเดิมไว้ เว้นแต่ย้ายหมวด (กลุ่มเดิมไม่ตรงหมวดใหม่แล้ว จึงล้างทิ้ง)
            if (hasGroup) account.group_id = group_id;
            else if (categoryChanged) account.group_id = null;
            // สมุดบัญชี: ไม่ได้ส่งมา = คงเดิม เว้นแต่ย้ายหมวด (สมุดเดิมอยู่คนละหมวดแล้ว จึงล้างทิ้ง)
            if (hasBook) account.book_id = book_id;
            else if (categoryChanged) account.book_id = null;
            if (level) account.level = level;
            await account.save();
            await logActivity(req, 'UPDATE', 'COA', `แก้ไขผังบัญชี ${account_code} ${account_name}`, account._id);
        } else {
            account = await AccountChart.create({ account_code, account_name, category_id: category._id, group_id, book_id, level: level || 3 });
            await logActivity(req, 'CREATE', 'COA', `เพิ่มผังบัญชี ${account_code} ${account_name}`, account._id);
        }
        res.json({ success: true, account });
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(400).json({ success: false, message: 'รหัสบัญชีนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/acct/chart-of-accounts/:id
router.delete('/chart-of-accounts/:id', async (req, res) => {
    try {
        const account = await AccountChart.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
        if (account.is_system) return res.status(400).json({ success: false, message: 'ไม่สามารถลบบัญชีระบบได้ (ปิดการใช้งานแทนได้)' });
        // บัญชีที่เอกสารอ้างถึงอยู่ ลบแล้วเอกสารเก่าจะชี้ไปที่ของที่ไม่มี — ให้ปิดการใช้งานแทน
        const dvCount = await DisbursementVoucher.countDocuments({ $or: [{ debit_account_id: account._id }, { credit_account_id: account._id }] });
        if (dvCount) {
            return res.status(400).json({ success: false, message: 'ลบไม่ได้ เพราะบัญชีนี้ถูกใช้ในใบสำคัญจ่ายแล้ว (ปิดการใช้งานแทนได้)' });
        }
        await AccountChart.findByIdAndDelete(req.params.id);
        await logActivity(req, 'DELETE', 'COA', `ลบผังบัญชี ${account.account_code} ${account.account_name}`, account._id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/acct/chart-of-accounts/:id/active — เปิด/ปิดการใช้งานบัญชี (ใช้ได้กับบัญชีระบบด้วย)
// ปิดแล้วบัญชียังอยู่ครบ เอกสารเก่า/รายงาน/สรุปยอดรายวันที่ค้นด้วยรหัสยังทำงานเหมือนเดิม
// แค่ไม่ให้เลือกใช้ในเอกสารใหม่ (ใบสำคัญจ่าย) — seed ไม่ยุ่งกับบัญชีที่ปิด เพราะสร้างเฉพาะรหัสที่ไม่มี
router.patch('/chart-of-accounts/:id/active', async (req, res) => {
    try {
        if (typeof req.body.is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
        }
        const account = await AccountChart.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
        account.is_active = req.body.is_active;
        await account.save();
        await logActivity(req, 'UPDATE', 'COA',
            `${account.is_active ? 'เปิด' : 'ปิด'}การใช้งานบัญชี ${account.account_code} ${account.account_name}`, account._id, account.account_code);
        res.json({ success: true, account });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/account-groups - เพิ่ม (ไม่มี _id) หรือแก้ไข (มี _id) กลุ่มบัญชี
// หน้า "ประเภทบัญชี" ใช้ทั้งเพิ่มและแก้ไข ส่วนโมดัลเพิ่มกลุ่มเดิมส่งมาแบบไม่มี _id (เพิ่มอย่างเดียว)
router.post('/account-groups', async (req, res) => {
    try {
        const { _id, category_id } = req.body;
        const group_code = String(req.body.group_code || '').trim();
        const group_name = String(req.body.group_name || '').trim();
        if (!group_code || !group_name || !category_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        const grpLenErr = lengthError(group_code, group_name);
        if (grpLenErr) return res.status(400).json({ success: false, message: grpLenErr });
        const [category, exists] = await Promise.all([
            AccountCategory.findById(category_id).lean(),
            AccountGroup.findOne({ group_code, ...(_id ? { _id: { $ne: _id } } : {}) }).lean()
        ]);
        if (!category) return res.status(400).json({ success: false, message: 'ไม่พบหมวดบัญชีที่เลือก' });
        if (exists) return res.status(400).json({ success: false, message: 'รหัสกลุ่มนี้มีอยู่แล้ว' });

        let group;
        if (_id) {
            group = await AccountGroup.findById(_id);
            if (!group) return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มบัญชีนี้' });
            if (isSystemGroup(group) && group.group_code !== group_code) {
                return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนรหัสกลุ่มบัญชีระบบได้' });
            }
            // ย้ายหมวดได้เฉพาะกลุ่มที่ยังไม่มีใครใช้ — ไม่งั้นบัญชีในกลุ่มจะอยู่คนละหมวดกับกลุ่มของตัวเอง
            if (String(group.category_id) !== String(category._id)) {
                const accCount = await AccountChart.countDocuments({ group_id: group._id });
                if (accCount) {
                    return res.status(400).json({ success: false, message: 'เปลี่ยนหมวดไม่ได้ เพราะกลุ่มนี้มีรหัสบัญชีอยู่' });
                }
            }
            group.group_code = group_code;
            group.group_name = group_name;
            group.category_id = category._id;
            await group.save();
            await logActivity(req, 'UPDATE', 'COA', `แก้ไขกลุ่มบัญชี ${group_code} ${group_name}`, group._id, group_code);
        } else {
            group = await AccountGroup.create({ group_code, group_name, category_id: category._id });
            await logActivity(req, 'CREATE', 'COA', `เพิ่มกลุ่มบัญชี ${group_code} ${group_name}`, group._id, group_code);
        }
        res.json({ success: true, group });
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(400).json({ success: false, message: 'รหัสกลุ่มนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// PATCH /api/acct/account-groups/:id/active — เปิด/ปิดการใช้งานกลุ่ม (ใช้ได้กับกลุ่มระบบด้วย)
// ปิดแล้วกลุ่มและรหัสบัญชีในกลุ่มยังอยู่ครบ รายงานเดิมไม่กระทบ แค่ไม่ให้เพิ่มรหัสบัญชีใหม่เข้ากลุ่มนี้
router.patch('/account-groups/:id/active', async (req, res) => {
    try {
        if (typeof req.body.is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
        }
        const group = await AccountGroup.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มบัญชีนี้' });
        group.is_active = req.body.is_active;
        await group.save();
        await logActivity(req, 'UPDATE', 'COA',
            `${group.is_active ? 'เปิด' : 'ปิด'}การใช้งานกลุ่มบัญชี ${group.group_code} ${group.group_name}`, group._id, group.group_code);
        res.json({ success: true, group });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/acct/account-groups/:id — ลบได้เฉพาะกลุ่มที่ไม่ใช่ของระบบและไม่มีใครอ้างถึง
router.delete('/account-groups/:id', async (req, res) => {
    try {
        const group = await AccountGroup.findById(req.params.id).lean();
        if (!group) return res.status(404).json({ success: false, message: 'ไม่พบกลุ่มบัญชีนี้' });
        if (isSystemGroup(group)) return res.status(400).json({ success: false, message: 'ไม่สามารถลบกลุ่มบัญชีระบบได้' });
        const accCount = await AccountChart.countDocuments({ group_id: group._id });
        if (accCount) return res.status(400).json({ success: false, message: `ลบไม่ได้ เพราะมีรหัสบัญชี ${accCount} รายการอยู่ในกลุ่มนี้` });
        await AccountGroup.findByIdAndDelete(group._id);
        await logActivity(req, 'DELETE', 'COA', `ลบกลุ่มบัญชี ${group.group_code} ${group.group_name}`, group._id, group.group_code);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 1.1 ACCOUNT BOOK APIs (สมุดบัญชี)
// ============================================

// GET /api/acct/account-books
router.get('/account-books', async (req, res) => {
    try {
        const books = await AccountBook.find().sort({ book_code: 1 }).lean();
        res.json({ success: true, books });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/account-books - เพิ่ม (ไม่มี _id) หรือแก้ไข (มี _id)
router.post('/account-books', async (req, res) => {
    try {
        const { _id } = req.body;
        const book_code = String(req.body.book_code || '').trim();
        const book_name = String(req.body.book_name || '').trim();
        const category_id = req.body.category_id || null;
        if (!book_code || !book_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสและชื่อสมุดบัญชีให้ครบถ้วน' });
        }
        const dup = await AccountBook.findOne({ book_code, ...(_id ? { _id: { $ne: _id } } : {}) }).lean();
        if (dup) return res.status(400).json({ success: false, message: 'รหัสสมุดบัญชีนี้มีอยู่แล้ว' });
        if (category_id && !(await AccountCategory.exists({ _id: category_id }))) {
            return res.status(400).json({ success: false, message: 'ไม่พบหมวดบัญชีที่เลือก' });
        }

        let book;
        if (_id) {
            book = await AccountBook.findById(_id);
            if (!book) return res.status(404).json({ success: false, message: 'ไม่พบสมุดบัญชีนี้' });
            // ย้ายสมุดไปหมวดอื่นไม่ได้ถ้ายังมีรหัสบัญชีผูกอยู่ — ไม่งั้นรหัสเหล่านั้นจะอยู่คนละหมวดกับสมุด
            if (String(book.category_id || '') !== String(category_id || '')) {
                const accCount = await AccountChart.countDocuments({ book_id: book._id });
                if (accCount) return res.status(400).json({ success: false, message: `ย้ายหมวดไม่ได้ เพราะมีรหัสบัญชีผูกกับสมุดนี้อยู่ ${accCount} รายการ — เปลี่ยนสมุดของรหัสเหล่านั้นก่อน` });
            }
            book.book_code = book_code;
            book.book_name = book_name;
            book.category_id = category_id;
            await book.save();
            await logActivity(req, 'UPDATE', 'ACCOUNT_BOOK', `แก้ไขสมุดบัญชี ${book_code} ${book_name}`, book._id, book_code);
        } else {
            book = await AccountBook.create({ book_code, book_name, category_id });
            await logActivity(req, 'CREATE', 'ACCOUNT_BOOK', `เพิ่มสมุดบัญชี ${book_code} ${book_name}`, book._id, book_code);
        }
        res.json({ success: true, book });
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(400).json({ success: false, message: 'รหัสสมุดบัญชีนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/acct/account-books/:id
router.delete('/account-books/:id', async (req, res) => {
    try {
        const book = await AccountBook.findById(req.params.id).lean();
        if (!book) return res.status(404).json({ success: false, message: 'ไม่พบสมุดบัญชีนี้' });
        // สมุดที่ถูกเชื่อมกับเอกสารอยู่ (ไม่ว่าการเชื่อมจะเปิดหรือปิด) ห้ามลบ ไม่งั้นการเชื่อมจะชี้ไปที่สมุดที่ไม่มีแล้ว
        const linkCount = await AccountBookLink.countDocuments({ book_id: book._id });
        if (linkCount > 0) {
            return res.status(400).json({
                success: false,
                message: `สมุดบัญชีนี้ถูกเชื่อมกับเอกสารอยู่ ${linkCount} รายการ — ไปที่เมนู "เชื่อมสมุดบัญชีกับเอกสาร" เปลี่ยนการเชื่อมไปสมุดอื่นก่อนจึงจะลบได้`
            });
        }
        const accLinked = await AccountChart.countDocuments({ book_id: book._id });
        if (accLinked > 0) {
            return res.status(400).json({ success: false, message: `สมุดบัญชีนี้มีรหัสบัญชีผูกอยู่ ${accLinked} รายการ — เปลี่ยนสมุดของรหัสบัญชีเหล่านั้นก่อนจึงจะลบได้` });
        }
        await AccountBook.findByIdAndDelete(req.params.id);
        await logActivity(req, 'DELETE', 'ACCOUNT_BOOK', `ลบสมุดบัญชี ${book.book_code} ${book.book_name}`, book._id, book.book_code);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 1.2 ACCOUNT DOCUMENT APIs (รายการเอกสาร) + ACCOUNT BOOK LINK APIs (เชื่อมสมุดบัญชีกับเอกสาร)
// ทุก endpoint ผ่าน requireFinancePermission (manage_finance) ของ router นี้อยู่แล้ว
// ปิดการใช้งานแทนการลบ — ไม่มี DELETE
// ============================================

// GET /api/acct/account-documents
router.get('/account-documents', async (req, res) => {
    try {
        const documents = await AccountDocument.find().sort({ doc_name: 1 }).lean();
        res.json({ success: true, documents });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/account-documents - เพิ่ม (ไม่มี _id) หรือแก้ชื่อ (มี _id)
router.post('/account-documents', async (req, res) => {
    try {
        const { _id } = req.body;
        const doc_code = String(req.body.doc_code || '').trim();
        const doc_name = String(req.body.doc_name || '').trim();
        if (!doc_code || !doc_name) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสและชื่อเอกสารให้ครบถ้วน' });
        }
        if (_id && !mongoose.Types.ObjectId.isValid(_id)) {
            return res.status(400).json({ success: false, message: 'ข้อมูลอ้างอิงเอกสารไม่ถูกต้อง' });
        }
        // รหัสและชื่อต้องไม่ซ้ำ — ดึงทีเดียวแล้วแยกข้อความตามที่ซ้ำ
        const dups = await AccountDocument.find({
            $or: [{ doc_code }, { doc_name }],
            ...(_id ? { _id: { $ne: _id } } : {})
        }).lean();
        if (dups.some(d => d.doc_code === doc_code)) return res.status(400).json({ success: false, message: 'รหัสเอกสารนี้มีอยู่แล้ว' });
        if (dups.some(d => d.doc_name === doc_name)) return res.status(400).json({ success: false, message: 'ชื่อเอกสารนี้มีอยู่แล้ว' });

        let doc;
        if (_id) {
            doc = await AccountDocument.findById(_id);
            if (!doc) return res.status(404).json({ success: false, message: 'ไม่พบเอกสารนี้' });
            const oldLabel = `${doc.doc_code || '-'} ${doc.doc_name}`;
            doc.doc_code = doc_code;
            doc.doc_name = doc_name;
            await doc.save();
            await logActivity(req, 'UPDATE', 'ACCOUNT_DOCUMENT', `แก้ไขเอกสาร "${oldLabel}" เป็น "${doc_code} ${doc_name}"`, doc._id, doc_code);
        } else {
            doc = await AccountDocument.create({ doc_code, doc_name });
            await logActivity(req, 'CREATE', 'ACCOUNT_DOCUMENT', `เพิ่มเอกสาร ${doc_code} "${doc_name}"`, doc._id, doc_code);
        }
        res.json({ success: true, document: doc });
    } catch (err) {
        if (err && err.code === 11000) {
            const byCode = err.keyPattern && err.keyPattern.doc_code;
            return res.status(400).json({ success: false, message: byCode ? 'รหัสเอกสารนี้มีอยู่แล้ว' : 'ชื่อเอกสารนี้มีอยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/acct/account-documents/:id/active - เปิด/ปิดการใช้งานเอกสาร  body: { is_active: boolean }
router.put('/account-documents/:id/active', async (req, res) => {
    try {
        if (typeof req.body.is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'กรุณาระบุสถานะ is_active เป็น true/false' });
        }
        const doc = await AccountDocument.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'ไม่พบเอกสารนี้' });
        doc.is_active = req.body.is_active;
        await doc.save();
        await logActivity(req, 'UPDATE', 'ACCOUNT_DOCUMENT',
            `${doc.is_active ? 'เปิด' : 'ปิด'}การใช้งานเอกสาร ${doc.doc_code || '-'} "${doc.doc_name}"`, doc._id, doc.doc_code || doc.doc_name);
        res.json({ success: true, document: doc });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/acct/account-book-links
// คืนเฉพาะรหัสอ้างอิง — หน้าเว็บโหลดรายการเอกสาร/สมุดบัญชีมาอยู่แล้วเพื่อใช้ในดรอปดาวน์ จึงจับคู่ชื่อฝั่งหน้าเว็บ
router.get('/account-book-links', async (req, res) => {
    try {
        const links = await AccountBookLink.find().sort({ createdAt: -1 }).lean();
        res.json({ success: true, links });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/account-book-links - เพิ่มการเชื่อม (ไม่มี _id) หรือแก้ (มี _id)  body: { _id?, document_id, book_id }
router.post('/account-book-links', async (req, res) => {
    try {
        const { _id, document_id, book_id } = req.body;
        if (!document_id || !book_id) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกเอกสารและสมุดบัญชีให้ครบ' });
        }
        if (![document_id, book_id, ...(_id ? [_id] : [])].every(v => mongoose.Types.ObjectId.isValid(v))) {
            return res.status(400).json({ success: false, message: 'รหัสอ้างอิงไม่ถูกต้อง' });
        }

        const [doc, book, dup, existing] = await Promise.all([
            AccountDocument.findById(document_id).lean(),
            AccountBook.findById(book_id).lean(),
            AccountBookLink.findOne({ document_id, book_id, ...(_id ? { _id: { $ne: _id } } : {}) }).lean(),
            _id ? AccountBookLink.findById(_id) : null
        ]);
        if (!doc) return res.status(400).json({ success: false, message: 'ไม่พบเอกสารที่เลือก' });
        if (!book) return res.status(400).json({ success: false, message: 'ไม่พบสมุดบัญชีที่เลือก' });
        if (dup) return res.status(400).json({ success: false, message: 'เอกสารนี้เชื่อมกับสมุดบัญชีนี้อยู่แล้ว' });
        if (_id && !existing) return res.status(404).json({ success: false, message: 'ไม่พบการเชื่อมนี้' });

        // เชื่อมเอกสารที่ปิดอยู่ไม่ได้ — ยกเว้นตอนแก้การเชื่อมเดิมโดยไม่เปลี่ยนเอกสาร
        const documentChanged = !existing || String(existing.document_id) !== String(doc._id);
        if (!doc.is_active && documentChanged) {
            return res.status(400).json({ success: false, message: 'เอกสารนี้ปิดการใช้งานอยู่ — เปิดการใช้งานก่อนจึงจะเชื่อมได้' });
        }

        const label = `${doc.doc_code || '-'} "${doc.doc_name}" ↔ ${book.book_code} ${book.book_name}`;
        let link;
        if (existing) {
            existing.document_id = doc._id;
            existing.book_id = book._id;
            await existing.save();
            link = existing;
            await logActivity(req, 'UPDATE', 'ACCOUNT_BOOK_LINK', `แก้ไขการเชื่อมสมุดบัญชี ${label}`, link._id, book.book_code);
        } else {
            link = await AccountBookLink.create({ document_id: doc._id, book_id: book._id });
            await logActivity(req, 'CREATE', 'ACCOUNT_BOOK_LINK', `เพิ่มการเชื่อมสมุดบัญชี ${label}`, link._id, book.book_code);
        }
        res.json({ success: true, link });
    } catch (err) {
        if (err && err.code === 11000) {
            return res.status(400).json({ success: false, message: 'เอกสารนี้เชื่อมกับสมุดบัญชีนี้อยู่แล้ว' });
        }
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/acct/account-book-links/:id/active - เปิด/ปิดการเชื่อม  body: { is_active: boolean }
router.put('/account-book-links/:id/active', async (req, res) => {
    try {
        if (typeof req.body.is_active !== 'boolean') {
            return res.status(400).json({ success: false, message: 'กรุณาระบุสถานะ is_active เป็น true/false' });
        }
        const link = await AccountBookLink.findById(req.params.id);
        if (!link) return res.status(404).json({ success: false, message: 'ไม่พบการเชื่อมนี้' });
        link.is_active = req.body.is_active;
        await link.save();
        const [doc, book] = await Promise.all([
            AccountDocument.findById(link.document_id).lean(),
            AccountBook.findById(link.book_id).lean()
        ]);
        await logActivity(req, 'UPDATE', 'ACCOUNT_BOOK_LINK',
            `${link.is_active ? 'เปิด' : 'ปิด'}การเชื่อมสมุดบัญชี ${doc ? (doc.doc_code || '-') + ' "' + doc.doc_name + '"' : '-'} ↔ ${book ? book.book_code + ' ' + book.book_name : '-'}`,
            link._id, book ? book.book_code : '');
        res.json({ success: true, link });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 3. DISBURSEMENT VOUCHER APIs
// ============================================

// GET /api/acct/disbursements
router.get('/disbursements', async (req, res) => {
    try {
        const filter = {};
        if (req.query.startDate || req.query.endDate) {
            filter.payment_date = {};
            if (req.query.startDate) filter.payment_date.$gte = new Date(req.query.startDate + 'T00:00:00');
            if (req.query.endDate) filter.payment_date.$lte = new Date(req.query.endDate + 'T23:59:59');
        }
        if (req.query.branch_id) filter.branch_id = req.query.branch_id;
        const vouchers = await DisbursementVoucher.find(filter)
            .populate('debit_account_id')
            .populate('credit_account_id')
            .populate('branch_id')
            .populate('created_by', 'name')
            .sort({ created_at: -1 })
            .lean();

        const voucherObjs = vouchers.map(obj => {
            obj.total_amount = voucherTotalAmount(obj);
            return obj;
        });

        res.json({ success: true, vouchers: voucherObjs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/disbursements - Create disbursement voucher
router.post('/disbursements', async (req, res) => {
    try {
        const { payment_date, branch_id, debit_account_id, credit_account_id, amount, vat_type, payee_name, remark, proof_image_base64 } = req.body;
        if (!debit_account_id || !credit_account_id || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        const inactiveCount = await AccountChart.countDocuments({
            _id: { $in: [debit_account_id, credit_account_id] }, is_active: false
        });
        if (inactiveCount) {
            return res.status(400).json({ success: false, message: 'บัญชีที่เลือกถูกปิดการใช้งานแล้ว' });
        }

        // Auto-generate voucher number: PV-YYYYMM-XXXX (Running count reset monthly).
        // Count by voucher_no prefix (not payment_date) so a user-editable/back-dated
        // payment_date can never cause a duplicate voucher_no.
        const today = new Date();
        const yearMonth = localYearMonth(today);
        const countMonth = await DisbursementVoucher.countDocuments({ voucher_no: { $regex: `^PV-${yearMonth}-` } });
        const voucher_no = `PV-${yearMonth}-${String(countMonth + 1).padStart(4, '0')}`;

        // Calculate VAT
        let net_amount = amount;
        let vat_amount = 0;
        if (vat_type === 'VAT_INCLUDED') {
            net_amount = Math.round((amount * 100 / 107) * 100) / 100;
            vat_amount = Math.round((amount - net_amount) * 100) / 100;
        } else if (vat_type === 'VAT_EXCLUDED') {
            vat_amount = Math.round((amount * 0.07) * 100) / 100;
            net_amount = amount; // net stays same, total becomes amount + vat
        }

        // Upload to Google Drive if base64 proof image is provided
        let proof_image_url = '';
        if (proof_image_base64) {
            try {
                const matches = proof_image_base64.match(/^data:([A-Za-z-+\/]+);base64,([\s\S]+)$/);
                let buffer, mimeType;
                if (matches && matches.length === 3) {
                    mimeType = matches[1];
                    buffer = Buffer.from(matches[2], 'base64');
                } else {
                    mimeType = 'image/jpeg';
                    buffer = Buffer.from(proof_image_base64, 'base64');
                }
                const fileName = `PV_PROOF_${voucher_no}_${Date.now()}.jpg`;
                const folderName = 'หลักฐานใบสำคัญจ่าย';
                proof_image_url = await uploadBufferToDriveInFolder(buffer, mimeType, fileName, folderName);
            } catch (err) {
                console.error('Error uploading proof image to Drive:', err);
            }
        }

        const voucher = await DisbursementVoucher.create({
            voucher_no,
            payment_date: payment_date || today,
            branch_id: branch_id || req.user.branch_id,
            debit_account_id,
            credit_account_id,
            amount,
            vat_type: vat_type || 'NO_VAT',
            net_amount,
            vat_amount,
            payee_name: payee_name || '',
            remark: remark || '',
            proof_image_url: proof_image_url || '',
            created_by: req.user.employee_id
        });

        // Also record in CashMovement for backward compatibility with existing P&L
        // นับ transaction_id ตรงนี้ (ใกล้ create ที่สุด) ไม่ใช่ตอนต้น request เพราะระหว่างนั้นมี
        // การอัปโหลดรูปหลักฐานขึ้น Google Drive ซึ่งอาจใช้เวลาหลายวินาที นับไว้ก่อนหน้านั้นเสี่ยงชนกับ
        // ธุรกรรมอื่นที่สร้าง TXN เลขเดียวกันในช่วงเวลานั้นพอดี (transaction_id เป็น unique index)
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const cmCount = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
        const cmTxnId = `TXN-${localYearMonthDay(today)}-${String(cmCount + 1).padStart(4, '0')}`;

        // Cash actually leaving the till is net_amount + vat_amount (the voucher's
        // total_amount), not the raw `amount` field — for VAT_EXCLUDED vouchers,
        // `amount` only covers the net portion and understates cash out by the VAT.
        const totalCashOut = voucherTotalAmount({ net_amount, vat_amount });

        await CashMovement.create({
            transaction_id: cmTxnId,
            type: 'รายจ่าย',
            category: 'อื่นๆ',
            amount: totalCashOut,
            reference_id: voucher._id,
            recorded_by: req.user.employee_id
        });

        await logActivity(req, 'CREATE', 'DISBURSEMENT', `สร้างใบสำคัญจ่าย ${voucher_no} จำนวน ${amount} บาท ผู้รับ: ${payee_name}`, voucher._id, voucher_no);

        const populated = await DisbursementVoucher.findById(voucher._id)
            .populate('debit_account_id')
            .populate('credit_account_id')
            .populate('branch_id')
            .populate('created_by', 'name');

        const voucherObj = populated.toObject();
        voucherObj.total_amount = voucherTotalAmount(voucherObj);

        res.json({ success: true, voucher: voucherObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/acct/disbursements/:id
router.get('/disbursements/:id', async (req, res) => {
    try {
        const voucher = await DisbursementVoucher.findById(req.params.id)
            .populate('debit_account_id')
            .populate('credit_account_id')
            .populate('branch_id')
            .populate('created_by', 'name')
            .lean();
        if (!voucher) return res.status(404).json({ success: false, message: 'ไม่พบใบสำคัญจ่าย' });

        const voucherObj = voucher;
        voucherObj.total_amount = voucherTotalAmount(voucherObj);

        res.json({ success: true, voucher: voucherObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// รายได้และรายจ่ายอื่นๆ (OtherEntry)
// ============================================

// GET /api/acct/other-entries?kind=income|expense&startDate&endDate
router.get('/other-entries', async (req, res) => {
    try {
        const filter = {};
        if (['income', 'expense'].includes(req.query.kind)) filter.kind = req.query.kind;
        if (req.query.startDate || req.query.endDate) {
            filter.entry_date = {};
            if (req.query.startDate) filter.entry_date.$gte = new Date(req.query.startDate + 'T00:00:00');
            if (req.query.endDate) filter.entry_date.$lte = new Date(req.query.endDate + 'T23:59:59');
        }
        const entries = await OtherEntry.find(filter)
            .populate('category_id', 'category_name')
            .populate('group_id', 'group_code group_name')
            .populate('account_id', 'account_code account_name')
            .populate('created_by', 'name')
            .sort({ entry_date: -1, createdAt: -1 })
            .lean();
        res.json({ success: true, entries });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/other-entries
router.post('/other-entries', async (req, res) => {
    try {
        const { kind, entry_date, category_id, group_id, account_id } = req.body;
        const source = String(req.body.source || '').trim();
        const remark = String(req.body.remark || '').trim();
        const amount = Number(req.body.amount);
        if (!['income', 'expense'].includes(kind)) return res.status(400).json({ success: false, message: 'ประเภทรายการไม่ถูกต้อง' });
        if (!source || !category_id || !group_id || !account_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: 'จำนวนเงินต้องมากกว่า 0' });
        if (source.length > MAX_NAME_LEN || remark.length > 500) return res.status(400).json({ success: false, message: 'ข้อความยาวเกินกำหนด' });

        const [category, group, account] = await Promise.all([
            AccountCategory.findById(category_id).lean(),
            AccountGroup.findById(group_id).lean(),
            AccountChart.findById(account_id).lean()
        ]);
        if (!category || !group || !account) return res.status(400).json({ success: false, message: 'ไม่พบหมวด กลุ่มบัญชี หรือรหัสบัญชีที่เลือก' });
        if (String(account.category_id) !== String(category._id)) {
            return res.status(400).json({ success: false, message: 'รหัสบัญชีที่เลือกไม่อยู่ในหมวดนี้' });
        }
        if (String(group.category_id) !== String(category._id)) {
            return res.status(400).json({ success: false, message: 'กลุ่มบัญชีที่เลือกไม่อยู่ในหมวดนี้' });
        }
        if (String(account.group_id || '') !== String(group._id)) {
            return res.status(400).json({ success: false, message: 'รหัสบัญชีที่เลือกไม่อยู่ในกลุ่มบัญชีนี้' });
        }
        if (group.is_active === false) return res.status(400).json({ success: false, message: 'กลุ่มบัญชีที่เลือกถูกปิดการใช้งานแล้ว' });
        if (account.is_active === false) return res.status(400).json({ success: false, message: 'บัญชีที่เลือกถูกปิดการใช้งานแล้ว' });

        const entry = await OtherEntry.create({
            kind, source, amount, remark,
            entry_date: entry_date ? new Date(entry_date + 'T12:00:00') : new Date(),
            category_id: category._id, group_id: group._id, account_id: account._id,
            branch_id: req.user.branch_id || undefined,
            created_by: req.user.employee_id
        });
        const label = kind === 'income' ? 'รายได้' : 'รายจ่าย';
        await logActivity(req, 'CREATE', 'ACCOUNTING', `บันทึก${label}อื่นๆ ${source} ${amount.toLocaleString('th-TH')} บาท (${account.account_code} ${account.account_name})`, entry._id, account.account_code);
        res.json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/acct/other-entries/:id
router.delete('/other-entries/:id', async (req, res) => {
    try {
        const entry = await OtherEntry.findByIdAndDelete(req.params.id);
        if (!entry) return res.status(404).json({ success: false, message: 'ไม่พบรายการนี้' });
        await logActivity(req, 'DELETE', 'ACCOUNTING', `ลบ${entry.kind === 'income' ? 'รายได้' : 'รายจ่าย'}อื่นๆ ${entry.source} ${entry.amount.toLocaleString('th-TH')} บาท`, entry._id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 4. ENHANCED P&L REPORT
// ============================================

// GET /api/acct/pnl-report
// คิดจากผังบัญชีโดยตรง: หมวดรายได้ = รายได้, หมวดค่าใช้จ่าย = ค่าใช้จ่าย; ยอดของบัญชี = ผลรวมใบสำคัญจ่ายที่ลงเดบิตบัญชีนั้น
// รายงานเรียงตามกลุ่ม (รหัสกลุ่ม) แล้วตามรหัสบัญชี — ไม่มีการตั้งค่า "รายการงบ" แยกอีกแล้ว
router.get('/pnl-report', async (req, res) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate + 'T00:00:00') : new Date(new Date().setDate(new Date().getDate() - 30));
        const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : new Date();

        const [categories, groups, accounts, vouchers, transactions] = await Promise.all([
            AccountCategory.find().lean(),
            AccountGroup.find().sort({ group_code: 1 }).lean(),
            AccountChart.find().sort({ account_code: 1 }).lean(),
            DisbursementVoucher.find({ payment_date: { $gte: startDate, $lte: endDate } }, 'debit_account_id amount').lean(),
            Transaction.find({
                created_at: { $gte: startDate, $lte: endDate },
                status: { $ne: 'ยกเลิกแล้ว' }
            }).lean()
        ]);

        const voucherByAccount = {};
        vouchers.forEach(v => {
            const accId = v.debit_account_id && v.debit_account_id.toString();
            if (accId) voucherByAccount[accId] = (voucherByAccount[accId] || 0) + (v.amount || 0);
        });

        const sectionOfCat = {};
        categories.forEach(c => {
            if (c.category_name === 'รายได้') sectionOfCat[String(c._id)] = 'revenue';
            else if (c.category_name === 'ค่าใช้จ่าย') sectionOfCat[String(c._id)] = 'expense';
        });

        const reportLines = [];
        let totalRevenue = 0;
        let totalExpense = 0;
        let order = 0;
        const salesRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);

        for (const section of ['revenue', 'expense']) {
            for (const group of groups) {
                if (sectionOfCat[String(group.category_id)] !== section) continue;
                const accs = accounts.filter(a => String(a.group_id) === String(group._id));
                const lines = accs
                    .map(a => ({ acc: a, amount: voucherByAccount[String(a._id)] || 0 }))
                    .filter(x => x.amount !== 0);
                const groupTotal = lines.reduce((n, x) => n + x.amount, 0);
                if (!lines.length) continue;
                reportLines.push({
                    sort_order: ++order, display_name: group.group_name, section, amount: groupTotal,
                    is_bold: true, is_total_line: false, group_code: group.group_code
                });
                lines.forEach(x => reportLines.push({
                    sort_order: ++order, display_name: x.acc.account_name, section, amount: x.amount,
                    is_bold: false, is_total_line: false, group_code: group.group_code, account_code: x.acc.account_code
                }));
                if (section === 'revenue') totalRevenue += groupTotal; else totalExpense += groupTotal;
            }
            // บัญชีของหมวดนี้ที่ยังไม่มีกลุ่ม — ยอดต้องไม่หาย จึงรวมไว้ในกลุ่มสมมติ
            const loose = accounts
                .filter(a => !a.group_id && sectionOfCat[String(a.category_id)] === section)
                .map(a => ({ acc: a, amount: voucherByAccount[String(a._id)] || 0 }))
                .filter(x => x.amount !== 0);
            if (loose.length) {
                const looseTotal = loose.reduce((n, x) => n + x.amount, 0);
                reportLines.push({ sort_order: ++order, display_name: 'ยังไม่จัดกลุ่ม', section, amount: looseTotal, is_bold: true, is_total_line: false, group_code: '' });
                loose.forEach(x => reportLines.push({ sort_order: ++order, display_name: x.acc.account_name, section, amount: x.amount, is_bold: false, is_total_line: false, group_code: '', account_code: x.acc.account_code }));
                if (section === 'revenue') totalRevenue += looseTotal; else totalExpense += looseTotal;
            }
        }

        const salesVat = Math.round((salesRevenue * 7 / 107) * 100) / 100;
        const netProfit = totalRevenue + salesRevenue - totalExpense;

        res.json({
            success: true,
            period: { startDate, endDate },
            reportLines,
            summary: {
                salesRevenue,
                totalRevenue: totalRevenue + salesRevenue,
                totalExpense,
                salesVat,
                netProfit
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
