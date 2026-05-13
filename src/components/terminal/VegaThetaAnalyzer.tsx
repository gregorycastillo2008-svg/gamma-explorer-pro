import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, Legend, BarChart, Bar, ComposedChart, Area } from "recharts";
import { Panel } from "./Panel";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

// ─────── Black-Scholes core ───────
function normalCDF(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}
function normalPDF(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function d1d2(S: number, K: number, T: number, r: number, sigma: number) {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return { d1, d2: d1 - sigma * Math.sqrt(T) };
}
function bsCall(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return S * normalCDF(d1) - K * Math.exp(-r * T) * normalCDF(d2);
}
function bsPut(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return K * Math.exp(-r * T) * normalCDF(-d2) - S * normalCDF(-d1);
}
function vega(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1 } = d1d2(S, K, T, r, sigma);
  return (S * normalPDF(d1) * Math.sqrt(T)) / 100;
}
function thetaCall(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return (-(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * normalCDF(d2)) / 365;
}
function thetaPut(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return (-(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * normalCDF(-d2)) / 365;
}
function deltaCall(S: number, K: number, T: number, r: number, sigma: number) {
  return normalCDF(d1d2(S, K, T, r, sigma).d1);
}
function deltaPut(S: number, K: number, T: number, r: number, sigma: number) {
  return normalCDF(d1d2(S, K, T, r, sigma).d1) - 1;
}
function gamma(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1 } = d1d2(S, K, T, r, sigma);
  return normalPDF(d1) / (S * sigma * Math.sqrt(T));
}
// Vanna = ∂Δ/∂σ — per 1% vol move (industry convention)
function vanna(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  return (-normalPDF(d1) * d2 / sigma) / 100;
}
// Charm = -∂Δ/∂t — per calendar day
function charmCall(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const common = normalPDF(d1) * (2 * r * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT);
  return (-common) / 365;
}
function charmPut(S: number, K: number, T: number, r: number, sigma: number) {
  const { d1, d2 } = d1d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const common = normalPDF(d1) * (2 * r * T - d2 * sigma * sqrtT) / (2 * T * sigma * sqrtT);
  return (-common + r * Math.exp(-r * T)) / 365;
}

const COL = {
  bg: "#0a0e17",
  bg2: "#1a2332",
  border: "#2a3444",
  txt: "#e0e6ed",
  txt2: "#8894a8",
  txt3: "#6b7a94",
  green: "#00ff88",
  red: "#ff4466",
  yellow: "#ffaa00",
  purple: "#8844ff",
};

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

interface FlowOrder {
  id: number;
  ticker: string;
  type: "CALL" | "PUT";
  strike: number;
  expiry: string;
  contracts: number;
  price: number;
  side: "BID" | "ASK";
  timestamp: string;
  exchanges: string[];
  delta: number;
  vega: number;
  theta: number;
  premium: number;
  orderType: string;
  sentiment: "bullish" | "bearish" | "protective" | "neutral";
}

interface Alert {
  id: number;
  severity: "high" | "medium";
  icon: string;
  title: string;
  message: string;
  timestamp: string;
}

const r = 0.05;

export function VegaThetaAnalyzer({ ticker, contracts }: Props) {
  const spot = ticker.spot;

  // ATM IV from contracts
  const iv = useMemo(() => {
    const atm = contracts.filter((c) => Math.abs(c.strike - spot) < ticker.strikeStep * 1.5);
    const avg = atm.reduce((s, c) => s + c.iv, 0) / Math.max(1, atm.length);
    return avg > 0 ? avg : 0.22;
  }, [contracts, spot, ticker.strikeStep]);

  // Available expiries
  const expiries = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach((c) => set.add(c.expiry));
    return Array.from(set).sort((a, b) => a - b);
  }, [contracts]);

  const [selectedExpiry, setSelectedExpiry] = useState<number>(expiries[0] ?? 30);
  useEffect(() => {
    if (!expiries.includes(selectedExpiry) && expiries.length) setSelectedExpiry(expiries[0]);
  }, [expiries, selectedExpiry]);

  const T = Math.max(1, selectedExpiry) / 365;

  // Index real contracts by strike for the selected expiry
  const realByStrike = useMemo(() => {
    const m = new Map<number, { call?: OptionContract; put?: OptionContract }>();
    contracts.filter((c) => c.expiry === selectedExpiry).forEach((c) => {
      const e = m.get(c.strike) ?? {};
      if (c.type === "call") e.call = c; else e.put = c;
      m.set(c.strike, e);
    });
    return m;
  }, [contracts, selectedExpiry]);

  // ─── Options chain rows: REAL strikes & IV/OI from contracts
  const chainRows = useMemo(() => {
    const step = ticker.strikeStep;
    const lo = spot * 0.95;
    const hi = spot * 1.05;
    const strikes = Array.from(realByStrike.keys())
      .filter((K) => K >= lo && K <= hi)
      .sort((a, b) => a - b);

    return strikes.map((K) => {
      const entry = realByStrike.get(K)!;
      const cReal = entry.call;
      const pReal = entry.put;
      const cIv = cReal?.iv ?? iv;
      const pIv = pReal?.iv ?? iv;
      const cPrice = bsCall(spot, K, T, r, cIv);
      const pPrice = bsPut(spot, K, T, r, pIv);
      // Spread proxied from IV (more vol → wider spread)
      const cSpread = Math.max(0.05, cPrice * 0.02 + cIv * 0.5);
      const pSpread = Math.max(0.05, pPrice * 0.02 + pIv * 0.5);
      return {
        strike: K,
        isATM: Math.abs(K - spot) < step / 2,
        call: {
          bid: Math.max(0, cPrice - cSpread / 2),
          ask: cPrice + cSpread / 2,
          last: cPrice,
          iv: cIv,
          delta: cReal?.delta ?? deltaCall(spot, K, T, r, cIv),
          gamma: cReal?.gamma ?? gamma(spot, K, T, r, cIv),
          vega: cReal?.vega ?? vega(spot, K, T, r, cIv),
          theta: cReal?.theta ?? thetaCall(spot, K, T, r, cIv),
          oi: cReal?.oi ?? 0,
          volume: Math.round((cReal?.oi ?? 0) * 0.15),
        },
        put: {
          bid: Math.max(0, pPrice - pSpread / 2),
          ask: pPrice + pSpread / 2,
          last: pPrice,
          iv: pIv,
          delta: pReal?.delta ?? deltaPut(spot, K, T, r, pIv),
          gamma: pReal?.gamma ?? gamma(spot, K, T, r, pIv),
          vega: pReal?.vega ?? vega(spot, K, T, r, pIv),
          theta: pReal?.theta ?? thetaPut(spot, K, T, r, pIv),
          oi: pReal?.oi ?? 0,
          volume: Math.round((pReal?.oi ?? 0) * 0.15),
        },
      };
    });
  }, [realByStrike, spot, T, iv, ticker.strikeStep]);

  // ─── Aggregated metrics from ALL contracts in selected expiry (real OI weighted)
  const { totalVega, totalTheta, putVol, callVol, ivRank } = useMemo(() => {
    let tv = 0, tt = 0, pv = 0, cv = 0;
    contracts.filter((c) => c.expiry === selectedExpiry).forEach((c) => {
      const sigma = c.iv > 0 ? c.iv : iv;
      const v = c.vega ?? vega(spot, c.strike, T, r, sigma);
      const th = c.theta ?? (c.type === "call" ? thetaCall(spot, c.strike, T, r, sigma) : thetaPut(spot, c.strike, T, r, sigma));
      const notional = c.oi * 100; // 100 shares per contract
      tv += v * notional;
      tt += th * notional;
      if (c.type === "call") cv += c.oi; else pv += c.oi;
    });
    // IV rank: scale ATM IV against typical 10–60% range
    const ivR = Math.min(99, Math.max(1, ((iv - 0.10) / 0.50) * 100));
    return { totalVega: tv, totalTheta: tt, putVol: pv, callVol: cv, ivRank: ivR };
  }, [contracts, selectedExpiry, spot, T, iv]);

  // ─── Vanna / Charm exposure per strike (dealer convention: short calls, long puts ⇒ sign)
  const vannaCharmSeries = useMemo(() => {
    const m = new Map<number, { strike: number; vanna: number; charm: number; vannaCall: number; vannaPut: number; charmCall: number; charmPut: number }>();
    contracts.filter((c) => c.expiry === selectedExpiry).forEach((c) => {
      const sigma = c.iv > 0 ? c.iv : iv;
      const va = vanna(spot, c.strike, T, r, sigma);
      const ch = c.type === "call" ? charmCall(spot, c.strike, T, r, sigma) : charmPut(spot, c.strike, T, r, sigma);
      const notional = c.oi * 100;
      const sign = c.type === "call" ? 1 : -1; // dealer-short calls / long puts
      const cur = m.get(c.strike) ?? { strike: c.strike, vanna: 0, charm: 0, vannaCall: 0, vannaPut: 0, charmCall: 0, charmPut: 0 };
      cur.vanna += va * notional * sign;
      cur.charm += ch * notional * sign;
      if (c.type === "call") { cur.vannaCall += va * notional; cur.charmCall += ch * notional; }
      else { cur.vannaPut += va * notional; cur.charmPut += ch * notional; }
      m.set(c.strike, cur);
    });
    return Array.from(m.values())
      .filter((x) => x.strike >= spot * 0.92 && x.strike <= spot * 1.08)
      .sort((a, b) => a.strike - b.strike);
  }, [contracts, selectedExpiry, spot, T, iv]);

  const totalVanna = vannaCharmSeries.reduce((s, p) => s + p.vanna, 0);
  const totalCharm = vannaCharmSeries.reduce((s, p) => s + p.charm, 0);
  const peakVanna = vannaCharmSeries.reduce((b, p) => Math.abs(p.vanna) > Math.abs(b.vanna) ? p : b, vannaCharmSeries[0] ?? { strike: 0, vanna: 0, charm: 0 } as any);
  const peakCharm = vannaCharmSeries.reduce((b, p) => Math.abs(p.charm) > Math.abs(b.charm) ? p : b, vannaCharmSeries[0] ?? { strike: 0, vanna: 0, charm: 0 } as any);

  // ─── Theta decay timeline
  const decaySeries = useMemo(() => {
    const days = Math.max(1, selectedExpiry);
    const atmK = Math.round(spot / ticker.strikeStep) * ticker.strikeStep;
    const itmK = Math.round((spot * 0.97) / ticker.strikeStep) * ticker.strikeStep;
    const otmK = Math.round((spot * 1.03) / ticker.strikeStep) * ticker.strikeStep;
    const deepOtmK = Math.round((spot * 1.06) / ticker.strikeStep) * ticker.strikeStep;
    const step = Math.max(1, Math.floor(days / 120));
    const out: any[] = [];
    for (let day = 0; day <= days; day += step) {
      const Tt = Math.max(0.001, (days - day) / 365);
      const atmP = bsCall(spot, atmK, Tt, r, iv);
      const itmP = bsCall(spot, itmK, Tt, r, iv);
      const otmP = bsCall(spot, otmK, Tt, r, iv);
      const deepOtmP = bsCall(spot, deepOtmK, Tt, r, iv);
      const atmTV = Math.max(0, atmP - Math.max(0, spot - atmK));
      const itmTV = Math.max(0, itmP - Math.max(0, spot - itmK));
      const atmTh = Math.abs(thetaCall(spot, atmK, Tt, r, iv));
      const itmTh = Math.abs(thetaCall(spot, itmK, Tt, r, iv));
      const otmTh = Math.abs(thetaCall(spot, otmK, Tt, r, iv));
      const atmV = vega(spot, atmK, Tt, r, iv);
      out.push({
        daysLeft: days - day,
        atm: +atmP.toFixed(4),
        itm: +itmP.toFixed(4),
        otm: +otmP.toFixed(4),
        deepOtm: +deepOtmP.toFixed(4),
        atmTV: +atmTV.toFixed(4),
        itmTV: +itmTV.toFixed(4),
        atmTheta: +atmTh.toFixed(5),
        itmTheta: +itmTh.toFixed(5),
        otmTheta: +otmTh.toFixed(5),
        atmVega: +atmV.toFixed(4),
        thetaVegaRatio: atmV > 0 ? +(atmTh / atmV).toFixed(4) : 0,
      });
    }
    return out;
  }, [selectedExpiry, spot, iv, ticker.strikeStep]);

  // ─── Heatmap (vega/theta toggle)
  const [showVega, setShowVega] = useState(true);
  const [heatHover, setHeatHover] = useState<{
    strike: number; dte: number; value: number;
    vega: number; theta: number; delta: number; gamma: number;
    iv: number; moneyness: number; x: number; y: number;
  } | null>(null);
  const heatmap = useMemo(() => {
    const dtes = [7, 14, 30, 60, 90, 180];
    const step = ticker.strikeStep;
    const strikes: number[] = [];
    const lo = Math.round((spot * 0.92) / step) * step;
    const hi = Math.round((spot * 1.08) / step) * step;
    for (let K = lo; K <= hi; K += step) strikes.push(K);
    const rows = strikes.map((K) => {
      const moneyness = ((K - spot) / spot) * 100;
      return dtes.map((dte) => {
        const Tt = dte / 365;
        const v = vega(spot, K, Tt, r, iv);
        const th = thetaCall(spot, K, Tt, r, iv);
        const d = deltaCall(spot, K, Tt, r, iv);
        const g = gamma(spot, K, Tt, r, iv);
        return { strike: K, dte, value: showVega ? v : th, vega: v, theta: th, delta: d, gamma: g, iv, moneyness };
      });
    });
    return { dtes, strikes, rows };
  }, [showVega, spot, iv, ticker.strikeStep]);

  function heatColor(v: number, isVega: boolean) {
    const intensity = Math.min(Math.abs(v) / (isVega ? 1.5 : 0.6), 1);
    if (isVega) {
      const hue = 210 - intensity * 25;
      const sat = 40 + intensity * 60;
      const lit = 10 + intensity * 45;
      return `hsl(${hue}, ${sat}%, ${lit}%)`;
    } else {
      const hue = 10 - intensity * 5;
      const sat = 40 + intensity * 60;
      const lit = 10 + intensity * 45;
      return `hsl(${hue}, ${sat}%, ${lit}%)`;
    }
  }

  // ─── Real positions from CBOE contracts, sorted by premium (OI × price)
  const [orders, setOrders] = useState<FlowOrder[]>([]);
  useEffect(() => {
    if (!contracts.length) return;
    const derived: FlowOrder[] = contracts
      .filter((c) => c.oi > 0)
      .map((c, i) => {
        const Tt = Math.max(c.expiry, 1) / 365;
        const sigma = c.iv > 0 ? c.iv : iv;
        const price = c.type === "call"
          ? bsCall(spot, c.strike, Tt, r, sigma)
          : bsPut(spot, c.strike, Tt, r, sigma);
        const d = c.delta ?? (c.type === "call"
          ? deltaCall(spot, c.strike, Tt, r, sigma)
          : deltaPut(spot, c.strike, Tt, r, sigma));
        const v = c.vega ?? vega(spot, c.strike, Tt, r, sigma);
        const th = c.theta ?? (c.type === "call"
          ? thetaCall(spot, c.strike, Tt, r, sigma)
          : thetaPut(spot, c.strike, Tt, r, sigma));
        const premium = price * c.oi * 100;
        const type = c.type === "call" ? "CALL" as const : "PUT" as const;
        const side: "BID" | "ASK" = c.type === "call"
          ? (d > 0.4 ? "ASK" : "BID")
          : (Math.abs(d) > 0.4 ? "BID" : "ASK");
        let orderType = "STANDARD";
        if (premium > 10_000_000) orderType = "BLOCK";
        else if (c.oi > 10000) orderType = "SWEEP";
        else if (type === "CALL" && side === "ASK") orderType = "AGGRESSIVE CALL";
        else if (type === "PUT" && side === "BID") orderType = "AGGRESSIVE PUT";
        let sentiment: FlowOrder["sentiment"] = "neutral";
        if (type === "CALL" && side === "ASK") sentiment = "bullish";
        else if (type === "PUT" && side === "BID") sentiment = "bearish";
        else if (type === "PUT" && c.strike < spot * 0.95) sentiment = "protective";
        return {
          id: i,
          ticker: ticker.symbol,
          type,
          strike: c.strike,
          expiry: `+${c.expiry}D`,
          contracts: c.oi,
          price: Math.round(price * 100) / 100,
          side,
          timestamp: new Date().toLocaleTimeString(),
          exchanges: ["CBOE"],
          delta: d,
          vega: v,
          theta: th,
          premium,
          orderType,
          sentiment,
        };
      })
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 40);
    setOrders(derived);
  }, [contracts, spot, iv]);

  // ─── Alerts (derived)
  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = [];
    if (Math.abs(totalVega) > 10000)
      out.push({ id: 1, severity: "high", icon: "⚠️", title: "High Vega Exposure",
        message: `Total vega: ${formatNumber(totalVega)} — consider hedging`, timestamp: new Date().toLocaleTimeString() });
    if (Math.abs(totalTheta) > 500)
      out.push({ id: 2, severity: "medium", icon: "θ", title: "High Theta Decay",
        message: `Daily decay: $${formatNumber(Math.abs(totalTheta))}`, timestamp: new Date().toLocaleTimeString() });
    if (ivRank > 80)
      out.push({ id: 3, severity: "medium", icon: "📈", title: "Elevated IV Rank",
        message: `IV Rank ${ivRank.toFixed(0)}% — premium-selling environment`, timestamp: new Date().toLocaleTimeString() });
    if (ivRank < 20)
      out.push({ id: 4, severity: "medium", icon: "📉", title: "Low IV Rank",
        message: `IV Rank ${ivRank.toFixed(0)}% — long premium favored`, timestamp: new Date().toLocaleTimeString() });
    const big = orders.find((o) => o.premium > 500000);
    if (big) out.push({ id: 5, severity: "high", icon: "💥", title: "Large Block",
      message: `${big.ticker} ${big.strike}${big.type[0]} ${big.expiry} — ${big.contracts} ctr @ ${big.side} · $${formatNumber(big.premium)}`,
      timestamp: big.timestamp });
    return out;
  }, [totalVega, totalTheta, ivRank, orders]);

  // ─── Scenario analyzer
  const [ivChange, setIvChange] = useState(0);
  const [daysFwd, setDaysFwd] = useState(0);
  const vegaPnL = (totalVega * ivChange) / 100;
  const thetaPnL = totalTheta * daysFwd;
  const netPnL = vegaPnL + thetaPnL;

  const exportCSV = () => {
    const header = ["strike","callBid","callAsk","callIV","callDelta","callGamma","callVega","callTheta","putBid","putAsk","putDelta","putVega","putTheta"];
    const lines = chainRows.map((r) => [r.strike, r.call.bid, r.call.ask, r.call.iv, r.call.delta, r.call.gamma, r.call.vega, r.call.theta, r.put.bid, r.put.ask, r.put.delta, r.put.vega, r.put.theta].map((x: any) => typeof x === "number" ? x.toFixed(4) : x).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chain_${ticker.symbol}_${selectedExpiry}D.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto space-y-3 terminal-scrollbar" style={{ background: COL.bg, color: COL.txt, padding: 12, borderRadius: 6 }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-3 py-2 rounded"
        style={{ background: "linear-gradient(135deg, #0a0e17 0%, #151922 100%)", border: `1px solid ${COL.border}` }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 20, color: COL.purple }}>Θν</span>
          <span className="font-bold tracking-wider text-sm" style={{ color: COL.txt }}>VEGA / THETA ANALYZER</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span style={{ color: COL.txt2 }}>{ticker.symbol}</span>
          <span style={{ color: COL.txt3 }}>·</span>
          <span style={{ color: COL.yellow }}>${spot.toFixed(2)}</span>
          <span style={{ color: COL.txt3 }}>·</span>
          <select value={selectedExpiry} onChange={(e) => setSelectedExpiry(Number(e.target.value))}
            className="bg-transparent border rounded px-2 py-0.5" style={{ borderColor: COL.border, color: COL.txt }}>
            {expiries.map((d) => <option key={d} value={d} style={{ background: COL.bg2 }}>{d}D</option>)}
          </select>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: COL.green }} />
            <span style={{ color: COL.green }}>CBOE · TOP OI</span>
          </span>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard title="Total Vega Exposure" value={formatNumber(totalVega)} subtitle="Sensitivity per 1 vol pt" color={COL.purple} icon="ν" />
        <MetricCard title="Daily Theta Decay" value={`$${formatNumber(Math.abs(totalTheta))}`} subtitle="Loss per day from time" color={COL.red} icon="θ" />
        <MetricCard title="Put / Call Ratio" value={(putVol / Math.max(1, callVol)).toFixed(2)}
          subtitle={putVol > callVol ? "Bearish pressure" : "Bullish pressure"}
          color={putVol > callVol ? COL.red : COL.green} />
        <MetricCard title="Implied Vol Rank" value={`${ivRank.toFixed(0)}%`} subtitle="IV percentile (proxy)" color={COL.yellow} gauge={ivRank} />
      </div>

      

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Theta decay */}
        <Panel title="Theta Decay Timeline" subtitle={`${selectedExpiry}D · IV ${(iv * 100).toFixed(1)}% · Black-Scholes`}>
          {(() => {
            const atmK = Math.round(spot / ticker.strikeStep) * ticker.strikeStep;
            const atmTh = Math.abs(thetaCall(spot, atmK, T, r, iv));
            const atmV = vega(spot, atmK, T, r, iv);
            const atmP = bsCall(spot, atmK, T, r, iv);
            const atmTV = Math.max(0, atmP - Math.max(0, spot - atmK));
            return (
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: "ATM θ/day", value: `-$${atmTh.toFixed(3)}`, color: COL.red },
                  { label: "ATM Vega ν", value: atmV.toFixed(4), color: "#00e5ff" },
                  { label: "θ/ν Ratio", value: atmV > 0 ? (atmTh / atmV).toFixed(4) : "—", color: COL.purple },
                  { label: "Time Value", value: `$${atmTV.toFixed(2)}`, color: COL.yellow },
                ].map((s) => (
                  <div key={s.label} style={{ background: COL.bg2, border: `1px solid ${COL.border}`, borderRadius: 6, padding: "6px 10px" }}>
                    <div style={{ color: COL.txt3, fontSize: 9, marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
                    <div style={{ color: s.color, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          <div className="h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={decaySeries} margin={{ top: 10, right: 55, left: 10, bottom: 22 }}>
                <defs>
                  <linearGradient id="tvGradTheta" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COL.yellow} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={COL.yellow} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={COL.border} strokeDasharray="2 4" />
                <XAxis
                  dataKey="daysLeft"
                  reversed
                  tick={{ fill: COL.txt2, fontSize: 10 }}
                  label={{ value: "Days to Expiry", fill: COL.txt3, fontSize: 10, position: "insideBottom", dy: 14 }}
                />
                <YAxis
                  yAxisId="price"
                  tick={{ fill: COL.txt2, fontSize: 10 }}
                  tickFormatter={(v) => `$${Number(v).toFixed(1)}`}
                  label={{ value: "Price ($)", fill: COL.txt2, fontSize: 9, angle: -90, position: "insideLeft", dx: -2 }}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tick={{ fill: "#a78bfa", fontSize: 9 }}
                  tickFormatter={(v) => Number(v).toFixed(4)}
                  label={{ value: "θ / ν", fill: "#a78bfa", fontSize: 9, angle: 90, position: "insideRight", dx: 14 }}
                />
                <RTooltip
                  contentStyle={{ background: "#0d1520", border: `1px solid ${COL.border}`, fontSize: 11, borderRadius: 8 }}
                  formatter={(value: any, name: string) => {
                    const map: Record<string, [string, string]> = {
                      atm: ["ATM Price", COL.yellow],
                      itm: ["ITM -3% Price", COL.green],
                      otm: ["OTM +3% Price", COL.red],
                      deepOtm: ["OTM +6% Price", "#ff88aa"],
                      atmTV: ["ATM Time Value", "#ffcc44"],
                      atmTheta: ["ATM θ/day", "#a78bfa"],
                      itmTheta: ["ITM θ/day", "#c4b5fd"],
                      otmTheta: ["OTM θ/day", "#f87171"],
                      atmVega: ["Vega (ν)", "#00e5ff"],
                    };
                    const [label, color] = map[name] ?? [name, "#fff"];
                    return [typeof value === "number" ? value.toFixed(5) : String(value), <span style={{ color }}>{label}</span>];
                  }}
                  labelFormatter={(l) => `${l} days left`}
                />
                <ReferenceLine yAxisId="price" x={0} stroke={COL.yellow} strokeWidth={1.5} strokeDasharray="3 3"
                  label={{ value: "EXPIRY", fill: COL.yellow, fontSize: 9, position: "top" }} />
                <Area yAxisId="price" type="monotone" dataKey="atmTV" fill="url(#tvGradTheta)"
                  stroke={COL.yellow} strokeWidth={0.8} strokeDasharray="4 3" dot={false} name="atmTV" />
                <Line yAxisId="price" type="monotone" dataKey="atm" stroke={COL.yellow} strokeWidth={2.5} dot={false} name="atm" />
                <Line yAxisId="price" type="monotone" dataKey="itm" stroke={COL.green} strokeWidth={1.8} dot={false} name="itm" />
                <Line yAxisId="price" type="monotone" dataKey="otm" stroke={COL.red} strokeWidth={1.8} dot={false} name="otm" />
                <Line yAxisId="price" type="monotone" dataKey="deepOtm" stroke="#ff88aa" strokeWidth={1} strokeDasharray="3 2" dot={false} name="deepOtm" />
                <Line yAxisId="rate" type="monotone" dataKey="atmTheta" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 2" dot={false} name="atmTheta" />
                <Line yAxisId="rate" type="monotone" dataKey="itmTheta" stroke="#c4b5fd" strokeWidth={1} strokeDasharray="3 2" dot={false} name="itmTheta" />
                <Line yAxisId="rate" type="monotone" dataKey="otmTheta" stroke="#f87171" strokeWidth={1} strokeDasharray="3 2" dot={false} name="otmTheta" />
                <Line yAxisId="rate" type="monotone" dataKey="atmVega" stroke="#00e5ff" strokeWidth={1.5} strokeDasharray="2 3" dot={false} name="atmVega" />
                <Legend
                  wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  formatter={(value: string) => {
                    const labels: Record<string, string> = {
                      atm: "ATM", itm: "ITM -3%", otm: "OTM +3%", deepOtm: "OTM +6%",
                      atmTV: "Time Value", atmTheta: "ATM θ/day", itmTheta: "ITM θ/day",
                      otmTheta: "OTM θ/day", atmVega: "Vega (ν)",
                    };
                    return labels[value] ?? value;
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Flow feed */}
        <Panel title="Option Flow Feed" subtitle={`Live · ${orders.length} orders`}>
          <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
            {orders.length === 0 && <div className="text-xs text-center py-6" style={{ color: COL.txt3 }}>Waiting for orders…</div>}
            {orders.map((o) => (
              <div key={o.id} style={{
                background: o.sentiment === "bullish" ? "#00ff8811" : o.sentiment === "bearish" ? "#ff446611" : "#ffaa0011",
                borderLeft: `4px solid ${o.sentiment === "bullish" ? COL.green : o.sentiment === "bearish" ? COL.red : COL.yellow}`,
                padding: 8, marginBottom: 6, borderRadius: 4,
              }}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold">{o.ticker}</span>
                  <span style={{ color: o.type === "CALL" ? COL.green : COL.red }}>{o.type}</span>
                  <span>${o.strike}</span>
                  <span style={{ color: COL.txt3 }}>{o.expiry}</span>
                  <span className="ml-auto text-[10px]" style={{ color: COL.txt3 }}>{o.timestamp}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px]">
                  <span style={{ color: COL.yellow }}>${formatNumber(o.premium)}</span>
                  <span>{o.contracts} ctr</span>
                  <span style={{ color: o.side === "ASK" ? COL.green : COL.red }}>{o.side}</span>
                  <span style={{ background: "#ffaa0033", padding: "1px 5px", borderRadius: 3 }}>{o.orderType}</span>
                </div>
                <div className="flex gap-3 mt-1 text-[10px]" style={{ color: COL.txt3 }}>
                  <span>Δ {o.delta.toFixed(2)}</span>
                  <span>ν {o.vega.toFixed(3)}</span>
                  <span>θ {o.theta.toFixed(3)}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Heatmap */}
      <Panel title={`${showVega ? "Vega (ν)" : "Theta (θ)"} Heatmap`} subtitle="Strike × DTE · hover a cell for details">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex gap-1">
            <button
              onClick={() => setShowVega(true)}
              className="text-[10px] font-mono px-3 py-1 rounded"
              style={{
                background: showVega ? "#00e5ff22" : COL.bg2,
                color: showVega ? "#00e5ff" : COL.txt2,
                border: `1px solid ${showVega ? "#00e5ff88" : COL.border}`,
                fontWeight: showVega ? 700 : 400,
              }}
            >ν VEGA</button>
            <button
              onClick={() => setShowVega(false)}
              className="text-[10px] font-mono px-3 py-1 rounded"
              style={{
                background: !showVega ? "#ff446622" : COL.bg2,
                color: !showVega ? COL.red : COL.txt2,
                border: `1px solid ${!showVega ? "#ff446688" : COL.border}`,
                fontWeight: !showVega ? 700 : 400,
              }}
            >θ THETA</button>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-mono">
            <span style={{ color: COL.txt3 }}>LOW</span>
            <div style={{
              width: 100, height: 8, borderRadius: 4,
              background: showVega
                ? "linear-gradient(to right, #0d1520, #063d6b, #0077bb, #00aadd, #00e5ff)"
                : "linear-gradient(to right, #0d1520, #4a0a00, #8b1a00, #cc2200, #ff3300)",
            }} />
            <span style={{ color: COL.txt3 }}>HIGH</span>
          </div>
        </div>

        <div className="overflow-x-auto" onMouseLeave={() => setHeatHover(null)}>
          <table className="font-mono text-[10px]" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-right" style={{ color: COL.txt3, fontSize: 9 }}>Strike</th>
                <th className="px-2 py-1.5 text-center" style={{ color: COL.txt3, fontSize: 9 }}>Δ%</th>
                {heatmap.dtes.map((d) => (
                  <th key={d} className="px-2 py-1.5 text-center" style={{ color: COL.txt2, minWidth: 64 }}>{d}D</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.rows.map((row, i) => {
                const isATM = Math.abs(row[0].moneyness) < 1.5;
                const mn = row[0].moneyness;
                return (
                  <tr key={i} style={{ background: isATM ? "#ffdd4408" : "transparent" }}>
                    <td className="px-2 py-1 text-right font-bold" style={{ color: isATM ? COL.yellow : COL.txt, whiteSpace: "nowrap" }}>
                      {row[0].strike}
                      {isATM && <span style={{ marginLeft: 4, fontSize: 8, color: COL.yellow, fontWeight: 400 }}>ATM</span>}
                    </td>
                    <td className="px-2 py-1 text-center" style={{ color: mn > 0 ? COL.red : mn < 0 ? COL.green : COL.yellow, fontSize: 9 }}>
                      {mn > 0 ? "+" : ""}{mn.toFixed(1)}%
                    </td>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        onMouseEnter={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setHeatHover({ ...cell, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        className="text-center"
                        style={{
                          background: heatColor(cell.value, showVega),
                          color: "#fff",
                          padding: "5px 6px",
                          cursor: "crosshair",
                          borderRadius: 3,
                          outline: heatHover?.strike === cell.strike && heatHover?.dte === cell.dte
                            ? "2px solid rgba(255,255,255,0.5)" : "none",
                          transition: "outline 0.05s",
                        }}
                      >
                        {Math.abs(cell.value) < 0.0001
                          ? cell.value.toExponential(1)
                          : Math.abs(cell.value).toFixed(showVega ? 3 : 4)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {heatHover && (
          <div
            style={{
              position: "fixed",
              left: Math.max(125, Math.min(heatHover.x, window.innerWidth - 125)),
              top: Math.max(10, heatHover.y - 12),
              transform: "translate(-50%, -100%)",
              background: "#0b1422",
              border: "1px solid #2a3a54",
              borderRadius: 10,
              padding: "12px 16px",
              zIndex: 9999,
              width: 250,
              boxShadow: "0 12px 40px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.04)",
              pointerEvents: "none",
              fontFamily: "monospace",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1e2d42", paddingBottom: 8, marginBottom: 10 }}>
              <div>
                <span style={{ color: "#6b7a94", fontSize: 9, textTransform: "uppercase", letterSpacing: 1 }}>Strike</span>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginLeft: 8 }}>${heatHover.strike}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#6b7a94", fontSize: 9 }}>{heatHover.dte}D</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                  background: Math.abs(heatHover.moneyness) < 1.5 ? "#ffdd4420" : heatHover.moneyness > 0 ? "#ff446620" : "#00ff8820",
                  color: Math.abs(heatHover.moneyness) < 1.5 ? COL.yellow : heatHover.moneyness > 0 ? COL.red : COL.green,
                  border: `1px solid ${Math.abs(heatHover.moneyness) < 1.5 ? "#ffdd4440" : heatHover.moneyness > 0 ? "#ff446640" : "#00ff8840"}`,
                }}>
                  {Math.abs(heatHover.moneyness) < 1.5 ? "ATM" : heatHover.moneyness > 0 ? `OTM +${heatHover.moneyness.toFixed(1)}%` : `ITM ${heatHover.moneyness.toFixed(1)}%`}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 16px", fontSize: 11, marginBottom: 10 }}>
              {[
                { label: "Vega (ν)", value: heatHover.vega.toFixed(4), color: "#00e5ff" },
                { label: "Theta (θ)/day", value: `-${Math.abs(heatHover.theta).toFixed(4)}`, color: COL.red },
                { label: "Delta (Δ)", value: heatHover.delta.toFixed(3), color: COL.green },
                { label: "Gamma (Γ)", value: heatHover.gamma.toFixed(5), color: "#ff8800" },
                { label: "θ/ν Ratio", value: heatHover.vega > 0 ? (Math.abs(heatHover.theta) / heatHover.vega).toFixed(4) : "—", color: COL.purple },
                { label: "Impl. Vol", value: `${(heatHover.iv * 100).toFixed(1)}%`, color: COL.txt2 },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ color: "#4a5a74", fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{s.label}</div>
                  <div style={{ color: s.color, fontWeight: 600, fontSize: 12 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #1e2d42", paddingTop: 8 }}>
              <div style={{ fontSize: 8, color: "#4a5a74", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Vega / Theta Balance</div>
              <div style={{ height: 5, background: "#1a2332", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                {(() => {
                  const total = heatHover.vega + Math.abs(heatHover.theta);
                  const vegaPct = total > 0 ? (heatHover.vega / total) * 100 : 50;
                  return (
                    <>
                      <div style={{ width: `${vegaPct}%`, background: "linear-gradient(to right, #0077bb, #00e5ff)" }} />
                      <div style={{ flex: 1, background: "linear-gradient(to right, #cc2200, #ff4466)" }} />
                    </>
                  );
                })()}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, marginTop: 3 }}>
                <span style={{ color: "#00e5ff" }}>ν {heatHover.vega.toFixed(4)}</span>
                <span style={{ color: COL.red }}>θ -{Math.abs(heatHover.theta).toFixed(4)}</span>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* Scenario analyzer */}
      <Panel title="Scenario Analyzer" subtitle="What-if IV & time">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block mb-1" style={{ color: COL.txt2 }}>IV Change: <span style={{ color: COL.purple }}>{ivChange > 0 ? "+" : ""}{ivChange}%</span></label>
            <input type="range" min={-50} max={50} value={ivChange} onChange={(e) => setIvChange(Number(e.target.value))} className="w-full" />
            <div className="mt-1 text-[11px]">P&L from Vega: <span style={{ color: vegaPnL >= 0 ? COL.green : COL.red }}>${formatNumber(vegaPnL)}</span></div>
          </div>
          <div>
            <label className="block mb-1" style={{ color: COL.txt2 }}>Days Forward: <span style={{ color: COL.red }}>+{daysFwd}D</span></label>
            <input type="range" min={0} max={30} value={daysFwd} onChange={(e) => setDaysFwd(Number(e.target.value))} className="w-full" />
            <div className="mt-1 text-[11px]">P&L from Theta: <span style={{ color: COL.red }}>${formatNumber(thetaPnL)}</span></div>
          </div>
          <div className="flex flex-col items-center justify-center rounded p-3" style={{ background: COL.bg2, border: `1px solid ${COL.border}` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: COL.txt2 }}>Net P&L</div>
            <div className="text-2xl font-bold font-mono" style={{ color: netPnL >= 0 ? COL.green : COL.red }}>
              {netPnL >= 0 ? "+" : ""}${formatNumber(netPnL)}
            </div>
          </div>
        </div>
      </Panel>

      {/* Vanna / Charm Exposure */}
      <Panel title="Vanna / Charm Exposure" subtitle={`${selectedExpiry}D · dealer convention · per 1% IV / per day`}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <MetricCard title="Net Vanna" value={formatNumber(totalVanna)} subtitle="ΔΔ per +1% IV" color="#00e5ff" icon="∂Δ/∂σ" />
          <MetricCard title="Net Charm" value={formatNumber(totalCharm)} subtitle="ΔΔ per day" color="#ff8800" icon="∂Δ/∂t" />
          <MetricCard title="Peak Vanna Strike" value={`$${peakVanna?.strike ?? 0}`} subtitle={`${formatNumber(peakVanna?.vanna ?? 0)}`} color="#00e5ff" />
          <MetricCard title="Peak Charm Strike" value={`$${peakCharm?.strike ?? 0}`} subtitle={`${formatNumber(peakCharm?.charm ?? 0)}`} color="#ff8800" />
        </div>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={vannaCharmSeries} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke={COL.border} strokeDasharray="2 4" />
              <XAxis dataKey="strike" tick={{ fill: COL.txt2, fontSize: 10 }} />
              <YAxis yAxisId="v" tick={{ fill: "#00e5ff", fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <YAxis yAxisId="c" orientation="right" tick={{ fill: "#ff8800", fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <RTooltip
                contentStyle={{ background: COL.bg2, border: `1px solid ${COL.border}`, fontSize: 11 }}
                formatter={(v: number, name: string) => [formatNumber(v), name === "vanna" ? "Vanna" : "Charm"]}
                labelFormatter={(l) => `Strike $${l}`}
              />
              <ReferenceLine x={Math.round(spot / ticker.strikeStep) * ticker.strikeStep} yAxisId="v" stroke={COL.yellow} strokeDasharray="3 3" label={{ value: `Spot ${spot.toFixed(0)}`, fill: COL.yellow, fontSize: 10, position: "top" }} />
              <ReferenceLine y={0} yAxisId="v" stroke={COL.border} />
              <Bar yAxisId="v" dataKey="vanna" name="Vanna" fill="#00e5ff" opacity={0.7} />
              <Line yAxisId="c" type="monotone" dataKey="charm" name="Charm" stroke="#ff8800" strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]" style={{ color: COL.txt2 }}>
          <div style={{ background: COL.bg2, padding: 8, borderRadius: 4, borderLeft: `3px solid #00e5ff` }}>
            <span style={{ color: "#00e5ff", fontWeight: 700 }}>VANNA</span> · ∂Δ/∂σ — si la IV sube +1%, los dealers ganan/pierden delta. Net positivo ⇒ deben <strong>vender</strong> spot al subir vol (acentúa caídas).
          </div>
          <div style={{ background: COL.bg2, padding: 8, borderRadius: 4, borderLeft: `3px solid #ff8800` }}>
            <span style={{ color: "#ff8800", fontWeight: 700 }}>CHARM</span> · -∂Δ/∂t — flujo de delta hacia 0DTE. Net negativo ⇒ los dealers <strong>compran</strong> spot al pasar el tiempo (típico al cierre / overnight).
          </div>
        </div>
      </Panel>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Panel title="Alerts" subtitle={`${alerts.length} active`}>
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} style={{
                background: a.severity === "high" ? "#ff446622" : "#ffaa0022",
                borderLeft: `4px solid ${a.severity === "high" ? COL.red : COL.yellow}`,
                padding: 10, borderRadius: 4,
              }}>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span>{a.icon}</span>
                  <span>{a.title}</span>
                  <span className="ml-auto text-[10px]" style={{ color: COL.txt3 }}>{a.timestamp}</span>
                </div>
                <div className="text-[11px] mt-1" style={{ color: COL.txt2 }}>{a.message}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {/* Options chain */}
      <Panel title="Options Chain · Greeks" subtitle={`${selectedExpiry}D · IV ${(iv * 100).toFixed(1)}% · Black-Scholes`} noPad>
        {/* ── KPI Summary Bar ── */}
        {(() => {
          const sumCOi  = chainRows.reduce((s, r) => s + r.call.oi, 0);
          const sumPOi  = chainRows.reduce((s, r) => s + r.put.oi, 0);
          const pcr     = sumPOi / Math.max(1, sumCOi);
          const sumCVeg = chainRows.reduce((s, r) => s + r.call.vega  * r.call.oi * 100, 0);
          const sumCTh  = chainRows.reduce((s, r) => s + r.call.theta * r.call.oi * 100, 0);
          const sumPVeg = chainRows.reduce((s, r) => s + r.put.vega   * r.put.oi  * 100, 0);
          const kpis = [
            { label: "Call OI",    value: formatNumber(sumCOi),   color: COL.green  },
            { label: "Put OI",     value: formatNumber(sumPOi),    color: COL.red    },
            { label: "P/C Ratio",  value: pcr.toFixed(2),          color: pcr > 1 ? COL.red : COL.green },
            { label: "ATM IV",     value: `${(iv * 100).toFixed(1)}%`, color: COL.purple },
            { label: "Σ Call ν",   value: formatNumber(sumCVeg),   color: "#00e5ff"  },
            { label: "Σ Put ν",    value: formatNumber(sumPVeg),   color: "#22ccff"  },
            { label: "Σ Call θ",   value: formatNumber(sumCTh),    color: COL.red    },
          ];
          return (
            <div style={{ display: "flex", borderBottom: `1px solid ${COL.border}` }}>
              {kpis.map((k, i) => (
                <div key={k.label} style={{
                  flex: 1, padding: "10px 14px",
                  background: COL.bg2,
                  borderRight: i < kpis.length - 1 ? `1px solid ${COL.border}` : "none",
                }}>
                  <div style={{ color: COL.txt3, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k.label}</div>
                  <div style={{ color: k.color, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{k.value}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${COL.border}` }}>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            {([
              { color: "#00ff8844", border: COL.green,  label: "ITM Call" },
              { color: "#ffdd4422", border: COL.yellow, label: "ATM" },
              { color: "transparent", border: COL.border, label: "OTM" },
            ] as const).map((l) => (
              <div key={l.label} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, border: `1px solid ${l.border}` }} />
                <span style={{ color: COL.txt3, fontSize: 9, fontFamily: "monospace" }}>{l.label}</span>
              </div>
            ))}
          </div>
          <button onClick={exportCSV} style={{
            background: "transparent", color: COL.yellow,
            border: `1px solid ${COL.yellow}50`, borderRadius: 5,
            padding: "4px 12px", fontSize: 10, fontFamily: "monospace", cursor: "pointer",
          }}>⬇ Export CSV</button>
        </div>

        {/* ── Chain Table ── */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px", fontFamily: "monospace", minWidth: 860 }}>
            <thead>
              <tr>
                <th colSpan={6} style={{ padding: "7px 14px", background: `${COL.green}12`, borderTop: `2px solid ${COL.green}50`, borderBottom: `1px solid ${COL.green}25`, color: COL.green, fontSize: 9, letterSpacing: 3, textAlign: "center", fontWeight: 700 }}>
                  CALLS
                </th>
                <th style={{ width: 86, padding: "7px 6px", background: `${COL.yellow}12`, borderTop: `2px solid ${COL.yellow}50`, borderBottom: `1px solid ${COL.yellow}25`, color: COL.yellow, fontSize: 9, letterSpacing: 2, textAlign: "center", fontWeight: 700 }}>
                  STRIKE
                </th>
                <th colSpan={6} style={{ padding: "7px 14px", background: `${COL.red}12`, borderTop: `2px solid ${COL.red}50`, borderBottom: `1px solid ${COL.red}25`, color: COL.red, fontSize: 9, letterSpacing: 3, textAlign: "center", fontWeight: 700 }}>
                  PUTS
                </th>
              </tr>
            </thead>
            <tbody style={{ padding: "0 10px" }}>
              {chainRows.map((row) => {
                const itmCall   = row.strike < spot;
                const rowBg     = row.isATM ? "#ffdd4408" : itmCall ? "#00ff8806" : "transparent";
                const accentCol = row.isATM ? COL.yellow : itmCall ? COL.green : "transparent";
                return (
                  <tr key={row.strike} style={{ background: rowBg }}>
                    {/* ── CALLS ── */}
                    {gTd("BID", row.call.bid.toFixed(2),   COL.txt,                                                                                false, false, accentCol)}
                    {gTd("ASK", row.call.ask.toFixed(2),   COL.txt2)}
                    {gTd("IV",  `${(row.call.iv*100).toFixed(1)}%`, "#9966ff")}
                    {gTd("Δ",   row.call.delta.toFixed(3), row.call.delta > 0.7 ? COL.green : row.call.delta > 0.4 ? "#55bb77" : COL.txt2, row.call.delta > 0.5)}
                    {gTd("ν",   row.call.vega.toFixed(3),  "#00e5ff")}
                    {gTd("θ",   row.call.theta.toFixed(3), "#ff5577")}
                    {/* ── STRIKE ── */}
                    <td style={{ padding: "2px 4px" }}>
                      <div style={{
                        background: row.isATM ? "#ffdd4418" : COL.bg2,
                        border: `1px solid ${row.isATM ? COL.yellow : COL.border}`,
                        borderRadius: 5, padding: "5px 4px", textAlign: "center",
                      }}>
                        <div style={{ color: row.isATM ? COL.yellow : COL.txt, fontWeight: 700, fontSize: 12 }}>{row.strike}</div>
                        <div style={{ fontSize: 7, marginTop: 1, letterSpacing: 1,
                          color: row.isATM ? COL.yellow : itmCall ? COL.green : COL.txt3 }}>
                          {row.isATM ? "ATM" : itmCall ? "ITM" : "OTM"}
                        </div>
                      </div>
                    </td>
                    {/* ── PUTS ── */}
                    {gTd("θ",   row.put.theta.toFixed(3),  "#ff5577")}
                    {gTd("ν",   row.put.vega.toFixed(3),   "#00e5ff")}
                    {gTd("Δ",   row.put.delta.toFixed(3),  Math.abs(row.put.delta) > 0.7 ? COL.red : Math.abs(row.put.delta) > 0.4 ? "#ff7799" : COL.txt2, Math.abs(row.put.delta) > 0.5)}
                    {gTd("IV",  `${(row.put.iv*100).toFixed(1)}%`,  "#9966ff")}
                    {gTd("BID", row.put.bid.toFixed(2),    COL.txt2)}
                    {gTd("ASK", row.put.ask.toFixed(2),    COL.txt, false, false, undefined, accentCol)}
                  </tr>
                );
              })}

              {/* ── Weighted-average row ── */}
              {(() => {
                const tot = chainRows.reduce((acc, r) => {
                  acc.cBid += r.call.bid * r.call.oi; acc.cAsk += r.call.ask * r.call.oi;
                  acc.cIv  += r.call.iv  * r.call.oi; acc.cOi  += r.call.oi;
                  acc.cDelta += r.call.delta * r.call.oi; acc.cVega += r.call.vega * r.call.oi;
                  acc.cTheta += r.call.theta * r.call.oi;
                  acc.pBid += r.put.bid * r.put.oi; acc.pAsk += r.put.ask * r.put.oi;
                  acc.pIv  += r.put.iv  * r.put.oi; acc.pOi  += r.put.oi;
                  acc.pDelta += r.put.delta * r.put.oi; acc.pVega += r.put.vega * r.put.oi;
                  acc.pTheta += r.put.theta * r.put.oi;
                  return acc;
                }, { cBid:0, cAsk:0, cIv:0, cOi:0, cDelta:0, cVega:0, cTheta:0, pBid:0, pAsk:0, pIv:0, pOi:0, pDelta:0, pVega:0, pTheta:0 });
                const cW = Math.max(1, tot.cOi);
                const pW = Math.max(1, tot.pOi);
                return (
                  <tr style={{ opacity: 0.75 }}>
                    {gTd("BID",  (tot.cBid/cW).toFixed(2),              COL.txt,    false, true)}
                    {gTd("ASK",  (tot.cAsk/cW).toFixed(2),              COL.txt2,   false, true)}
                    {gTd("IV",   `${((tot.cIv/cW)*100).toFixed(1)}%`,   "#9966ff",  false, true)}
                    {gTd("Δ",    (tot.cDelta/cW).toFixed(3),            COL.green,  false, true)}
                    {gTd("ν",    (tot.cVega/cW).toFixed(3),             "#00e5ff",  false, true)}
                    {gTd("θ",    (tot.cTheta/cW).toFixed(3),            "#ff5577",  false, true)}
                    <td style={{ padding: "2px 4px" }}>
                      <div style={{ background: "#ffdd4410", border: `1px solid ${COL.yellow}30`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                        <div style={{ color: COL.yellow, fontWeight: 700, fontSize: 8, letterSpacing: 1 }}>WGT AVG</div>
                      </div>
                    </td>
                    {gTd("θ",    (tot.pTheta/pW).toFixed(3),            "#ff5577",  false, true)}
                    {gTd("ν",    (tot.pVega/pW).toFixed(3),             "#00e5ff",  false, true)}
                    {gTd("Δ",    (tot.pDelta/pW).toFixed(3),            COL.red,    false, true)}
                    {gTd("IV",   `${((tot.pIv/pW)*100).toFixed(1)}%`,   "#9966ff",  false, true)}
                    {gTd("BID",  (tot.pBid/pW).toFixed(2),              COL.txt2,   false, true)}
                    {gTd("ASK",  (tot.pAsk/pW).toFixed(2),              COL.txt,    false, true)}
                  </tr>
                );
              })()}
            </tbody>

            {/* ── Footer totals ── */}
            <tfoot>
              {(() => {
                const sum = chainRows.reduce((acc, r) => {
                  acc.cVol   += r.call.volume; acc.cOi   += r.call.oi;
                  acc.pVol   += r.put.volume;  acc.pOi   += r.put.oi;
                  acc.cVegaT += r.call.vega  * r.call.oi * 100;
                  acc.cThetT += r.call.theta * r.call.oi * 100;
                  acc.pVegaT += r.put.vega   * r.put.oi  * 100;
                  acc.pThetT += r.put.theta  * r.put.oi  * 100;
                  return acc;
                }, { cVol:0, cOi:0, pVol:0, pOi:0, cVegaT:0, cThetT:0, pVegaT:0, pThetT:0 });
                return (
                  <tr>
                    <td colSpan={6} style={{ padding: "10px 14px" }}>
                      <div style={{ background: `${COL.green}0d`, border: `1px solid ${COL.green}22`, borderRadius: 7, padding: "10px 14px" }}>
                        <div style={{ fontSize: 8, color: COL.green, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>CALLS TOTALS</div>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                          {[
                            { label: "Open Interest", value: formatNumber(sum.cOi),    color: COL.green  },
                            { label: "Volume",         value: formatNumber(sum.cVol),   color: COL.green  },
                            { label: "Σ Vega (ν)",     value: formatNumber(sum.cVegaT), color: "#00e5ff"  },
                            { label: "Σ Theta (θ)",    value: formatNumber(sum.cThetT), color: "#ff5577"  },
                          ].map((s) => (
                            <div key={s.label}>
                              <div style={{ color: "#4a5a74", fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                              <div style={{ color: s.color, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      <div style={{ background: "#ffdd4408", border: `1px solid ${COL.yellow}22`, borderRadius: 7, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}>
                        <span style={{ color: COL.yellow, fontSize: 7, letterSpacing: 1, fontFamily: "monospace", textTransform: "uppercase", writingMode: "vertical-rl" }}>TOTALS</span>
                      </div>
                    </td>
                    <td colSpan={6} style={{ padding: "10px 14px" }}>
                      <div style={{ background: `${COL.red}0d`, border: `1px solid ${COL.red}22`, borderRadius: 7, padding: "10px 14px" }}>
                        <div style={{ fontSize: 8, color: COL.red, fontWeight: 700, letterSpacing: 2, marginBottom: 8 }}>PUTS TOTALS</div>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {[
                            { label: "Σ Theta (θ)",    value: formatNumber(sum.pThetT), color: "#ff5577"  },
                            { label: "Σ Vega (ν)",      value: formatNumber(sum.pVegaT), color: "#00e5ff"  },
                            { label: "Volume",          value: formatNumber(sum.pVol),   color: COL.red    },
                            { label: "Open Interest",   value: formatNumber(sum.pOi),    color: COL.red    },
                          ].map((s) => (
                            <div key={s.label} style={{ textAlign: "right" }}>
                              <div style={{ color: "#4a5a74", fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                              <div style={{ color: s.color, fontWeight: 700, fontSize: 13, fontFamily: "monospace" }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function MetricCard({ title, value, subtitle, color, icon, gauge }: {
  title: string; value: string; subtitle: string; color: string; icon?: string; gauge?: number;
}) {
  return (
    <div style={{ background: COL.bg2, padding: 14, borderRadius: 8, border: `1px solid ${color}33`, position: "relative" }}>
      {icon && <div style={{ position: "absolute", top: 10, right: 12, fontSize: 22, color, opacity: 0.35 }}>{icon}</div>}
      <div style={{ fontSize: 10, color: COL.txt3, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 10, color: COL.txt2 }}>{subtitle}</div>
      {gauge !== undefined && (
        <div style={{ marginTop: 8, height: 4, background: "#2a3444", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${gauge}%`, height: "100%", background: color, transition: "width 0.3s" }} />
        </div>
      )}
    </div>
  );
}

// Renders a single greek card cell inside the Options Chain table
function gTd(
  label: string, value: string, color: string,
  bold = false, dim = false,
  accentLeft?: string, accentRight?: string,
) {
  return (
    <td style={{ padding: "2px 3px" }}>
      <div style={{
        background: dim ? "#ffffff04" : "#0d1828",
        border: "1px solid #1a2b40",
        borderRadius: 5,
        padding: "5px 7px",
        textAlign: "center",
        minWidth: 54,
        ...(accentLeft  ? { borderLeft:  `2px solid ${accentLeft}`  } : {}),
        ...(accentRight ? { borderRight: `2px solid ${accentRight}` } : {}),
      }}>
        <div style={{ color: "#3a4e68", fontSize: 7, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3, fontFamily: "monospace" }}>{label}</div>
        <div style={{ color, fontWeight: bold ? 700 : 500, fontSize: 11, fontFamily: "monospace" }}>{value}</div>
      </div>
    </td>
  );
}
