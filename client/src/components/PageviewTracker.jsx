import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageview } from "../services/analyticsApi";

/**
 * Cuenta una visita cada vez que cambia la pantalla.
 *
 * Va como componente y no como un `useEffect` dentro de cada página por dos
 * razones: una sola implementación (una página nueva se mide sin que haya que
 * acordarse de nada) y un solo lugar donde mirar si algo se cuenta mal.
 *
 * En una SPA no alcanza con medir la carga inicial: la persona recorre seis
 * pantallas sin que el navegador vuelva a pedir nada, así que sin esto todas las
 * visitas parecerían quedarse en la home.
 *
 * No renderiza nada; vive adentro del Router porque `useLocation` lo necesita.
 */
export default function PageviewTracker() {
  const location = useLocation();

  useEffect(() => {
    // Sólo el path: los query params pueden traer datos que no hacen falta para
    // contar (y el server igual normaliza los ids del path).
    // El panel de admin no es uso del producto: medirlo contamina las pantallas más vistas.
    if (location.pathname === "/admin" || location.pathname.startsWith("/admin/")) return;
    trackPageview(location.pathname);
  }, [location.pathname]);

  return null;
}
