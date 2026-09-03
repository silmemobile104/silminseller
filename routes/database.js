const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const models = require('../models');
const { catalogue, GROUPS, IMPORTANCE } = require('../utils/dbCatalogue');

// ============================================
// Middleware: ตรวจ token (แพตเทิร์นเดียวกับ routes/accounting.js)
// ============================================
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
}
router.use(verifyToken);

// ============================================
// Middleware: ต้องมีสิทธิ์ manage_database
// บังคับฝั่งเซิร์ฟเวอร์ ไม่ใช่แค่ซ่อนเมนูฝั่งหน้าจอ
// ============================================
function requireDatabasePermission(req, res, next) {
    if (!req.user || !req.user.permissions || !req.user.permissions.manage_database) {
        return res.status(403).json({
            success: false,
            message: 'ไม่มีสิทธิ์เข้าถึงเมนูจัดการฐานข้อมูล'
        });
    }
    next();
}
router.use(requireDatabasePermission);

// แคชผลนับของหน้าภาพรวม — เข้าหน้านี้ทีนึงคือ 29 รอบไป Atlas พร้อมกัน
// วัดได้ ~1,385ms ตอนคอนเนกชันเย็น และ ~202ms ตอนอุ่น ทั้งที่ตัวเลขแทบไม่ขยับระหว่างนั้น
// อายุ 30 วิ แนวเดียวกับ utils/masterDataCache.js (ที่นั่น 60 วิ) ข้ามแคชด้วย ?fresh=1
const OVERVIEW_TTL_MS = 30 * 1000;
let overviewCache = null;    // { at, payload }
let overviewInflight = null; // กันหลาย request ยิงนับพร้อมกันตอนแคชหมดอายุ

const buildOverview = async () => {
    // นับแบบขนาน ไม่วนลูป await — 29 collection ทีละอันคือ ~29 รอบไป Atlas (~2.3 วิ)
    // estimatedDocumentCount อ่านจาก metadata ของ collection ไม่ได้ scan เอกสาร
    const counts = await Promise.all(catalogue.map(async (c) => {
        const model = models[c.model];
        if (!model) return { key: c.key, count: null, error: 'ไม่พบโมเดล' };
        try {
            return { key: c.key, count: await model.estimatedDocumentCount() };
        } catch (err) {
            // collection เดียวพังไม่ควรทำให้ทั้งหน้าใช้ไม่ได้
            console.error(`[DB-OVERVIEW] นับ ${c.key} ไม่สำเร็จ:`, err.message);
            return { key: c.key, count: null, error: 'นับไม่สำเร็จ' };
        }
    }));
    const countByKey = new Map(counts.map(c => [c.key, c]));

    const collections = catalogue.map(c => {
        const n = countByKey.get(c.key) || {};
        return {
            key: c.key,
            model: c.model,
            title: c.title,
            group: c.group,
            importance: c.importance,
            purpose: c.purpose,
            pages: c.pages,
            keyFields: c.keyFields,
            relations: c.relations,
            notes: c.notes || '',
            count: n.count,
            countError: n.error || null
        };
    });

    const counted = collections.filter(c => typeof c.count === 'number');
    return {
        collections,
        groups: GROUPS,
        importanceLegend: IMPORTANCE,
        summary: {
            collectionCount: collections.length,
            documentTotal: counted.reduce((s, c) => s + c.count, 0),
            countFailed: collections.length - counted.length,
            dbName: mongoose.connection && mongoose.connection.name ? mongoose.connection.name : null
        }
    };
};

// GET /api/database/overview - แคตตาล็อกฐานข้อมูล + จำนวนเอกสารจริง
router.get('/overview', async (req, res) => {
    try {
        const fresh = req.query.fresh === '1';

        if (!fresh) {
            if (overviewCache && (Date.now() - overviewCache.at) < OVERVIEW_TTL_MS) {
                return res.status(200).json({ success: true, data: overviewCache.payload, cached: true });
            }
            if (overviewInflight) {
                return res.status(200).json({ success: true, data: await overviewInflight, cached: true });
            }
        }

        const work = buildOverview().then((payload) => {
            overviewCache = { at: Date.now(), payload };
            return payload;
        });
        if (!fresh) overviewInflight = work.finally(() => { overviewInflight = null; });

        res.status(200).json({ success: true, data: await work, cached: false });
    } catch (error) {
        console.error('API Error GET /api/database/overview:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านข้อมูลฐานข้อมูล' });
    }
});

// ============================================
// GET /api/database/:key/documents - เปิดดูเอกสารจริงใน collection
//
// :key ต้องอยู่ในแคตตาล็อกเท่านั้น (whitelist) — ไม่รับชื่อโมเดลจาก client ตรง ๆ
// เพราะจะกลายเป็นช่องอ่านทุก collection ที่ mongoose รู้จัก
// อ่านอย่างเดียว ไม่มี endpoint แก้/ลบเอกสารจากหน้านี้
// ============================================

// ฟิลด์ที่ห้ามส่งออกไม่ว่ากรณีใด (employee.password เป็น bcrypt hash)
const REDACTED_FIELDS = new Set(['password']);
const REDACTED_TEXT = '[ซ่อนไว้]';

// สตริงยาว ๆ ในฐานข้อมูลมีจริง เช่น member.photo ของสมาชิกเก่าที่ยังเป็น base64 ดิบ
// ปล่อยไปทั้งก้อนจะได้ payload หลาย MB ต่อหน้า จึงตัดสั้นตั้งแต่ฝั่งเซิร์ฟเวอร์
const MAX_STRING_LEN = 300;
const MAX_ARRAY_ITEMS = 50;
const MAX_DEPTH = 4;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_SEARCH_FIELDS = 12;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (m) => '\\' + m);

// แปลงค่าให้ปลอดภัยและเบาพอจะส่งขึ้นหน้าเว็บ
const sanitizeValue = (value, key, depth = 0) => {
    if (REDACTED_FIELDS.has(key)) return REDACTED_TEXT;
    if (value === null || value === undefined) return null;

    if (value instanceof Date) return value.toISOString();
    if (value instanceof mongoose.Types.ObjectId) return value.toString();
    if (Buffer.isBuffer(value)) return `[binary ${value.length} bytes]`;

    if (typeof value === 'string') {
        return value.length > MAX_STRING_LEN
            ? `${value.slice(0, MAX_STRING_LEN)}… (ตัดสั้นจาก ${value.length} ตัวอักษร)`
            : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (depth >= MAX_DEPTH) return '[ซ้อนลึกเกินไป]';

    if (Array.isArray(value)) {
        const shown = value.slice(0, MAX_ARRAY_ITEMS).map(v => sanitizeValue(v, null, depth + 1));
        if (value.length > MAX_ARRAY_ITEMS) shown.push(`… อีก ${value.length - MAX_ARRAY_ITEMS} รายการ`);
        return shown;
    }
    if (typeof value === 'object') {
        const out = {};
        Object.keys(value).forEach(k => { out[k] = sanitizeValue(value[k], k, depth + 1); });
        return out;
    }
    return String(value);
};

// คอลัมน์เอาจากสคีมาจริง ไม่ได้เดาจากเอกสารใบแรก (เอกสารเก่าอาจไม่มีฟิลด์ที่เพิ่งเพิ่ม)
const buildColumns = (schema) => {
    const cols = [{ name: '_id', type: 'ObjectId' }];
    Object.keys(schema.obj).forEach(name => {
        if (name === '_id' || name === '__v') return;
        const path = schema.path(name);
        cols.push({
            name,
            type: path ? path.instance || 'Mixed' : 'Mixed',
            redacted: REDACTED_FIELDS.has(name)
        });
    });
    if (schema.options && schema.options.timestamps) {
        cols.push({ name: 'createdAt', type: 'Date' }, { name: 'updatedAt', type: 'Date' });
    }
    return cols;
};

router.get('/:key/documents', async (req, res) => {
    try {
        const entry = catalogue.find(c => c.key === req.params.key);
        if (!entry) {
            return res.status(404).json({ success: false, message: 'ไม่พบ collection ที่ระบุในแคตตาล็อก' });
        }
        const model = models[entry.model];
        if (!model) {
            return res.status(404).json({ success: false, message: `ไม่พบโมเดล ${entry.model}` });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));
        const q = (req.query.q || '').toString().trim();

        // ค้นหา: ObjectId เป๊ะ ๆ ก่อน ไม่งั้น regex บนฟิลด์ String (+ ตรงตัวบนฟิลด์ Number ถ้าพิมพ์ตัวเลข)
        let filter = {};
        if (q) {
            if (mongoose.Types.ObjectId.isValid(q) && String(new mongoose.Types.ObjectId(q)) === q) {
                filter = { _id: q };
            } else {
                const rx = new RegExp(escapeRegex(q), 'i');
                const or = [];
                Object.keys(model.schema.paths).forEach(p => {
                    if (or.length >= MAX_SEARCH_FIELDS) return;
                    if (REDACTED_FIELDS.has(p.split('.').pop())) return;
                    const inst = model.schema.paths[p].instance;
                    if (inst === 'String') or.push({ [p]: rx });
                });
                if (Number.isFinite(Number(q))) {
                    Object.keys(model.schema.paths).forEach(p => {
                        if (or.length >= MAX_SEARCH_FIELDS + 4) return;
                        if (model.schema.paths[p].instance === 'Number') or.push({ [p]: Number(q) });
                    });
                }
                filter = or.length ? { $or: or } : { _id: null }; // ไม่มีฟิลด์ให้ค้น = ไม่ควรคืนทั้ง collection
            }
        }

        // ใหม่สุดขึ้นก่อน — ใช้ createdAt ถ้ามี ไม่งั้น _id (ObjectId เรียงตามเวลาสร้างอยู่แล้ว)
        const sortKey = model.schema.path('createdAt') ? 'createdAt' : '_id';

        // นับกับดึงยิงพร้อมกัน ไม่ต่อคิว — ประหยัดไป 1 รอบ Atlas (~79ms)
        // ไม่มีตัวกรอง = ใช้ estimatedDocumentCount ที่อ่านจาก metadata ไม่ scan เอกสาร
        const [docs, total] = await Promise.all([
            model.find(filter).sort({ [sortKey]: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            q ? model.countDocuments(filter) : model.estimatedDocumentCount()
        ]);

        res.status(200).json({
            success: true,
            data: {
                key: entry.key,
                model: entry.model,
                title: entry.title,
                columns: buildColumns(model.schema),
                docs: docs.map(d => sanitizeValue(d, null, 0)),
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
                sortedBy: sortKey
            }
        });
    } catch (error) {
        console.error(`API Error GET /api/database/${req.params.key}/documents:`, error);
        res.status(500).json({ success: false, message: error.message || 'เกิดข้อผิดพลาดในการอ่านเอกสาร' });
    }
});

module.exports = router;
