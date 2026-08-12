const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
    AccountCategory, AccountGroup, AccountChart, PnLConfig, DisbursementVoucher,
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
            user_name: emp ? emp.name : 'ไม่ทราบ'
        });
    } catch (e) { console.error('Log error:', e.message); }
}

// ============================================
// 1. CHART OF ACCOUNTS APIs
// ============================================

// GET /api/acct/chart-of-accounts - Fetch all nested COA
router.get('/chart-of-accounts', async (req, res) => {
    try {
        const [categories, groups, accounts] = await Promise.all([
            AccountCategory.find().sort({ category_code: 1 }),
            AccountGroup.find().populate('category_id').sort({ group_code: 1 }),
            AccountChart.find().populate('category_id').populate('group_id').sort({ account_code: 1 })
        ]);
        res.json({ success: true, categories, groups, accounts });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/chart-of-accounts - Add or Edit an account
router.post('/chart-of-accounts', async (req, res) => {
    try {
        const { _id, account_code, account_name, category_id, group_id, level } = req.body;
        if (!account_code || !account_name || !category_id || !group_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        let account;
        if (_id) {
            account = await AccountChart.findById(_id);
            if (!account) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
            if (account.is_system && account.account_code !== account_code) {
                return res.status(400).json({ success: false, message: 'ไม่สามารถเปลี่ยนรหัสบัญชีระบบได้' });
            }
            account.account_code = account_code;
            account.account_name = account_name;
            account.category_id = category_id;
            account.group_id = group_id;
            account.level = level || 3;
            await account.save();
            await logActivity(req, 'UPDATE', 'COA', `แก้ไขผังบัญชี ${account_code} ${account_name}`, account._id);
        } else {
            const exists = await AccountChart.findOne({ account_code });
            if (exists) return res.status(400).json({ success: false, message: 'รหัสบัญชีนี้มีอยู่แล้ว' });
            account = await AccountChart.create({ account_code, account_name, category_id, group_id, level: level || 3 });
            await logActivity(req, 'CREATE', 'COA', `เพิ่มผังบัญชี ${account_code} ${account_name}`, account._id);
        }
        res.json({ success: true, account });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/acct/chart-of-accounts/:id
router.delete('/chart-of-accounts/:id', async (req, res) => {
    try {
        const account = await AccountChart.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
        if (account.is_system) return res.status(400).json({ success: false, message: 'ไม่สามารถลบบัญชีระบบได้' });
        await AccountChart.findByIdAndDelete(req.params.id);
        await logActivity(req, 'DELETE', 'COA', `ลบผังบัญชี ${account.account_code} ${account.account_name}`, account._id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/account-groups - Add group
router.post('/account-groups', async (req, res) => {
    try {
        const { group_code, group_name, category_id } = req.body;
        if (!group_code || !group_name || !category_id) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        }
        const exists = await AccountGroup.findOne({ group_code });
        if (exists) return res.status(400).json({ success: false, message: 'รหัสกลุ่มนี้มีอยู่แล้ว' });
        const group = await AccountGroup.create({ group_code, group_name, category_id });
        res.json({ success: true, group });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 2. P&L CONFIG APIs
// ============================================

// GET /api/acct/pnl-config
router.get('/pnl-config', async (req, res) => {
    try {
        const configs = await PnLConfig.find()
            .populate('category_id')
            .populate('group_id')
            .populate('account_ids')
            .sort({ sort_order: 1 });
        res.json({ success: true, configs });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/acct/pnl-config - Save/Update P&L lines
router.post('/pnl-config', async (req, res) => {
    try {
        const { lines } = req.body;
        if (!Array.isArray(lines)) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' });
        // Clear old and re-insert
        await PnLConfig.deleteMany({});
        const docs = lines.map((line, idx) => {
            let sec = (line.section || '').toLowerCase();
            if (sec === 'cogs' || sec === 'tax' || sec === 'other_expense') sec = 'expense';
            if (sec === 'other_income') sec = 'revenue';
            if (sec !== 'revenue' && sec !== 'expense') sec = 'expense'; // fallback to expense

            let accs = [];
            if (line.account_id) {
                accs.push(line.account_id);
            } else if (line.account_ids && Array.isArray(line.account_ids)) {
                accs = line.account_ids;
            }

            return {
                sort_order: line.sort_order || (idx + 1) * 10,
                display_name: line.display_name,
                section: sec,
                category_id: line.category_id || null,
                group_id: line.group_id || null,
                account_ids: accs,
                is_bold: line.is_bold || false,
                is_total_line: line.is_total_line || false
            };
        });
        await PnLConfig.insertMany(docs);
        await logActivity(req, 'UPDATE', 'PNL_CONFIG', 'อัปเดตการตั้งค่างบกำไรขาดทุน');
        res.json({ success: true });
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
        if (req.query.startDate && req.query.endDate) {
            filter.payment_date = {
                $gte: new Date(req.query.startDate + 'T00:00:00'),
                $lte: new Date(req.query.endDate + 'T23:59:59')
            };
        }
        if (req.query.branch_id) filter.branch_id = req.query.branch_id;
        const vouchers = await DisbursementVoucher.find(filter)
            .populate('debit_account_id')
            .populate('credit_account_id')
            .populate('branch_id')
            .populate('created_by', 'name')
            .sort({ created_at: -1 });

        const voucherObjs = vouchers.map(v => {
            const obj = v.toObject();
            obj.total_amount = obj.net_amount + obj.vat_amount;
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

        // Auto-generate voucher number: PV-YYYYMM-XXXX (Running count reset monthly)
        const today = new Date();
        const yearMonth = today.toISOString().slice(0, 7).replace('-', '');
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        const countMonth = await DisbursementVoucher.countDocuments({
            payment_date: { $gte: startOfMonth, $lte: endOfMonth }
        });
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
        const todayStart = new Date(today.toISOString().slice(0, 10) + 'T00:00:00');
        const todayEnd = new Date(today.toISOString().slice(0, 10) + 'T23:59:59');
        const cmDateStr2 = today.toISOString().slice(0, 10).replace(/-/g, '');
        const cmCount = await CashMovement.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } });
        const cmTxnId = `TXN-${cmDateStr2}-${String(cmCount + 1).padStart(4, '0')}`;

        await CashMovement.create({
            transaction_id: cmTxnId,
            type: 'รายจ่าย',
            category: 'อื่นๆ',
            amount: amount,
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
        voucherObj.total_amount = voucherObj.net_amount + voucherObj.vat_amount;

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
            .populate('created_by', 'name');
        if (!voucher) return res.status(404).json({ success: false, message: 'ไม่พบใบสำคัญจ่าย' });
        
        const voucherObj = voucher.toObject();
        voucherObj.total_amount = voucherObj.net_amount + voucherObj.satang_amount || voucherObj.net_amount + voucherObj.vat_amount;
        voucherObj.total_amount = voucherObj.net_amount + voucherObj.vat_amount;

        res.json({ success: true, voucher: voucherObj });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================
// 4. ENHANCED P&L REPORT
// ============================================

// GET /api/acct/pnl-report
router.get('/pnl-report', async (req, res) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate + 'T00:00:00') : new Date(new Date().setDate(new Date().getDate() - 30));
        const endDate = req.query.endDate ? new Date(req.query.endDate + 'T23:59:59') : new Date();

        // Get P&L config lines
        const pnlConfigs = await PnLConfig.find().populate('account_ids').sort({ sort_order: 1 });

        // Get all disbursement vouchers in period
        const vouchers = await DisbursementVoucher.find({
            payment_date: { $gte: startDate, $lte: endDate }
        }).populate('debit_account_id');

        // Get transactions in period (sales)
        const transactions = await Transaction.find({
            created_at: { $gte: startDate, $lte: endDate },
            status: { $ne: 'ยกเลิกแล้ว' }
        });

        // Aggregate by account_id from vouchers
        const voucherByAccount = {};
        vouchers.forEach(v => {
            const accId = v.debit_account_id?._id?.toString();
            if (accId) {
                voucherByAccount[accId] = (voucherByAccount[accId] || 0) + v.amount;
            }
        });

        // Build report lines
        const reportLines = [];
        let totalRevenue = 0;
        let totalExpense = 0;

        // Calculate sales revenue from transactions
        const salesRevenue = transactions.reduce((sum, t) => sum + (t.total_amount || 0), 0);

        for (const config of pnlConfigs) {
            let lineAmount = 0;
            if (config.account_ids && config.account_ids.length > 0) {
                config.account_ids.forEach(acc => {
                    const accId = acc._id.toString();
                    lineAmount += voucherByAccount[accId] || 0;
                });
            }

            reportLines.push({
                sort_order: config.sort_order,
                display_name: config.display_name,
                section: config.section,
                amount: lineAmount,
                is_bold: config.is_bold,
                is_total_line: config.is_total_line
            });

            if (config.section === 'revenue') totalRevenue += lineAmount;
            if (config.section === 'expense') totalExpense += lineAmount;
        }

        // If no P&L config yet, fallback to basic summary
        if (pnlConfigs.length === 0) {
            totalRevenue = salesRevenue;

            // Get expenses from CashMovement
            const expenses = await CashMovement.find({
                type: 'รายจ่าย',
                created_at: { $gte: startDate, $lte: endDate }
            });
            totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

            reportLines.push(
                { sort_order: 1, display_name: 'รายได้จากการขายสินค้า', section: 'revenue', amount: salesRevenue, is_bold: true },
                { sort_order: 2, display_name: 'ค่าใช้จ่ายรวม', section: 'expense', amount: totalExpense, is_bold: true }
            );
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
