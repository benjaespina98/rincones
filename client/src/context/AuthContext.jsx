/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "../services/authApi";

export const AuthContext = createContext(null);

/**
 * ── LOS CUATRO ESTADOS POSIBLES, Y POR QUÉ SON CUATRO ───────────────────────
 *
 * La pregunta "¿hay sesión?" tiene más de dos respuestas, y tratarla como si
 * tuviera dos es de donde salieron los dos bugs que este archivo arregla:
 *
 *   CARGANDO      todavía no sabemos. NO es "no hay sesión".
 *   AUTENTICADO   preguntamos y sí. `user` tiene quién.
 *   ANONIMO       preguntamos y no. El server contestó 401: es definitivo.
 *   SIN_CONEXION  no pudimos preguntar. Tampoco es "no hay sesión": puede
 *                 haberla y no tenemos forma de saberlo.
 *
 * `user` y el estado viajan JUNTOS, en un solo `useState`. Antes eran tres
 * `useState` sueltos (`user`, `loading`, `sinConexion`) y cada escritura los
 * dejaba momentáneamente descoordinados; con un solo objeto no existe el
 * instante intermedio en que `user` ya cambió pero `loading` todavía no.
 */
const CARGANDO = "cargando";
const AUTENTICADO = "autenticado";
const ANONIMO = "anonimo";
const SIN_CONEXION = "sin-conexion";

/**
 * ── "ENTRO CON GOOGLE Y ME DEVUELVE AL LOGIN" ───────────────────────────────
 *
 * Esta era la causa, y no se ve mirando ninguna de las dos partes por separado
 * porque cada una, sola, está bien. La secuencia:
 *
 *   1. El navegador vuelve de Google a /auth/google/callback. La app monta ahí
 *      de cero, así que este provider hace lo de siempre: preguntar `/auth/me`.
 *      En ESE instante todavía no hay sesión en este navegador — el credential
 *      de Google no se canjeó todavía—, así que ese pedido va camino a un 401.
 *      Y no es un viaje corto: un 401 en `/auth/me` dispara además un intento
 *      de renovación (hasta 25s de timeout) antes de darse por vencido.
 *
 *   2. Mientras eso está en el aire, GoogleCallbackPage canjea el credential
 *      contra `/auth/google`, recibe el usuario y llama a `applySession`. Ahí sí
 *      hay sesión: cookies puestas, token guardado, `user` en el contexto. La
 *      app navega a la home.
 *
 *   3. Recién entonces contesta el `/auth/me` del paso 1, con su 401, y hacía
 *      `setUser(null)`.
 *
 * El paso 3 pisaba al paso 2 con una respuesta que ya no describía nada: es la
 * foto de un instante anterior a que la sesión existiera. `PrivateRoute` veía
 * `user === null` y redirigía al login con la sesión perfectamente abierta. Por
 * eso era intermitente — depende de cuál de las dos llamadas termine última— y
 * por eso "seleccioné bien la cuenta y igual volví al login".
 *
 * ── EL ARREGLO: QUIÉN TIENE DERECHO A ESCRIBIR ──────────────────────────────
 *
 * No es cuestión de esperar ni de ordenar los redirects: es que una respuesta
 * vieja no puede describir el presente. Cada cosa que establece la sesión de
 * forma autoritativa —entrar con Google, loguearse, cerrar sesión, arrancar una
 * hidratación nueva— incrementa un contador. Quien está en vuelo se guarda el
 * número que le tocó y, al volver, sólo escribe si sigue siendo el vigente. Si
 * mientras tanto pasó algo más nuevo, su respuesta se descarta en silencio:
 * ya no habla del mundo actual.
 *
 * Vale en las dos direcciones, y la segunda importa igual: una hidratación que
 * traía un usuario y llega DESPUÉS de cerrar sesión tampoco puede reabrirla.
 */

// Un arranque en frío tarda unos segundos: dos reintentos cortos lo cubren sin
// dejar a nadie mirando un spinner eterno.
const REINTENTOS = [1200, 3500];

const esFalloDeRed = (error) => {
  const status = error?.response?.status;
  // Sin respuesta (timeout, DNS, offline) o el server caído: en los dos casos la
  // pregunta no llegó a contestarse, así que no dice nada sobre tu sesión.
  if (status === undefined) return true;
  return status >= 500;
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const AuthProvider = ({ children }) => {
  const [sesion, setSesion] = useState({ estado: CARGANDO, user: null });

  // El contador de arriba. Va en un ref y no en el estado a propósito: no se
  // renderiza nada con esto, y hace falta leerlo con el valor del momento
  // exacto en que vuelve una respuesta, no con el de la última pintada.
  const generacion = useRef(0);

  /** Marca como vieja cualquier respuesta en vuelo y devuelve el turno nuevo. */
  const tomarTurno = useCallback(() => {
    generacion.current += 1;
    return generacion.current;
  }, []);

  /** Escribe sólo si el turno sigue siendo el vigente. La regla, en un lugar. */
  const escribir = useCallback((turno, siguiente) => {
    if (generacion.current !== turno) return false;
    setSesion((previo) => (typeof siguiente === "function" ? siguiente(previo) : siguiente));
    return true;
  }, []);

  // Restaurar la sesión preguntándole al server quién es el dueño de las
  // credenciales que este navegador tenga (cookie de refresh o token guardado).
  const hydrateUser = useCallback(async () => {
    const turno = tomarTurno();
    // `user` se conserva: una recarga con la sesión ya cargada no tiene por qué
    // parpadear a "nadie" mientras se confirma.
    escribir(turno, (previo) => ({ ...previo, estado: CARGANDO }));

    for (let intento = 0; ; intento += 1) {
      try {
        const me = await getMe();
        escribir(turno, { estado: AUTENTICADO, user: me });
        return;
      } catch (error) {
        if (generacion.current !== turno) return;

        if (!esFalloDeRed(error)) {
          // El server contestó que no hay sesión. Eso sí es definitivo.
          escribir(turno, { estado: ANONIMO, user: null });
          return;
        }

        if (intento < REINTENTOS.length) {
          await esperar(REINTENTOS[intento]);
          if (generacion.current !== turno) return;
          continue;
        }

        // Se acabaron los reintentos. NO se toca `user`: si ya había sesión
        // cargada (una recarga con la red caída), sigue valiendo.
        escribir(turno, (previo) => ({ estado: SIN_CONEXION, user: previo.user }));
        return;
      }
    }
  }, [tomarTurno, escribir]);

  // En el mount, restaurar sesión
  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const login = useCallback(
    async (email, password) => {
      const turno = tomarTurno();
      try {
        const response = await loginRequest(email, password);
        escribir(turno, { estado: AUTENTICADO, user: response.user });
        return response.user;
      } catch (error) {
        escribir(turno, { estado: ANONIMO, user: null });
        throw error;
      }
    },
    [tomarTurno, escribir]
  );

  // Adopta la sesión que YA abrió un endpoint (register, Google): esos
  // devuelven user+token igual que login, así que no hay que volver a pedirle
  // credenciales al server — hacerlo (como pasaba antes en RegisterPage)
  // gastaba una llamada de más y de paso una entrada en `loginLimiter`.
  const applySession = useCallback(
    (user) => {
      escribir(tomarTurno(), { estado: AUTENTICADO, user });
    },
    [tomarTurno, escribir]
  );

  const logout = useCallback(async () => {
    // El turno se toma ANTES de la llamada, no después: desde este instante
    // cualquier hidratación en vuelo queda invalidada y no puede reabrir la
    // sesión que se está cerrando.
    const turno = tomarTurno();
    try {
      // Llamar a endpoint de logout para limpiar la cookie
      await logoutRequest();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      escribir(turno, { estado: ANONIMO, user: null });
    }
  }, [tomarTurno, escribir]);

  const value = useMemo(
    () => ({
      user: sesion.user,
      estado: sesion.estado,
      loading: sesion.estado === CARGANDO,
      sinConexion: sesion.estado === SIN_CONEXION,
      isAdmin: sesion.user?.role === "admin",
      login,
      applySession,
      logout,
      refreshUser: hydrateUser,
    }),
    [sesion, login, applySession, logout, hydrateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
