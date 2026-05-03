const mongoose = require("mongoose");

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

const lugarSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, "El nombre es obligatorio"],
      trim: true,
    },
    descripcion: {
      type: String,
      required: [true, "La descripcion es obligatoria"],
      trim: true,
    },
    categoria: {
      type: String,
      required: [true, "La categoria es obligatoria"],
      trim: true,
      lowercase: true,
      enum: {
        values: categoriasValidas,
        message: "Categoria invalida",
      },
    },
    ciudad: {
      type: String,
      required: [true, "La ciudad es obligatoria"],
      trim: true,
    },
    direccion: {
      type: String,
      required: [true, "La direccion es obligatoria"],
      trim: true,
    },
    ubicacion: {
      latitud: {
        type: Number,
        required: [true, "La latitud es obligatoria"],
        min: [-90, "La latitud debe estar entre -90 y 90"],
        max: [90, "La latitud debe estar entre -90 y 90"],
      },
      longitud: {
        type: Number,
        required: [true, "La longitud es obligatoria"],
        min: [-180, "La longitud debe estar entre -180 y 180"],
        max: [180, "La longitud debe estar entre -180 y 180"],
      },
    },
    imagenes: {
      type: [String],
      default: [],
    },
    contacto: {
      telefono: {
        type: String,
        trim: true,
      },
      instagram: {
        type: String,
        trim: true,
      },
      sitioWeb: {
        type: String,
        trim: true,
      },
    },
    operativa: {
      eventoFecha: {
        type: Date,
      },
      cuposDisponibles: {
        type: Number,
        min: 0,
      },
      precioPorCopa: {
        type: Number,
        min: 0,
      },
      reservaUrl: {
        type: String,
        trim: true,
      },
      reservaWhatsapp: {
        type: String,
        trim: true,
      },
      horarioHoy: {
        type: String,
        trim: true,
      },
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },
    creadoEn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("Lugar", lugarSchema);
