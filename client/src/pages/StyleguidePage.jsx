import { useState } from "react";
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
    </div>
  );
}
