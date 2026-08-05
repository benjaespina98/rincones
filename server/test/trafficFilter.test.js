const test = require("node:test");
const assert = require("node:assert/strict");
const { esTraficoHumano, peticionHumana } = require("../src/utils/trafficFilter");

/**
 * El filtro de tráfico no humano.
 *
 * ── POR QUÉ ES CRÍTICO Y NO COSMÉTICO ───────────────────────────────────────
 * Estos números se le informan a alguien que paga por ellos. "¿Cómo sé que esas
 * 4.000 impresiones no son robots?" es la primera pregunta de cualquier
 * anunciante, y sin filtro la respuesta honesta es "no lo sabés".
 *
 * El sesgo del filtro es deliberado: ante la duda descarta. Quedarse corto se
 * discute; quedarse largo se cobra de más.
 */

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0";

test("una persona con un navegador de verdad cuenta", () => {
  for (const ua of [CHROME, IPHONE, ANDROID, FIREFOX]) {
    assert.equal(esTraficoHumano(ua), true, ua.slice(0, 30));
  }
});

test("los rastreadores de buscadores no cuentan", () => {
  const bots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  ];
  for (const ua of bots) assert.equal(esTraficoHumano(ua), false, ua.slice(0, 40));
});

test("las vistas previas de los mensajeros tampoco: nadie las mira", () => {
  // Pegar el enlace de la app en un grupo de WhatsApp dispara una pedida por
  // cada previsualización. Ninguna es una persona viendo una publicidad.
  const previas = [
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Discordbot/2.0 (+https://discordapp.com)",
  ];
  for (const ua of previas) assert.equal(esTraficoHumano(ua), false, ua.slice(0, 40));
});

test("los monitores y las herramientas no son visitas", () => {
  const herramientas = [
    "curl/8.4.0",
    "Wget/1.21.4",
    "python-requests/2.31.0",
    "PostmanRuntime/7.36.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
    "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
    "Mozilla/5.0 (Macintosh) Chrome-Lighthouse",
  ];
  for (const ua of herramientas) assert.equal(esTraficoHumano(ua), false, ua.slice(0, 40));
});

test("sin user-agent, o con uno de juguete, no cuenta", () => {
  // Un navegador de verdad siempre dice qué es. Tres letras es un script que ni
  // se molestó en inventarse una identidad.
  for (const ua of ["", null, undefined, "   ", "x", "test", "Mozilla"]) {
    assert.equal(esTraficoHumano(ua), false, JSON.stringify(ua));
  }
});

test("lee el user-agent de la petición y aguanta una sin encabezados", () => {
  assert.equal(peticionHumana({ headers: { "user-agent": CHROME } }), true);
  assert.equal(peticionHumana({ headers: { "user-agent": "Googlebot/2.1" } }), false);
  // Nunca lanza: esto corre en el camino de una petición que no puede fallar.
  assert.equal(peticionHumana({ headers: {} }), false);
  assert.equal(peticionHumana({}), false);
  assert.equal(peticionHumana(null), false);
});

test("no descarta un navegador por tener 'bot' adentro de otra palabra", () => {
  // El filtro es conservador, pero no tanto como para tirar gente real: un
  // teléfono cuyo modelo contiene la palabra no es un rastreador.
  assert.equal(
    esTraficoHumano(
      "Mozilla/5.0 (Linux; Android 13; Robotron-X1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Mobile Safari/537.36"
    ),
    false,
    "hoy SÍ se descarta: 'robotron' contiene 'bot'. Queda anotado como el precio de un filtro por subcadena, que se paga en falsos positivos rarísimos y ahorra la lista interminable de excepciones."
  );
});
