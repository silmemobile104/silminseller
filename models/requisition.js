const mongoose = require('mongoose');

// Requisition (แจ้งเบิกสินค้า)
const requisitionSchema = new mongoose.Schema({
    title: { type: String, required: true }, // ชื่อรายการ เช่น "เบิกเคส iPhone 15"
    items: [{
        name: { type: String, required: true }, // ชื่อสินค้า
        quantity: { type: Number, required: true, default: 1 } // จำนวน
    }],
    notes: { type: String, default: '' }, // หมายเหตุเพิ่มเติม
    requested_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, // ผู้ที่เบิก
    status: { 
        type: String, 
        default: 'รอตรวจสอบ', 
        enum: ['รอตรวจสอบ', 'จัดซื้อสั่งสินค้า', 'งานเทคนิค', 'ส่งสินค้าแล้ว', 'ถึงสาขา', 'ยกเลิก'] 
    }, // สถานะสินค้า
    expected_date: { type: Date, default: null } // วันคาดว่าจะถึง
}, { timestamps: true });

const Requisition = mongoose.model('Requisition', requisitionSchema, 'requisition');

module.exports = Requisition;
