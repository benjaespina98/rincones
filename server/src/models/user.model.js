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
    passwordHash: {
      type: String,
      required: [true, "La contraseña es obligatoria"],
      select: false,
    },
    
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
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
