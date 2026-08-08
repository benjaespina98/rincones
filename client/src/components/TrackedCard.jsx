import ContentCard from "./ContentCard";
import { useImpressionRef } from "../hooks/usePromoMetrics";
import { trackPromoClick } from "../services/promotionsApi";
import { trackEvent } from "../services/analyticsApi";
import { tapHaptic } from "../utils/haptics";

/**
 * Un `ContentCard` que además cuenta.
 *
 * Existe para que ninguna sección tenga que acordarse de medir. Antes el conteo
 * vivía dentro del carrusel, así que era imposible olvidarlo: había un solo
 * lugar donde se dibujaban las campañas. Ahora que se dibujan en tres secciones,
 * la forma de mantener esa garantía es que medir venga con la tarjeta.
 *
 * Los ítems curados (una playlist, la lección) pasan sin `id` de campaña y no
 * miden nada: el hook y el clic se saltean solos.
 */
export default function TrackedCard({ item, ...props }) {
  const ref = useImpressionRef(item?.tracked ? item.id : null);

  /**
   * Registra el clic. NO navega: de eso se encarga el <a href> de la tarjeta.
   *
   * El orden importa y costó aprenderlo: cuando esto navegaba, contaba primero
   * y navegaba después, así que un error al contar —una extensión que corta el
   * pedido, un problema de red— se llevaba puesta la navegación y el anunciante
   * pagaba por una tarjeta que al tocarla no hacía nada.
   *
   * El clic se cuenta sólo si LLEVA a algún lado: un toque sobre una tarjeta
   * que no navega infla justo el número que el anunciante mira.
   */
  const registrar = (i) => {
    tapHaptic();
    if (!i?.tracked || !String(i.url || "").trim()) return;
    trackPromoClick(i.id);
    trackEvent("promo_click", { id: i.id, type: i.type, title: i.title });
  };

  return <ContentCard item={item} innerRef={ref} onOpen={registrar} {...props} />;
}
