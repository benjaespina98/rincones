/* ── Las pestañas, en un solo lugar ────────────────────────────────────────
   Esta lista la necesitan dos componentes: la barra (para dibujarlas) y el
   layout (para saber si la pantalla actual ES una pestaña y, si no lo es,
   poner el botón de volver). Estaba escrita en la barra y deducida a mano en
   el layout con un `startsWith("/vino")`, así que las dos definiciones se
   fueron separando: la ficha del catálogo, el perfil y las valoraciones no
   eran pestañas y tampoco tenían salida.

   Con la lista acá, agregar o mover una pestaña es una sola edición y el resto
   se acomoda solo.

   ── POR QUÉ GUARDADOS DEJÓ DE SER UNA PESTAÑA ────────────────────────────
   "Guardados" eran los vinos que querés probar pero todavía no tenés. Es
   decir: una parte de tu colección, mirada desde el otro lado del tiempo. Que
   viviera en su propia pestaña partía en dos la respuesta a una sola pregunta
   —"¿qué vinos hay en mi vida?"— y obligaba a saber de antemano en cuál de las
   dos secciones estaba lo que buscabas, que es justo lo que uno viene a
   averiguar. Ahora es la cuarta vista de Mi Bodega ("Quiero probar"), al lado
   de En stock, Todos y Probados. La funcionalidad no se perdió: cambió de
   lugar al que le correspondía.

   El hueco NO se rellenó. Una sección que no se justifica no se reemplaza por
   otra para que la fila quede pareja. Perfil sigue donde estaba —el avatar
   arriba a la derecha—, porque es donde se configura la cuenta y no un lugar
   donde se trabaja.

   ── POR QUÉ "AGREGAR" YA NO ES UNA PESTAÑA ────────────────────────────────
   Porque no es un LUGAR, es LA acción del producto. Una pestaña promete una
   sección a la que se va y de la que se vuelve, con su estado propio; escanear
   una botella es una tarea que empieza y termina, y que uno quiere disparar
   desde cualquier pantalla sin perder dónde estaba.

   Ahora es un botón redondo con una cámara adentro y sin texto, que vive EN la
   barra pero no es una pestaña: tiene su propio lugar en la fila —así no tapa
   a ninguna— y se levanta unos píxeles por encima de las demás para que se lea
   como lo que es, la acción principal.

   Sin texto porque está en todas las pantallas: cada píxel que se tome se lo
   saca al contenido de las tres secciones para siempre, y una cámara ya dice
   qué hace. "Agregar" al lado sería pagar ancho por repetir el dibujo.

   Va entre Sommelier y Mi Bodega, que es adonde va a parar lo que cargues.

   ── LA BARRA DE CINCO ───────────────────────────────────────────────────
   Descubrí · Mi Bodega · [Escanear] · Sommelier · Cuenta. Escanear no está en
   esta lista: es la acción, no un lugar, y la barra la dibuja en el centro (ver
   BottomTabNavigation.jsx y AddWineButton.jsx). Cuenta reemplaza al avatar de
   la barra de arriba: el perfil, la configuración y cerrar sesión viven ahí, y
   una app con cinco lugares de abajo no necesita un sexto arriba. */
export const TABS = [
  { id: "descubri", label: "Descubrí", path: "/", icon: "sparkle" },
  { id: "sommelier", label: "Sommelier", path: "/sommelier", icon: "wine-glass" },
  { id: "bodega", label: "Mi Bodega", path: "/bodega", icon: "bottle" },
  { id: "cuenta", label: "Cuenta", path: "/perfil", icon: "user" },
];

/** Adónde lleva la acción de escanear. Fuera de TABS: no es una sección. */
export const ADD_PATH = "/agregar";

export const TAB_PATHS = new Set(TABS.map((t) => t.path));

/* De qué pestaña "cuelga" cada pantalla interna. Sirve para que la barra siga
   marcando de dónde viniste mientras mirás un detalle, en vez de apagarse
   entera y dejar la sensación de haberte salido de la app.

   La ficha de un vino tuyo cuelga de Bodega; la de un vino del catálogo, de
   Descubrí — que es literalmente desde donde se llega a cada una. */
const SUB_SCREENS = [
  { prefix: "/descubrir/vino", tab: "descubri" },
  { prefix: "/vino", tab: "bodega" },
  // Las valoraciones se llegan desde el perfil.
  { prefix: "/valoraciones", tab: "cuenta" },
];

export const tabForPath = (pathname) => {
  const tab = TABS.find((t) => t.path === pathname);
  if (tab) return tab.id;
  return SUB_SCREENS.find((s) => pathname.startsWith(s.prefix))?.tab || null;
};
