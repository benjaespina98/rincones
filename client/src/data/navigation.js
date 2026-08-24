/* ── Las pestañas, en un solo lugar ────────────────────────────────────────
   Esta lista la necesitan dos componentes: la barra (para dibujarlas) y el
   layout (para saber si la pantalla actual ES una pestaña y, si no lo es,
   poner el botón de volver). Estaba escrita en la barra y deducida a mano en
   el layout con un `startsWith("/vino")`, así que las dos definiciones se
   fueron separando: la ficha del catálogo, el perfil y las valoraciones no
   eran pestañas y tampoco tenían salida.

   Con la lista acá, agregar o mover una pestaña es una sola edición y el resto
   se acomoda solo.

   Orden: Descubrí (home) · Guardados · [+ Agregar, centrado] · Sommelier ·
   Bodega. El perfil se entra tocando el nombre en el header; no tiene pestaña
   porque no es un lugar donde se trabaja, es donde se configura. */
export const TABS = [
  { id: "descubri", label: "Descubrí", path: "/", icon: "sparkle" },
  { id: "guardados", label: "Guardados", path: "/guardados", icon: "heart" },
  { id: "agregar", label: "Agregar", path: "/agregar", icon: "plus-solid", primary: true },
  { id: "sommelier", label: "Sommelier", path: "/sommelier", icon: "wine-glass" },
  { id: "bodega", label: "Bodega", path: "/bodega", icon: "bottle" },
];

export const TAB_PATHS = new Set(TABS.map((t) => t.path));

/* De qué pestaña "cuelga" cada pantalla interna. Sirve para que la barra siga
   marcando de dónde viniste mientras mirás un detalle, en vez de apagarse
   entera y dejar la sensación de haberte salido de la app.

   La ficha de un vino tuyo cuelga de Bodega; la de un vino del catálogo, de
   Descubrí — que es literalmente desde donde se llega a cada una. */
const SUB_SCREENS = [
  { prefix: "/descubrir/vino", tab: "descubri" },
  { prefix: "/vino", tab: "bodega" },
];

export const tabForPath = (pathname) => {
  const tab = TABS.find((t) => t.path === pathname);
  if (tab) return tab.id;
  return SUB_SCREENS.find((s) => pathname.startsWith(s.prefix))?.tab || null;
};
