const test = require('node:test');
const assert = require('node:assert/strict');
const pp = require('../utils/paymentProof');

test('ซื้อสด: ทอนจากเงินสดก่อน', () => {
    const r = pp.splitReceivedMoney({ paymentType: 'ซื้อสด', cash: 1000, transfer: 0, totalAmount: 850 });
    assert.deepEqual(r, { cash: 850, transfer: 0 });
});

test('ซื้อสด: เงินสดไม่พอทอนก็หักจากเงินโอน', () => {
    const r = pp.splitReceivedMoney({ paymentType: 'ซื้อสด', cash: 100, transfer: 1000, totalAmount: 900 });
    assert.deepEqual(r, { cash: 0, transfer: 900 });
});

test('จัดไฟแนนซ์: รวมเงินดาวน์กับค่าธรรมเนียม', () => {
    const r = pp.splitReceivedMoney({
        paymentType: 'จัดไฟแนนซ์', financeDownCash: 500, financeDownTransfer: 300,
        financeFeeCash: 100, financeFeeTransfer: 0
    });
    assert.deepEqual(r, { cash: 600, transfer: 300 });
});

test('ประเภทหลักฐาน', () => {
    assert.equal(pp.proofKindFor(100, 0), 'เงินสด');
    assert.equal(pp.proofKindFor(0, 100), 'โอน');
    assert.equal(pp.proofKindFor(50, 50), 'เงินสด+โอน');
    assert.equal(pp.proofKindFor(0, 0), null);
});

test('วันที่ตามเวลาไทย: 00:30 ไทยยังเป็นวันใหม่', () => {
    // 2026-10-30 17:30 UTC = 2026-10-31 00:30 เวลาไทย
    const d = new Date('2026-10-30T17:30:00Z');
    assert.deepEqual(pp.bangkokDateParts(d), { month: '2026-10', day: '2026-10-31' });
});

test('เส้นทางโฟลเดอร์', () => {
    const d = new Date('2026-10-30T05:00:00Z');
    assert.deepEqual(pp.proofFolderPath('โอน', 'INV-1', 3, d), [
        'silminseller', 'หลักฐานการชำระเงินกดขาย(การโอน)', '2026-10', '2026-10-30', 'INV-1 (3 รูป)'
    ]);
    assert.deepEqual(pp.stockCheckFolderPath(d), ['silminseller', 'img_check_stock', '2026-10', '2026-10-30']);
    assert.throws(() => pp.proofFolderPath('อื่น', 'INV-1', 1));
});

test('รับเฉพาะรูปที่ถูกต้อง', () => {
    const ok = 'data:image/jpeg;base64,' + Buffer.from('abc').toString('base64');
    assert.equal(pp.parseProofImage(ok).ext, 'jpg');
    assert.equal(pp.parseProofImage('data:text/html;base64,PGI+'), null);
    assert.equal(pp.parseProofImage('ไม่ใช่รูป'), null);
    assert.equal(pp.parseProofImage(null), null);
});
