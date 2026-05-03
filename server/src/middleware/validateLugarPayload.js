const categoriasValidas = [
  "vinoteca",
  "winebar",
  "degustacion",
  "bodega",
  "feria_vino",
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

const isValidUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const isValidWhatsapp = (value = "") => {
  const normalized = String(value).trim();
  if (!normalized) {
    return false;
  }

  const compactPhone = normalized.replace(/[\s()-]/g, "");
  if (/^\+?\d{7,18}$/.test(compactPhone)) {
    return true;
  }

  if (isValidUrl(normalized)) {
    return /wa\.me|api\.whatsapp\.com|whatsapp\.com/i.test(normalized);
  }

  return false;
};

const normalizeCategoria = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const validateLugarPayload = (req, res, next) => {
  const { nombre, descripcion, categoria, ciudad, direccion, ubicacion, imagenes, rating, contacto, operativa } = req.body;
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

  const telefono = String(contacto?.telefono || "").trim();
  const instagramRaw = String(contacto?.instagram || "").trim();
  const sitioWeb = String(contacto?.sitioWeb || "").trim();

  if (telefono && !/^[+\d\s()-]{7,20}$/.test(telefono)) {
    errors.push("Telefono invalido. Usa solo numeros, espacios y +.-() ");
  }

  if (instagramRaw) {
    const normalizedInstagram = instagramRaw.replace(/^@/, "");
    const isInstagramHandle = /^[a-zA-Z0-9._]{1,30}$/.test(normalizedInstagram);
    const isInstagramUrl = isValidUrl(instagramRaw) && instagramRaw.includes("instagram.com");

    if (!isInstagramHandle && !isInstagramUrl) {
      errors.push("Instagram invalido. Usa @usuario o URL de Instagram.");
    }
  }

  if (sitioWeb && !isValidUrl(sitioWeb)) {
    errors.push("Sitio web invalido. Debe comenzar con http:// o https://");
  }

  const eventoFechaRaw = String(operativa?.eventoFecha || "").trim();
  const cuposRaw = operativa?.cuposDisponibles;
  const precioPorCopaRaw = operativa?.precioPorCopa;
  const reservaUrlRaw = String(operativa?.reservaUrl || "").trim();
  const reservaWhatsappRaw = String(operativa?.reservaWhatsapp || "").trim();
  const horarioHoyRaw = String(operativa?.horarioHoy || "").trim();

  let eventoFecha = undefined;
  if (eventoFechaRaw) {
    const parsedDate = new Date(eventoFechaRaw);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push("Fecha de evento invalida.");
    } else {
      eventoFecha = parsedDate;
    }
  }

  let cuposDisponibles = undefined;
  if (cuposRaw !== undefined && cuposRaw !== null && String(cuposRaw).trim() !== "") {
    const parsed = Number(cuposRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push("Cupos disponibles debe ser un numero entero mayor o igual a 0.");
    } else {
      cuposDisponibles = parsed;
    }
  }

  let precioPorCopa = undefined;
  if (precioPorCopaRaw !== undefined && precioPorCopaRaw !== null && String(precioPorCopaRaw).trim() !== "") {
    const parsed = Number(precioPorCopaRaw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push("Precio por copa invalido.");
    } else {
      precioPorCopa = Number(parsed.toFixed(2));
    }
  }

  if (reservaUrlRaw && !isValidUrl(reservaUrlRaw)) {
    errors.push("Reserva URL invalida. Debe comenzar con http:// o https://");
  }

  if (reservaWhatsappRaw && !isValidWhatsapp(reservaWhatsappRaw)) {
    errors.push("Reserva WhatsApp invalido. Usa telefono o enlace de WhatsApp.");
  }

  if (horarioHoyRaw && (horarioHoyRaw.length < 3 || horarioHoyRaw.length > 90)) {
    errors.push("Horario de hoy invalido. Debe tener entre 3 y 90 caracteres.");
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
    contacto: {
      telefono: telefono || undefined,
      instagram: instagramRaw || undefined,
      sitioWeb: sitioWeb || undefined,
    },
    operativa: {
      eventoFecha,
      cuposDisponibles,
      precioPorCopa,
      reservaUrl: reservaUrlRaw || undefined,
      reservaWhatsapp: reservaWhatsappRaw || undefined,
      horarioHoy: horarioHoyRaw || undefined,
    },
    rating: normalizedRating,
  };

  return next();
};

module.exports = validateLugarPayload;
