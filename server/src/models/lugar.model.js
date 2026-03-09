const mongoose = require("mongoose");

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
      },
      longitud: {
        type: Number,
        required: [true, "La longitud es obligatoria"],
      },
    },
    imagenes: {
      type: [String],
      default: [],
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
