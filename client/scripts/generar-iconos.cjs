/**
 * Genera `src/components/iconPaths.js` a partir del catálogo de Phosphor.
 *
 * ── POR QUÉ SE GENERA Y NO SE IMPORTA EL PAQUETE ────────────────────────────
 * `@phosphor-icons/react` trae, por cada ícono, los SEIS pesos (thin, light,
 * regular, bold, fill, duotone) en un mismo módulo. No hay entrada por peso, así
 * que importar 52 íconos cuesta **35,2 kB gzip** — medido — cuando la app usa
 * uno o dos pesos. El presupuesto de carga inicial deja 23,4 kB libres: no
 * entra, y no hay forma de achicarlo desde el lado del consumidor.
 *
 * Sacando sólo los pesos que se usan, los mismos 52 íconos son **6,6 kB gzip**.
 * La geometría es idéntica: son literalmente los mismos `d`.
 *
 * ── LICENCIA ────────────────────────────────────────────────────────────────
 * Phosphor Icons es MIT (https://github.com/phosphor-icons/homepage), que
 * permite copiar y redistribuir con la atribución puesta. La atribución va en
 * la cabecera del archivo generado.
 *
 * Es también la razón por la que NO se usan SF Symbols de Apple, que era la
 * primera opción pedida: su licencia permite usarlos para diseñar apps de
 * plataformas Apple pero prohíbe copiarlos y redistribuirlos, y un bundle web
 * se sirve a cualquier navegador.
 *
 * ── CÓMO SE CORRE ───────────────────────────────────────────────────────────
 *   npm run iconos -w client
 *
 * Hace falta `@phosphor-icons/react` instalado como devDependency. No entra al
 * bundle: sólo lo lee este script.
 */

const fs = require("fs");
const path = require("path");

const DEFS = path.resolve(__dirname, "../../node_modules/@phosphor-icons/react/dist/defs");
const SALIDA = path.resolve(__dirname, "../src/components/iconPaths.js");

/**
 * El nombre que usa la app → el nombre en Phosphor.
 *
 * Los nombres de la app se quedan como están a propósito: hay 251 usos de
 * `<Icon name="..." />` repartidos en 59 archivos, y renombrarlos sería un
 * cambio de miles de líneas que no mejora nada. Este mapa es el único lugar
 * donde las dos nomenclaturas se tocan.
 */
const MAPA = {
  "alert-triangle": "Warning",
  "arrow-left": "ArrowLeft",
  "arrow-right": "ArrowRight",
  "arrow-up": "ArrowUp",
  // La flecha en círculo del compositor del Sommelier: es el botón de enviar
  // de iOS, no el avión de papel.
  "arrow-up-circle": "ArrowCircleUp",
  bottle: "Wine",
  cake: "Cake",
  calendar: "CalendarBlank",
  camera: "Camera",
  chat: "ChatCircle",
  check: "Check",
  "chevron-down": "CaretDown",
  "chevron-left": "CaretLeft",
  "chevron-right": "CaretRight",
  "chevron-up": "CaretUp",
  circle: "Circle",
  compass: "Compass",
  expand: "ArrowsOut",
  eye: "Eye",
  "eye-off": "EyeSlash",
  // El embudo, no el engranaje: el engranaje significa "configuración".
  filter: "Funnel",
  graduation: "GraduationCap",
  grid: "SquaresFour",
  heart: "Heart",
  home: "House",
  image: "Image",
  info: "Info",
  list: "List",
  lock: "Lock",
  "log-out": "SignOut",
  mail: "Envelope",
  "map-pin": "MapPin",
  minus: "Minus",
  music: "MusicNote",
  pencil: "Pencil",
  play: "Play",
  plus: "Plus",
  "plus-solid": "Plus",
  // Dos flechas en círculo: "traeme otro".
  refresh: "ArrowClockwise",
  search: "MagnifyingGlass",
  // El avión de papel del compositor del Sommelier.
  send: "PaperPlaneTilt",
  settings: "Gear",
  // `Export` es exactamente el glifo de compartir de iOS: la flecha saliendo
  // de la caja. `ShareNetwork` es el de Android y se lee distinto.
  share: "Export",
  sparkle: "Sparkle",
  sparkles: "Sparkle",
  star: "Star",
  store: "Storefront",
  tag: "Tag",
  trash: "Trash",
  user: "User",
  "user-solid": "User",
  users: "Users",
  utensils: "ForkKnife",
  "wine-glass": "Wine",
  x: "X",
};

/**
 * Los que además necesitan versión rellena.
 *
 * Es el `filled` de `<Icon>`: el corazón de favorito, la estrella del puntaje y
 * el destello de "recomendado". Y los tres de la barra inferior, que se rellenan
 * cuando la pestaña está activa — que es lo que hace iOS y lo que hace que una
 * tab bar se sienta nativa.
 */
const CON_RELLENO = [
  "heart",
  "star",
  "sparkle",
  "sparkles",
  "bottle",
  "wine-glass",
  "user-solid",
  "plus-solid",
  "compass",
  "grid",
  "arrow-up-circle",
];

/** Los `d` de un peso dentro del defs de Phosphor. */
const pathsDelPeso = (fuente, peso) => {
  const desde = fuente.indexOf(`"${peso}"`);
  if (desde < 0) return null;
  // El siguiente par del Map cierra este bloque.
  const hasta = fuente.indexOf('\n  [\n    "', desde + 1);
  const trozo = fuente.slice(desde, hasta < 0 ? fuente.length : hasta);
  const encontrados = [...trozo.matchAll(/d:\s*"([^"]+)"/g)].map((m) => m[1]);
  return encontrados.length ? encontrados : null;
};

const leerDef = (nombrePhosphor) => {
  const archivo = path.join(DEFS, `${nombrePhosphor}.es.js`);
  if (!fs.existsSync(archivo)) {
    throw new Error(`No existe el ícono "${nombrePhosphor}" en Phosphor (${archivo})`);
  }
  return fs.readFileSync(archivo, "utf8");
};

const trazos = {};
const rellenos = {};

for (const [nuestro, suyo] of Object.entries(MAPA)) {
  const fuente = leerDef(suyo);
  const regular = pathsDelPeso(fuente, "regular");
  if (!regular) throw new Error(`"${suyo}" no tiene peso regular`);
  trazos[nuestro] = regular;

  if (CON_RELLENO.includes(nuestro)) {
    const fill = pathsDelPeso(fuente, "fill");
    if (!fill) throw new Error(`"${suyo}" no tiene peso fill`);
    rellenos[nuestro] = fill;
  }
}

const cabecera = `/**
 * ARCHIVO GENERADO. No editar a mano.
 *
 * Se regenera con:  npm run iconos -w client
 * El criterio, el mapa de nombres y el porqué están en scripts/generar-iconos.cjs
 *
 * Geometría: Phosphor Icons (https://phosphoricons.com) — MIT License,
 * Copyright (c) 2023 Phosphor Icons. Se incluyen únicamente los pesos que la
 * app usa; el paquete completo trae seis por ícono y cuesta 35,2 kB gzip
 * contra los 6,6 kB de esto.
 *
 * viewBox 0 0 256 256, paths rellenos (no trazados).
 */

`;

const cuerpo =
  `export const ICON_PATHS = ${JSON.stringify(trazos, null, 0)};\n\n` +
  `export const ICON_PATHS_FILLED = ${JSON.stringify(rellenos, null, 0)};\n`;

fs.writeFileSync(SALIDA, cabecera + cuerpo);

const bytes = Buffer.byteLength(cabecera + cuerpo);
const gzip = require("zlib").gzipSync(Buffer.from(cabecera + cuerpo)).length;
console.log(
  `iconPaths.js: ${Object.keys(trazos).length} íconos (${Object.keys(rellenos).length} con relleno) — ` +
    `${bytes} B crudo, ${gzip} B gzip`
);
