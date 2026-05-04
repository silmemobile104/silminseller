require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// Middleware
// ==========================================
app.use(cors());
app.use(express.json()); // Allows parsing of JSON request bodies

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
    .then(() => console.log('เชื่อมต่อฐานข้อมูล MongoDB Atlas สำเร็จ'))
    .catch((err) => {
        console.error('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล:', err);
        process.exit(1);
    });

// ==========================================
// API Routes
// ==========================================
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ==========================================
// Frontend Routes
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/script.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'script.js'));
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์ Backend ทำงานอยู่ที่พอร์ต ${PORT}`);
});
