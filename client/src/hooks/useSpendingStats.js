import { useState, useEffect } from "react";
import { getSpendingStats } from "../services/wineApi";

export function useSpendingStats() {
  const [spending, setSpending] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSpendingStats()
      .then((data) => { if (mounted) setSpending(data); })
      .catch(() => { if (mounted) setSpending(null); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return { spending, loading };
}
