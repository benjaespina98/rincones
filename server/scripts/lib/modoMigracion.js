/**
 * Cómo corre un script de migración: SIMULACRO por defecto.
 *
 * Antes cada script escribía salvo que le pasaras `--dry`: olvidarse la bandera era escribir. Ahora es al revés —sin
 * `--aplicar` no se escribe nada— y, además, aplicar sobre la base de producción (`rincones`) exige repetir el
 * nombre: `--confirmo-destino=rincones`. `--dry` sigue siendo válido (es lo que ya es por defecto).
 */
const BASE_DE_PRODUCCION = "rincones";

const modoMigracion = (argv = process.argv.slice(2), env = process.env) => {
  const pidioDry = argv.some((a) => a === "--dry" || a === "--dry-run");
  const aplicar = argv.includes("--aplicar");
  if (pidioDry && aplicar) throw new Error("--dry y --aplicar se contradicen: elegí uno.");

  const base = String(env.MONGODB_DB_NAME || "").trim();
  if (aplicar && base === BASE_DE_PRODUCCION && !argv.includes(`--confirmo-destino=${BASE_DE_PRODUCCION}`)) {
    throw new Error(
      `Estás por escribir en la base de producción (${BASE_DE_PRODUCCION}). Repetí el nombre: --aplicar --confirmo-destino=${BASE_DE_PRODUCCION}`
    );
  }
  return { dry: !aplicar, aplicar, base };
};

module.exports = { modoMigracion, BASE_DE_PRODUCCION };
