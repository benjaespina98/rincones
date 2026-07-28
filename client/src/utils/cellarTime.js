/**
 * Cuánto hace que un vino está en tu cava, en lenguaje natural.
 *
 * Una cava se mide en años, no en fechas: "en cava hace 6 años" cuenta algo que
 * "12/03/2020" no cuenta, aunque sea el mismo dato. La fecha exacta queda en la
 * ficha para quien la quiera.
 *
 * Se calcula desde `createdAt`, que es cuándo el vino entró a tu bodega. Reponer
 * botellas NO la mueve: si lo tenés desde 2019 y comprás más hoy, lo seguís
 * teniendo desde 2019.
 */
export const tiempoEnCava = (desde, { corto = false } = {}) => {
  if (!desde) return "";
  const inicio = new Date(desde);
  if (Number.isNaN(inicio.getTime())) return "";

  const dias = Math.floor((Date.now() - inicio.getTime()) / 86400000);
  if (dias < 0) return "";
  // Menos de una semana no es "estar en cava", es haberlo traído recién.
  // En la tarjeta, un vino que llegó ayer no necesita etiqueta: ya está arriba
  // de todo en "Agregados hace poco". Repetirlo en cada fila es ruido.
  if (dias < 7) return corto ? "" : "Recién llegado";
  if (dias < 31) {
    const semanas = Math.floor(dias / 7);
    const t = `${semanas} ${semanas === 1 ? "semana" : "semanas"}`;
    return corto ? t : `En cava hace ${t}`;
  }
  if (dias < 365) {
    const meses = Math.max(1, Math.floor(dias / 30.44));
    const t = `${meses} ${meses === 1 ? "mes" : "meses"}`;
    return corto ? t : `En cava hace ${t}`;
  }
  const años = Math.floor(dias / 365.25);
  const t = `${años} ${años === 1 ? "año" : "años"}`;
  // En la tarjeta el espacio manda: "2 años" con el ícono de cava alcanza; la
  // frase completa vive en la ficha, donde hay lugar para leerla.
  return corto ? t : `En cava hace ${t}`;
};

/**
 * El stock, dicho como lo diría una persona.
 *
 * "Última botella" no es adorno: cambia la decisión de abrirla o guardarla, que
 * es justo lo que uno piensa parado frente a la cava.
 */
export const stockLabel = (cantidad) => {
  const n = Number(cantidad) || 0;
  if (n <= 0) return "Sin stock";
  if (n === 1) return "Última botella";
  return `${n} botellas`;
};
