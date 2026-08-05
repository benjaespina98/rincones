import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import { getAnalyticsSummary } from "../services/analyticsApi";
import "./styles/AdminAnalyticsPage.css";

/**
 * El tablero de uso: cuánta gente entra a Rincones y qué mira.
 *
 * ── LA DISTINCIÓN QUE ORDENA TODA LA PANTALLA ───────────────────────────────
 * "Visitantes" son PERSONAS y "Visitas" son PANTALLAS ABIERTAS. Es la misma
 * confusión que había en Mi Bodega entre botellas y etiquetas, y acá importa más
 * todavía: son los dos números que un tablero mal hecho mezcla para reportar
 * diez veces el tamaño real. Cada tarjeta dice explícitamente qué cuenta.
 *
 * Y el más engañoso: los visitantes del período NO son la suma de los diarios
 * —la misma persona entrando lunes y martes es una—. Ese número lo resuelve el
 * server contando hashes distintos sobre todo el rango; acá sólo se muestra.
 *
 * ── POR QUÉ EL GRÁFICO ES UN SVG A MANO ─────────────────────────────────────
 * Es una serie de una sola métrica. Traer una librería de gráficos para esto
 * sumaría peso al bundle de todos los usuarios de la app por una pantalla que
 * sólo vos vas a abrir.
 */

/**
 * Los períodos que se pueden mirar.
 *
 * Llega hasta un año porque los cuadros salen del resumen diario, que no caduca.
 * Antes salían de los eventos crudos —que viven 180 días— y ofrecer un rango más
 * largo habría devuelto listas recortadas sin decir que lo estaban: se leería
 * como "no llegó nadie de ningún lado" cuando en realidad el dato caducó.
 */
const RANGOS = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 365, label: "1 año" },
];

/** Las horas, agrupadas como se las mira: no hay que leer 24 números. */
const FRANJAS = [
  { desde: 6, hasta: 11, label: "Mañana" },
  { desde: 12, hasta: 13, label: "Mediodía" },
  { desde: 14, hasta: 19, label: "Tarde" },
  { desde: 20, hasta: 23, label: "Noche" },
  { desde: 0, hasta: 5, label: "Madrugada" },
];

const franjaDe = (hora) =>
  FRANJAS.find((f) => (f.desde <= f.hasta ? hora >= f.desde && hora <= f.hasta : hora >= f.desde || hora <= f.hasta));

/** "2026-07-29" → "29/7". Etiqueta corta para el eje. */
const diaCorto = (day) => {
  const [, m, d] = String(day).split("-");
  return `${Number(d)}/${Number(m)}`;
};

/**
 * El gráfico de la evolución.
 *
 * Es un área con línea, no barras: lo que se quiere leer es la TENDENCIA (¿esto
 * crece?), y con 90 días las barras quedan de un píxel de ancho.
 */
function Grafico({ serie, metrica }) {
  const { path, area, max } = useMemo(() => {
    const valores = serie.map((d) => d[metrica] || 0);
    const techo = Math.max(...valores, 1);
    const ancho = 100;
    const alto = 100;
    const paso = valores.length > 1 ? ancho / (valores.length - 1) : 0;

    const puntos = valores.map((v, i) => {
      const x = valores.length > 1 ? i * paso : ancho / 2;
      const y = alto - (v / techo) * alto;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    return {
      path: `M ${puntos.join(" L ")}`,
      area: `M 0,${alto} L ${puntos.join(" L ")} L ${ancho},${alto} Z`,
      max: techo,
    };
  }, [serie, metrica]);

  if (serie.length === 0) return null;

  return (
    <div className="an-chart">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="an-chart__svg"
        role="img"
        aria-label={`Evolución de ${metrica}. Máximo del período: ${max}.`}
      >
        <defs>
          <linearGradient id="anFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#anFill)" />
        {/* vector-effect mantiene el grosor de la línea con el viewBox estirado:
            sin él, `preserveAspectRatio="none"` la deforma. */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>

      <div className="an-chart__axis">
        <span>{diaCorto(serie[0].day)}</span>
        <span className="an-chart__max">máx. {max}</span>
        <span>{diaCorto(serie[serie.length - 1].day)}</span>
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(30);
  // Período elegido a mano. Mientras estén los dos, mandan sobre `days`.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [metrica, setMetrica] = useState("visitors");

  // Cambia al tocar "Reintentar" y vuelve a disparar la carga sin tener que
  // fingir un cambio de período.
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * El efecto SÓLO sincroniza con el servidor: no toca el estado antes de pedir.
   *
   * Poner `setLoading(true)` acá adentro dispara un render en cascada (y el
   * linter lo marca, con razón). El "estoy cargando" lo enciende quien provoca la
   * carga —el botón de período o el de reintentar—, que es donde de verdad
   * empieza la intención del usuario. El efecto sólo lo apaga cuando llega la
   * respuesta.
   */
  useEffect(() => {
    let active = true;
    getAnalyticsSummary(desde && hasta ? { from: desde, to: hasta } : { days })
      .then((d) => {
        if (!active) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => active && setFailed(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [days, desde, hasta, reloadToken]);

  /** Cambiar de período: el spinner se enciende acá, no en el efecto. */
  const cambiarRango = (n) => {
    setLoading(true);
    setDays(n);
    // Elegir un preset limpia las fechas a mano: si no, el botón se marcaría
    // como activo y los números serían de otro período.
    setDesde("");
    setHasta("");
  };

  /**
   * Las fechas a mano piden sólo cuando están las dos: con una sola, el rango
   * sería medio inventado y además dispararía una consulta por cada tecla del
   * calendario.
   */
  const cambiarFecha = (cual, valor) => {
    const d = cual === "desde" ? valor : desde;
    const h = cual === "hasta" ? valor : hasta;
    if (cual === "desde") setDesde(valor);
    else setHasta(valor);
    if (d && h) setLoading(true);
  };

  const aMano = Boolean(desde && hasta);

  const reintentar = () => {
    setLoading(true);
    setFailed(false);
    setReloadToken((t) => t + 1);
  };

  if (loading && !data) return <p className="admin-empty-state">Cargando métricas…</p>;

  if (failed) {
    return (
      <div className="admin-empty-state">
        <p>No pudimos cargar las métricas.</p>
        <button className="button" type="button" onClick={reintentar}>Reintentar</button>
      </div>
    );
  }

  const t = data?.totals || {};
  const serie = data?.daily || [];
  const sinDatos = (t.views || 0) === 0;

  /**
   * La hora pico y su franja.
   *
   * Se resume en palabras además del gráfico porque nadie se lleva "las 21" de un
   * gráfico de 24 barras: se lleva "a la noche". El número exacto queda en el
   * `title` de cada barra para quien lo quiera.
   */
  const horas = data?.byHour || [];
  const maxHora = Math.max(0, ...horas.map((h) => h.count));
  const picoHorario = (() => {
    if (!maxHora) return null;
    const pico = horas.find((h) => h.count === maxHora);
    const franja = franjaDe(pico.hour);
    return {
      hora: pico.hour,
      label: `${franja?.label || ""} · ${String(pico.hour).padStart(2, "0")}h`.trim(),
    };
  })();

  return (
    <div className="an">
      <div className="an__barra">
        <div className="an__rangos" role="group" aria-label="Período">
          {RANGOS.map((r) => (
            <button
              key={r.days}
              type="button"
              className={`an__rango ${!aMano && days === r.days ? "is-active" : ""}`}
              aria-pressed={!aMano && days === r.days}
              onClick={() => cambiarRango(r.days)}
            >
              {r.label}
            </button>
          ))}

          {/* Fechas a mano, al lado de los atajos y no escondidas detrás de un
              "personalizado": es lo que hace falta para informar un mes cerrado,
              y esconderlo lo vuelve una función que existe pero no se usa. */}
          <label className="an__fecha">
            <span className="sr-only">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta || undefined}
              onChange={(e) => cambiarFecha("desde", e.target.value)}
            />
          </label>
          <span className="an__fecha-sep" aria-hidden="true">→</span>
          <label className="an__fecha">
            <span className="sr-only">Hasta</span>
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => cambiarFecha("hasta", e.target.value)}
            />
          </label>

          {aMano && (
            <button
              type="button"
              className="an__rango an__rango--limpiar"
              onClick={() => cambiarRango(30)}
            >
              Volver a los atajos
            </button>
          )}
        </div>
        {/* Al cambiar de período los números de abajo siguen siendo los anteriores
            hasta que llegue la respuesta: mostrarlos sin avisar haría creer que ya
            se actualizaron. Se mantienen a la vista (mejor que un spinner que
            vacía la pantalla) pero con el aviso al lado. */}
        {loading && <span className="an__cargando" role="status">Actualizando…</span>}
      </div>

      {sinDatos ? (
        /* El vacío se explica en vez de mostrar cuatro ceros: con cuatro ceros no
           se sabe si nadie entró o si la medición no está funcionando. */
        <div className="admin-empty-state">
          <p><strong>Todavía no hay visitas registradas en este período.</strong></p>
          <p>
            La medición se activa sola cuando alguien abre la app. Si acabás de
            desplegar, esperá un par de minutos y recargá.
          </p>
        </div>
      ) : (
        <>
          {/* Cada tarjeta aclara si cuenta PERSONAS o PANTALLAS: es la
              distinción que hace que los números signifiquen algo. */}
          <div className="an__cards">
            <article className="an__card is-primary">
              <span className="an__card-label">Visitantes</span>
              <strong className="an__card-n">{t.visitors ?? 0}</strong>
              <small>
                {t.visitorsExact === false
                  ? "Distintas. Más allá de 180 días el número queda corto"
                  : "Distintas, sin repetir entre días"}
              </small>
            </article>
            <article className="an__card">
              <span className="an__card-label">Hoy</span>
              <strong className="an__card-n">{t.today ?? 0}</strong>
              <small>Personas distintas hoy</small>
            </article>
            <article className="an__card">
              <span className="an__card-label">Visitas</span>
              <strong className="an__card-n">{t.views ?? 0}</strong>
              <small>Pantallas abiertas, todas las veces</small>
            </article>
            {/* No es "sesiones" en el sentido de "de tal hora a tal hora": el
                reloj se parte en bloques de media hora y se cuenta en cuántos
                hubo actividad. El rótulo dice eso y no promete una precisión que
                el dato no tiene. Ver SESION_MS en analytics.service.js. */}
            <article className="an__card">
              <span className="an__card-label">Ratos de uso</span>
              <strong className="an__card-n">{t.sessions ?? 0}</strong>
              <small title="Bloques de media hora con actividad">Medias horas con actividad</small>
            </article>
          </div>

          <div className="an__block">
            <div className="an__block-head">
              <h3>Evolución</h3>
              <div className="an__toggle" role="group" aria-label="Métrica del gráfico">
                {[
                  { id: "visitors", label: "Visitantes" },
                  { id: "views", label: "Visitas" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`an__toggle-btn ${metrica === m.id ? "is-active" : ""}`}
                    aria-pressed={metrica === m.id}
                    onClick={() => setMetrica(m.id)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <Grafico serie={serie} metrica={metrica} />
          </div>

          {/* ── A QUÉ HORA ESTÁ LA GENTE ──────────────────────────────────
              Es la pregunta que contestan las herramientas de Meta con su "mejor
              momento para publicar", y sirve para dos decisiones concretas:
              cuándo mandar una notificación o publicar una campaña, y a qué hora
              NO desplegar.

              Van las 24 horas siempre, incluidas las que están en cero: un
              gráfico al que le faltan las horas sin actividad miente sobre la
              forma del día. Y arriba, en palabras, la franja donde se concentra
              —que es lo único que uno se lleva de acá—. */}
          {picoHorario && (
            <div className="an__block">
              <div className="an__block-head">
                <h3>A qué hora entran</h3>
                <span className="an__pico">
                  Más actividad: <strong>{picoHorario.label}</strong>
                </span>
              </div>

              <div className="an__horas" role="img" aria-label={`Actividad por hora. Pico a las ${picoHorario.hora} horas.`}>
                {data.byHour.map((h) => (
                  <div
                    key={h.hour}
                    className={`an__hora ${h.hour === picoHorario.hora ? "is-pico" : ""}`}
                    title={`${String(h.hour).padStart(2, "0")}:00 · ${h.count} eventos`}
                  >
                    <div
                      className="an__hora-barra"
                      style={{ height: `${maxHora ? (h.count / maxHora) * 100 : 0}%` }}
                    />
                  </div>
                ))}
              </div>

              <div className="an__horas-eje" aria-hidden="true">
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>23</span>
              </div>
            </div>
          )}

          <div className="an__cols">
            <div className="an__block">
              <div className="an__block-head"><h3>Pantallas más vistas</h3></div>
              {data.topPaths?.length ? (
                <ul className="an__list">
                  {data.topPaths.map((p) => (
                    <li key={p.path}>
                      <span className="an__list-key">{p.path}</span>
                      <span className="an__list-n">{p.views}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="an__none">Sin datos todavía.</p>
              )}
            </div>

            <div className="an__block">
              <div className="an__block-head"><h3>Qué hace la gente</h3></div>
              {data.byType?.length ? (
                <ul className="an__list">
                  {data.byType.map((e) => (
                    <li key={e.type}>
                      <span className="an__list-key">{e.type}</span>
                      <span className="an__list-n">{e.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="an__none">Sin datos todavía.</p>
              )}
            </div>

            <div className="an__block">
              <div className="an__block-head"><h3>Dispositivos</h3></div>
              <ul className="an__list">
                <li>
                  <span className="an__list-key"><Icon name="bottle" size={13} /> Celular</span>
                  <span className="an__list-n">{data.devices?.mobile ?? 0}</span>
                </li>
                <li>
                  <span className="an__list-key"><Icon name="grid" size={13} /> Escritorio</span>
                  <span className="an__list-n">{data.devices?.desktop ?? 0}</span>
                </li>
              </ul>
            </div>

            <div className="an__block">
              <div className="an__block-head"><h3>De dónde llegan</h3></div>
              {data.referrers?.length ? (
                <ul className="an__list">
                  {data.referrers.map((r) => (
                    <li key={r.host}>
                      <span className="an__list-key">{r.host}</span>
                      <span className="an__list-n">{r.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="an__none">
                  Nadie llegó desde otro sitio todavía (o entraron escribiendo la dirección).
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Cómo se cuenta cada número, dicho de frente y sin ocupar la pantalla.
          Un tablero que no explica su método invita a tomar decisiones sobre
          números que no significan lo que uno cree, y la pregunta "¿esto es
          real?" vuelve cada vez que se abre el panel. Cerrado es un renglón. */}
      <details className="an__metodo">
        <summary>
          <Icon name="info" size={13} /> Cómo se cuenta cada número
        </summary>

        <dl className="an__metodo-lista">
          <div>
            <dt>Visitantes</dt>
            <dd>
              Códigos anónimos distintos en todo el período. No es la suma de los
              días: quien entra el lunes y el martes cuenta una vez.
            </dd>
          </div>
          <div>
            <dt>Hoy</dt>
            <dd>Los mismos códigos, contados sólo dentro del día de hoy.</dd>
          </div>
          <div>
            <dt>Visitas</dt>
            <dd>Cada vez que se abre una pantalla. La misma persona suma varias.</dd>
          </div>
          <div>
            <dt>Ratos de uso</dt>
            <dd>
              El reloj se parte en bloques de media hora y se cuenta en cuántos
              hubo actividad. No es la duración de una visita.
            </dd>
          </div>
          <div>
            <dt>Pantallas, orígenes y horarios</dt>
            <dd>
              Salen del resumen diario, que no caduca: se pueden mirar años hacia
              atrás. Sólo el conteo de personas distintas del período necesita los
              eventos, que viven 180 días; pasado ese rango el panel lo aclara en
              vez de mostrar un número corto como si fuera exacto.
            </dd>
          </div>
          <div>
            <dt>A qué hora entran</dt>
            <dd>
              En hora de Argentina, sumando todos los días del período. Sirve para
              elegir cuándo publicar algo y cuándo no desplegar.
            </dd>
          </div>
        </dl>

        <p className="an__nota">
          <Icon name="eye" size={13} /> Sin cookies y sin datos personales: el
          código sale de la conexión y no se puede volver atrás. Dos personas en
          la misma red y con el mismo teléfono cuentan como una, y quien entra por
          wifi y por datos cuenta como dos. Se respeta la señal de "no me
          rastrees" del navegador.
        </p>
      </details>
    </div>
  );
}
