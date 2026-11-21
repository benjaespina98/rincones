import { useEffect, useState } from "react";
import { getAdminGrowth } from "../services/adminApi";

/**
 * Crecimiento de la base de cuentas: cuánta gente se suma, cuánta se queda y qué
 * hace al llegar. Vive dentro de Métricas y pide su propio dato (`growth` del
 * resumen del admin), así que si falla no tumba el tablero de uso de arriba.
 *
 * ── REGLA DE LECTURA: `null` NO ES CERO ─────────────────────────────────────
 * El server devuelve `null` en un porcentaje cuando no hay base ("sin datos" no
 * es 0 %). Acá se dice con palabras qué falta para poder medirlo, en vez de
 * mostrar un 0 % que se leería como "nadie se verificó".
 */

/** 41.7 → "41,7 %". `null` → null (el llamador decide qué decir). */
const pct = (n) => (typeof n === "number" ? `${String(n).replace(".", ",")} %` : null);

const num = (n) => (typeof n === "number" ? n.toLocaleString("es-AR") : "-");

/** "2026-07-29" → "29/7". */
const diaCorto = (day) => {
  const [, m, d] = String(day).split("-");
  return `${Number(d)}/${Number(m)}`;
};

const sumar = (fila, claves) => claves.reduce((acc, k) => acc + (fila[k] || 0), 0);

/**
 * Barras por día, apiladas si hay más de una serie. `series`: [{ key, label, tone }].
 * Los colores no son lo único que distingue: la leyenda lleva los totales en texto.
 */
function BarrasDiarias({ titulo, serie, series, vacio }) {
  const claves = series.map((s) => s.key);
  const techo = Math.max(1, ...serie.map((d) => sumar(d, claves)));
  const hayAlgo = serie.some((d) => sumar(d, claves) > 0);
  const totales = series.map((s) => ({ ...s, total: serie.reduce((a, d) => a + (d[s.key] || 0), 0) }));

  return (
    <div className="an__block">
      <div className="an__block-head">
        <h3>{titulo}</h3>
      </div>

      {hayAlgo ? (
        <>
          <div
            className="an-bars"
            // Con muchos días las barras quedan de un píxel: sin separación entran todas.
            style={{ gap: serie.length > 60 ? 0 : 2 }}
            role="img"
            aria-label={`${titulo}: ${totales.map((s) => `${s.label} ${s.total}`).join(", ")}. Máximo en un día: ${techo}.`}
          >
            {serie.map((d) => (
              <div
                key={d.day}
                className="an-bars__col"
                title={`${diaCorto(d.day)} · ${series.map((s) => `${s.label}: ${d[s.key] || 0}`).join(" · ")}`}
              >
                {series.map((s) => (
                  <span
                    key={s.key}
                    className={`an-bars__seg an-tone--${s.tone}`}
                    style={{ height: `${((d[s.key] || 0) / techo) * 100}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="an-chart__axis">
            <span>{diaCorto(serie[0].day)}</span>
            <span className="an-chart__max">máx. {techo} por día</span>
            <span>{diaCorto(serie[serie.length - 1].day)}</span>
          </div>
          <ul className="an-legend">
            {totales.map((s) => (
              <li key={s.key}>
                <span className={`an-legend__dot an-tone--${s.tone}`} aria-hidden="true" />
                {s.label}: <strong>{num(s.total)}</strong>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="an__none">{vacio}</p>
      )}
    </div>
  );
}

/** Una tarjeta con un porcentaje que puede no tener base. */
function Tasa({ label, valor, detalle, sinBase }) {
  const texto = pct(valor);
  return (
    <article className="an__card">
      <span className="an__card-label">{label}</span>
      {texto ? (
        <>
          <strong className="an__card-n">{texto}</strong>
          <small>{detalle}</small>
        </>
      ) : (
        <>
          <strong className="an__card-n an__card-n--none">Sin datos</strong>
          <small>{sinBase}</small>
        </>
      )}
    </article>
  );
}

export default function AdminGrowthSection({ days, desde, hasta }) {
  const aMano = Boolean(desde && hasta);
  const [reloadToken, setReloadToken] = useState(0);
  // El resultado se guarda con la clave del pedido que lo originó: "cargando" es
  // que la clave vigente todavía no tiene respuesta. Así el efecto sólo sincroniza
  // con el server y no hay un setState síncrono adentro (ver AdminAnalyticsPage).
  const clave = `${aMano ? `${desde}|${hasta}` : days}#${reloadToken}`;
  const [resultado, setResultado] = useState({ clave: null, growth: null, failed: false });

  useEffect(() => {
    let active = true;
    getAdminGrowth(aMano ? { from: desde, to: hasta } : { days })
      .then((growth) => active && setResultado({ clave, growth, failed: false }))
      .catch(() => active && setResultado({ clave, growth: null, failed: true }));
    return () => {
      active = false;
    };
  }, [clave, aMano, desde, hasta, days]);

  const cargando = resultado.clave !== clave;
  const { growth, failed } = resultado;

  const encabezado = (
    <div className="an__block-head an__growth-head">
      <h2 className="an__h2">Crecimiento</h2>
      <span className="an__pico">Cuentas reales: sin admins ni cuentas de prueba.</span>
    </div>
  );

  if (resultado.clave === null) {
    return (
      <section className="an__growth" aria-label="Crecimiento">
        {encabezado}
        <p className="an__none" role="status">Cargando crecimiento…</p>
      </section>
    );
  }

  if (failed || !growth) {
    return (
      <section className="an__growth" aria-label="Crecimiento">
        {encabezado}
        <div className="admin-empty-state">
          <p>
            {failed
              ? "No se pudo cargar el crecimiento."
              : "El crecimiento no está disponible en este momento."}{" "}
            Las métricas de uso de arriba no se ven afectadas.
          </p>
          <button className="button" type="button" onClick={() => setReloadToken((t) => t + 1)}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }

  const { accounts, signups, activation, activeUsers, accountDeletions, wines } = growth;
  const sinAltas = (signups?.total || 0) === 0;
  const rango = growth.range;

  return (
    <section className="an__growth" aria-label="Crecimiento" aria-busy={cargando}>
      {encabezado}
      {cargando && <span className="an__cargando" role="status">Actualizando…</span>}

      {rango && (
        <p className="an__none">
          Del {diaCorto(rango.from)} al {diaCorto(rango.to)} ({num(rango.days)} días, hora de Argentina).{" "}
          {accounts && (
            <>
              En total hay {num(accounts.total)} cuentas: {num(accounts.real)} reales y{" "}
              {num(accounts.excluded)} de admins o prueba.
            </>
          )}
        </p>
      )}

      {/* Quiénes se sumaron y cuánto avanzaron: la cohorte del período. */}
      <div className="an__cards">
        <article className="an__card is-primary">
          <span className="an__card-label">Altas</span>
          <strong className="an__card-n">{num(signups?.total)}</strong>
          <small>
            Google {num(signups?.byMethod?.google)} · Contraseña {num(signups?.byMethod?.password)}
          </small>
        </article>
        <Tasa
          label="Verificaron el mail"
          valor={growth.verifiedPct}
          detalle={`${num(growth.verified)} de ${num(signups?.total)} altas`}
          sinBase="Todavía no hubo altas en este período."
        />
        <Tasa
          label="Terminaron el onboarding"
          valor={growth.onboardedPct}
          detalle={`${num(growth.onboarded)} de ${num(signups?.total)} altas`}
          sinBase="Todavía no hubo altas en este período."
        />
        <Tasa
          label="Cargaron un vino en 24 h"
          valor={activation?.within24h?.pct}
          detalle={`${num(activation?.within24h?.activated)} de ${num(activation?.within24h?.eligible)} a las que ya les pasó el día`}
          sinBase="Ninguna alta cumplió todavía las 24 h."
        />
        <Tasa
          label="Cargaron un vino en 7 días"
          valor={activation?.within7d?.pct}
          detalle={`${num(activation?.within7d?.activated)} de ${num(activation?.within7d?.eligible)} a las que ya les pasó la semana`}
          sinBase="Ninguna alta cumplió todavía los 7 días."
        />
      </div>

      {sinAltas && (
        <p className="an__none">
          No hubo altas en este período: los porcentajes de arriba quedan sin datos hasta que se
          sume alguien.
        </p>
      )}

      {/* Usuarios activos: sólo gente con sesión abierta. */}
      {activeUsers ? (
        <div className="an__cards">
          <article className="an__card">
            <span className="an__card-label">Activos hoy</span>
            <strong className="an__card-n">{num(activeUsers.dau)}</strong>
            <small>DAU · el día de hoy, en curso</small>
          </article>
          <article className="an__card">
            <span className="an__card-label">Activos en 7 días</span>
            <strong className="an__card-n">{num(activeUsers.wau)}</strong>
            <small>WAU · incluye hoy</small>
          </article>
          <article className="an__card">
            <span className="an__card-label">Activos en 30 días</span>
            <strong className="an__card-n">{num(activeUsers.mau)}</strong>
            <small>MAU · incluye hoy</small>
          </article>
          <Tasa
            label="Frecuencia de uso"
            valor={activeUsers.stickinessPct}
            detalle="De quienes entraron en 30 días, cuántos entran un día cualquiera (DAU / MAU)"
            sinBase="Hace falta al menos una persona activa en 30 días."
          />
        </div>
      ) : (
        <p className="an__none">Todavía no hay datos de usuarios activos.</p>
      )}

      <div className="an__cols">
        <BarrasDiarias
          titulo="Altas por día"
          serie={signups?.daily || []}
          series={[
            { key: "google", label: "Google", tone: "a" },
            { key: "password", label: "Contraseña", tone: "b" },
          ]}
          vacio="No hubo altas en este período."
        />
        <BarrasDiarias
          titulo="Vinos agregados por día"
          serie={wines?.daily || []}
          series={[{ key: "added", label: "Vinos agregados", tone: "a" }]}
          vacio="Nadie agregó vinos en este período."
        />
        <BarrasDiarias
          titulo="Botellas abiertas por día"
          serie={wines?.daily || []}
          series={[{ key: "bottleOpenedEvents", label: "Veces que se abrió una botella", tone: "a" }]}
          vacio="Nadie abrió botellas en este período."
        />
        <BarrasDiarias
          titulo="Bajas de cuenta por día"
          serie={accountDeletions?.daily || []}
          series={[
            { key: "self", label: "La persona", tone: "c" },
            { key: "admin", label: "Un admin", tone: "d" },
          ]}
          vacio="No hubo bajas en este período."
        />
      </div>

      {accountDeletions && (
        <p className="an__none">
          Bajas en el período: {num(accountDeletions.total)} (la persona {num(accountDeletions.bySelf)}, un
          admin {num(accountDeletions.byAdmin)}).
        </p>
      )}
    </section>
  );
}
