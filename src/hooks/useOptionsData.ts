import { useEffect, useRef, useState } from "react";

import {
  DemoTicker, OptionContract, generateDemoChain, getDemoTicker,
} from "@/lib/gex";
import { fetchCboeChain } from "@/lib/cboeClient";

export type DataStatus = "loading" | "live" | "demo" | "error";

export interface OptionsData {
  ticker: DemoTicker;
  contracts: OptionContract[];
  status: DataStatus;
  source: string;
  fetchedAt: string | null;
  iv30: number | null;
  priceChangePct: number;
  reload: () => void;
}

interface CachedResp {
  symbol: string;
  spot: number;
  priceChangePct: number;
  iv30: number;
  expiries: number[];
  strikes: number[];
  contracts: OptionContract[];
  source: string;
  fetchedAt: string;
}

// 15-minute cache — matches CBOE delayed data TTL
const CACHE = new Map<string, { at: number; resp: CachedResp }>();
const TTL_MS = 900_000; // 15 minutes

export function useOptionsData(symbol: string): OptionsData {
  const fallback = getDemoTicker(symbol) ?? getDemoTicker("SPX")!;
  const [contracts, setContracts] = useState<OptionContract[]>(() => generateDemoChain(fallback));
  const [ticker, setTicker] = useState<DemoTicker>(fallback);
  const [status, setStatus] = useState<DataStatus>("loading");
  const [source, setSource] = useState<string>("DEMO");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [iv30, setIv30] = useState<number | null>(null);
  const [priceChangePct, setPriceChangePct] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const aborted = useRef(false);

  useEffect(() => {
    aborted.current = false;
    setStatus("loading");

    const upper = symbol.toUpperCase();

    const fetchNow = async (force = false) => {
      const cached = CACHE.get(upper);
      if (!force && cached && Date.now() - cached.at < TTL_MS) {
        apply(cached.resp);
        return;
      }

      // ── 1. CBOE Delayed (15-min, free, no key) ──────────────────────────
      try {
        const cboe = await fetchCboeChain(upper);
        if (aborted.current) return;
        const base = getDemoTicker(cboe.symbol) ?? fallback;
        const step = cboe.strikes.length > 1
          ? Math.max(0.5, Math.round((cboe.strikes[1] - cboe.strikes[0]) * 10) / 10)
          : (base.strikeStep ?? 5);

        const resp: CachedResp = {
          symbol: cboe.symbol,
          spot: cboe.spot,
          priceChangePct: cboe.priceChangePct,
          iv30: cboe.iv30,
          expiries: cboe.expiries,
          strikes: cboe.strikes,
          contracts: cboe.contracts,
          source: cboe.source,
          fetchedAt: cboe.fetchedAt,
        };
        CACHE.set(upper, { at: Date.now(), resp });
        apply(resp, base, step);
        return;
      } catch (_cboeErr) {
        // fall through to Supabase
      }

      // ── 2. Supabase edge function (secondary) ───────────────────────────
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cboe-options?symbol=${encodeURIComponent(upper)}`;
        const r = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        if (!json?.contracts?.length) throw new Error("empty chain");
        if (aborted.current) return;
        CACHE.set(upper, { at: Date.now(), resp: json });
        apply(json);
        return;
      } catch (_supaErr) {
        // fall through to demo
      }

      // ── 3. Demo fallback ─────────────────────────────────────────────────
      if (aborted.current) return;
      const t = getDemoTicker(upper) ?? fallback;
      setTicker(t);
      setContracts(generateDemoChain(t));
      setStatus("demo");
      setSource("DEMO (offline)");
      setFetchedAt(null);
      setIv30(null);
      setPriceChangePct(0);
    };

    function apply(resp: CachedResp, base?: DemoTicker, stepOverride?: number) {
      if (aborted.current) return;
      const baseT = base ?? getDemoTicker(resp.symbol) ?? fallback;
      const expiries = resp.expiries?.length ? resp.expiries : [1, 7, 30];
      const strikes = resp.strikes ?? [];
      const step = stepOverride ?? (strikes.length > 1
        ? Math.max(0.5, Math.round((strikes[1] - strikes[0]) * 10) / 10)
        : (baseT.strikeStep ?? 5));

      setTicker({
        symbol: resp.symbol,
        name: baseT.name ?? resp.symbol,
        spot: resp.spot,
        baseIV: resp.iv30 ? resp.iv30 / 100 : (baseT.baseIV ?? 0.2),
        strikeStep: step,
        expiries,
      });
      setContracts(resp.contracts.map((c: any) => ({
        strike: c.strike,
        expiry: c.expiry,
        type: c.type,
        iv: c.iv,
        oi: c.oi,
        volume: c.volume ?? 0,
        gamma: c.gamma,
        delta: c.delta,
        vega: c.vega,
        theta: c.theta,
        bid: c.bid,
        ask: c.ask,
        last: c.last,
      })));
      setStatus("live");
      setSource(resp.source);
      setFetchedAt(resp.fetchedAt);
      setIv30(resp.iv30 || null);
      setPriceChangePct(resp.priceChangePct || 0);
    }

    fetchNow(false);

    // Auto-refresh every 15 minutes (matches CBOE delay window)
    const intervalId = window.setInterval(() => fetchNow(true), 900_000);
    // Refresh on tab focus if cache is stale
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const cached = CACHE.get(upper);
        if (!cached || Date.now() - cached.at > TTL_MS) fetchNow(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      aborted.current = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, reloadKey]);

  return {
    ticker,
    contracts,
    status,
    source,
    fetchedAt,
    iv30,
    priceChangePct,
    reload: () => setReloadKey((k) => k + 1),
  };
}
