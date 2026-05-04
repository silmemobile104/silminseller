// สคริปต์สร้างพนักงาน Admin คนแรก (ใช้ครั้งเดียว)
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Employee } = require('./models');

const MONGODB_URI = process.env.MONGO_URI;

async function seedAdmin() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('เชื่อมต่อ MongoDB สำเร็จ');

        // ตรวจสอบว่ามี admin อยู่แล้วหรือไม่
        const existing = await Employee.findOne({ emp_id: 'admin' });
        if (existing) {
            // อัพเดตรหัสผ่านเป็น bcrypt hash
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('1234', salt);
            existing.password = hashedPassword;
            existing.role = 'แอดมิน';
            await existing.save();
            console.log('อัพเดตรหัสผ่าน Admin เป็น bcrypt hash สำเร็จ');
        } else {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('1234', salt);

            const admin = new Employee({
                name: 'ผู้ดูแลระบบ',
                emp_id: 'admin',
                password: hashedPassword,
                role: 'แอดมิน'
            });

            await admin.save();
            console.log('สร้าง Admin ใหม่สำเร็จ');
        }

        console.log('--- ข้อมูลเข้าสู่ระบบ ---');
        console.log('Username: admin');
        console.log('Password: 1234');
        console.log('--------------------------');

    } catch (error) {
        console.error('เกิดข้อผิดพลาด:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

seedAdmin();
