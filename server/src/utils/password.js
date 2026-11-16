/**
 * Reglas de fortaleza de contraseña, en un solo lugar.
 *
 * Vivían dentro de auth.controller.js y sólo las usaban el registro y el
 * restablecimiento. El cambio de contraseña desde el perfil NO validaba nada:
 * se podía pasar de una contraseña fuerte a "a" sin que el servidor se quejara.
 * Teniéndolas acá, las tres puertas usan las mismas reglas y no pueden divergir.
 */
const MIN_LENGTH = 8;

/**
 * El criterio ÚNICO para leer una contraseña de un body: tiene que ser un string y se le quitan los
 * espacios de los bordes. Login y registro ya hacían `trim`; restablecer y cambiar desde el perfil
 * no, así que quien restablecía con un espacio al final guardaba una contraseña con el espacio y
 * después no podía entrar (el login la recorta). Un objeto o lista devuelve "" (= faltante).
 */
const limpiarPassword = (valor) => (typeof valor === "string" ? valor.trim() : "");

const validatePasswordStrength = (password) => {
  const value = String(password || "");

  if (value.length < MIN_LENGTH) {
    return {
      valid: false,
      message: `La contraseña debe tener mínimo ${MIN_LENGTH} caracteres`,
    };
  }

  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) {
    return {
      valid: false,
      message: "La contraseña debe contener mayúsculas, minúsculas y números",
    };
  }

  return { valid: true };
};

module.exports = { validatePasswordStrength, limpiarPassword, MIN_LENGTH };
