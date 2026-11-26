# Arquitectura y decisiones técnicas

Detalle de cómo está armado Rincones y por qué. El resumen está en el
[README](../README.md).

## Producto

Quien toma vino con cierta frecuencia se encuentra con los mismos tres
problemas: no se acuerda del nombre del que le gustó hace seis meses, no sabe qué
tiene en casa sin ir a mirar y, frente a una góndola, no tiene con qué decidir.

Rincones lo resuelve con tres ideas:

1. **Cargar un vino cuesta una foto.** Se escanea la etiqueta, la app la reconoce,
   la completa y la guarda.
2. **La bodega es un diario, no un inventario.** Cada vino guarda con quién lo
   tomaste, dónde y qué te pareció.
3. **Las recomendaciones salen de lo que tomás**, no de un ranking genérico.

Está escrita en español rioplatense y pensada para el mercado argentino: catálogo
de bodegas, uvas y regiones locales, y precios en pesos.

## Estructura

Monorepo con **npm workspaces**: dos aplicaciones que se despliegan por separado
y comparten la raíz para las herramientas.

```
rincones/
├── client/                 # React + Vite
│   ├── src/
│   │   ├── components/     # Componentes reutilizables
│   │   ├── pages/          # Una por ruta
│   │   ├── hooks/          # Lógica de estado reutilizable
│   │   ├── context/        # Sesión, avisos
│   │   ├── services/       # Llamadas a la API
│   │   ├── utils/          # Funciones puras
│   │   ├── data/           # Catálogos y textos de referencia
│   │   └── styles/         # Estilos compartidos
│   ├── test/               # Tests con Vitest
│   ├── e2e/                # Tests de punta a punta con Playwright
│   └── scripts/            # Chequeos de tokens CSS y de bundle
│
├── server/                 # Express + Mongoose
│   ├── src/
│   │   ├── models/         # Esquemas de Mongoose (24)
│   │   ├── routes/         # Definición de endpoints (10)
│   │   ├── controllers/    # Entrada y salida HTTP
│   │   ├── services/       # Reglas de negocio
│   │   ├── middleware/     # Autenticación, roles, límites, errores
│   │   ├── data/           # Catálogo de vinos y uvas
│   │   ├── utils/          # Helpers puros
│   │   └── config/         # Base de datos, CORS, entorno, Sentry
│   ├── api/index.js        # Punto de entrada serverless (Vercel)
│   ├── scripts/            # Migraciones y utilidades (npm run migrate:*)
│   └── test/               # Tests con node --test
│
├── docs/                   # Documentación extendida
└── .github/workflows/      # CI
```

La separación **controlador, servicio, modelo** es estricta: los controladores
sólo traducen HTTP, la lógica vive en los servicios y los modelos no saben nada de
la web. Eso permite testear las reglas de negocio sin levantar un servidor.

## Decisiones técnicas

**Estado del vino en tres ejes.** `quantity`, `tasted` y `favorite` son
independientes. Un vino puede estar tomado, sin stock y favorito a la vez. El
campo `status` quedó deprecado.

**Stock por lotes (FIFO).** Cada compra de un vino es un lote con su fecha. Al
abrir una botella se descuenta del lote más viejo que tenga stock (ver
`server/src/utils/lots.js` y `server/src/services/wines.service.js`). Permite
responder "hace cuánto tengo este vino" y no sólo "cuántos me quedan". Hay un test
de escritura concurrente en `client/e2e/inventario.spec.js` que comprueba que dos
descuentos simultáneos no pierden ni inventan botellas.

**Sommelier con streaming.** El chat responde por `POST /api/sommelier/ask-stream`
con Server-Sent Events, para que el texto se vaya escribiendo. Las conversaciones
se guardan y se pueden retomar o borrar.

**Cadena de modelos de Gemini.** `server/src/services/gemini.service.js` encadena
varios modelos ordenados por latencia medida. Si uno se queda sin cuota (429), pasa
al siguiente. Si se agotan todos, el escaneo de etiquetas cae al OCR local
(Tesseract.js).

**Cuota de IA acotada.** Las descripciones se generan una vez y se persisten. La
consulta "¿este vino existe?" se cachea 30 días en base. Un vino ya consultado no
vuelve a costar una llamada. Los endpoints de IA tienen límite por minuto y por
día.

**Sesión.** Access token JWT de 15 minutos y refresh token rotativo de 30 días en
cookies `httpOnly` y `SameSite=Lax` (`server/src/services/session.service.js`); ningún
token queda al alcance de un script. Un interceptor de Axios renueva antes del
vencimiento o ante un 401 y reintenta. CSRF: cabecera propia más CORS
(`server/src/middleware/csrf.js`).

**Límites de uso.** Los de cuentas, mails e IA cuentan en Redis (Upstash, por REST) si
está configurado, y en memoria si no o si Redis no contesta. El general queda en memoria.

**Analítica propia en vez de Google Analytics.** Los bloqueadores tapan los
servicios de terceros por defecto, así que el número que más importa, cuánta gente
entra, saldría subestimado sin aviso. La medición viaja por el mismo dominio que la
API. Los visitantes se identifican con un hash anónimo
(`sha256(IP + user-agent + ANALYTICS_SALT)`): la IP nunca se guarda y la medición
no usa cookies ni `localStorage`.

**Historial que no caduca.** Los eventos crudos se borran a los 180 días (índice
TTL), pero los cuadros del panel salen de un resumen diario que no expira.

**Métricas de campaña auditables.** Una impresión se cuenta sólo si la tarjeta
estuvo al menos a la mitad a la vista durante un segundo seguido
(`client/src/hooks/usePromoMetrics.js`), una vez por persona y por día. Se filtra el
tráfico no humano por user-agent (`server/src/utils/trafficFilter.js`). Las
personas alcanzadas se deduplican con un índice único por campaña, día y visitante.

**Degradación elegante.** Las variables opcionales no rompen la app: sin Gemini el
escaneo cae al OCR local, sin Cloudinary las imágenes se guardan en base, sin SMTP
el enlace de recuperación queda en el log del servidor y sin Sentry el monitoreo no
hace nada.

**Protección de rutas.** Un test recorre los archivos de rutas del servidor y falla
si una ruta nueva no exige autenticación y no está declarada pública con su motivo.

**Dos bases en el mismo cluster.** `rincones` es producción y `test` es desarrollo.
`MONGODB_DB_NAME` es obligatoria: `server/src/config/db.js` se niega a conectar sin
ella, para que una variable perdida en un deploy no mezcle usuarios reales con los
de prueba.

## Tests y CI

- Server: `node --test` (727 tests al 2026-11-19).
- Client: Vitest y Testing Library (982 tests al 2026-11-19).
- E2E: Playwright en `client/e2e`, contra la base `test` y con usuarios
  descartables.
- CI (`.github/workflows/ci.yml`) en cada PR a `develop` o `main`: lint, tokens CSS
  declarados, tests de server y client, build, presupuesto de la carga inicial y
  `npm audit` de dependencias de producción.
