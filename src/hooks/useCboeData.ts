/**
 * Hook para obtener datos CBOE Delayed en tiempo real
 * Usado por componentes 3D (IvSurface3D, RegimeIndicator, etc)
 */

import { useState, useEffect } from "react";
import { fetchCboeDelayed, getIVSurface, type CboeData } from "@/lib/cboeDelayedClient";
import type { IvCell } from "@/lib/gex";

export function useCboeData(symbol: string) {
  const [data, setData] = useState<CboeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const cboeData = await fetchCboeDelayed(symbol);
        if (mounted) {
          setData(cboeData);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load CBOE data");
          console.error("CBOE data error:", err);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();

    // Refresh every 30 seconds
    const interval = setInterval(load, 30_000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [symbol]);

  return { data, loading, error };
}

/**
 * Convierte datos CBOE a formato IvCell para componente 3D
 */
export function cboeToIvCells(data: CboeData): IvCell[] {
  const surface = getIVSurface(data);

  // Aggregate by strike/expiry to get unique points
  const map = new Map<string, { iv: number[]; count: number }>();

  for (const point of surface) {
    const key = `${point.strike}|${point.expiry}`;
    const existing = map.get(key);
    if (existing) {
      existing.iv.push(point.iv);
      existing.count++;
    } else {
      map.set(key, { iv: [point.iv], count: 1 });
    }
  }

  // Convert to IvCell
  const cells: IvCell[] = [];
  for (const [key, val] of map.entries()) {
    const [strikeStr, expiryStr] = key.split("|");
    const avgIv = val.iv.reduce((a, b) => a + b, 0) / val.iv.length;

    cells.push({
      strike: parseFloat(strikeStr),
      expiry: parseFloat(expiryStr),
      iv: avgIv,
      oi: 0, // Not available from surface
      volume: 0, // Not available from surface
      bid: 0,
      ask: 0,
    });
  }

  return cells;
}
