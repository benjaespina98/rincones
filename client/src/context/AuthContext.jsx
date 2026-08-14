/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "../services/authApi";

export const AuthContext = createContext(null);

/**
 * ── "A VECES ME MANDA AL LOGIN" ─────────────────────────────────────────────
 *
 * El arreglo anterior fue del lado del server: la rotación del refresh borraba
 * el token viejo en la misma operación que lo canjeaba, así que una respuesta
 * que no llegaba mataba la sesión. Eso ya está.
 *
 * Lo que quedaba es de acá, y es más simple: esta función trataba CUALQUIER
 * fallo de `/auth/me` como "no hay sesión". Un `catch` pelado no distingue
 * entre las dos únicas cosas que pueden pasar, que son opuestas:
 *
 *   el server contestó 401  → no hay sesión. Es una respuesta, y es definitiva.
 *   el server no contestó   → no sabemos nada. Se cortó la red, el teléfono
 *                             cambió de wifi a datos, o Vercel arrancó en frío y
 *                             axios cortó a los 12 segundos.
 *
 * El segundo caso terminaba en `setUser(null)`, que para `PrivateRoute` es
 * indistinguible de haber cerrado sesión: te mandaba al login con la sesión
 * intacta. Y el reintento generoso del refresh (25s) no ayudaba, porque sin
 * respuesta no hay 401 y no hay nada que renovar — se cae antes.
 *
 * Ahora un fallo sin respuesta no desloguea a nadie: se reintenta, y si igual no
 * se puede, se dice "no hay conexión" y se ofrece reintentar. Perder la sesión
 * es una conclusión, y no se saca de no haber podido preguntar.
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // "No pudimos preguntar quién sos". Distinto de `user === null`, que significa
  // "preguntamos y no hay sesión".
  const [sinConexion, setSinConexion] = useState(false);

  // Restaurar sesión desde cookie/token
  const hydrateUser = useCallback(async () => {
    setLoading(true);

    for (let intento = 0; ; intento += 1) {
      try {
        const me = await getMe();
        setUser(me);
        setSinConexion(false);
        setLoading(false);
        return;
      } catch (error) {
        if (!esFalloDeRed(error)) {
          // El server contestó que no hay sesión. Eso sí es definitivo.
          setUser(null);
          setSinConexion(false);
          setLoading(false);
          return;
        }

        if (intento < REINTENTOS.length) {
          await esperar(REINTENTOS[intento]);
          continue;
        }

        // Se acabaron los reintentos. NO se toca `user`: si ya había sesión
        // cargada (una recarga con la red caída), sigue valiendo.
        setSinConexion(true);
        setLoading(false);
        return;
      }
    }
  }, []);

  // En el mount, restaurar sesión
  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const login = useCallback(async (email, password) => {
    try {
      const response = await loginRequest(email, password);
      setUser(response.user);
      setSinConexion(false);
      return response.user;
    } catch (error) {
      setUser(null);
      throw error;
    }
  }, []);

  // Adopta la sesión que YA abrió un endpoint (register, Google): esos
  // devuelven user+token igual que login, así que no hay que volver a pedirle
  // credenciales al server — hacerlo (como pasaba antes en RegisterPage)
  // gastaba una llamada de más y de paso una entrada en `loginLimiter`.
  const applySession = useCallback((user) => {
    setUser(user);
    setSinConexion(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Llamar a endpoint de logout para limpiar la cookie
      await logoutRequest();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      sinConexion,
      isAdmin: user?.role === "admin",
      login,
      applySession,
      logout,
      refreshUser: hydrateUser,
    }),
    [user, loading, sinConexion, login, applySession, logout, hydrateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
