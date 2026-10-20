const fs = require('fs');
const p = __dirname + '/gen-all.js';
let s = fs.readFileSync(p, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('match != 1: ' + a.slice(0, 80)); s = s.replace(a, () => b); }

// ---- pos-sale: รวมสาย stock + money เป็นสาย records เดียว (ลดความสูง)
rep("    { id: 'stock', label: t('Stock records', 'ข้อมูลสต็อก') },\n    { id: 'money', label: t('Money records', 'ข้อมูลการเงิน') }\n",
    "    { id: 'records', label: t('Stock + money records', 'ข้อมูลสต็อก + การเงิน') }\n");
s = s.split("lane: 'stock'").join("lane: 'records'").split("lane: 'money'").join("lane: 'records'");

// ---- stock-flow: hub เป็นแท่งสูงครอบทุกแถวของ action เพื่อให้เส้นเข้าตรง ๆ
rep("viewBox: [1180, 700]", "viewBox: [1180, 800]");
rep("stage: 1, row: 2, height: 150, tag: 'logActivity'", "stage: 1, row: 2, height: 520, tag: 'logActivity'");
rep(", classification: 'read', fromSide: 'top', toSide: 'left' }", ", classification: 'read' }");
rep(", classification: 'read', fromSide: 'right', toSide: 'left', route: 'straight' }", ", classification: 'read' }");

// ---- money-flow: จัดแถวใหม่ให้ cash เป็นแท่งสูงรับ 3 เส้น
rep("viewBox: [1180, 660]", "viewBox: [1180, 840]");
rep("sublabel: '/acct/disbursements', stage: 0, row: 4,", "sublabel: '/acct/disbursements', stage: 0, row: 5,");
rep("sublabel: 'pay_po', stage: 0, row: 3,", "sublabel: 'pay_po', stage: 0, row: 3,");
rep("sublabel: t('income / expense lines', 'รายการรับ/จ่าย'), stage: 1, row: 2,", "sublabel: t('income / expense lines', 'รายการรับ/จ่าย'), stage: 1, row: 2, height: 292,");
rep("sublabel: 'PurchaseOrder', stage: 1, row: 3,", "sublabel: 'PurchaseOrder', stage: 1, row: 4,");
rep("sublabel: t('debit / credit accounts', 'บัญชีเดบิต/เครดิต'), stage: 1, row: 4,", "sublabel: t('debit / credit accounts', 'บัญชีเดบิต/เครดิต'), stage: 1, row: 5, width: 150,");
rep("sublabel: '/acct/pnl-report', stage: 2, row: 4,", "sublabel: '/acct/pnl-report', stage: 2, row: 5,");
rep("sublabel: 'ap-summary · credit-usage', stage: 2, row: 3,", "sublabel: 'ap-summary · credit-usage', stage: 2, row: 4,");
rep("sublabel: '/accounting/profit-loss', stage: 2, row: 1,", "sublabel: '/accounting/profit-loss', stage: 2, row: 1, height: 150,");
rep(", classification: 'sale', variant: 'dashed', fromSide: 'right', toSide: 'bottom' }", ", classification: 'sale', variant: 'dashed' }");
fs.writeFileSync(p, s);
console.log('patched2');
