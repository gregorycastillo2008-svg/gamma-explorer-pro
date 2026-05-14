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
const TTL_MS = 900_000;

/** Pre-warm the cache for a symbol without rendering anything. Call on hover. */
export function prefetchSymbol(symbol: string): void {
  const upper = symbol.toUpperCase();
  const cached = CACHE.get(upper);
  if (cached && Date.now() - cached.at < TTL_MS) return;
  fetchCboeChain(upper)
    .then((cboe) => {
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
    })
    .catch(() => {});
}

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
    const upper = symbol.toUpperCase();

    // ── apply: push CachedResp into component state ────────────────────────
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

    // ── Instant preview before any async work ─────────────────────────────
    // Cache hit  → show live data right away, zero loading flash.
    // Cache miss → show correct-symbol demo immediately, then replace when real data arrives.
    const snap = CACHE.get(upper);
    if (snap && Date.now() - snap.at < TTL_MS) {
      apply(snap.resp);
    } else {
      const t = getDemoTicker(upper) ?? fallback;
      setTicker(t);
      setContracts(generateDemoChain(t));
      setStatus("loading");
      setSource("DEMO");
      setFetchedAt(null);
      setIv30(null);
      setPriceChangePct(0);
    }

    // ── Async fetch (skipped when cache is still fresh) ────────────────────
    const fetchNow = async (force = false) => {
      const cached = CACHE.get(upper);
      if (!force && cached && Date.now() - cached.at < TTL_MS) {
        apply(cached.resp);
        return;
      }

      // ── Race CBOE client (direct+proxy) and Supabase edge simultaneously ─
      // Supabase edge is server-side (no CORS) and most reliable.
      // CBOE client is faster when CORS allows it. Take whichever wins.
      const supaUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cboe-options?symbol=${encodeURIComponent(upper)}`;
      const supaKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const fromCboe = fetchCboeChain(upper).then((cboe): CachedResp => ({
        symbol: cboe.symbol,
        spot: cboe.spot,
        priceChangePct: cboe.priceChangePct,
        iv30: cboe.iv30,
        expiries: cboe.expiries,
        strikes: cboe.strikes,
        contracts: cboe.contracts,
        source: cboe.source,
        fetchedAt: cboe.fetchedAt,
      }));

      const fromSupa = (supaUrl && supaKey
        ? fetch(supaUrl, {
            headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
            signal: AbortSignal.timeout(12_000),
          }).then((r) => {
            if (!r.ok) throw new Error(`supabase HTTP ${r.status}`);
            return r.json();
          }).then((j): CachedResp => {
            if (!j?.contracts?.length) throw new Error("empty");
            // Normalize IV: CBOE occasionally sends percentage form (>2)
            const contracts = j.contracts.map((c: any) => ({
              ...c,
              iv: c.iv > 2 ? c.iv / 100 : c.iv,
            }));
            return {
              symbol: j.symbol,
              spot: j.spot,
              priceChangePct: j.priceChangePct ?? 0,
              iv30: j.iv30 ?? 0,
              expiries: j.expiries ?? [],
              strikes: j.strikes ?? [],
              contracts,
              source: j.source ?? "CBOE Delayed (edge)",
              fetchedAt: j.fetchedAt ?? new Date().toISOString(),
            };
          })
        : Promise.reject("no supabase config")) as Promise<CachedResp>;

      try {
        const resp = await Promise.any([fromCboe, fromSupa]);
        if (aborted.current) return;
        const base = getDemoTicker(resp.symbol) ?? fallback;
        const step = resp.strikes.length > 1
          ? Math.max(0.5, Math.round((resp.strikes[1] - resp.strikes[0]) * 10) / 10)
          : (base.strikeStep ?? 5);
        CACHE.set(upper, { at: Date.now(), resp });
        apply(resp, base, step);
        return;
      } catch {
        // both sources failed — fall through to demo
      }

      // ── Demo fallback ─────────────────────────────────────────────────────
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
