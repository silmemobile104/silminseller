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

// GET /api/database/overview - แคตตาล็อกฐานข้อมูล + จำนวนเอกสารจริง
router.get('/overview', async (req, res) => {
    try {
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
        res.status(200).json({
            success: true,
            data: {
                collections,
                groups: GROUPS,
                importanceLegend: IMPORTANCE,
                summary: {
                    collectionCount: collections.length,
                    documentTotal: counted.reduce((s, c) => s + c.count, 0),
                    countFailed: collections.length - counted.length,
                    dbName: mongoose.connection && mongoose.connection.name ? mongoose.connection.name : null
                }
            }
        });
    } catch (error) {
        console.error('API Error GET /api/database/overview:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอ่านข้อมูลฐานข้อมูล' });
    }
});

module.exports = router;
