/**
 * Lo que hay que mandar para volver a crear un vino que se acaba de borrar ("Deshacer").
 *
 * Es el mismo armado desde Mi Bodega y desde la ficha. Antes cada lugar mandaba un puñado de
 * campos y el vino volvía sin tipo, sin dónde estaba guardado, sin lo que se pagó y como
 * "dudoso": se perdía lo que no se mandaba. El servidor vuelve a calcular lo suyo (el veredicto,
 * los lotes) a partir de esta evidencia.
 */
export const payloadParaRestaurar = (wine) => ({
  name: wine.name,
  winery: wine.winery,
  vintage: wine.vintage,
  region: wine.region,
  varietal: wine.varietal,
  notes: wine.notes,
  rating: wine.rating,
  tasted: wine.tasted,
  favorite: wine.favorite,
  quantity: wine.quantity,
  image: wine.image,
  type: wine.type,
  line: wine.line,
  cellarLocation: wine.cellar?.location,
  cellarShelf: wine.cellar?.shelf,
  drinkFrom: wine.cellar?.drinkFrom,
  drinkUntil: wine.cellar?.drinkUntil,
  price: wine.purchase?.price,
  currency: wine.purchase?.currency,
  store: wine.purchase?.store,
  lastConsumedAt: wine.lastConsumedAt,
  consumptionCount: wine.consumptionCount,
  identification: wine.identification
    ? {
        source: wine.identification.source,
        confidence: wine.identification.confidence,
        editedFields: wine.identification.editedFields,
        matchedFrom: wine.identification.matchedFrom,
        sameNameConfirmed: wine.identification.sameNameConfirmed,
      }
    : undefined,
});
