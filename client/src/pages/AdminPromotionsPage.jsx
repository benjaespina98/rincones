import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import ConfirmModal from "../components/ConfirmModal";
import PromoCard from "../components/PromoCard";
import PromoStats from "../components/PromoStats";
import ImagePicker from "../components/ImagePicker";
import { useToast } from "../context/ToastContext";
import {
  getAllPromotions,
  createPromotion,
  updatePromotion,
  setPromotionVisibility,
  movePromotion,
  deletePromotion,
} from "../services/promotionsApi";
import "./styles/AdminPromotionsPage.css";

/**
 * El gestor de campañas del espacio destacado.
 *
 * ── POR QUÉ ESTO SE REHIZO ──────────────────────────────────────────────────
 * La versión anterior tenía, antes de llegar a la primera campaña: tres chips de
 * tipo, cinco contadores que además filtraban, un buscador y una línea de estado.
 * Cada control estaba justificado por separado y el conjunto era un tablero de
 * mandos para administrar tres campañas. La respuesta correcta a "esto es confuso"
 * no es explicar mejor cada control: es que haya menos.
 *
 * ── LA IDEA: AGRUPAR EN VEZ DE FILTRAR ──────────────────────────────────────
 * Un filtro te obliga a elegir qué ver, y para eso primero tenés que saber qué hay.
 * Son dos pasos y un montón de controles para contestar la pregunta con la que uno
 * abre esta pantalla, que es siempre la misma: "¿qué se está mostrando ahora?".
 *
 * Ahora la lista viene partida en secciones —AL AIRE, PROGRAMADAS, PAUSADAS,
 * FINALIZADAS— con lo que está al aire arriba de todo. Se ve todo de una, sin
 * tocar nada, y el estado deja de ser una pastilla de color que hay que decodificar:
 * es el título que tiene encima.
 *
 * Cero clics para la pregunta más frecuente. Y desaparecen ocho controles.
 *
 * ── LO QUE NO SE AFLOJA ─────────────────────────────────────────────────────
 * Elegir "Publicidad" marca la tarjeta como paga y el carrusel le pone el cartel,
 * sin opción de sacarlo. El servidor lo fuerza igual: no puede depender de esta
 * pantalla.
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
  sponsorLogo: "",
  startsAt: "",
  endsAt: "",
  eventAt: "",
  city: "",
  venue: "",
  active: true,
  sponsored: false,
};

/**
 * Las secciones de la lista, en el orden en que importan.
 *
 * "Al aire" arriba porque es lo que la app está mostrando ahora mismo, y
 * "Finalizadas" al final y plegado porque es archivo: se consulta, no se atiende.
 */
const SECCIONES = [
  { id: "active", titulo: "Al aire", nota: "Se están mostrando en la app" },
  { id: "scheduled", titulo: "Programadas", nota: "Esperando su fecha de inicio" },
  { id: "paused", titulo: "Pausadas", nota: "Ocultas, con sus números guardados" },
  { id: "ended", titulo: "Finalizadas", nota: "Se les pasó la fecha de fin", plegada: true },
];

/** A partir de acá aparece el buscador. Con menos, se ve todo de un vistazo. */
const MINIMO_PARA_BUSCAR = 8;

/**
 * Del formulario plano al shape que espera el server.
 *
 * Las fechas van tal cual como "YYYY-MM-DD": el server las interpreta como el día
 * calendario argentino completo. La conversión no se hace acá a propósito —hacerla
 * en los dos lados es la forma garantizada de que en algún momento se corran un día—.
 */
const aPayload = (form) => ({
  kind: form.kind,
  title: form.title.trim(),
  summary: form.summary.trim(),
  image: form.image.trim(),
  url: form.url.trim(),
  ctaLabel: form.ctaLabel.trim(),
  accent: form.accent.trim(),
  active: form.active,
  startsAt: form.startsAt || null,
  endsAt: form.endsAt || null,
  // Los datos del evento no aplican a una publicidad: se mandan vacíos para que
  // editar una campaña que cambió de tipo no arrastre datos que ya no significan
  // nada.
  eventAt: form.kind === "ad" ? null : form.eventAt || null,
  sponsor:
    form.kind === "ad"
      ? { name: form.sponsorName.trim(), logo: form.sponsorLogo.trim() }
      : { name: "", logo: "" },
  place: form.kind === "ad" ? { city: "", venue: "" } : { city: form.city.trim(), venue: form.venue.trim() },
  // Una publicidad siempre va marcada. El server lo fuerza igual.
  sponsored: form.kind === "ad",
});

/** Del server al formulario. Las fechas vienen ya formateadas en `form`. */
const aFormulario = (p) => ({
  kind: p.kind || "event",
  title: p.title || "",
  summary: p.summary || "",
  image: p.image || "",
  url: p.url || "",
  ctaLabel: p.ctaLabel || "",
  accent: p.accent || "",
  sponsorName: p.sponsor?.name || "",
  sponsorLogo: p.sponsor?.logo || "",
  startsAt: p.form?.startsAt || "",
  endsAt: p.form?.endsAt || "",
  eventAt: p.form?.eventAt || "",
  city: p.place?.city || "",
  venue: p.place?.venue || "",
  active: p.active !== false,
  sponsored: p.sponsored === true,
});

/** "YYYY-MM-DD" a "31 dic". UTC, o el navegador resta 3 horas y muestra el día anterior. */
const diaCorto = (valor) => {
  const [a, m, d] = String(valor).split("-").map(Number);
  if (!a) return valor;
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

/** La ventana de vigencia en palabras, que es como se lee de un vistazo. */
const ventanaEnPalabras = (p) => {
  const { startsAt, endsAt } = p.form || {};
  if (startsAt && endsAt) return `${diaCorto(startsAt)} → ${diaCorto(endsAt)}`;
  if (endsAt) return `hasta el ${diaCorto(endsAt)}`;
  if (startsAt) return `desde el ${diaCorto(startsAt)}`;
  return "sin fecha de fin";
};

/** El mensaje de error que mandó el server, si es que mandó uno útil. */
const mensajeDeError = (error, porDefecto) =>
  error?.response?.data?.error || error?.response?.data?.message || porDefecto;

const NUM = new Intl.NumberFormat("es-AR");

/** "1 impresión" y no "1 impresiones": en la pantalla de los números, se nota. */
const cantidad = (n, singular, plural) =>
  `${NUM.format(n || 0)} ${(n || 0) === 1 ? singular : plural}`;

export default function AdminPromotionsPage() {
  const { showSuccess, showError } = useToast();
  const [datos, setDatos] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [textoBusqueda, setTextoBusqueda] = useState("");
  const [limite, setLimite] = useState(50);
  const [form, setForm] = useState(null); // null = formulario cerrado
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState(null);
  const [informe, setInforme] = useState(null);
  const [plegadas, setPlegadas] = useState(() => new Set(["ended"]));
  // Cuáles están cambiando de estado: sin esto un toque repetido en el interruptor
  // manda dos peticiones que pueden volver en orden invertido y dejar la fila
  // mostrando lo contrario de lo que quedó guardado.
  const [ocupadas, setOcupadas] = useState(() => new Set());

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setDatos(await getAllPromotions({ page: 1, limit: limite, q: busqueda }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [busqueda, limite]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El buscador espera a que dejes de escribir: una petición por tecla no aporta.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(textoBusqueda.trim()), 350);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

  /** La lista partida en secciones, en el orden en que se muestran. */
  const secciones = useMemo(() => {
    const porEstado = new Map(SECCIONES.map((s) => [s.id, []]));
    for (const item of datos.items) {
      if (porEstado.has(item.state)) porEstado.get(item.state).push(item);
    }
    return SECCIONES.map((s) => ({ ...s, items: porEstado.get(s.id) }));
  }, [datos.items]);

  const alAire = secciones.find((s) => s.id === "active")?.items.length || 0;

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const abrirNuevo = () => {
    setEditId(null);
    setInforme(null);
    setForm({ ...VACIO });
  };

  const abrirEdicion = (p) => {
    setEditId(p._id);
    setInforme(null);
    setForm(aFormulario(p));
  };

  const cerrar = () => {
    setForm(null);
    setEditId(null);
  };

  /** Lo que va a ver el usuario, con los datos que hay cargados en el formulario. */
  const previa = useMemo(() => {
    if (!form) return null;
    return {
      _id: "preview",
      kind: form.kind,
      title: form.title,
      summary: form.summary,
      image: form.image,
      url: form.url,
      ctaLabel: form.ctaLabel,
      accent: form.accent,
      sponsored: form.kind === "ad",
      sponsor: form.kind === "ad" ? { name: form.sponsorName, logo: form.sponsorLogo } : {},
      place: form.kind === "ad" ? {} : { city: form.city, venue: form.venue },
      eventAt: form.kind === "ad" ? null : form.eventAt || null,
    };
  }, [form]);

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) {
      showError("Ponele un título");
      return;
    }
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) {
      showError("La fecha de fin es anterior a la de inicio: la campaña no se mostraría nunca");
      return;
    }

    try {
      setSaving(true);
      if (editId) await updatePromotion(editId, aPayload(form));
      else await createPromotion(aPayload(form));
      showSuccess(editId ? "Campaña actualizada" : "Campaña creada");
      cerrar();
      await cargar();
    } catch (error) {
      // El server dice QUÉ campo está mal. Mostrar "No se pudo guardar" y tragarse
      // el motivo obliga a adivinar.
      showError(mensajeDeError(error, "No se pudo guardar"));
    } finally {
      setSaving(false);
    }
  };

  const marcarOcupada = (id, ocupada) =>
    setOcupadas((prev) => {
      const siguiente = new Set(prev);
      if (ocupada) siguiente.add(id);
      else siguiente.delete(id);
      return siguiente;
    });

  const alternarVisible = async (p) => {
    if (ocupadas.has(p._id)) return;
    const visible = !p.active;
    marcarOcupada(p._id, true);
    try {
      await setPromotionVisibility(p._id, visible);
      showSuccess(visible ? "Ya se está mostrando en la app" : "Campaña pausada");
      await cargar();
    } catch (error) {
      showError(mensajeDeError(error, "No se pudo cambiar el estado"));
    } finally {
      marcarOcupada(p._id, false);
    }
  };

  const mover = async (p, direccion) => {
    if (ocupadas.has(p._id)) return;
    marcarOcupada(p._id, true);
    try {
      if (await movePromotion(p._id, direccion)) await cargar();
    } catch (error) {
      showError(mensajeDeError(error, "No se pudo cambiar el orden"));
    } finally {
      marcarOcupada(p._id, false);
    }
  };

  const confirmarBorrado = async () => {
    const id = borrar;
    setBorrar(null);
    try {
      await deletePromotion(id);
      if (informe === id) setInforme(null);
      showSuccess("Campaña eliminada");
      await cargar();
    } catch (error) {
      showError(mensajeDeError(error, "No se pudo eliminar"));
    }
  };

  const alternarPliegue = (id) =>
    setPlegadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const esAd = form?.kind === "ad";

  return (
    <div className="pr">
      {/* ── Una sola barra: crear, y buscar sólo si hay volumen ─────────────── */}
      <div className="pr__bar">
        <button className="pr__new" type="button" onClick={abrirNuevo}>
          <Icon name="plus" size={16} /> Nueva campaña
        </button>

        {(datos.total >= MINIMO_PARA_BUSCAR || busqueda) && (
          <label className="pr__search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={textoBusqueda}
              onChange={(e) => setTextoBusqueda(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar campaña"
            />
          </label>
        )}
      </div>

      {/* ── Formulario ─────────────────────────────────────────────────────── */}
      {form && (
        <form className="pr__form" onSubmit={guardar}>
          <div className="pr__form-head">
            <h3>{editId ? "Editar campaña" : "Nueva campaña"}</h3>
            <button type="button" className="pr__close" onClick={cerrar} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* La vista previa arriba: se mira mientras se escribe, que es cuando
              sirve. Es el MISMO componente que dibuja la tarjeta en la app. */}
          <div className="pr__preview">
            <span className="pr__preview-label">
              <Icon name="eye" size={12} /> Así se va a ver
            </span>
            <PromoCard promo={previa} interactive={false} preview />
          </div>

          <div className="pr__kind" role="group" aria-label="Tipo de campaña">
            {[
              { id: "event", label: "Evento", hint: "Una feria, una cata" },
              { id: "ad", label: "Publicidad", hint: "Espacio pago" },
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

          {esAd && (
            <p className="pr__notice">
              <Icon name="info" size={13} />
              <span>
                Se va a mostrar con el cartel <strong>Publicidad</strong>. No se puede
                sacar: es lo que mantiene creíble al resto de la pantalla.
              </span>
            </p>
          )}

          <label className="pr__field">
            <span>Título <em>*</em></span>
            <input
              type="text"
              maxLength={90}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder={esAd ? "Nueva línea de Valle de Uco" : "Fiesta Nacional de la Vendimia"}
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
              placeholder="Una línea, la que más convence"
            />
          </label>

          <ImagePicker
            label="Imagen de fondo"
            value={form.image}
            onChange={(v) => set("image", v)}
            disabled={saving}
            hint="Opcional. El texto va encima, así que conviene una foto con la parte de abajo tranquila."
          />

          <div className="pr__row">
            <label className="pr__field">
              <span>Enlace</span>
              <input
                type="text"
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                placeholder="https://…"
              />
              <small>
                Es a donde lleva la tarjeta al tocarla. Externo abre pestaña nueva; si
                empieza con "/" navega dentro de la app.
              </small>
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

          {/* Sólo para publicidades: un evento no tiene anunciante. */}
          {esAd && (
            <fieldset className="pr__fieldset">
              <legend>El anunciante</legend>
              <div className="pr__row">
                <label className="pr__field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.sponsorName}
                    onChange={(e) => set("sponsorName", e.target.value)}
                    placeholder="Bodegas Salentein"
                  />
                  <small>El usuario tiene derecho a saber de quién es el mensaje.</small>
                </label>
                <ImagePicker
                  label="Logo"
                  variant="logo"
                  value={form.sponsorLogo}
                  onChange={(v) => set("sponsorLogo", v)}
                  disabled={saving}
                  hint="PNG con fondo transparente."
                />
              </div>
            </fieldset>
          )}

          {/* Sólo para eventos: una publicidad no tiene fecha ni salón. */}
          {!esAd && (
            <fieldset className="pr__fieldset">
              <legend>Dónde y cuándo es</legend>
              <div className="pr__row">
                <label className="pr__field">
                  <span>Fecha del evento</span>
                  <input
                    type="date"
                    value={form.eventAt}
                    onChange={(e) => set("eventAt", e.target.value)}
                  />
                </label>
                <label className="pr__field">
                  <span>Ciudad</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    placeholder="Mendoza"
                  />
                </label>
                <label className="pr__field">
                  <span>Lugar</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={form.venue}
                    onChange={(e) => set("venue", e.target.value)}
                    placeholder="Teatro Griego"
                  />
                </label>
              </div>
            </fieldset>
          )}

          <fieldset className="pr__fieldset">
            <legend>Cuándo se muestra</legend>
            <div className="pr__row">
              <label className="pr__field">
                <span>Desde</span>
                <input
                  type="date"
                  value={form.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                />
                <small>Vacío = desde ya</small>
              </label>
              <label className="pr__field">
                <span>Hasta</span>
                <input
                  type="date"
                  value={form.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                />
                <small>Incluye el día entero</small>
              </label>
            </div>

            <label className="pr__switch">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
              />
              <span className="pr__switch-track" aria-hidden="true" />
              <span className="pr__switch-text">
                <strong>Visible en la app</strong>
                <small>Apagado queda pausada: no la ve nadie y sus números se conservan.</small>
              </span>
            </label>
          </fieldset>

          {/* El color va al final y con selector nativo: es lo último que se
              decide, y escribir "#c6465f" a mano era la fuente número uno de
              errores de validación en esta pantalla. */}
          <div className="pr__accent">
            <span className="pr__accent-label">Color de acento</span>
            <input
              type="color"
              className="pr__accent-input"
              value={form.accent || "#7e59c9"}
              onChange={(e) => set("accent", e.target.value)}
              aria-label="Elegir color de acento"
            />
            {form.accent && (
              <button type="button" className="pr__accent-clear" onClick={() => set("accent", "")}>
                Usar el color de la app
              </button>
            )}
          </div>

          <div className="pr__actions">
            <button type="button" className="btn-cancel" onClick={cerrar} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="btn-add" disabled={saving}>
              {saving ? "Guardando…" : editId ? "Guardar cambios" : "Crear campaña"}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="admin-empty-state">Cargando campañas…</p>}

      {failed && !loading && (
        <div className="admin-empty-state">
          <p>No pudimos cargar las campañas.</p>
          <button className="button" type="button" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {!loading && !failed && datos.total === 0 && (
        <div className="admin-empty-state">
          <p><strong>No hay campañas cargadas.</strong></p>
          <p>
            {busqueda
              ? "Ninguna coincide con lo que buscaste."
              : "Descubrí está mostrando sólo su contenido curado. Cuando cargues la primera, el carrusel aparece solo arriba de las recomendaciones."}
          </p>
        </div>
      )}

      {/* ── La lista, partida en secciones ──────────────────────────────────── */}
      {!loading &&
        !failed &&
        secciones.map((seccion) => {
          if (seccion.items.length === 0) return null;
          const plegada = plegadas.has(seccion.id);

          return (
            <section key={seccion.id} className={`pr__group pr__group--${seccion.id}`}>
              <button
                type="button"
                className="pr__group-head"
                onClick={() => alternarPliegue(seccion.id)}
                aria-expanded={!plegada}
              >
                <span className="pr__group-dot" aria-hidden="true" />
                <strong>{seccion.titulo}</strong>
                <span className="pr__group-count">{seccion.items.length}</span>
                <span className="pr__group-note">{seccion.nota}</span>
                <Icon name={plegada ? "chevron-down" : "chevron-up"} size={16} />
              </button>

              {!plegada && (
                <ul className="pr__list">
                  {seccion.items.map((p, i) => (
                    <li key={p._id} className="pr__item">
                      <div className="pr__item-main">
                        <span className="pr__item-title">
                          {p.title}
                          {p.sponsored && <span className="pr__tag-ad">Publicidad</span>}
                        </span>

                        {/* Una publicidad sin anunciante sale en la app como una
                            tarjeta que dice "PUBLICIDAD" y nada más: no se sabe de
                            quién es. Es la única falta que se avisa en la lista,
                            porque no rompe nada y por eso pasa desapercibida. */}
                        <span className="pr__item-meta">
                          {p.kind === "ad" && !p.sponsor?.name ? (
                            <span
                              className="pr__warn"
                              title="En la app sale sin nombre: sólo el cartel de publicidad"
                            >
                              <Icon name="info" size={12} /> Falta el anunciante
                            </span>
                          ) : (
                            p.sponsor?.name || "Evento"
                          )}
                          {` · ${ventanaEnPalabras(p)}`}
                        </span>

                        {/* Los números son el botón que abre el informe: es lo que
                            uno espera al tocar el número que está mirando. */}
                        <button
                          type="button"
                          className={`pr__item-stats ${informe === p._id ? "is-open" : ""}`}
                          onClick={() => setInforme(informe === p._id ? null : p._id)}
                          aria-expanded={informe === p._id}
                        >
                          {cantidad(p.impressions, "impresión", "impresiones")} ·{" "}
                          {cantidad(p.reach, "persona", "personas")} ·{" "}
                          {cantidad(p.clicks, "clic", "clics")}
                          {/* El porcentaje suelto al final de la línea no se
                              entendía: era el único número sin nombre y encima
                              podía dar 130%. Va con su palabra, y la cuenta
                              completa está en el informe de abajo. */}
                          {p.ctr !== null && p.ctr !== undefined && ` · ${p.ctr}% tocó`}
                          <Icon name={informe === p._id ? "chevron-up" : "chevron-down"} size={13} />
                        </button>
                      </div>

                      <div className="pr__item-actions">
                        {/* El orden sólo importa donde hay competencia: entre las que
                            están al aire, y sólo si hay más de una. */}
                        {seccion.id === "active" && seccion.items.length > 1 && (
                          <div className="pr__order">
                            <button
                              type="button"
                              className="pr__icon pr__icon--small"
                              onClick={() => mover(p, "up")}
                              disabled={i === 0 || ocupadas.has(p._id)}
                              title="Subir"
                              aria-label={`Subir ${p.title}`}
                            >
                              <Icon name="chevron-up" size={14} />
                            </button>
                            <button
                              type="button"
                              className="pr__icon pr__icon--small"
                              onClick={() => mover(p, "down")}
                              disabled={i === seccion.items.length - 1 || ocupadas.has(p._id)}
                              title="Bajar"
                              aria-label={`Bajar ${p.title}`}
                            >
                              <Icon name="chevron-down" size={14} />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          className={`pr__icon ${p.active ? "is-on" : ""}`}
                          onClick={() => alternarVisible(p)}
                          disabled={ocupadas.has(p._id)}
                          title={p.active ? "Ocultar" : "Mostrar en la app"}
                          aria-label={p.active ? `Ocultar ${p.title}` : `Mostrar ${p.title}`}
                          aria-pressed={p.active}
                        >
                          <Icon name={p.active ? "eye" : "eye-off"} size={16} />
                        </button>

                        <button
                          type="button"
                          className="pr__icon"
                          onClick={() => abrirEdicion(p)}
                          title="Editar"
                          aria-label={`Editar ${p.title}`}
                        >
                          <Icon name="pencil" size={16} />
                        </button>

                        <button
                          type="button"
                          className="pr__icon pr__icon--danger"
                          onClick={() => setBorrar(p._id)}
                          title="Eliminar"
                          aria-label={`Eliminar ${p.title}`}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>

                      {informe === p._id && (
                        <div className="pr__item-report">
                          <PromoStats
                            promoId={p._id}
                            title={p.title}
                            onClose={() => setInforme(null)}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

      {/* Con volumen, más en vez de páginas numeradas: es un solo toque y no hay
          que llevar la cuenta de en cuál se estaba. */}
      {!loading && datos.items.length < datos.total && (
        <button className="button" type="button" onClick={() => setLimite((n) => n + 50)}>
          Ver más ({datos.total - datos.items.length} sin mostrar)
        </button>
      )}

      {/* Una sola línea al pie, para cerrar: qué está viendo el usuario ahora. */}
      {!loading && !failed && datos.total > 0 && (
        <p className="pr__foot-note">
          {alAire === 0
            ? "No hay ninguna campaña al aire: la app no está mostrando nada de publicidad."
            : `La app está mostrando ${cantidad(alAire, "campaña", "campañas")}${
                alAire > 6 ? ", y el carrusel rota entre las 6 primeras" : ""
              }.`}
        </p>
      )}

      <ConfirmModal
        isOpen={borrar !== null}
        title="¿Eliminar la campaña?"
        message="Se borra junto con todo su historial de impresiones y clics, y eso no se puede recuperar. Si sólo querés que deje de mostrarse, ocultala: conservás los números para poder informarlos."
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDangerous
        onConfirm={confirmarBorrado}
        onCancel={() => setBorrar(null)}
      />
    </div>
  );
}
