import { forwardRef } from "react";
import Icon from "./Icon";
import Dropdown from "./Dropdown";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import LoadingSkeleton from "./LoadingSkeleton";
import StarRating from "./StarRating";
import { OCCASIONS, EMOTIONS } from "../data/momentOptions";
import { toUploadableDataUrl } from "../utils/image";

/**
 * El diario de una botella: con quién la tomaste, dónde y qué te pareció.
 *
 * ── POR QUÉ SALIÓ DE WineDetailPage ─────────────────────────────────────────
 * Son 200 líneas —lista, formulario, estados de carga y de error, fotos— dentro
 * de un archivo de 1460. Es la parte más autocontenida de la ficha: no comparte
 * nada con el resto de la pantalla salvo el vino, y adentro del archivo grande
 * no se podía leer entera de una sentada.
 *
 * El cuerpo se movió tal cual, sin renombrar una sola variable: un refactor que
 * mueve Y reescribe al mismo tiempo no se puede revisar, porque cualquier
 * diferencia se confunde con el traslado. Por eso las props se llaman como se
 * llamaban adentro de la página.
 *
 * ── LOS MOMENTOS SON PRIVADOS, Y ESO SE DICE ────────────────────────────────
 * Con todas las letras, y no por prolijidad: en la misma pantalla, la opinión
 * SÍ se publica. Sin el cartel, alguien que acaba de leer "Se publica" arriba
 * tiene motivos para dudar de dónde termina lo que escribe acá — y con quién
 * comió, dónde y qué sintió es lo más personal que guarda la app.
 *
 * El `ref` va al <section> porque la ficha scrollea hasta acá cuando se llega
 * pidiendo registrar un momento.
 */
const WineMoments = forwardRef(function WineMoments(
  {
    moments,
    momentsLoading,
    momentsFailed,
    loadMoments,
    showMomentForm,
    setShowMomentForm,
    momentDraft,
    setMomentDraft,
    handleAddMoment,
    savingMoment,
    shareAsCard,
    sharingCard,
    setLightbox,
    showError,
  },
  momentsRef
) {
  const occasionLabel = (value) => OCCASIONS.find((o) => o.value === value)?.label || value;
  const emotionLabel = (value) => EMOTIONS.find((e) => e.value === value)?.label || value;

  return (
    <section className="wine-moments" ref={momentsRef}>
      <div className="wine-moments__header">
        {/* "Privado" dicho con todas las letras, y no por prolijidad: en la
            misma pantalla, tu opinión SÍ se publica. Sin el cartel, alguien
            que acaba de leer "Se publica" arriba tiene motivos para dudar de
            dónde termina lo que escribe acá —y con quién comió, dónde y qué
            sintió es lo más personal que guarda la app—. */}
        <h3>
          Momentos
          <span className="wine-moments__private" title="Nadie más puede verlos">
            <Icon name="lock" size={12} /> Sólo vos
          </span>
        </h3>
        {/* El botón del encabezado sólo cuando YA hay momentos.
            Con el diario vacío, esta acción se decía dos veces a la vez:
            acá arriba como "+ Agregar" y ocho centímetros más abajo como
            "Registrar un momento", los dos abriendo el mismo formulario.
            Dos botones para una acción no dan a elegir nada, sólo hacen
            dudar de si hacen lo mismo. Con la lista vacía manda el estado
            vacío, que además explica qué es un momento; con la lista llena
            el estado vacío no existe y manda éste. */}
        {!showMomentForm && moments.length > 0 && (
          <button type="button" className="wine-moments__add-btn" onClick={() => setShowMomentForm(true)}>
            + Agregar
          </button>
        )}
      </div>

      {showMomentForm && (
        <form className="moment-form" onSubmit={handleAddMoment}>
          <Dropdown
            ariaLabel="Ocasión"
            value={momentDraft.occasion}
            onChange={(v) => setMomentDraft((p) => ({ ...p, occasion: v }))}
            options={[
              { value: "", label: "Ocasión…" },
              ...OCCASIONS.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <Dropdown
            ariaLabel="Cómo te sentiste"
            value={momentDraft.emotion}
            onChange={(v) => setMomentDraft((p) => ({ ...p, emotion: v }))}
            options={[
              { value: "", label: "¿Cómo te sentiste?" },
              ...EMOTIONS.map((e) => ({ value: e.value, label: e.label })),
            ]}
          />
          <input
            type="text"
            placeholder="¿Con quién?"
            value={momentDraft.companions}
            onChange={(e) => setMomentDraft((p) => ({ ...p, companions: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Lugar"
            aria-label="Lugar"
            value={momentDraft.place}
            onChange={(e) => setMomentDraft((p) => ({ ...p, place: e.target.value }))}
          />
          <input
            type="text"
            placeholder="Maridaje (qué comiste)"
            aria-label="Maridaje: qué comiste"
            value={momentDraft.foodPairing}
            onChange={(e) => setMomentDraft((p) => ({ ...p, foodPairing: e.target.value }))}
          />
          <textarea
            placeholder="Notas del momento"
            aria-label="Notas del momento"
            value={momentDraft.notes}
            onChange={(e) => setMomentDraft((p) => ({ ...p, notes: e.target.value }))}
          />

          {/* El tope de 2 lo impone la grilla: cuando llegás, el botón de
              agregar desaparece. No hace falta anunciarlo por escrito. */}
          <div className="moment-photos">
            <span className="moment-photos__label">Fotos</span>
            <div className="moment-photos__grid">
              {momentDraft.photos.map((src, i) => (
                <div key={i} className="moment-photos__item">
                  <img src={src} alt={`Foto ${i + 1}`} />
                  <button
                    type="button"
                    className="moment-photos__remove"
                    onClick={() => setMomentDraft((p) => ({ ...p, photos: p.photos.filter((_, j) => j !== i) }))}
                    aria-label="Quitar foto"
                  >
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
              {momentDraft.photos.length < 2 && (
                <label className="moment-photos__add">
                  <Icon name="camera" size={20} />
                  <span>Agregar</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        const url = await toUploadableDataUrl(file);
                        setMomentDraft((p) => ({ ...p, photos: [...p.photos, url].slice(0, 2) }));
                      } catch {
                        showError("No se pudo cargar la foto");
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Sin estrellas acá: eran la segunda fila de cinco estrellas en
              la misma ficha, dos secciones más abajo de "Tu opinión"
              (WineOpinion, que ya consolidó las dos que había antes en
              una — ver el comentario ahí). Volver a preguntar el puntaje
              al cargar un momento se sentía como que la app ya se había
              olvidado de lo que acababas de tocar arriba. "Tu opinión"
              sigue siendo el único lugar de la ficha donde se puntúa. */}
          <div className="result-actions">
            <button type="button" className="btn-cancel" onClick={() => setShowMomentForm(false)} disabled={savingMoment}>
              Cancelar
            </button>
            <button type="submit" className="btn-add" disabled={savingMoment}>
              {savingMoment ? "Guardando…" : "Guardar momento"}
            </button>
          </div>
        </form>
      )}

      {momentsLoading ? (
        <LoadingSkeleton type="inline" count={2} />
      ) : momentsFailed ? (
        <ErrorState title="No se pudieron cargar tus momentos" onRetry={loadMoments} compact />
      ) : moments.length === 0 ? (
        !showMomentForm && (
          <EmptyState
            illustration="diario"
            title="Sin momentos todavía"
            // La única frase de la sección que dice qué es un momento. El
            // encabezado dice "Momentos · Sólo vos" y con eso no alcanza:
            // se entiende que es privado, no qué se escribe adentro.
            hint="Con quién lo tomaste, dónde y qué te pareció."
            actionLabel="Registrar un momento"
            onAction={() => setShowMomentForm(true)}
            compact
          />
        )
      ) : (
        <ul className="moment-list">
          {moments.map((moment) => (
            <li key={moment._id} className="moment-item">
              <div className="moment-item__head">
                <strong>{moment.occasion ? occasionLabel(moment.occasion) : "Momento"}</strong>
                <span className="moment-item__head-right">
                  {new Date(moment.consumedAt).toLocaleDateString("es-AR")}
                  <button
                    type="button"
                    className="moment-item__share"
                    onClick={() => shareAsCard(moment)}
                    disabled={sharingCard}
                    aria-label="Compartir esta cata como imagen"
                    title="Compartir"
                  >
                    <Icon name="share" size={14} />
                  </button>
                </span>
              </div>
              {!!moment.rating && <StarRating value={moment.rating} size="sm" />}
              <div className="moment-item__meta">
                {moment.place && <span><Icon name="map-pin" size={12} /> {moment.place}</span>}
                {moment.companions && <span><Icon name="users" size={12} /> {moment.companions}</span>}
                {moment.emotion && <span><Icon name="sparkle" size={12} /> {emotionLabel(moment.emotion)}</span>}
              </div>
              {moment.notes && <p className="moment-item__notes">{moment.notes}</p>}
              {/* Antes abrían la imagen suelta en otra pestaña: se salía de
                  la app para ver una foto propia. Ahora el mismo visor que
                  la foto del vino, con la fecha del momento al pie. */}
              {moment.photos?.length > 0 && (
                <div className="moment-item__photos">
                  {moment.photos.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setLightbox({
                          src,
                          alt: `Foto ${i + 1} del momento`,
                          caption: new Date(moment.consumedAt).toLocaleDateString("es-AR"),
                        })
                      }
                      aria-label={`Ampliar la foto ${i + 1} del momento`}
                    >
                      <img src={src} alt={`Foto ${i + 1}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export default WineMoments;
