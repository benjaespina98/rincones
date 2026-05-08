import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import api from '../services/api';

/**
 * Hook para obtener estadísticas de vinos del usuario actual (tipo Spotify)
 * Estructura: { countsByType, topVarietals, topRegions, avgRating, totals }
 */
export const useWineStats = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/users/${user.id}/wine-stats`);
        if (response.data?.success) {
          setStats(response.data.data);
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        console.error('Error fetching wine stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user?.id]);

  return { stats, loading, error };
};
