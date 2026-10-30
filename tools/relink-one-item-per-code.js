// จัดการเชื่อมให้เป็นกติกา "1 รหัสบัญชี เชื่อม 1 รายการ"
//
//   node tools/relink-one-item-per-code.js           ดูตัวอย่างอย่างเดียว ไม่เขียนอะไรลง DB
//   node tools/relink-one-item-per-code.js --apply   เขียนจริง (สำรองการเชื่อมเดิมลง tools/backups/ ก่อนเสมอ)
//
// หลักการ:
//  - ไม่แก้ชื่อ/กลุ่มของรหัสที่มีอยู่แล้ว ไม่ลบรหัสใดเลย
//  - รหัสที่เชื่อมหลายรายการ: เก็บ 1 รายการไว้ตามแผน (KEEP) ที่เหลือย้ายไปรหัสใหม่ (NEW) หรือรหัสว่างที่มีอยู่ (MOVE_TO)
//  - รายการที่ยังไม่เชื่อมรหัสใด ได้รหัสใหม่ของตัวเอง
//  - ทำซ้ำได้ ผลเท่าเดิม · ยอดเข้า-ออกเก็บต่อรายการ ไม่ผูกรหัส ย้ายลิงก์แล้วยอดตามทันที ไม่ต้องคำนวณใหม่

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { AccountChart, AccountGroup, AccountItemLink } = require('../models');
const { ACCOUNT_ITEMS } = require('../utils/accountItems');

// รหัสที่มีอยู่แล้ว → รายการเดียวที่เก็บไว้ (รายการอื่นของรหัสนั้นต้องย้ายออก)
const KEEP = {
    '11100': 'sale_receive_cash',
    '11200': 'sale_receive_transfer',
    '13100': 'po_receive',
    '21100': 'ap_trade',
    '21300': 'deposit_receive',
    '41100': 'sale_device_cash',
    '42100': 'deposit_forfeit',
    '42200': 'po_discount',
    '52900': 'exp_other_accounting'
};

// รายการ → รหัสที่มีอยู่แล้วและว่างอยู่ (ไม่ต้องสร้างใหม่)
const MOVE_TO = {
    sale_down_payment: '11300'
};

// รายการ → รหัสใหม่ที่ต้องสร้าง (อยู่กลุ่มเดียวกับรหัสเดิมของรายการ)
const NEW_ACCOUNTS = {
    finance_settle:        { code: '11210', name: 'เงินรับจากไฟแนนซ์ (โอนเข้าบัญชี)', group: '110' },
    claim_stock_out:       { code: '12220', name: 'สินค้าออกจากสต็อกไปเคลม', group: '120' },
    po_prepaid:            { code: '12300', name: 'เงินจ่ายล่วงหน้าซัพพลายเออร์', group: '120' },
    receive_no_po:         { code: '13110', name: 'สินค้ารับเข้าโดยไม่ผ่านใบสั่งซื้อ', group: '130' },
    claim_goods:           { code: '13120', name: 'สินค้าทดแทนจากการเคลม', group: '130' },
    claim_reject_restock:  { code: '13130', name: 'สินค้าเคลมที่ซัพปฏิเสธ (คืนเข้าสต็อก)', group: '130' },
    po_pay:                { code: '21110', name: 'จ่ายเงินซัพพลายเออร์ (ใบสั่งซื้อ)', group: '210' },
    deposit_refund:        { code: '21320', name: 'คืนเงินมัดจำลูกค้า', group: '210' },
    sale_device_finance:   { code: '41110', name: 'รายได้จากการขายเครื่องจัดไฟแนนซ์', group: '410' },
    deposit_excess_income: { code: '42110', name: 'รายได้มัดจำส่วนเกิน (ไม่ทอนคืน)', group: '420' },
    claim_discount:        { code: '42210', name: 'ส่วนลดรับจากการเคลมซัพพลายเออร์', group: '420' },
    other_expense:         { code: '52910', name: 'รายจ่ายอื่นๆ', group: '530' },
    stock_issue_untyped:   { code: '53300', name: 'จ่ายออกสินค้าไม่ระบุประเภท', group: '540' }
};

(async () => {
    const apply = process.argv.includes('--apply');
    if (!process.env.MONGO_URI) throw new Error('ไม่พบ MONGO_URI ใน .env');
    const catalog = new Set(ACCOUNT_ITEMS.map(i => i.key));
    const itemName = new Map(ACCOUNT_ITEMS.map(i => [i.key, i.name]));
    [...Object.values(KEEP), ...Object.keys(MOVE_TO), ...Object.keys(NEW_ACCOUNTS)].forEach(k => {
        if (!catalog.has(k)) throw new Error('ไม่รู้จักรายการ ' + k);
    });

    await mongoose.connect(process.env.MONGO_URI);
    console.log(apply ? '== เขียนจริง ==' : '== ดูตัวอย่าง (ยังไม่เขียนอะไร ใส่ --apply เพื่อเขียนจริง) ==');

    const [accounts, groups, links] = await Promise.all([AccountChart.find().lean(), AccountGroup.find().lean(), AccountItemLink.find().lean()]);
    const accByCode = new Map(accounts.map(a => [a.account_code, a]));
    const accById = new Map(accounts.map(a => [String(a._id), a]));
    const groupByCode = new Map(groups.map(g => [g.group_code, g]));

    // 1) แผน: ปลายทางของแต่ละรายการหลังจัดใหม่ (item_key → รหัส)
    const target = new Map(); // item_key -> account code
    links.forEach(l => { const a = accById.get(String(l.account_id)); if (a) target.set(l.item_key, a.account_code); });
    Object.entries(KEEP).forEach(([code, key]) => target.set(key, code));
    Object.entries(MOVE_TO).forEach(([key, code]) => target.set(key, code));
    Object.entries(NEW_ACCOUNTS).forEach(([key, n]) => target.set(key, n.code));

    // 2) ตรวจกติกา: ทุกรหัสเหลือ ≤ 1 รายการ และทุกรายการมีรหัส
    const perCode = new Map();
    target.forEach((code, key) => { if (!perCode.has(code)) perCode.set(code, []); perCode.get(code).push(key); });
    const bad = [...perCode].filter(([, keys]) => keys.length > 1);
    if (bad.length) throw new Error('แผนยังมีรหัสที่เชื่อมเกิน 1 รายการ: ' + bad.map(([c, k]) => `${c}=[${k}]`).join(' '));
    const unlinked = [...catalog].filter(k => !target.has(k));
    if (unlinked.length) throw new Error('แผนยังมีรายการที่ไม่มีรหัส: ' + unlinked.join(','));
    for (const n of Object.values(NEW_ACCOUNTS)) {
        if (accByCode.has(n.code)) throw new Error(`รหัสใหม่ ${n.code} มีอยู่แล้วในระบบ — เลือกเลขอื่น`);
        if (!groupByCode.has(n.group)) throw new Error(`ไม่พบกลุ่ม ${n.group}`);
    }
    for (const code of Object.values(MOVE_TO)) if (!accByCode.has(code)) throw new Error(`ไม่พบรหัส ${code}`);

    // 3) สร้างรหัสใหม่
    const newIds = new Map(); // code -> _id
    for (const [key, n] of Object.entries(NEW_ACCOUNTS)) {
        const grp = groupByCode.get(n.group);
        console.log(`+ รหัสใหม่ ${n.code} ${n.name}  (กลุ่ม ${n.group})  ← ${key}`);
        if (apply) {
            const doc = await AccountChart.create({ account_code: n.code, account_name: n.name, category_id: grp.category_id, group_id: grp._id, level: 3 });
            newIds.set(n.code, doc._id);
        }
    }

    // 4) สำรองการเชื่อมเดิม แล้วย้ายลิงก์
    if (apply) {
        const dir = path.join(__dirname, 'backups');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `account-item-links-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(file, JSON.stringify(links, null, 2));
        console.log('สำรองการเชื่อมเดิมไว้ที่', file);
    }
    const idOfCode = (code) => (accByCode.get(code) ? accByCode.get(code)._id : newIds.get(code));
    let moved = 0, kept = 0;
    for (const [key, code] of target) {
        const cur = links.filter(l => l.item_key === key).map(l => accById.get(String(l.account_id))).filter(Boolean);
        if (cur.length === 1 && cur[0].account_code === code) { kept++; continue; }
        console.log(`  ย้าย ${key} (${itemName.get(key)}): ${cur.map(a => a.account_code).join(',') || 'ยังไม่เชื่อม'} → ${code}`);
        moved++;
        if (apply) {
            // เพิ่มก่อนลบ — ระหว่างทางรายการไม่ตกไปเป็น "ยังไม่เชื่อม"
            await AccountItemLink.updateOne({ account_id: idOfCode(code), item_key: key }, { $setOnInsert: { account_id: idOfCode(code), item_key: key } }, { upsert: true });
            await AccountItemLink.deleteMany({ item_key: key, account_id: { $ne: idOfCode(code) } });
        }
    }
    console.log(`\nสรุป: รหัสใหม่ ${Object.keys(NEW_ACCOUNTS).length} · ย้ายลิงก์ ${moved} · คงเดิม ${kept} · รายการทั้งหมด ${catalog.size}`);
    await mongoose.disconnect();
})().catch(async e => { console.error('ผิดพลาด:', e.message); try { await mongoose.disconnect(); } catch (_) { } process.exit(1); });
