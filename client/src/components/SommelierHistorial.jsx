import { useCallback, useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import Button from "./Button";
import Icon from "./Icon";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadingSkeleton from "./LoadingSkeleton";
import ConfirmModal from "./ConfirmModal";
import { listarConversaciones, borrarConversacion } from "../services/sommelierApi";
import "./SommelierHistorial.css";

/**
 * Las charlas anteriores con la guía de vino.
 *
 * ── POR QUÉ ES UNA HOJA Y NO UNA PANTALLA ───────────────────────────────────
 * Porque no se viene acá: se pasa. Alguien está por preguntar algo, se acuerda
 * de que ya lo preguntó, mira el archivo y sigue. Una pantalla propia significa
 * navegar, perder lo que estaba escrito en el campo y tener que volver; una
 * hoja se abre encima, se elige y se cierra sola.
 *
 * ── LA FECHA EN PALABRAS ────────────────────────────────────────────────────
 * "Hoy", "Ayer" y después la fecha. Un listado de charlas se recorre buscando
 * "la del sábado", no "la del 12/09": la fecha exacta sólo sirve cuando ya
 * pasaron suficientes días como para que el día de la semana no ubique.
 */

const DIA = 24 * 60 * 60 * 1000;

const cuando = (iso) => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const hoy = new Date();
  const aMedianoche = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((aMedianoche(hoy) - aMedianoche(fecha)) / DIA);

  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  // Dentro de la semana, el día dice más que el número: "el jueves" ubica.
  if (dias < 7) return fecha.toLocaleDateString("es-AR", { weekday: "long" });
  return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
};

export default function SommelierHistorial({ abierto, onClose, onAbrir }) {
  const [conversaciones, setConversaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [aBorrar, setABorrar] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setFallo(false);
    try {
      setConversaciones(await listarConversaciones());
    } catch {
      setFallo(true);
    } finally {
      setCargando(false);
    }
  }, []);

  /* Se pide al abrir y no al montar: el componente vive en la pantalla del
     Sommelier todo el tiempo, y traer el historial en cada visita —aunque nadie
     lo abra— sería una consulta por cada vez que alguien entra a preguntar. */
  useEffect(() => {
    if (abierto) cargar();
  }, [abierto, cargar]);

  const confirmarBorrado = async () => {
    const id = aBorrar?.id;
    setABorrar(null);
    if (!id) return;
    /* Se saca de la lista antes de que el server conteste: el borrado de algo
       propio no falla casi nunca, y esperar medio segundo con la fila todavía
       ahí se siente como que el toque no funcionó. Si falla, se recarga y
       vuelve a estar — que es la verdad. */
    setConversaciones((prev) => prev.filter((c) => c.id !== id));
    try {
      await borrarConversacion(id);
    } catch {
      cargar();
    }
  };

  return (
    <>
      <BottomSheet
        isOpen={abierto}
        onClose={onClose}
        title="Tus consultas"
        description="Lo que le preguntaste antes a la guía."
        className="shist"
      >
        {cargando ? (
          <LoadingSkeleton type="inline" count={4} />
        ) : fallo ? (
          <ErrorState
            title="No pudimos traer tus consultas"
            hint="Revisá tu conexión y probá de nuevo."
            onRetry={cargar}
            compact
          />
        ) : conversaciones.length === 0 ? (
          <EmptyState
            illustration="diario"
            title="Todavía no hay consultas guardadas"
            hint="Lo que preguntes queda acá para que puedas volver a leerlo."
            compact
          />
        ) : (
          <ul className="shist__lista">
            {conversaciones.map((c) => (
              <li key={c.id} className="shist__item">
                {/* El cuerpo abre y el tacho borra: dos acciones, dos botones
                    hermanos. Un botón adentro de otro no es HTML válido, que es
                    la misma razón por la que las filas de Mi Bodega están
                    armadas así. */}
                <button
                  type="button"
                  className="shist__abrir"
                  onClick={() => onAbrir(c.id)}
                >
                  <span className="shist__titulo">{c.title}</span>
                  <span className="shist__meta">
                    {cuando(c.updatedAt)}
                    {c.mensajes > 0 && ` · ${Math.ceil(c.mensajes / 2)} ${Math.ceil(c.mensajes / 2) === 1 ? "pregunta" : "preguntas"}`}
                  </span>
                </button>
                <button
                  type="button"
                  className="shist__borrar"
                  onClick={() => setABorrar(c)}
                  aria-label={`Borrar la consulta "${c.title}"`}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>

      {/* Borrar una charla no se deshace, así que se pregunta. El mismo diálogo
          que usa el resto de la app. */}
      <ConfirmModal
        isOpen={Boolean(aBorrar)}
        title="¿Borrar esta consulta?"
        message={aBorrar ? `"${aBorrar.title}" se va de tu historial y no se puede recuperar.` : ""}
        confirmLabel="Borrar"
        onConfirm={confirmarBorrado}
        onCancel={() => setABorrar(null)}
        danger
      />
    </>
  );
}

