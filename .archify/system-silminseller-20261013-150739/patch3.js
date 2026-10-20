const fs = require('fs');
const p = __dirname + '/gen-all.js';
let s = fs.readFileSync(p, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('match != 1: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

// pos-sale: ขยายความกว้างโหนดทั้งหมด เพื่อให้สัดส่วนผ่านเกณฑ์ความสูง
rep("    const j = d.build(t);\n", "    const j = d.build(t);\n    if (d.id === 'pos-sale') j.nodes.forEach(n => { n.width = Math.max(n.width || 0, 156); });\n");

// stock-flow: hub แถวบนสุด สูง 520 (ครอบแถว 0-4); bal สูงขึ้นให้พอร์ตออกห่างกัน
rep("stage: 1, row: 2, height: 520, tag: 'logActivity'", "stage: 1, row: 0, height: 520, tag: 'logActivity'");
rep("sublabel: t('per branch: qty + imeis[]', 'ต่อสาขา: จำนวน + imeis[]'), stage: 2, row: 1,", "sublabel: t('per branch: qty + imeis[]', 'ต่อสาขา: จำนวน + imeis[]'), stage: 2, row: 1, height: 120,");

// money-flow: จัดแถวใหม่ (แถว 0-4 เท่านั้น)
rep("sublabel: '/acct/disbursements', stage: 0, row: 5,", "sublabel: '/acct/disbursements', stage: 0, row: 4,");
rep("sublabel: t('income / expense lines', 'รายการรับ/จ่าย'), stage: 1, row: 2, height: 292,", "sublabel: t('income / expense lines', 'รายการรับ/จ่าย'), stage: 1, row: 1, height: 178,");
rep("sublabel: 'PurchaseOrder', stage: 1, row: 4,", "sublabel: 'PurchaseOrder', stage: 1, row: 3,");
rep("stage: 1, row: 5, width: 150,", "stage: 1, row: 4, width: 150,");
rep("sublabel: '/acct/pnl-report', stage: 2, row: 5,", "sublabel: '/acct/pnl-report', stage: 2, row: 4,");
rep("sublabel: 'ap-summary · credit-usage', stage: 2, row: 4,", "sublabel: 'ap-summary · credit-usage', stage: 2, row: 3,");
rep("viewBox: [1180, 840]", "viewBox: [1180, 700]");
// ตัดเส้น dep→tx ออก (ส่งมอบ → บิล อธิบายไว้ใน card) เพื่อไม่ให้พอร์ต tx ซ้อนกัน
rep("    { id: 'm-dep-tx', from: 'dep', to: 'tx', label: t('deliver → bill', 'ส่งมอบ → บิล'), classification: 'sale', variant: 'dashed' },\n", "");
rep("{ id: 'm-po-cash', from: 'popay', to: 'cash', label: t('PO payment', 'จ่าย PO'), classification: 'expense', variant: 'security' }",
    "{ id: 'm-po-cash', from: 'popay', to: 'cash', label: t('PO payment', 'จ่าย PO'), classification: 'expense', variant: 'security', channelX: 188 }");
rep("{ id: 'm-pv-cash', from: 'pv', to: 'cash', label: t('cash out', 'เงินออก'), classification: 'expense', variant: 'dashed' }",
    "{ id: 'm-pv-cash', from: 'pv', to: 'cash', label: t('cash out', 'เงินออก'), classification: 'expense', variant: 'dashed', channelX: 172 }");
rep("      t('Financing writes the immediate cash and a receivable', 'ไฟแนนซ์เขียนเงินสดรับทันที + ลูกหนี้')] },",
    "      t('Financing writes the immediate cash and a receivable', 'ไฟแนนซ์เขียนเงินสดรับทันที + ลูกหนี้'),\n      t('Delivering a deposit also creates a cash-sale bill', 'ส่งมอบมัดจำจะสร้างบิลซื้อสดด้วย')] },");
fs.writeFileSync(p, s);
console.log('patched3');
