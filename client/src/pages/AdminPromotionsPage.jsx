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
 * ── ESTO NO ES UN CRUD ──────────────────────────────────────────────────────
 * Un CRUD te deja escribir campos. Un gestor de campañas te deja contestar las
 * preguntas que aparecen cuando hay alguien pagando por ese espacio:
 *
 *   "¿Qué se está mostrando AHORA?"      → el resumen de arriba, con el filtro
 *                                          Activas de un toque.
 *   "¿Por qué no se ve mi campaña?"      → el estado de cada fila, y su razón.
 *   "¿Cómo va a quedar?"                 → la vista previa, que es la tarjeta de
 *                                          verdad y no una maqueta.
 *   "Bajala YA."                         → el interruptor de visible, que se
 *                                          refleja en la app al instante.
 *   "¿Cuánto rindió?"                    → el informe por campaña.
 *   "La mía tiene que ir primera."        → las flechas de orden.
 *
 * ── LAS DOS COSAS QUE NO SE PUEDEN AFLOJAR ──────────────────────────────────
 * 1. Elegir "Publicidad" marca la tarjeta como paga y el carrusel le pone el
 *    cartel, sin opción de sacarlo. El servidor lo fuerza igual (ver
 *    promotion.model.js): no puede depender de esta pantalla.
 * 2. El estado LO CALCULA EL SERVER, con el mismo código que decide si la campaña
 *    se muestra, y llega resuelto. Antes se recalculaba acá y eso es una promesa
 *    de que algún día el panel iba a decir "Activa" sobre algo que la app no
 *    mostraba. Frente a alguien que pagó, eso no se puede defender.
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
 * Publicidades y eventos comparten el espacio en la app —cada uno con su cartel—
 * pero acá se separan, porque se administran distinto: detrás de una publicidad hay
 * alguien esperando un informe, y detrás de un evento no.
 */
const TIPOS = [
  { id: "", label: "Todo" },
  { id: "ad", label: "Publicidades" },
  { id: "event", label: "Eventos y catas" },
];

/** Los estados, con su color y su orden en los filtros. */
const FILTROS = [
  { id: "", label: "Todas", clave: "total" },
  { id: "active", label: "Activas", clave: "active" },
  { id: "scheduled", label: "Programadas", clave: "scheduled" },
  { id: "paused", label: "Pausadas", clave: "paused" },
  { id: "ended", label: "Finalizadas", clave: "ended" },
];

/**
 * Del formulario plano al shape que espera el server.
 *
 * El formulario es plano porque en un celular anidar campos es peor de completar,
 * pero las fechas van tal cual como "YYYY-MM-DD": el server las interpreta como el
 * día calendario argentino completo (un "hasta el 31" incluye el 31 entero). La
 * conversión no se hace acá a propósito —hacerla en los dos lados es la forma
 * garantizada de que en algún momento se corran un día—.
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
  eventAt: form.eventAt || null,
  sponsor: { name: form.sponsorName.trim(), logo: form.sponsorLogo.trim() },
  place: { city: form.city.trim(), venue: form.venue.trim() },
  // Una publicidad siempre va marcada. El server lo fuerza igual.
  sponsored: form.kind === "ad" ? true : form.sponsored,
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

/**
 * "YYYY-MM-DD" a "31 dic".
 *
 * `timeZone: "UTC"` no es un detalle: la fecha se arma con `Date.UTC` y sin eso
 * `toLocaleDateString` la pasa a la zona del navegador, que en Argentina resta tres
 * horas y devuelve el día ANTERIOR. Una campaña que termina el 31 se mostraba
 * "hasta el 30 dic", que es exactamente el tipo de error de un día que hace que
 * nadie confíe en las fechas de la pantalla.
 */
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
  const corto = diaCorto;
  if (startsAt && endsAt) return `${corto(startsAt)} → ${corto(endsAt)}`;
  if (endsAt) return `hasta el ${corto(endsAt)}`;
  if (startsAt) return `desde el ${corto(startsAt)}`;
  return "sin fecha de fin";
};

/** El mensaje de error que mandó el server, si es que mandó uno útil. */
const mensajeDeError = (error, porDefecto) =>
  error?.response?.data?.error || error?.response?.data?.message || porDefecto;

const NUM = new Intl.NumberFormat("es-AR");

/**
 * Un número con su unidad en el número correcto.
 *
 * "1 impresiones · 1 personas" se lee como un texto sin terminar, y en la pantalla
 * donde se le informan resultados a un anunciante eso alcanza para que el resto
 * parezca igual de descuidado.
 */
const cantidad = (n, singular, plural) =>
  `${NUM.format(n || 0)} ${(n || 0) === 1 ? singular : plural}`;

export default function AdminPromotionsPage() {
  const { showSuccess, showError } = useToast();
  const [datos, setDatos] = useState({
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    summary: { active: 0, scheduled: 0, paused: 0, ended: 0, total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [tipo, setTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null); // null = formulario cerrado
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [borrar, setBorrar] = useState(null);
  const [informe, setInforme] = useState(null);
  // Cuáles están cambiando de estado: sin esto un toque repetido en el interruptor
  // manda dos peticiones que pueden volver en orden invertido y dejar la fila
  // mostrando lo contrario de lo que quedó guardado.
  const [ocupadas, setOcupadas] = useState(() => new Set());

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      setDatos(await getAllPromotions({ page, state: filtro, q: busqueda, kind: tipo }));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [page, filtro, busqueda, tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El buscador espera a que dejes de escribir: una petición por tecla no aporta
  // nada y en una lista larga se nota.
  const [textoBusqueda, setTextoBusqueda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(textoBusqueda.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [textoBusqueda]);

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
      sponsored: form.kind === "ad" ? true : form.sponsored,
      sponsor: { name: form.sponsorName, logo: form.sponsorLogo },
      place: { city: form.city, venue: form.venue },
      eventAt: form.eventAt || null,
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
      // El server dice QUÉ campo está mal (un enlace inválido, un color que no es
      // color). Mostrar "No se pudo guardar" y tragarse el motivo obliga a adivinar.
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

  /**
   * Mostrar u ocultar. Es la operación que más se va a usar, así que es un toque y
   * se ve al instante: la fila se actualiza sin recargar la lista entera.
   */
  const alternarVisible = async (p) => {
    if (ocupadas.has(p._id)) return;
    const visible = !p.active;
    marcarOcupada(p._id, true);
    try {
      await setPromotionVisibility(p._id, visible);
      setDatos((prev) => ({
        ...prev,
        items: prev.items.map((x) =>
          x._id === p._id ? { ...x, active: visible, ...estadoTrasCambio(x, visible) } : x
        ),
      }));
      // El resumen de arriba y los estados dependen de esto, así que se refresca
      // en segundo plano: la fila ya respondió, el resto se pone al día solo.
      cargar();
      showSuccess(visible ? "Campaña visible en la app" : "Campaña pausada");
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
      const movida = await movePromotion(p._id, direccion);
      if (movida) await cargar();
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

  const { items, summary } = datos;

  return (
    <div className="pr">
      {/* ── Resumen y filtros ────────────────────────────────────────────────
          Los contadores son los filtros: el número contesta "qué hay" y el toque
          contesta "mostrame eso". Dos cosas en un solo control, que es lo que hace
          que se use desde un celular. */}
      {/* Tipo primero, estado después: "mostrame las publicidades" es una decisión
          más gruesa que "mostrame las activas", y los contadores de abajo se
          recalculan para el tipo elegido —si no, el panel se contradice solo—. */}
      <div className="pr__types" role="group" aria-label="Tipo de campaña">
        {TIPOS.map((t) => (
          <button
            key={t.id || "all"}
            type="button"
            className={`pr__type ${tipo === t.id ? "is-active" : ""}`}
            aria-pressed={tipo === t.id}
            onClick={() => {
              setTipo(t.id);
              setPage(1);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pr__summary">
        {FILTROS.map((f) => (
          <button
            key={f.id || "all"}
            type="button"
            className={`pr__pill pr__pill--${f.id || "all"} ${filtro === f.id ? "is-active" : ""}`}
            aria-pressed={filtro === f.id}
            onClick={() => {
              setFiltro(f.id);
              setPage(1);
            }}
          >
            <strong>{summary[f.clave] ?? 0}</strong>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      <div className="pr__bar">
        <button className="pr__new" type="button" onClick={abrirNuevo}>
          <Icon name="plus" size={16} /> Nueva campaña
        </button>
        <label className="pr__search">
          <Icon name="search" size={15} />
          <input
            type="search"
            value={textoBusqueda}
            onChange={(e) => setTextoBusqueda(e.target.value)}
            placeholder="Buscar por título o anunciante"
            aria-label="Buscar campaña"
          />
        </label>
      </div>

      {/* Lo que la app está mostrando ahora mismo, dicho en una línea. Es la
          pregunta número uno de cualquiera que abre este panel. */}
      {/* El texto va dentro de UN span y no como nodos sueltos: el contenedor es
          flex con `gap`, así que cada nodo suelto sería un ítem y el gap metería un
          espacio antes del punto final ("1 campaña ."). */}
      <p className="pr__live-note">
        <Icon name={summary.active === 0 ? "info" : "eye"} size={13} />
        {summary.active === 0 ? (
          <span>
            No hay ninguna campaña al aire: Descubrí está mostrando sólo su contenido
            curado, sin ningún espacio vacío.
          </span>
        ) : (
          <span>
            La app está mostrando{" "}
            <strong>{cantidad(summary.active, "campaña", "campañas")}</strong>
            {summary.active > 6
              ? ", y el carrusel rota entre las 6 de mayor prioridad."
              : "."}
          </span>
        )}
      </p>

      {form && (
        <form className="pr__form" onSubmit={guardar}>
          <div className="pr__form-head">
            <h3>{editId ? "Editar campaña" : "Nueva campaña"}</h3>
            <button type="button" className="pr__close" onClick={cerrar} aria-label="Cerrar">
              <Icon name="x" size={16} />
            </button>
          </div>

          {/* ── Vista previa ───────────────────────────────────────────────
              Arriba y no al final: se mira mientras se escribe, que es cuando
              sirve. Es el MISMO componente que dibuja la tarjeta en la app, así
              que no puede prometer algo distinto de lo que se va a ver. */}
          <div className="pr__preview">
            <span className="pr__preview-label">
              <Icon name="eye" size={12} /> Así se va a ver en Descubrí
            </span>
            <PromoCard promo={previa} interactive={false} preview />
          </div>

          {/* Qué es: cambia el cartel que ve el usuario, así que es la primera
              decisión y no un detalle escondido al final. */}
          <div className="pr__kind" role="group" aria-label="Tipo de campaña">
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
              <Icon name="info" size={13} />
              <span>
                Se va a mostrar con el cartel <strong>Publicidad</strong>. No se puede
                sacar: es lo que mantiene creíbles a las recomendaciones del resto de
                la pantalla.
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

          <ImagePicker
            label="Imagen de fondo"
            value={form.image}
            onChange={(v) => set("image", v)}
            disabled={saving}
            hint="Opcional. Sin imagen, la tarjeta usa un degradado con el color de acento — que es preferible a una foto que no se ve bien detrás del texto."
          />

          {/* Quién publica: la marca del anunciante. Va en su propio bloque porque
              son dos datos que se completan juntos y se ven juntos en la tarjeta. */}
          <fieldset className="pr__fieldset">
            <legend>Quién lo publica</legend>
            <div className="pr__row">
              <label className="pr__field">
                <span>Nombre</span>
                <input
                  type="text"
                  maxLength={60}
                  value={form.sponsorName}
                  onChange={(e) => set("sponsorName", e.target.value)}
                  placeholder="Bodega Norton"
                />
                <small>
                  El usuario tiene derecho a saber de quién es el mensaje. En una
                  publicidad, completalo siempre.
                </small>
              </label>
              <ImagePicker
                label="Logo"
                variant="logo"
                value={form.sponsorLogo}
                onChange={(v) => set("sponsorLogo", v)}
                disabled={saving}
                hint="PNG con fondo transparente es lo ideal. Se muestra chico, sobre una pastilla clara para que se lea sobre la tarjeta oscura."
              />
            </div>
          </fieldset>

          <label className="pr__field">
            <span>Color de acento</span>
            <input
              type="text"
              value={form.accent}
              onChange={(e) => set("accent", e.target.value)}
              placeholder="#c6465f"
            />
            <small>
              Un color de la identidad del anunciante. Tiñe el degradado y el botón.
            </small>
          </label>

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
                <small>Incluye el día entero. Vacío = hasta que la pauses</small>
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
                <small>
                  Apagado queda pausada: no la ve nadie y sus números se conservan.
                </small>
              </span>
            </label>
          </fieldset>

          {/* Sólo para eventos. Una publicidad no tiene fecha, ciudad ni salón, así
              que estos tres campos eran tres cosas para saltear en la pantalla más
              larga del panel —y la duda de si había que completarlos—. */}
          <fieldset className="pr__fieldset" hidden={form.kind === "ad"}>
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

          <p className="pr__notice">
            <Icon name="info" size={13} />
            <span>
              El orden entre campañas se cambia con las flechas de la lista, no con un
              número acá: así lo que ves en la lista es exactamente el orden en que van
              a salir.
            </span>
          </p>

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

      {!loading && !failed && items.length === 0 && (
        <div className="admin-empty-state">
          {datos.total === 0 ? (
            <>
              <p><strong>No hay campañas cargadas.</strong></p>
              <p>
                Descubrí está mostrando sólo su contenido curado. Cuando cargues la
                primera, el carrusel aparece solo arriba de las recomendaciones.
              </p>
            </>
          ) : (
            <p>Ninguna campaña coincide con este filtro.</p>
          )}
        </div>
      )}

      {!loading && !failed && items.length > 0 && (
        <ul className="pr__list">
          {items.map((p, i) => (
            <li key={p._id} className={`pr__item pr__item--${p.state}`}>
              <div className="pr__item-main">
                <span className="pr__item-head">
                  <span className={`pr__state pr__state--${p.state}`}>{p.stateLabel}</span>
                  {p.sponsored && <span className="pr__tag-ad">Publicidad</span>}
                </span>

                <strong className="pr__item-title">{p.title}</strong>

                <span className="pr__item-meta">
                  {p.kind === "ad" ? "Publicidad" : "Evento"}
                  {p.sponsor?.name ? ` · ${p.sponsor.name}` : ""}
                  {` · ${ventanaEnPalabras(p)}`}
                </span>

                {/* La razón del estado, en la misma fila. Es la respuesta a "¿por
                    qué no se ve mi campaña?" sin tener que abrir nada. */}
                <span className="pr__item-hint">{p.stateHint}</span>

                {/* Los números que va a pedir un anunciante, a la vista — y son el
                    botón que abre el informe.
                    Antes había un ícono aparte para eso: un control más en una fila
                    que ya tenía cinco, para hacer exactamente lo que uno espera al
                    tocar el número que está mirando. Mismo clic, un botón menos. */}
                <button
                  type="button"
                  className={`pr__item-stats ${informe === p._id ? "is-open" : ""}`}
                  onClick={() => setInforme(informe === p._id ? null : p._id)}
                  aria-expanded={informe === p._id}
                  title="Ver el informe de la campaña"
                >
                  {cantidad(p.impressions, "impresión", "impresiones")} ·{" "}
                  {cantidad(p.reach, "persona", "personas")} ·{" "}
                  {cantidad(p.clicks, "clic", "clics")}
                  {p.ctr !== null && p.ctr !== undefined && ` · ${p.ctr}%`}
                  <Icon name={informe === p._id ? "chevron-up" : "chevron-down"} size={13} />
                </button>
              </div>

              <div className="pr__item-actions">
                {/* Orden: sólo tiene sentido si hay con quién intercambiar. */}
                <div className="pr__order">
                  <button
                    type="button"
                    className="pr__icon pr__icon--small"
                    onClick={() => mover(p, "up")}
                    disabled={i === 0 && datos.page === 1}
                    title="Subir un lugar"
                    aria-label={`Subir ${p.title}`}
                  >
                    <Icon name="chevron-up" size={14} />
                  </button>
                  <button
                    type="button"
                    className="pr__icon pr__icon--small"
                    onClick={() => mover(p, "down")}
                    disabled={i === items.length - 1 && datos.page === datos.pages}
                    title="Bajar un lugar"
                    aria-label={`Bajar ${p.title}`}
                  >
                    <Icon name="chevron-down" size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  className={`pr__icon ${p.active ? "is-on" : ""}`}
                  onClick={() => alternarVisible(p)}
                  disabled={ocupadas.has(p._id)}
                  title={p.active ? "Ocultar (deja de mostrarse ya)" : "Mostrar en la app"}
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
                  title="Eliminar (se pierden sus métricas)"
                  aria-label={`Eliminar ${p.title}`}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>

              {informe === p._id && (
                <div className="pr__item-report">
                  <PromoStats promoId={p._id} title={p.title} onClose={() => setInforme(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Paginado: la lista completa anda bien con quince campañas y deja de abrir
          con mil quinientas, que es cuando el panel más importa. */}
      {datos.pages > 1 && (
        <div className="pr__pager">
          <button
            type="button"
            className="button"
            onClick={() => setPage((n) => Math.max(n - 1, 1))}
            disabled={datos.page <= 1}
          >
            Anterior
          </button>
          <span>
            Página {datos.page} de {datos.pages} · {datos.total} campañas
          </span>
          <button
            type="button"
            className="button"
            onClick={() => setPage((n) => Math.min(n + 1, datos.pages))}
            disabled={datos.page >= datos.pages}
          >
            Siguiente
          </button>
        </div>
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

/**
 * El estado de una fila que acaba de cambiar de visibilidad.
 *
 * Es la ÚNICA excepción a "el estado lo calcula el server", y existe para que el
 * interruptor responda en el acto en vez de esperar el viaje de ida y vuelta de la
 * lista. Se limita a los dos casos que el cambio puede producir y para el resto se
 * queda con lo que dijo el server: no reimplementa la regla, y la recarga en
 * segundo plano lo deja igual que el server un instante después.
 */
const estadoTrasCambio = (fila, visible) => {
  // Una campaña vencida sigue vencida: prenderla no la revive, y decir otra cosa
  // mandaría al administrador a tocar el interruptor sin entender por qué no pasa
  // nada. Para volver a mostrarla hay que extenderle la fecha de fin.
  if (fila.state === "ended") {
    return { state: "ended", stateLabel: "Finalizada", stateHint: fila.stateHint };
  }
  if (!visible) {
    return {
      state: "paused",
      stateLabel: "Pausada",
      stateHint: "Oculta: nadie la ve, sus números se conservan",
    };
  }
  const programada = fila.form?.startsAt && fila.form.startsAt > new Date().toISOString().slice(0, 10);
  return programada
    ? {
        state: "scheduled",
        stateLabel: "Programada",
        stateHint: "Empieza en la fecha que le pusiste",
      }
    : { state: "active", stateLabel: "Activa", stateHint: "Se está mostrando en la app" };
};
