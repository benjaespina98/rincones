/**
 * Un vino que salió de buscar (catálogo o comunidad), listo para entrar a la bodega SIN escanear nada.
 *
 * Es el mismo payload que arma la pantalla de escaneo (`toWinePayload` en ScanWinePage), con los datos
 * que el catálogo ya conoce. La cosecha va vacía a propósito: una fila del catálogo es el VINO, no la
 * botella, y no puede tener un año sin mentirle a quien tiene otra añada en la mano.
 *
 * `identification.source` es "manual": quien lo elige de la lista está diciendo "es este", igual que
 * quien lo escribe. El servidor igual recalcula el veredicto por su cuenta.
 */
const FOTO_HTTP = /^https:\/\/\S{1,1900}$/;

/** Lo que le dice al servidor que el alta salió de elegir un resultado de la búsqueda (ver `evaluarIdentificacion`). */
export const ORIGEN_BUSQUEDA = "busqueda-catalogo";

const plano = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** ¿Estos dos son el mismo vino (misma bodega y mismo nombre, sin mirar tildes ni mayúsculas)? */
export const esElMismoVino = (a, b) =>
  Boolean(plano(a?.name)) && plano(a?.name) === plano(b?.name) && plano(a?.winery) === plano(b?.winery);

export const catalogWineToPayload = (wine, quantity = 1) => {
  const cantidad = Math.max(0, Math.min(999, Number.parseInt(quantity, 10) || 0));
  const nombre = String(wine?.name || "").trim();
  return {
    name: nombre || "Vino sin nombre",
    winery: String(wine?.winery || "").trim(),
    line: String(wine?.line || nombre).trim(),
    region: String(wine?.region || "").trim(),
    varietal: String(wine?.varietal || "").trim(),
    vintage: "",
    type: wine?.type || "unknown",
    // Sólo una foto https: las que viajan embebidas (data:) pesan y el servidor sólo acepta https.
    image: typeof wine?.image === "string" && FOTO_HTTP.test(wine.image) ? wine.image : "",
    quantity: cantidad,
    // Sin botellas entra ya probado: si no lo tenés y lo cargás igual, es porque lo tomaste.
    tasted: cantidad === 0,
    identification: {
      source: "manual",
      confidence: {},
      editedFields: [],
      matchedFrom: ORIGEN_BUSQUEDA,
      sameNameConfirmed: false,
    },
  };
};
