/**
 * Tráfico que no es una persona mirando la pantalla.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 * Es la primera objeción de cualquiera que pague por impresiones, y es una
 * objeción razonable: "¿cómo sé que esas 4.000 vistas no son robots?". Sin un
 * filtro la respuesta honesta es "no lo sabés", y ahí se termina la conversación.
 *
 * Los rastreadores no son marginales. Google, Bing, los previsualizadores de
 * WhatsApp y Twitter, los monitores de uptime y los escáneres de seguridad pegan
 * en la portada varias veces por día. Ninguno vio la publicidad de nadie.
 *
 * ── QUÉ FILTRA Y QUÉ NO ─────────────────────────────────────────────────────
 * Filtra por user-agent, que es lo que un bot honesto declara de sí mismo, y ésa
 * es su limitación: un bot que miente no se detecta acá. Igual saca la enorme
 * mayoría del ruido, y lo que queda es el caso raro y deliberado, no el
 * rastreador de todos los días.
 *
 * Es intencionalmente CONSERVADOR: ante la duda descarta. Para un número que se
 * factura, quedarse corto es un problema chico y quedarse largo es un problema
 * grande —el primero se discute, el segundo se cobra de más—.
 *
 * ── POR QUÉ VIVE APARTE ─────────────────────────────────────────────────────
 * Porque lo usan dos lugares que tienen que coincidir: las métricas de uso y los
 * contadores de las campañas. Si cada uno tuviera su lista, el día que se
 * actualice una el panel diría dos verdades distintas sobre el mismo tráfico.
 */

/**
 * Marcas de bots declarados. Se buscan en el user-agent en minúsculas.
 *
 * `bot`, `crawler` y `spider` solos cubren la mayoría —casi todos los incluyen—
 * y el resto son los que no lo hacen y aparecen seguido de verdad.
 */
const MARCAS_DE_BOT = [
  "bot",
  "crawler",
  "spider",
  "crawling",
  // Buscadores y redes que arman la vista previa de un enlace.
  "slurp",
  "duckduckbot",
  "baiduspider",
  "yandex",
  "facebookexternalhit",
  "whatsapp",
  "telegrambot",
  "twitterbot",
  "linkedinbot",
  "discordbot",
  "slackbot",
  "embedly",
  "quora link preview",
  "pinterest",
  "redditbot",
  "applebot",
  "petalbot",
  "bingpreview",
  // Herramientas y monitores: piden la página sin que haya nadie del otro lado.
  "curl",
  "wget",
  "python-requests",
  "python-urllib",
  "axios/",
  "node-fetch",
  "go-http-client",
  "java/",
  "okhttp",
  "postman",
  "insomnia",
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  "lighthouse",
  "pagespeed",
  "gtmetrix",
  "pingdom",
  "uptimerobot",
  "statuscake",
  "site24x7",
  "datadog",
  "newrelic",
  "ahrefs",
  "semrush",
  "mj12bot",
  "dotbot",
  "screaming frog",
];

/**
 * Un navegador de verdad dice qué es. Un user-agent vacío o de tres letras no
 * es un visitante: es un script que ni se molestó en inventarse uno.
 */
const LARGO_MINIMO_CREIBLE = 20;

/** ¿Este user-agent es de una persona mirando la pantalla? */
const esTraficoHumano = (userAgent = "") => {
  const ua = String(userAgent || "").trim().toLowerCase();
  if (ua.length < LARGO_MINIMO_CREIBLE) return false;
  return !MARCAS_DE_BOT.some((marca) => ua.includes(marca));
};

/** Lo mismo, tomando el user-agent de la petición. */
const peticionHumana = (req) => esTraficoHumano(req?.headers?.["user-agent"]);

module.exports = { esTraficoHumano, peticionHumana, MARCAS_DE_BOT };
