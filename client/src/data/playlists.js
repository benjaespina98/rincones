/**
 * La música del plan.
 *
 * ── POR QUÉ ESTÁN A MANO Y NO LAS ELIGE LA IA ───────────────────────────────
 * Una playlist tiene que sonar bien, no ser plausible. Un modelo puede inventar
 * un ID de Spotify que parece un ID de Spotify y lleva a un 404 — y una sugerencia
 * que no abre es peor que ninguna. Estas siete son playlists oficiales de Spotify,
 * verificadas una por una: existen, las mantiene Spotify y no dependen de nadie.
 *
 * Además es instantáneo: elegir el plan no dispara ninguna llamada. La receta —lo
 * único que sí necesita pensarse— se pide aparte y sólo si la tocás.
 *
 * ── POR QUÉ NO SE CREA UNA PLAYLIST DE VERDAD ───────────────────────────────
 * Armar una playlist en la cuenta del usuario exige conectar Spotify (OAuth):
 * un login más, permisos, tokens que vencen. Para "poné algo tranqui mientras
 * abro el vino" no se paga ese precio. El link abre la app de Spotify si está
 * instalada, y el navegador si no.
 */

const PLAYLISTS = {
  jazzVibes: {
    id: "37i9dQZF1DX0SM0LYsmbMT",
    name: "Jazz Vibes",
    mood: "instrumental, de fondo, sin que nadie tenga que levantar la voz",
  },
  jazzClassics: {
    id: "37i9dQZF1DXbITWG1ZJKYt",
    name: "Jazz Classics",
    mood: "los clásicos, para una mesa que se puso elegante sola",
  },
  softRock: {
    id: "37i9dQZF1DX6xOPeSOGone",
    name: "Soft Rock",
    mood: "los temas que todos se saben, para la parrilla",
  },
  vivaLatino: {
    id: "37i9dQZF1DX10zKzsJ2jva",
    name: "Viva Latino",
    mood: "arriba, para cuando la juntada agarra ritmo",
  },
  chillHits: {
    id: "37i9dQZF1DX4WYpdgoIcn6",
    name: "Chill Hits",
    mood: "conocidas pero suaves, para picotear y charlar",
  },
  afternoonAcoustic: {
    id: "37i9dQZF1DX4E3UdUs7fUx",
    name: "Afternoon Acoustic",
    mood: "guitarras y tarde larga",
  },
  peacefulPiano: {
    id: "37i9dQZF1DX4sWSpwq3LiO",
    name: "Peaceful Piano",
    mood: "piano y nada más, para bajar un cambio",
  },
};

/**
 * Los planes que se ofrecen en la ficha. El orden va de la mesa más chica a la
 * más grande: eso hace que la fila se lea sola.
 *
 * ── POR QUÉ SON CUATRO Y NO SEIS ───────────────────────────────────────────
 * Seis chips ocupaban tres renglones y media pantalla de una ficha que ya es
 * larga, y dos de ellos casi no se elegían: "copas y charla" y "tranqui, solo"
 * son los únicos sin comida de por medio, y el premio del plan —la receta— no
 * tiene nada que ofrecerles. Un chip cuya recompensa no aplica es un chip que
 * decepciona al tocarlo.
 *
 * Quedaron las cuatro mesas de verdad. `PLANES` sigue teniendo las seis: la
 * home nombra momentos ("Copas y charla", "Tranqui, solo") con las mismas
 * palabras, y sacarlos de la tabla dejaría esas playlists sin plan.
 *
 * Los valores viajan al server para la receta: cualquier plan que se agregue acá
 * tiene que existir también en `PLANS` de server/src/services/wineAi.service.js,
 * o la receta cae en "cena" y contradice al chip que tocaste.
 */
export const NIGHT_PLANS = [
  { value: "cena",    label: "Cena de a dos" },
  { value: "familia", label: "En familia" },
  { value: "amigos",  label: "Con amigos" },
  { value: "asado",   label: "Asado" },
];

const FRESCOS = new Set(["sparkling", "white", "rosé"]);

/**
 * Cuánto pesa lo que hay en la copa: liviano o denso.
 *
 * Es la única distinción del vino que le cambia algo a la música. Un espumante y
 * un Cabernet de guarda no piden la misma mesa, pero un Malbec y un Cabernet sí
 * —y elegir por varietal habría dado la ilusión de precisión sin ninguna—.
 *
 * `body` de la ficha (1-5) manda cuando está, porque describe a ESTA botella: un
 * Pinot liviano deja de sonar como un tinto pesado sólo por ser tinto. Sin ficha
 * se cae al tipo, que es la aproximación de siempre.
 */
const pesoDelVino = (wineType, structure) => {
  const cuerpo = Number(structure?.body);
  if (Number.isFinite(cuerpo) && cuerpo > 0) return cuerpo >= 3.5 ? "denso" : "liviano";
  return FRESCOS.has(wineType) ? "liviano" : "denso";
};

/**
 * Qué poner: el plan elige la familia, el vino elige el peso, la hora desempata.
 *
 * ── POR QUÉ NO ALCANZABA CON EL PLAN ────────────────────────────────────────
 * Antes "asado" devolvía Soft Rock siempre, con cualquier botella y a cualquier
 * hora. Dos vinos distintos en el mismo plan recibían exactamente la misma
 * sugerencia, y eso se nota: la playlist dejaba de parecer elegida y pasaba a
 * parecer una constante con nombre de plan.
 *
 * Ahora las tres señales que de verdad cambian la mesa entran las tres. La hora
 * sólo se consulta donde cambia algo real —un asado de mediodía y uno de noche
 * no suenan igual; una cena de a dos suena igual a las nueve que a las once—, y
 * donde no cambia nada no se usa, para no inventar precisión.
 */
const PLANES = {
  cena: {
    // De a dos: la música es fondo. Las burbujas piden algo con más vestido.
    liviano: () => PLAYLISTS.jazzClassics,
    denso: () => PLAYLISTS.jazzVibes,
  },
  copas: {
    // Sin comida: manda la charla, así que nada que pida atención.
    liviano: () => PLAYLISTS.chillHits,
    denso: () => PLAYLISTS.jazzVibes,
  },
  familia: {
    // Mesa larga. De día es sobremesa; de noche ya son los temas que todos se saben.
    liviano: () => PLAYLISTS.chillHits,
    denso: (hour) => (hour < 17 ? PLAYLISTS.afternoonAcoustic : PLAYLISTS.softRock),
  },
  amigos: {
    // Una juntada con un tinto de cuerpo termina arriba; con un blanco, picoteando.
    liviano: () => PLAYLISTS.chillHits,
    denso: () => PLAYLISTS.vivaLatino,
  },
  asado: {
    // El tinto y la parrilla son inseparables. Con algo fresco, y todavía con
    // luz, el asado es más largo y más tranquilo que el de la noche.
    liviano: (hour) => (hour < 19 ? PLAYLISTS.afternoonAcoustic : PLAYLISTS.chillHits),
    denso: () => PLAYLISTS.softRock,
  },
  solo: {
    // Acá el vino no cambia nada y la hora lo cambia todo: una copa a las cinco
    // de la tarde y una a medianoche no son la misma copa.
    liviano: (hour) => (hour < 19 ? PLAYLISTS.afternoonAcoustic : PLAYLISTS.peacefulPiano),
    denso: (hour) => (hour < 19 ? PLAYLISTS.afternoonAcoustic : PLAYLISTS.peacefulPiano),
  },
};

export const playlistFor = (plan, wineType, hour = new Date().getHours(), structure = null) => {
  const elegir = PLANES[plan] || PLANES.cena;
  return elegir[pesoDelVino(wineType, structure)](hour);
};

export const playlistUrl = (playlist) => `https://open.spotify.com/playlist/${playlist.id}`;

/* ── Las dos de la home ─────────────────────────────────────────────────────
 *
 * En la ficha de un vino la playlist depende del PLAN que elegiste, que es el
 * dato más fuerte que hay. En Descubrí no hay plan ni botella: lo único que se
 * sabe es qué hora es y qué día. Alcanza — un martes a las cuatro de la tarde y
 * un sábado a las once de la noche no piden lo mismo, y esa es justamente la
 * diferencia que una lista fija no puede hacer.
 *
 * Son DOS y no seis: dos se miran, seis se scrollean. Y las mismas siete
 * playlists oficiales verificadas de arriba, así que no hay ningún link nuevo
 * que se pueda romper.
 */
/**
 * ── PARA QUÉ MOMENTO ES CADA UNA ────────────────────────────────────────────
 *
 * La sección de música de Descubrí mostraba nombre y descripción —"Soft Rock ·
 * los temas que todos se saben, para la parrilla"— y nada que dijera CUÁNDO
 * ponerla. Sin eso son dos links a Spotify en una app de vino: la música sólo
 * significa algo pegada a una mesa.
 *
 * El momento sale de la misma decisión que ya elige la playlist (la hora y el
 * día), así que no se inventa nada: si a las nueve de la noche de un sábado
 * suena Viva Latino es porque estamos suponiendo una juntada, y eso es
 * exactamente lo que conviene decir en voz alta. Son los mismos planes que los
 * chips de la ficha (`NIGHT_PLANS`), para que la app nombre los momentos de una
 * sola manera.
 */
const con = (playlist, momento) => ({ ...playlist, momento });

export const suggestedPlaylists = (
  hour = new Date().getHours(),
  weekday = new Date().getDay()
) => {
  const finde = [5, 6, 0].includes(weekday);

  // Madrugada: cualquiera que siga despierto no quiere Viva Latino.
  if (hour < 7) {
    return [con(PLAYLISTS.peacefulPiano, "Tranqui, solo"), con(PLAYLISTS.jazzVibes, "Copas y charla")];
  }

  if (hour < 12) {
    return [con(PLAYLISTS.afternoonAcoustic, "Tranqui, solo"), con(PLAYLISTS.chillHits, "En familia")];
  }

  // Mediodía y primera tarde: mesa, sobremesa, luz.
  if (hour < 17) {
    return finde
      ? [con(PLAYLISTS.softRock, "Asado"), con(PLAYLISTS.afternoonAcoustic, "En familia")]
      : [con(PLAYLISTS.afternoonAcoustic, "Tranqui, solo"), con(PLAYLISTS.jazzVibes, "Copas y charla")];
  }

  // Tardecita: la hora en que se descorcha sin ser todavía de noche.
  if (hour < 20) {
    return [con(PLAYLISTS.chillHits, "Copas y charla"), con(PLAYLISTS.afternoonAcoustic, "Tranqui, solo")];
  }

  // Noche. El finde levanta el volumen; un miércoles, no.
  return finde
    ? [con(PLAYLISTS.vivaLatino, "Con amigos"), con(PLAYLISTS.jazzClassics, "Cena de a dos")]
    : [con(PLAYLISTS.jazzVibes, "Cena de a dos"), con(PLAYLISTS.peacefulPiano, "Tranqui, solo")];
};
