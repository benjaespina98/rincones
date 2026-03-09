import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { getMe, login as loginRequest } from "../services/authApi";

export const AuthContext = createContext(null);

const TOKEN_KEY = "rincones_admin_token";

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const hydrateUser = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const me = await getMe();
      setUser(me);
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    hydrateUser();
  }, [hydrateUser]);

  const login = useCallback(async (email, password) => {
    const response = await loginRequest(email, password);
    const nextToken = response.token;
    setToken(nextToken);
    localStorage.setItem(TOKEN_KEY, nextToken);
    setUser(response.user);
    return response.user;
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
