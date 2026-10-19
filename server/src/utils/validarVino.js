/**
 * Validación de lo que llega al crear o editar un vino.
 *
 * Antes no había: cosecha 1899, precio negativo o un nombre de 100.000 caracteres entraban a la
 * base o reventaban en un 500 genérico ("Algo falló de nuestro lado"), sin decir qué corregir. Acá
 * se devuelve el PRIMER problema como un mensaje para mostrar tal cual, o `null` si está todo bien.
 *
 * Es validación de forma y rango, no de contenido: el texto raro (comillas, "<script>") no se
 * rechaza porque la UI siempre escapa; sólo se acota el largo.
 */
const MAX = { name: 120, line: 120, winery: 120, region: 120, varietal: 80, notes: 4000, text: 120 };

const vacio = (v) => v === undefined || v === null || v === "";

const entero = (v) => Number.isInteger(Number(v));

const validarVino = (body = {}, { parcial = false, ahora = new Date() } = {}) => {
  const b = body && typeof body === "object" ? body : {};
  const anioMax = ahora.getFullYear() + 1;

  if (!parcial || b.name !== undefined) {
    if (typeof b.name !== "string" && !(parcial && vacio(b.name))) return "El nombre del vino es obligatorio";
    if (typeof b.name === "string" && b.name.trim() === "") return "El nombre del vino es obligatorio";
  }

  for (const [campo, etiqueta, largoDe] of [
    ["name", "El nombre", "largo"],
    ["line", "La línea", "larga"],
    ["winery", "La bodega", "larga"],
    ["region", "La región", "larga"],
    ["varietal", "La uva", "larga"],
    ["notes", "Las notas", "largas"],
    ["cellarLocation", "La ubicación", "larga"],
    ["store", "El lugar de compra", "largo"],
  ]) {
    const limite = MAX[campo] || MAX.text;
    if (typeof b[campo] === "string" && b[campo].length > limite) {
      return `${etiqueta} ${etiqueta.startsWith("Las") ? "son" : "es"} demasiado ${largoDe} (máximo ${limite} caracteres)`;
    }
  }

  if (!vacio(b.vintage) && b.vintage !== 0) {
    const n = Number(b.vintage);
    if (!entero(b.vintage) || n < 1900 || n > anioMax) return `La cosecha tiene que ser un año entre 1900 y ${anioMax}`;
  }

  if (!vacio(b.rating)) {
    const n = Number(b.rating);
    if (!Number.isFinite(n) || n < 0 || n > 5) return "El puntaje tiene que estar entre 0 y 5";
  }

  if (!vacio(b.price)) {
    const n = Number(b.price);
    if (!Number.isFinite(n) || n < 0 || n > 100000000) return "El precio tiene que ser un número positivo";
  }

  if (!vacio(b.quantity)) {
    const n = Number(b.quantity);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return "La cantidad tiene que estar entre 0 y 100.000";
  }

  const desde = vacio(b.drinkFrom) ? null : Number(b.drinkFrom);
  const hasta = vacio(b.drinkUntil) ? null : Number(b.drinkUntil);
  for (const [n, etiqueta] of [[desde, "Beber desde"], [hasta, "Beber hasta"]]) {
    if (n !== null && (!entero(n) || n < 1900 || n > 2200)) return `${etiqueta} tiene que ser un año válido`;
  }
  if (desde !== null && hasta !== null && desde > hasta) return "\"Beber desde\" no puede ser posterior a \"Beber hasta\"";

  return null;
};

module.exports = { validarVino, MAX };
