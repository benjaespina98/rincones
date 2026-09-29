// Guarda: un var(--x) sin declarar no da error. El navegador descarta la regla
// en silencio y el estilo simplemente no aparece. Eso ya pasó con --bg-rgb.
const fs=require("fs"),path=require("path");
// Relativo a ESTE archivo y no al cwd: con `npm -w client` el cwd es client/,
// y con `node client/scripts/...` es la raiz. Resolviendo desde __dirname anda igual en los dos.
const R=path.resolve(__dirname,"..","src");
const todos=[];
(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);
 if(e.isDirectory())w(p);else todos.push(p);}})(R);

const declarados=new Set(), usados=new Map();
for(const f of todos.filter(f=>f.endsWith(".css"))){
  const code=fs.readFileSync(f,"utf8").replace(/\/\*[\s\S]*?\*\//g,"");
  for(const m of code.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) declarados.add(m[1]);
  // Sólo el primer argumento de var(); si hay respaldo, no está roto.
  for(const m of code.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)){
    if(!usados.has(m[1]))usados.set(m[1],new Set());
    usados.get(m[1]).add(f);
  }
}
// Variables que fija el JSX con style={{"--x": ...}}: existen en runtime.
for(const f of todos.filter(f=>/\.jsx?$/.test(f))){
  const s=fs.readFileSync(f,"utf8");
  for(const m of s.matchAll(/["'](--[a-z0-9-]+)["']\s*:/g)) declarados.add(m[1]);
}

const faltan=[...usados.keys()].filter(t=>!declarados.has(t)).sort();
if(faltan.length===0){ console.log("OK:",usados.size,"tokens usados, todos declarados."); process.exit(0); }
console.log("TOKENS USADOS SIN DECLARAR NI RESPALDO:",faltan.length);
for(const t of faltan) console.log("  "+t.padEnd(26), [...usados.get(t)].slice(0,3).map(f=>path.basename(f)).join(", "));
process.exit(1);
