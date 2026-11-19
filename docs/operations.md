# Operación: backups y monitoreo

## Backups

El código no crea backups por su cuenta. Si hay Cloud Backup depende del plan del
cluster en MongoDB Atlas y hay que confirmarlo en el panel:

1. Entrar a [cloud.mongodb.com](https://cloud.mongodb.com), al proyecto y al
   cluster, y abrir la pestaña **Backup**.
2. Confirmar si **Cloud Backup** está activado y con qué retención.
3. Tener presente que los clusters M0 (gratuitos) no ofrecen Cloud Backup. En
   M2 y M5 existe con retención acotada. El backup continuo completo empieza en
   M10.

Este repositorio no permite saber qué plan tiene el cluster. Esa verificación es
manual.

### Simulacro de backup y restore

```bash
npm run backup:drill -w server -- --source=rincones --dry     # ver qué haría
npm run backup:drill -w server -- --source=rincones            # volcar, restaurar y verificar
npm run backup:drill -w server -- --source=rincones --cleanup  # ídem, y vacía la base de prueba al final
```

Ver [`server/scripts/backupRestoreDrill.js`](../server/scripts/backupRestoreDrill.js).
El script nunca escribe en `--source`: sólo lee, vuelca cada colección a JSON en
`server/scripts/backups/` (ignorada por git, porque son datos reales de usuarios) y
restaura ese volcado en una base sandbox aparte (`<source>__restore_drill`) para
comparar documento por documento. El volcado que queda en disco es un backup
manual: hay que moverlo fuera del repositorio si se lo quiere conservar.

## Migraciones

Los scripts `npm run migrate:*` (`server/package.json`) no eligen base por su
cuenta: usan el `.env` del directorio desde el que corren. Para tocar producción
hay que decirlo explícitamente, y conviene correr siempre `--dry` primero:

```bash
MONGODB_DB_NAME=rincones node scripts/<script>.js --dry   # ver qué haría
MONGODB_DB_NAME=rincones node scripts/<script>.js         # aplicar
```

## Monitoreo de errores

Apagado por defecto. Con `SENTRY_DSN` (backend) o `VITE_SENTRY_DSN` (frontend)
definidas, cada error 500 y cada excepción no controlada se reporta a
[Sentry](https://sentry.io). Sin las variables no se instala ni se envía nada, y
en el cliente ni siquiera se descarga el paquete
(`client/src/services/errorMonitoring.js` lo importa de forma diferida).

Antes de enviar se filtran el header `Authorization`, las cookies y los campos de
contraseña o token del body (ver `server/src/config/sentry.js` y
`client/src/services/errorMonitoring.js`).

El panel de administración también muestra un registro propio de errores
(`GET /api/admin/error-logs`, con retención de 30 días).
