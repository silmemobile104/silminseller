const fs = require('fs');
const p = __dirname + '/gen-all.js';
let s = fs.readFileSync(p, 'utf8');
const a = s.indexOf("// ---------------------------------------------------------------- 8 stock hub (dataflow)");
const b = s.indexOf("// ---------------------------------------------------------------- write");
if (a < 0 || b < 0 || b < a) throw new Error('markers not found');
s = s.slice(0, a) + "require('./dataflows.js')(add, src, API);\n\n" + s.slice(b);
fs.writeFileSync(p, s);
console.log('patched4');
