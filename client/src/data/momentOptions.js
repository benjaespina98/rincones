/**
 * Las ocasiones y los estados de ánimo de un momento.
 *
 * Vivían dentro de WineDetailPage, que era el único lugar donde se registraban
 * y se leían. Con el diario del perfil pasaron a leerse en dos pantallas, y una
 * lista de valores traducidos duplicada es la forma más común de que la misma
 * "celebration" aparezca como "Celebración" en un lado y como "celebration" en
 * el otro.
 *
 * Los `value` los guarda el server tal cual: no se renombran.
 */

export const OCCASIONS = [
  { value: "dinner", label: "Cena" },
  { value: "celebration", label: "Celebración" },
  { value: "gift", label: "Regalo" },
  { value: "tasting", label: "Degustación" },
  { value: "casual", label: "Casual" },
  { value: "other", label: "Otra" },
];

export const EMOTIONS = [
  { value: "happy", label: "Feliz" },
  { value: "relaxed", label: "Relajado" },
  { value: "social", label: "Social" },
  { value: "thoughtful", label: "Reflexivo" },
  { value: "adventurous", label: "Aventurero" },
];

const toLabels = (options) => Object.fromEntries(options.map((o) => [o.value, o.label]));

export const OCCASION_LABELS = toLabels(OCCASIONS);
export const EMOTION_LABELS = toLabels(EMOTIONS);
