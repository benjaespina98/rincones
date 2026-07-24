/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest, logout as logoutRequest } from "../services/authApi";

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
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
    } catch {
      // No hay sesión válida
      setUser(null);
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
      setUser(response.user);
      return response.user;
    } catch (error) {
      setUser(null);
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
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === "admin",
      login,
      logout,
      refreshUser: hydrateUser,
    }),
    [user, loading, login, logout, hydrateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
