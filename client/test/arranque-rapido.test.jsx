import React, { useContext } from "react";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

vi.mock("../src/services/authApi", () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const authApi = await import("../src/services/authApi");
const { AuthProvider, AuthContext } = await import("../src/context/AuthContext.jsx");
const { setAuthToken, tokenVencido } = await import("../src/services/api");
const { CLAVE_USUARIO, guardarUsuario, leerUsuarioGuardado } = await import("../src/utils/usuarioGuardado");

const diferido = () => {
  let resolver;
  let rechazar;
  const promesa = new Promise((res, rej) => {
    resolver = res;
    rechazar = rej;
  });
  return { promesa, resolver, rechazar };
};

let contexto = null;
const Espia = () => {
  contexto = useContext(AuthContext);
  const { user, loading } = contexto;
  return <div>{loading ? "cargando" : user ? `hola ${user.email}` : "sin sesión"}</div>;
};
const montar = () => render(<AuthProvider><Espia /></AuthProvider>);

/** Un JWT mínimo (sin firma real: el cliente sólo lee `exp`). */
const jwt = (expSegundos) => {
  const b64 = (o) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64({ exp: expSegundos })}.firma`;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  contexto = null;
});

describe("tokenVencido", () => {
  const ahora = 1_700_000_000_000;
  test("un token con el exp pasado está vencido; uno futuro, no", () => {
    expect(tokenVencido(jwt(ahora / 1000 - 60), ahora)).toBe(true);
    expect(tokenVencido(jwt(ahora / 1000 + 600), ahora)).toBe(false);
  });
  test("a menos de 5 s de vencer ya cuenta como vencido (no vale la pena mandarlo)", () => {
    expect(tokenVencido(jwt(ahora / 1000 + 3), ahora)).toBe(true);
  });
  test("sin token, o con uno ilegible, no se asume vencido: manda el server", () => {
    expect(tokenVencido("", ahora)).toBe(false);
    expect(tokenVencido(null, ahora)).toBe(false);
    expect(tokenVencido("basura", ahora)).toBe(false);
    expect(tokenVencido("a.@@@.c", ahora)).toBe(false);
  });
});

describe("usuario guardado", () => {
  test("sólo se lee si hay token, y se descarta si no es un usuario", () => {
    guardarUsuario({ id: "u1", email: "ana@rincones.test" });
    expect(leerUsuarioGuardado()).toBeNull(); // sin token
    setAuthToken("x.y.z");
    expect(leerUsuarioGuardado()).toEqual({ id: "u1", email: "ana@rincones.test" });
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify({ nombre: "sin id" }));
    expect(leerUsuarioGuardado()).toBeNull();
    localStorage.setItem(CLAVE_USUARIO, "{no es json");
    expect(leerUsuarioGuardado()).toBeNull();
    setAuthToken(null);
  });
});

describe("arranque instantáneo con el usuario de la vez anterior", () => {
  test("abre YA con el usuario guardado, sin pasar por el logo, y lo confirma por detrás", async () => {
    setAuthToken("x.y.z");
    guardarUsuario({ id: "u1", email: "ana@rincones.test", firstName: "Ana" });
    const confirmacion = diferido();
    authApi.getMe.mockReturnValue(confirmacion.promesa);

    montar();
    // Con /auth/me todavía en el aire, la app ya está abierta.
    expect(screen.getByText("hola ana@rincones.test")).toBeInTheDocument();
    expect(contexto.loading).toBe(false);

    await act(async () => {
      confirmacion.resolver({ id: "u1", email: "ana@rincones.test", firstName: "Ana María" });
      await Promise.resolve();
    });
    await waitFor(() => expect(contexto.user.firstName).toBe("Ana María"));
    expect(JSON.parse(localStorage.getItem(CLAVE_USUARIO)).firstName).toBe("Ana María");
    setAuthToken(null);
  });

  test("si el server dice que la sesión terminó, se olvida al usuario y se va a «sin sesión»", async () => {
    setAuthToken("x.y.z");
    guardarUsuario({ id: "u1", email: "ana@rincones.test" });
    const error = new Error("401");
    error.response = { status: 401, data: {} };
    authApi.getMe.mockRejectedValue(error);

    montar();
    expect(screen.getByText("hola ana@rincones.test")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("sin sesión")).toBeInTheDocument());
    expect(localStorage.getItem(CLAVE_USUARIO)).toBeNull();
    setAuthToken(null);
  });

  test("sin usuario guardado el arranque es el de siempre: logo hasta saber quién sos", async () => {
    authApi.getMe.mockReturnValue(diferido().promesa);
    montar();
    expect(screen.getByText("cargando")).toBeInTheDocument();
  });

  test("cerrar sesión borra al usuario guardado", async () => {
    setAuthToken("x.y.z");
    guardarUsuario({ id: "u1", email: "ana@rincones.test" });
    authApi.getMe.mockResolvedValue({ id: "u1", email: "ana@rincones.test" });
    authApi.logout.mockResolvedValue({});
    montar();
    await waitFor(() => expect(contexto.user).toBeTruthy());
    await act(async () => {
      await contexto.logout();
    });
    expect(localStorage.getItem(CLAVE_USUARIO)).toBeNull();
    expect(localStorage.getItem("rincones_token")).toBeNull();
  });
});
