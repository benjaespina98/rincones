import { useEffect, useState } from "react";

/**
 * Panel de diagnóstico del viewport, sólo si la URL trae `?vp=1`.
 *
 * Existe porque el bug de la barra en iOS no se reproduce en Chromium: hay que
 * medirlo en el teléfono. Abrí la app con `?vp=1` y sacá una captura; los números
 * dicen qué le pasa a ESE teléfono, en vez de adivinarlo. No guarda ni envía nada.
 * La bandera queda en `sessionStorage` para sobrevivir a la navegación interna.
 */
const CLAVE = "rincones_vp_debug";

const activo = () => {
  try {
    if (new URLSearchParams(window.location.search).get("vp") === "1") {
      sessionStorage.setItem(CLAVE, "1");
    }
    return sessionStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
};

const leer = () => {
  const vv = window.visualViewport;
  const sonda = document.createElement("div");
  sonda.style.cssText =
    "position:absolute;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px);padding-top:env(safe-area-inset-top,0px)";
  document.body.appendChild(sonda);
  const cs = getComputedStyle(sonda);
  const insetAbajo = cs.paddingBottom;
  const insetArriba = cs.paddingTop;
  sonda.remove();
  const nav = document.querySelector(".bottom-tabs-container")?.getBoundingClientRect();
  const raiz = getComputedStyle(document.documentElement);
  return {
    innerHeight: window.innerHeight,
    screenHeight: window.screen.height,
    visualViewport: vv ? `${Math.round(vv.height)} (top ${Math.round(vv.offsetTop)})` : "n/d",
    clientHeight: document.documentElement.clientHeight,
    standalone: String(window.navigator.standalone === true),
    displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser",
    insetArriba,
    insetAbajo,
    vpGap: raiz.getPropertyValue("--vp-gap").trim() || "0px",
    navBottom: nav ? Math.round(nav.bottom) : "n/d",
    navBottomVsPantalla: nav ? Math.round(window.screen.height - nav.bottom) : "n/d",
    scrollY: Math.round(window.scrollY),
  };
};

export default function ViewportDebug() {
  const [visible] = useState(activo);
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    const actualizar = () => setDatos(leer());
    actualizar();
    const id = setInterval(actualizar, 700);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible || !datos) return null;

  return (
    <pre
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 70,
        left: 8,
        zIndex: 99999,
        margin: 0,
        padding: "6px 8px",
        borderRadius: 8,
        background: "rgb(var(--bg-deep-rgb) / 0.88)",
        color: "var(--success-text)",
        font: "11px/1.35 ui-monospace, Menlo, monospace",
        pointerEvents: "none",
        whiteSpace: "pre",
      }}
    >
      {Object.entries(datos)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n")}
    </pre>
  );
}
