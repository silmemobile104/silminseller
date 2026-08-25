const mongoose = require('mongoose');

// Member (สมาชิก)
const memberSchema = new mongoose.Schema({
    member_number: { type: String, unique: true }, // เลขสมาชิก (SMXXXXX)
    // ข้อมูลจากบัตรประชาชน (Smart Card)
    citizen_id: { type: String, unique: true, sparse: true }, // เลขบัตรประชาชน
    prefix: { type: String, default: '' }, // คำนำหน้า
    first_name: { type: String, default: '' }, // ชื่อ (ไทย)
    last_name: { type: String, default: '' }, // นามสกุล (ไทย)
    first_name_en: { type: String, default: '' }, // ชื่อ (อังกฤษ)
    last_name_en: { type: String, default: '' }, // นามสกุล (อังกฤษ)
    birthdate: { type: String, default: '' }, // วันเกิด
    card_expiry: { type: String, default: '' }, // วันหมดอายุบัตร
    gender: { type: String, default: '' }, // เพศ
    address: { type: String, default: '' }, // ที่อยู่
    photo: { type: String, default: '' }, // รูปถ่ายจากบัตร (base64)
    card_front_photo: { type: String, default: '' }, // รูปหน้าบัตร (Google Drive URL)

    // ข้อมูลที่กรอกเพิ่มเติม
    zipcode: { type: String, default: '' }, // รหัสไปรษณีย์
    phone: { type: String, default: '' }, // เบอร์โทรศัพท์
    facebook_name: { type: String, default: '' }, // ชื่อ Facebook
    facebook_link: { type: String, default: '' }, // ลิงก์ Facebook
    line_id: { type: String, default: '' }, // LINE ID

    // แหล่งที่มาของสมาชิก
    referral_source: {
        type: String,
        enum: ['', 'TikTok', 'FaceBook', 'Intragram', 'คนรู้จักแนะนำ', 'เคยมาซื้อแล้ว', 'พนักงานซิลมีนแนะนำ'],
        default: ''
    }
}, { timestamps: true });

const Member = mongoose.model('Member', memberSchema, 'member');

module.exports = Member;
