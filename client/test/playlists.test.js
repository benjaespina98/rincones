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

import { musicaDelVino, youtubeUrl } from "../src/data/playlists";

describe("musicaDelVino: una frase y una playlist, sin elegir nada", () => {
  it("siempre devuelve frase y playlist, con o sin plan, con o sin ficha", () => {
    for (const type of ["red", "white", "sparkling", "rosé", "unknown", undefined]) {
      for (const plan of [null, "cena", "asado", "inventado"]) {
        const m = musicaDelVino(type, null, plan, 21);
        expect(m.frase, `${type}/${plan}`).toBeTruthy();
        expect(m.playlist.id).toMatch(/^[A-Za-z0-9]+$/);
      }
    }
  });

  it("el plan elegido manda sobre la hora: la frase y la lista lo siguen", () => {
    const asado = musicaDelVino("red", null, "asado", 21);
    expect(asado.frase).toMatch(/asado/i);
    expect(asado.playlist).toEqual(playlistFor("asado", "red", 21));
  });

  it("sin plan, el espumante y el tinto de cuerpo no reciben la misma frase", () => {
    expect(musicaDelVino("sparkling", null, null, 21).frase).not.toBe(musicaDelVino("red", null, null, 21).frase);
  });

  it("la búsqueda de YouTube lleva el nombre de la playlist, bien codificado", () => {
    const url = youtubeUrl({ name: "Jazz Vibes" });
    expect(url).toBe("https://www.youtube.com/results?search_query=Jazz%20Vibes%20playlist");
  });
});

describe("musicaDelVino: la frase no miente sobre el tipo de vino", () => {
  it("un blanco o un naranjo con cuerpo no se llama tinto", () => {
    const m = musicaDelVino("white", { body: 4 }, null, 22);
    expect(m.frase).not.toMatch(/tinto/i);
    expect(musicaDelVino("red", { body: 4 }, null, 22).frase).toMatch(/tinto/i);
  });
});
