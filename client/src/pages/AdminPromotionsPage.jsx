import { useCallback, useEffect, useState } from "react";
import Icon from "../components/Icon";
import ConfirmModal from "../components/ConfirmModal";
import { useToast } from "../context/ToastContext";
import {
  getAllPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
} from "../services/promotionsApi";
import "./styles/AdminPromotionsPage.css";

/**
 * Cargar y programar los destacados de Descubrí desde el celular.
 *
 * ── LO QUE ESTA PANTALLA RESUELVE ───────────────────────────────────────────
 * Que el día que aparezca un anunciante real no haya que editar código y
 * desplegar. Una campaña se carga, se le pone desde-hasta y se apaga sola.
 *
 * ── LAS DOS COSAS QUE NO SE PUEDEN AFLOJAR ──────────────────────────────────
 * 1. Elegir "Publicidad" marca la tarjeta como paga y el carrusel le pone el
 *    cartel, sin opción de sacarlo. El servidor lo fuerza igual (ver
 *    promotion.model.js): no puede depender de esta pantalla.
 * 2. Estado visible. Cada fila dice si está EN VIVO, PROGRAMADA, VENCIDA o
 *    PAUSADA. Sin eso, "¿por qué no se ve mi campaña?" es una pregunta sin
 *    respuesta y se termina tocando cosas al azar.
 */

const VACIO = {
  kind: "event",
  title: "",
  summary: "",
  image: "",
  url: "",
  ctaLabel: "",
  accent: "",
  sponsorName: "",
  startsAt: "",
  endsAt: "",
  eventAt: "",
  city: "",
  venue: "",
  priority: 0,
  active: true,
  sponsored: false,
};

/** Date → "YYYY-MM-DD" para los inputs de fecha. */
const aInput = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const aFormulario = (p) => ({
  kind: p.kind || "event",
  title: p.title || "",
  summary: p.summary || "",
  image: p.image || "",
  url: p.url || "",
  ctaLabel: p.ctaLabel || "",
  accent: p.accent || "",
  sponsorName: p.sponsor?.name || "",
  startsAt: aInput(p.startsAt),
  endsAt: aInput(p.endsAt),
  eventAt: aInput(p.eventAt),
  city: p.place?.city || "",
  venue: p.place?.venue || "",
  priority: p.priority || 0,
  active: p.active !== false,
  sponsored: p.sponsored === true,
});

/**
 * En qué estado está una tarjeta, con las mismas reglas que usa el server para
 * decidir si la muestra. Si estas dos lecturas se separan, el panel miente.
 */
const estadoDe = (p, ahora = new Date()) => {
  if (!p.active) return { id: "paused", label: "Pausada" };
  if (p.endsAt && new Date(p.endsAt) < ahora) return { id: "expired", label: "Vencida" };
  if (p.startsAt && new Date(p.startsAt) > ahora) return { id: "scheduled", label: "Programada" };
  return { id: "live", label: "En vivo" };
};

export default function AdminPromotionsPage() {
  const { showSuccess, showError } = useToast();
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(null); // null = formulario cerrado
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setPromos(await getAllPromotions());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const abrirNuevo = () => {
    setEditId(null);
    setForm({ ...VACIO });
  };

  const abrirEdicion = (p) => {
    setEditId(p._id);
    setForm(aFormulario(p));
  };

  const cerrar = () => {
    setForm(null);
    setEditId(null);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) {
      showError("Ponele un título");
      return;
    }

    // Se rearma el shape que espera el server; el formulario es plano porque en
    // un celular anidar campos es peor de completar.
    const payload = {
      kind: form.kind,
      title: form.title,
      summary: form.summary,
      image: form.image,
      url: form.url,
      ctaLabel: form.ctaLabel,
      accent: form.accent,
      active: form.active,
      priority: form.priority,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      eventAt: form.eventAt || null,
      sponsor: { name: form.sponsorName, logo: "" },
      place: { city: form.city, venue: form.venue },
      // Una publicidad siempre va marcada. El server lo fuerza igual.
      sponsored: form.kind === "ad" ? true : form.sponsored,
    };

    try {
      setSaving(true);
      if (editId) await updatePromotion(editId, payload);
      else await createPromotion(payload);
      showSuccess(editId ? "Destacado actualizado" : "Destacado creado");
      cerrar();
      await cargar();
    } catch {
      showError("No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  /** Pausar o reactivar sin abrir el formulario: es lo que más se va a usar. */
  const alternarActivo = async (p) => {
    try {
      await updatePromotion(p._id, { active: !p.active });
      setPromos((prev) => prev.map((x) => (x._id === p._id ? { ...x, active: !p.active } : x)));
    } catch {
      showError("No se pudo cambiar el estado");
    }
  };

  const confirmarBorrado = async () => {
    const id = borrar;
    setBorrar(null);
    try {
      await deletePromotion(id);
      setPromos((prev) => prev.filter((p) => p._id !== id));
      showSuccess("Destacado eliminado");
    } catch {
      showError("No se pudo eliminar");
    }
  };

  if (loading) return <p className="admin-empty-state">Cargando destacados…</p>;

  if (failed) {
    return (
      <div className="admin-empty-state">
        <p>No pudimos cargar los destacados.</p>
        <button className="button" type="button" onClick={cargar}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="pr">
      {!form && (
        <div className="pr__bar">
          <button className="pr__new" type="button" onClick={abrirNuevo}>
            <Icon name="plus" size={16} /> Nuevo destacado
          </button>
          {promos.length > 0 && (
            <span className="pr__count">
              {promos.filter((p) => estadoDe(p).id === "live").length} en vivo de {promos.length}
            </span>
          )}
        </div>
      )}

      {form && (
        <form className="pr__form" onSubmit={guardar}>
          <div className="pr__form-head">
            <h3>{editId ? "Editar destacado" : "Nuevo destacado"}</h3>
            <button type="button" className="pr__close" onClick={cerrar} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* Qué es: cambia el cartel que ve el usuario, así que es la primera
              decisión y no un detalle escondido al final. */}
          <div className="pr__kind" role="group" aria-label="Tipo de destacado">
            {[
              { id: "event", label: "Evento", hint: "Una feria, una cata, una vendimia" },
              { id: "ad", label: "Publicidad", hint: "Espacio pago — se marca como tal" },
            ].map((k) => (
              <button
                key={k.id}
                type="button"
                className={`pr__kind-btn ${form.kind === k.id ? "is-active" : ""}`}
                aria-pressed={form.kind === k.id}
                onClick={() => set("kind", k.id)}
              >
                <strong>{k.label}</strong>
                <small>{k.hint}</small>
              </button>
            ))}
          </div>

          {form.kind === "ad" && (
            <p className="pr__notice">
              <Icon name="eye" size={13} /> Se va a mostrar con el cartel
              <strong> Publicidad</strong>. No se puede sacar: es lo que mantiene
              creíbles a las recomendaciones del resto de la pantalla.
            </p>
          )}

          <label className="pr__field">
            <span>Título <em>*</em></span>
            <input
              type="text"
              maxLength={90}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Fiesta Nacional de la Vendimia"
              required
            />
          </label>

          <label className="pr__field">
            <span>Bajada</span>
            <input
              type="text"
              maxLength={160}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              placeholder="La celebración de la cosecha más grande del país"
            />
            <small>Una línea. Más texto no se lee en un celular.</small>
          </label>

          <div className="pr__row">
            <label className="pr__field">
              <span>Enlace</span>
              <input
                type="text"
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://… o /bodega"
              />
              <small>Externo abre pestaña nueva; si empieza con "/" navega dentro de la app.</small>
            </label>
            <label className="pr__field">
              <span>Texto del botón</span>
              <input
                type="text"
                maxLength={30}
                value={form.ctaLabel}
                onChange={(e) => set("ctaLabel", e.target.value)}
                placeholder="Ver más"
              />
            </label>
          </div>

          <label className="pr__field">
            <span>Imagen de fondo (URL)</span>
            <input
              type="text"
              value={form.image}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://…"
            />
            <small>Opcional. Sin imagen la tarjeta usa un degradado con el color de acento.</small>
          </label>

          <div className="pr__row">
            <label className="pr__field">
              <span>Quién lo publica</span>
              <input
                type="text"
                maxLength={60}
                value={form.sponsorName}
                onChange={(e) => set("sponsorName", e.target.value)}
                placeholder="Bodega Norton"
              />
            </label>
            <label className="pr__field">
              <span>Color de acento</span>
              <input
                type="text"
                value={form.accent}
                onChange={(e) => set("accent", e.target.value)}
                placeholder="#c6465f"
              />
            </label>
          </div>

          {/* Vigencia: es lo que hace que una campaña se apague sola. */}
          <fieldset className="pr__fieldset">
            <legend>Cuándo se muestra</legend>
            <div className="pr__row">
              <label className="pr__field">
                <span>Desde</span>
                <input type="date" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
                <small>Vacío = desde ya</small>
              </label>
              <label className="pr__field">
                <span>Hasta</span>
                <input type="date" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
                <small>Vacío = hasta que la pauses</small>
              </label>
            </div>
          </fieldset>

          <fieldset className="pr__fieldset">
            <legend>Datos del evento</legend>
            <div className="pr__row">
              <label className="pr__field">
                <span>Fecha del evento</span>
                <input type="date" value={form.eventAt} onChange={(e) => set("eventAt", e.target.value)} />
                <small>Distinta de "desde/hasta": una feria de octubre se promociona en agosto.</small>
              </label>
              <label className="pr__field">
                <span>Ciudad</span>
                <input type="text" maxLength={60} value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Mendoza" />
              </label>
              <label className="pr__field">
                <span>Lugar</span>
                <input type="text" maxLength={80} value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Teatro Griego" />
              </label>
            </div>
          </fieldset>

          <div className="pr__row">
            <label className="pr__field">
              <span>Prioridad</span>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
              />
              <small>Mayor va primero en el carrusel.</small>
            </label>
            <label className="pr__check">
              <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
              <span>Activo</span>
            </label>
          </div>

          <div className="pr__actions">
            <button type="button" className="btn-cancel" onClick={cerrar} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-add" disabled={saving}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear destacado"}
            </button>
          </div>
        </form>
      )}

      {promos.length === 0 ? (
        <div className="admin-empty-state">
          <p><strong>No hay destacados cargados.</strong></p>
          <p>
            Descubrí está mostrando sólo su contenido curado. Cuando cargues el
            primero, el carrusel aparece solo arriba de las recomendaciones.
          </p>
        </div>
      ) : (
        <ul className="pr__list">
          {promos.map((p) => {
            const estado = estadoDe(p);
            return (
              <li key={p._id} className="pr__item">
                <div className="pr__item-main">
                  <span className={`pr__state pr__state--${estado.id}`}>{estado.label}</span>
                  <strong className="pr__item-title">{p.title}</strong>
                  <span className="pr__item-meta">
                    {p.kind === "ad" ? "Publicidad" : "Evento"}
                    {p.sponsor?.name ? ` · ${p.sponsor.name}` : ""}
                    {p.priority ? ` · prioridad ${p.priority}` : ""}
                  </span>
                  {/* Los números que va a pedir un anunciante, a la vista sin
                      tener que abrir nada. */}
                  <span className="pr__item-stats">
                    {p.impressions || 0} vistas · {p.clicks || 0} clics
                    {p.impressions > 0 && (
                      <> · {Math.round(((p.clicks || 0) / p.impressions) * 100)}% de clic</>
                    )}
                  </span>
                </div>

                <div className="pr__item-actions">
                  <button
                    type="button"
                    className="pr__icon"
                    onClick={() => alternarActivo(p)}
                    title={p.active ? "Pausar (deja de mostrarse)" : "Reactivar"}
                    aria-label={p.active ? "Pausar destacado" : "Reactivar destacado"}
                  >
                    <Icon name={p.active ? "check" : "circle"} size={16} />
                  </button>
                  <button
                    type="button"
                    className="pr__icon"
                    onClick={() => abrirEdicion(p)}
                    title="Editar"
                    aria-label="Editar destacado"
                  >
                    <Icon name="settings" size={16} />
                  </button>
                  <button
                    type="button"
                    className="pr__icon pr__icon--danger"
                    onClick={() => setBorrar(p._id)}
                    title="Eliminar (se pierden sus métricas)"
                    aria-label="Eliminar destacado"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        isOpen={borrar !== null}
        title="¿Eliminar destacado?"
        message="Se borra junto con sus vistas y clics. Si sólo querés que deje de mostrarse, pausalo: así conservás los números."
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={confirmarBorrado}
        onCancel={() => setBorrar(null)}
      />
    </div>
  );
}
