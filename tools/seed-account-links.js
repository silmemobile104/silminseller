// ตั้งผังบัญชีเริ่มต้นสำหรับร้านผ่อนขายมือถือ แล้วเชื่อม "รายการ" (utils/accountItems.js) เข้ากับรหัสบัญชี
//
//   node tools/seed-account-links.js           ดูตัวอย่างอย่างเดียว ไม่เขียนอะไรลง DB
//   node tools/seed-account-links.js --apply   เขียนจริง
//
// ปลอดภัยทำซ้ำได้ และไม่ล็อกอะไร:
//  - กลุ่ม/รหัสบัญชีที่มีรหัสตรงอยู่แล้วจะใช้ของเดิม ไม่แก้ชื่อ ไม่สร้างซ้ำ
//  - รายการที่ "มีคนเชื่อมไว้แล้ว" ข้ามไปทั้งรายการ ไม่ทับการเชื่อมเดิม (ผู้ใช้ย้ายเองได้เสมอที่หน้า #account-tree)
//  - ไม่ลบอะไรเลย · ค่าที่ตั้งไว้ใช้เป็นแค่จุดเริ่มต้น ย้ายรายการไปรหัสอื่นภายหลังได้ทุกเมื่อ

require('dotenv').config();
const mongoose = require('mongoose');
const { AccountCategory, AccountGroup, AccountChart, AccountItemLink } = require('../models');
const { ACCOUNT_ITEMS } = require('../utils/accountItems');

// หมวด: 1 สินทรัพย์ · 2 หนี้สิน · 4 รายได้ · 5 ค่าใช้จ่าย
const GROUPS = [
    { code: '110', name: 'เงินสดและเงินฝากธนาคาร', cat: '1' },
    { code: '120', name: 'ลูกหนี้และสินทรัพย์หมุนเวียนอื่น', cat: '1' },
    { code: '130', name: 'สินค้าคงเหลือ', cat: '1' },
    { code: '210', name: 'เจ้าหนี้และเงินรับล่วงหน้า', cat: '2' },
    { code: '410', name: 'รายได้จากการขายและบริการ', cat: '4' },
    { code: '420', name: 'รายได้อื่น', cat: '4' },
    { code: '510', name: 'ต้นทุนขาย', cat: '5' },
    { code: '520', name: 'ค่าใช้จ่ายในการดำเนินงาน', cat: '5' },
    { code: '530', name: 'ขาดทุนจากสินค้า', cat: '5' }
];

// รหัสบัญชี → กลุ่ม + รายการที่เชื่อม (เหตุผลอยู่ท้ายบรรทัด)
const ACCOUNTS = [
    { code: '11100', name: 'เงินสดในมือ', group: '110', items: ['sale_receive_cash'] },                                  // เงินสดที่รับจริงจากลูกค้า
    { code: '11200', name: 'เงินฝากธนาคาร / เงินโอน', group: '110', items: ['sale_receive_transfer', 'finance_settle'] }, // เงินโอนจากลูกค้าและไฟแนนซ์เข้าบัญชีร้าน
    { code: '11300', name: 'เงินดาวน์รับจากลูกค้า (แยกดูยอด)', group: '110', items: ['sale_down_payment'] },             // เป็นส่วนหนึ่งของเงินสด/โอนอยู่แล้ว แยกรหัสเพื่อไม่ให้ยอดซ้ำกัน
    { code: '12100', name: 'ลูกหนี้ไฟแนนซ์ (ค้างโอน)', group: '120', items: ['finance_receivable'] },
    { code: '12200', name: 'สินค้าส่งเคลมรอผลซัพพลายเออร์', group: '120', items: ['claim_send'] },
    { code: '12210', name: 'เงินสดที่ได้จากการเคลมซัพพลายเออร์', group: '120', items: ['claim_cash'] },
    { code: '13100', name: 'สินค้าคงเหลือ', group: '130', items: ['po_receive', 'receive_no_po', 'claim_goods', 'claim_reject_restock'] }, // ของเข้าสต็อกทุกทาง
    { code: '21100', name: 'เจ้าหนี้การค้า (ซัพพลายเออร์)', group: '210', items: ['ap_trade', 'po_pay'] },             // ค้างจ่ายและการจ่ายหนี้ซัพพลายเออร์
    { code: '21300', name: 'เงินมัดจำรับจากลูกค้า', group: '210', items: ['deposit_receive', 'deposit_refund'] },     // หนี้สินต่อลูกค้า รับเข้า/คืนออก
    { code: '21310', name: 'เงินมัดจำที่ตัดเป็นค่าสินค้า', group: '210', items: ['deposit_applied'] },                // แยกไว้ ไม่ให้ปนกับยอดมัดจำค้างอยู่
    { code: '41100', name: 'รายได้จากการขายเครื่อง', group: '410', items: ['sale_device_cash', 'sale_device_finance'] },
    { code: '41200', name: 'รายได้จากการขายอุปกรณ์เสริม', group: '410', items: ['sale_accessory'] },
    { code: '41300', name: 'รายได้ค่าคอมมิชชันจากไฟแนนซ์', group: '410', items: ['finance_commission'] },
    { code: '41400', name: 'รายได้ค่าธรรมเนียม (สัญญา / iCloud)', group: '410', items: ['sale_contract_fee', 'sale_icloud_fee'] },
    { code: '41600', name: 'ส่วนลดจ่าย (หักจากรายได้)', group: '410', items: ['sale_discount'] },
    { code: '42100', name: 'รายได้จากมัดจำที่ยึด / ไม่ทอนคืน', group: '420', items: ['deposit_forfeit', 'deposit_excess_income'] },
    { code: '42200', name: 'ส่วนลดรับจากซัพพลายเออร์', group: '420', items: ['po_discount', 'claim_discount'] },
    { code: '42300', name: 'รายได้อื่นๆ', group: '420', items: ['other_income'] },
    { code: '51100', name: 'ต้นทุนสินค้าที่ขาย', group: '510', items: ['sale_cogs'] },
    { code: '51200', name: 'ต้นทุนของแถม', group: '510', items: ['sale_gift'] },
    { code: '52100', name: 'ค่าเช่า', group: '520', items: ['exp_rent'] },
    { code: '52110', name: 'ค่าไฟ / น้ำ', group: '520', items: ['exp_utilities'] },
    { code: '52200', name: 'เงินเดือน', group: '520', items: ['exp_salary'] },
    { code: '52300', name: 'ค่าทำใบสัญญา', group: '520', items: ['exp_contract_prep'] },
    { code: '52900', name: 'ค่าใช้จ่ายอื่นๆ', group: '520', items: ['exp_other_accounting', 'exp_other_order', 'other_expense'] },
    { code: '52950', name: 'ค่าใช้จ่ายตามใบสำคัญจ่าย', group: '520', items: ['disbursement'] },
    { code: '53100', name: 'สินค้าชำรุด / สูญหาย', group: '530', items: ['stock_loss'] },
    { code: '53200', name: 'ขาดทุนจากเคลมที่ซัพปฏิเสธ (ตัดทิ้ง)', group: '530', items: ['claim_reject_writeoff'] }
];

(async () => {
    const apply = process.argv.includes('--apply');
    if (!process.env.MONGO_URI) throw new Error('ไม่พบ MONGO_URI ใน .env');

    // ตรวจก่อนว่าแผนครอบคลุมทุกรายการในแคตตาล็อก และไม่มีรายการซ้ำ/ผิด key
    const catalog = new Set(ACCOUNT_ITEMS.map(i => i.key));
    const planned = ACCOUNTS.flatMap(a => a.items);
    const dup = planned.filter((k, i) => planned.indexOf(k) !== i);
    const unknown = planned.filter(k => !catalog.has(k));
    const missing = [...catalog].filter(k => !planned.includes(k));
    if (dup.length || unknown.length || missing.length) {
        throw new Error(`แผนไม่ครบ/ไม่ถูกต้อง ซ้ำ: [${dup}] ไม่รู้จัก: [${unknown}] ตกหล่น: [${missing}]`);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log(apply ? '== เขียนจริง ==' : '== ดูตัวอย่าง (ยังไม่เขียนอะไร ใส่ --apply เพื่อเขียนจริง) ==');

    const cats = new Map((await AccountCategory.find().lean()).map(c => [c.category_code, c]));
    for (const g of GROUPS) if (!cats.get(g.cat)) throw new Error(`ไม่พบหมวด ${g.cat} (ต้องสตาร์ทเซิร์ฟเวอร์ให้ seed หมวดก่อน)`);

    const stats = { groupNew: 0, groupHave: 0, accNew: 0, accHave: 0, linkNew: 0, linkSkip: 0 };

    const groupIds = new Map();
    for (const g of GROUPS) {
        let doc = await AccountGroup.findOne({ group_code: g.code });
        if (doc) { stats.groupHave++; }
        else {
            stats.groupNew++;
            console.log(`+ กลุ่ม ${g.code} ${g.name}`);
            if (apply) doc = await AccountGroup.create({ group_code: g.code, group_name: g.name, category_id: cats.get(g.cat)._id });
        }
        groupIds.set(g.code, doc ? doc._id : null);
    }

    for (const a of ACCOUNTS) {
        const grp = GROUPS.find(g => g.code === a.group);
        let doc = await AccountChart.findOne({ account_code: a.code });
        if (doc) { stats.accHave++; }
        else {
            stats.accNew++;
            console.log(`+ รหัส ${a.code} ${a.name}  (กลุ่ม ${a.group})`);
            if (apply) doc = await AccountChart.create({ account_code: a.code, account_name: a.name, category_id: cats.get(grp.cat)._id, group_id: groupIds.get(a.group), level: 3 });
        }
        for (const key of a.items) {
            // รายการที่ถูกเชื่อมไว้แล้ว (กับรหัสไหนก็ตาม) = ผู้ใช้ตั้งใจไว้ ไม่แตะ
            if (await AccountItemLink.exists({ item_key: key })) { stats.linkSkip++; console.log(`  ข้าม ${key} (มีการเชื่อมอยู่แล้ว)`); continue; }
            stats.linkNew++;
            console.log(`  เชื่อม ${key} → ${a.code} ${a.name}`);
            if (apply && doc) await AccountItemLink.create({ account_id: doc._id, item_key: key });
        }
    }

    console.log('\nสรุป', stats);
    await mongoose.disconnect();
})().catch(async e => { console.error('ผิดพลาด:', e.message); try { await mongoose.disconnect(); } catch (_) { } process.exit(1); });
