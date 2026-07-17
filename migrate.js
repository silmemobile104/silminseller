const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Requisition = require('./models/Requisition');

async function migrateStatuses() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        let result = await Requisition.updateMany(
            { status: 'รอดำเนินการ' },
            { $set: { status: 'รอตรวจสอบ' } }
        );
        console.log(`Updated ${result.modifiedCount} requisitions from รอดำเนินการ to รอตรวจสอบ`);

        result = await Requisition.updateMany(
            { status: 'อนุมัติแล้ว' },
            { $set: { status: 'จัดซื้อสั่งสินค้า' } }
        );
        console.log(`Updated ${result.modifiedCount} requisitions from อนุมัติแล้ว to จัดซื้อสั่งสินค้า`);
        
        result = await Requisition.updateMany(
            { status: 'ปฏิเสธ' },
            { $set: { status: 'ยกเลิก' } }
        );
        console.log(`Updated ${result.modifiedCount} requisitions from ปฏิเสธ to ยกเลิก`);

        console.log('Migration complete');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        mongoose.disconnect();
    }
}

migrateStatuses();
