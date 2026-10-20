#!/bin/bash
cd /d/silminseller_project/silminseller
D=.archify/menu-map-20261013-154117
A=~/.claude/skills/archify/bin/archify.mjs
node $D/gen.js >/dev/null
ids="$@"; [ -z "$ids" ] && ids=$(node -e "console.log(require('./$D/manifest.json').map(m=>m.id).join(' '))")
for id in $ids; do
  type=$(node -e "console.log(require('./$D/manifest.json').find(m=>m.id==='$id').type)")
  for l in en th; do
    printf "%s.%s: " $id $l
    node $A finalize $type $D/$id.$l.json $D/$id.$l.html --quality showcase --json 2>&1 | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log(j.status, (j.diagnostics||[]).slice(0,4).map(d=>(d.message||d.code||'').slice(0,220)).join(' || '))}catch(e){console.log('RAW',s.slice(0,300))}})"
  done
done
