// Utilidades de fecha de nacimiento / edad (cliente).
// La validación fuerte vive en el server (server/src/utils/age.js); acá
// validamos antes de enviar para dar feedback inmediato.

export const MIN_AGE = 18;

export const calculateAge = (value) => {
  if (!value) return null;
  const birth = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
};

// Devuelve un mensaje de error si la fecha no sirve, o "" si es válida.
export const birthDateError = (value) => {
  if (!value) return "Ingresá tu fecha de nacimiento.";
  const birth = new Date(value);
  if (Number.isNaN(birth.getTime())) return "Fecha de nacimiento inválida.";
  if (birth > new Date()) return "La fecha no puede ser futura.";
  const age = calculateAge(birth);
  if (age > 120) return "Ingresá una fecha válida.";
  if (age < MIN_AGE) return `Tenés que ser mayor de ${MIN_AGE} años para usar Rincones.`;
  return "";
};

// "YYYY-MM-DD" del día en que se cumplen MIN_AGE años hoy: sirve como max del
// <input type="date"> para que el datepicker no ofrezca fechas de menores.
export const maxBirthDateForAge = (minAge = MIN_AGE) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAge);
  return d.toISOString().slice(0, 10);
};
