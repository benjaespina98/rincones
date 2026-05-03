# Guía de Permisos - Rincones

## Sistema de Roles

### Roles Disponibles:
- **`user`** (por defecto): Usuario común
  - Acceso a: bodega, perfil, configuración, mapa, comunidad
  - No puede: acceder a admin, cambiar roles de otros usuarios
  
- **`admin`**: Administrador
  - Acceso a: todo lo de usuario + agregar lugares, panel admin, cambiar roles
  - Puede: modificar roles de otros usuarios, ver logs

## Cambiar Rol de Usuario

### Opción 1: Usando curl (desde terminal)

```bash
# Cambiar usuario a admin
curl -X PUT http://localhost:4000/api/admin/users/USER_ID/role \
  -H "Authorization: Bearer TOKEN_DE_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'

# Cambiar usuario a usuario común
curl -X PUT http://localhost:4000/api/admin/users/USER_ID/role \
  -H "Authorization: Bearer TOKEN_DE_ADMIN" \
  -H "Content-Type: application/json" \
  -d '{"role": "user"}'
```

### Opción 2: Usando Postman

1. **Obtener lista de usuarios:**
   - Método: GET
   - URL: `http://localhost:4000/api/admin/users?page=1&limit=20`
   - Headers:
     - `Authorization: Bearer TOKEN_DE_ADMIN`
     - `Content-Type: application/json`

2. **Cambiar rol de usuario:**
   - Método: PUT
   - URL: `http://localhost:4000/api/admin/users/USER_ID/role`
   - Headers:
     - `Authorization: Bearer TOKEN_DE_ADMIN`
     - `Content-Type: application/json`
   - Body (JSON):
     ```json
     {
       "role": "admin"
     }
     ```

### Opción 3: Directamente en Base de Datos (MongoDB)

```javascript
// En MongoDB shell o Atlas
db.users.updateOne(
  { email: "usuario@example.com" },
  { $set: { role: "admin" } }
)
```

## Flujo de Permisos

### Registro Nuevo Usuario
```
POST /api/auth/register
├─ Crea usuario con role: "user"
├─ Genera token JWT
└─ Usuario es usuario común automáticamente
```

### Acceso a Rutas
```
Rutas Públicas (sin autenticación):
├─ /login
└─ /register

Rutas Privadas (token requerido):
├─ / (Home/Dashboard)
├─ /profile
├─ /settings
├─ /bodega
├─ /mapa
├─ /comunidad
└─ /lugares/:id

Rutas Admin (token + role admin):
├─ /agregar (agregar lugares)
└─ /admin (panel admin)
```

### Persistencia de Sesión
- Token se guarda en `localStorage` con clave: `rincones_admin_token`
- Al cerrar app: sesión se mantiene
- Al abrir app: 
  1. Se carga token de localStorage
  2. Se valida con GET `/api/auth/me`
  3. Si es válido: se restaura sesión
  4. Si es inválido: se limpia y redirige a login

## Validación de Permisos

### Backend
```javascript
// Middleware: authenticate
- Verifica Bearer token
- Extrae user.id y user.role
- Valida JWT

// Middleware: requireAdmin  
- Verifica que user.role === "admin"
- Si no: retorna 403 "Acceso denegado"
```

### Frontend
```javascript
// PrivateRoute
- Verifica token existe
- Si no: redirige a /login
- Permite: usuario común + admin

// ProtectedRoute
- Verifica isAdmin === true
- Si no: redirige a /admin
- Permite solo: admin
```

## Seguridad: Aislamiento de Datos

### Datos de Usuario (Solo acceso propio)
```javascript
wines.routes.js:      GET /api/wines → filtra { userId: req.user.id }
users.routes.js:      GET /api/users/profile → filtra { _id: req.user.id }
```

### Datos de Admin (Solo para admins)
```javascript
admin.routes.js:      GET /api/admin/users → requireAdmin middleware
admin.routes.js:      PUT /api/admin/users/:id/role → requireAdmin middleware
```

## Ejemplo: Crear Admin Inicial

Sí ya tienes una cuenta registrada y quieres hacerla admin:

**Terminal:**
```bash
# 1. Obtén tu token después de login (mira la consola del navegador)
# 2. Ejecuta:
curl -X PUT http://localhost:4000/api/admin/users/TU_USER_ID/role \
  -H "Authorization: Bearer TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

**O en MongoDB:**
```javascript
db.users.updateOne(
  { email: "tu@email.com" },
  { $set: { role: "admin" } }
)
```
