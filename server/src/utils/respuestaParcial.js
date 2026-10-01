/**
 * Del JSON que Gemini va emitiendo de a pedazos, el texto de "answer" hasta donde
 * llegó.
 *
 * ── PARA QUÉ ────────────────────────────────────────────────────────────────
 * La respuesta del Sommelier es un objeto JSON ({ answer, picks, followups… }) y
 * Gemini lo escribe de corrido, de a trozos. Para mostrar la respuesta mientras se
 * escribe hay que sacar de ese JSON INCOMPLETO sólo el valor de "answer", ya
 * decodificado (con sus \n, \" y \uXXXX resueltos), sin esperar a que el objeto esté
 * cerrado. Un `JSON.parse` no sirve: falla hasta el último carácter.
 *
 * ── LO QUE TIENE QUE NO ROMPER ──────────────────────────────────────────────
 *   · Un escape cortado a la mitad (la barra invertida llegó y su letra no): se
 *     espera al siguiente trozo, no se emite una barra suelta.
 *   · Un \uXXXX incompleto: ídem.
 *   · Un "answer" que aparece DENTRO de otro texto (escapado: \"answer\"): no es la
 *     clave.
 *   · Sin la clave todavía (el modelo empezó por otro campo): texto vacío.
 *
 * Devuelve `{ texto, completa }`: `completa` es true cuando ya se cerró la comilla del
 * valor, o sea que no va a crecer más.
 */
const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };
const HEX4 = /^[0-9a-fA-F]{4}$/;

const extraerRespuestaParcial = (json) => {
  const entrada = String(json || "");
  const clave = /"answer"\s*:\s*"/.exec(entrada);
  if (!clave) return { texto: "", completa: false };

  let i = clave.index + clave[0].length;
  let texto = "";

  while (i < entrada.length) {
    const c = entrada[i];

    if (c === '"') return { texto, completa: true };

    if (c === "\\") {
      const siguiente = entrada[i + 1];
      if (siguiente === undefined) break; // el escape se cortó: se espera al próximo trozo
      if (siguiente === "u") {
        const hex = entrada.slice(i + 2, i + 6);
        if (!HEX4.test(hex)) break; // \uXXXX incompleto
        texto += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      }
      texto += ESCAPES[siguiente] ?? siguiente;
      i += 2;
      continue;
    }

    texto += c;
    i += 1;
  }

  return { texto, completa: false };
};

module.exports = { extraerRespuestaParcial };
