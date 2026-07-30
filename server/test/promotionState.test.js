const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseFecha,
  aFechaInput,
  estadoDe,
  urlSegura,
  imagenSegura,
  colorSeguro,
} = require("../src/utils/promotionState");

/**
 * Las reglas de una campaña, probadas sin base de datos.
 *
 * Son las que deciden si algo se muestra y a quién se le cobra por eso, así que
 * tienen que poder comprobarse sin depender de que alguien levante Mongo.
 */

test("una fecha sin hora es el día calendario argentino completo", () => {
  // Arranque: 00:00 en Argentina = 03:00 UTC. Antes se leía como 00:00 UTC, o sea
  // las 21:00 del día ANTERIOR: la campaña salía al aire un día antes.
  assert.equal(parseFecha("2026-08-01", "inicio").toISOString(), "2026-08-01T03:00:00.000Z");

  // Fin: el último milisegundo del día en Argentina. Antes un "hasta el 31 de
  // diciembre" se apagaba a las 21:00 del 30 y el anunciante perdía 27 horas
  // que había pagado.
  assert.equal(parseFecha("2026-12-31", "fin").toISOString(), "2027-01-01T02:59:59.999Z");
});

test("la ida y la vuelta de una fecha dan el mismo día", () => {
  // Si esto no se cumple, el formulario muestra un día distinto del que se cargó
  // cada vez que se abre para editar.
  for (const dia of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    assert.equal(aFechaInput(parseFecha(dia, "inicio")), dia, `inicio de ${dia}`);
    assert.equal(aFechaInput(parseFecha(dia, "fin")), dia, `fin de ${dia}`);
  }
});

test("una fecha vacía es null y no una fecha inválida", () => {
  for (const vacio of ["", null, undefined, "no es una fecha"]) {
    assert.equal(parseFecha(vacio), null);
  }
});

test("el estado de una campaña dice lo que la app hace", () => {
  const ahora = new Date("2026-08-15T12:00:00Z");

  assert.equal(estadoDe({ active: true }, ahora), "active", "sin fechas se muestra");
  assert.equal(
    estadoDe({ active: true, startsAt: new Date("2026-08-01"), endsAt: new Date("2026-09-01") }, ahora),
    "active"
  );
  assert.equal(
    estadoDe({ active: true, startsAt: new Date("2026-09-01") }, ahora),
    "scheduled",
    "todavía no arrancó"
  );
  assert.equal(estadoDe({ active: false }, ahora), "paused", "apagada a mano");
  assert.equal(
    estadoDe({ active: true, endsAt: new Date("2026-08-01") }, ahora),
    "ended",
    "la ventana ya cerró"
  );

  // Una campaña vencida se reporta como finalizada aunque además esté pausada:
  // decir "pausada" mandaría a prender un interruptor que no va a hacer nada.
  assert.equal(estadoDe({ active: false, endsAt: new Date("2026-08-01") }, ahora), "ended");
});

test("sólo se aceptan enlaces http(s) o internos", () => {
  assert.equal(urlSegura("https://bodega.com/promo"), "https://bodega.com/promo");
  assert.equal(urlSegura("/bodega"), "/bodega");
  assert.equal(urlSegura(""), "");

  // Lo que este control existe para frenar: el destino termina en `window.open`,
  // así que un esquema ejecutable ahí corre código en la sesión de quien toque la
  // tarjeta.
  assert.equal(urlSegura("javascript:alert(1)"), null);
  assert.equal(urlSegura("JavaScript:alert(1)"), null);
  assert.equal(urlSegura("data:text/html,<script>alert(1)</script>"), null);
  // Empieza con "/" y parecería interno, pero el navegador lo resuelve como otro
  // dominio.
  assert.equal(urlSegura("//sitio-ajeno.com"), null);

  // Una imagen sólo puede venir por http(s): no hay caso de uso interno.
  assert.equal(imagenSegura("/local.png"), null);
  assert.equal(imagenSegura("https://cdn.com/a.jpg"), "https://cdn.com/a.jpg");
});

test("el color de acento tiene que ser un color", () => {
  assert.equal(colorSeguro("#c6465f"), "#c6465f");
  assert.equal(colorSeguro("rgb(198, 70, 95)"), "rgb(198, 70, 95)");
  assert.equal(colorSeguro("crimson"), "crimson");
  assert.equal(colorSeguro(""), "");
  // Un valor que no resuelve no rompe nada visible: deja la tarjeta sin borde ni
  // botón, sin ningún error. Es peor que rechazarlo al guardar.
  assert.equal(colorSeguro("no-es-un-color-esto-es-largo"), null);
  assert.equal(colorSeguro("red; background: url(x)"), null);
});
