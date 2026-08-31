// Puntúa una foto candidata a "foto pública" de un vino: ¿es realmente una
// botella/etiqueta de vino, y qué tan bien se ve?
//
// Existe para separar dos cosas que antes vivían juntas: la LECTURA de una
// etiqueta (vision.service.js, que extrae bodega/nombre/uva y es cara) del
// JUICIO sobre si una foto merece ser la cara pública de un vino para todo el
// mundo (esto, mucho más barato porque no extrae ningún dato).
//
// Gated igual que el resto de la integración con Gemini: sin GEMINI_API_KEY, o
// si la imagen no es un data URL recién subido, esto no hace nada y
// wineImages.service.js sigue con el comportamiento de siempre (primera foto
// que llega, sin puntaje).

const { generateJson, isGeminiConfigured } = require("./gemini.service");

const TIMEOUT_MS = 8000;
const BUDGET_MS = 12000;

const PROMPT = `Sos un editor de fotos evaluando si una imagen sirve como la foto
PÚBLICA de un vino en una app (la que ve cualquier persona que busque ese vino,
no sólo quien la subió).

isWinePhoto: true sólo si la imagen muestra con claridad una botella de vino o
su etiqueta. false para cualquier otra cosa (una persona, un plato de comida,
una pantalla, un dibujo sin relación, o una foto tan borrosa/oscura que no se
distingue una botella).

quality: 0-100, qué tan buena es como foto pública. Considerá encuadre (la
botella o etiqueta entra completa, no cortada ni de canto), nitidez, luz y que
no haya elementos que distraigan (dedos, otros objetos, reflejos fuertes). No
hace falta que se lea el texto de la etiqueta para puntuar alto: alcanza con
que la botella se vea bien.

Si isWinePhoto es false, quality tiene que ser 0.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isWinePhoto: { type: "boolean" },
    quality: { type: "integer" },
  },
  required: ["isWinePhoto", "quality"],
};

// Sólo data URL: una URL http la tendríamos que ir a buscar nosotros para
// leerla, y salir a pedir lo que alguien pegó en un campo de texto es un lío
// (SSRF) que no vale la pena para esto — esas quedan sin puntaje, como si
// Gemini no estuviera configurado.
const DATA_URL = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/**
 * Puntúa una imagen. Devuelve `{ isWinePhoto, quality }` o `null` si no se
 * pudo puntuar por cualquier motivo — Gemini no configurado, la imagen no es
 * un data URL, timeout, error de red. Nunca lanza: puntuar es una mejora
 * sobre el pool compartido, no un requisito para guardar la foto de nadie.
 */
const scorePhoto = async (image) => {
  if (!isGeminiConfigured()) return null;
  const match = DATA_URL.exec(String(image || "").trim());
  if (!match) return null;

  try {
    const parsed = await generateJson({
      parts: [{ text: PROMPT }, { inline_data: { mime_type: match[1], data: match[2] } }],
      schema: RESPONSE_SCHEMA,
      timeoutMs: TIMEOUT_MS,
      budgetMs: BUDGET_MS,
      task: "vision",
    });

    const isWinePhoto = parsed?.isWinePhoto !== false;
    const rawQuality = Number(parsed?.quality);
    const quality = isWinePhoto && Number.isFinite(rawQuality) ? Math.max(0, Math.min(100, Math.round(rawQuality))) : 0;

    return { isWinePhoto, quality };
  } catch {
    return null;
  }
};

module.exports = { isVisionConfigured: isGeminiConfigured, scorePhoto };
