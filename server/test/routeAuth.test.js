const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Toda ruta tiene que declarar `authenticate`, salvo las que son públicas por
 * definición (login, registro, recuperar contraseña).
 *
 * Existe porque POST /api/labels/analyze se publicó SIN autenticación: acepta
 * una subida y gasta cuota de Gemini Vision en cada llamada. No fallaba nada
 * —el cliente mandaba el token igual—, así que no había forma de enterarse
 * hasta ver la factura. Un endpoint nuevo que se olvide del middleware es un
 * error silencioso y caro; este test lo vuelve ruidoso.
 */

/**
 * Las excepciones van con el ARCHIVO adelante, no sólo el verbo y la ruta.
 *
 * Antes eran globales, y eso las volvía peligrosamente amplias: declarar pública
 * una `GET /` habilitaba silenciosamente la `GET /` de cualquier otro router,
 * presente o futuro. La excepción tiene que valer para el endpoint que se
 * revisó, no para todos los que se llamen igual.
 */
const PUBLICAS = new Set([
  "auth.routes.js: post /login",
  "auth.routes.js: post /register",
  "auth.routes.js: post /forgot-password",
  "auth.routes.js: post /reset-password",
  // El refresh se llama JUSTO cuando el token de acceso ya venció: exigir uno
  // válido lo volvería inútil. La credencial es la cookie httpOnly del refresh.
  "auth.routes.js: post /refresh",
  // Cerrar sesión tiene que funcionar aunque el token ya haya expirado; si no,
  // el refresh quedaría vivo en la base sin forma de revocarlo.
  "auth.routes.js: post /logout",
  // Se abre desde el link del mail de verificación, en un navegador que puede
  // no tener sesión iniciada (otro dispositivo, o la sesión ya venció). La
  // credencial acá es el token del link, no la cookie — igual que reset-password.
  "auth.routes.js: post /verify-email",

  // ── Métricas de uso ─────────────────────────────────────────────────────
  // La ingesta es pública porque los visitantes SIN sesión son justamente los
  // que hay que poder contar: exigir token mediría sólo a los ya registrados,
  // que es el número menos interesante de los dos. No lee ni devuelve nada
  // (responde 204 vacío), tiene su propio rate limit y descarta en silencio al
  // pasarse. Lo que sí es privado —el tablero— exige authenticate + requireAdmin.
  "analytics.routes.js: post /collect",

  // ── Destacados de Descubrí ──────────────────────────────────────────────
  // El listado público es contenido de portada, del mismo tenor que el catálogo:
  // se muestra a cualquiera que abra la app. Devuelve sólo lo activo y vigente y
  // excluye los contadores internos (ver promotions.service.js: listPublic).
  "promotions.routes.js: get /",
  // Impresiones y clics: sólo escritura, responde 204 vacío. Es público porque lo
  // cuenta el visitante que ve la tarjeta, con o sin sesión, y los visitantes sin
  // sesión son la mayoría de la portada.
  //
  // Lo que antes era un riesgo aceptado —"alguien podría inflar los contadores"—
  // ya no lo es, y era la deuda que quedó anotada cuando esto se publicó: el
  // servicio sólo cuenta campañas que están efectivamente al aire (un id vencido o
  // inventado se descarta), deduplica por visitante con un hash anónimo para
  // separar impresiones de personas distintas, y la ruta tiene su propio rate
  // limit. Sin eso, el número que se le informa a un anunciante no se puede
  // defender.
  "promotions.routes.js: post /events",
  // El informe del anunciante. Público porque la LLAVE es el enlace: son 32
  // bytes al azar que no se adivinan ni se enumeran, y el enlace se genera recién
  // cuando se comparte, así que una campaña que nunca se compartió no tiene
  // ninguna puerta abierta. Pedirle una cuenta a alguien que sólo quiere ver si
  // su publicidad se está viendo termina en "mandame una captura", y una captura
  // no la audita nadie: el trámite se paga en credibilidad.
  //
  // Es de sólo lectura, devuelve únicamente los números de ESA campaña (ni el id,
  // ni la prioridad, ni si está pausada) y se puede cortar desde el panel sin
  // tocar los datos.
  "promotions.routes.js: get /report/:token",
]);

const routesDir = path.join(__dirname, "..", "src", "routes");

test("todas las rutas exigen autenticación salvo las públicas declaradas", () => {
  const sinProteger = [];

  for (const file of fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(routesDir, file), "utf8");
    const re = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\);/g;

    let m;
    while ((m = re.exec(src)) !== null) {
      const [, verbo, ruta, resto] = m;
      const clave = `${file}: ${verbo} ${ruta}`;
      if (PUBLICAS.has(clave)) continue;
      if (!/\bauthenticate\b/.test(resto)) {
        sinProteger.push(`${file}: ${verbo.toUpperCase()} ${ruta}`);
      }
    }
  }

  assert.deepEqual(
    sinProteger,
    [],
    `Estas rutas no exigen autenticación:\n  ${sinProteger.join("\n  ")}`
  );
});

test("las rutas de admin exigen además requireAdmin", () => {
  const src = fs.readFileSync(path.join(routesDir, "admin.routes.js"), "utf8");
  const re = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]([\s\S]*?)\);/g;
  const sinAdmin = [];

  let m;
  while ((m = re.exec(src)) !== null) {
    const [, verbo, ruta, resto] = m;
    if (!/\brequireAdmin\b/.test(resto)) sinAdmin.push(`${verbo.toUpperCase()} ${ruta}`);
  }

  assert.deepEqual(sinAdmin, [], `Rutas de admin sin requireAdmin: ${sinAdmin.join(", ")}`);
});
