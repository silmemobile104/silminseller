// แคช Master Data ไว้ใน RAM ของโปรเซส เพื่อเลิกใช้ .populate() บน endpoint ที่ดึงรายการยาวๆ
//
// ทำไมถึงคุ้ม (วัดจริงกับฐานข้อมูล production):
//   - round-trip ไป MongoDB Atlas อยู่ที่ ~79ms ต่อ query
//   - .populate() แต่ละตัว = อีก 1 query แยก ดังนั้น GET /products ที่มี 7 populate
//     จ่าย latency ซ้อนกันหลายรอบ วัดได้ 1,516ms
//   - join ใน memory จากแคชนี้แทน วัดได้ 131ms (เร็วขึ้น ~11 เท่า)
//   - master data ทั้งระบบมีแค่ ~64 แถว และแทบไม่เปลี่ยน จึงแคชได้สบาย
//
// ความสดของข้อมูล: invalidate ทันทีเมื่อมีการแก้ master data (ดู routes/api.js /master/:collection)
// และมี TTL กันไว้อีกชั้น เผื่ออนาคต deploy หลาย instance แล้วการ invalidate ที่เครื่องหนึ่ง
// ไม่ถึงอีกเครื่อง — TTL ทำให้ทุก instance ตามข้อมูลใหม่ทันภายใน 60 วินาทีเสมอ

const {
    Branch,
    ProductType,
    ProductUnit,
    ProductColor,
    ProductCapacity,
    ProductCondition,
    ProductName,
    Supplier,
    FinanceCompany
} = require('../models');

const TTL_MS = 60 * 1000;

// ชื่อคีย์ตรงกับที่ /master-data ส่งให้ frontend เพื่อไม่ต้องจำสองชุด
const SOURCES = {
    branches: Branch,
    productTypes: ProductType,
    productUnits: ProductUnit,
    productColors: ProductColor,
    productCapacities: ProductCapacity,
    productConditions: ProductCondition,
    productNames: ProductName,
    suppliers: Supplier,
    financeCompanies: FinanceCompany
};

let cache = null;      // { loadedAt, lists: {...}, maps: {...} }
let inflight = null;   // กัน request หลายอันโหลดพร้อมกันตอนแคชหมดอายุ (thundering herd)

const buildMap = (rows) => {
    const m = new Map();
    rows.forEach((r) => m.set(String(r._id), r));
    return m;
};

const loadAll = async () => {
    // ดึงทุก collection พร้อมกันในรอบเดียว — จ่าย latency แค่รอบเดียวแทนที่จะเป็น 9 รอบ
    const keys = Object.keys(SOURCES);
    const rows = await Promise.all(
        keys.map((k) => SOURCES[k].find({}).lean())
    );

    const lists = {};
    const maps = {};
    keys.forEach((k, i) => {
        lists[k] = rows[i];
        maps[k] = buildMap(rows[i]);
    });

    cache = { loadedAt: Date.now(), lists, maps };
    return cache;
};

const get = async () => {
    if (cache && (Date.now() - cache.loadedAt) < TTL_MS) return cache;
    if (inflight) return inflight; // มีคนกำลังโหลดอยู่แล้ว รอคนนั้นแทนที่จะยิงซ้ำ
    inflight = loadAll().finally(() => { inflight = null; });
    return inflight;
};

// เรียกหลังมีการเพิ่ม/แก้/ลบ master data เพื่อให้ request ถัดไปเห็นข้อมูลใหม่ทันที
const invalidate = () => { cache = null; };

// แทน .populate(path, 'name') — คืนรูปแบบเดียวกับที่ populate ให้เป๊ะๆ
//   - id เป็น null/undefined  -> คงค่าเดิมไว้ (populate ก็ไม่แตะ)
//   - id มีค่าแต่หาเอกสารไม่เจอ -> null (populate ทำแบบนี้เมื่อ ref ชี้ไปยังเอกสารที่ถูกลบแล้ว)
//   - เจอ                      -> { _id, name } เท่าที่ populate(..., 'name') จะส่งมา
const resolveRef = (map, id, fields) => {
    if (id === null || id === undefined || id === '') return id;
    // ถ้าถูก populate มาแล้ว (เป็น object ที่มี name) ไม่ต้องทำอะไรซ้ำ
    if (typeof id === 'object' && id !== null && !id._bsontype && id.name !== undefined) return id;

    const doc = map.get(String(id._id ? id._id : id));
    if (!doc) return null;

    const out = { _id: doc._id };
    (fields || ['name']).forEach((f) => {
        if (doc[f] !== undefined) out[f] = doc[f];
    });
    return out;
};

module.exports = { get, invalidate, resolveRef, TTL_MS };
