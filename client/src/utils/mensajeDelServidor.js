/**
 * El mensaje que el servidor mandó para un error del usuario (4xx), o el de respaldo.
 *
 * Los 4xx del servidor traen un texto pensado para mostrarse ("La cosecha tiene que ser un año
 * entre 1900 y 2027"). Los 5xx y las caídas de red NO: ahí el cuerpo no es para la persona, y se
 * usa `respaldo`.
 */
export const mensajeDelServidor = (error, respaldo) => {
  const status = error?.response?.status;
  if (!status || status >= 500) return respaldo;
  const data = error.response.data;
  const texto = data?.message || data?.error;
  return typeof texto === "string" && texto.trim() ? texto.trim() : respaldo;
};
