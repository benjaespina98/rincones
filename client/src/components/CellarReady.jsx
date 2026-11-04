import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import WinePhoto from "./WinePhoto";
import { getCellarReady } from "../services/wineApi";
import { wineDisplayName } from "../utils/wineIdentity";
import { getCellarStatus } from "../utils/cellarStatus";
import { tapHaptic } from "../utils/haptics";
import "./CellarReady.css";

/**
 * "Listos para abrir": los vinos TUYOS que están en su mejor momento.
 *
 * ── POR QUÉ LA HOME NECESITABA ESTO ─────────────────────────────────────────
 * La home hablaba exclusivamente de vinos que NO tenés: la recomendación del
 * día, dónde comprarla, qué leer. Alguien con treinta botellas en su casa abría
 * la app y no veía ni una. La pregunta más frecuente de quien tiene una cava
 * —"¿cuál abro esta noche?"— no tenía respuesta en la pantalla principal, y la
 * respuesta estaba calculada hacía rato: `/wines/cellar-ready` existía en el
 * servidor y no lo llamaba nadie.
 *
 * Son los vinos con botellas cuya ventana de guarda incluye el año actual (ver
 * services/cellar.service.js). Es la lista más corta y más accionable que puede
 * mostrar la app: no es "todo lo que tenés", es "esto está para tomarlo ahora".
 *
 * ── POR QUÉ NO CUESTA UNA CONSULTA DE MÁS ───────────────────────────────────
 * No se pide si no puede haber nada que traer. La home ya sabe, por las
 * estadísticas que carga igual, cuántos vinos con stock tenés: con cero, este
 * componente no monta ni pide nada. Para quien recién se registra —el caso donde
 * más importa que la home entre rápido— es como si no existiera.
 *
 * Y si falla, no dice nada. Es una sección de más sobre una pantalla que ya
 * funciona: un error acá no puede ensuciar la home.
 */

// Tres. Es una fila que se recorre de un vistazo y sin scrollear en un teléfono;
// más que eso deja de ser una sugerencia y se convierte en otra lista.
const MAX = 3;

export default function CellarReady({ enabled = true }) {
  const navigate = useNavigate();
  // Un solo estado y escrito SÓLO desde la respuesta: nada se setea en el cuerpo
  // del efecto. Es lo que evita el render en cascada —y lo que hace que la
  // sección aparezca de una vez, ya con vinos, en lugar de pasar por un estado
  // intermedio vacío que empuja la home hacia abajo mientras la estás leyendo.
  const [wines, setWines] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;

    let vigente = true;
    getCellarReady()
      .then((data) => {
        if (vigente) setWines(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // Una sección de más sobre una pantalla que ya funciona: si falla, no
        // existe. Un error acá no puede ensuciar la home.
        if (vigente) setWines([]);
      });

    return () => {
      vigente = false;
    };
  }, [enabled]);

  // Mientras no haya nada, no se reserva lugar: la sección puede terminar vacía
  // (nadie garantiza que tengas algo en su punto) y un hueco gris que después
  // desaparece mueve toda la home hacia arriba justo cuando la estás leyendo.
  if (!enabled || wines.length === 0) return null;

  const lista = wines.slice(0, MAX);

  return (
    <section className="cellar-ready" aria-labelledby="cellar-ready-title">
      <header className="cellar-ready__head">
        {/* "De tu bodega" entra en el título y se ahorra el subtítulo: era el
            único trabajo que hacía, distinguir esta fila de una recomendación
            de vinos que no tenés. */}
        <h2 id="cellar-ready-title" className="cellar-ready__title">
          <Icon name="bottle" size={16} /> De tu bodega, listos para abrir
        </h2>
      </header>

      <ul className="cellar-ready__row">
        {lista.map((wine) => {
          /**
           * La ventana se recalcula acá y NO se usa la que manda el servidor.
           *
           * Las dos existen y dicen cosas distintas: `services/cellar.service.js`
           * devuelve "Último año óptimo" / "Óptimo — quedan 4 años", que son las
           * palabras viejas, y `utils/cellarStatus.js` —el que ve la persona en la
           * ficha del vino— dice "Listo para tomar" con la ventana en años
           * ("2022 – 2029"). Se descubrió mirando la pantalla: la tarjeta no
           * mostraba nada porque esperaba un campo que esa mitad de la app no
           * tiene.
           *
           * El servidor sigue decidiendo QUIÉN entra a la lista; cómo se dice lo
           * decide el cliente, que es donde vive la redacción que ya se usa en
           * todas las demás pantallas.
           */
          const guarda = getCellarStatus(wine);
          const ultima = Number(wine.quantity) === 1;

          return (
            <li key={wine._id}>
              <button
                type="button"
                className="cellar-ready__card"
                onClick={() => {
                  tapHaptic();
                  // Con el vino puesto: la ficha ya lo tiene y no necesita
                  // volver a pedirlo para dibujarse (ver WineDetailPage).
                  navigate(`/vino/${wine._id}`, { state: { wine } });
                }}
              >
                <span className="cellar-ready__art">
                  <WinePhoto src={wine.image} type={wine.type} alt="" artSize={72} fit="contain" marca={wine.winery || wine.name} />
                </span>
                <span className="cellar-ready__body">
                  <span className="cellar-ready__name">{wineDisplayName(wine)}</span>
                  {wine.winery && <span className="cellar-ready__winery">{wine.winery}</span>}
                  {/* La ventana y cuántas quedan comparten renglón: los dos son
                      datos chicos, y juntos abajo le devuelven al nombre el ancho
                      entero de la tarjeta. Con la cantidad como pastilla a la
                      derecha, el nombre se quedaba con 89px y "Trapiche Broquel"
                      se cortaba al medio. */}
                  <span className="cellar-ready__meta">
                    {guarda.detail && <span className="cellar-ready__window">{guarda.detail}</span>}
                    <span className={`cellar-ready__qty ${ultima ? "is-last" : ""}`}>
                      {ultima ? "última botella" : `${wine.quantity} botellas`}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
