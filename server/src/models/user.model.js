const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Autenticación
    email: {
      type: String,
      required: [true, "El email es obligatorio"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Obligatoria salvo para cuentas creadas con Google: ahí no hay
    // contraseña propia, sólo `googleId`. Nunca las dos cosas: una cuenta
    // agrega Google si el email ya existía, en vez de duplicarse.
    passwordHash: {
      type: String,
      required: [
        function () {
          return !this.googleId;
        },
        "La contraseña es obligatoria",
      ],
      select: false,
    },
    // Id estable de Google ("sub" del token) para cuentas creadas o
    // vinculadas con "Continuar con Google". `sparse` porque la mayoría de
    // los usuarios no lo tiene.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      select: false,
    },

    // Indexado: el panel de admin filtra por rol, y cada cambio de rol o
    // borrado de un admin cuenta `role: "admin"` para no dejar la app sin
    // ninguno — sin índice, esas dos consultas recorren toda la colección a
    // medida que crece la base de usuarios.
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },

    // Perfil de usuario
    firstName: {
      type: String,
      trim: true,
    },
    // Fecha de nacimiento. Obligatoria desde el registro: valida mayoría de edad
    // (app de vinos) y habilita features de cumpleaños/eventos a futuro.
    birthDate: {
      type: Date,
    },
    lastName: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    avatar: {
      type: String, // URL de foto de perfil
    },

    // Preferencias
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: "dark",
      },
      language: {
        type: String,
        enum: ["es", "en"],
        default: "es",
      },
      notifications: {
        email: { type: Boolean, default: true },
        suggestions: { type: Boolean, default: true },
      },
      // Gustos elegidos en el onboarding (personalizan sugerencias).
      favoriteTypes: { type: [String], default: [] },
      favoriteVarietals: { type: [String], default: [] },
    },

    // Fecha en que completó el onboarding inicial (null = todavía no).
    onboardedAt: {
      type: Date,
      default: null,
    },

    // Estadísticas
    stats: {
      // Caché, no fuente de verdad: quien necesite estos números los pide a
      // /users/stats o /wines/stats/summary, que los cuentan. Se mantienen acá
      // porque son baratos y evitan una agregación en caminos internos, pero un
      // contador que se lleva a mano en ocho lugares termina discrepando, y
      // discrepa en silencio.
      winesCount: { type: Number, default: 0 },
      tastedWines: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
    },

    // Timestamps
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    // Password reset
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
    },

    // Verificación de email. Igual mecánica que el reset de contraseña: el
    // token que viaja por el link nunca se guarda tal cual, sólo su hash — así
    // que ni un dump de la base alcanza para armar un link de verificación.
    // No hay ningún endpoint que reciba `emailVerified` del cliente: la única
    // forma de que pase a `true` es `verifyEmail`, y sólo con el token vigente.
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
  },
  {
    versionKey: false,
  }
);

// Métodos de instancia
userSchema.methods.comparePassword = async function (candidatePassword) {
  const bcrypt = require("bcryptjs");
  return await bcrypt.compare(candidatePassword, this.passwordHash);
};

userSchema.methods.hashPassword = async function (password) {
  const bcrypt = require("bcryptjs");
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

module.exports = mongoose.model("User", userSchema);
