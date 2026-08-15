import { describe, it, expect } from "vitest";
import { NIGHT_PLANS, playlistFor, playlistUrl } from "../src/data/playlists";

/**
 * Lo que estos tests protegen es que la playlist se sienta ELEGIDA.
 *
 * Antes cada plan devolvía una constante: "asado" era Soft Rock con cualquier
 * botella y a cualquier hora. Dos vinos distintos recibían la misma sugerencia y
 * eso se nota enseguida. Ahora entran el peso del vino y —donde cambia algo— la
 * hora, así que lo que hay que fijar es que esas señales de verdad muevan el
 * resultado.
 */
describe("playlistFor", () => {
  const NOCHE = 21;
  const TARDE = 15;

  it("devuelve una playlist real para todos los planes de la barra", () => {
    for (const { value, label } of NIGHT_PLANS) {
      const playlist = playlistFor(value, "red", NOCHE);
      expect(playlist, label).toBeTruthy();
      expect(playlist.id, label).toMatch(/^[A-Za-z0-9]+$/);
      expect(playlist.name, label).toBeTruthy();
      expect(playlist.mood, label).toBeTruthy();
    }
  });

  it("un plan desconocido no rompe: cae en la cena, que es el plan neutro", () => {
    expect(playlistFor("inventado", "red", NOCHE)).toEqual(playlistFor("cena", "red", NOCHE));
  });

  it("el vino cambia la música dentro del mismo plan", () => {
    // El caso que se rompía: mismo plan, dos botellas opuestas, misma playlist.
    const conEspumante = playlistFor("amigos", "sparkling", NOCHE);
    const conTinto = playlistFor("amigos", "red", NOCHE);
    expect(conEspumante).not.toEqual(conTinto);
  });

  it("el cuerpo de la ficha manda sobre el tipo: un tinto liviano no suena a tinto pesado", () => {
    const tintoPesado = playlistFor("amigos", "red", NOCHE, { body: 5 });
    const tintoLiviano = playlistFor("amigos", "red", NOCHE, { body: 2 });
    expect(tintoLiviano).not.toEqual(tintoPesado);
    // Sin ficha se cae al tipo, que es la aproximación de siempre.
    expect(playlistFor("amigos", "red", NOCHE)).toEqual(tintoPesado);
  });

  it("una estructura vacía o inservible no altera la lectura por tipo", () => {
    const porTipo = playlistFor("cena", "white", NOCHE);
    expect(playlistFor("cena", "white", NOCHE, null)).toEqual(porTipo);
    expect(playlistFor("cena", "white", NOCHE, {})).toEqual(porTipo);
    expect(playlistFor("cena", "white", NOCHE, { body: 0 })).toEqual(porTipo);
  });

  it("la hora desempata donde cambia algo, y no donde no cambia nada", () => {
    // Una copa solo a la tarde y una a medianoche no son la misma copa.
    expect(playlistFor("solo", "red", TARDE)).not.toEqual(playlistFor("solo", "red", NOCHE));
    // Una cena de a dos suena igual a las nueve que a las once: inventar una
    // diferencia acá sería precisión falsa.
    expect(playlistFor("cena", "red", 21)).toEqual(playlistFor("cena", "red", 23));
  });

  it("los planes no son todos la misma playlist con otro nombre", () => {
    const distintas = new Set(
      NIGHT_PLANS.map(({ value }) => playlistFor(value, "red", NOCHE).id)
    );
    expect(distintas.size).toBeGreaterThanOrEqual(3);
  });
});

describe("playlistUrl", () => {
  it("arma un link de Spotify que se puede abrir", () => {
    const url = playlistUrl(playlistFor("cena", "red", 21));
    expect(url).toMatch(/^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]+$/);
  });
});
