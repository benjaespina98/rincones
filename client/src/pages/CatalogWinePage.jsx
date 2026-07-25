import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import LoadingSkeleton from "../components/LoadingSkeleton";
import WinePhoto from "../components/WinePhoto";
import { useToast } from "../context/ToastContext";
import { useWineCollection } from "../hooks/useWineCollection";
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
  const { addWine } = useWineCollection();
  const { showSuccess, showError, addToast } = useToast();

  const wine = location.state?.wine || null;

  const [aiInfo, setAiInfo] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const [communityPrice, setCommunityPrice] = useState(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const wineName = wine?.name;
  const wineWinery = wine?.winery;

  useEffect(() => {
    if (!wineName) return;
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
    getWinePrice(wineName, wineWinery)
      .then((p) => { if (active) setCommunityPrice(p); })
      .catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wineName, wineWinery]);

  if (!wine) {
    return (
      <div className="wine-detail-page">
        <div className="wine-detail-notfound">
          <p>No encontramos el vino. Volvé y elegí uno de la lista.</p>
          <button type="button" className="wine-detail-back-btn" onClick={() => navigate(-1)}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  const handleAdd = async () => {
    if (adding || added) return;
    try {
      setAdding(true);
      const created = await addWine({
        name: wine.name,
        winery: wine.winery || "",
        region: wine.region || "",
        varietal: wine.varietal || "",
        type: wine.type || "unknown",
        image: wine.image || "",
        quantity: 1,
      });
      setAdded(true);
      addToast(`"${created.name}" agregado a tu bodega`, "success", 5000, {
        label: "Ver",
        onClick: () => navigate(`/vino/${created._id}`),
      });
    } catch {
      showError("No se pudo agregar el vino. Probá de nuevo.");
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
        <div className="wine-detail-meta">
          <span className="wine-type">{WINE_TYPE_LABELS[wine.type] || WINE_TYPE_LABELS.unknown}</span>
          {wine.vintage && <span className="wine-year">{wine.vintage}</span>}
          {wine.varietal && <span className="wine-year">{wine.varietal}</span>}
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
              <p className="wine-about__failed">
                No pudimos cargar la descripción ahora. Probá reabrir el vino más tarde.
              </p>
            )}

            {aiInfo && !aiLoading && (
              <>
                {aiInfo.summary && <p className="wine-about__summary">{aiInfo.summary}</p>}
                {aiInfo.body && <p className="wine-about__body">{aiInfo.body}</p>}

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
                        <span key={f} className="wine-about__chip wine-about__chip--food">🍽 {f}</span>
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

        {/* Precio: comunitario (promedio) + link a MercadoLibre (siempre actual). */}
        <div className="wine-price">
          <div className="wine-price__row">
            <div className="wine-price__info">
              <span className="wine-price__label">Precio de referencia</span>
              {communityPrice ? (
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
            href={mercadoLibreUrl(wine.name, wine.winery)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver precios en MercadoLibre <Icon name="arrow-right" size={15} />
          </a>
        </div>

        {/* CTA principal: sumarlo a la bodega. */}
        <button
          type="button"
          className={`catalog-add-cta ${added ? "is-added" : ""}`}
          onClick={handleAdd}
          disabled={adding || added}
        >
          {added ? (
            <><Icon name="check" size={18} /> En tu bodega</>
          ) : adding ? (
            "Agregando…"
          ) : (
            <><Icon name="plus" size={18} /> Agregar a mi bodega</>
          )}
        </button>
      </div>
    </div>
  );
}
