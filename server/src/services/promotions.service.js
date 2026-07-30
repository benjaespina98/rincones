const Promotion = require("../models/promotion.model");

/**
 * Los destacados de Descubrí: publicidades pagas y eventos reales.
 *
 * La regla de oro está en `listPublic`: una tarjeta que no está vigente NO sale,
 * y eso lo decide la base con la fecha del momento, no una revisión manual. Una
 * campaña que venció el domingo a la noche está apagada el domingo a la noche.
 */

/** Cuántas tarjetas se le mandan al carrusel. Más que esto nadie las ve. */
const MAX_PUBLICAS = 6;

/**
 * Qué ve el visitante. Sólo lo activo y dentro de la ventana de vigencia.
 *
 * El orden es: prioridad (lo pactado manda), después el evento más próximo
 * —una feria de la semana que viene interesa más que una de noviembre— y al
 * final lo más nuevo. Los que no tienen fecha de evento no se cuelan adelante:
 * `eventAt` nulo ordena al final de su grupo de prioridad.
 */
const listPublic = async (now = new Date()) => {
  const filas = await Promotion.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  })
    .select("-createdBy -impressions -clicks")
    .lean();

  const cuando = (p) => (p.eventAt ? new Date(p.eventAt).getTime() : Infinity);

  return filas
    .sort((a, b) => {
      if ((b.priority || 0) !== (a.priority || 0)) return (b.priority || 0) - (a.priority || 0);
      if (cuando(a) !== cuando(b)) return cuando(a) - cuando(b);
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    })
    .slice(0, MAX_PUBLICAS);
};

/** Todo, vigente o no, para el panel. */
const listAll = async () => Promotion.find({}).sort({ priority: -1, createdAt: -1 }).lean();

const CAMPOS_EDITABLES = [
  "kind", "title", "summary", "image", "url", "ctaLabel",
  "accent", "active", "priority", "startsAt", "endsAt", "eventAt",
];

const aFecha = (valor) => {
  if (valor === null || valor === "" || valor === undefined) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Toma sólo los campos que se pueden editar; el resto del body se ignora. */
const saneado = (payload = {}) => {
  const datos = {};
  for (const campo of CAMPOS_EDITABLES) {
    if (payload[campo] === undefined) continue;
    if (campo === "startsAt" || campo === "endsAt" || campo === "eventAt") {
      datos[campo] = aFecha(payload[campo]);
    } else if (campo === "active") {
      datos[campo] = payload[campo] === true || payload[campo] === "true";
    } else if (campo === "priority") {
      datos[campo] = Number.parseInt(payload[campo], 10) || 0;
    } else {
      datos[campo] = typeof payload[campo] === "string" ? payload[campo].trim() : payload[campo];
    }
  }

  if (payload.sponsor && typeof payload.sponsor === "object") {
    datos.sponsor = {
      name: String(payload.sponsor.name || "").trim(),
      logo: String(payload.sponsor.logo || "").trim(),
    };
  }
  if (payload.place && typeof payload.place === "object") {
    datos.place = {
      city: String(payload.place.city || "").trim(),
      venue: String(payload.place.venue || "").trim(),
    };
  }
  // `sponsored` sólo se puede FORZAR a true. Que "ad" implique publicidad lo
  // resuelve el hook del modelo; acá se permite marcarlo también en un evento
  // (un evento auspiciado sigue siendo contenido pago).
  if (payload.sponsored !== undefined) {
    datos.sponsored = payload.sponsored === true || payload.sponsored === "true";
  }

  return datos;
};

const create = async (userId, payload) => {
  const promo = new Promotion({ ...saneado(payload), createdBy: userId });
  return promo.save();
};

const update = async (id, payload) => {
  const promo = await Promotion.findById(id);
  if (!promo) return null;
  Object.assign(promo, saneado(payload));
  return promo.save();
};

const remove = async (id) => {
  const res = await Promotion.deleteOne({ _id: id });
  return res.deletedCount > 0;
};

/**
 * Suma una impresión o un clic.
 *
 * `$inc` directo y sin leer nada: es el contador más concurrente de la app (cada
 * visitante que abre Descubrí suma una impresión) y leer-sumar-guardar perdería
 * cuentas en silencio. Nunca lanza: no medir una impresión no puede romper la
 * pantalla de nadie.
 */
const countEvent = async (id, tipo) => {
  const campo = tipo === "click" ? "clicks" : "impressions";
  try {
    await Promotion.updateOne({ _id: id }, { $inc: { [campo]: 1 } });
  } catch {
    // Ver arriba.
  }
};

module.exports = { listPublic, listAll, create, update, remove, countEvent };
