/**
 * Contadores de rate limiting compartidos, en Redis por REST (Upstash).
 *
 * En Vercel cada instancia tiene su memoria: los límites en RAM se multiplican por instancia y se
 * reinician en cada arranque en frío. Con `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` los
 * contadores son uno solo. Sin esas variables (desarrollo, tests) todo sigue en memoria como antes.
 *
 * Si Redis no contesta, se cuenta en memoria: se afloja el límite, no se cae el login.
 *
 * Sólo lo usan los límites sensibles (cuentas, mails, IA). El general queda en memoria para no gastar
 * comandos en cada pedido de la app.
 */
const crypto = require("crypto");
const { MemoryStore } = require("express-rate-limit");

const ESPERA_MS = 1000;
const AVISAR_CADA_MS = 60 * 1000;

let ultimoAviso = 0;
const avisar = (error) => {
  if (Date.now() - ultimoAviso < AVISAR_CADA_MS) return;
  ultimoAviso = Date.now();
  console.warn("[rate-limit] Redis no contesta, se cuenta en memoria:", error.message);
};

class AlmacenUpstash {
  constructor({ url, token, nombre, pedir = fetch }) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.pedir = pedir;
    this.localKeys = false;
    this.prefix = `rl:${process.env.NODE_ENV || "development"}:${nombre}:`;
    this.respaldo = new MemoryStore();
    this.windowMs = 60 * 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
    this.respaldo.init(options);
  }

  // La clave lleva IP y a veces el email: a Redis sólo va un HMAC, que sin el secreto no se puede adivinar.
  clave(key) {
    const secreto = process.env.JWT_SECRET || this.token;
    return this.prefix + crypto.createHmac("sha256", secreto).update(String(key)).digest("hex");
  }

  /** Varios comandos en una transacción. Devuelve los resultados en orden. */
  async transaccion(comandos) {
    const respuesta = await this.pedir(`${this.url}/multi-exec`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(comandos),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const filas = await respuesta.json();
    if (!Array.isArray(filas) || filas.some((f) => f.error)) throw new Error("respuesta inválida de Redis");
    return filas.map((f) => f.result);
  }

  /** `SET … NX` abre la ventana con su vencimiento; el resto cuenta dentro de ella. */
  abrirVentana(clave) {
    return ["SET", clave, 0, "PX", this.windowMs, "NX"];
  }

  async increment(key) {
    const clave = this.clave(key);
    try {
      const [, total, queda] = await this.transaccion([this.abrirVentana(clave), ["INCR", clave], ["PTTL", clave]]);
      return { totalHits: Number(total), resetTime: new Date(Date.now() + Math.max(Number(queda), 0)) };
    } catch (error) {
      avisar(error);
      return this.respaldo.increment(key);
    }
  }

  async decrement(key) {
    const clave = this.clave(key);
    try {
      const [, total] = await this.transaccion([this.abrirVentana(clave), ["DECR", clave]]);
      // La ventana pudo vencer entre el incremento y este descuento.
      if (Number(total) < 0) await this.transaccion([["INCR", clave]]);
    } catch (error) {
      avisar(error);
      await this.respaldo.decrement(key);
    }
  }

  async resetKey(key) {
    try {
      await this.transaccion([["DEL", this.clave(key)]]);
    } catch (error) {
      avisar(error);
    }
    await this.respaldo.resetKey(key);
  }
}

/** El `store` para un limitador, o `undefined` (memoria) si Redis no está configurado. */
const almacenCompartido = (nombre) => {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return url && token ? new AlmacenUpstash({ url, token, nombre }) : undefined;
};

module.exports = { almacenCompartido, AlmacenUpstash };
