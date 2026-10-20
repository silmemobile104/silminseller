// รวม diagram ที่ผ่าน archify finalize ทั้งหมดเป็นเว็บเดียว: แท็บเลือกกระบวนการ + ปุ่มสลับ ไทย/EN
const fs = require('fs'), path = require('path');
const dir = __dirname;
const out = path.join(dir, 'site');
fs.mkdirSync(out, { recursive: true });

const archDir = path.join(dir, '..', 'architecture-silminseller-20261013-145053');
const items = [
  { id: 'overview', from: (l) => path.join(archDir, `silminseller-architecture.${l}.html`), en: 'System overview', th: 'ภาพรวมระบบ' },
  { id: 'login', en: 'Login', th: 'เข้าสู่ระบบ' },
  { id: 'pos-sale', en: 'POS sale', th: 'ขาย POS' },
  { id: 'transfer', en: 'Transfers', th: 'โอนย้ายสินค้า' },
  { id: 'purchase-order', en: 'Purchase orders', th: 'ใบสั่งซื้อ (PO)' },
  { id: 'stock-flow', en: 'Stock flow', th: 'การไหลของสต็อก' },
  { id: 'stock-audit', en: 'Stock audit', th: 'ตรวจนับสต็อก' },
  { id: 'deposit', en: 'Deposits', th: 'มัดจำ' },
  { id: 'finance-receivable', en: 'Finance receivables', th: 'ลูกหนี้ไฟแนนซ์' },
  { id: 'money-flow', en: 'Money flow', th: 'การเงินและบัญชี' }
];
for (const it of items) {
  for (const l of ['en', 'th']) {
    const src = it.from ? it.from(l) : path.join(dir, `${it.id}.${l}.html`);
    if (!fs.existsSync(src)) throw new Error('missing ' + src);
    fs.copyFileSync(src, path.join(out, `${it.id}.${l}.html`));
  }
}

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>silminseller System Diagrams</title>
<style>
  :root { --bg:#0b0d12; --bar:#12151c; --ink:#e8eaf0; --muted:#9aa3b2; --line:#232838; --accent:#FFE169; --on-accent:#1a1500; }
  @media (prefers-color-scheme: light) { :root { --bg:#f4f5f8; --bar:#ffffff; --ink:#151821; --muted:#5a6272; --line:#d9dce5; --accent:#b8860b; --on-accent:#ffffff; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 14px/1.4 system-ui, "Sarabun", "Segoe UI", sans-serif; display: flex; flex-direction: column; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px 0; background: var(--bar); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
  .top { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; padding-bottom: 8px; }
  h1 { font-size: 15px; margin: 0; font-weight: 600; }
  .sub { color: var(--muted); font-size: 12px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; flex: none; }
  .seg button { appearance: none; border: 0; background: transparent; color: var(--muted); padding: 7px 16px; font: inherit; font-weight: 600; cursor: pointer; }
  .seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
  nav { display: flex; gap: 4px; overflow-x: auto; width: 100%; padding-bottom: 0; }
  nav button { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); padding: 8px 12px; font: inherit; white-space: nowrap; cursor: pointer; }
  nav button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  main { flex: 1; min-height: 0; }
  iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg); }
  @media (max-width: 560px) { .sub { display: none; } }
</style>
</head>
<body>
<header>
  <div class="top">
    <div><h1 id="t"></h1><div class="sub" id="s"></div></div>
    <div class="seg" role="group" aria-label="Language / ภาษา">
      <button type="button" data-lang="th" aria-pressed="true">ไทย</button>
      <button type="button" data-lang="en" aria-pressed="false">EN</button>
    </div>
  </div>
  <nav id="tabs" role="tablist"></nav>
</header>
<main><iframe id="f" title="diagram"></iframe></main>
<script>
const ITEMS = ${JSON.stringify(items.map(i => ({ id: i.id, en: i.en, th: i.th })))};
const TXT = {
  th: { t: 'silminseller — แผนภาพการทำงานของระบบ', s: 'อิงโค้ดที่ commit dcf6949 · ปุ่มควบคุมภายในแผนภาพ (ซูม/ส่งออก) เป็นภาษาอังกฤษ' },
  en: { t: 'silminseller — System Diagrams', s: 'Based on commit dcf6949' }
};
const frame = document.getElementById('f');
const tabs = document.getElementById('tabs');
let lang = 'th', cur = 'overview';
function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function render() {
  frame.src = cur + '.' + lang + '.html';
  document.documentElement.lang = lang;
  document.getElementById('t').textContent = TXT[lang].t;
  document.getElementById('s').textContent = TXT[lang].s;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  tabs.innerHTML = '';
  ITEMS.forEach(it => {
    const b = document.createElement('button');
    b.type = 'button'; b.role = 'tab'; b.textContent = it[lang];
    b.setAttribute('aria-selected', String(it.id === cur));
    b.addEventListener('click', () => { cur = it.id; store('silmin_diag_tab', cur); history.replaceState(null, '', '#' + cur); render(); });
    tabs.appendChild(b);
  });
}
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { lang = b.dataset.lang; store('silmin_diag_lang', lang); render(); }));
const h = location.hash.replace('#', '');
const savedLang = load('silmin_diag_lang');
lang = savedLang === 'en' || savedLang === 'th' ? savedLang : ((navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en');
cur = ITEMS.some(i => i.id === h) ? h : (ITEMS.some(i => i.id === load('silmin_diag_tab')) ? load('silmin_diag_tab') : 'overview');
render();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('site ->', out, items.length * 2, 'diagram files');
