import { describe, it, expect, beforeEach } from "vitest";
import { consumeGoogleAuthResult } from "../src/utils/googleOAuth";

const jwt = (payload) => {
  const b64 = (o) => btoa(JSON.stringify(o)).split("=").join("").split("+").join("-").split("/").join("_");
  return `${b64({ alg: "RS256" })}.${b64(payload)}.firma`;
};
const volverDeGoogle = (token, state = "login") => {
  window.history.replaceState(null, "", `/auth/google/callback#id_token=${token}&state=${state}`);
};

describe("consumeGoogleAuthResult: el nonce", () => {
  beforeEach(() => sessionStorage.clear());

  it("acepta un token cuyo nonce es el que guardamos al salir", () => {
    sessionStorage.setItem("google_oauth_nonce", "abc");
    const token = jwt({ nonce: "abc" });
    volverDeGoogle(token);
    expect(consumeGoogleAuthResult()).toEqual({ idToken: token, mode: "login" });
  });

  it("rechaza un token con otro nonce", () => {
    sessionStorage.setItem("google_oauth_nonce", "abc");
    volverDeGoogle(jwt({ nonce: "otro" }));
    expect(consumeGoogleAuthResult()).toEqual({ error: "nonce_mismatch" });
  });

  it("rechaza si NO hay nonce guardado: el token no salió de este inicio de sesión", () => {
    volverDeGoogle(jwt({ nonce: "abc" }));
    expect(consumeGoogleAuthResult()).toEqual({ error: "nonce_mismatch" });
  });

  it("el nonce es de un solo uso", () => {
    sessionStorage.setItem("google_oauth_nonce", "abc");
    volverDeGoogle(jwt({ nonce: "abc" }));
    consumeGoogleAuthResult();
    volverDeGoogle(jwt({ nonce: "abc" }));
    expect(consumeGoogleAuthResult()).toEqual({ error: "nonce_mismatch" });
  });
});
