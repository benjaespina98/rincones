import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Icon from "../components/Icon";
import { getPublicReport } from "../services/promotionsApi";
import "./styles/PromoReportPage.css";

/**
 * El informe que abre el anunciante con su enlace.
 *
 * ── QUÉ PROBLEMA RESUELVE ───────────────────────────────────────────────────
 * Que alguien pague por una publicidad y su única forma de saber si se está
 * viendo sea preguntarte a vos. Ahí hay dos problemas: uno de confianza —tu
 * palabra contra la suya, y los números los ponés vos— y uno de trabajo, porque
 * cada cierre de mes son mensajes y capturas de pantalla.
 *
 * ── LAS TRES DECISIONES QUE LO HACEN CREÍBLE ────────────────────────────────
 *
 * 1. LOS NÚMEROS QUE SE FACTURAN VAN PRIMERO Y SEPARADOS. Personas alcanzadas y
 *    clics arriba; las impresiones, que son el número grande y el que menos dice,
 *    abajo y explicado. Un informe que abre con el número más alto se lee como
 *    una venta, no como una rendición de cuentas.
 *
 * 2. DICE CÓMO SE MIDE, SIN QUE HAYA QUE PEDIRLO. Cuándo se cuenta una impresión,
 *    qué se descarta y cuáles son los límites del método. Un anunciante que
 *    pregunta "¿cómo sé que esto es real?" y no encuentra la respuesta escrita
 *    asume lo peor, y hace bien.
 *
 * 3. TIENE EL DÍA A DÍA. Un total no se puede verificar contra nada. La serie
 *    diaria sí: el anunciante la cruza con su propio calendario —el día que hizo
 *    su promoción, el fin de semana largo— y ahí el número se vuelve suyo.
 */

const NUM = new Intl.NumberFormat("es-AR");

const diaCorto = (dia) => {
  const [a, m, d] = String(dia).split("-").map(Number);
  if (!a) return dia;
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

const RANGOS = [7, 30, 90];

export default function PromoReportPage() {
  const { token } = useParams();
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [falló, setFalló] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setFalló(false);
      setDatos(await getPublicReport(token, dias));
    } catch {
      setFalló(true);
    } finally {
      setCargando(false);
    }
  }, [token, dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargando && !datos) {
    return <div className="rep"><p className="rep__msg">Cargando el informe…</p></div>;
  }

  if (falló || !datos) {
    return (
      <div className="rep">
        <div className="rep__vacio">
          <h1>Este informe no está disponible</h1>
          <p>
            El enlace puede haber caducado o haber sido dado de baja. Pedile uno
            nuevo a quien te lo compartió.
          </p>
        </div>
      </div>
    );
  }

  const { campaign: c, period: p, range } = datos;
  const maximo = Math.max(1, ...datos.daily.map((d) => d.impressions));
  const conActividad = datos.daily.some((d) => d.impressions > 0);

  return (
    <div className="rep">
      <header className="rep__head">
        <span className="rep__marca">Rincones</span>
        <h1 className="rep__titulo">{c.title}</h1>
        {c.sponsor && <p className="rep__anunciante">{c.sponsor}</p>}
        <p className="rep__periodo">
          Del {diaCorto(range.from)} al {diaCorto(range.to)}
          {c.startsAt && c.endsAt && (
            <em> · Campaña contratada del {diaCorto(c.startsAt)} al {diaCorto(c.endsAt)}</em>
          )}
        </p>
      </header>

      <div className="rep__rangos" role="group" aria-label="Período del informe">
        {RANGOS.map((n) => (
          <button
            key={n}
            type="button"
            className={`rep__rango ${dias === n ? "is-active" : ""}`}
            aria-pressed={dias === n}
            onClick={() => setDias(n)}
          >
            {n} días
          </button>
        ))}
      </div>

      {/* Los dos números que se facturan, arriba y solos. Las impresiones van
          abajo: son el número más grande y el que menos dice, y un informe que
          abre con él se lee como una venta. */}
      <div className="rep__destacados">
        <article className="rep__card is-primary">
          <span className="rep__label">Personas alcanzadas</span>
          <strong className="rep__n">{NUM.format(p.reach)}</strong>
          <small>Distintas, sin contar dos veces a la misma en el mismo día</small>
        </article>
        <article className="rep__card">
          <span className="rep__label">Entraron al sitio</span>
          <strong className="rep__n">{NUM.format(p.clickReach)}</strong>
          <small>
            Personas que tocaron la publicidad
            {p.ctr !== null && p.ctr !== undefined && ` · ${p.ctr}% de las que la vieron`}
          </small>
        </article>
      </div>

      <div className="rep__secundarios">
        <div>
          <span>{NUM.format(p.impressions)}</span>
          <small>veces que se mostró</small>
        </div>
        <div>
          <span>{NUM.format(p.clicks)}</span>
          <small>toques en total</small>
        </div>
      </div>

      {conActividad && (
        <section className="rep__bloque">
          <h2>Día a día</h2>
          {/* Un total no se puede verificar contra nada; la serie diaria sí. */}
          <div className="rep__grafico" role="img" aria-label="Impresiones por día">
            {datos.daily.map((d) => (
              <div
                key={d.day}
                className="rep__barra-caja"
                title={`${diaCorto(d.day)}: ${d.impressions} impresiones · ${d.reach} personas`}
              >
                <div className="rep__barra" style={{ height: `${(d.impressions / maximo) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="rep__eje">
            <span>{diaCorto(datos.daily[0]?.day)}</span>
            <span>{diaCorto(datos.daily[datos.daily.length - 1]?.day)}</span>
          </div>
        </section>
      )}

      {/* Sin esto, "¿cómo sé que es real?" se contesta sola con lo peor. */}
      <section className="rep__metodo">
        <h2>Cómo se mide</h2>
        <dl>
          <div>
            <dt>Una impresión</dt>
            <dd>
              Se cuenta cuando la publicidad estuvo <strong>al menos a la mitad a
              la vista durante un segundo seguido</strong>, que es el criterio que
              usa la industria. Estar en la página sin que nadie la haya visto no
              cuenta.
            </dd>
          </div>
          <div>
            <dt>Una persona</dt>
            <dd>
              Se identifica con un código anónimo derivado de la conexión, sin
              cookies y sin datos personales. La misma persona en el mismo día
              cuenta una sola vez, aunque abra la app diez veces.
            </dd>
          </div>
          <div>
            <dt>Qué se descarta</dt>
            <dd>
              Rastreadores de buscadores, vistas previas de mensajería, monitores
              y herramientas automáticas. Tampoco se cuenta la navegación de los
              administradores de la app.
            </dd>
          </div>
          <div>
            <dt>Los límites, de frente</dt>
            <dd>
              Dos personas en la misma red y con el mismo dispositivo cuentan como
              una, y quien entra por wifi y por datos cuenta como dos. Es una
              medición propia y sin auditoría externa: el sesgo está puesto
              siempre hacia contar de menos.
            </dd>
          </div>
        </dl>
      </section>

      <footer className="rep__pie">
        Informe generado por Rincones · {new Date().toLocaleDateString("es-AR")}
      </footer>
    </div>
  );
}
