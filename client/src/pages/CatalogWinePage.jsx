import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import WineReviews from "../components/WineReviews";
import WineStructure from "../components/WineStructure";
import WinePhoto from "../components/WinePhoto";
import { useToast } from "../context/ToastContext";
import { useWishlist } from "../hooks/useWishlist";
import { describeWine, getWinePrice, mercadoLibreUrl } from "../services/wineSearchApi";
import { shareWine } from "../utils/share";
import { WINE_TYPE_LABELS } from "../data/wineReference";
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
          title="No encontramos el vino"
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
          <WinePhoto src={wine.image} type={wine.type} alt={wine.name} artSize={150} priority />
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
          <p className="wine-detail-hero__origin">
            {[wine.winery, wine.region].filter(Boolean).join(" · ") || "Sin datos de origen"}
          </p>
        </div>
      </div>

      <div className="wine-detail-body">
        <div className="wine-detail-meta chip-row">
          <span className="chip chip--type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
          {wine.vintage && <span className="chip chip--year">{wine.vintage}</span>}
          {wine.varietal && <span className="chip chip--grape">{wine.varietal}</span>}
        </div>

        {/* Ficha del vino (estilo Vivino): descripción, aromas, maridaje. */}
        {(aiLoading || aiInfo || aiFailed) && (
          <div className="wine-about">
            <div className="wine-about__head">
              <h3><Icon name="sparkles" size={16} /> Sobre este vino</h3>
              {aiInfo && !aiInfo.known && (
                <span className="wine-about__tag" title="Descripción general del estilo, no del vino puntual">
                  aproximado
                </span>
              )}
            </div>

            {aiLoading && <LoadingSkeleton type="inline" count={3} />}

            {aiFailed && !aiLoading && (
              <ErrorState
                title="No pudimos generar la descripción"
                hint="La ficha del vino se arma con IA y a veces tarda."
                onRetry={loadDescription}
                compact
              />
            )}

            {aiInfo && !aiLoading && (
              <>
                {aiInfo.summary && <p className="wine-about__summary">{aiInfo.summary}</p>}
                {aiInfo.body && <p className="wine-about__body">{aiInfo.body}</p>}

                <WineStructure structure={aiInfo.structure} />

                {aiInfo.profile?.length > 0 && (
                  <div className="wine-about__profile">
                    {aiInfo.profile.map((p) => (
                      <span key={p} className="wine-about__pill">{p}</span>
                    ))}
                  </div>
                )}

                {aiInfo.aromas?.length > 0 && (
                  <div className="wine-about__block">
                    <span className="wine-about__label">Aromas y sabores</span>
                    <div className="wine-about__chips">
                      {aiInfo.aromas.map((a) => (
                        <span key={a} className="wine-about__chip">{a}</span>
                      ))}
                    </div>
                  </div>
                )}

                {aiInfo.foodPairing?.length > 0 && (
                  <div className="wine-about__block">
                    <span className="wine-about__label">Marida con</span>
                    <div className="wine-about__chips">
                      {aiInfo.foodPairing.map((f) => (
                        <span key={f} className="wine-about__chip wine-about__chip--food"><Icon name="utensils" size={13} /> {f}</span>
                      ))}
                    </div>
                  </div>
                )}

                {(aiInfo.alcohol || aiInfo.serve) && (
                  <div className="wine-about__facts">
                    {aiInfo.alcohol && (
                      <span className="wine-about__fact">
                        <strong>{aiInfo.alcohol}%</strong> alcohol
                      </span>
                    )}
                    {aiInfo.serve && (
                      <span className="wine-about__fact">
                        <strong>{aiInfo.serve}</strong> servir
                      </span>
                    )}
                  </div>
                )}

                <p className="wine-about__disclaimer">Descripción orientativa generada con IA.</p>
              </>
            )}
          </div>
        )}

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
                <span className="wine-price__empty">
                  Sin datos aún. Sumalo a tu bodega y cargá lo que pagaste para ayudar a la comunidad.
                </span>
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
