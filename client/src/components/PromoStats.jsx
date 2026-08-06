import { useEffect, useState } from "react";
import Icon from "./Icon";
import { getPromotionStats } from "../services/promotionsApi";
import "./PromoStats.css";

/**
 * El informe de una campaña: lo que se le muestra a un anunciante.
 *
 * ── LAS TRES DECISIONES QUE HACEN QUE ESTO SEA PRESENTABLE ──────────────────
 *
 * 1. IMPRESIONES Y PERSONAS SON DOS NÚMEROS, NO UNO. "Se mostró 900 veces" y "la
 *    vieron 210 personas" responden preguntas distintas, y mostrar sólo el primero
 *    llamándolo "alcance" es la forma más común de inflar un informe. Van separados
 *    y con el nombre correcto.
 *
 * 2. EL PORCENTAJE DE CLIC NO SE MUESTRA CON POCOS DATOS. 1 clic de 3 impresiones
 *    no es "33% de efectividad", es ruido. Debajo de 20 impresiones el server manda
 *    `null` y acá se ve un "—" con su explicación, en vez de un número que invita a
 *    una conclusión que el dato no aguanta.
 *
 * 3. DICE DE QUÉ PERÍODO HABLA. Un total sin período es un número que no se puede
 *    verificar contra nada.
 */

const NUM = new Intl.NumberFormat("es-AR");

/** El número con su unidad en el número correcto: "1 impresión", no "1 impresiones". */
const cantidad = (n, singular, plural) =>
  `${NUM.format(n || 0)} ${(n || 0) === 1 ? singular : plural}`;

/**
 * El día como "12 ago", para el eje del gráfico.
 *
 * `timeZone: "UTC"` porque la fecha se arma con `Date.UTC`: sin eso el navegador la
 * pasa a hora local y en Argentina devuelve el día anterior. Un informe corrido un
 * día no se puede comparar contra nada.
 */
const diaCorto = (day) => {
  const [a, m, d] = String(day).split("-").map(Number);
  if (!a || !m || !d) return day;
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

export default function PromoStats({ promoId, title, onClose }) {
  const [days, setDays] = useState(30);
  /**
   * La respuesta viene con la CLAVE del pedido que la produjo (campaña + período).
   * "Está cargando" se deduce de que la clave que hay no es la que se está pidiendo,
   * en vez de mantener una bandera aparte: así no hay ningún instante en que se vean
   * los números de un período con el rótulo de otro, que es lo que pasa cuando el
   * dato y su estado de carga se guardan por separado.
   */
  const [respuesta, setRespuesta] = useState({ key: "", data: null, failed: false });
  const clave = `${promoId}:${days}`;
  const loading = respuesta.key !== clave;
  const data = loading ? null : respuesta.data;
  const failed = !loading && respuesta.failed;

  useEffect(() => {
    let vivo = true;
    getPromotionStats(promoId, days)
      .then((d) => vivo && setRespuesta({ key: clave, data: d, failed: false }))
      .catch(() => vivo && setRespuesta({ key: clave, data: null, failed: true }));
    return () => {
      vivo = false;
    };
  }, [promoId, days, clave]);

  // El máximo del período fija la altura de las barras. Con todo en cero no se
  // divide por cero y el gráfico queda plano, que es la lectura correcta.
  const tope = Math.max(1, ...(data?.daily || []).map((d) => d.impressions));
  const conActividad = (data?.daily || []).some((d) => d.impressions || d.clicks);

  return (
    <div className="pstats">
      <div className="pstats__head">
        <div>
          <h4>{title}</h4>
          {data && (
            <span className="pstats__range">
              {diaCorto(data.range.from)} — {diaCorto(data.range.to)}
            </span>
          )}
        </div>
        <button type="button" className="pstats__close" onClick={onClose} aria-label="Cerrar informe">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="pstats__periods" role="group" aria-label="Período">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            className={`pstats__period ${days === n ? "is-active" : ""}`}
            aria-pressed={days === n}
            onClick={() => setDays(n)}
          >
            {n} días
          </button>
        ))}
      </div>

      {loading && <p className="pstats__msg">Cargando el informe…</p>}
      {failed && <p className="pstats__msg">No se pudo traer el informe.</p>}

      {data && !loading && (
        <>
          <div className="pstats__cards">
            <article className="pstats__card">
              <span>Impresiones</span>
              <strong>{NUM.format(data.period.impressions)}</strong>
              <small>Veces que se mostró</small>
            </article>
            <article className="pstats__card">
              <span>Personas</span>
              <strong>{NUM.format(data.period.reach)}</strong>
              <small>Distintas, sin repetir por día</small>
            </article>
            <article className="pstats__card">
              <span>Clics</span>
              <strong>{NUM.format(data.period.clicks)}</strong>
              {/* Toques, no gente: la misma persona puede tocar cinco veces. Por
                  eso la efectividad de al lado no se calcula con este número. */}
              <small>Veces que la tocaron</small>
            </article>
            {/* La efectividad son personas sobre personas: cuánta gente de la que
                la vio la tocó. Decía "clics sobre impresiones" y llegó a mostrar
                130%, porque las impresiones se cuentan una vez por visita y los
                clics no: eran dos cosas distintas en la misma fracción. */}
            <article className="pstats__card">
              <span>Efectividad</span>
              <strong>{data.period.ctr === null ? "—" : `${data.period.ctr}%`}</strong>
              <small>
                {data.period.ctr === null
                  ? "Hacen falta 20 personas para que el porcentaje signifique algo"
                  : `${NUM.format(data.period.clickReach)} de ${NUM.format(data.period.reach)} personas la tocaron`}
              </small>
            </article>
          </div>

          {conActividad ? (
            <div className="pstats__chart" role="img" aria-label="Impresiones por día">
              {data.daily.map((d) => (
                <div key={d.day} className="pstats__bar-wrap" title={`${diaCorto(d.day)}: ${d.impressions} impresiones, ${d.clicks} clics`}>
                  <div
                    className="pstats__bar"
                    style={{ height: `${Math.round((d.impressions / tope) * 100)}%` }}
                  />
                  {/* El clic va como una marca sobre la barra y no como una segunda
                      barra: siempre es un número mucho más chico, y al lado de las
                      impresiones sería una línea de un píxel que no se lee. */}
                  {d.clicks > 0 && <span className="pstats__clickdot" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="pstats__msg">
              Todavía no hay actividad en este período. Si la campaña está programada
              o pausada, es lo esperado.
            </p>
          )}

          <p className="pstats__total">
            Desde que se creó: {cantidad(data.lifetime.impressions, "impresión", "impresiones")} ·{" "}
            {cantidad(data.lifetime.reach, "persona", "personas")} ·{" "}
            {cantidad(data.lifetime.clicks, "clic", "clics")}
          </p>
          <p className="pstats__note">
            Las personas se cuentan con un identificador anónimo por día, sin cookies
            ni datos personales. Es una aproximación honesta: la misma persona en wifi
            y en datos móviles puede contarse dos veces.
          </p>
        </>
      )}
    </div>
  );
}
