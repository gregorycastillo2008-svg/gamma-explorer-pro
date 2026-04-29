import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, Legend, BarChart, Bar, ComposedChart } from "recharts";
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
    const out: any[] = [];
    for (let day = 0; day <= days; day++) {
      const Tt = Math.max(0.001, (days - day) / 365);
      out.push({
        daysLeft: days - day,
        atm: bsCall(spot, atmK, Tt, r, iv),
        itm: bsCall(spot, itmK, Tt, r, iv),
        otm: bsCall(spot, otmK, Tt, r, iv),
      });
    }
    return out;
  }, [selectedExpiry, spot, iv, ticker.strikeStep]);

  // ─── Heatmap (vega/theta toggle)
  const [showVega, setShowVega] = useState(true);
  const heatmap = useMemo(() => {
    const dtes = [7, 14, 30, 60, 90, 180];
    const step = ticker.strikeStep;
    const strikes: number[] = [];
    const lo = Math.round((spot * 0.92) / step) * step;
    const hi = Math.round((spot * 1.08) / step) * step;
    for (let K = lo; K <= hi; K += step) strikes.push(K);
    const rows = strikes.map((K) =>
      dtes.map((dte) => {
        const Tt = dte / 365;
        return { strike: K, dte, value: showVega ? vega(spot, K, Tt, r, iv) : thetaCall(spot, K, Tt, r, iv) };
      })
    );
    return { dtes, strikes, rows };
  }, [showVega, spot, iv, ticker.strikeStep]);

  function heatColor(v: number, isVega: boolean) {
    if (isVega) {
      const intensity = Math.min(Math.abs(v) / 1.2, 1);
      return `hsl(${240 - intensity * 240}, 80%, ${20 + intensity * 30}%)`;
    } else {
      const intensity = Math.min(Math.abs(v) / 0.5, 1);
      return `hsl(${120 - intensity * 120}, 80%, ${20 + intensity * 30}%)`;
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
        <Panel title="Theta Decay Timeline" subtitle="ATM · ITM · OTM calls">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={decaySeries} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={COL.border} strokeDasharray="2 4" />
                <XAxis dataKey="daysLeft" reversed tick={{ fill: COL.txt2, fontSize: 10 }} label={{ value: "Days left", fill: COL.txt3, fontSize: 10, position: "insideBottom", dy: 10 }} />
                <YAxis tick={{ fill: COL.txt2, fontSize: 10 }} />
                <RTooltip contentStyle={{ background: COL.bg2, border: `1px solid ${COL.border}`, fontSize: 11 }} />
                <ReferenceLine x={selectedExpiry} stroke={COL.yellow} strokeDasharray="3 3" label={{ value: "TODAY", fill: COL.yellow, fontSize: 10 }} />
                <Line type="monotone" dataKey="atm" stroke={COL.yellow} strokeWidth={2} dot={false} name="ATM" />
                <Line type="monotone" dataKey="itm" stroke={COL.green} strokeWidth={2} dot={false} name="ITM" />
                <Line type="monotone" dataKey="otm" stroke={COL.red} strokeWidth={2} dot={false} name="OTM" />
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </LineChart>
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
      <Panel title={`${showVega ? "Vega" : "Theta"} Heatmap`} subtitle="Strike × DTE">
        <div className="flex justify-end mb-2">
          <button onClick={() => setShowVega((v) => !v)} className="text-[10px] font-mono px-2 py-1 rounded"
            style={{ background: COL.bg2, color: COL.txt, border: `1px solid ${COL.border}` }}>
            Toggle → {showVega ? "THETA" : "VEGA"}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="font-mono text-[9px]" style={{ borderCollapse: "separate", borderSpacing: 1 }}>
            <thead>
              <tr>
                <th className="px-2 py-1" style={{ color: COL.txt2 }}>Strike</th>
                {heatmap.dtes.map((d) => <th key={d} className="px-2 py-1" style={{ color: COL.txt2, minWidth: 60 }}>{d}D</th>)}
              </tr>
            </thead>
            <tbody>
              {heatmap.rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-bold text-right" style={{ color: COL.txt }}>{row[0].strike}</td>
                  {row.map((cell, j) => (
                    <td key={j} title={`${cell.strike} · ${cell.dte}D = ${cell.value.toFixed(4)}`}
                      className="text-center" style={{ background: heatColor(cell.value, showVega), color: "#fff", padding: "4px 6px" }}>
                      {cell.value.toFixed(3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      {/* Options chain — moved to bottom */}
      <Panel title="Options Chain · Greeks" subtitle={`${selectedExpiry}D · IV ${(iv * 100).toFixed(1)}%`} noPad>
        <div className="flex justify-end px-3 py-1 border-b" style={{ borderColor: COL.border }}>
          <button onClick={exportCSV} className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: COL.bg2, color: COL.yellow, border: `1px solid ${COL.border}` }}>
            ⬇ CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="text-[10px] font-mono w-full" style={{ color: COL.txt }}>
            <thead style={{ background: COL.bg2, color: COL.txt2 }}>
              <tr className="text-[9px] tracking-widest">
                <th colSpan={6} className="px-2 py-1.5 text-center" style={{ color: COL.green }}>CALLS</th>
                <th className="px-2 py-1.5 text-center" style={{ color: COL.yellow }}>STRIKE</th>
                <th colSpan={6} className="px-2 py-1.5 text-center" style={{ color: COL.red }}>PUTS</th>
              </tr>
              <tr className="text-[9px]">
                <th className="px-1.5 py-1">BID</th><th>ASK</th><th>IV</th><th>Δ</th><th>ν</th><th>θ</th>
                <th></th>
                <th>θ</th><th>ν</th><th>Δ</th><th>IV</th><th>BID</th><th className="px-1.5">ASK</th>
              </tr>
            </thead>
            <tbody>
              {chainRows.map((row) => {
                const itmCall = row.strike < spot;
                const bg = row.isATM ? "#ffdd4422" : itmCall ? "#00ff8811" : "#ff446611";
                return (
                  <tr key={row.strike} style={{ background: bg }} className="hover:opacity-90">
                    <td className="px-1.5 py-1 text-right">{row.call.bid.toFixed(2)}</td>
                    <td className="text-right">{row.call.ask.toFixed(2)}</td>
                    <td className="text-right" style={{ color: COL.txt2 }}>{(row.call.iv * 100).toFixed(1)}%</td>
                    <td className="text-right" style={{ color: row.call.delta > 0.5 ? COL.green : COL.txt2, fontWeight: row.call.delta > 0.7 ? 700 : 400 }}>{row.call.delta.toFixed(3)}</td>
                    <td className="text-right" style={{ color: row.call.vega > 0.5 ? COL.green : COL.yellow }}>{row.call.vega.toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.red }}>{row.call.theta.toFixed(3)}</td>
                    <td className="px-2 text-center font-bold" style={{ color: row.isATM ? COL.yellow : COL.txt }}>{row.strike}</td>
                    <td className="text-right" style={{ color: COL.red }}>{row.put.theta.toFixed(3)}</td>
                    <td className="text-right" style={{ color: row.put.vega > 0.5 ? COL.green : COL.yellow }}>{row.put.vega.toFixed(3)}</td>
                    <td className="text-right" style={{ color: row.put.delta < -0.5 ? COL.red : COL.txt2, fontWeight: row.put.delta < -0.7 ? 700 : 400 }}>{row.put.delta.toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.txt2 }}>{(row.put.iv * 100).toFixed(1)}%</td>
                    <td className="text-right">{row.put.bid.toFixed(2)}</td>
                    <td className="px-1.5 text-right">{row.put.ask.toFixed(2)}</td>
                  </tr>
                );
              })}
              {(() => {
                const tot = chainRows.reduce((acc, r) => {
                  acc.cBid += r.call.bid * r.call.oi; acc.cAsk += r.call.ask * r.call.oi; acc.cIv += r.call.iv * r.call.oi; acc.cOi += r.call.oi;
                  acc.cDelta += r.call.delta * r.call.oi; acc.cVega += r.call.vega * r.call.oi; acc.cTheta += r.call.theta * r.call.oi;
                  acc.pBid += r.put.bid * r.put.oi; acc.pAsk += r.put.ask * r.put.oi; acc.pIv += r.put.iv * r.put.oi; acc.pOi += r.put.oi;
                  acc.pDelta += r.put.delta * r.put.oi; acc.pVega += r.put.vega * r.put.oi; acc.pTheta += r.put.theta * r.put.oi;
                  return acc;
                }, { cBid: 0, cAsk: 0, cIv: 0, cOi: 0, cDelta: 0, cVega: 0, cTheta: 0, pBid: 0, pAsk: 0, pIv: 0, pOi: 0, pDelta: 0, pVega: 0, pTheta: 0 });
                const cW = Math.max(1, tot.cOi);
                const pW = Math.max(1, tot.pOi);
                return (
                  <tr style={{ background: "#ffffff10", borderTop: `2px solid ${COL.yellow}`, fontWeight: 700 }}>
                    <td className="px-1.5 py-1.5 text-right">{(tot.cBid / cW).toFixed(2)}</td>
                    <td className="text-right">{(tot.cAsk / cW).toFixed(2)}</td>
                    <td className="text-right" style={{ color: COL.txt2 }}>{((tot.cIv / cW) * 100).toFixed(1)}%</td>
                    <td className="text-right" style={{ color: COL.green }}>{(tot.cDelta / cW).toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.green }}>{(tot.cVega / cW).toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.red }}>{(tot.cTheta / cW).toFixed(3)}</td>
                    <td className="px-2 text-center" style={{ color: COL.yellow }}>TOTAL</td>
                    <td className="text-right" style={{ color: COL.red }}>{(tot.pTheta / pW).toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.green }}>{(tot.pVega / pW).toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.red }}>{(tot.pDelta / pW).toFixed(3)}</td>
                    <td className="text-right" style={{ color: COL.txt2 }}>{((tot.pIv / pW) * 100).toFixed(1)}%</td>
                    <td className="text-right">{(tot.pBid / pW).toFixed(2)}</td>
                    <td className="px-1.5 text-right">{(tot.pAsk / pW).toFixed(2)}</td>
                  </tr>
                );
              })()}
            </tbody>
            <tfoot>
              {(() => {
                const sum = chainRows.reduce((acc, r) => {
                  acc.cVol += r.call.volume; acc.cOi += r.call.oi; acc.pVol += r.put.volume; acc.pOi += r.put.oi;
                  acc.cVegaT += r.call.vega * r.call.oi * 100; acc.cThetaT += r.call.theta * r.call.oi * 100;
                  acc.pVegaT += r.put.vega * r.put.oi * 100; acc.pThetaT += r.put.theta * r.put.oi * 100;
                  return acc;
                }, { cVol: 0, cOi: 0, pVol: 0, pOi: 0, cVegaT: 0, cThetaT: 0, pVegaT: 0, pThetaT: 0 });
                return (
                  <tr style={{ background: COL.bg2, color: COL.txt2 }} className="text-[9px]">
                    <td colSpan={6} className="px-2 py-1.5 text-center" style={{ color: COL.green }}>
                      OI {formatNumber(sum.cOi)} · VOL {formatNumber(sum.cVol)} · ΣΝ {formatNumber(sum.cVegaT)} · ΣΘ {formatNumber(sum.cThetaT)}
                    </td>
                    <td className="text-center" style={{ color: COL.yellow }}>SUM</td>
                    <td colSpan={6} className="px-2 py-1.5 text-center" style={{ color: COL.red }}>
                      ΣΘ {formatNumber(sum.pThetaT)} · ΣΝ {formatNumber(sum.pVegaT)} · OI {formatNumber(sum.pOi)} · VOL {formatNumber(sum.pVol)}
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
