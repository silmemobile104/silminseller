require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware
// ==========================================
app.use(compression()); // บีบอัด response ด้วย gzip/brotli ก่อนส่งออก ลดขนาด HTML/JS/CSS ที่โอนจริง
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allows parsing of JSON request bodies (up to 10MB for photos)
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ถ้ามีไฟล์ที่ minify แล้วใน dist/ ให้เสิร์ฟตัวนั้นแทนซอร์สเดิม (URL ที่ client ขอไม่เปลี่ยน)
// ออกแบบให้ "ตกกลับ" ไปใช้ซอร์สเดิมอัตโนมัติถ้ายังไม่ได้รัน `npm run build:js`
// จึงไม่มีทางที่ระบบจะพังเพราะลืม build — แค่ได้ไฟล์ที่ใหญ่กว่าเดิมเท่านั้น
app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    const isBuildable = p === '/script.js' || p === '/script.js.map' || p.startsWith('/js/');
    if (isBuildable && fs.existsSync(path.join(__dirname, 'dist', p))) {
        req.url = '/dist' + req.url; // คง query string (?v=...) ไว้ตามเดิม
    }
    next();
});

// Serve static files (images, etc.)
// maxAge: 1y ปลอดภัยเพราะไฟล์ที่แก้บ่อย (js/page-*.js, views/*.html, style.css) ใช้ query string
// version-busting อยู่แล้ว (PAGE_SCRIPT_VERSION / VIEW_FRAGMENT_VERSION ใน script.js, ?v= ของ style.css)
app.use(express.static(__dirname, { maxAge: '1y' }));

// ==========================================
// Database Connection (MongoDB Atlas)
// ==========================================
// Use MONGO_URI to match .env file exactly
const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
    console.error('กรุณากำหนดค่า MONGO_URI ในไฟล์ .env');
    process.exit(1);
}

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log('เชื่อมต่อฐานข้อมูล MongoDB Atlas สำเร็จ');
        // Seed default roles ถ้ายังไม่มีข้อมูล
        const { seedDefaultRoles, migrateProductsToERP, seedDefaultCOA } = require('./models');
        await seedDefaultRoles();
        await migrateProductsToERP();
        await seedDefaultCOA();

        // Start Daily Stock Audit scheduler
        const { initDailyStockAuditScheduler } = require('./utils/cronTasks');
        initDailyStockAuditScheduler();
    })
    .catch((err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล:', err);
        process.exit(1);
    });

// ==========================================
// API Routes
// ==========================================
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

const acctRoutes = require('./routes/accounting');
app.use('/api/acct', acctRoutes);

// ==========================================
// Frontend Routes
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'script.js'));
});

app.get('/receipt-template.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'receipt-template.html'));
});

app.get('/transfer-document.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'transfer-document.html'));
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์ Backend ทำงานอยู่ที่พอร์ต ${PORT}`);
});
