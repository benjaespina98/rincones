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
const { guardarExpiracion, sesionVencida } = await import("../src/services/api");
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  contexto = null;
});

describe("sesionVencida", () => {
  const ahora = 1_700_000_000_000;
  test("vencida si ya pasó (o faltan menos de 5 s); vigente si falta más", () => {
    guardarExpiracion(ahora - 60_000);
    expect(sesionVencida(ahora)).toBe(true);
    guardarExpiracion(ahora + 3000);
    expect(sesionVencida(ahora)).toBe(true);
    guardarExpiracion(ahora + 600_000);
    expect(sesionVencida(ahora)).toBe(false);
  });
  test("sin dato, o ilegible, no se asume vencida: manda el server", () => {
    expect(sesionVencida(ahora)).toBe(false);
    localStorage.setItem("rincones_expira", "basura");
    expect(sesionVencida(ahora)).toBe(false);
  });
});

describe("usuario guardado", () => {
  test("se lee lo guardado y se descarta si no es un usuario", () => {
    expect(leerUsuarioGuardado()).toBeNull();
    guardarUsuario({ id: "u1", email: "ana@rincones.test" });
    expect(leerUsuarioGuardado()).toEqual({ id: "u1", email: "ana@rincones.test" });
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify({ nombre: "sin id" }));
    expect(leerUsuarioGuardado()).toBeNull();
    localStorage.setItem(CLAVE_USUARIO, "{no es json");
    expect(leerUsuarioGuardado()).toBeNull();
  });
});

describe("arranque instantáneo con el usuario de la vez anterior", () => {
  test("abre YA con el usuario guardado, sin pasar por el logo, y lo confirma por detrás", async () => {
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
  });

  test("si el server dice que la sesión terminó, se olvida al usuario y se va a «sin sesión»", async () => {
    guardarUsuario({ id: "u1", email: "ana@rincones.test" });
    const error = new Error("401");
    error.response = { status: 401, data: {} };
    authApi.getMe.mockRejectedValue(error);

    montar();
    expect(screen.getByText("hola ana@rincones.test")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("sin sesión")).toBeInTheDocument());
    expect(localStorage.getItem(CLAVE_USUARIO)).toBeNull();
  });

  test("sin usuario guardado el arranque es el de siempre: logo hasta saber quién sos", async () => {
    authApi.getMe.mockReturnValue(diferido().promesa);
    montar();
    expect(screen.getByText("cargando")).toBeInTheDocument();
  });

  test("cerrar sesión borra al usuario guardado", async () => {
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

describe("al confirmar una persona distinta de la guardada se limpia lo cacheado", () => {
  test("/auth/me con otro id: se borran los datos locales de la anterior antes de mostrar nada", async () => {
    guardarUsuario({ id: "A", email: "a@rincones.test" });
    localStorage.setItem("rincones_bodega_vista", "probados");
    authApi.getMe.mockResolvedValue({ id: "B", email: "b@rincones.test" });
    montar();
    await waitFor(() => expect(contexto.user.id).toBe("B"));
    expect(localStorage.getItem("rincones_bodega_vista")).toBeNull();
  });

  test("con la misma persona no se borra nada", async () => {
    guardarUsuario({ id: "A", email: "a@rincones.test" });
    localStorage.setItem("rincones_bodega_vista", "probados");
    authApi.getMe.mockResolvedValue({ id: "A", email: "a@rincones.test" });
    montar();
    await waitFor(() => expect(contexto.user.id).toBe("A"));
    expect(localStorage.getItem("rincones_bodega_vista")).toBe("probados");
  });

  test("un login fallido olvida al usuario guardado", async () => {
    guardarUsuario({ id: "A", email: "a@rincones.test" });
    authApi.getMe.mockReturnValue(diferido().promesa);
    authApi.login.mockRejectedValue(new Error("mal"));
    montar();
    await act(async () => {
      await contexto.login("x@y.z", "mal").catch(() => {});
    });
    expect(localStorage.getItem(CLAVE_USUARIO)).toBeNull();
  });
});
