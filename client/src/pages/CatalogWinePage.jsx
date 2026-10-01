import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import WineDetailHero from "../components/WineDetailHero";
import EmptyState from "../components/EmptyState";
import WineReviews from "../components/WineReviews";
import WineAbout from "../components/WineAbout";
import WineIdentity from "../components/WineIdentity";
import WinePlan from "../components/WinePlan";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../hooks/useWishlist";
import { describeWine, getWinePrice, mercadoLibreUrl } from "../services/wineSearchApi";
import { shareWine } from "../utils/share";
// El CSS de esta ficha (compartido con WineDetailPage) se importa una sola vez,
// desde App.jsx — ver el comentario ahí.

// Detalle de un vino del CATÁLOGO (recomendados / descubrir) que todavía no está
// en la bodega del usuario. Reusa la ficha de WineDetailPage (descripción IA,
// precio, MercadoLibre) en modo lectura + un CTA grande para sumarlo a la bodega.
// El vino llega por router state (location.state.wine); si no hay, volvemos.
export default function CatalogWinePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { addWish } = useWishlist();
  const { showSuccess, showError } = useToast();

  const wine = location.state?.wine || null;

  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [communityPrice, setCommunityPrice] = useState(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const wineName = wine?.name;
  const wineWinery = wine?.winery;
  // El nombre visible ya no trae la uva, pero la identidad compartida sí.
  const wineVarietal = wine?.varietal;

  // Callback (no inline) para poder reintentar desde la UI.
  const loadDescription = useCallback(() => {
    if (!wineName) return undefined;
    let active = true;
    setAiLoading(true);
    setAiFailed(false);
    describeWine({
      name: wineName,
      winery: wineWinery,
      varietal: wine?.varietal,
      type: wine?.type,
      region: wine?.region,
      vintage: wine?.vintage,
    })
      .then((info) => { if (active) setAiInfo(info); })
      .catch(() => { if (active) setAiFailed(true); })
      .finally(() => { if (active) setAiLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wineName, wineWinery]);

  useEffect(() => loadDescription(), [loadDescription]);

  useEffect(() => {
    if (!wineName) return undefined;
    let active = true;
    setPriceLoading(true);
    getWinePrice(wineName, wineWinery, wineVarietal)
      .then((p) => { if (active) setCommunityPrice(p); })
      .catch(() => { if (active) setCommunityPrice(null); })
      .finally(() => { if (active) setPriceLoading(false); });
    return () => { active = false; };
  }, [wineName, wineWinery, wineVarietal]);

  if (!wine) {
    return (
      <div className="wine-detail-page">
        <EmptyState
          illustration="cava"
          title="Este vino no está disponible"
          hint="Volvé a la lista y elegí uno para ver su ficha."
          actionLabel="Volver"
          onAction={() => navigate(-1)}
        />
      </div>
    );
  }

  // "Quiero probar": guarda el vino en Guardados (no en la bodega). Podés
  // sumarlo como favorito. La bodega es solo stock real y entra por escaneo.
  const handleWant = async (favorite = false) => {
    if (adding || added) return;
    try {
      setAdding(true);
      await addWish({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        image: wine.image || "",
        vintage: wine.vintage,
        favorite,
        source: "search",
      });
      setAdded(true);
      showSuccess(favorite ? `"${wine.name}" guardado como favorito` : `"${wine.name}" guardado en Quiero probar`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="wine-detail-page">
      {/* El mismo encabezado que la ficha del vino propio, y ahora también el
          mismo componente: acá era una copia recortada que se fue quedando
          atrás —sin fondo ambiental, sin el color del tipo— porque nada decía
          que eran lo mismo. Lo único propio de esta pantalla es que la foto no
          se amplía (el catálogo no tiene lightbox) y que la única acción es
          compartir: un vino del catálogo no se edita. */}
      <WineDetailHero
        wine={wine}
        acciones={
          <button
            type="button"
            className="wine-detail-hero__icon-btn"
            onClick={async () => {
              const r = await shareWine(wine);
              if (r === "copied") showSuccess("Copiado al portapapeles");
            }}
            aria-label="Compartir vino"
            title="Compartir"
          >
            <Icon name="share" size={16} />
          </button>
        }
      />

      <div className="wine-detail-body">
        {/* La misma ficha de datos que la del vino propio: la bodega con su rótulo
            en vez de una tira de pastillas de colores. Acá no hay "Completar":
            un vino del catálogo no se edita, se agrega a la bodega. */}
        <WineIdentity wine={wine} />

        {/* Ficha del vino (estilo Vivino): descripción, aromas, maridaje.
            Antes del plan, igual que en la ficha de un vino tuyo: primero qué es
            este vino, después qué hacer con él. Las dos pantallas muestran los
            mismos dos bloques y no puede ser que los muestren en orden distinto
            —es la misma pregunta y se contesta igual, tengas la botella o no. */}
        <WineAbout
          loading={aiLoading}
          failed={aiFailed}
          info={aiInfo}
          onRetry={loadDescription}
          wine={wine}
        />

        {/* El plan también acá, y esto NO es un extra: para un vino que todavía
            no comprás, saber qué se cocina con él y con qué suena es justamente
            lo que ayuda a decidir si lo querés. La botella no hace falta tenerla
            para planear la noche en que la vas a abrir. */}
        <WinePlan wine={wine} info={aiInfo} />

        {/* Reseñas de la comunidad: el motivo principal por el que alguien mira
            la ficha de un vino que todavía no tiene. */}
        <WineReviews name={wine.name} winery={wine.winery} varietal={wine.varietal} />

        {/* Precio: comunitario (promedio) + link a MercadoLibre (siempre actual).
            Sin CollapsibleSection acá (a diferencia de la ficha propia) porque
            no hay nada más arriba que ya diga "Precio": el título va en un
            encabezado real, igual que "Sobre este vino" y las reseñas, en vez
            de una leyenda chica que repetía lo que el número ya dice. */}
        <div className="wine-price">
          <h3 className="wine-price__heading"><Icon name="tag" size={16} /> Precio</h3>
          <div className="wine-price__row">
            <div className="wine-price__info">
              {priceLoading ? (
                <span className="wine-price__empty">Buscando precios…</span>
              ) : communityPrice ? (
                <span className="wine-price__value">
                  ${communityPrice.avg.toLocaleString("es-AR")} {communityPrice.currency}
                  <em> · promedio de {communityPrice.count} {communityPrice.count === 1 ? "persona" : "personas"}</em>
                </span>
              ) : (
                <span className="wine-price__empty">Sin datos todavía</span>
              )}
            </div>
          </div>
          <a
            className="wine-price__meli"
            href={mercadoLibreUrl(wine.name, wine.winery, wine.varietal)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver precios en MercadoLibre <Icon name="arrow-right" size={15} />
          </a>
        </div>

        {/* CTA: guardar en la lista (Guardados). No entra a la bodega: eso es
            solo stock real y se suma escaneando la botella. */}
        <div className="catalog-cta-row">
          <button
            type="button"
            className={`catalog-add-cta ${added ? "is-added" : ""}`}
            onClick={() => handleWant(false)}
            disabled={adding || added}
          >
            {added ? (
              <><Icon name="check" size={18} /> Guardado</>
            ) : adding ? (
              "Guardando…"
            ) : (
              <><Icon name="heart" size={18} /> Quiero probar</>
            )}
          </button>
          <button
            type="button"
            className="catalog-fav-cta"
            onClick={() => handleWant(true)}
            disabled={adding || added}
            aria-label="Guardar como favorito"
            title="Guardar como favorito"
          >
            <Icon name="heart" filled size={18} />
          </button>
        </div>

        <button type="button" className="catalog-have-btn" onClick={() => navigate("/agregar")}>
          <Icon name="camera" size={16} /> Ya lo tengo — escaneálo para tu bodega
        </button>
      </div>
    </div>
  );
}
