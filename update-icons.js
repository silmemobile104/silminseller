const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

const replacements = [
    { old: 'fa-solid fa-chart-pie sidebar-icon text-lg w-6 text-center text-blue-400 group-hover:text-blue-300', new: 'fa-solid fa-chart-simple sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-chart-line sidebar-icon text-lg w-6 text-center text-emerald-400 group-hover:text-emerald-300', new: 'fa-solid fa-chart-line sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-qrcode sidebar-icon text-lg w-6 text-center text-violet-400 group-hover:text-violet-300', new: 'fa-solid fa-clipboard-check sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-clipboard-check sidebar-icon text-lg w-6 text-center text-amber-400 group-hover:text-amber-300', new: 'fa-solid fa-boxes-stacked sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-store sidebar-icon text-lg w-6 text-center text-emerald-400 group-hover:text-emerald-300', new: 'fa-solid fa-store sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-box-open sidebar-icon text-lg w-6 text-center"', new: 'fa-solid fa-address-book sidebar-icon text-lg w-6 text-center"' },
    { old: 'fa-solid fa-money-bill-transfer sidebar-icon text-lg w-6 text-center text-green-400 group-hover:text-green-300', new: 'fa-solid fa-bag-shopping sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-clipboard-list sidebar-icon text-lg w-6 text-center text-amber-400 group-hover:text-amber-300', new: 'fa-solid fa-clock-rotate-left sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-right-left sidebar-icon text-lg w-6 text-center text-cyan-400 group-hover:text-cyan-300', new: 'fa-solid fa-right-left sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-wallet sidebar-icon text-lg w-6 text-center text-emerald-400 group-hover:text-emerald-300', new: 'fa-solid fa-inbox sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-route sidebar-icon text-lg w-6 text-center text-rose-400 group-hover:text-rose-300', new: 'fa-solid fa-location-dot sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-truck-ramp-box sidebar-icon text-lg w-6 text-center text-green-400 group-hover:text-green-300', new: 'fa-solid fa-dolly sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-clipboard-check sidebar-icon text-lg w-6 text-center text-violet-400 group-hover:text-violet-300', new: 'fa-solid fa-box-open sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-file-invoice-dollar sidebar-icon text-lg w-6 text-center text-pink-400 group-hover:text-pink-300', new: 'fa-solid fa-bag-shopping sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-chart-line sidebar-icon text-lg w-6 text-center text-amber-400 group-hover:text-amber-300', new: 'fa-brands fa-btc sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-boxes-packing sidebar-icon text-lg w-6 text-center text-indigo-400 group-hover:text-indigo-300', new: 'fa-solid fa-clipboard-list sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-address-card sidebar-icon text-lg w-6 text-center text-teal-400 group-hover:text-teal-300', new: 'fa-solid fa-id-card sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-shield-halved sidebar-icon text-lg w-6 text-center text-sky-400 group-hover:text-sky-300', new: 'fa-solid fa-shield-halved sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-users sidebar-icon text-lg w-6 text-center text-purple-400 group-hover:text-purple-300', new: 'fa-solid fa-user-tie sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-store sidebar-icon text-lg w-6 text-center text-orange-400 group-hover:text-orange-300', new: 'fa-solid fa-store sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-gear sidebar-icon text-lg w-6 text-center text-slate-400 group-hover:text-slate-300', new: 'fa-solid fa-gear sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-shield-halved sidebar-icon text-lg w-6 text-center text-amber-400 group-hover:text-amber-300', new: 'fa-solid fa-sliders sidebar-icon text-lg w-6 text-center' },
    { old: 'fa-solid fa-clock-rotate-left sidebar-icon text-lg w-6 text-center text-indigo-400 group-hover:text-indigo-300', new: 'fa-solid fa-user-clock sidebar-icon text-lg w-6 text-center' }
];

replacements.forEach(r => {
    content = content.replace(r.old, r.new);
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Icons updated successfully');
