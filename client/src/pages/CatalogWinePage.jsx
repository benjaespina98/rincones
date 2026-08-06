import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";
import WineReviews from "../components/WineReviews";
import WinePhoto from "../components/WinePhoto";
import WineAbout from "../components/WineAbout";
import WineIdentity from "../components/WineIdentity";
import WinePlan from "../components/WinePlan";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../hooks/useWishlist";
import { describeWine, getWinePrice, mercadoLibreUrl } from "../services/wineSearchApi";
import { shareWine } from "../utils/share";
import "../styles/pages/WineDetailPage.css";

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
          icon="bottle"
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
      showSuccess(favorite ? `"${wine.name}" guardado como favorito` : `"${wine.name}" guardado en tu lista`);
    } catch {
      showError("No se pudo guardar el vino. Probá de nuevo.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="wine-detail-page">
      <div className="wine-detail-hero">
        <div className="wine-detail-hero__placeholder">
          <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={220} fit="contain" priority />
        </div>

        <div className="wine-detail-hero__actions">
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
        </div>

        <div className="wine-detail-hero__overlay">
          <h1 className="wine-detail-hero__name">{wine.name}</h1>
          {wine.region && <p className="wine-detail-hero__origin">{wine.region}</p>}
        </div>
      </div>

      <div className="wine-detail-body">
        {/* La misma ficha de datos que la del vino propio: la bodega con su rótulo
            en vez de una tira de pastillas de colores. Acá no hay "Completar":
            un vino del catálogo no se edita, se agrega a la bodega. */}
        <WineIdentity wine={wine} />

        {/* El plan de la noche también acá, y esto NO es un extra: para un vino
            que todavía no comprás, saber qué se cocina con él y con qué suena es
            justamente lo que ayuda a decidir si lo querés. La botella no hace
            falta tenerla para planear la noche en que la vas a abrir. */}
        <WinePlan wine={wine} info={aiInfo} />

        {/* Ficha del vino (estilo Vivino): descripción, aromas, maridaje. */}
        <WineAbout
          loading={aiLoading}
          failed={aiFailed}
          info={aiInfo}
          onRetry={loadDescription}
        />

        {/* Reseñas de la comunidad: el motivo principal por el que alguien mira
            la ficha de un vino que todavía no tiene. */}
        <WineReviews name={wine.name} winery={wine.winery} />

        {/* Precio: comunitario (promedio) + link a MercadoLibre (siempre actual). */}
        <div className="wine-price">
          <div className="wine-price__row">
            <div className="wine-price__info">
              <span className="wine-price__label">Precio de referencia</span>
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
