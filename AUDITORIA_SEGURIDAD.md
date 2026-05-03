# 🔐 Auditoría de Seguridad - Autenticación Rincones

**Fecha**: 29 de abril de 2026  
**Versión**: 1.0  
**Estado**: ✅ SEGURO (con mejoras recomendadas)

---

## 1️⃣ ANÁLISIS DE TOKENS JWT

### ✅ Aspectos Correctos:
- **Algoritmo**: HS256 (seguro para desarrollo/pequeño)
- **Validación**: JWT verificado en cada request autenticado
- **Expiración**: 7 días (14.4.26 horas)
- **Payload contiene**: `sub` (user ID), `email`, `role`
- **Error handling**: Rechaza tokens inválidos/expirados (401)

### ⚠️ Mejoras Recomendadas:

#### 1. Cambiar a RS256 para Producción
```javascript
// ACTUAL (desarrollo)
jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" })

// RECOMENDADO (producción)
jwt.sign(payload, privateKey, { 
  algorithm: "RS256",
  expiresIn: "7d" 
})
```

#### 2. Agregar Refresh Tokens
```javascript
// Emitir dos tokens:
const accessToken = jwt.sign(payload, secret, { expiresIn: "1h" })
const refreshToken = jwt.sign({ sub }, refreshSecret, { expiresIn: "30d" })
// Guardar refreshToken en BD con hash
// Cliente guarda en httpOnly cookie (no accesible por JS)
```

#### 3. Implementar Token Rotation
```javascript
// Cada uso de refreshToken genera nuevo accessToken + refreshToken
// Invalida token anterior
```

---

## 2️⃣ ANÁLISIS DE CONTRASEÑAS

### ✅ Aspectos Correctos:
- **Hash**: bcryptjs (10 rounds)
- **Nunca en texto plano**: passwordHash tiene `select: false`
- **Validación**: Mínimo 6 caracteres
- **Comparación**: bcrypt.compare() seguro contra timing attacks

### ⚠️ Mejoras Recomendadas:

#### 1. Aumentar Requisitos de Contraseña
```javascript
// ACTUAL
if (password.length < 6) {
  return res.status(400).json({ message: "Mínimo 6 caracteres" })
}

// RECOMENDADO
const passwordStrength = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
if (!passwordStrength.test(password)) {
  return res.status(400).json({
    message: "Mínimo 8 caracteres, mayúscula, minúscula, número"
  })
}
```

#### 2. Implementar Rate Limiting en Login
```javascript
// Prevenir brute force
const loginAttempts = new Map()

function recordLoginAttempt(email) {
  const now = Date.now()
  if (!loginAttempts.has(email)) {
    loginAttempts.set(email, [])
  }
  loginAttempts.get(email).push(now)
  
  // Limpiar intentos antiguos (> 15 minutos)
  const recent = loginAttempts.get(email)
    .filter(time => now - time < 15 * 60 * 1000)
  
  loginAttempts.set(email, recent)
  return recent.length
}

// En login controller
const attempts = recordLoginAttempt(email)
if (attempts > 5) {
  return res.status(429).json({ 
    message: "Demasiados intentos. Intenta en 15 minutos" 
  })
}
```

---

## 3️⃣ ANÁLISIS DE HEADERS DE SEGURIDAD

### ❌ FALTA: Headers HTTP Críticos

#### 1. Agregar Helmet.js
```bash
npm install helmet
```

```javascript
// server.js
const helmet = require("helmet")
app.use(helmet())
// Activa automáticamente:
// - X-Content-Type-Options: nosniff
// - X-Frame-Options: DENY
// - Strict-Transport-Security: max-age=31536000
// - etc.
```

#### 2. Implementar HSTS
```javascript
app.use(helmet.hsts({
  maxAge: 31536000, // 1 año
  includeSubDomains: true,
  preload: true
}))
```

---

## 4️⃣ ANÁLISIS DE CORS

### ✅ Aspectos Correctos:
- CORS configurado
- Solo localhost en desarrollo
- Permite Vercel previews en producción

### ⚠️ Mejoras Recomendadas:

```javascript
// ACTUAL
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true)
    }
    // ...
  }
}

// RECOMENDADO: Agregar credenciales
const corsOptions = {
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(","),
  credentials: true, // Permite cookies
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // Cache 24h
}
```

---

## 5️⃣ ANÁLISIS DE SESIÓN Y COOKIES

### ❌ RIESGO: Token en localStorage

#### Problema:
```javascript
// ACTUAL (inseguro)
localStorage.setItem("rincones_admin_token", token)
// Vulnerable a: XSS, CSRF
```

#### Solución (httpOnly Cookies):
```javascript
// Backend: Establecer cookie
res.cookie("authToken", token, {
  httpOnly: true,      // NO accesible por JavaScript
  secure: true,        // Solo HTTPS
  sameSite: "strict",  // Protege CSRF
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
})

// Frontend: El navegador envía automáticamente en cada request
// No se necesita JavaScript
```

#### Migración de localStorage a cookies:

```javascript
// server.js (auth.controller.js)
const login = async (req, res) => {
  // ... validación ...
  
  const token = jwt.sign(payload, secret, { expiresIn: "7d" })
  
  // Guardar en httpOnly cookie
  res.cookie("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000
  })
  
  res.json({
    success: true,
    data: { user }
  })
}
```

```javascript
// client/src/services/api.js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || fallbackApiUrl,
  timeout: 12000,
  withCredentials: true, // Incluye cookies automáticamente
})

// NO necesita más setear Authorization header manualmente
```

---

## 6️⃣ ANÁLISIS DE VALIDACIÓN

### ✅ Aspectos Correctos:
- Email validado por mongoose
- Role es enum (solo "user" o "admin")
- Filtro por userId previene acceso a datos de otros

### ⚠️ Mejoras:

```javascript
// Agregar validación de email real
const isValidEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

// Más validación en registro
router.post("/register", async (req, res) => {
  const { email, password, firstName } = req.body
  
  // Validar email
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Email inválido" })
  }
  
  // Validar firstName
  if (!firstName || firstName.length < 2) {
    return res.status(400).json({ message: "Nombre muy corto" })
  }
  
  // Verificar email único
  const exists = await User.findOne({ email })
  if (exists) {
    return res.status(409).json({ message: "Email ya registrado" })
  }
  
  // ... resto
})
```

---

## 7️⃣ ANÁLISIS DE ROLES Y PERMISOS

### ✅ Aspectos Correctos:
- Separación clara user/admin
- `requireAdmin` middleware valida role
- Nuevos usuarios crean con role: "user" (no admin)
- Cada usuario solo ve sus propios datos

### ❌ Riesgo Potencial:

```javascript
// ANTES (inseguro en frontend)
isAdmin: user?.role === "admin" // ❌ Client-side, fácil de falsificar

// DESPUÉS (validar siempre en backend)
// Backend: SIEMPRE verificar requireAdmin middleware
// Frontend: Solo usar para UI (mostrar/ocultar botones)
```

---

## 8️⃣ GOOGLE OAUTH 2.0 - IMPLEMENTACIÓN SEGURA

### Arquitectura Recomendada:

```javascript
// Backend flow (más seguro que frontend)
/*
1. Frontend redirige a: /api/auth/google/callback?code=XXX
2. Backend verifica code con Google API (secreto guardado en servidor)
3. Backend recibe user info
4. Backend crea/actualiza user en BD
5. Backend genera JWT propio
6. Backend devuelve JWT en httpOnly cookie
7. Frontend redirige a /
*/
```

### Instalación:

```bash
npm install @react-oauth/google
npm install passport-google-oauth20 (backend)
```

### Implementación Backend:

```javascript
// server/.env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx

// server/controllers/auth.controller.js
const { OAuth2Client } = require("google-auth-library")

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:4000/api/auth/google/callback"
)

const googleAuth = async (req, res, next) => {
  try {
    const { token } = req.body
    
    // Verificar token con Google
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    })
    
    const payload = ticket.getPayload()
    const { email, name, picture } = payload
    
    // Buscar o crear usuario
    let user = await User.findOne({ email })
    
    if (!user) {
      user = await User.create({
        email,
        firstName: name.split(" ")[0],
        lastName: name.split(" ")[1] || "",
        avatar: picture,
        googleId: payload.sub,
        role: "user"
      })
    }
    
    // Generar JWT propio
    const jwtToken = jwt.sign(
      { sub: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )
    
    // Guardar en httpOnly cookie
    res.cookie("authToken", jwtToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    })
    
    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          role: user.role
        }
      }
    })
  } catch (error) {
    return next(error)
  }
}
```

### Implementación Frontend:

```javascript
// client/src/pages/LoginPage.jsx
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google"

export default function LoginPage() {
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const response = await api.post("/auth/google", {
        token: credentialResponse.credential
      })
      
      // Token ya está en httpOnly cookie (automático)
      // Redirigir a home
      navigate("/")
    } catch (error) {
      showError("Error con Google: " + error.message)
    }
  }
  
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <div className="login-container">
        {/* ... */}
        <GoogleLogin 
          onSuccess={handleGoogleSuccess}
          onError={() => showError("Login fallido")}
        />
      </div>
    </GoogleOAuthProvider>
  )
}
```

---

## 9️⃣ CHECKLIST DE SEGURIDAD INMEDIATA

### 🔴 CRÍTICO (Implementar ahora):
- [ ] Cambiar tokens de localStorage a httpOnly cookies
- [ ] Agregar helmet.js
- [ ] Implementar rate limiting en login
- [ ] Validación fuerte de contraseñas

### 🟡 IMPORTANTE (Próximas 2 semanas):
- [ ] Cambiar a RS256 para JWT
- [ ] Implementar refresh tokens
- [ ] Agregar HSTS headers
- [ ] Email verification en registro

### 🟢 RECOMENDADO (Largo plazo):
- [ ] Google OAuth 2.0
- [ ] 2FA/MFA
- [ ] OWASP compliance
- [ ] Audit logs

---

## 🔟 RESUMEN DE SEGURIDAD ACTUAL

| Aspecto | Estado | Riesgo | Acción |
|---------|--------|--------|--------|
| JWT | ✅ | 🟢 Bajo | Monitorear |
| Contraseñas | ✅ | 🟢 Bajo | Mejorar requisitos |
| Headers | ❌ | 🔴 Alto | Agregar helmet |
| Cookies | ❌ | 🔴 Alto | Cambiar localStorage |
| Rate limiting | ❌ | 🔴 Alto | Implementar |
| CORS | ✅ | 🟢 Bajo | Mejorar credenciales |
| Validación | ✅ | 🟢 Bajo | Validación de email |
| Roles | ✅ | 🟢 Bajo | Monitorear |

---

## 📚 Referencias

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8949)
- [HTTP Security Headers](https://owasp.org/www-project-secure-headers/)
- [NIST Password Guidelines](https://pages.nist.gov/800-63-3/sp800-63b.html)
