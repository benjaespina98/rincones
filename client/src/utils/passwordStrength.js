// Evalúa la fortaleza de una contraseña para el medidor visual (0..3).
export function passwordStrength(pw = "") {
  if (!pw) return { level: 0, label: "", cls: "" };

  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score += 1;

  const level = Math.min(3, Math.max(1, score - 0)); // 1..3
  const meta = {
    1: { label: "Débil", cls: "weak" },
    2: { label: "Aceptable", cls: "medium" },
    3: { label: "Fuerte", cls: "strong" },
  }[level];

  return { level, ...meta };
}

// Regla mínima que exige el backend: 8+, mayúscula, minúscula y número.
export function meetsPasswordPolicy(pw = "") {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}
