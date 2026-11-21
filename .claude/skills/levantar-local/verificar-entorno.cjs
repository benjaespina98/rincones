// Verifica que el entorno apunte a LOCAL/desarrollo y devuelve sólo un veredicto.
// Lee server/.env y client/.env* en memoria para clasificarlos, pero NUNCA imprime
// valores (ni URIs, ni claves): sólo OK / AVISO / ABORTAR con el motivo.
// Exit 0 = se puede levantar. Exit 1 = abortar.

const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..", "..", "..");

// Parser mínimo de KEY=valor (sin dependencias).
function leerEnv(archivo) {
  const out = {};
  if (!fs.existsSync(archivo)) return null;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const esLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host);
const abortar = [];
const avisos = [];

const server = leerEnv(path.join(raiz, "server", ".env"));
if (!server) {
  abortar.push("falta server/.env (copiá server/.env.example y completalo; la base debe ser `test`)");
} else {
  // 1) Nombre de base: `rincones` es producción, `test` es desarrollo.
  const db = (server.MONGODB_DB_NAME || "").trim();
  if (!db) abortar.push("MONGODB_DB_NAME vacío o ausente (el server tampoco arrancaría)");
  else if (db !== "test") abortar.push("MONGODB_DB_NAME no es `test` (la base `rincones` es PRODUCCIÓN)");
  else console.log("OK    base de datos: `test` (desarrollo)");

  // 2) Host: local es ideal; remoto (Atlas) es el mismo cluster que producción.
  const uri = server.MONGODB_URI || "";
  if (!uri) abortar.push("MONGODB_URI ausente");
  else {
    const host = (uri.match(/@([^/?,:]+)|\/\/([^/?,:@]+)/) || []).slice(1).find(Boolean) || "";
    if (esLocal(host)) console.log("OK    MongoDB en esta máquina");
    else avisos.push("MONGODB_URI apunta a un host remoto: el cluster puede ser el mismo de producción y sólo te separa el nombre de base `test`");
  }

  if ((server.NODE_ENV || "").toLowerCase() === "production") {
    abortar.push("NODE_ENV=production en server/.env");
  }
  if (server.FRONTEND_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(server.FRONTEND_URL)) {
    avisos.push("FRONTEND_URL no es localhost (los links de mail apuntarían afuera)");
  }
}

// 3) Client: VITE_API_URL, si está definida, tiene que ser local.
for (const nombre of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  const c = leerEnv(path.join(raiz, "client", nombre));
  if (c && c.VITE_API_URL && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(c.VITE_API_URL)) {
    abortar.push(`client/${nombre}: VITE_API_URL no apunta a localhost (pegaría contra la API desplegada)`);
  }
}

for (const a of avisos) console.log("AVISO", a);
for (const a of abortar) console.log("ABORTAR", a);
if (abortar.length) process.exit(1);
console.log("Entorno verificado: se puede levantar.");
