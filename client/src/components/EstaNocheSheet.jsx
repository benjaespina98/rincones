import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomSheet from "./BottomSheet";
import Chip from "./Chip";
import WinePhoto from "./WinePhoto";
import WineMeta from "./WineMeta";
import { getSuggestedWines } from "../services/wineApi";
import { OCASIONES, motivoDe, sinResultado } from "../utils/estaNoche";
import { trackEvent } from "../services/analyticsApi";
import "./EstaNocheSheet.css";

/**
 * «¿Qué abro esta noche?»: elegís la ocasión y la bodega contesta con UNA botella.
 *
 * Una y no una lista: quien llega acá no quiere comparar cinco vinos, quiere que le
 * resuelvan la noche. Si no convence, «Otra» pasa a la siguiente (el server manda
 * hasta cinco, ya ordenadas) sin pedir nada de nuevo.
 *
 * No gasta cuota de IA: es el recomendador de reglas de siempre (ver
 * `suggestWines`), así que anda igual con Gemini caído.
 */
export default function EstaNocheSheet({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [ocasion, setOcasion] = useState(null);
  const [vinos, setVinos] = useState([]);
  const [indice, setIndice] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  // Un pedido viejo que llega tarde no pisa al último que se tocó.
  const pedido = useRef(0);

  // Al cerrar se vuelve al principio: la próxima vez no arranca con la noche anterior.
  useEffect(() => {
    if (isOpen) return;
    pedido.current += 1;
    setOcasion(null);
    setVinos([]);
    setIndice(0);
    setCargando(false);
    setFallo(false);
  }, [isOpen]);

  const elegir = async (o) => {
    const mio = (pedido.current += 1);
    setOcasion(o);
    setCargando(true);
    setFallo(false);
    setIndice(0);
    try {
      const data = await getSuggestedWines(o.pedido);
      if (mio !== pedido.current) return;
      setVinos(Array.isArray(data) ? data : []);
      trackEvent("esta_noche", { ocasion: o.id, resultados: Array.isArray(data) ? data.length : 0 });
    } catch {
      if (mio !== pedido.current) return;
      setVinos([]);
      setFallo(true);
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  };

  const vino = vinos[indice] || null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title="¿Qué abro esta noche?"
      description="Elegí la ocasión y buscamos en tu bodega."
      className="esta-noche"
    >
      <div className="esta-noche__ocasiones" role="group" aria-label="Ocasión">
        {OCASIONES.map((o) => (
          <Chip key={o.id} active={ocasion?.id === o.id} onClick={() => elegir(o)}>
            {o.label}
          </Chip>
        ))}
      </div>

      <div className="esta-noche__resultado" aria-live="polite">
        {cargando && <p className="esta-noche__nota">Buscando en tu bodega…</p>}

        {!cargando && fallo && (
          <p className="esta-noche__nota">No pudimos buscar ahora. Probá de nuevo.</p>
        )}

        {!cargando && !fallo && ocasion && !vino && (
          <p className="esta-noche__nota">{sinResultado(ocasion)}</p>
        )}

        {!cargando && vino && (
          <article
            // La `key` rearma la tarjeta al pasar a otra: así reentra con su animación.
            key={vino._id}
            className="esta-noche__vino"
            data-wine-type={vino.type || undefined}
          >
            <div className="esta-noche__foto">
              <WinePhoto
                src={vino.image}
                type={vino.type}
                alt={vino.name}
                artSize={104}
                fit="auto"
                marca={vino.winery || vino.name}
              />
            </div>
            <div className="esta-noche__datos">
              <p className="esta-noche__nombre">{vino.name}</p>
              {vino.winery && <p className="esta-noche__bodega">{vino.winery}</p>}
              <WineMeta type={vino.type} varietal={vino.varietal} vintage={vino.vintage} />
              <p className="esta-noche__motivo">
                {motivoDe(vino, ocasion)}
                {vino.quantity > 0 && <span className="esta-noche__stock"> · ×{vino.quantity}</span>}
              </p>
            </div>
          </article>
        )}

        {!cargando && vino && (
          <div className="esta-noche__acciones">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                onClose?.();
                navigate(`/vino/${vino._id}`, { state: { wine: vino } });
              }}
            >
              Ver vino
            </button>
            {vinos.length > 1 && (
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setIndice((i) => (i + 1) % vinos.length)}
              >
                Otra ({indice + 1}/{vinos.length})
              </button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
