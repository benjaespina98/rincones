# Rincones

**Tu bodega personal de vinos, siempre en el bolsillo.**

Aplicación web full-stack para llevar el registro de los vinos que tenés, los que
tomaste y los que querés probar. Le sacás una foto a la etiqueta, la app reconoce
el vino y lo suma a tu colección con su ficha completa.

Desarrollada con **React**, **Node.js**, **Express** y **MongoDB**, con
integración de inteligencia artificial (Google Gemini) para el reconocimiento de
etiquetas y la generación de fichas.

---

## Índice

- [Para qué sirve](#para-qué-sirve)
- [Funcionalidades](#funcionalidades)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Decisiones técnicas destacadas](#decisiones-técnicas-destacadas)
- [Instalación y uso](#instalación-y-uso)
- [Variables de entorno](#variables-de-entorno)
- [API REST](#api-rest)
- [Testing](#testing)
- [Despliegue](#despliegue)
- [Backups](#backups)
- [Monitoreo de errores](#monitoreo-de-errores)
- [Dominio propio](#dominio-propio)

---

## Para qué sirve

Quien toma vino con cierta frecuencia se encuentra siempre con los mismos tres
problemas: no se acuerda del nombre del que le gustó hace seis meses, no sabe qué
tiene en casa sin ir a mirar, y frente a una góndola de doscientas botellas no
tiene con qué decidir.

Rincones lo resuelve con tres ideas:

1. **Cargar un vino cuesta una foto.** Le sacás una foto a la etiqueta y la app la
   reconoce, la completa y la guarda. Sin formularios.
2. **La bodega es un diario, no un inventario.** Cada vino guarda con quién lo
   tomaste, dónde y qué te pareció. Eso es lo que después te hace acordar.
3. **Las recomendaciones salen de lo que tomás**, no de un ranking genérico.

Está pensada y escrita en **español rioplatense**, con foco en el mercado
argentino: catálogo de bodegas, uvas y regiones locales, precios en pesos y
referencias de compra en MercadoLibre.

---

## Funcionalidades

### Para el usuario

| Módulo | Qué hace |
|---|---|
| **Escaneo de etiquetas** | Foto → reconocimiento con IA (Gemini Vision) y OCR local de respaldo (Tesseract.js) → ficha completa |
| **Mi Bodega** | Colección con stock por lotes, vista de vitrina y de archivo, búsqueda, filtros combinables y selección múltiple para acciones en lote |
| **Ficha del vino** | Descripción generada con IA, perfil de sabor en barras comparables, aromas, maridajes, ventana de guarda y precio de referencia |
| **Momentos** | Registro de cada botella abierta: con quién, dónde, qué comiste y qué sentiste |
| **Descubrí** | Vino del día, recomendaciones según tu colección y espacio de destacados |
| **Guardados** | Lista de vinos que querés probar, separada del stock real |
| **Reseñas** | Puntaje y opinión pública por vino, con promedio de la comunidad |
| **Sommelier** | Buscador con catálogo curado + IA y sugerencias por maridaje |

### Para el administrador

| Módulo | Qué hace |
|---|---|
| **Resumen** | Usuarios, vinos cargados, reseñas y movimientos de las últimas 24 horas |
| **Métricas de uso** | Analítica propia: visitantes únicos, visitas, pantallas más vistas, dispositivos, orígenes de tráfico y franja horaria de mayor actividad |
| **Campañas** | Gestor de publicidades y eventos: programación por fechas, estados, prioridad y métricas por campaña |
| **Informe para anunciantes** | Enlace público de sólo lectura, exportable a PDF, con las métricas de una campaña y su metodología de medición |
| **Usuarios y roles** | Búsqueda, cambio de rol y baja de cuentas |
| **Moderación** | Revisión y baja de reseñas |
| **Auditoría** | Registro de altas, ediciones y bajas |

---

## Stack tecnológico

### Frontend

- **React 19** con Hooks y Context API
- **Vite** como bundler y servidor de desarrollo
- **React Router 7** con rutas protegidas y carga diferida (`lazy` + `Suspense`)
- **Axios** con interceptores para renovación automática de sesión
- **CSS puro** con variables de diseño, sin framework de UI

> Dependencias de producción del cliente: `react`, `react-dom`, `react-router-dom`
> y `axios`. Los gráficos, el carrusel y todos los componentes están escritos a
> mano.

### Backend

- **Node.js 20+** y **Express 5**
- **MongoDB** con **Mongoose 9**: índices compuestos, agregaciones, índices
  únicos para deduplicar y TTL para retención
- **JWT** con access token de 15 minutos y refresh token rotativo de 30 días en
  cookie `httpOnly`
- **bcryptjs** para el hash de contraseñas
- **Helmet**, **CORS** con lista de orígenes y **express-rate-limit**
- **Nodemailer** para recuperación de contraseña

### Servicios externos

- **Google Gemini** — reconocimiento de etiquetas y generación de fichas
- **Cloudinary** — almacenamiento y optimización de imágenes
- **MongoDB Atlas** — base de datos en producción
- **Vercel** — despliegue de frontend y backend

### Testing

- **Node Test Runner** (`node --test`) en el backend — 191 tests
- **Vitest** + **Testing Library** en el frontend — 69 tests

---

## Arquitectura

Monorepo con **npm workspaces**: dos aplicaciones independientes que se despliegan
por separado y comparten la raíz para las herramientas.

```
rincones/
├── client/                 # React + Vite
│   ├── src/
│   │   ├── components/     # Componentes reutilizables
│   │   ├── pages/          # Una por ruta
│   │   ├── hooks/          # Lógica de estado reutilizable
│   │   ├── context/        # Sesión, avisos, listas
│   │   ├── services/       # Llamadas a la API
│   │   ├── utils/          # Funciones puras (y sus tests)
│   │   ├── data/           # Catálogo de bodegas, uvas y regiones
│   │   └── styles/         # Variables de diseño y estilos por página
│   └── test/
│
├── server/                 # Express + Mongoose
│   ├── src/
│   │   ├── models/         # Esquemas de Mongoose (17)
│   │   ├── routes/         # Definición de endpoints (9)
│   │   ├── controllers/    # Entrada y salida HTTP
│   │   ├── services/       # Reglas de negocio
│   │   ├── middleware/     # Autenticación, roles, errores
│   │   ├── utils/          # Helpers puros
│   │   └── config/         # Base de datos, CORS, entorno
│   ├── api/index.js        # Punto de entrada serverless (Vercel)
│   └── test/
│
└── package.json            # Workspaces y scripts
```

La separación **controlador → servicio → modelo** es estricta: los controladores
sólo traducen HTTP, la lógica vive en los servicios y los modelos no saben nada de
la web. Es lo que permite testear las reglas de negocio sin levantar un servidor.

---

## Decisiones técnicas destacadas

**Stock por lotes (FIFO).** Cada compra de un vino es un lote con su fecha. Al
abrir una botella se descuenta del lote más viejo, con actualizaciones atómicas
por *aggregation pipeline* para que dos pestañas abiertas no descuenten dos veces.
Permite responder "hace cuánto tengo este vino" y no sólo "cuántos me quedan".

**Analítica propia en vez de Google Analytics.** Los bloqueadores tapan los
servicios de terceros por defecto, así que el número que más importa —cuánta
gente entra— saldría subestimado sin que nada avise. La medición viaja por el
mismo dominio que la API. Los visitantes se identifican con un hash anónimo
(`sha256(IP + user-agent + salt)`): la IP nunca toca la base y, al no usar cookies
ni `localStorage`, la app no necesita cartel de consentimiento.

**Historial que no caduca.** Los eventos crudos se borran a los 180 días, pero los
cuadros del panel (pantallas, orígenes, horarios) salen de un resumen diario que
no expira: se pueden mirar años hacia atrás. Un dato caducado y un dato en cero se
ven igual en un gráfico, y ése es el peor tipo de número.

**Métricas de campaña auditables.** Una impresión se cuenta sólo si la tarjeta
estuvo al menos a la mitad a la vista durante un segundo seguido (criterio IAB),
una vez por persona y por visita. Se descarta el tráfico de bots, de vistas previas
de mensajería y de los propios administradores. Las personas alcanzadas se
deduplican con un índice único por (campaña, persona, día).

**Renovación de sesión transparente.** Un interceptor de Axios detecta el 401,
renueva el token con la cookie de refresh y reintenta la petición original. El
usuario nunca ve un cierre de sesión inesperado.

**Cuota de IA acotada.** Las descripciones se generan una vez y se persisten; las
búsquedas se cachean 30 días en base. Un vino ya consultado no vuelve a costar una
llamada.

---

## Instalación y uso

### Requisitos

- Node.js 20 o superior
- MongoDB local, o una cuenta de MongoDB Atlas

### Puesta en marcha

```bash
# 1. Clonar e instalar (npm workspaces instala cliente y servidor)
git clone https://github.com/benjaespina98/rincones.git
cd rincones
npm install

# 2. Configurar las variables de entorno
cp server/.env.example server/.env
cp client/.env.example client/.env

# 3. Levantar frontend y backend en paralelo
npm run dev
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:4000/api>

### Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta cliente y servidor a la vez |
| `npm run dev:client` | Sólo el frontend |
| `npm run dev:server` | Sólo el backend |
| `npm run build` | Compila el frontend para producción |
| `npm test -w server` | Tests del backend |
| `npm test -w client` | Tests del frontend |

---

## Variables de entorno

### Las bases de datos

El cluster tiene dos bases del proyecto, y `MONGODB_DB_NAME` es lo único que
decide en cuál se escribe:

| Base | Para qué |
|---|---|
| `rincones` | **Producción.** Datos reales. Sólo la usa el deploy |
| `test` | Desarrollo y pruebas locales. Es la que trae `.env.example` |

`admin` y `local` son internas de MongoDB, no del proyecto.

Dos cosas que conviene tener presentes:

- **`test` no es descartable.** El nombre engaña: es también la base por
  defecto de Mongoose, así que un `MONGODB_DB_NAME` perdido en un deploy
  mandaría producción ahí. Por eso `config/db.js` se niega a conectar sin la
  variable en vez de adivinar.
- **Los scripts de migración no eligen base por su cuenta**: usan el `.env` del
  directorio desde el que corren. Para tocar producción hay que decirlo
  explícitamente:

  ```bash
  MONGODB_DB_NAME=rincones node scripts/<script>.js --dry   # ver qué haría
  MONGODB_DB_NAME=rincones node scripts/<script>.js         # aplicar
  ```

  Corré siempre el `--dry` primero: los scripts imprimen qué documentos van a
  tocar y cuáles tuvieron que inferir.

### Backend (`server/.env`)

| Variable | Obligatoria | Para qué |
|---|---|---|
| `MONGODB_URI` | **Sí** | Cadena de conexión a MongoDB |
| `JWT_SECRET` | **Sí** | Firma de los tokens de sesión |
| `FRONTEND_URL` | **Sí** | Origen del cliente (CORS y enlaces de los mails) |
| `PORT` | No | Puerto del servidor (4000 por defecto) |
| `MONGODB_DB_NAME` | **Sí** | Nombre de la base: `rincones` en producción, `test` en desarrollo |
| `CORS_ALLOWED_ORIGINS` | No | Orígenes permitidos, separados por coma |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | No | Cuenta de administrador inicial |
| `GEMINI_API_KEY` | No | Reconocimiento de etiquetas y fichas con IA |
| `CLOUDINARY_URL` | No | Almacenamiento de imágenes |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | No | Envío de mails |
| `ANALYTICS_SALT` | No | Sal del hash de visitantes |
| `COOKIE_DOMAIN` / `COOKIE_SAMESITE` | No | Sólo con frontend y backend en subdominios de un dominio propio |
| `SENTRY_DSN` / `SENTRY_RELEASE` | No | Monitoreo de errores (ver [Monitoreo de errores](#monitoreo-de-errores)) |

Las variables opcionales **degradan con elegancia**: sin Gemini el escaneo cae al
OCR local, sin Cloudinary las imágenes se guardan en base, sin SMTP el enlace de
recuperación queda en el log del servidor, y sin Sentry el monitoreo simplemente
no hace nada.

### Frontend (`client/.env`)

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL base de la API |
| `VITE_SITE_URL` | Dominio público (Open Graph, canonical) — ver [Dominio propio](#dominio-propio) |
| `VITE_SENTRY_DSN` / `VITE_SENTRY_RELEASE` | Monitoreo de errores del cliente |

---

## API REST

Base: `/api`. Todas las rutas requieren autenticación salvo las marcadas como
públicas.

<details>
<summary><strong>Autenticación</strong> — <code>/auth</code></summary>

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/auth/register` | Registro (valida mayoría de edad) |
| `POST` | `/auth/login` | Inicio de sesión |
| `POST` | `/auth/refresh` | Renovación del token |
| `POST` | `/auth/logout` | Cierre de sesión |
| `GET` | `/auth/me` | Usuario autenticado |
| `POST` | `/auth/forgot-password` | Solicitud de recuperación |
| `POST` | `/auth/reset-password` | Cambio con token |

</details>

<details>
<summary><strong>Vinos</strong> — <code>/wines</code></summary>

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/wines` | Colección del usuario |
| `GET` | `/wines/search` | Búsqueda dentro de la colección |
| `GET` | `/wines/stats/summary` | Estadísticas de la bodega |
| `GET` | `/wines/stats/spending` | Gasto por período |
| `GET` | `/wines/cellar-ready` | Vinos listos para tomar |
| `POST` | `/wines/suggest` | Sugerencias según contexto |
| `GET` | `/wines/:id` | Detalle |
| `POST` | `/wines` | Alta |
| `POST` | `/wines/bulk` | Acción sobre varios a la vez |
| `PUT` | `/wines/:id` | Edición |
| `PATCH` | `/wines/:id/stock` | Ajuste de stock |
| `GET` `POST` | `/wines/:id/moments` | Momentos de degustación |
| `DELETE` | `/wines/:id` | Baja |

</details>

<details>
<summary><strong>Catálogo y etiquetas</strong> — <code>/catalog</code>, <code>/labels</code></summary>

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/catalog/search` | Búsqueda en catálogo + IA |
| `GET` | `/catalog/describe` | Ficha generada de un vino |
| `GET` | `/catalog/price` | Precio comunitario |
| `GET` `POST` | `/catalog/reviews` | Reseñas de la comunidad |
| `POST` | `/labels/analyze` | Análisis de una foto de etiqueta |

</details>

<details>
<summary><strong>Destacados y publicidad</strong> — <code>/promotions</code></summary>

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/promotions` | Público | Campañas al aire |
| `POST` | `/promotions/events` | Público | Impresiones y clics |
| `GET` | `/promotions/report/:token` | Enlace | Informe del anunciante |
| `GET` | `/promotions/all` | Admin | Listado con estados |
| `GET` | `/promotions/:id/stats` | Admin | Métricas por campaña |
| `POST` | `/promotions/:id/report-link` | Admin | Generar enlace de informe |
| `POST` `PUT` `DELETE` | `/promotions` | Admin | Alta, edición y baja |

</details>

<details>
<summary><strong>Administración</strong> — <code>/admin</code>, <code>/analytics</code></summary>

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/summary` | Números del panel |
| `GET` | `/admin/logs` | Registro de auditoría |
| `GET` | `/admin/users` | Usuarios con su actividad |
| `PUT` | `/admin/users/:id/role` | Cambio de rol |
| `GET` `DELETE` | `/admin/reviews` | Moderación |
| `POST` | `/analytics/collect` | Ingesta de eventos (público) |
| `GET` | `/analytics/summary` | Tablero de uso |

</details>

---

## Testing

```bash
npm test -w server   # 191 tests
npm test -w client   # 69 tests
```

Los tests cubren las reglas que no se ven leyendo el código y que, si se rompen,
lo hacen en silencio: el descuento FIFO del stock, el cálculo de la ventana de
guarda, la deduplicación de métricas, el filtro de tráfico no humano, el corte del
día en calendario argentino, la renovación de sesión y —con un test que recorre
los archivos de rutas— que **ninguna ruta nueva quede sin autenticación**, salvo
que se la declare pública con su motivo por escrito.

---

## Despliegue

Frontend y backend se despliegan como **dos proyectos separados en Vercel**.

1. **Base de datos**: crear un cluster en MongoDB Atlas, un usuario y habilitar el
   acceso de red.
2. **Backend**: desplegar la carpeta `server` (entra por
   [`server/api/index.js`](server/api/index.js)) y cargar las variables de entorno.
3. **Frontend**: desplegar `client` con `VITE_API_URL` apuntando al dominio del
   backend. Las rutas de React Router las resuelve
   [`client/vercel.json`](client/vercel.json).

---

## Backups

**Estado real, sin asumir nada:** el código nunca creó un backup por su cuenta
—no hay forma de saberlo sin entrar a Atlas— así que antes de tener usuarios de
verdad hace falta **VERIFICACIÓN MANUAL**:

1. Entrar a [cloud.mongodb.com](https://cloud.mongodb.com) → el proyecto → el
   cluster → pestaña **Backup**.
2. Confirmar si **Cloud Backup** está activado y, si lo está, la retención
   configurada (por defecto suele ser corta).
3. Si el cluster es **M0 (free tier)**, Atlas **no ofrece Cloud Backup en
   absoluto** — es una limitación del plan, no un toggle apagado. En M2/M5 sí
   existe pero con retención acotada. Sólo M10 en adelante tiene el backup
   continuo completo.

Si el cluster es M0 (lo más probable para un proyecto que arranca), la única
red de contención hoy es el simulacro de abajo, corrido a mano y a intervalos
—no hay nada automático corriendo solo—.

### Simulacro de backup y restore

```bash
npm run backup:drill -w server -- --source=rincones --dry   # ver qué haría
npm run backup:drill -w server -- --source=rincones          # volcar + restaurar + verificar
npm run backup:drill -w server -- --source=rincones --cleanup # ídem, y vacía la base de prueba al final
```

Ver [`server/scripts/backupRestoreDrill.js`](server/scripts/backupRestoreDrill.js).
Nunca escribe en `--source`: sólo lee, vuelca cada colección a JSON en
`server/scripts/backups/` (gitignorado — son datos reales de usuarios) y
restaura ese volcado en una base sandbox aparte (`<source>__restore_drill`)
para comparar documento por documento. El volcado que queda en disco **es**
el backup manual; movelo fuera del repo si lo vas a conservar.

---

## Monitoreo de errores

Apagado por defecto. Con `SENTRY_DSN` (backend) y/o `VITE_SENTRY_DSN`
(frontend) puestas, cada error 500 y cada excepción no controlada se reporta a
[Sentry](https://sentry.io) (plan gratuito: 5.000 eventos/mes sin tarjeta).
Sin las variables, no se instala ni se manda nada — ni siquiera se descarga el
paquete del lado del cliente (`client/src/services/errorMonitoring.js` importa
Sentry de forma diferida, sólo si hay DSN).

Antes de que algo llegue a Sentry se filtran el header `Authorization`,
cualquier cookie y los campos de contraseña/token que pudieran venir en el
body de una request fallida (ver `server/src/config/sentry.js` y
`client/src/services/errorMonitoring.js`).

---

## Dominio propio

Preparado para un dominio propio sin asumir cuál va a ser. Al tenerlo:

| Dónde | Qué cambiar |
|---|---|
| `CORS_ALLOWED_ORIGINS` (env del backend) | Agregar el dominio del frontend |
| `VITE_SITE_URL` (env del frontend, en Vercel) | El dominio público — sin esto, Open Graph y el `canonical` de `index.html` siguen apuntando a `rincones.vercel.app` |
| `client/vercel.json` → `rewrites` | El destino de `/api/:path*` está fijo al dominio actual del backend; Vercel no interpola variables de entorno ahí, así que es edición manual |
| `COOKIE_DOMAIN` (env del backend, opcional) | Sólo si frontend y backend van a vivir en subdominios del mismo dominio propio (`app.` / `api.`) |
| `FRONTEND_URL` (env del backend) | Se usa en los enlaces de los mails de recuperación de contraseña |

Nada de esto rompe el estado actual: todas son variables opcionales o con
default al dominio de Vercel de hoy.

---

## Autor

**Benjamín Espina** — proyecto personal full-stack.

[GitHub](https://github.com/benjaespina98)
