const mongoose = require("mongoose");

// Catálogo comunitario: la identidad de cada vino que cargan los usuarios.
//
// Cuando alguien agrega un vino que no está en el catálogo curado, lo sumamos
// acá (nombre + bodega normalizados) para que aparezca en la búsqueda de todos.
// Sólo guardamos datos públicos del vino (no rating/notas/momentos, que son
// privados de cada usuario). La app se enriquece sola con el uso.
//
// ── POR QUÉ AHORA HAY UN ESTADO Y NO SÓLO UN CONTADOR ───────────────────────
// Antes esto tenía un único `count` que arrancaba en 1, y una fila con count 1
// ya era catálogo público: la buscaba cualquiera y salía RANQUEADA POR ENCIMA de
// lo que devuelve el modelo. O sea que un escaneo mal leído por una sola persona
// —el "Pispi" con bodega "Pispi"— se publicaba con más autoridad que Gemini y no
// había forma de distinguirlo de un dato bueno, ni de corregirlo, ni de saber de
// dónde había salido.
//
// Ahora una fila tiene procedencia y dos estados, que dicen cosas distintas:
//
//   published — ¿existe para los demás? Sí apenas la identidad alcanza para
//               nombrar una botella: hay nombre, hay bodega, y no son la misma
//               palabra (ver `identidadCompleta` en el servicio). NO mira con
//               cuánta confianza se leyó la etiqueta.
//   verified  — ¿tiene autoridad? Sí cuando hay dos contribuciones de personas
//               DISTINTAS y al menos una es confiable.
//
// ── POR QUÉ PUBLICAR NO ESPERA UNA SEGUNDA PERSONA ──────────────────────────
// La primera versión de esto pedía dos personas para publicar. Era una defensa
// bien pensada en el lugar equivocado: bloqueaba la EXISTENCIA en vez de la
// AUTORIDAD. Con un solo usuario la segunda persona no llega nunca, así que en
// la práctica ningún vino cargado por alguien aparecía jamás en la búsqueda —ni
// con su foto, que es lo que vuelve útil al resultado—. El vino quedaba en una
// fila real, invisible, esperando a nadie.
//
// La protección que importaba era la otra, y sigue intacta: `verified` es lo
// único que rankea por encima de lo que devuelve el modelo (SOURCE_RANK en
// catalog.service.js). Una lectura floja ahora aparece, pero abajo. Un dato malo
// no puede tapar uno bueno, que es lo que había que impedir.
const communityWineSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    winery: { type: String, default: "" },
    region: { type: String, default: "" },
    varietal: { type: String, default: "" },
    type: { type: String, default: "unknown" },
    image: { type: String, default: "" },
    // Cuántas veces se cargó en total (incluye recargas de la misma persona).
    count: { type: Number, default: 1 },

    /**
     * Quiénes lo cargaron, sin repetir.
     *
     * La INDEPENDENCIA es todo el valor de la segunda coincidencia: que la misma
     * persona escanee dos veces la misma botella no confirma nada —si leyó mal la
     * primera, va a leer mal la segunda—. Dos personas distintas llegando al
     * mismo nombre y la misma bodega por su cuenta, sí.
     *
     * Se guarda la lista y no un número porque el número no se puede
     * desduplicar después, y porque al corregir hay que poder sacar a UNA
     * persona sin tocar a las demás.
     */
    contributors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Cuántas de esas contribuciones venían con identificación confiable
    // (ver `identificationVerdict` en data/wineValidation.js).
    trustedCount: { type: Number, default: 0 },

    // De dónde salió: "scan" (foto), "manual" (tipeado), "mixed" (las dos).
    origin: { type: String, enum: ["scan", "manual", "mixed"], default: "scan" },

    // ¿Aparece en las búsquedas? Ver el comentario de arriba.
    published: { type: Boolean, default: false, index: true },

    // ¿Confirmada de forma independiente?
    verified: { type: Boolean, default: false },

    /**
     * Alguien confirmó a mano que este vino se llama igual que su bodega.
     *
     * Existe porque "nombre = bodega" es a la vez el error de lectura más común
     * —el nombre de fantasía va grande y la bodega chica, y el modelo copia el
     * mismo texto a los dos campos— y una situación perfectamente normal: Norton,
     * El Enemigo, Durigutti. El catálogo curado resuelve los que ya conocemos;
     * esto resuelve los que no, sin dejar a nadie sin salida.
     *
     * Se pega a la FILA y no a la contribución porque es una afirmación sobre el
     * vino, no sobre quién lo cargó: una vez que se sabe, se sabe.
     */
    sameNameOk: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Índice de texto para búsqueda rápida por nombre/bodega/varietal/región.
communityWineSchema.index({ name: "text", winery: "text", varietal: "text", region: "text" });

module.exports = mongoose.model("CommunityWine", communityWineSchema);
