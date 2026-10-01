import api from "./api";

/**
 * Lo que una persona puede hacer con su propia cuenta: llevarse sus datos o
 * darla de baja.
 *
 * Las dos van juntas en un archivo porque son la misma decisión vista de dos
 * lados — irse conservando lo propio, o irse del todo — y porque la segunda sin
 * la primera obliga a elegir entre las dos.
 */

/**
 * Baja de cuenta. Pide el email escrito a mano y la contraseña si la cuenta
 * tiene: el servidor vuelve a validarlos, acá sólo viajan.
 */
export const eliminarCuenta = async ({ confirmEmail, password }) => {
  const { data } = await api.delete("/users/me", { data: { confirmEmail, password } });
  return data;
};

/**
 * Descarga el archivo con todo lo cargado.
 *
 * ── POR QUÉ NO ES UN <a href> Y LISTO ───────────────────────────────────────
 * Porque el endpoint pide el token en la cabecera `Authorization`, y un enlace
 * del navegador no manda cabeceras. Habría que o pasar el token por la URL —que
 * queda en el historial, en los logs del servidor y en el Referer— o abrir el
 * endpoint sin autenticar, que es peor todavía.
 *
 * Así que se baja con la misma instancia de axios que el resto de la app, y el
 * archivo se arma en memoria. El `revokeObjectURL` no es prolijidad: sin él, el
 * blob queda retenido hasta que se cierre la pestaña, y acá puede pesar varios
 * megas.
 */
export const exportarMisDatos = async () => {
  const respuesta = await api.get("/users/me/export", { responseType: "blob" });

  /* El nombre sale de la cabecera que mandó el server (lleva la fecha), y si no
     viene, se arma acá: nunca "download.json". */
  const disposicion = respuesta.headers?.["content-disposition"] || "";
  const delServidor = /filename="([^"]+)"/.exec(disposicion)?.[1];
  const nombre = delServidor || `rincones-${new Date().toISOString().slice(0, 10)}.json`;

  const url = URL.createObjectURL(respuesta.data);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);

  return nombre;
};
