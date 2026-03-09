const categoriasValidas = [
  "rio",
  "montana",
  "bar",
  "cafeteria",
  "restaurante",
  "mirador",
  "turistico",
];

const isNonEmptyString = (value, min = 1) => {
  return typeof value === "string" && value.trim().length >= min;
};

const normalizeCategoria = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const validateLugarPayload = (req, res, next) => {
  const { nombre, descripcion, categoria, ciudad, direccion, ubicacion, imagenes, rating } = req.body;
  const errors = [];

  if (!isNonEmptyString(nombre, 3)) {
    errors.push("El nombre debe tener al menos 3 caracteres.");
  }

  if (!isNonEmptyString(descripcion, 10)) {
    errors.push("La descripcion debe tener al menos 10 caracteres.");
  }

  const categoriaNormalizada = normalizeCategoria(categoria);

  if (!isNonEmptyString(categoria) || !categoriasValidas.includes(categoriaNormalizada)) {
    errors.push("La categoria es invalida.");
  }

  if (!isNonEmptyString(ciudad, 2)) {
    errors.push("La ciudad es obligatoria.");
  }

  if (!isNonEmptyString(direccion, 4)) {
    errors.push("La direccion es obligatoria.");
  }

  const lat = Number(ubicacion?.latitud);
  const lng = Number(ubicacion?.longitud);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    errors.push("La latitud debe estar entre -90 y 90.");
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    errors.push("La longitud debe estar entre -180 y 180.");
  }

  const normalizedRating = Number(rating ?? 0);
  if (!Number.isFinite(normalizedRating) || normalizedRating < 0 || normalizedRating > 5) {
    errors.push("El rating debe estar entre 0 y 5.");
  }

  if (imagenes !== undefined) {
    if (!Array.isArray(imagenes)) {
      errors.push("Imagenes debe ser un arreglo de strings.");
    } else if (!imagenes.every((img) => typeof img === "string" && img.trim().length > 0)) {
      errors.push("Cada imagen debe ser un string no vacio.");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Error de validacion",
      errors,
    });
  }

  req.body = {
    ...req.body,
    nombre: nombre.trim(),
    descripcion: descripcion.trim(),
    categoria: categoriaNormalizada,
    ciudad: ciudad.trim(),
    direccion: direccion.trim(),
    ubicacion: {
      latitud: lat,
      longitud: lng,
    },
    imagenes: Array.isArray(imagenes) ? imagenes.filter(Boolean) : [],
    rating: normalizedRating,
  };

  return next();
};

module.exports = validateLugarPayload;
