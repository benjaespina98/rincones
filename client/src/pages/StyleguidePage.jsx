import { useState } from "react";
import Button from "../components/Button";
import Card from "../components/Card";
import Chip from "../components/Chip";
import WineTypeBadge from "../components/WineTypeBadge";
import Segmented from "../components/Segmented";
import BottomSheet from "../components/BottomSheet";
import EmptyState from "../components/EmptyState";
import EmptyIllustration, { NOMBRES_ILUSTRACION } from "../components/EmptyIllustration";
import ErrorState from "../components/ErrorState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import WineArtwork from "../components/WineArtwork";
import BodegaResumen from "../components/BodegaResumen";
import "./StyleguidePage.css";

/**
 * El sistema de diseño, mirable.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Un token no se revisa leyendo su valor: `rgb(188 212 222)` no dice si el
 * espumante se distingue del blanco. Hay que verlos juntos, del tamaño real y
 * sobre el fondo real. Hasta ahora la única forma era navegar la app buscando
 * una pantalla que casualmente usara el token que se acababa de tocar — y para
 * la mitad de los estados (error, vacío, cargando) eso significa romper algo a
 * propósito.
 *
 * ── SÓLO EN DESARROLLO ──────────────────────────────────────────────────────
 * La ruta se monta detrás de `import.meta.env.DEV` (ver App.jsx), así que en el
 * build de producción Rollup se lleva la rama entera y este archivo no entra al
 * bundle. No hay que acordarse de sacarlo antes de publicar.
 */

const TIPOS = [
  { id: "red", label: "Tinto" },
  { id: "white", label: "Blanco" },
  { id: "rosé", label: "Rosado" },
  { id: "sparkling", label: "Espumante" },
  { id: "fortified", label: "Fortificado" },
  { id: "unknown", label: "Sin tipo" },
];

/** Vinos de mentira para las piezas que necesitan datos. */
const VINOS_DEMO = [
  { _id: "1", varietal: "Malbec", region: "Lujan de Cuyo, Mendoza", quantity: 3, tasted: true, rating: 4 },
  { _id: "2", varietal: "Malbec", region: "Lujan de Cuyo, Mendoza", quantity: 2, tasted: true, rating: 5 },
  { _id: "3", varietal: "Bonarda", region: "Valle de Uco, Mendoza", quantity: 0, tasted: true, rating: 3 },
  { _id: "4", varietal: "Torrontes", region: "Cafayate, Salta", quantity: 1, tasted: false, rating: 0 },
];

const TEXTO = [
  ["--text", "Principal"],
  ["--text-secondary", "Secundario"],
  ["--text-muted", "Tenue"],
  ["--text-subtle", "El más tenue"],
  ["--accent-text", "Acento (texto)"],
];

const SUPERFICIES = [
  ["--surface-base", "base", "Lo que se apoya sobre el fondo: tarjetas, filas."],
  ["--surface-raised", "raised", "Lo que se despega: hero, popover."],
  ["--surface-overlay", "overlay", "Lo que tapa: hojas, modales."],
];

const SOMBRAS = ["--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl"];

const RADIOS = [
  "--radius-sm",
  "--radius-md",
  "--radius-lg",
  "--radius-xl",
  "--radius-2xl",
];

const ESCALA = [
  ["--text-2xs", "12px, el piso"],
  ["--text-xs", "12.8px"],
  ["--text-sm", "14px, secundario"],
  ["--text-base", "14.8px, cuerpo"],
  ["--text-md", "16px"],
  ["--text-lg", "17px"],
  ["--text-xl", "1.15rem"],
  ["--text-2xl", "1.3rem"],
  ["--text-3xl", "1.55rem"],
];

const Seccion = ({ titulo, nota, children }) => (
  <section className="sg__section">
    <h2 className="sg__h2">{titulo}</h2>
    {nota && <p className="sg__nota">{nota}</p>}
    {children}
  </section>
);

export default function StyleguidePage() {
  // Sirve para mirar un tipo de vino a la vez, en grande, que es como se ve en
  // la ficha: el hilo tiñe todo lo que cuelga del contenedor.
  const [tipo, setTipo] = useState("red");
  const [vista, setVista] = useState("instock");
  const [hoja, setHoja] = useState(false);
  const [filtros, setFiltros] = useState(["Malbec", "Mendoza"]);

  return (
    <div className="sg">
      <header className="sg__head">
        <h1 className="sg__h1">Sistema</h1>
        <p className="sg__nota">
          Sólo en desarrollo. Los valores salen de <code>index.css</code>: lo que
          se ve acá es lo que se ve en la app.
        </p>
      </header>

      <Seccion
        titulo="Texto"
        nota="Los cinco niveles, sobre el fondo real. Todos pasan AA en el peor punto del degradado."
      >
        <div className="sg__stack">
          {TEXTO.map(([token, label]) => (
            <p key={token} className="sg__linea" style={{ color: `var(${token})` }}>
              {label} <code className="sg__token">{token}</code>
            </p>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Superficies"
        nota="Tres niveles y el criterio es la altura sobre el fondo. Cuanto más arriba, más opaca."
      >
        <div className="sg__superficies">
          {SUPERFICIES.map(([token, nombre, para]) => (
            <div
              key={token}
              className="sg__superficie"
              style={{ background: `var(${token})` }}
            >
              <strong>{nombre}</strong>
              <span>{para}</span>
              <code className="sg__token">{token}</code>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="El hilo del tipo de vino"
        nota="Poné data-wine-type en un contenedor y todo lo de adentro hereda acento, gradiente, halo y banda."
      >
        <div className="sg__tipos">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sg__tipo-btn ${tipo === t.id ? "is-active" : ""}`}
              data-wine-type={t.id}
              onClick={() => setTipo(t.id)}
            >
              <span className="sg__punto" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="sg__demo" data-wine-type={tipo}>
          <div className="sg__demo-card">
            <span className="sg__demo-rail" />
            <div className="sg__demo-cuerpo">
              <p className="sg__demo-eyebrow">gradiente + halo + banda</p>
              <h3 className="sg__demo-nombre">Un vino de ejemplo</h3>
              <p className="sg__demo-meta">
                Todo esto se tiñe solo, sin una clase por tipo.
              </p>
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Sombras" nota="Dos capas cada una: contacto y ambiental.">
        <div className="sg__grid">
          {SOMBRAS.map((token) => (
            <div key={token} className="sg__caja" style={{ boxShadow: `var(${token})` }}>
              <code className="sg__token">{token}</code>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Radios">
        <div className="sg__grid">
          {RADIOS.map((token) => (
            <div key={token} className="sg__caja" style={{ borderRadius: `var(${token})` }}>
              <code className="sg__token">{token}</code>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Escala tipográfica" nota="Diez pasos cubren toda la app.">
        <div className="sg__stack">
          {ESCALA.map(([token, nota]) => (
            <p key={token} className="sg__linea" style={{ fontSize: `var(${token})` }}>
              Bodega Catena Zapata <span className="sg__nota-inline">{nota}</span>{" "}
              <code className="sg__token">{token}</code>
            </p>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Bordes">
        <div className="sg__grid">
          {["--border-subtle", "--border-base", "--border-strong"].map((token) => (
            <div
              key={token}
              className="sg__caja"
              style={{ border: `1px solid var(${token})` }}
            >
              <code className="sg__token">{token}</code>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ══ COMPONENTES ═══════════════════════════════════════════════════════
          Desde acá abajo no son tokens sino piezas armadas. Se revisan con sus
          ESTADOS, no sólo en reposo: un componente que sólo se mira lleno es
          uno cuyo vacío y cuyo error nadie vio nunca — que es exactamente cómo
          quedaron los siete estados faltantes que encontró la auditoría. */}

      <Seccion titulo="Button" nota="Las variantes son jerarquía: cuál es la acción de la pantalla, cuál es la alternativa, cuál se puede ignorar.">
        <div className="sg__fila">
          <Button variant="primary">Guardar</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver más</Button>
          <Button variant="destructive">Borrar</Button>
          <Button variant="icon" aria-label="Favorito">♥</Button>
        </div>
        <p className="sg__nota">Tamaños, y los dos estados que casi nunca se revisan.</p>
        <div className="sg__fila">
          <Button variant="primary" size="sm">sm</Button>
          <Button variant="primary" size="md">md</Button>
          <Button variant="primary" size="lg">lg</Button>
          <Button variant="primary" loading>Guardando</Button>
          <Button variant="primary" disabled>Deshabilitado</Button>
        </div>
      </Seccion>

      <Seccion titulo="Card" nota="hero manda en su pantalla; normal es un bloque con nombre propio; compact es una fila.">
        <div className="sg__stack">
          <Card variant="hero" type={tipo} rail glow>
            <p className="sg__demo-eyebrow">hero · con banda y halo del tipo</p>
            <h3 className="sg__demo-nombre">Catena Alta Malbec</h3>
            <p className="sg__demo-meta">Luján de Cuyo, Mendoza · 2019</p>
          </Card>
          <Card variant="normal">
            <strong>normal</strong>
            <p className="sg__demo-meta">Sin tipo declarado: no pinta banda ni gradiente.</p>
          </Card>
          <Card variant="compact" type="white" rail interactive>
            <strong>compact · interactiva</strong>
            <p className="sg__demo-meta">Se renderiza como button, no como div con onClick.</p>
          </Card>
        </div>
      </Seccion>

      <Seccion titulo="Chip y WineTypeBadge" nota="La cápsula promete que se toca. El badge dice el tipo con color Y con palabra.">
        <div className="sg__fila">
          <Chip>Sin elegir</Chip>
          <Chip active>Elegido</Chip>
          <Chip type="red" active>Tinto</Chip>
          <Chip type="sparkling" active>Espumante</Chip>
        </div>
        <p className="sg__nota">Con opción de quitar, como en los filtros activos.</p>
        <div className="sg__fila">
          {filtros.map((f) => (
            <Chip key={f} active onRemove={() => setFiltros(filtros.filter((x) => x !== f))}>
              {f}
            </Chip>
          ))}
          {filtros.length === 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFiltros(["Malbec", "Mendoza"])}>
              Reponer
            </Button>
          )}
        </div>
        <p className="sg__nota">Los seis tipos. El texto no es decorativo: blanco y espumante son los dos que más se confunden.</p>
        <div className="sg__fila">
          {TIPOS.map((t) => (
            <WineTypeBadge key={t.id} type={t.id} />
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Segmented" nota="El indicador se desliza: prender y apagar fondos son dos eventos sueltos que no cuentan de dónde venís.">
        <Segmented
          ariaLabel="Vista de ejemplo"
          value={vista}
          onChange={setVista}
          options={[
            { id: "instock", label: "En stock", count: 12 },
            { id: "probados", label: "Ya tomados", count: 34 },
            { id: "quiero-probar", label: "Favoritos", count: 5 },
          ]}
        />
      </Seccion>

      <Seccion titulo="BottomSheet" nota="Escape cierra, el Tab cicla adentro, se arrastra para bajar y el fondo no scrollea.">
        <Button variant="secondary" onClick={() => setHoja(true)}>
          Abrir la hoja
        </Button>
        <BottomSheet
          isOpen={hoja}
          onClose={() => setHoja(false)}
          title="Filtros"
          description="Probá el Tab: no se escapa del panel."
          footer={
            <div className="sg__fila">
              <Button variant="ghost" onClick={() => setHoja(false)}>Limpiar</Button>
              <Button variant="primary" onClick={() => setHoja(false)}>Aplicar</Button>
            </div>
          }
        >
          <div className="sg__fila">
            {TIPOS.map((t) => (
              <Chip key={t.id} type={t.id}>{t.label}</Chip>
            ))}
          </div>
          <p className="sg__nota">
            El cuerpo scrollea solo si hace falta, y el gesto de arrastrar sale
            del asa de arriba — no del contenido, o no se podría leer una lista
            larga sin cerrarla sin querer.
          </p>
        </BottomSheet>
      </Seccion>

      <Seccion titulo="WineArtwork" nota="Una forma por tipo. No es adorno: el pool de fotos no cubre el catálogo, así que en Descubrí esto es lo que se ve.">
        <div className="sg__botellas">
          {TIPOS.map((t) => (
            <div key={t.id} className="sg__botella">
              <WineArtwork type={t.id} size={92} />
              <span className="sg__nota-inline">{t.label}</span>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Ilustraciones de vacío" nota="Una por SITUACIÓN, no por pantalla: lo que las elige es lo que pasó.">
        <div className="sg__grid">
          {NOMBRES_ILUSTRACION.map((n) => (
            <div key={n} className="sg__caja">
              <EmptyIllustration name={n} size={92} />
              <code className="sg__token">{n}</code>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="BodegaResumen"
        nota="Describe lo que se esta viendo y no la coleccion entera: con un filtro puesto, un numero traido del servidor hablaria de otra cosa que la lista de abajo."
      >
        <BodegaResumen wines={VINOS_DEMO} />
        <p className="sg__nota">
          Sin nada puntuado el promedio no aparece: un cero se lee como “mis vinos
          son malos” en vez de “todavia no puntuaste”.
        </p>
        <BodegaResumen wines={VINOS_DEMO.map((w) => ({ ...w, rating: 0 }))} />
        <p className="sg__nota">Y con la bodega vacia no dibuja ningun marco.</p>
        <BodegaResumen wines={[]} />
      </Seccion>

      <Seccion titulo="Estados" nota="Vacío, error y cargando, que son los que nadie mira hasta que fallan.">
        <div className="sg__stack">
          <EmptyState
            illustration="cava"
            title="Todavía no cargaste ningún vino"
            hint="Escaneá una etiqueta y empezá tu bodega."
            actionLabel="Escanear una etiqueta"
            onAction={() => {}}
            secondaryLabel="Ver el catálogo"
            onSecondary={() => {}}
          />
          <ErrorState
            title="No pudimos traer tus vinos"
            hint="Revisá tu conexión y probá de nuevo."
            onRetry={() => {}}
          />
          <div>
            <p className="sg__nota">Skeleton de lista — tiene que tener la forma de la fila real, o al cargar salta.</p>
            <LoadingSkeleton type="list" count={2} />
          </div>
          <div>
            <p className="sg__nota">Skeleton de tarjeta.</p>
            <LoadingSkeleton type="card" count={2} />
          </div>
        </div>
      </Seccion>
    </div>
  );
}
