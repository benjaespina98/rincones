// Utilidades de fecha de nacimiento / edad.
// Compartidas entre el registro (validar mayoría de edad) y el perfil.

const MIN_AGE = 18; // app de vinos: mayoría de edad en Argentina

// Parsea una fecha de nacimiento (string ISO "YYYY-MM-DD" o Date) a un Date
// válido. Devuelve null si no es una fecha real.
const parseBirthDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

// Edad en años cumplidos a partir de una fecha de nacimiento. null si inválida.
const calculateAge = (value) => {
  const birth = parseBirthDate(value);
  if (!birth) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
};

// Valida una fecha de nacimiento para el registro.
// { valid, message?, date? }
const validateBirthDate = (value) => {
  const date = parseBirthDate(value);
  if (!date) {
    return { valid: false, message: "La fecha de nacimiento es obligatoria y debe ser válida" };
  }

  // Nada en el futuro ni fechas absurdas (>120 años).
  const now = new Date();
  if (date > now) {
    return { valid: false, message: "La fecha de nacimiento no puede ser futura" };
  }
  const age = calculateAge(date);
  if (age > 120) {
    return { valid: false, message: "Ingresá una fecha de nacimiento válida" };
  }
  if (age < MIN_AGE) {
    return { valid: false, message: `Tenés que ser mayor de ${MIN_AGE} años para usar Rincones` };
  }

  return { valid: true, date };
};

module.exports = { MIN_AGE, parseBirthDate, calculateAge, validateBirthDate };
