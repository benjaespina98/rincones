---
name: reglas-de-negocio
description: Qué significa cada estado de un vino en Rincones (stock, probado, favorito, lotes, vistas de Mi Bodega). Usar antes de tocar cualquier cosa que lea o escriba quantity, tasted, favorite, lots o las pestañas de la bodega.
---

# Reglas de negocio de Rincones

## El estado de un vino son TRES ejes independientes

| Eje | Qué es | Trampa |
|---|---|---|
| `quantity` | Stock actual. Es la **suma de `remaining`** de `lots[]` | No se edita a mano: la sostienen hooks y pipelines. Si no cierra con los lotes, hay un bug |
| `tasted` | Lo probaste alguna vez | **No** implica que no te quede stock: podés haberlo probado y tener 3 botellas |
| `favorite` | Corazón | Independiente de los otros dos |

- Las pestañas de **Mi Bodega son vistas** sobre esos ejes. Un vino puede estar en varias a la vez. Nunca modelarlas como estados excluyentes.
- `status` está **deprecado**. No leerlo, no contar por él, no escribirlo en código nuevo.
- Vocabulario de UI: "Ya tomados" (probados). Copy en rioplatense, de vos.

- **Tomar de nuevo**: abrir una botella (el − de la fila, Abrir en la ficha) suma una a `consumptionCount` y actualiza `lastConsumedAt`; el − pelado de `adjustStock` NO lo hace. La fila muestra "Tomado N veces · hace X" (`utils/tomados.js`) y en Ya tomados dice qué hace cada botón. Sacar un vino de Ya tomados con `consumptionCount ≥ 1` pide confirmación. El − es el mismo en la fila y en la ficha (abre y cuenta); «Quitar una sin tomarla» es la acción aparte para corregir. Un momento a menos de 12 h de la última toma es la misma ocasión y no suma otra.

## Lotes

Un lote = una compra. Definido en `server/src/models/wine.model.js`:
- `quantity` del lote: lo que entró. **Inmutable** salvo devolución.
- `remaining`: lo que sigue en la cava.
- Un lote agotado (`remaining: 0`) **se queda en el array**: es el historial de qué te tomaste y de dónde salió.
- Sin `_id` a propósito (los ajustes reescriben el array con un pipeline atómico). Un lote se identifica por su `addedAt`.
- Lógica en `server/src/utils/lots.js` y `server/src/services/cellar.service.js`.

## Antes de cambiar algo de esto
1. Buscar todos los lectores del campo (`grep` en `client/src` y `server/src`), no sólo el que estás tocando.
2. Si cambia la forma de los datos, hace falta un script `migrate:*` **aditivo** (los documentos viejos siguen siendo válidos), probado contra la base `test`. Ver el skill `mongo-y-migraciones`.
3. Un test que fije la invariante `quantity == suma(remaining)`.
