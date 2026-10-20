const fs = require('fs');
const p = __dirname + '/gen-all.js';
let s = fs.readFileSync(p, 'utf8');
function rep(a, b) { if (s.split(a).length !== 2) throw new Error('match != 1: ' + a.slice(0, 70)); s = s.replace(a, () => b); }

// legend ต่อโหมด
rep("const TH_LEGEND = {", "const TH_LEGEND_ARCH = {");
rep("const src = (p, line, end, label)", `const TH_LEGEND = {
  architecture: TH_LEGEND_ARCH, workflow: TH_LEGEND_ARCH,
  lifecycle: { mode: 'auto', entries: { start: { label: 'จุดเริ่มต้น' }, active: { label: 'กำลังดำเนินการ' }, waiting: { label: 'รอดำเนินการ' }, decision: { label: 'ตัดสินใจ' }, success: { label: 'สำเร็จ' }, failure: { label: 'ยกเลิก / ล้มเหลว' }, neutral: { label: 'ระบบปิดให้' }, external: { label: 'ภายนอก' } } },
  sequence: { mode: 'auto', entries: { default: { label: 'คำขอ' }, emphasis: { label: 'เส้นทางหลัก' }, security: { label: 'ตรวจสิทธิ์' }, dashed: { label: 'งานเสริม' }, return: { label: 'ตอบกลับ' } } },
  dataflow: { mode: 'auto', entries: { default: { label: 'การไหลของข้อมูล' }, emphasis: { label: 'เส้นทางหลัก' }, security: { label: 'ควบคุม / ตรวจสิทธิ์' }, dashed: { label: 'เส้นรอง' }, database: { label: 'ที่เก็บข้อมูล' } } }
};
const src = (p, line, end, label)`);
rep("j.meta.legend = TH_LEGEND;", "j.meta.legend = TH_LEGEND[d.type];");

// pos-sale
rep("{ id: 'deduct', lane: 'api', col: 2, type: 'backend', label: t('Deduct stock', 'ตัดสต็อก'), sublabel: t('item by item, own branch', 'ทีละชิ้น ตามสาขา'),",
    "{ id: 'deduct', lane: 'api', col: 2, type: 'backend', width: 140, label: t('Deduct stock', 'ตัดสต็อก'), sublabel: t('item by item, own branch', 'ทีละชิ้น ตามสาขา'),");
rep("label: 'FinanceReceivable', sublabel: t('status รออนุมัติ', 'สถานะ รออนุมัติ')", "label: t('Receivable', 'ลูกหนี้'), sublabel: t('FinanceReceivable', 'FinanceReceivable'), width: 132");

// PO: ย้ายสายจ่ายเงินไปคอลัมน์ 2-3 ไม่ให้เส้นยกเลิกตัดผ่าน
rep("lane: 'pay', col: 0, tag: 'default'", "lane: 'pay', col: 2, tag: 'default'");
rep("lane: 'pay', col: 1, tag: 'pay_po'", "lane: 'pay', col: 3, tag: 'pay_po'");

// stock-flow
rep("viewBox: [1180, 620]", "viewBox: [1180, 700]");
rep("{ id: 'f-pos', from: 'bal', to: 'pos', label: t('availability', 'ของพร้อมขาย'), classification: 'read' }",
    "{ id: 'f-pos', from: 'bal', to: 'pos', label: t('availability', 'ของพร้อมขาย'), classification: 'read', fromSide: 'top', toSide: 'left' }");
rep("{ id: 'f-audit', from: 'bal', to: 'audit', label: t('expected', 'ที่ควรมี'), classification: 'read' }",
    "{ id: 'f-audit', from: 'bal', to: 'audit', label: t('expected', 'ที่ควรมี'), classification: 'read', fromSide: 'right', toSide: 'left', route: 'straight' }");
rep("{ id: 'f-po', from: 'po', to: 'hub', label: '+IMEI', classification: 'in' }", "{ id: 'f-po', from: 'po', to: 'hub', label: t('+ PO', '+ PO'), classification: 'in' }");
rep("{ id: 'f-imp', from: 'imp', to: 'hub', label: '+IMEI', classification: 'in' }", "{ id: 'f-imp', from: 'imp', to: 'hub', label: t('+ approve', '+ อนุมัติ'), classification: 'in' }");
rep("{ id: 'f-trf', from: 'trf', to: 'hub', label: '±', classification: 'move' }", "{ id: 'f-trf', from: 'trf', to: 'hub', label: t('± move', '± โอน'), classification: 'move' }");
rep("{ id: 'f-sale', from: 'sale', to: 'hub', label: '±', classification: 'sale' }", "{ id: 'f-sale', from: 'sale', to: 'hub', label: t('± sale', '± ขาย'), classification: 'sale' }");
rep("{ id: 'f-issue', from: 'issue', to: 'hub', label: '−IMEI', classification: 'out', variant: 'security' }", "{ id: 'f-issue', from: 'issue', to: 'hub', label: t('− issue', '− จ่ายออก'), classification: 'out', variant: 'security' }");

// money-flow
rep("viewBox: [1100, 640]", "viewBox: [1180, 660]");
rep("{ id: 'pnl2', type: 'frontend', label: t('P&L by account', 'งบตามผังบัญชี'), sublabel: '/acct/pnl-report', stage: 2, row: 3,", "{ id: 'pnl2', type: 'frontend', label: t('P&L by account', 'งบตามผังบัญชี'), sublabel: '/acct/pnl-report', stage: 2, row: 4,");
rep("{ id: 'ap', type: 'frontend', label: t('Payables + credit', 'เจ้าหนี้ + วงเงิน'), sublabel: 'ap-summary · credit-usage', stage: 2, row: 4,", "{ id: 'ap', type: 'frontend', label: t('Payables + credit', 'เจ้าหนี้ + วงเงิน'), sublabel: 'ap-summary · credit-usage', stage: 2, row: 3,");
rep("label: t('Sales + verification', 'ขาย + ตรวจสอบออเดอร์'), sublabel: 'POST /transactions', stage: 0, row: 0,", "label: t('Sales + verify', 'ขาย + ตรวจออเดอร์'), sublabel: 'POST /transactions', stage: 0, row: 0, width: 140,");
rep("{ id: 'm-dep-tx', from: 'dep', to: 'tx', label: t('deliver → bill', 'ส่งมอบ → บิล'), classification: 'sale', variant: 'dashed' }",
    "{ id: 'm-dep-tx', from: 'dep', to: 'tx', label: t('deliver → bill', 'ส่งมอบ → บิล'), classification: 'sale', variant: 'dashed', fromSide: 'right', toSide: 'bottom' }");
fs.writeFileSync(p, s);
console.log('patched');
