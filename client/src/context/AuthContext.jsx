import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "../services/authApi";

export const AuthContext = createContext(null);

const TOKEN_KEY = "rincones_admin_token";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaurar sesión desde cookie/token
  const hydrateUser = useCallback(async () => {
    try {
      setLoading(true);
      // Intentar obtener usuario desde /auth/me
      // Si tiene cookie válida, responderá; si no, fallará
      const me = await getMe();
      setUser(me);
      setToken("authenticated"); // Marcar como autenticado
    } catch {
      // No hay sesión válida
      setToken("");
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // En el mount, restaurar sesión
  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const login = useCallback(async (email, password) => {
    try {
      const response = await loginRequest(email, password);
      // El token está en httpOnly cookie (enviado por el servidor)
      // Pero si la API devuelve token también, guardarlo como fallback
      if (response.token) {
        localStorage.setItem(TOKEN_KEY, response.token);
        setToken(response.token);
      } else {
        setToken("authenticated"); // Cookie está en el navegador
      }
      setUser(response.user);
      return response.user;
    } catch (error) {
      setToken("");
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Llamar a endpoint de logout para limpiar la cookie
      await logoutRequest();
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    } finally {
      setToken("");
      setUser(null);
      localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAdmin: user?.role === "admin",
      login,
      logout,
    }),
    [token, user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
