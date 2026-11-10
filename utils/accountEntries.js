// บันทึกยอดเข้า-ออกของ "รายการ" (utils/accountItems.js) ลง AccountItemEvent จากเอกสารต้นทางของระบบ
//
// หลักการ
//  - ตัวสร้างยอด (build*) อ่านสถานะ "ปัจจุบัน" ของเอกสารแล้วคืนยอดของทุกรายการ — เอกสารถูกแก้/ยกเลิกเมื่อไหร่ก็เรียก refreshSource ใหม่
//    ระบบจะ upsert ยอดที่มีและลบยอดที่ไม่เหลือ (ไม่ใช่ append) จึงเรียกซ้ำกี่ครั้งก็ได้ผลเท่าเดิม และบันทึกสด/บันทึกย้อนหลังใช้ตัวสร้างเดียวกัน
//  - เก็บยอดต่อ "รายการ" ไม่ผูกรหัสบัญชี ยอดต่อรหัสคำนวณตอนอ่านจาก AccountItemLink (เปลี่ยนการเชื่อมแล้วยอดตามทันที ไม่ต้องบันทึกใหม่)
//  - ไม่ throw: การบันทึกยอดล้มต้องไม่ทำให้การขาย/รับของที่ทำสำเร็จไปแล้วล้มตาม (Mongo ที่นี่ไม่มี transaction)
//    queueRefresh เป็น fire-and-forget ไม่หน่วง response · ล้มแล้วกด "คำนวณใหม่" ที่หน้ายอดเข้า-ออกเพื่อเก็บตก
//  - สูตรไฟแนนซ์ใช้ฟังก์ชันของ routes/api.js ตัวเดียวกับหน้าตรวจสอบออเดอร์ (ฝ่ายบัญชียืนยันสูตรแล้ว ห้ามเขียนซ้ำ) — require แบบ lazy กัน circular
const mongoose = require('mongoose');
const {
    Transaction, FinanceReceivable, Product, Deposit, Claim, StockIssue, PurchaseOrder, ImportNotification,
    Expense, CashMovement, DisbursementVoucher, OtherEntry, Movement, AuditLog, Employee,
    AccountItemEvent, AccountItemLink, AccountChart
} = require('../models');
const mdCache = require('./masterDataCache');
const { ACCOUNT_ITEM_BY_KEY, ACCOUNT_ITEM_KEYS, ACCOUNT_FLOW_LABELS } = require('./accountItems');

const num = (v) => Number(v) || 0;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (arr) => arr.reduce((s, x) => s + x, 0);

const getHelpers = () => require('../routes/api').accountingHelpers;

// รวมยอดรายการซ้ำ key เดียวกัน · ทิ้งยอด ≤ 0 · ใส่ flow เริ่มต้นจากแคตตาล็อก · key นอกแคตตาล็อกถือเป็นบั๊ก ข้ามพร้อมเตือน
// 1 เอกสารเก็บได้ 1 ยอดต่อ key (unique index) — key ซ้ำที่ flow/รหัสบัญชีต่างกันรวมกันไม่ได้ ถือเป็นบั๊กของตัวสร้างยอด จึงเตือนไว้
// ยอดติดลบไม่ใช่ยอดที่บันทึกได้ (flow บอกทิศทางแล้ว) แต่เป็นสัญญาณว่าเอกสารผิดปกติ เช่น PO จ่ายเกินยอดสั่ง — เตือนแทนการทิ้งเงียบๆ
function finish(list, fallbackDate, ref) {
    const merged = new Map();
    for (const e of list) {
        const item = ACCOUNT_ITEM_BY_KEY.get(e.item_key);
        if (!item) { console.warn('[accountEntries] ไม่รู้จักรายการ', e.item_key); continue; }
        const amount = round2(e.amount);
        if (amount < -0.004) console.warn(`[accountEntries] ยอดติดลบถูกข้าม ${e.item_key} ${amount} (${ref || '-'})`);
        if (!(amount > 0.004)) continue;
        const flow = e.flow || item.flow;
        const mapKey = e.item_key;
        const date = e.date && !isNaN(new Date(e.date)) ? new Date(e.date) : (fallbackDate ? new Date(fallbackDate) : new Date());
        const cur = merged.get(mapKey);
        if (cur) {
            if (cur.flow !== flow || String(cur.account_id || '') !== String(e.account_id || '')) {
                console.warn(`[accountEntries] รายการ ${e.item_key} ซ้ำในเอกสารเดียวแต่ทิศทาง/รหัสบัญชีต่างกัน (${ref || '-'}) — ใช้ของตัวแรก`);
            }
            cur.amount = round2(cur.amount + amount);
        } else merged.set(mapKey, { item_key: e.item_key, flow, amount, date, account_id: e.account_id || null });
    }
    return [...merged.values()];
}

// ---------------------------------------------------------------------------------------------
// ตัวสร้างยอดต่อเอกสาร (ฟังก์ชันล้วน ไม่แตะ DB) — คืน { events, branch_id, ref }
// ---------------------------------------------------------------------------------------------

// วิเคราะห์บิลขาย: แยกเครื่อง/อุปกรณ์เสริม/ของแถม คำนวณส่วนลด มัดจำที่ใช้ และมัดจำส่วนเกิน — ใช้ร่วมกันทั้งตัวบันทึกยอดและหน้าประวัติการมัดจำ
// เครื่อง = หน่วย "เครื่อง" หรือ (ไม่มีหน่วย + มี IMEI) เหมือน GET /order-verifications (api.js)
function analyzeBill(t, ctx) {
    const { md, productById, depositByBill } = ctx;
    const lines = (t.items || []).map(it => {
        const p = it.product_id ? productById.get(String(it.product_id)) : null;
        const unit = p && p.unit_id ? md.maps.productUnits.get(String(p.unit_id)) : null;
        return {
            product_name: it.product_name || '',
            price: num(it.price),
            quantity: Number(it.quantity) || 1,
            // ราคาทุน ณ วันขาย (เก็บในบิลตั้งแต่ POS/ส่งมอบมัดจำบันทึก) · บิลเก่าไม่มี ใช้ราคาทุนของสินค้า
            // (แก้/ลบสินค้าจะเก็บราคาทุนเดิมลงบิลเก่าให้ก่อน ดู routes/api.js freezeSoldCost)
            cost: it.cost_price != null ? num(it.cost_price) : (p ? num(p.cost_price) : 0),
            // POS ล็อกราคาของแถมเป็น 0 และไม่ได้ส่ง is_gift ไปเซิร์ฟเวอร์ — รายการราคา 0 จึงถือเป็นของแถม
            isGift: it.is_gift === true || num(it.price) === 0,
            unitName: unit ? unit.name : '',
            imei: it.imei_sold || '',
            typeId: p && p.type_id ? String(p.type_id) : ''
        };
    });
    const isDevice = (l) => !l.isGift && (l.unitName === 'เครื่อง' || (!l.unitName && !!l.imei));
    const devices = lines.filter(isDevice);
    const accessories = lines.filter(l => !l.isGift && !isDevice(l));
    const gifts = lines.filter(l => l.isGift);
    const lineTotal = (l) => l.price * l.quantity;
    const lineCost = (l) => l.cost * l.quantity;

    const devicesTotal = sum(devices.map(lineTotal));
    const accessoryTotal = sum(accessories.map(lineTotal));
    const itemsSubtotal = devicesTotal + accessoryTotal;
    const contractFee = num(t.contract_fee);
    const icloudFee = num(t.icloud_fee);
    const fees = contractFee + icloudFee;
    const isFinance = (t.payment_type || t.payment_method) === 'จัดไฟแนนซ์';
    const total = num(t.total_amount);

    // ส่วนลดท้ายบิล: บิลใหม่เก็บ discount_amount ไว้ · บิลเก่าไม่ได้เก็บ ย้อนจาก total = รายการ − ส่วนลด − มัดจำ + ค่าธรรมเนียม (เหมือนหน้าตรวจสอบออเดอร์)
    const posDeposit = num(t.applied_deposit_amount);
    const discount = t.discount_amount != null
        ? num(t.discount_amount)
        : Math.max(0, round2(itemsSubtotal + fees - posDeposit - total));
    // มัดจำเกินยอดบิล (เช่น มัดจำเครื่องแต่มารับอุปกรณ์เสริม): ยอดบิลถูกบีบเป็น 0 ส่วนเกินไม่ทอนคืน = รายได้
    const dueBeforeDeposit = Math.max(0, itemsSubtotal - discount + fees);
    const excess = Math.max(0, round2(posDeposit - dueBeforeDeposit));
    const posApplied = posDeposit - excess;

    // ส่งมอบผ่าน PUT /deposits/:id/complete: ระบบสร้างบิลราคาเต็มโดยไม่ได้ผูก applied_deposit_id — หาใบมัดจำจากเลขที่บิล
    const completeDep = !t.applied_deposit_id ? (depositByBill.get(t.receipt_number) || null) : null;
    const completeApplied = completeDep ? num(completeDep.deposit_amount) : 0;

    return {
        lines, devices, accessories, gifts, devicesTotal, accessoryTotal, itemsSubtotal, contractFee, icloudFee, fees,
        isFinance, total, posDeposit, discount, excess, posApplied, completeDep, completeApplied, lineTotal, lineCost
    };
}
// บิลขาย — ยอดทุกรายการของบิลหนึ่งใบ (ส่วนลด/ไฟแนนซ์/สด-โอน ใช้ฟังก์ชันเดิมของ api.js)
function buildTransactionEvents(t, ctx) {
    const out = { events: [], branch_id: t.branch_id || null, ref: t.receipt_number || '' };
    if (t.status === 'ยกเลิกแล้ว') return out; // บิลยกเลิก = ไม่มียอดใดๆ (ของเดิมถูกลบตอน refresh)

    const { md, receivableByTxn, helpers } = ctx;
    const date = t.created_at || t.createdAt || new Date();
    const {
        devices, accessories, gifts, devicesTotal, accessoryTotal, contractFee, icloudFee, fees,
        isFinance, total, discount, excess, posApplied, completeDep, completeApplied, lineTotal, lineCost
    } = analyzeBill(t, ctx);

    let cash;
    let transfer;
    if (isFinance) {
        const split = helpers.splitFinanceReceived(t, num(t.down_payment) + fees);
        cash = split.cash;
        transfer = split.transfer;
    } else {
        cash = num(t.cash_amount);
        transfer = num(t.transfer_amount);
        if (completeDep) { // ยอดเงินสด/โอนในบิลรวมมัดจำที่รับไว้ก่อนแล้ว — เอามัดจำออก เหลือเฉพาะที่จ่ายตอนส่งมอบ
            cash = Math.max(0, cash - num(completeDep.cash_amount));
            transfer = Math.max(0, transfer - num(completeDep.transfer_amount));
        } else if (cash + transfer === 0 && total > 0) { // บิลเก่ามากไม่มีฟิลด์แยกเงินสด/โอน ดูวิธีชำระเดิม
            if (t.payment_method === 'โอนเงิน') transfer = total; else cash = total;
        }
        // บิลเก่าเก็บ "เงินที่ลูกค้ายื่นมา" (รวมเงินทอน) — ส่วนที่เกินยอดที่ต้องเก็บคือเงินทอน ทอนเป็นเงินสดก่อน ขาดค่อยหักจากเงินโอน
        // (POS ตอนนี้หักเงินทอนก่อนบันทึกแล้ว ดู POST /transactions) · บิลส่งมอบมัดจำ: ยอดที่ต้องเก็บ = ยอดบิล − มัดจำ
        const due = Math.max(0, total - completeApplied);
        const change = round2(cash + transfer - due);
        if (change > 0) {
            const fromCash = Math.min(cash, change);
            cash -= fromCash;
            transfer = Math.max(0, transfer - (change - fromCash));
        }
    }

    const ev = [];
    const add = (key, amount, opts) => ev.push({ item_key: key, amount, ...(opts || {}) });

    if (isFinance) {
        add('sale_device_finance', devicesTotal);
        add('sale_down_payment', num(t.down_payment));
    } else {
        add('sale_device_cash', devicesTotal);
    }
    add('sale_accessory', accessoryTotal);
    add('sale_contract_fee', contractFee);
    add('sale_icloud_fee', icloudFee);
    add('sale_discount', discount);
    add('sale_gift', sum(gifts.map(lineCost)));
    add('sale_cogs', sum([...devices, ...accessories].map(lineCost)));
    add('sale_receive_cash', cash);
    add('sale_receive_transfer', transfer);
    add('deposit_applied', posApplied + completeApplied);
    add('deposit_excess_income', excess);

    if (isFinance) {
        const receivable = receivableByTxn.get(String(t._id)) || null;
        if (!(receivable && receivable.status === 'ยกเลิก')) {
            // finance_company เก็บได้ทั้ง _id และชื่อที่พนักงานพิมพ์เอง — หาแบบ id ก่อนแล้วค่อยเทียบชื่อ (เหมือนหน้าตรวจสอบออเดอร์)
            const fcDoc = t.finance_company
                ? (md.maps.financeCompanies.get(String(t.finance_company)) ||
                    md.lists.financeCompanies.find(c => c.name === t.finance_company) || null)
                : null;
            const sheetDevices = devices.map(l => ({ product_name: l.product_name, type_id: l.typeId, price: l.price, quantity: l.quantity }));
            const sheet = helpers.buildOrderFinanceSheet(t, sheetDevices, fcDoc, receivable);
            const paid = helpers.resolvePaymentStatus(t, receivable) === 'ชำระแล้ว';
            const settledAt = (receivable && receivable.settled_at) || t.finance_paid_at || t.payment_status_updated_at || date;
            if (paid) {
                add('finance_settle', sheet.credit_amount, { date: settledAt });
                add('finance_commission', sheet.commission, { date: settledAt, flow: 'in' });
            } else {
                add('finance_receivable', sheet.credit_amount);
                add('finance_commission', sheet.commission, { flow: 'receivable' });
            }
        }
    }

    out.events = finish(ev, date, out.ref); // รายการที่ไม่ได้ระบุวันที่เอง ใช้วันที่ขาย
    return out;
}

function buildDepositEvents(d) {
    const date = d.createdAt || d.created_at || new Date();
    const ev = [{ item_key: 'deposit_receive', amount: num(d.deposit_amount), date }];
    if (d.status === 'ยกเลิก') ev.push({ item_key: 'deposit_refund', amount: num(d.deposit_amount), date: d.cancelled_at || d.updatedAt || date });
    if (d.status === 'ยึดมัดจำ') ev.push({ item_key: 'deposit_forfeit', amount: num(d.deposit_amount), date: d.forfeited_at || d.updatedAt || date });
    return { events: finish(ev, date), branch_id: d.branch_id || null, ref: d.deposit_number || '' };
}

function buildClaimEvents(c) {
    const date = c.createdAt || new Date();
    const cost = num(c.total_cost);
    // ตอนส่งเคลมสินค้าถูกตัดออกจากสต็อกแล้ว (ทุกสถานะ) — คู่กับยอดเข้าของ "ได้รับสินค้าทดแทน" / "คืนเข้าสต็อก" ตอนปิดเคลม
    const ev = [{ item_key: 'claim_stock_out', amount: cost, date }];
    if (c.status === 'ส่งเคลมแล้ว') {
        ev.push({ item_key: 'claim_send', amount: cost, date });
    } else if (c.status === 'ปิดเคลม') {
        const r = c.resolution || {};
        const closedAt = c.closed_at || c.updatedAt || date;
        ev.push({ item_key: 'claim_cash', amount: num(r.cash_amount), date: r.received_date || closedAt });
        // ส่วนลดที่ถูกนำไปหักใบสั่งซื้อแล้ว (applied_po_number) ไปนับที่ po_discount ของใบสั่งซื้อนั้นแทน — ไม่นับซ้ำสองรอบ
        ev.push({ item_key: 'claim_discount', amount: r.applied_po_number ? 0 : num(r.discount_amount), date: closedAt });
        if (Array.isArray(r.received_items) && r.received_items.length > 0) {
            // มูลค่าของที่ได้รับกลับ (ต้นทุนเดิม): เครื่อง = จับคู่ด้วย IMEI เดิม · อุปกรณ์เสริม = ต้นทุนต่อชิ้น × จำนวนที่ได้รับ (รับไม่ครบก็ได้)
            const costByImei = new Map((c.items || []).filter(i => i.imei).map(i => [i.imei, num(i.cost_price)]));
            const costByProduct = new Map((c.items || []).map(i => [String(i.product_id), num(i.cost_price)]));
            const received = sum(r.received_items.map(x => x.original_imei
                ? (costByImei.get(x.original_imei) || 0)
                : (costByProduct.get(String(x.product_id)) || 0) * (Number(x.quantity) || 1)));
            ev.push({ item_key: 'claim_goods', amount: received > 0 ? received : cost, date: closedAt });
        }
    } else if (c.status === 'ปฏิเสธ') {
        ev.push({ item_key: c.returned_to_stock ? 'claim_reject_restock' : 'claim_reject_writeoff', amount: cost, date: c.closed_at || c.updatedAt || date });
    }
    return { events: finish(ev, date, c.claim_no), branch_id: c.branch_id || null, ref: c.claim_no || '' };
}

// ใบจ่ายออก: นับเฉพาะของที่ไม่ได้ไปเป็นใบเคลม (ของที่ส่งเคลมนับที่ใบเคลม ห้ามนับซ้ำ)
//  - claim_type 'loss' = ขาดทุน
//  - ใบรุ่นเก่าที่ไม่ได้ระบุประเภทและไม่มีใบเคลมเลย = "จ่ายออกไม่ระบุประเภท" (ถ้ามีใบเคลมแล้ว ของในใบนั้นนับที่ใบเคลม)
function buildStockIssueEvents(s, ctx) {
    const lineCost = (i) => num(i.cost_price) * (Number(i.quantity) || 1);
    const items = s.items || [];
    const loss = sum(items.filter(i => i.claim_type === 'loss').map(lineCost));
    const hasClaim = !!(ctx && ctx.issueIdsWithClaim && ctx.issueIdsWithClaim.has(String(s._id)));
    const untyped = hasClaim ? 0 : sum(items.filter(i => !i.claim_type).map(lineCost));
    const date = s.createdAt || new Date();
    const ev = [{ item_key: 'stock_loss', amount: loss, date }, { item_key: 'stock_issue_untyped', amount: untyped, date }];
    return { events: finish(ev, date, s.issue_no), branch_id: s.branch_id || null, ref: s.issue_no || '' };
}

// ใบสั่งซื้อ — ต้นทุนรับเข้าคิดจากจำนวนที่นำเข้าสต็อกแล้ว · ค้างจ่ายใช้นิยามเดียวกับ GET /accounting/ap-summary (ต้นทุนตามจำนวนสั่ง − จ่ายแล้ว − ส่วนลด)
function buildPurchaseOrderEvents(po, ctx) {
    const date = po.createdAt || new Date();
    const out = { events: [], branch_id: po.branch_id || null, ref: po.po_number || '' };
    if (po.status === 'ยกเลิก') return out;
    const items = po.items || [];
    const orderedCost = sum(items.map(i => num(i.cost_price) * num(i.ordered_qty)));
    const importedCost = sum(items.map(i => {
        const qty = i.track_imei ? (i.imported_imeis ? i.imported_imeis.length : 0) : num(i.imported_qty);
        return num(i.cost_price) * qty;
    }));
    const paid = num(po.paid_amount);
    const discount = num(po.discount);
    const payDate = po.paid_at || po.updatedAt || date;
    const receiveDate = (ctx && ctx.receiveDateByPo && ctx.receiveDateByPo.get(po.po_number)) || po.arrival_reported_at || date;
    const ev = [
        { item_key: 'po_receive', amount: importedCost, date: receiveDate },
        { item_key: 'po_pay', amount: paid, date: payDate },
        { item_key: 'po_discount', amount: discount, date: payDate },
        // จ่ายก่อนของเข้า: เงินที่จ่ายไปเกินมูลค่าที่นำเข้าแล้ว = ค่าสินค้าจ่ายล่วงหน้า (ลดลงเองเมื่อรับสินค้าเข้า)
        { item_key: 'po_prepaid', amount: Math.max(0, round2(paid - importedCost)), date: payDate }
    ];
    if (po.payment_status !== 'ชำระเงินแล้ว') ev.push({ item_key: 'ap_trade', amount: round2(orderedCost - paid - discount), date });
    out.events = finish(ev, date, po.po_number);
    return out;
}

function buildImportNotificationEvents(n, ctx) {
    const date = n.approved_at || n.updatedAt || new Date();
    const out = { events: [], branch_id: n.branch_id || null, ref: n.product_name || '' };
    if (n.status !== 'อนุมัติแล้ว') return out;
    // ใบที่อนุมัติก่อนเริ่มเก็บราคาลงใบแจ้ง: ราคาที่อนุมัติจริงอยู่ในบันทึกกิจกรรม (AuditLog.details.cost_price)
    const cost = n.cost_price != null ? n.cost_price : (ctx && ctx.approvedCost ? ctx.approvedCost.get(String(n._id)) : null);
    if (cost == null) return out;
    const qty = (n.imeis && n.imeis.length) || 1;
    out.events = finish([{ item_key: 'receive_no_po', amount: num(cost) * qty, date }], date);
    return out;
}

function buildExpenseEvents(e) {
    const key = e.category === 'ทำใบสัญญา' ? 'exp_contract_prep' : 'exp_other_order';
    const date = e.expense_date || e.createdAt || new Date();
    return { events: finish([{ item_key: key, amount: num(e.amount), date }], date), branch_id: e.branch_id || null, ref: e.expense_number || '' };
}

// CashMovement ที่เป็นค่าใช้จ่ายจากหน้า "ระบบบัญชีและการเงิน" — หมวด 'อื่นๆ' ที่มี reference_id คือใบสำคัญจ่าย (นับที่ใบสำคัญจ่ายแล้ว ห้ามนับซ้ำ)
// ข้ามเฉพาะเมื่อใบสำคัญจ่ายนั้นยังมีอยู่จริง — ใบถูกลบไปแล้วแต่เงินออกยังค้าง ต้องนับที่นี่ ไม่งั้นยอดหายจากทุกรหัส (แต่ P&L เดิมยังนับ)
// ไม่มีสาขา (CashMovement ไม่ได้เก็บ) — หน้ายอดเข้า-ออกกรองได้ด้วยตัวเลือก "ไม่ระบุสาขา"
const CASH_EXPENSE_ITEM = { 'ค่าเช่า': 'exp_rent', 'ค่าไฟ/น้ำ': 'exp_utilities', 'เงินเดือน': 'exp_salary', 'อื่นๆ': 'exp_other_accounting' };
function buildCashMovementEvents(m, ctx) {
    const out = { events: [], branch_id: null, ref: m.transaction_id || '' };
    if (m.type !== 'รายจ่าย') return out;
    const key = CASH_EXPENSE_ITEM[m.category];
    if (!key) return out;
    if (m.category === 'อื่นๆ' && m.reference_id && ctx && ctx.voucherIds && ctx.voucherIds.has(String(m.reference_id))) return out;
    const date = m.created_at || m.createdAt || new Date();
    out.events = finish([{ item_key: key, amount: num(m.amount), date }], date, out.ref);
    return out;
}

function buildVoucherEvents(v) {
    const date = v.payment_date || v.createdAt || new Date();
    return { events: finish([{ item_key: 'disbursement', amount: num(v.net_amount) + num(v.vat_amount), date }], date), branch_id: v.branch_id || null, ref: v.voucher_no || '' };
}

function buildOtherEntryEvents(o) {
    const date = o.entry_date || o.createdAt || new Date();
    const key = o.kind === 'income' ? 'other_income' : 'other_expense';
    // รหัสบัญชีที่เลือกตอนบันทึกเป็นตัวกำหนดว่ายอดไปลงรหัสไหน
    return { events: finish([{ item_key: key, amount: num(o.amount), date, account_id: o.account_id }], date), branch_id: o.branch_id || null, ref: o.source || '' };
}

// ---------------------------------------------------------------------------------------------
// ตัวโหลดข้อมูลประกอบ (batch — ห้าม query ใน loop ตามกติกา performance ของโปรเจกต์)
// ---------------------------------------------------------------------------------------------
async function loadTransactionContext(txns) {
    const productIds = [...new Set(txns.flatMap(t => (t.items || []).map(i => i.product_id).filter(Boolean).map(String)))];
    const txnIds = txns.map(t => t._id);
    const receipts = txns.map(t => t.receipt_number).filter(Boolean);
    const [md, products, receivables, deposits] = await Promise.all([
        mdCache.get(),
        productIds.length ? Product.find({ _id: { $in: productIds } }).select('type_id unit_id cost_price').lean() : [],
        txnIds.length ? FinanceReceivable.find({ transaction_id: { $in: txnIds } }).lean() : [],
        receipts.length ? Deposit.find({ bill_number: { $in: receipts } }).select('bill_number deposit_amount cash_amount transfer_amount').lean() : []
    ]);
    return {
        md,
        helpers: getHelpers(),
        productById: new Map(products.map(p => [String(p._id), p])),
        receivableByTxn: new Map(receivables.map(r => [String(r.transaction_id), r])),
        depositByBill: new Map(deposits.map(d => [d.bill_number, d]))
    };
}

async function loadPurchaseOrderContext(pos) {
    const numbers = pos.map(p => p.po_number).filter(Boolean);
    const rows = numbers.length
        ? await Movement.aggregate([
            { $match: { action: 'นำเข้าสินค้า (PO)', reference_no: { $in: numbers } } },
            { $group: { _id: '$reference_no', last: { $max: '$created_at' } } }
        ])
        : [];
    return { receiveDateByPo: new Map(rows.map(r => [r._id, r.last])) };
}

async function loadImportNotificationContext(notes) {
    const missing = notes.filter(n => n.status === 'อนุมัติแล้ว' && n.cost_price == null).map(n => String(n._id));
    const logs = missing.length
        ? await AuditLog.find({ action: 'APPROVE', module: 'STOCK', target_id: { $in: missing } }).select('target_id details').lean()
        : [];
    const approvedCost = new Map();
    logs.forEach(l => {
        if (l.details && l.details.cost_price != null && Number.isFinite(Number(l.details.cost_price))) {
            approvedCost.set(String(l.target_id), Number(l.details.cost_price));
        }
    });
    return { approvedCost };
}

// ใบจ่ายออกที่มีใบเคลมผูกอยู่ (ของในใบนั้นนับที่ใบเคลม)
async function loadStockIssueContext(issues) {
    const ids = issues.map(s => s._id);
    const withClaim = ids.length ? await Claim.distinct('issue_id', { issue_id: { $in: ids } }) : [];
    return { issueIdsWithClaim: new Set(withClaim.map(String)) };
}

// ใบสำคัญจ่ายที่ยังมีอยู่ของ CashMovement หมวด 'อื่นๆ' ที่อ้างถึง
async function loadCashMovementContext(moves) {
    const refs = moves.filter(m => m.category === 'อื่นๆ' && m.reference_id).map(m => m.reference_id);
    const found = refs.length ? await DisbursementVoucher.find({ _id: { $in: refs } }).select('_id').lean() : [];
    return { voucherIds: new Set(found.map(v => String(v._id))) };
}

// ชนิดเอกสารต้นทางทั้งหมด: model, ตัวกรอง (ถ้ามี), ตัวโหลดประกอบ, ตัวสร้างยอด
const SOURCES = {
    transaction: { model: Transaction, ctx: loadTransactionContext, build: buildTransactionEvents },
    deposit: { model: Deposit, build: buildDepositEvents },
    claim: { model: Claim, build: buildClaimEvents },
    stock_issue: { model: StockIssue, ctx: loadStockIssueContext, build: buildStockIssueEvents },
    purchase_order: { model: PurchaseOrder, ctx: loadPurchaseOrderContext, build: buildPurchaseOrderEvents },
    import_notification: { model: ImportNotification, ctx: loadImportNotificationContext, build: buildImportNotificationEvents },
    expense: { model: Expense, build: buildExpenseEvents },
    cash_movement: { model: CashMovement, filter: { type: 'รายจ่าย' }, ctx: loadCashMovementContext, build: buildCashMovementEvents },
    voucher: { model: DisbursementVoucher, build: buildVoucherEvents },
    other_entry: { model: OtherEntry, build: buildOtherEntryEvents }
};

// ---------------------------------------------------------------------------------------------
// เขียนลง DB
// ---------------------------------------------------------------------------------------------
function opsFor(sourceType, sourceId, built) {
    const ops = [];
    const keys = [];
    for (const e of built.events) {
        keys.push(e.item_key);
        ops.push({
            updateOne: {
                filter: { source_type: sourceType, source_id: sourceId, item_key: e.item_key },
                update: { $set: { flow: e.flow, amount: e.amount, event_date: e.date, branch_id: built.branch_id || null, account_id: e.account_id || null, source_ref: built.ref || '' } },
                upsert: true
            }
        });
    }
    // ลบยอดของรายการที่เอกสารนี้ไม่มีแล้ว (เช่น ยกเลิกบิล → keys ว่าง → ลบทั้งหมดของเอกสารนี้)
    ops.push({ deleteMany: { filter: { source_type: sourceType, source_id: sourceId, item_key: { $nin: keys } } } });
    return ops;
}

// ยอดที่บันทึกไว้แล้วของเอกสารชุดหนึ่ง: Map(String(source_id) -> Map(item_key -> event))
async function loadSavedEvents(sourceType, ids) {
    const byDoc = new Map();
    if (!ids.length) return byDoc;
    const rows = await AccountItemEvent.find({ source_type: sourceType, source_id: { $in: ids } })
        .select('source_id item_key flow amount branch_id account_id source_ref').lean();
    for (const r of rows) {
        const k = String(r.source_id);
        if (!byDoc.has(k)) byDoc.set(k, new Map());
        byDoc.get(k).set(r.item_key, r);
    }
    return byDoc;
}

// จำนวนยอดของเอกสารใบหนึ่งที่ยังไม่ได้บันทึก หรือไม่ตรงกับที่คำนวณได้ตอนนี้ (รวมยอดที่ต้องลบทิ้ง)
// ไม่เทียบวันที่: เอกสารที่ไม่มีวันที่เลยจะได้วันที่ "ตอนนี้" ทุกครั้ง ทำให้ค้างเป็นรายการรอบันทึกตลอด
function countPending(savedMap, built) {
    const saved = savedMap || new Map();
    const same = (a, b) => String(a || '') === String(b || '');
    let n = 0;
    const keys = new Set();
    for (const e of built.events) {
        keys.add(e.item_key);
        const s = saved.get(e.item_key);
        if (!s || s.flow !== e.flow || round2(s.amount) !== round2(e.amount) ||
            !same(s.branch_id, built.branch_id) || !same(s.account_id, e.account_id) || !same(s.source_ref, built.ref)) n += 1;
    }
    for (const k of saved.keys()) if (!keys.has(k)) n += 1;
    return n;
}

async function buildForDocs(sourceType, docs) {
    const src = SOURCES[sourceType];
    const ctx = src.ctx ? await src.ctx(docs) : null;
    return docs.map(d => ({ id: d._id, built: src.build(d, ctx) }));
}

// เอกสารใบเดียวกันสั่งคำนวณซ้อนกันได้ (เช่น บันทึกบิลแล้วแก้ทันที) · ถ้าปล่อยวิ่งขนานกัน ตัวที่อ่านข้อมูลเก่าอาจเขียนทับผลใหม่
// หรือชน unique index ตอน upsert พร้อมกัน → ต่อคิวต่อเอกสาร: ระหว่างรอบที่กำลังวิ่งมีคำสั่งใหม่เข้ามา ให้วิ่งซ้ำอีกรอบเดียวหลังจบ (อ่านข้อมูลล่าสุดเสมอ)
const refreshInFlight = new Map(); // `${sourceType}:${id}` -> { promise, dirty }

// rebuildAll อ่านเอกสารเป็นก้อนแล้วเขียนทีหลัง — ระหว่างนั้นถ้ามี refresh ของเอกสารใบเดียวกัน (เช่นยกเลิกบิล) ผลของ rebuild จะเก่ากว่า
// จึงจดคีย์ที่ถูก refresh ระหว่าง rebuild ไว้ แล้วคำนวณใบเหล่านั้นซ้ำหลังเขียนก้อน (null = ไม่มี rebuild กำลังวิ่ง)
let rebuildTouched = null;

function refreshSource(sourceType, id) {
    if (!id) return Promise.resolve({ ok: false, reason: 'bad_args' });
    const key = `${sourceType}:${id}`;
    if (rebuildTouched) rebuildTouched.add(key);
    const running = refreshInFlight.get(key);
    if (running) {
        running.dirty = true;
        return running.promise;
    }
    const entry = { dirty: false, promise: null };
    entry.promise = (async () => {
        try {
            let result = await refreshSourceOnce(sourceType, id);
            while (entry.dirty) {
                entry.dirty = false;
                result = await refreshSourceOnce(sourceType, id);
            }
            return result;
        } finally {
            refreshInFlight.delete(key);
        }
    })();
    refreshInFlight.set(key, entry);
    return entry.promise;
}

// ทำให้ยอดของเอกสารหนึ่งใบตรงกับสถานะปัจจุบัน · ไม่ throw
async function refreshSourceOnce(sourceType, id) {
    try {
        const src = SOURCES[sourceType];
        if (!src || !id) return { ok: false, reason: 'bad_args' };
        const doc = await src.model.findById(id).lean();
        if (!doc) {
            await AccountItemEvent.deleteMany({ source_type: sourceType, source_id: id }); // เอกสารถูกลบแล้ว
            return { ok: true, removed: true };
        }
        const [{ built }] = await buildForDocs(sourceType, [doc]);
        await AccountItemEvent.bulkWrite(opsFor(sourceType, doc._id, built), { ordered: false });
        return { ok: true, events: built.events.length };
    } catch (err) {
        console.error(`[accountEntries] refresh ${sourceType}/${id} ล้มเหลว:`, err.message);
        return { ok: false, reason: 'error', message: err.message };
    }
}

// สั่งคำนวณใหม่แบบไม่รอ (fire-and-forget) — ใช้ในเส้นทางที่ผู้ใช้รอผลอยู่ เช่น POS ไม่ให้หน่วง
function queueRefresh(sourceType, id) {
    if (!id) return;
    refreshSource(sourceType, id).catch(() => { /* refreshSource ไม่ throw อยู่แล้ว */ });
}

// บันทึกย้อนหลัง/คำนวณใหม่ทั้งหมด — dryRun=true นับอย่างเดียวไม่เขียน
// กันรันซ้อน: กดซ้ำ/cron ชนกับกดมือจะได้ error แทนที่จะวิ่งขนานกันสองงาน
let rebuildRunning = false;

async function rebuildAll(opts = {}) {
    if (rebuildRunning) {
        const err = new Error('กำลังบันทึกยอดย้อนหลังอยู่ กรุณารอให้เสร็จก่อน');
        err.code = 'REBUILD_BUSY';
        throw err;
    }
    rebuildRunning = true;
    rebuildTouched = new Set();
    try {
        return await rebuildAllUnlocked(opts);
    } finally {
        rebuildRunning = false;
        rebuildTouched = null;
    }
}

async function rebuildAllUnlocked({ dryRun = true, types = null, batchSize = 200 } = {}) {
    const summary = { dryRun, types: {}, items: {} };
    const wanted = Object.keys(SOURCES).filter(t => !types || types.includes(t));
    for (const sourceType of wanted) {
        const src = SOURCES[sourceType];
        // pending_* = ส่วนที่ยังไม่ได้บันทึก/ไม่ตรงกับที่บันทึกไว้ (ใช้แสดงในหน้าต่างยืนยัน)
        const stat = { sources: 0, events: 0, pending_sources: 0, pending_events: 0 };
        let batch = [];
        const flush = async () => {
            if (!batch.length) return;
            const flushed = batch;
            const built = await buildForDocs(sourceType, batch);
            const ops = [];
            const saved = dryRun ? await loadSavedEvents(sourceType, built.map(x => x.id)) : new Map();
            for (const { id, built: b } of built) {
                stat.sources += 1;
                stat.events += b.events.length;
                const pending = dryRun ? countPending(saved.get(String(id)), b) : 0;
                if (pending > 0) { stat.pending_sources += 1; stat.pending_events += pending; }
                b.events.forEach(e => {
                    const cur = summary.items[e.item_key] || { count: 0, amount: 0 };
                    cur.count += 1; cur.amount = round2(cur.amount + e.amount);
                    summary.items[e.item_key] = cur;
                });
                if (!dryRun) ops.push(...opsFor(sourceType, id, b));
            }
            if (!dryRun && ops.length) await AccountItemEvent.bulkWrite(ops, { ordered: false });
            batch = [];
            if (!dryRun) {
                // ใบที่ถูก refresh ระหว่างที่ก้อนนี้อ่าน/คำนวณ/เขียน → ผลที่เพิ่งเขียนอาจเก่ากว่า ให้คำนวณซ้ำจากข้อมูลล่าสุด
                const again = flushed.filter(d => rebuildTouched.has(`${sourceType}:${d._id}`));
                for (const d of again) await refreshSource(sourceType, d._id);
            }
        };
        const cursor = src.model.find(src.filter || {}).lean().cursor();
        for await (const doc of cursor) {
            if (batch.length === 0 && rebuildTouched) rebuildTouched.clear(); // เริ่มก้อนใหม่ → นับ refresh ตั้งแต่ตอนนี้
            batch.push(doc);
            if (batch.length >= batchSize) await flush();
        }
        await flush();
        {
            // เอกสารต้นทางที่ถูกลบไปแล้ว — ยอดค้างของมันต้องหายด้วย
            // ลบเฉพาะ id ที่ "ตรวจแล้วว่าไม่มีในต้นทาง (ตามตัวกรองของชนิดนี้)" จริง ไม่ใช้รายการที่ไล่เจอตอนเริ่ม
            // เพราะเอกสารที่สร้างระหว่างที่ rebuild วิ่งอยู่ไม่อยู่ในรายการนั้น และห้ามถูกลบยอดทิ้ง
            const eventSourceIds = await AccountItemEvent.distinct('source_id', { source_type: sourceType });
            for (let i = 0; i < eventSourceIds.length; i += 1000) {
                const chunk = eventSourceIds.slice(i, i + 1000);
                const existing = await src.model.find({ ...(src.filter || {}), _id: { $in: chunk } }).select('_id').lean();
                const existingSet = new Set(existing.map(d => String(d._id)));
                const stale = chunk.filter(id => !existingSet.has(String(id)));
                if (!stale.length) continue;
                if (dryRun) {
                    // dry-run: นับยอดค้างที่จะถูกลบเป็น "ที่ต้องบันทึก" แต่ไม่ลบจริง
                    stat.pending_sources += stale.length;
                    stat.pending_events += await AccountItemEvent.countDocuments({ source_type: sourceType, source_id: { $in: stale } });
                } else {
                    await AccountItemEvent.deleteMany({ source_type: sourceType, source_id: { $in: stale } });
                }
            }
        }
        summary.types[sourceType] = stat;
    }
    return summary;
}

// ---------------------------------------------------------------------------------------------
// อ่านยอด
// ---------------------------------------------------------------------------------------------
// ขอบวันตามเวลาไทยเสมอ (+07:00) ไม่ขึ้นกับเขตเวลาของเครื่องเซิร์ฟเวอร์ — ถ้าเซิร์ฟเวอร์ตั้ง UTC รายการ 00:00–06:59 จะได้ไม่ตกไปอีกวัน
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BRANCH_NONE = 'NONE'; // ยอดที่ไม่มีสาขา (เช่น ค่าใช้จ่ายจากหน้า "ระบบบัญชีและการเงิน") — รวมทุกสาขา + ไม่ระบุสาขา = ทั้งหมด
function eventFilter({ startDate, endDate, branchId }) {
    const match = {};
    const start = DAY_RE.test(startDate || '') ? new Date(startDate + 'T00:00:00.000+07:00') : null;
    const end = DAY_RE.test(endDate || '') ? new Date(endDate + 'T23:59:59.999+07:00') : null;
    if (start || end) {
        match.event_date = {};
        if (start) match.event_date.$gte = start;
        if (end) match.event_date.$lte = end;
    }
    if (branchId === BRANCH_NONE) {
        match.branch_id = null;
    } else if (branchId && branchId !== 'ALL' && mongoose.isValidObjectId(branchId)) {
        match.branch_id = new mongoose.Types.ObjectId(branchId); // aggregate ไม่ cast ให้เอง ต้องแปลงเป็น ObjectId
    }
    return match;
}

// ยอดต่อรหัสบัญชี: รวมยอดของทุกรายการที่เชื่อมกับรหัสนั้น "เต็มจำนวน" (รายการเดียวเชื่อมหลายรหัส → ลงทุกรหัสเต็มจำนวน)
async function getAccountSummary(filter) {
    const [rows, links, accounts] = await Promise.all([
        AccountItemEvent.aggregate([
            { $match: eventFilter(filter) },
            { $group: { _id: { item_key: '$item_key', flow: '$flow', account_id: '$account_id' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        AccountItemLink.find().select('account_id item_key').lean(),
        AccountChart.find().select('account_code account_name is_active category_id').sort({ account_code: 1 }).lean()
    ]);

    const totalsByItem = new Map(); // item_key -> [{ flow, amount, count }]
    const directByAccount = new Map(); // account_id -> [{ key, flow, amount, count }] ยอดที่เอกสารระบุรหัสบัญชีเอง
    rows.forEach(r => {
        if (!ACCOUNT_ITEM_KEYS.has(r._id.item_key)) return;
        if (r._id.account_id) {
            const id = String(r._id.account_id);
            if (!directByAccount.has(id)) directByAccount.set(id, []);
            directByAccount.get(id).push({ key: r._id.item_key, flow: r._id.flow, amount: round2(r.amount), count: r.count });
            return;
        }
        if (!totalsByItem.has(r._id.item_key)) totalsByItem.set(r._id.item_key, []);
        totalsByItem.get(r._id.item_key).push({ flow: r._id.flow, amount: round2(r.amount), count: r.count });
    });

    const keysByAccount = new Map();
    const linkedKeys = new Set();
    const accountIds = new Set(accounts.map(a => String(a._id)));
    const linkCountByKey = new Map();
    links.forEach(l => {
        if (!ACCOUNT_ITEM_KEYS.has(l.item_key)) return;
        const id = String(l.account_id);
        if (!accountIds.has(id)) return; // ลิงก์ค้างไปรหัสที่ถูกลบแล้ว — ไม่นับว่าเชื่อม ยอดจะไปโผล่ที่ "ยังไม่เชื่อม" แทนการหายเงียบ
        linkCountByKey.set(l.item_key, (linkCountByKey.get(l.item_key) || 0) + 1);
        if (!keysByAccount.has(id)) keysByAccount.set(id, []);
        keysByAccount.get(id).push(l.item_key);
        linkedKeys.add(l.item_key);
    });

    const itemRow = (key, t) => {
        const item = ACCOUNT_ITEM_BY_KEY.get(key);
        return { key, name: item.name, group: item.group, flow: t.flow, flow_label: ACCOUNT_FLOW_LABELS[t.flow], amount: t.amount, count: t.count };
    };

    const result = [];
    accounts.forEach(a => {
        const keys = keysByAccount.get(String(a._id)) || [];
        const direct = directByAccount.get(String(a._id)) || [];
        if (!keys.length && !direct.length) return;
        const acc = { _id: a._id, account_code: a.account_code, account_name: a.account_name, category_id: a.category_id || null, is_active: a.is_active !== false, in: 0, out: 0, receivable: 0, payable: 0, items: [] };
        keys.forEach(k => (totalsByItem.get(k) || []).forEach(t => {
            acc[t.flow] = round2(acc[t.flow] + t.amount);
            acc.items.push(itemRow(k, t));
        }));
        direct.forEach(t => {
            acc[t.flow] = round2(acc[t.flow] + t.amount);
            acc.items.push({ ...itemRow(t.key, t), direct: true }); // ลงรหัสนี้ตรงๆ ย้าย/เชื่อมใหม่ไม่ได้
        });
        acc.net = round2(acc.in - acc.out);
        result.push(acc);
    });

    const unlinked = [];
    totalsByItem.forEach((list, key) => { if (!linkedKeys.has(key)) list.forEach(t => unlinked.push(itemRow(key, t))); });
    // ยอดที่เอกสารระบุรหัสเองแต่รหัสนั้นถูกลบไปแล้ว — ย้ายด้วยลิงก์ไม่ได้ (ต้องแก้ที่เอกสาร) แต่ต้องเห็นยอด
    directByAccount.forEach((list, id) => {
        if (!accountIds.has(id)) list.forEach(t => unlinked.push({ ...itemRow(t.key, t), direct: true, missing_account: true }));
    });
    unlinked.sort((a, b) => b.amount - a.amount);

    // รายการที่เชื่อมมากกว่า 1 รหัส: ยอดลงทุกรหัสเต็มจำนวน หน้าเว็บต้องเตือนว่ารวมข้ามรหัสแล้วนับซ้ำ
    const multi_linked = [...linkCountByKey].filter(([, n]) => n > 1)
        .map(([key, n]) => ({ key, name: ACCOUNT_ITEM_BY_KEY.get(key).name, accounts: n }));

    return { accounts: result, unlinked, multi_linked };
}

// รายการในบิลจัดไฟแนนซ์ที่ควรโชว์ว่าเป็นไฟแนนซ์ไหน (นอกเหนือจาก finance_*)
const FINANCE_BILL_ITEMS = new Set(['sale_device_finance', 'sale_down_payment', 'sale_contract_fee', 'sale_icloud_fee']);

// รายการย่อยของรหัสบัญชีหนึ่งตัว (ไล่จากใหม่ไปเก่า) — คืน { entries, truncated }
// truncated = มีรายการมากกว่าที่ส่งกลับ (ดึงเกินมา 1 แถวเพื่อรู้แน่ ไม่เดาจากจำนวนที่เท่ากับ limit)
async function getAccountEntries(accountId, filter, limit = 300) {
    const max = Math.min(Math.max(Number(limit) || 300, 1), 1000);
    const links = await AccountItemLink.find({ account_id: accountId }).select('item_key').lean();
    const keys = links.map(l => l.item_key).filter(k => ACCOUNT_ITEM_KEYS.has(k));
    const fetched = await AccountItemEvent.find({
        ...eventFilter(filter),
        $or: [{ item_key: { $in: keys }, account_id: null }, { account_id: accountId }]
    })
        .sort({ event_date: -1 })
        .limit(max + 1)
        .lean();
    const truncated = fetched.length > max;
    const events = truncated ? fetched.slice(0, max) : fetched;
    const partyNames = await loadPartyNames(events);

    const productNames = await loadProductNames(events);

    const entries = events.map(e => toEntry(e, partyNames, productNames));
    return { entries, truncated };
}

// ชื่อสินค้าของแต่ละเอกสาร — คืน Map source_id -> ชื่อสินค้า (หลายชิ้นคั่นด้วย ", ")
async function loadProductNames(events) {
    const idsOf = (type) => [...new Set(events.filter(e => e.source_type === type).map(e => String(e.source_id)))];
    const joinNames = (items) => [...new Set((items || []).map(i => i && i.product_name).filter(Boolean))].join(', ');
    const sources = [
        ['transaction', Transaction], ['purchase_order', PurchaseOrder], ['claim', Claim], ['stock_issue', StockIssue]
    ];
    const names = new Map();
    await Promise.all(sources.map(async ([type, Model]) => {
        const ids = idsOf(type);
        if (!ids.length) return;
        const docs = await Model.find({ _id: { $in: ids } }).select('items.product_name').lean();
        docs.forEach(d => names.set(String(d._id), joinNames(d.items)));
    }));
    const depositIds = idsOf('deposit');
    if (depositIds.length) {
        const deps = await Deposit.find({ _id: { $in: depositIds } }).select('product_name').lean();
        deps.forEach(d => names.set(String(d._id), d.product_name || ''));
    }
    return names;
}

// ชื่อไฟแนนซ์/ซัพของแต่ละรายการ — คืน Map source_id -> ชื่อ
async function loadPartyNames(events) {
    // ชื่อไฟแนนซ์ของบิล: finance_company เก็บได้ทั้ง _id และชื่อที่พนักงานพิมพ์เอง จึงหาแบบ id ก่อนแล้วค่อยเทียบชื่อ
    const financeTxnIds = [...new Set(events
        .filter(e => e.source_type === 'transaction' && (e.item_key.startsWith('finance_') || FINANCE_BILL_ITEMS.has(e.item_key)))
        .map(e => String(e.source_id)))];
    const financeNameByTxn = new Map();
    // ชื่อซัพของใบเคลม: ใบเคลมเก็บ supplier_name ไว้ตอนส่งเคลมอยู่แล้ว
    const supplierNameBySource = new Map();
    const idsOf = (type) => [...new Set(events.filter(e => e.source_type === type).map(e => String(e.source_id)))];
    const claimIds = idsOf('claim');
    const poIds = idsOf('purchase_order');
    const [claims, pos] = await Promise.all([
        claimIds.length ? Claim.find({ _id: { $in: claimIds } }).select('supplier_name').lean() : [],
        poIds.length ? PurchaseOrder.find({ _id: { $in: poIds } }).select('supplier_name').lean() : []
    ]);
    // ใบสั่งซื้อก็เก็บ supplier_name ไว้เอง — ใช้ map เดียวกัน (source_id ไม่ซ้ำข้ามชนิดเอกสาร)
    [...claims, ...pos].forEach(d => { if (d.supplier_name) supplierNameBySource.set(String(d._id), d.supplier_name); });
    if (financeTxnIds.length) {
        const [md, txns] = await Promise.all([
            mdCache.get(),
            Transaction.find({ _id: { $in: financeTxnIds } }).select('finance_company').lean()
        ]);
        txns.forEach(t => {
            if (!t.finance_company) return;
            const fc = md.maps.financeCompanies.get(String(t.finance_company)) ||
                md.lists.financeCompanies.find(c => c.name === t.finance_company);
            financeNameByTxn.set(String(t._id), fc ? fc.name : String(t.finance_company));
        });
    }

    const names = new Map();
    events.forEach(e => {
        const id = String(e.source_id);
        names.set(id, financeNameByTxn.get(id) || supplierNameBySource.get(id) || '');
    });
    return names;
}

function toEntry(e, partyNames, productNames = new Map()) {
    const item = ACCOUNT_ITEM_BY_KEY.get(e.item_key);
    return {
        _id: e._id,
        date: e.event_date,
        item_key: e.item_key,
        item_name: item ? item.name : e.item_key,
        flow: e.flow,
        flow_label: ACCOUNT_FLOW_LABELS[e.flow],
        amount: e.amount,
        source_type: e.source_type,
        source_ref: e.source_ref,
        branch_id: e.branch_id,
        party_name: partyNames.get(String(e.source_id)) || '',
        product_name: productNames.get(String(e.source_id)) || ''
    };
}

// สรุปบิลขายใบเดียวให้คนอ่านรู้เรื่อง: ขายอะไร ราคาเท่าไร ไฟแนนซ์ไหน ดาวน์/สด/โอนเท่าไร ไฟแนนซ์ค้างเท่าไร
// ใช้สูตรเดียวกับหน้าตรวจสอบออเดอร์ (buildOrderFinanceSheet) และยอดสด/โอนเดียวกับที่ลงบัญชี (buildTransactionEvents) — ไม่คิดสูตรใหม่
async function getBillSummary(receiptNumber) {
    const t = await Transaction.findOne({ receipt_number: receiptNumber }).lean();
    if (!t) return null;
    const ctx = await loadTransactionContext([t]);
    const a = analyzeBill(t, ctx);
    const built = buildTransactionEvents(t, ctx);
    const evAmount = (key) => round2(sum(built.events.filter(e => e.item_key === key).map(e => e.amount)));

    const Member = require('../models/member');
    const [emp, member] = await Promise.all([
        t.employee_id ? Employee.findById(t.employee_id).select('name').lean() : null,
        t.member_id ? Member.findById(t.member_id).select('prefix first_name last_name phone').lean() : null
    ]);
    const { md, helpers } = ctx;
    const branch = t.branch_id ? md.maps.branches.get(String(t.branch_id)) : null;
    const fcDoc = t.finance_company
        ? (md.maps.financeCompanies.get(String(t.finance_company)) ||
            md.lists.financeCompanies.find(c => c.name === t.finance_company) || null)
        : null;
    const receivable = ctx.receivableByTxn.get(String(t._id)) || null;
    const paid = helpers.resolvePaymentStatus(t, receivable) === 'ชำระแล้ว';

    let finance = null;
    if (a.isFinance) {
        const sheetDevices = a.devices.map(l => ({ product_name: l.product_name, type_id: l.typeId, price: l.price, quantity: l.quantity }));
        const sheet = helpers.buildOrderFinanceSheet(t, sheetDevices, fcDoc, receivable);
        finance = {
            company: fcDoc ? fcDoc.name : (t.finance_company || ''),
            months: Number(t.finance_months) || 0,
            full_price: round2(sheet.full_price),
            down_payment: round2(sheet.down_payment),
            down_percent: round2(sheet.down_percent),
            hire_purchase: round2(sheet.hire_purchase), // ราคาเต็ม − ดาวน์ = ยอดที่ไฟแนนซ์ต้องจ่ายแทนลูกค้า
            commission: round2(sheet.commission),
            credit_amount: round2(sheet.credit_amount), // ทุนเช่าซื้อ + ค่าคอม = ที่ไฟแนนซ์โอนให้ร้านจริง
            paid
        };
    }
    const cash = evAmount('sale_receive_cash');
    const transfer = evAmount('sale_receive_transfer');
    return {
        receipt_number: t.receipt_number,
        created_at: t.created_at || t.createdAt || null,
        status: t.status || '',
        branch_name: branch ? branch.name : '',
        employee_name: emp ? emp.name : '',
        customer_name: member ? `${member.prefix || ''}${member.first_name || ''} ${member.last_name || ''}`.trim() : '',
        customer_phone: member ? (member.phone || '') : '',
        payment_type: t.payment_type || t.payment_method || '',
        is_finance: a.isFinance,
        items: a.lines.map(l => ({ name: l.product_name, quantity: l.quantity, price: l.price, imei: l.imei, is_gift: l.isGift })),
        items_subtotal: round2(a.itemsSubtotal),
        discount: round2(a.discount),
        deposit_applied: round2(a.posApplied + a.completeApplied),
        contract_fee: round2(a.contractFee),
        icloud_fee: round2(a.icloudFee),
        down_payment: a.isFinance ? round2(num(t.down_payment)) : 0,
        cash,
        transfer,
        received_total: round2(cash + transfer),
        bill_total: round2(a.total),
        finance
    };
}

// ทุกรายการของเอกสารใบเดียว (ค้นด้วยชนิด + เลขที่) ข้ามทุกรหัสบัญชี — จัดกลุ่มตามรหัสที่รายการนั้นลงบัญชี
// รายการที่เชื่อมหลายรหัสจะโผล่ในทุกรหัสนั้น · รายการที่ยังไม่เชื่อมรหัสใดไปอยู่กลุ่ม account = null
// ไม่ใช้ตัวกรองวันที่/สาขา: ต้องการเห็นทั้งใบ ไม่ว่าหน้าจอกรองช่วงไหนอยู่
async function getEntriesBySource(sourceType, sourceRef) {
    if (!sourceType || !sourceRef) return { groups: [], truncated: false };
    const MAX = 500;
    const fetched = await AccountItemEvent.find({ source_type: sourceType, source_ref: sourceRef })
        .sort({ event_date: 1 }).limit(MAX + 1).lean();
    const truncated = fetched.length > MAX;
    const events = (truncated ? fetched.slice(0, MAX) : fetched).filter(e => ACCOUNT_ITEM_KEYS.has(e.item_key));

    const keys = [...new Set(events.map(e => e.item_key))];
    const [links, accounts, partyNames] = await Promise.all([
        AccountItemLink.find({ item_key: { $in: keys } }).select('account_id item_key').lean(),
        AccountChart.find().select('account_code account_name').lean(),
        loadPartyNames(events)
    ]);
    const accById = new Map(accounts.map(a => [String(a._id), a]));
    const linksByKey = new Map();
    links.forEach(l => {
        if (!accById.has(String(l.account_id))) return; // ลิงก์ค้างไปรหัสที่ถูกลบแล้ว
        if (!linksByKey.has(l.item_key)) linksByKey.set(l.item_key, []);
        linksByKey.get(l.item_key).push(String(l.account_id));
    });

    const groups = new Map(); // account_id ('' = ยังไม่เชื่อม) -> entries
    events.forEach(e => {
        const targets = e.account_id && accById.has(String(e.account_id))
            ? [String(e.account_id)]
            : (linksByKey.get(e.item_key) || ['']);
        targets.forEach(id => {
            if (!groups.has(id)) groups.set(id, []);
            groups.get(id).push(toEntry(e, partyNames));
        });
    });
    const out = [...groups].map(([id, entries]) => {
        const a = accById.get(id);
        return { account: a ? { _id: a._id, account_code: a.account_code, account_name: a.account_name } : null, entries };
    }).sort((x, y) => String(x.account ? x.account.account_code : '~')
        .localeCompare(String(y.account ? y.account.account_code : '~'), undefined, { numeric: true }));
    // สรุปบิลเฉพาะบิลขาย — ล้มเหลวต้องไม่ทำให้รายการลงบัญชีหาย
    let bill = null;
    if (sourceType === 'transaction') {
        try { bill = await getBillSummary(sourceRef); } catch (e) { console.warn('[accountEntries] สรุปบิลไม่สำเร็จ', sourceRef, e.message); }
    }
    return { groups: out, truncated, bill };
}

module.exports = {
    refreshSource, queueRefresh, rebuildAll, getAccountSummary, getAccountEntries, getEntriesBySource,
    // ใช้ในหน้าประวัติการมัดจำ (routes/api.js GET /deposits/history) ให้ตัวเลขตรงกับที่ลงบัญชี
    analyzeBill, loadTransactionContext,
    // ส่งออกตัวสร้างยอดไว้ทดสอบ (ฟังก์ชันล้วน)
    buildTransactionEvents, buildDepositEvents, buildClaimEvents, buildStockIssueEvents, buildPurchaseOrderEvents,
    buildImportNotificationEvents, buildExpenseEvents, buildCashMovementEvents, buildVoucherEvents, buildOtherEntryEvents,
    SOURCE_TYPES: Object.keys(SOURCES)
};
