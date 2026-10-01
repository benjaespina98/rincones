/**
 * Los atajos de búsqueda de Descubrí ("Malbec", "Torrontés"…).
 *
 * ── QUÉ ESTABA MAL ──────────────────────────────────────────────────────────
 * Eran tres uvas fijas, las mismas en cada visita y para cada persona. Un atajo
 * que nunca cambia deja de leerse como una sugerencia y pasa a ser un adorno:
 * nadie los toca porque ya sabe lo que dicen.
 *
 * ── QUÉ HACE AHORA ──────────────────────────────────────────────────────────
 * Arma una selección distinta en cada visita, con tres criterios:
 *
 *   · LA ESTACIÓN. En Argentina el verano es de diciembre a marzo: ahí suben el
 *     Torrontés, el rosado y el espumante; en invierno, el Syrah, el Tannat y
 *     los reservas. Una sugerencia de otro clima se lee como si la app no mirara
 *     el calendario.
 *   · LO QUE YA TOMÁS. Las uvas que más aparecen en tu bodega pesan más: es la
 *     puerta de entrada más corta a algo que te va a gustar.
 *   · VARIEDAD FORZADA. Nunca más de dos tercios son tintos, porque con diez
 *     tintos en el pozo un sorteo parejo devolvería seis y la fila se leería como
 *     "sólo hay Malbec y parientes".
 *
 * El sorteo es PONDERADO sin repetición: lo que encaja pesa más, pero nada queda
 * descartado de antemano, así que dos visitas seguidas no dan lo mismo.
 *
 * Todas las entradas del pozo se verificaron contra el catálogo: devuelven ocho
 * resultados o más. Un atajo que termina en "no encontramos nada" es peor que no
 * tenerlo.
 */

/** `clima`: "calor" | "frio" | "todo". `tipo` alimenta el tope de tintos. */
const POZO = [
  { q: "Malbec", tipo: "red", clima: "todo" },
  { q: "Cabernet Franc", tipo: "red", clima: "todo" },
  { q: "Pinot Noir", tipo: "red", clima: "todo" },
  { q: "Bonarda", tipo: "red", clima: "todo" },
  { q: "Merlot", tipo: "red", clima: "todo" },
  { q: "Cabernet Sauvignon", tipo: "red", clima: "frio" },
  { q: "Syrah", tipo: "red", clima: "frio" },
  { q: "Tannat", tipo: "red", clima: "frio" },
  { q: "Petit Verdot", tipo: "red", clima: "frio" },
  { q: "Gran Reserva", tipo: "red", clima: "frio" },
  { q: "Torrontés", tipo: "white", clima: "calor" },
  { q: "Chardonnay", tipo: "white", clima: "todo" },
  { q: "Sauvignon Blanc", tipo: "white", clima: "calor" },
  { q: "Rosado", tipo: "rosé", clima: "calor" },
  { q: "Espumante", tipo: "sparkling", clima: "calor" },
];

/** Hemisferio sur: el verano cruza el cambio de año. `mes` va de 0 (enero) a 11. */
export const estacionDe = (mes) => {
  if (mes === 11 || mes <= 2) return "calor";
  if (mes >= 5 && mes <= 7) return "frio";
  return "todo";
};

const norm = (v) => String(v || "").trim().toLowerCase();

export const sugerenciasDeBusqueda = ({
  cantidad = 6,
  mes = new Date().getMonth(),
  uvasFrecuentes = [],
  excluir = [],
  azar = Math.random,
} = {}) => {
  const estacion = estacionDe(mes);
  const frecuentes = new Set(uvasFrecuentes.map(norm));
  const fuera = new Set(excluir.map(norm));
  const topeTintos = Math.ceil((cantidad * 2) / 3);

  const peso = (e) => {
    let p = 1;
    if (estacion !== "todo" && e.clima === estacion) p += 1.5;
    // Lo que es de OTRA estación pesa menos pero no cero: un tinto de peso en
    // verano no está mal, sólo es menos probable.
    if (estacion !== "todo" && e.clima !== "todo" && e.clima !== estacion) p -= 0.6;
    if (frecuentes.has(norm(e.q))) p += 1;
    return p;
  };

  // Las que se mostraban antes quedan para el final: "otras ideas" tiene que dar
  // otras. Si el pozo no alcanza (pidiendo muchas), se vuelve a ellas.
  const candidatas = [
    ...POZO.filter((e) => !fuera.has(norm(e.q))),
    ...POZO.filter((e) => fuera.has(norm(e.q))),
  ];
  const nuevas = candidatas.filter((e) => !fuera.has(norm(e.q))).length;

  const elegidas = [];
  let tintos = 0;
  const disponibles = [...candidatas];

  while (elegidas.length < Math.min(cantidad, POZO.length) && disponibles.length > 0) {
    // Mientras haya sin ver, se sortea sólo entre ellas.
    const universo = elegidas.length < nuevas ? disponibles.filter((e) => !fuera.has(norm(e.q))) : disponibles;
    const admisibles = universo.filter((e) => e.tipo !== "red" || tintos < topeTintos);
    const lista = admisibles.length > 0 ? admisibles : universo;
    if (lista.length === 0) break;

    const total = lista.reduce((suma, e) => suma + Math.max(peso(e), 0.2), 0);
    let tiro = azar() * total;
    let elegida = lista[lista.length - 1];
    for (const e of lista) {
      tiro -= Math.max(peso(e), 0.2);
      if (tiro <= 0) {
        elegida = e;
        break;
      }
    }

    elegidas.push(elegida);
    if (elegida.tipo === "red") tintos += 1;
    disponibles.splice(disponibles.indexOf(elegida), 1);
  }

  return elegidas.map((e) => e.q);
};
