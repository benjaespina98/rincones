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

/** Los cuatro planes. El orden es el de la barra de chips. */
export const NIGHT_PLANS = [
  { value: "cena",   label: "Cena de a dos" },
  { value: "asado",  label: "Asado" },
  { value: "amigos", label: "Con amigos" },
  { value: "solo",   label: "Tranqui, solo" },
];

const BURBUJAS = new Set(["sparkling", "white", "rosé"]);

/**
 * Qué poner, según el plan y qué hay en la copa.
 *
 * El plan manda: con quién estás define el volumen de la noche mucho más que el
 * varietal. El vino desempata, y sólo donde de verdad cambia algo —un espumante
 * y un tinto de guarda no piden la misma mesa—.
 */
export const playlistFor = (plan, wineType, hour = new Date().getHours()) => {
  switch (plan) {
    case "asado":
      return PLAYLISTS.softRock;
    case "amigos":
      return BURBUJAS.has(wineType) ? PLAYLISTS.chillHits : PLAYLISTS.vivaLatino;
    case "solo":
      // Una copa a las 5 de la tarde y una a medianoche no son la misma copa.
      return hour < 19 ? PLAYLISTS.afternoonAcoustic : PLAYLISTS.peacefulPiano;
    case "cena":
    default:
      return BURBUJAS.has(wineType) ? PLAYLISTS.jazzClassics : PLAYLISTS.jazzVibes;
  }
};

export const playlistUrl = (playlist) => `https://open.spotify.com/playlist/${playlist.id}`;
