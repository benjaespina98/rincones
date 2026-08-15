import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import api from '../services/api';

/**
 * Las estadísticas de la bodega: { countsByType, topVarietals, topRegions,
 * avgRating, totals }.
 *
 * Alimentan el título de la home, los motivos de las recomendaciones y el
 * perfil. Con `stats` en `null` nada de eso afirma nada —es el valor que
 * significa "todavía no sabemos"— y por eso importa que nunca quede en `null`
 * por una carrera en vez de por una respuesta.
 *
 * ── LAS DOS COSAS QUE ESTABAN MAL ───────────────────────────────────────────
 *
 * 1. Sin cancelación. Al cambiar de usuario (o al doble montaje de StrictMode)
 *    quedaban dos pedidos en el aire y ganaba el que volvía último, que no es
 *    necesariamente el último que se pidió: la home podía terminar mostrando las
 *    estadísticas de la sesión anterior.
 *
 * 2. Una respuesta sin `success` no dejaba rastro: no seteaba `stats` ni
 *    `error`, así que el hook terminaba en "no cargando, sin datos, sin error" y
 *    quien lo consumía no tenía forma de distinguirlo de una bodega vacía.
 */
export const useWineStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setStats(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let vigente = true;

    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/users/${user.id}/wine-stats`);
        if (!vigente) return;
        if (response.data?.success) {
          setStats(response.data.data);
        } else {
          // El server contestó pero no con lo que esperábamos. Se dice, en vez
          // de dejar el hook en un estado que no se puede leer.
          setError('No pudimos leer tus estadísticas.');
        }
      } catch (err) {
        if (!vigente) return;
        // El mensaje del server puede ser técnico y esto se muestra en pantalla:
        // se guarda uno legible y el detalle va a la consola.
        console.error('Error fetching wine stats:', err);
        setError('No pudimos cargar tus estadísticas.');
      } finally {
        if (vigente) setLoading(false);
      }
    };

    fetchStats();
    return () => {
      vigente = false;
    };
  }, [user?.id]);

  return { stats, loading, error };
};
