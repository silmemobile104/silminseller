const fs = require('fs');
const p = __dirname + '/dataflows.js';
let s = fs.readFileSync(p, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('match != 1: ' + a.slice(0, 80)); s = s.replace(a, () => b); }
rep("viewBox: [1180, 560]", "viewBox: [1060, 560]");
rep("viewBox: [1180, 640]", "viewBox: [1060, 740]");
// money-flow: โหนดแคบลงเพื่อให้ป้ายเส้นมีที่ว่าง
s = s.split("width: 160").join("width: 140").split("width: 150,\n        sources: [src(API, 2787").join("width: 140,\n        sources: [src(API, 2787");
rep("sublabel: 'Transaction · Receivable'", "sublabel: t('bills + receivable', 'บิล + ลูกหนี้')");
rep("sublabel: t('income / expense lines', 'รายการรับ/จ่าย'), stage: 1, row: 1, height: 178,", "sublabel: t('income / expense', 'รายรับ/รายจ่าย'), stage: 1, row: 1, height: 178,");
rep("sublabel: t('paid_amount + cash line', 'paid_amount + รายการเงิน')", "sublabel: t('paid + cash line', 'ยอดจ่าย + รายการเงิน')");
rep("sublabel: t('accounts + cash line', 'บัญชี + รายการเงิน')", "sublabel: t('accounts + cash', 'บัญชี + รายการเงิน')");
rep("sublabel: '/accounting/profit-loss'", "sublabel: 'profit-loss'");
rep("sublabel: 'ap-summary · credit'", "sublabel: 'ap-summary'");
rep("sublabel: '/acct/pnl-report'", "sublabel: 'pnl-report'");
rep("sublabel: '/accounting/expenses'", "sublabel: 'accounting/expenses'");
rep("sublabel: '/acct/disbursements'", "sublabel: 'acct/disbursements'");
rep("label: t('other lines', 'รายการอื่น')", "label: t('other', 'อื่น ๆ')");
fs.writeFileSync(p, s);
console.log('patched5');
