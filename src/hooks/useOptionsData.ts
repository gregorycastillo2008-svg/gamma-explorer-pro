import { useEffect, useRef, useState } from "react";

import {
  DemoTicker, OptionContract, generateDemoChain, getDemoTicker,
} from "@/lib/gex";

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

interface CboeResp {
  symbol: string;
  spot: number;
  priceChange: number;
  priceChangePct: number;
  iv30: number;
  lastTradeTime: string | null;
  totalOI: number;
  expiries: number[];
  strikes: number[];
  contracts: Array<OptionContract & { delta: number; gamma: number; vega: number; theta: number }>;
  source: string;
  fetchedAt: string;
}

// 2-minute in-memory cache shared across hook instances
const CACHE = new Map<string, { at: number; resp: CboeResp }>();
const TTL_MS = 120_000;

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
      try {
        // Edge function reads ?symbol= from query string — use direct fetch
        // (supabase-js invoke v2 does not pass query strings on GET reliably)
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cboe-options?symbol=${encodeURIComponent(upper)}`;
        const resp = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json: CboeResp = await resp.json();
        if (!json?.contracts?.length) throw new Error("empty chain");
        if (aborted.current) return;
        CACHE.set(upper, { at: Date.now(), resp: json });
        apply(json);
      } catch (e) {
        if (aborted.current) return;
        // Fallback silently to demo data
        const t = getDemoTicker(upper) ?? fallback;
        setTicker(t);
        setContracts(generateDemoChain(t));
        setStatus("demo");
        setSource(`DEMO (${(e as Error).message})`);
        setFetchedAt(null);
        setIv30(null);
        setPriceChangePct(0);
      }
    };

    function apply(json: CboeResp) {
      if (aborted.current) return;
      const base = getDemoTicker(json.symbol);
      const expiries = json.expiries.length ? json.expiries : [1, 7, 30];
      const strikes = json.strikes;
      const step = strikes.length > 1
        ? Math.max(0.5, Math.round((strikes[1] - strikes[0]) * 10) / 10)
        : (base?.strikeStep ?? 5);
      setTicker({
        symbol: json.symbol,
        name: base?.name ?? json.symbol,
        spot: json.spot,
        baseIV: json.iv30 ? json.iv30 / 100 : (base?.baseIV ?? 0.2),
        strikeStep: step,
        expiries,
      });
    setContracts(json.contracts.map((c: any) => ({
      strike: c.strike, expiry: c.expiry, type: c.type, iv: c.iv, oi: c.oi,
      volume: c.volume ?? 0,
      gamma: c.gamma, delta: c.delta, vega: c.vega, theta: c.theta,
      bid: c.bid, ask: c.ask, last: c.last,
    })));
      setStatus("live");
      setSource(json.source);
      setFetchedAt(json.fetchedAt);
      setIv30(json.iv30 || null);
      setPriceChangePct(json.priceChangePct || 0);
    }

    fetchNow(false);
    // Auto-refresh every 60s so the entire dashboard updates as the options
    // chain changes or contracts approach expiry.
    const intervalId = window.setInterval(() => fetchNow(true), 60_000);
    // Refresh immediately when the tab regains focus
    const onVis = () => { if (document.visibilityState === "visible") fetchNow(true); };
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
