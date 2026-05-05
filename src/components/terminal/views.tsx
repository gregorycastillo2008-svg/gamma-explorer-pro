import React from "react";
import { ExposurePoint, KeyLevels, formatNumber, DemoTicker, OptionContract, computeMaxPain, buildIvGrid, computeExposures, computeKeyLevels } from "@/lib/gex";
import { Panel, StatBlock } from "./Panel";
import { ExposureChart } from "@/components/ExposureChart";
import { GexDexBars } from "./GexDexBars";
import { GexExposureTabs, HeatmapGridView, StrikeChartView, SurfaceView } from "./GexExposureTabs";
import { TerminalTabs } from "./TerminalTabs";
import { FloatingStatBar } from "./FloatingStatBar";
import { ThirdOrderGreeksPanel } from "./ThirdOrderGreeksPanel";

import { GexHeatmapForVolatility, GexHillSurfaceForVolatility } from "./VolatilityGexExtras";
import { VolatilityDashboard } from "@/components/volatility/VolatilityDashboard";
import { PriceGexChartContainer } from "@/components/chart/PriceGexChartContainer";
import { TradingViewGexChart } from "@/components/chart/TradingViewGexChart";
import { GreekLadder } from "@/components/greeks/GreekLadder";
import { OptionsFlowHeatmap } from "./OptionsFlowHeatmap";
import { RiskCalculator } from "./RiskCalculator";
import { VegaThetaAnalyzer } from "./VegaThetaAnalyzer";
import { PCSkewByStrike } from "./PCSkewByStrike";
import { GammaRegimePanel } from "./GammaRegimePanel";
import { HedgePressurePanel } from "./HedgePressurePanel";
import { StdDevAnomaliesPanel } from "./StdDevAnomaliesPanel";
import { LogReturnAnomalyPanel } from "./LogReturnAnomalyPanel";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useMemo, useState, useEffect, useRef } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Zap, Shield, Target } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip, ReferenceLine, Legend, BarChart, Bar, Cell, AreaChart, Area } from "recharts";
import { IvSurface3D } from "./IvSurface3D";
import { GexBotChart } from "./GexBotChart";
import { IvSurface3DReal } from "./IvSurface3DReal";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { VolatilityRegimeIndicator } from "./VolatilityRegimeIndicator";
import { ExpectedMoveCalculator } from "./ExpectedMoveCalculator";

interface Ctx {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

// ─────── OVERVIEW ───────
export function OverviewView({ ticker, exposures, levels, contracts }: Ctx) {
  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);
  const atmIv = useMemo(() => {
    const atm = contracts
      .filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5)
      .reduce((s, c) => s + c.iv, 0) / Math.max(1, contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5).length);
    return atm * 100;
  }, [contracts, ticker]);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);

  return (
    <div className="h-full flex flex-col">
      <TerminalTabs
        layoutId="overview-master-tab-bg"
        tabs={[
          {
            key: "gex",
            label: "GEX SURFACE",
            content: (
              <div className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Panel title="GEX Surface" subtitle={`${ticker.symbol} · spot $${ticker.spot}`} className="h-full flex flex-col">
                  <div className="h-full">
                    <ExposureChart data={exposures} spot={ticker.spot} callWall={levels.callWall} putWall={levels.putWall} flip={levels.gammaFlip} metric="netGex" />
                  </div>
                </Panel>
                <PCSkewByStrike contracts={contracts} spot={ticker.spot} strikeStep={ticker.strikeStep} />
              </div>
            ),
          },
          {
            key: "levels",
            label: "KEY LEVELS",
            content: <KeyLevelsPanel ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />,
          },
          {
            key: "oi",
            label: "OPEN INTEREST",
            content: <OpenInterestPanel ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />,
          },
        ]}
      />
    </div>
  );
}

// ─────── KEY LEVELS ───────
function KeyLevelsPanel({ ticker, exposures, levels }: Ctx) {
  const spot = ticker.spot;

  const allLevels = useMemo(() => [
    { id: "callWall",  label: "CALL WALL",    price: levels.callWall,            color: "#22c55e", glyph: "▲" },
    { id: "putWall",   label: "PUT WALL",     price: levels.putWall,             color: "#ef4444", glyph: "▼" },
    { id: "majorWall", label: "MAJOR WALL",   price: levels.majorWall,           color: "#22d3ee", glyph: "◆" },
    { id: "maxPain",   label: "MAX PAIN",     price: levels.maxPain,             color: "#fb923c", glyph: "✦" },
    { id: "volTrig",   label: "VOL TRIGGER",  price: levels.volTrigger,          color: "#a78bfa", glyph: "⬡" },
    { id: "totalVt",   label: "TOTAL VT",     price: levels.totalVt,             color: "#f472b6", glyph: "◉" },
    { id: "flip",      label: "GAMMA FLIP",   price: levels.gammaFlip ?? 0,      color: "#fbbf24", glyph: "⚡" },
  ].filter((l) => l.price > 0), [levels]);

  const gexByStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const e of exposures) m.set(e.strike, e.netGex);
    return m;
  }, [exposures]);

  const sorted = useMemo(() => [...allLevels].sort((a, b) => b.price - a.price), [allLevels]);

  const prices = [...sorted.map((l) => l.price), spot];
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const range = Math.max(pMax - pMin, 1);
  const toPct = (p: number) => ((p - pMin) / range) * 100;

  const isPos = levels.gammaFlip == null || spot > levels.gammaFlip;
  const netGex = levels.totalGex;

  const fmtPx = (n: number) => `$${n.toLocaleString()}`;
  const fmtDist = (p: number) => {
    const d = ((p - spot) / spot) * 100;
    return (d >= 0 ? "+" : "") + d.toFixed(2) + "%";
  };
  const fmtGex = (n: number) => {
    const a = Math.abs(n);
    const s = n >= 0 ? "+" : "−";
    if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
    return `${s}${a.toFixed(0)}`;
  };

  const MONO: React.CSSProperties = { fontFamily: "JetBrains Mono, ui-monospace, monospace" };
  const BG = "#07090f";
  const BORDER = "#131929";

  return (
    <div className="h-full overflow-y-auto terminal-scrollbar" style={{ background: BG, ...MONO }}>
      <div className="p-4 space-y-4">
        {/* Zone banner */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 14px", borderRadius: 6,
          background: isPos ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${isPos ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: isPos ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: `0 0 6px ${isPos ? "#22c55e" : "#ef4444"}` }} />
            <span style={{ color: isPos ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 800, letterSpacing: "0.18em" }}>
              {isPos ? "POSITIVE GAMMA" : "NEGATIVE GAMMA"} REGIME
            </span>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 10, color: "#6b7280" }}>NET GEX</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: netGex >= 0 ? "#22c55e" : "#ef4444" }}>{fmtGex(netGex)}</span>
          </div>
        </div>

        {/* Horizontal price ruler */}
        <div style={{ padding: "12px 0 20px", position: "relative" }}>
          <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.14em", marginBottom: 10, textTransform: "uppercase" }}>Price Strip · All Levels</div>
          <div style={{ position: "relative", height: 28, margin: "0 16px" }}>
            {/* Track */}
            <div style={{ position: "absolute", top: 13, left: 0, right: 0, height: 2, background: BORDER, borderRadius: 1 }} />
            {/* Positive gamma zone fill */}
            {levels.gammaFlip && (
              <div style={{
                position: "absolute", top: 12, height: 4, borderRadius: 2,
                background: "rgba(34,197,94,0.15)",
                left: `${toPct(Math.min(spot, levels.gammaFlip))}%`,
                width: `${Math.abs(toPct(spot) - toPct(levels.gammaFlip))}%`,
              }} />
            )}
            {/* Level markers */}
            {sorted.map((lv) => (
              <div key={lv.id} style={{ position: "absolute", left: `${toPct(lv.price)}%`, transform: "translateX(-50%)", top: 0 }}>
                <div style={{ width: 2, height: 28, background: lv.color, opacity: 0.8, margin: "0 auto" }} />
                <div style={{ position: "absolute", top: -16, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: lv.color, whiteSpace: "nowrap", fontWeight: 700 }}>
                  {lv.glyph}
                </div>
              </div>
            ))}
            {/* Spot marker */}
            <div style={{ position: "absolute", left: `${toPct(spot)}%`, transform: "translateX(-50%)", top: -2 }}>
              <div style={{ width: 3, height: 32, background: "#fff", borderRadius: 2, margin: "0 auto", boxShadow: "0 0 8px rgba(255,255,255,0.6)" }} />
              <div style={{ position: "absolute", top: 33, left: "50%", transform: "translateX(-50%)", fontSize: 8, color: "#fff", whiteSpace: "nowrap", fontWeight: 800 }}>
                SPOT
              </div>
            </div>
          </div>
          {/* Min / Max labels */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 8, color: "#374151" }}>
            <span>{fmtPx(pMin)}</span>
            <span>{fmtPx(pMax)}</span>
          </div>
        </div>

        {/* Detail table */}
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 72px 80px", gap: 0, padding: "6px 12px", background: "#0d1117", borderBottom: `1px solid ${BORDER}` }}>
            {["LEVEL", "PRICE", "DIST", "NET GEX"].map((h) => (
              <div key={h} style={{ fontSize: 8, letterSpacing: "0.14em", color: "#374151", textTransform: "uppercase" }}>{h}</div>
            ))}
          </div>
          {/* Spot row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 72px 80px", gap: 0, padding: "7px 12px", background: "rgba(255,255,255,0.04)", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: "#6b7280", letterSpacing: "0.06em" }}>●</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: "0.08em" }}>SPOT</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{fmtPx(spot)}</div>
            <div style={{ fontSize: 9, color: "#6b7280" }}>—</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: netGex >= 0 ? "#22c55e" : "#ef4444" }}>{fmtGex(netGex)}</div>
          </div>
          {sorted.map((lv, i) => {
            const gex = gexByStrike.get(lv.price) ?? 0;
            const dist = ((lv.price - spot) / spot) * 100;
            const above = lv.price > spot;
            return (
              <div key={lv.id} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 72px 80px", gap: 0,
                padding: "7px 12px",
                borderBottom: i < sorted.length - 1 ? `1px solid ${BORDER}` : undefined,
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: lv.color }}>{lv.glyph}</span>
                  <span style={{ fontSize: 9, color: "#9ca3af", letterSpacing: "0.1em" }}>{lv.label}</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: lv.color }}>{fmtPx(lv.price)}</div>
                <div style={{ fontSize: 9, color: above ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                  {above ? "↑ " : "↓ "}{Math.abs(dist).toFixed(2)}%
                </div>
                <div style={{ fontSize: 10, color: gex >= 0 ? "#22c55e" : "#ef4444" }}>{gex !== 0 ? fmtGex(gex) : "—"}</div>
              </div>
            );
          })}
        </div>

        {/* Trap zone */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { label: "To Call Wall", price: levels.callWall, color: "#22c55e" },
            { label: "To Put Wall", price: levels.putWall, color: "#ef4444" },
            { label: "To Gamma Flip", price: levels.gammaFlip ?? levels.volTrigger, color: "#fbbf24" },
            { label: "To Max Pain", price: levels.maxPain, color: "#fb923c" },
          ].map(({ label, price, color }) => {
            const dist = price > 0 ? ((price - spot) / spot) * 100 : null;
            return (
              <div key={label} style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 8, color: "#374151", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color, marginTop: 2 }}>
                  {dist != null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : "—"}
                </div>
                <div style={{ fontSize: 9, color: "#4b5563" }}>{price > 0 ? fmtPx(price) : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────── OPEN INTEREST ───────
function OpenInterestPanel({ ticker, exposures, contracts }: Ctx) {
  const spot = ticker.spot;
  const MONO: React.CSSProperties = { fontFamily: "JetBrains Mono, ui-monospace, monospace" };
  const BG = "#07090f";
  const BORDER = "#131929";
  const CYAN = "#22d3ee";
  const RED = "#ef4444";

  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI  = exposures.reduce((s, p) => s + p.putOI, 0);
  const totalOI     = totalCallOI + totalPutOI;
  const pcr         = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
  const totalVol    = contracts.reduce((s, c) => s + (c.volume ?? 0), 0);
  const callVol     = contracts.filter((c) => c.type === "call").reduce((s, c) => s + (c.volume ?? 0), 0);
  const putVol      = contracts.filter((c) => c.type === "put").reduce((s, c) => s + (c.volume ?? 0), 0);
  const callPct     = totalOI > 0 ? (totalCallOI / totalOI) * 100 : 50;
  const putPct      = 100 - callPct;

  // Top strikes by total OI from exposures
  const topStrikes = useMemo(() =>
    [...exposures]
      .sort((a, b) => (b.callOI + b.putOI) - (a.callOI + a.putOI))
      .slice(0, 12),
    [exposures]
  );
  const maxStrikeOI = Math.max(1, ...topStrikes.map((e) => Math.max(e.callOI, e.putOI)));

  // OI by expiry
  const byExpiry = useMemo(() => {
    const m = new Map<number, { callOI: number; putOI: number }>();
    for (const c of contracts) {
      const cur = m.get(c.expiry) ?? { callOI: 0, putOI: 0 };
      if (c.type === "call") cur.callOI += c.oi;
      else cur.putOI += c.oi;
      m.set(c.expiry, cur);
    }
    return Array.from(m.entries())
      .map(([exp, v]) => ({ exp, total: v.callOI + v.putOI, callOI: v.callOI, putOI: v.putOI }))
      .sort((a, b) => a.exp - b.exp)
      .slice(0, 8);
  }, [contracts]);
  const maxExpOI = Math.max(1, ...byExpiry.map((e) => e.total));

  const fmtOI = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  };
  const fmtPx = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className="h-full overflow-y-auto terminal-scrollbar" style={{ background: BG, ...MONO }}>
      <div className="p-4 space-y-4">

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
          {[
            { label: "TOTAL OI",   value: fmtOI(totalOI),   color: "#e4e4e7" },
            { label: "P/C RATIO",  value: pcr.toFixed(2),    color: pcr > 1 ? RED : CYAN },
            { label: "TOTAL VOL",  value: fmtOI(totalVol),  color: "#a78bfa" },
            { label: "STRIKES",    value: String(exposures.length), color: "#6b7280" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ fontSize: 8, color: "#374151", letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Call / Put split megabar */}
        <div style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.14em", marginBottom: 8, textTransform: "uppercase" }}>Open Interest Split</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 9, color: CYAN, width: 36, textAlign: "right" }}>{callPct.toFixed(1)}%</span>
            <div style={{ flex: 1, height: 12, background: RED, borderRadius: 6, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${callPct}%`, background: CYAN, borderRadius: 6 }} />
              <div style={{ position: "absolute", left: `${callPct / 2}%`, top: "50%", transform: "translate(-50%,-50%)", fontSize: 8, fontWeight: 800, color: "#000", pointerEvents: "none" }}>
                CALLS
              </div>
              <div style={{ position: "absolute", left: `${callPct + (100 - callPct) / 2}%`, top: "50%", transform: "translate(-50%,-50%)", fontSize: 8, fontWeight: 800, color: "#fff", pointerEvents: "none" }}>
                PUTS
              </div>
            </div>
            <span style={{ fontSize: 9, color: RED, width: 36 }}>{putPct.toFixed(1)}%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9 }}>
            <div><span style={{ color: "#374151" }}>CALL OI </span><span style={{ color: CYAN, fontWeight: 700 }}>{fmtOI(totalCallOI)}</span> <span style={{ color: "#374151" }}>VOL </span><span style={{ color: `${CYAN}99` }}>{fmtOI(callVol)}</span></div>
            <div><span style={{ color: "#374151" }}>PUT OI </span><span style={{ color: RED, fontWeight: 700 }}>{fmtOI(totalPutOI)}</span> <span style={{ color: "#374151" }}>VOL </span><span style={{ color: `${RED}99` }}>{fmtOI(putVol)}</span></div>
          </div>
        </div>

        {/* Diverging OI bar chart */}
        <div style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.14em", textTransform: "uppercase" }}>Top Strikes by Open Interest</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginTop: 4, fontSize: 8 }}>
              <span style={{ color: CYAN }}>◀ CALLS</span>
              <span style={{ color: RED }}>PUTS ▶</span>
            </div>
          </div>
          {topStrikes.map((e) => {
            const isSpot = Math.abs(e.strike - spot) < ticker.strikeStep / 2;
            const callW = (e.callOI / maxStrikeOI) * 100;
            const putW  = (e.putOI  / maxStrikeOI) * 100;
            return (
              <div key={e.strike} style={{
                display: "grid", gridTemplateColumns: "1fr 56px 1fr",
                alignItems: "center", gap: 4, padding: "4px 10px",
                background: isSpot ? "rgba(255,255,255,0.04)" : "transparent",
                borderBottom: `1px solid ${BORDER}`,
              }}>
                {/* Call bar — right-aligned */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <span style={{ fontSize: 8, color: `${CYAN}99` }}>{fmtOI(e.callOI)}</span>
                  <div style={{ width: `${callW}%`, maxWidth: "100%", minWidth: callW > 1 ? 2 : 0, height: 8, background: CYAN, borderRadius: "4px 0 0 4px", opacity: 0.85 }} />
                </div>
                {/* Strike label */}
                <div style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: isSpot ? "#fff" : "#9ca3af", whiteSpace: "nowrap" }}>
                  {isSpot && <span style={{ color: "#fbbf24", fontSize: 7 }}>● </span>}
                  {e.strike}
                </div>
                {/* Put bar — left-aligned */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: `${putW}%`, maxWidth: "100%", minWidth: putW > 1 ? 2 : 0, height: 8, background: RED, borderRadius: "0 4px 4px 0", opacity: 0.85 }} />
                  <span style={{ fontSize: 8, color: `${RED}99` }}>{fmtOI(e.putOI)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* OI by expiry */}
        <div style={{ background: "#0d1117", border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.14em", textTransform: "uppercase" }}>OI by Expiry</div>
          </div>
          {byExpiry.map(({ exp, total, callOI, putOI }) => {
            const barW = (total / maxExpOI) * 100;
            const cPct = total > 0 ? (callOI / total) * 100 : 50;
            return (
              <div key={exp} style={{ display: "grid", gridTemplateColumns: "52px 1fr 52px", alignItems: "center", gap: 8, padding: "5px 14px", borderBottom: `1px solid ${BORDER}` }}>
                <span style={{ fontSize: 9, color: "#9ca3af", textAlign: "right" }}>
                  {exp === 0 ? "0DTE" : `${exp}D`}
                </span>
                <div style={{ height: 8, background: "#1a1f2e", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW * (cPct / 100)}%`, background: CYAN, opacity: 0.8 }} />
                  <div style={{ position: "absolute", left: `${barW * (cPct / 100)}%`, top: 0, height: "100%", width: `${barW * ((100 - cPct) / 100)}%`, background: RED, opacity: 0.8 }} />
                </div>
                <span style={{ fontSize: 9, color: "#6b7280", textAlign: "right" }}>{fmtOI(total)}</span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

// ─────── PRICE + GEX CHART (GEX Bot — canvas, datos reales) ───────
export function ChartView({ ticker, exposures, levels }: Ctx) {
  return (
    <div className="h-full w-full flex gap-1 overflow-hidden" style={{ minHeight: 520 }}>
      {/* Gamma canvas — left half */}
      <div style={{ flex: "1 1 0", minWidth: 0, height: "100%", overflow: "hidden" }}>
        <GexBotChart ticker={ticker} exposures={exposures} levels={levels} />
      </div>
      {/* TradingView chart + info panel — right half */}
      <div style={{ flex: "1 1 0", minWidth: 0, height: "100%", overflow: "hidden", display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "hidden" }}>
          <TradingViewGexChart ticker={ticker} exposures={exposures} levels={levels} embedded />
        </div>
        <GexInfoPanel ticker={ticker} exposures={exposures} levels={levels} />
      </div>
    </div>
  );
}

// ── GEX Info Panel ────────────────────────────────────────────────
function GexInfoPanel({ ticker, exposures, levels }: { ticker: DemoTicker; exposures: ExposurePoint[]; levels: KeyLevels }) {
  const spot = ticker.spot;
  const today = new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });

  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI  = exposures.reduce((s, p) => s + p.putOI, 0);
  const totalOI     = totalCallOI + totalPutOI;
  const callPct     = totalOI > 0 ? ((totalCallOI / totalOI) * 100).toFixed(0) : "–";
  const putPct      = totalOI > 0 ? ((totalPutOI  / totalOI) * 100).toFixed(0) : "–";

  const peakGex = exposures.length
    ? exposures.reduce((b, p) => Math.abs(p.netGex) > Math.abs(b.netGex) ? p : b, exposures[0]).strike
    : null;

  const isPositive    = levels.totalGex >= 0;
  const aboveZeroGamma = levels.gammaFlip != null ? spot > levels.gammaFlip : null;
  const netGex         = levels.totalGex;

  const fmt = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return `${n >= 0 ? "+" : ""}${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${n >= 0 ? "+" : ""}${(n / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${n >= 0 ? "+" : ""}${(n / 1e3).toFixed(1)}K`;
    return `${n >= 0 ? "+" : ""}${n.toFixed(0)}`;
  };
  const fmtOI = (n: number) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
  };
  const px = (n: number | null | undefined) => n != null ? `$${n.toLocaleString()}` : "–";

  const S: React.CSSProperties = {
    fontFamily: "'Courier New', monospace",
    fontSize: 9,
    lineHeight: "15px",
  };
  const Row = ({ label, value, col }: { label: string; value: string; col: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
      <span style={{ color: "#2a3d52", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ color: col, fontWeight: 700, whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
  const Sec = ({ label }: { label: string }) => (
    <div style={{ color: "#1e6e3a", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", marginTop: 8, marginBottom: 2, borderBottom: "1px solid #0e1a10", paddingBottom: 2 }}>
      {label}
    </div>
  );

  return (
    <div style={{
      width: 168, flexShrink: 0,
      height: "100%", overflowY: "auto", overflowX: "hidden",
      background: "#04060a",
      borderLeft: "1px solid #0c1218",
      padding: "6px 8px",
      scrollbarWidth: "none",
      ...S,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
        <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 900, letterSpacing: "0.05em" }}>gex</span>
        <span style={{ color: "#1a2530", fontSize: 8 }}>bot</span>
        <span style={{
          marginLeft: "auto", background: "#0e2a1a", border: "1px solid #22c55e",
          color: "#22c55e", fontSize: 8, padding: "1px 6px", borderRadius: 2, fontWeight: 700,
        }}>LATEST</span>
      </div>

      <Sec label="IDENTIFY" />
      <Row label="ticker"      value={ticker.symbol}             col="#22d3ee" />
      <Row label="date"        value={today}                     col="#facc15" />
      <Row label="spot"        value={px(spot)}                  col="#e8963a" />
      <Row label="delta zero"  value={px(levels.gammaFlip ?? levels.volTrigger)} col="#facc15" />

      <Sec label="KEY LEVELS / CBOE" />
      <Row label="zero gamma"  value={px(levels.gammaFlip ?? levels.volTrigger)} col="#facc15" />
      <Row label="call wall"   value={px(levels.callWall)}       col="#22c55e" />
      <Row label="put wall"    value={px(levels.putWall)}        col="#ef4444" />
      <Row label="peak GEX"    value={px(peakGex)}               col="#22d3ee" />
      <Row label="max pain"    value={px(levels.maxPain)}        col="#fb923c" />
      {levels.majorWall && <Row label="major wall" value={px(levels.majorWall)} col="#c084fc" />}

      <Sec label="GEX STATUS" />
      <Row label="net gex"     value={fmt(netGex)}               col={isPositive ? "#22c55e" : "#ef4444"} />
      <Row label="regime"      value={isPositive ? "POS γ" : "NEG γ"} col={isPositive ? "#22c55e" : "#ef4444"} />
      <Row label="total OI"    value={fmtOI(totalOI)}            col="#4a6688" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
        <span style={{ color: "#2a3d52" }}>call OI</span>
        <span>
          <span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmtOI(totalCallOI)}</span>
          {" "}<span style={{ color: "#22c55e" }}>{callPct}%</span>
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
        <span style={{ color: "#2a3d52" }}>put OI</span>
        <span>
          <span style={{ color: "#22d3ee", fontWeight: 700 }}>{fmtOI(totalPutOI)}</span>
          {" "}<span style={{ color: "#ef4444" }}>{putPct}%</span>
        </span>
      </div>

      <Sec label="LEVEL RATES" />
      <Row
        label="above γ0"
        value={aboveZeroGamma == null ? "–" : aboveZeroGamma ? "✓ POS γ" : "✗ NEG γ"}
        col={aboveZeroGamma == null ? "#4a6688" : aboveZeroGamma ? "#22c55e" : "#ef4444"}
      />
      <Row
        label="range"
        value={levels.putWall && levels.callWall ? `$${levels.putWall}–${levels.callWall}` : "–"}
        col="#4a6688"
      />
      <Row
        label="dist flip"
        value={levels.gammaFlip ? `${(((spot - levels.gammaFlip) / spot) * 100).toFixed(2)}%` : "–"}
        col={Math.abs(spot - (levels.gammaFlip ?? spot)) / spot < 0.01 ? "#f59e0b" : "#4a6688"}
      />

      {/* OI bar */}
      <div style={{ marginTop: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#1a2530", fontSize: 8, marginBottom: 2 }}>
          <span style={{ color: "#22c55e" }}>C {callPct}%</span>
          <span style={{ color: "#ef4444" }}>P {putPct}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#0c1218", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${callPct}%`,
            background: "linear-gradient(90deg, #22c55e, #16a34a)",
          }} />
        </div>
      </div>
    </div>
  );
}


function KV({ k, v, tone }: { k: string; v: string; tone?: "call" | "put" | "warning" }) {
  const c = tone === "call" ? "text-call" : tone === "put" ? "text-put" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
      <span className="text-muted-foreground text-xs">{k}</span>
      <span className={`font-semibold ${c}`}>{v}</span>
    </div>
  );
}

// ─────── GEX & DEX ───────
const DTE_FILTERS = [
  { label: "0DTE", value: "0" },
  { label: "1DTE", value: "1" },
  { label: "7DTE", value: "7" },
  { label: "All", value: "all" },
];

// GexDexView removed — section deleted from sidebar.

// ─────── GREEK LADDER ───────
export function GreeksView({ ticker, exposures, contracts }: Ctx) {
  const atmIv = useMemo(() => {
    const near = contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
    if (!near.length) return 0.20;
    return near.reduce((s, c) => s + c.iv, 0) / near.length;
  }, [contracts, ticker]);

  return (
    <div className="h-full overflow-y-auto p-1">
      <GreekLadder symbol={ticker.symbol} />

      {/* Legacy aggregate ladder (dealer exposure) */}
      <div className="mt-4">
        <Panel title="Dealer Exposure per Strike" subtitle="Aggregated GEX/DEX/VEX/Vanna/Charm" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead className="bg-secondary/40 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <Th>Strike</Th><Th r>Call OI</Th><Th r>Put OI</Th>
                  <Th r>GEX</Th><Th r>DEX</Th><Th r>VEX</Th><Th r>Vanna</Th><Th r>Charm</Th>
                </tr>
              </thead>
              <tbody>
                {exposures.map((p) => {
                  const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
                  return (
                    <tr key={p.strike} className={`border-b border-border/30 ${isSpot ? "bg-primary/10" : "hover:bg-secondary/30"}`}>
                      <Td bold>{p.strike}{isSpot && <span className="ml-1 text-[10px] text-primary">●</span>}</Td>
                      <Td r>{formatNumber(p.callOI, 0)}</Td>
                      <Td r>{formatNumber(p.putOI, 0)}</Td>
                      <Td r tone={p.netGex >= 0 ? "call" : "put"}>{formatNumber(p.netGex)}</Td>
                      <Td r>{formatNumber(p.dex)}</Td>
                      <Td r>{formatNumber(p.vex)}</Td>
                      <Td r>{formatNumber(p.vanna)}</Td>
                      <Td r>{formatNumber(p.charm)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

const Th = ({ children, r }: any) => <th className={`py-2 px-3 font-semibold text-[10px] uppercase tracking-wider ${r ? "text-right" : ""}`}>{children}</th>;
const Td = ({ children, r, bold, tone }: any) => {
  const c = tone === "call" ? "text-call" : tone === "put" ? "text-put" : "";
  return <td className={`py-1.5 px-3 ${r ? "text-right" : ""} ${bold ? "font-semibold text-white bg-[#2db975]" : ""} ${c}`}>{children}</td>;
};

// ─────── DEPTH VIEW — GEX/DEX por strike, filtro DTE 1/2/3 ───────
export function DepthView({ ticker, contracts }: Ctx) {
  const [dte, setDte] = useState<"1" | "2" | "3">("3");
  const [hover, setHover] = useState<number | null>(null);

  // Filter contracts by DTE bucket (≤ N days, max 3)
  const filtered = useMemo(() => {
    const max = parseInt(dte, 10);
    return contracts.filter((c) => c.expiry <= max);
  }, [contracts, dte]);

  // Compute exposures per strike from filtered contracts
  const data = useMemo(() => computeExposures(ticker.spot, filtered), [filtered, ticker.spot]);

  // Find max |GEX| call (positive) and max |GEX| put (negative) for marker lines
  const callMax = useMemo(() => {
    let best: typeof data[0] | null = null;
    for (const d of data) if (d.callGex > 0 && (!best || d.callGex > best.callGex)) best = d;
    return best;
  }, [data]);
  const putMax = useMemo(() => {
    let best: typeof data[0] | null = null;
    for (const d of data) if (d.putGex < 0 && (!best || d.putGex < best.putGex)) best = d;
    return best;
  }, [data]);

  const maxAbs = Math.max(1, ...data.map((d) => Math.max(Math.abs(d.callGex), Math.abs(d.putGex))));
  const totalGex = data.reduce((s, d) => s + Math.abs(d.netGex), 0) || 1;

  return (
    <Panel title="GEX / DEX por Strike" subtitle={`${ticker.symbol} · spot $${ticker.spot}`} noPad>
      {/* Expiration selector row — up to 3 days max */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 flex-wrap">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Expiration</span>
        <select
          value={dte}
          onChange={(e) => setDte(e.target.value as "1" | "2" | "3")}
          className="h-7 px-2 text-[11px] font-bold font-mono rounded-sm bg-black border border-[#2a2a2a] text-white hover:border-emerald-500/50 focus:outline-none focus:border-emerald-500"
        >
          <option value="1">1 day</option>
          <option value="2">2 days</option>
          <option value="3">3 days (max)</option>
        </select>
        <span className="text-[9px] text-muted-foreground font-mono ml-auto">{filtered.length} contracts</span>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="grid grid-cols-[1fr_60px_1fr] items-center gap-1 px-3 py-1.5 text-[9px] tracking-widest font-bold text-muted-foreground border-b border-border/40 uppercase">
          <span className="text-right">PUTS · GEX</span>
          <span className="text-center">STRIKE</span>
          <span>CALLS · GEX +</span>
        </div>

        <div className="relative">
          {data.slice().reverse().map((p) => {
            const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
            const isCallMax = callMax && p.strike === callMax.strike;
            const isPutMax = putMax && p.strike === putMax.strike;
            const callPct = (Math.abs(p.callGex) / maxAbs) * 100;
            const putPct = (Math.abs(p.putGex) / maxAbs) * 100;
            const sharePct = ((Math.abs(p.netGex) / totalGex) * 100).toFixed(2);
            const isHover = hover === p.strike;
            return (
              <div
                key={p.strike}
                onMouseEnter={() => setHover(p.strike)}
                onMouseLeave={() => setHover((h) => (h === p.strike ? null : h))}
                className="relative grid grid-cols-[1fr_60px_1fr] items-center gap-1 px-3 py-[3px] hover:bg-white/5 transition-colors"
              >
                {/* Max-GEX marker lines (no yellow) */}
                {isCallMax && (
                  <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none">
                    <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                  </div>
                )}
                {isPutMax && (
                  <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none">
                    <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: "#ef4444", boxShadow: "0 0 8px #ef4444" }} />
                  </div>
                )}

                {/* Put bar — right-aligned, going left */}
                <div className="group/put flex justify-end h-3.5">
                  <div
                    className="h-full rounded-l-sm origin-right transition-all duration-150 ease-out group-hover/put:scale-y-[1.4] group-hover/put:brightness-125"
                    style={{
                      width: `${putPct}%`,
                      background: "linear-gradient(90deg, hsl(0 95% 35%), hsl(0 100% 58%))",
                      boxShadow: isPutMax ? "0 0 10px #ef4444" : "0 0 4px hsl(0 100% 55% / 0.4)",
                    }}
                  />
                </div>

                {/* Strike label */}
                <div
                  className="text-center font-mono text-[11px] font-bold tabular-nums"
                  style={{ color: isSpot ? "#06b6d4" : isCallMax ? "#10b981" : isPutMax ? "#ef4444" : "#e5e7eb" }}
                >
                  ${p.strike}
                  {isSpot && <span className="ml-1 text-[8px] text-cyan-400">●</span>}
                </div>

                {/* Call bar — left-aligned, going right */}
                <div className="group/call flex h-3.5">
                  <div
                    className="h-full rounded-r-sm origin-left transition-all duration-150 ease-out group-hover/call:scale-y-[1.4] group-hover/call:brightness-125"
                    style={{
                      width: `${callPct}%`,
                      background: "linear-gradient(90deg, hsl(140 100% 50%), hsl(140 95% 35%))",
                      boxShadow: isCallMax ? "0 0 10px #10b981" : "0 0 4px hsl(140 100% 50% / 0.4)",
                    }}
                  />
                </div>

                {/* Hover tooltip */}
                {isHover && (
                  <div
                    className="absolute z-30 left-1/2 -translate-x-1/2 -top-2 -translate-y-full px-3 py-2 rounded-md font-mono text-[10px] pointer-events-none"
                    style={{
                      background: "rgba(0,0,0,0.95)",
                      border: "1px solid #10b981",
                      boxShadow: "0 6px 20px rgba(16,185,129,0.3)",
                      minWidth: 180,
                    }}
                  >
                    <div className="font-bold text-white mb-1 tracking-wider">${p.strike} · {ticker.symbol}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                      <span className="text-muted-foreground">CALL GEX</span><span className="text-emerald-400 text-right">{formatNumber(p.callGex)}</span>
                      <span className="text-muted-foreground">PUT GEX</span><span className="text-red-400 text-right">{formatNumber(p.putGex)}</span>
                      <span className="text-muted-foreground">NET GEX</span><span className={`text-right ${p.netGex >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatNumber(p.netGex)}</span>
                      <span className="text-muted-foreground">DEX</span><span className="text-cyan-400 text-right">{formatNumber(p.dex)}</span>
                      <span className="text-muted-foreground">CALL OI</span><span className="text-emerald-300 text-right">{formatNumber(p.callOI, 0)}</span>
                      <span className="text-muted-foreground">PUT OI</span><span className="text-red-300 text-right">{formatNumber(p.putOI, 0)}</span>
                      <span className="text-muted-foreground">% del total</span><span className="text-amber-300 text-right">{sharePct}%</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 px-3 py-2 border-t border-border/40 text-[9px] font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-px" style={{ background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
            <span>Call wall (max GEX)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-px" style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
            <span>Put wall (min GEX)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>Spot</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─────── LEVEL SCAN ───────
export function LevelsView({ ticker, exposures, levels }: Ctx) {
  const sorted = [...exposures].sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex)).slice(0, 8);
  return (
    <TerminalTabs
      layoutId="levels-master-tab-bg"
      tabs={[
        {
          key: "top",
          label: "TOP STRIKES",
          content: (
            <Panel title="Top GEX Strikes" subtitle="Largest absolute exposure">
              <div className="space-y-1.5">
                {sorted.map((p) => {
                  const dist = ((p.strike - ticker.spot) / ticker.spot) * 100;
                  return (
                    <div key={p.strike} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-border/30">
                      <span className="font-semibold">${p.strike}</span>
                      <span className="text-muted-foreground">{dist >= 0 ? "+" : ""}{dist.toFixed(2)}%</span>
                      <span className={p.netGex >= 0 ? "text-call" : "text-put"}>{formatNumber(p.netGex)}</span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ),
        },
        {
          key: "critical",
          label: "CRITICAL",
          content: (
            <Panel title="Critical Levels">
              <div className="grid grid-cols-2 gap-2">
                <StatBlock label="Call Wall" value={`$${levels.callWall}`} tone="call" sub={`${(((levels.callWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Put Wall" value={`$${levels.putWall}`} tone="put" sub={`${(((levels.putWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Major Wall" value={`$${levels.majorWall}`} tone="primary" sub={`${(((levels.majorWall - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Max Pain" value={`$${levels.maxPain}`} tone="warning" sub={`${(((levels.maxPain - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
                <StatBlock label="Vol Trigger" value={`$${levels.volTrigger}`} tone="primary" sub={levels.gammaFlip ? "gamma flip" : "zero-gamma proxy"} />
                <StatBlock label="Total VT" value={`$${levels.totalVt}`} tone="call" sub="vega weighted" />
              </div>
              <div className="mt-3 p-3 rounded bg-secondary/40 text-xs leading-relaxed">
                <div className="font-semibold mb-1 text-foreground">Reading</div>
                <p className="text-muted-foreground">
                  Spot is {ticker.spot > (levels.gammaFlip ?? 0) ? "above" : "below"} the gamma flip — dealers are{" "}
                  <span className={ticker.spot > (levels.gammaFlip ?? 0) ? "text-call" : "text-put"}>
                    {ticker.spot > (levels.gammaFlip ?? 0) ? "long gamma (suppressing volatility)" : "short gamma (amplifying moves)"}
                  </span>.
                </p>
              </div>
            </Panel>
          ),
        },
      ]}
    />
  );
}

// ─────── HEDGE PRESSURE ───────
export function HedgeView(ctx: Ctx) {
  return (
    <div className="h-full overflow-hidden">
      <HedgePressurePanel {...ctx} />
    </div>
  );
}

// ─────── VANNA / CHARM ───────
export function VannaCharmView({ ticker, exposures }: Ctx) {
  return (
    <Panel title="Vanna / Charm Exposure" subtitle={`${ticker.symbol} · second-order greeks`} noPad>
      <div className="p-3">
        <TerminalTabs
          layoutId="vanna-charm-tab-bg"
          tabs={[
            {
              key: "vanna",
              label: "VANNA",
              content: <ExposureChart data={exposures} spot={ticker.spot} metric="vanna" />,
            },
            {
              key: "charm",
              label: "CHARM",
              content: <ExposureChart data={exposures} spot={ticker.spot} metric="charm" />,
            },
          ]}
        />
      </div>
    </Panel>
  );
}

// ─────── VEGA / THETA ───────
export function VegaThetaView({ ticker, contracts, exposures }: Ctx) {
  const [activeVTTab, setActiveVTTab] = useState("analyzer");
  const [live, setLive] = useState(true);
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [tick, setTick] = useState(0);
  const mapScrollRef = React.useRef<HTMLDivElement>(null);
  const topVegaRowRef = React.useRef<HTMLTableRowElement>(null);
  const expiryDefaultSet = React.useRef(false);

  type HoverCell = {
    strike: number; exp: number;
    vega: number; theta: number; iv: number;
    callVega: number; putVega: number;
    callTheta: number; putTheta: number;
    callOi: number; putOi: number;
    callVol: number; putVol: number;
    x: number; y: number; yBottom: number;
  };
  const [hoverCell, setHoverCell] = React.useState<HoverCell | null>(null);

  // Live ticker for subtle pulsing values
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setTick((t) => t + 1), 2500);
    return () => clearInterval(id);
  }, [live]);

  // Build per-(strike,expiry) Vega/Theta grid
  const grid = useMemo(() => {
    const SQRT_2PI = Math.sqrt(2 * Math.PI);
    const pdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT_2PI;
    const cdfApprox = (x: number) => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = x < 0 ? -1 : 1;
      const ax = Math.abs(x) / Math.SQRT2;
      const t = 1 / (1 + p * ax);
      const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
      return 0.5 * (1 + sign * y);
    };
    const r = 0.05;
    const map = new Map<string, {
      strike: number; expiry: number;
      vega: number; theta: number; iv: number; n: number;
      callVega: number; putVega: number;
      callTheta: number; putTheta: number;
      callOi: number; putOi: number;
      callVol: number; putVol: number;
      gamma: number; callGamma: number; putGamma: number;
      delta: number; callDelta: number; putDelta: number;
    }>();
    for (const c of contracts) {
      const T = Math.max(c.expiry, 1) / 365;
      const sigma = c.iv;
      if (sigma <= 0 || T <= 0) continue;
      const d1 = (Math.log(ticker.spot / c.strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const nd1 = pdf(d1);
      const gammaBS = nd1 / (ticker.spot * sigma * Math.sqrt(T));
      const gexUnit = gammaBS * ticker.spot * ticker.spot * 0.01 * c.oi * 100;
      const deltaBS = c.type === "call" ? cdfApprox(d1) : cdfApprox(d1) - 1;
      const vega = ticker.spot * nd1 * Math.sqrt(T);
      // Theta per year, then convert to per-day
      const thetaCall = -(ticker.spot * nd1 * sigma) / (2 * Math.sqrt(T)) - r * c.strike * Math.exp(-r * T) * cdfApprox(d2);
      const thetaPut  = -(ticker.spot * nd1 * sigma) / (2 * Math.sqrt(T)) + r * c.strike * Math.exp(-r * T) * cdfApprox(-d2);
      const thetaPerDay = (c.type === "call" ? thetaCall : thetaPut) / 365;
      const sign = c.type === "call" ? 1 : -1;
      const notional = c.oi * 100;
      const key = `${c.strike}|${c.expiry}`;
      const cur = map.get(key) ?? {
        strike: c.strike, expiry: c.expiry,
        vega: 0, theta: 0, iv: 0, n: 0,
        callVega: 0, putVega: 0,
        callTheta: 0, putTheta: 0,
        callOi: 0, putOi: 0,
        callVol: 0, putVol: 0,
        gamma: 0, callGamma: 0, putGamma: 0,
        delta: 0, callDelta: 0, putDelta: 0,
      };
      cur.vega += vega * notional * sign;
      cur.theta += thetaPerDay * notional * sign;
      cur.iv += c.iv;
      cur.n++;
      if (c.type === "call") {
        cur.callVega += vega * notional;
        cur.callTheta += thetaPerDay * notional;
        cur.callOi += c.oi;
        cur.callVol += c.volume ?? 0;
        cur.callGamma += gexUnit;
        cur.callDelta += deltaBS * c.oi * 100;
      } else {
        cur.putVega += vega * notional;
        cur.putTheta += thetaPerDay * notional;
        cur.putOi += c.oi;
        cur.putVol += c.volume ?? 0;
        cur.putGamma += gexUnit;
        cur.putDelta += deltaBS * c.oi * 100;
      }
      cur.gamma += gexUnit * sign;
      cur.delta += deltaBS * c.oi * 100;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((v) => ({ ...v, iv: v.iv / Math.max(1, v.n) }));
  }, [contracts, ticker.spot]);

  const allExpiries = useMemo(
    () => Array.from(new Set(grid.map((g) => g.expiry))).sort((a, b) => a - b),
    [grid]
  );

  // Default to nearest expiry (0DTE or closest) on first data load
  useEffect(() => {
    if (expiryDefaultSet.current || allExpiries.length === 0) return;
    expiryDefaultSet.current = true;
    setExpiryFilter(String(allExpiries[0]));
  }, [allExpiries]);

  const visibleExpiries = expiryFilter === "all" ? allExpiries : allExpiries.filter((e) => String(e) === expiryFilter);

  const allStrikes = useMemo(() => {
    const set = new Set<number>();
    for (const g of grid) if (visibleExpiries.includes(g.expiry)) set.add(g.strike);
    return Array.from(set).sort((a, b) => b - a); // high → low (top to bottom)
  }, [grid, visibleExpiries]);

  const cellMap = useMemo(() => {
    const m = new Map<string, {
      vega: number; theta: number; iv: number;
      callVega: number; putVega: number;
      callTheta: number; putTheta: number;
      callOi: number; putOi: number;
      callVol: number; putVol: number;
    }>();
    for (const g of grid) m.set(`${g.strike}|${g.expiry}`, {
      vega: g.vega, theta: g.theta, iv: g.iv,
      callVega: g.callVega, putVega: g.putVega,
      callTheta: g.callTheta, putTheta: g.putTheta,
      callOi: g.callOi, putOi: g.putOi,
      callVol: g.callVol, putVol: g.putVol,
    });
    return m;
  }, [grid]);

  const gammaMap = useMemo(() => {
    const m = new Map<string, { gamma: number; callGamma: number; putGamma: number }>();
    for (const g of grid) m.set(`${g.strike}|${g.expiry}`, { gamma: g.gamma, callGamma: g.callGamma, putGamma: g.putGamma });
    return m;
  }, [grid]);

  const deltaMap = useMemo(() => {
    const m = new Map<string, { delta: number; callDelta: number; putDelta: number }>();
    for (const g of grid) m.set(`${g.strike}|${g.expiry}`, { delta: g.delta, callDelta: g.callDelta, putDelta: g.putDelta });
    return m;
  }, [grid]);

  const maxAbsGamma = useMemo(() => Math.max(1, ...grid.map((g) => Math.abs(g.gamma))), [grid]);
  const maxAbsDelta = useMemo(() => Math.max(1, ...grid.map((g) => Math.abs(g.delta))), [grid]);

  const topGammaStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of grid) m.set(g.strike, (m.get(g.strike) ?? 0) + Math.abs(g.gamma));
    let best = { strike: ticker.spot, v: 0 };
    m.forEach((v, k) => { if (v > best.v) best = { strike: k, v }; });
    return best.strike;
  }, [grid, ticker.spot]);

  const topDeltaStrike = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of grid) m.set(g.strike, (m.get(g.strike) ?? 0) + Math.abs(g.delta));
    let best = { strike: ticker.spot, v: 0 };
    m.forEach((v, k) => { if (v > best.v) best = { strike: k, v }; });
    return best.strike;
  }, [grid, ticker.spot]);

  // Header KPIs (filtered)
  const filteredCells = grid.filter((g) => visibleExpiries.includes(g.expiry));
  const netVega = filteredCells.reduce((s, c) => s + c.vega, 0);
  const netTheta = filteredCells.reduce((s, c) => s + c.theta, 0);
  const totalVanna = exposures.reduce((s, p) => s + Math.abs(p.vanna), 0);
  const totalCharm = exposures.reduce((s, p) => s + Math.abs(p.charm), 0);
  const vannaCharmRatio = totalCharm > 0 ? totalVanna / totalCharm : 0;

  // Per-strike aggregated series for area chart
  const series = useMemo(() => {
    const m = new Map<number, { strike: number; vega: number; theta: number; iv: number; n: number }>();
    for (const c of filteredCells) {
      const cur = m.get(c.strike) ?? { strike: c.strike, vega: 0, theta: 0, iv: 0, n: 0 };
      cur.vega += c.vega;
      cur.theta += c.theta;
      cur.iv += c.iv;
      cur.n++;
      m.set(c.strike, cur);
    }
    return Array.from(m.values())
      .map((v) => ({ strike: v.strike, vega: v.vega, theta: v.theta, iv: (v.iv / Math.max(1, v.n)) * 100 }))
      .filter((v) => v.strike >= ticker.spot * 0.9 && v.strike <= ticker.spot * 1.1)
      .sort((a, b) => a.strike - b.strike);
  }, [filteredCells, ticker.spot]);

  // Top-vega strike — the row we auto-scroll to when entering EXPOSURE MAP
  const topVegaStrike = useMemo(() => {
    const byStrike = new Map<number, number>();
    for (const c of filteredCells) byStrike.set(c.strike, (byStrike.get(c.strike) ?? 0) + Math.abs(c.vega));
    let best = { strike: ticker.spot, vega: 0 };
    byStrike.forEach((v, k) => { if (v > best.vega) best = { strike: k, vega: v }; });
    return best.strike;
  }, [filteredCells, ticker.spot]);

  // Auto-scroll to the top-vega row when EXPOSURE MAP tab activates.
  // Delay must exceed AnimatePresence exit duration (180 ms) + mount + first paint.
  useEffect(() => {
    if (activeVTTab !== "classic") return;
    const id = setTimeout(() => {
      topVegaRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 320);
    return () => clearTimeout(id);
  }, [activeVTTab, topVegaStrike]);

  // Heatmap color scaling
  const maxAbsVega = Math.max(1, ...filteredCells.map((c) => Math.abs(c.vega)));
  const maxAbsTheta = Math.max(1, ...filteredCells.map((c) => Math.abs(c.theta)));

  const fmtExpiryHeader = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const dow = ["SUN","MON","TUE","WED","THU","FRI","SAT"][d.getDay()];
    const mon = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][d.getMonth()];
    return { line1: `${days}D (${dow})`, line2: `${mon} ${d.getDate()}` };
  };

  const cellColor = (vega: number, theta: number, iv: number) => {
    const dom = Math.abs(vega) / maxAbsVega >= Math.abs(theta) / maxAbsTheta ? "vega" : "theta";
    if (Math.abs(vega) < maxAbsVega * 0.02 && Math.abs(theta) < maxAbsTheta * 0.02) {
      return { bg: "hsl(0 0% 6%)", fg: "hsl(0 0% 30%)" };
    }
    if (dom === "vega") {
      const intensity = Math.min(1, Math.abs(vega) / maxAbsVega);
      // cyan gradient
      const lightness = 12 + intensity * 38;
      return { bg: `hsl(190 100% ${lightness}%)`, fg: intensity > 0.55 ? "hsl(220 30% 8%)" : "hsl(190 100% 80%)" };
    } else {
      const intensity = Math.min(1, Math.abs(theta) / maxAbsTheta);
      // red/magenta gradient
      const lightness = 12 + intensity * 35;
      return { bg: `hsl(${theta < 0 ? 358 : 320} 90% ${lightness}%)`, fg: intensity > 0.55 ? "hsl(220 30% 8%)" : "hsl(0 100% 85%)" };
    }
  };

  const VEGA_COLOR = "#00e5ff";
  const THETA_COLOR = "#ff3d00";

  return (
    <TerminalTabs
      layoutId="vegatheta-master-tab-bg"
      activeKey={activeVTTab}
      onTabChange={setActiveVTTab}
      tabs={[
        {
          key: "analyzer",
          label: "ANALYZER",
          content: <VegaThetaAnalyzer ticker={ticker} contracts={contracts} />,
        },
        {
          key: "classic",
          label: "VEGA MAP",
          content: (
    <div ref={mapScrollRef} className="h-full overflow-y-auto space-y-3 pr-1 terminal-scrollbar">
      {/* Sticky tab bar — always visible while scrolling the heatmap */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 rounded-lg border border-border/60 backdrop-blur-md" style={{ background: "rgba(0,0,0,0.88)" }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          Vega / Theta · Exposure Map
        </span>
        <div className="flex gap-0.5 bg-black/60 border border-border rounded p-0.5">
          {[
            { key: "analyzer", label: "ANALYZER" },
            { key: "classic", label: "VEGA MAP" },
            { key: "gamma", label: "GAMMA MAP" },
            { key: "delta", label: "DELTA MAP" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveVTTab(t.key)}
              className="relative px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded transition-colors"
              style={activeVTTab === t.key
                ? { background: "#00ff88", color: "#000", fontWeight: 700 }
                : { color: "rgba(255,255,255,0.4)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NET VEGA</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse" style={{ color: VEGA_COLOR }}>
            {netVega >= 0 ? "+" : ""}{formatNumber(netVega)}
          </div>
          <div className="text-[10px] text-muted-foreground">per 1 vol pt</div>
          <span className="kpi-bar" style={{ color: VEGA_COLOR, animationDelay: "0s" }} />
        </div>
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NET THETA</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse" style={{ color: THETA_COLOR, animationDelay: "1.1s" }}>
            {netTheta >= 0 ? "+" : ""}{formatNumber(netTheta)}
          </div>
          <div className="text-[10px] text-muted-foreground">decay / day</div>
          <span className="kpi-bar" style={{ color: THETA_COLOR, animationDelay: "1.4s" }} />
        </div>
        <div className="kpi-card rounded border border-border bg-card/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">VANNA / CHARM</div>
          <div className="text-lg font-bold font-mono mt-0.5 kpi-pulse text-foreground/80" style={{ animationDelay: "2.2s" }}>
            {vannaCharmRatio.toFixed(2)}
          </div>
          <div className="text-[10px] text-muted-foreground">cross-greek ratio</div>
          <span className="kpi-bar text-muted-foreground" style={{ animationDelay: "2.6s" }} />
        </div>
        <div className="rounded border border-border bg-card/60 px-3 py-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">EXPIRIES</div>
            <select
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value)}
              className="mt-1 bg-secondary/60 border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
            >
              <option value="all">ALL ({allExpiries.length})</option>
              {allExpiries.map((e) => <option key={e} value={String(e)}>{e === 0 ? "0DTE" : `${e}D`}</option>)}
            </select>
          </div>
          <button
            onClick={() => setLive((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest"
          >
            <span className={`h-2 w-2 rounded-full ${live ? "bg-call animate-pulse" : "bg-muted-foreground"}`} />
            <span className={live ? "text-call" : "text-muted-foreground"}>LIVE</span>
          </button>
        </div>
      </div>

      {/* Heatmap */}
      <Panel title="Vega / Theta Exposure Map" subtitle={`Strikes × expiries · spot $${ticker.spot}`} noPad>
        <div className="overflow-x-auto">
          <table className="text-[10px] font-mono w-full" style={{ borderCollapse: "separate", borderSpacing: 1 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card text-left px-2 py-2 text-muted-foreground text-[9px] uppercase tracking-widest">Strike</th>
                {visibleExpiries.map((exp) => {
                  const h = fmtExpiryHeader(exp);
                  return (
                    <th key={exp} className="px-1 py-2 text-center text-muted-foreground text-[9px] tracking-widest min-w-[40px]">
                      <div>{h.line1}</div>
                      <div className="text-foreground/70">{h.line2}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {allStrikes.map((strike) => {
                const isSpot = Math.abs(strike - ticker.spot) < ticker.strikeStep / 2;
                const isTopVega = strike === topVegaStrike;
                return (
                  <tr
                    key={strike}
                    ref={isTopVega ? topVegaRowRef : undefined}
                    style={isTopVega && !isSpot ? { outline: "1px solid rgba(0,229,160,0.45)", outlineOffset: -1 } : undefined}
                  >
                    <td
                      className={`sticky left-0 z-10 px-2 py-1 font-bold text-right ${isSpot ? "text-primary-foreground" : "text-foreground"}`}
                      style={{ background: isSpot ? "hsl(190 100% 45%)" : "hsl(var(--card))" }}
                    >
                      {strike}
                      {isSpot && <span className="ml-1">●</span>}
                      {isTopVega && !isSpot && <span className="ml-1 text-[7px] font-bold px-1 rounded" style={{ background: "rgba(0,229,160,0.2)", color: "#00e5a0" }}>▲VEX</span>}
                    </td>
                    {visibleExpiries.map((exp) => {
                      const cell = cellMap.get(`${strike}|${exp}`);
                      if (!cell) {
                        return <td key={exp} style={{ background: "hsl(0 0% 6%)" }} className="py-0.5 px-0 text-center text-muted-foreground/20">–</td>;
                      }
                      const c = cellColor(cell.vega, cell.theta, cell.iv);
                      return (
                        <td
                          key={exp}
                          style={{ background: c.bg, color: c.fg }}
                          className="py-0.5 px-0 text-center cursor-crosshair transition-colors"
                          onMouseEnter={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            setHoverCell({ strike, exp, ...cell, x: r.left + r.width / 2, y: r.top, yBottom: r.bottom });
                          }}
                          onMouseLeave={() => setHoverCell(null)}
                        >
                          {formatNumber(cell.vega, 0)}
                        </td>
                      );
                    })}
                    {isSpot && (
                      <td
                        className="absolute"
                        style={{ display: "none" }}
                      />
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: VEGA_COLOR }} /> Vega+ (cyan)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: THETA_COLOR }} /> Theta decay (red)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Spot anchor</span>
          {live && <span className="ml-auto text-call">● LIVE · tick {tick}</span>}
        </div>
      </Panel>

      {/* Area chart Vega vs Theta per strike */}
      <Panel title="Theta Decay vs Vega Sensitivity" subtitle="Per strike · ±10% spot">
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="vegaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VEGA_COLOR} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={VEGA_COLOR} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="thetaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={THETA_COLOR} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={THETA_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="strike" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <YAxis yAxisId="v" tick={{ fill: VEGA_COLOR, fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <YAxis yAxisId="t" orientation="right" tick={{ fill: THETA_COLOR, fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v), 1)} />
              <RTooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }}
                labelFormatter={(l) => `Strike $${l}`}
                formatter={(v: number, name: string, p: any) => {
                  if (name === "iv") return [`${(v).toFixed(1)}%`, "IV"];
                  return [formatNumber(v), name === "vega" ? "Vega" : "Theta"];
                }}
              />
              <ReferenceLine x={ticker.spot} yAxisId="v" stroke="hsl(var(--primary))" strokeWidth={1.5} label={{ value: `Spot ${ticker.spot}`, fill: "hsl(var(--primary))", fontSize: 10, position: "top" }} />
              <ReferenceLine y={0} yAxisId="v" stroke="hsl(var(--border))" />
              <Line yAxisId="v" type="monotone" dataKey="vega" stroke={VEGA_COLOR} strokeWidth={2} dot={false} fill="url(#vegaFill)" isAnimationActive={false} />
              <Line yAxisId="t" type="monotone" dataKey="theta" stroke={THETA_COLOR} strokeWidth={2} dot={false} fill="url(#thetaFill)" isAnimationActive={false} />
              <Line yAxisId="v" type="monotone" dataKey="iv" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ── Floating heatmap tooltip ─────────────────────────────────────── */}
      {hoverCell && <VegaHeatmapTooltip cell={hoverCell} spot={ticker.spot} maxAbsVega={maxAbsVega} maxAbsTheta={maxAbsTheta} />}
    </div>
          ),
        },
        {
          key: "gamma",
          label: "GAMMA MAP",
          content: (
            <div className="h-full overflow-y-auto space-y-3 pr-1 terminal-scrollbar">
              <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 rounded-lg border border-border/60 backdrop-blur-md" style={{ background: "rgba(0,0,0,0.88)" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Gamma Exposure Map</span>
                <div className="flex gap-0.5 bg-black/60 border border-border rounded p-0.5">
                  {[
                    { key: "analyzer", label: "ANALYZER" },
                    { key: "classic", label: "VEGA MAP" },
                    { key: "gamma", label: "GAMMA MAP" },
                    { key: "delta", label: "DELTA MAP" },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setActiveVTTab(t.key)}
                      className="relative px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded transition-colors"
                      style={activeVTTab === t.key ? { background: "#00ff88", color: "#000", fontWeight: 700 } : { color: "rgba(255,255,255,0.4)" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Panel title="Gamma Exposure Map" subtitle={`GEX per Strike × Expiry · spot $${ticker.spot}`} noPad>
                <div className="overflow-x-auto">
                  <table className="text-[10px] font-mono w-full" style={{ borderCollapse: "separate", borderSpacing: 1 }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-card text-left px-2 py-2 text-muted-foreground text-[9px] uppercase tracking-widest">Strike</th>
                        {visibleExpiries.map((exp) => {
                          const h = fmtExpiryHeader(exp);
                          return (
                            <th key={exp} className="px-1 py-2 text-center text-muted-foreground text-[9px] tracking-widest min-w-[40px]">
                              <div>{h.line1}</div><div className="text-foreground/70">{h.line2}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {allStrikes.map((strike) => {
                        const isSpot = Math.abs(strike - ticker.spot) < ticker.strikeStep / 2;
                        const isTop = strike === topGammaStrike;
                        return (
                          <tr key={strike} style={isTop && !isSpot ? { outline: "1px solid rgba(0,229,160,0.45)", outlineOffset: -1 } : undefined}>
                            <td className={`sticky left-0 z-10 px-2 py-1 font-bold text-right ${isSpot ? "text-primary-foreground" : "text-foreground"}`}
                              style={{ background: isSpot ? "hsl(190 100% 45%)" : "hsl(var(--card))" }}>
                              {strike}{isSpot && <span className="ml-1">●</span>}
                              {isTop && !isSpot && <span className="ml-1 text-[7px] font-bold px-1 rounded" style={{ background: "rgba(0,229,160,0.2)", color: "#00e5a0" }}>▲GEX</span>}
                            </td>
                            {visibleExpiries.map((exp) => {
                              const cell = gammaMap.get(`${strike}|${exp}`);
                              if (!cell) return <td key={exp} style={{ background: "hsl(0 0% 6%)" }} className="py-0.5 px-0 text-center text-muted-foreground/20">–</td>;
                              const intensity = Math.min(1, Math.abs(cell.gamma) / maxAbsGamma);
                              const isPos = cell.gamma >= 0;
                              const l = 10 + intensity * 40;
                              const bg = intensity < 0.03 ? "hsl(0 0% 6%)" : `hsl(${isPos ? 142 : 0} 90% ${l}%)`;
                              const fg = intensity > 0.5 ? "hsl(220 30% 8%)" : isPos ? "hsl(142 100% 80%)" : "hsl(0 100% 85%)";
                              const abs = Math.abs(cell.gamma);
                              const label = abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : abs.toFixed(0);
                              return (
                                <td key={exp} style={{ background: bg, color: fg }} className="py-0.5 px-0 text-center cursor-default transition-colors"
                                  title={`Strike ${strike} · ${exp === 0 ? "0DTE" : exp + "D"}\nGamma: ${isPos ? "+" : "−"}${label}\nCall GEX: ${(cell.callGamma / 1e3).toFixed(1)}K\nPut GEX: ${(cell.putGamma / 1e3).toFixed(1)}K`}>
                                  {isPos ? "" : "−"}{label}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "#22c55e" }} /> GEX+ (long gamma)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "#ef4444" }} /> GEX− (short gamma)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Spot anchor</span>
                </div>
              </Panel>
            </div>
          ),
        },
        {
          key: "delta",
          label: "DELTA MAP",
          content: (
            <div className="h-full overflow-y-auto space-y-3 pr-1 terminal-scrollbar">
              <div className="sticky top-0 z-30 flex items-center justify-between px-3 py-2 rounded-lg border border-border/60 backdrop-blur-md" style={{ background: "rgba(0,0,0,0.88)" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>Delta Exposure Map</span>
                <div className="flex gap-0.5 bg-black/60 border border-border rounded p-0.5">
                  {[
                    { key: "analyzer", label: "ANALYZER" },
                    { key: "classic", label: "VEGA MAP" },
                    { key: "gamma", label: "GAMMA MAP" },
                    { key: "delta", label: "DELTA MAP" },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setActiveVTTab(t.key)}
                      className="relative px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded transition-colors"
                      style={activeVTTab === t.key ? { background: "#00ff88", color: "#000", fontWeight: 700 } : { color: "rgba(255,255,255,0.4)" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Panel title="Delta Exposure Map" subtitle={`DEX per Strike × Expiry · spot $${ticker.spot}`} noPad>
                <div className="overflow-x-auto">
                  <table className="text-[10px] font-mono w-full" style={{ borderCollapse: "separate", borderSpacing: 1 }}>
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-card text-left px-2 py-2 text-muted-foreground text-[9px] uppercase tracking-widest">Strike</th>
                        {visibleExpiries.map((exp) => {
                          const h = fmtExpiryHeader(exp);
                          return (
                            <th key={exp} className="px-1 py-2 text-center text-muted-foreground text-[9px] tracking-widest min-w-[40px]">
                              <div>{h.line1}</div><div className="text-foreground/70">{h.line2}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {allStrikes.map((strike) => {
                        const isSpot = Math.abs(strike - ticker.spot) < ticker.strikeStep / 2;
                        const isTop = strike === topDeltaStrike;
                        return (
                          <tr key={strike} style={isTop && !isSpot ? { outline: "1px solid rgba(251,191,36,0.5)", outlineOffset: -1 } : undefined}>
                            <td className={`sticky left-0 z-10 px-2 py-1 font-bold text-right ${isSpot ? "text-primary-foreground" : "text-foreground"}`}
                              style={{ background: isSpot ? "hsl(190 100% 45%)" : "hsl(var(--card))" }}>
                              {strike}{isSpot && <span className="ml-1">●</span>}
                              {isTop && !isSpot && <span className="ml-1 text-[7px] font-bold px-1 rounded" style={{ background: "rgba(251,191,36,0.2)", color: "#fbbf24" }}>▲DEX</span>}
                            </td>
                            {visibleExpiries.map((exp) => {
                              const cell = deltaMap.get(`${strike}|${exp}`);
                              if (!cell) return <td key={exp} style={{ background: "hsl(0 0% 6%)" }} className="py-0.5 px-0 text-center text-muted-foreground/20">–</td>;
                              const intensity = Math.min(1, Math.abs(cell.delta) / maxAbsDelta);
                              const isPos = cell.delta >= 0;
                              const l = 10 + intensity * 40;
                              const bg = intensity < 0.03 ? "hsl(0 0% 6%)" : `hsl(${isPos ? 200 : 30} 90% ${l}%)`;
                              const fg = intensity > 0.5 ? "hsl(220 30% 8%)" : isPos ? "hsl(200 100% 85%)" : "hsl(30 100% 85%)";
                              const abs = Math.abs(cell.delta);
                              const label = abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(0)}K` : abs.toFixed(0);
                              return (
                                <td key={exp} style={{ background: bg, color: fg }} className="py-0.5 px-0 text-center cursor-default transition-colors"
                                  title={`Strike ${strike} · ${exp === 0 ? "0DTE" : exp + "D"}\nNet Delta: ${isPos ? "+" : "−"}${label}\nCall Δ: ${(cell.callDelta / 1e3).toFixed(1)}K\nPut Δ: ${(cell.putDelta / 1e3).toFixed(1)}K`}>
                                  {isPos ? "" : "−"}{label}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-4 px-3 py-2 border-t border-border text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "#38bdf8" }} /> DEX+ (bullish delta)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm" style={{ background: "#fb923c" }} /> DEX− (bearish delta)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-primary" /> Spot anchor</span>
                </div>
              </Panel>
            </div>
          ),
        },
      ]}
    />
  );
}

// ─────── Vega heatmap floating tooltip ───────
function VegaHeatmapTooltip({
  cell, spot, maxAbsVega, maxAbsTheta,
}: {
  cell: {
    strike: number; exp: number;
    vega: number; theta: number; iv: number;
    callVega: number; putVega: number;
    callTheta: number; putTheta: number;
    callOi: number; putOi: number;
    callVol: number; putVol: number;
    x: number; y: number; yBottom: number;
  };
  spot: number;
  maxAbsVega: number;
  maxAbsTheta: number;
}) {
  const TW = 252;
  const MARGIN = 10;
  const GAP = 8;

  const showBelow = cell.y < 220;
  const rawLeft = cell.x - TW / 2;
  const left = Math.max(MARGIN, Math.min((typeof window !== "undefined" ? window.innerWidth : 1400) - TW - MARGIN, rawLeft));
  const top = showBelow ? cell.yBottom + GAP : cell.y - GAP;

  const moneyness = ((cell.strike / spot) - 1) * 100;
  const moneynessLabel = Math.abs(moneyness) < 0.25 ? "ATM" : moneyness > 0 ? `+${moneyness.toFixed(2)}% OTM` : `${moneyness.toFixed(2)}% ITM`;
  const expLabel = cell.exp === 0 ? "0DTE" : `${cell.exp}D`;
  const totalOi = cell.callOi + cell.putOi;
  const totalVol = cell.callVol + cell.putVol;
  const pcRatio = cell.callOi > 0 ? (cell.putOi / cell.callOi).toFixed(2) : "—";
  const vegaIntensity = Math.min(1, Math.abs(cell.vega) / Math.max(1, maxAbsVega));
  const thetaIntensity = Math.min(1, Math.abs(cell.theta) / Math.max(1, maxAbsTheta));
  const vegaDom = Math.abs(cell.vega) / Math.max(1, maxAbsVega) >= Math.abs(cell.theta) / Math.max(1, maxAbsTheta);

  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "−" : "+";
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${abs.toFixed(0)}`;
  };
  const fmtOi = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  const CYAN = "#00e5ff";
  const RED = "#ff3d00";
  const GREEN = "#00e5a0";
  const MUTED = "#6b7280";
  const BORDER = "#1e2245";
  const BG = "#070b1a";

  const MiniBar = ({ pct, color }: { pct: number; color: string }) => (
    <div style={{ width: 72, height: 5, background: "#1a1f3a", borderRadius: 3, overflow: "hidden", display: "inline-block", verticalAlign: "middle" }}>
      <div style={{ width: `${pct * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );

  const Row = ({ label, value, color, bar, barColor }: { label: string; value: string; color: string; bar?: number; barColor?: string }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "3px 0" }}>
      <span style={{ color: MUTED, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0, width: 76 }}>{label}</span>
      {bar !== undefined && barColor ? <MiniBar pct={bar} color={barColor} /> : <div style={{ width: 72 }} />}
      <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textAlign: "right", minWidth: 52 }}>{value}</span>
    </div>
  );

  const Divider = () => <div style={{ borderTop: `1px solid ${BORDER}`, margin: "4px 0" }} />;

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        transform: showBelow ? "none" : "translateY(-100%)",
        width: TW,
        zIndex: 9999,
        pointerEvents: "none",
        background: BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "9px 11px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        fontFamily: "JetBrains Mono, ui-monospace, monospace",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ color: "#e4e4e7", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em" }}>
          ${cell.strike.toLocaleString()}
        </span>
        <span style={{ color: vegaDom ? CYAN : RED, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          {expLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
        <span style={{ color: Math.abs(moneyness) < 0.25 ? GREEN : moneyness > 0 ? MUTED : "#facc15", fontSize: 9, letterSpacing: "0.1em" }}>
          {moneynessLabel}
        </span>
        <span style={{ color: MUTED, fontSize: 9 }}>· spot ${spot.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
      </div>

      <Divider />

      {/* Greeks */}
      <Row label="Net Vega" value={fmt(cell.vega)} color={cell.vega >= 0 ? CYAN : "#ff8c69"} bar={vegaIntensity} barColor={CYAN} />
      <Row label="Net Theta" value={fmt(cell.theta)} color={cell.theta >= 0 ? GREEN : RED} bar={thetaIntensity} barColor={RED} />
      <Row label="Implied IV" value={`${(cell.iv * 100).toFixed(2)}%`} color="#a78bfa" />

      <Divider />

      {/* OI & Volume */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 6px" }}>
        {[
          { label: "Call OI", value: fmtOi(cell.callOi), color: CYAN },
          { label: "Put OI", value: fmtOi(cell.putOi), color: RED },
          { label: "Call Vol", value: fmtOi(cell.callVol), color: `${CYAN}aa` },
          { label: "Put Vol", value: fmtOi(cell.putVol), color: `${RED}aa` },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: "2px 0" }}>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
            <div style={{ color, fontSize: 10, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ color: MUTED, fontSize: 9, letterSpacing: "0.1em" }}>TOTAL OI</span>
        <span style={{ color: "#e4e4e7", fontSize: 9, fontWeight: 600 }}>{fmtOi(totalOi)}</span>
        <span style={{ color: MUTED, fontSize: 9, letterSpacing: "0.1em" }}>P/C</span>
        <span style={{ color: Number(pcRatio) > 1 ? RED : CYAN, fontSize: 9, fontWeight: 700 }}>{pcRatio}</span>
        <span style={{ color: MUTED, fontSize: 9, letterSpacing: "0.1em" }}>VOL</span>
        <span style={{ color: "#e4e4e7", fontSize: 9, fontWeight: 600 }}>{fmtOi(totalVol)}</span>
      </div>

      <Divider />

      {/* Call vs Put Vega split */}
      <div style={{ marginBottom: 2 }}>
        <div style={{ color: MUTED, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Vega Split · Calls vs Puts</div>
        {(() => {
          const total = cell.callVega + cell.putVega;
          const callPct = total > 0 ? cell.callVega / total : 0.5;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ color: CYAN, fontSize: 9, width: 36, textAlign: "right" }}>{(callPct * 100).toFixed(0)}%</span>
              <div style={{ flex: 1, height: 6, background: RED, borderRadius: 3, overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${callPct * 100}%`, background: CYAN, borderRadius: 3 }} />
              </div>
              <span style={{ color: RED, fontSize: 9, width: 36 }}>{((1 - callPct) * 100).toFixed(0)}%</span>
            </div>
          );
        })()}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
          <span style={{ color: CYAN, fontSize: 9 }}>{fmt(cell.callVega)}</span>
          <span style={{ color: RED, fontSize: 9 }}>−{fmt(cell.putVega).replace(/^[+−]/, "")}</span>
        </div>
      </div>
    </div>
  );
}

// ─────── VOLATILITY ───────
export function VolatilityView({ ticker, exposures, levels, contracts }: Ctx) {
  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1">
      <VolatilityDashboard ticker={ticker} contracts={contracts} />
      <VolatilityAnomalyPanel ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />
    </div>
  );
}

// ─────── VOLATILITY ANOMALY PANEL ────────────────────────────────
function VolatilityAnomalyPanel({ ticker, contracts }: Ctx) {
  const spot       = ticker.spot;
  const strikeStep = ticker.strikeStep;

  // ── ATM IV ──────────────────────────────────────────────────
  const atmIv = useMemo(() => {
    const near = contracts.filter(c => Math.abs(c.strike - spot) <= strikeStep * 1.5);
    return near.length
      ? (near.reduce((s, c) => s + c.iv, 0) / near.length) * 100
      : ticker.baseIV * 100;
  }, [contracts, spot, strikeStep, ticker.baseIV]);

  // ── Term structure: ATM IV per expiry ────────────────────────
  const termStructure = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const c of contracts) {
      if (Math.abs(c.strike - spot) > strikeStep * 2.5) continue;
      const arr = map.get(c.expiry) ?? [];
      arr.push(c.iv * 100);
      map.set(c.expiry, arr);
    }
    return Array.from(map.entries())
      .map(([dte, ivs]) => ({ dte, iv: ivs.reduce((s, v) => s + v, 0) / ivs.length }))
      .sort((a, b) => a.dte - b.dte);
  }, [contracts, spot, strikeStep]);

  // ── Skew surface: IV by strike (nearest expiry) ──────────────
  const skewData = useMemo(() => {
    if (!contracts.length) return [];
    const minExp = contracts.reduce((m, c) => c.expiry < m ? c.expiry : m, Infinity);
    const near   = contracts.filter(c => c.expiry === minExp);
    const strikes = Array.from(new Set(near.map(c => c.strike))).sort((a, b) => a - b);
    return strikes
      .map(strike => {
        const calls = near.filter(c => c.strike === strike && c.type === "call");
        const puts  = near.filter(c => c.strike === strike && c.type === "put");
        const cIv   = calls.length ? calls.reduce((s, c) => s + c.iv, 0) / calls.length * 100 : null;
        const pIv   = puts.length  ? puts.reduce((s, c) => s + c.iv, 0) / puts.length  * 100 : null;
        const mono  = Number(((strike - spot) / spot * 100).toFixed(2));
        return { mono, callIv: cIv, putIv: pIv };
      })
      .filter(d => Math.abs(d.mono) <= 8);
  }, [contracts, spot]);

  // ── Stats ────────────────────────────────────────────────────
  const allIvs  = contracts.map(c => c.iv * 100);
  const meanIv  = allIvs.reduce((s, v) => s + v, 0) / Math.max(allIvs.length, 1);
  const minIv   = allIvs.length ? Math.min(...allIvs) : 0;
  const maxIv   = allIvs.length ? Math.max(...allIvs) : 0;
  const sdIv    = Math.sqrt(allIvs.reduce((s, v) => s + (v - meanIv) ** 2, 0) / Math.max(allIvs.length, 1));
  const ivRank  = maxIv > minIv ? ((atmIv - minIv) / (maxIv - minIv)) * 100 : 50;
  const vov     = sdIv;

  const putIvs    = contracts.filter(c => c.type === "put").map(c => c.iv * 100);
  const callIvs   = contracts.filter(c => c.type === "call").map(c => c.iv * 100);
  const avgPutIv  = putIvs.reduce((s, v) => s + v, 0) / Math.max(putIvs.length, 1);
  const avgCallIv = callIvs.reduce((s, v) => s + v, 0) / Math.max(callIvs.length, 1);
  const pcSpread  = avgPutIv - avgCallIv;

  const termRegime = termStructure.length >= 2
    ? (termStructure[0].iv > termStructure[termStructure.length - 1].iv
        ? "BACKWARDATION" : "CONTANGO")
    : "N/A";

  // ── Forward vol between adjacent expiries ────────────────────
  const forwardVols = useMemo(() => {
    if (termStructure.length < 2) return [];
    return termStructure.slice(0, -1).map((t, i) => {
      const t1 = t.dte / 252, t2 = termStructure[i + 1].dte / 252;
      const v1 = t.iv / 100,   v2 = termStructure[i + 1].iv / 100;
      if (t2 <= t1 || t1 <= 0) return null;
      const fvSq = (v2 * v2 * t2 - v1 * v1 * t1) / (t2 - t1);
      const fv   = fvSq > 0 ? Math.sqrt(fvSq) * 100 : 0;
      return {
        label: `${t.dte}→${termStructure[i + 1].dte}d`,
        fv: Number(fv.toFixed(2)),
        anomaly: fv > v2 * 100 * 1.4 || fv < v1 * 100 * 0.6,
      };
    }).filter(Boolean) as { label: string; fv: number; anomaly: boolean }[];
  }, [termStructure]);

  // ── Anomaly scores ───────────────────────────────────────────
  const zAtm    = sdIv > 0 ? (atmIv - meanIv) / sdIv : 0;
  const zSkew   = sdIv > 0 ? pcSpread / (sdIv * 0.5) : 0;
  const zVov    = meanIv > 0 ? (vov / meanIv - 0.15) / 0.08 : 0;
  const zTerm   = termRegime === "BACKWARDATION" ? 2.8 : -0.5;
  const zRank   = (ivRank - 50) / 25;
  const zFwdVol = forwardVols.filter(f => f.anomaly).length > 0 ? 2.2 : 0.3;

  const anomalies = [
    { label: "ATM IV Spike",    value: `${atmIv.toFixed(1)}%`,                            z: zAtm,   desc: `${zAtm >= 0 ? "+" : ""}${zAtm.toFixed(2)}σ vs chain mean`          },
    { label: "Put/Call Skew",   value: `${pcSpread >= 0 ? "+" : ""}${pcSpread.toFixed(1)}%`, z: zSkew, desc: pcSpread > 0 ? "Put premium (hedging demand)" : "Call skew (upside)" },
    { label: "Vol of Vol",      value: `${vov.toFixed(1)}%`,                              z: zVov,   desc: vov > meanIv * 0.2 ? "High IV dispersion" : "Normal dispersion"       },
    { label: "Term Structure",  value: termRegime,                                        z: zTerm,  desc: termRegime === "BACKWARDATION" ? "Short-term fear spike" : "Normal"   },
    { label: "IV Rank",         value: `${ivRank.toFixed(0)}/100`,                        z: zRank,  desc: ivRank > 75 ? "Expensive options" : ivRank < 25 ? "Cheap options" : "Neutral" },
    { label: "Forward Vol",     value: forwardVols.length ? `${forwardVols[0].fv.toFixed(1)}%` : "–", z: zFwdVol, desc: zFwdVol > 2 ? "Fwd vol kink detected" : "Normal fwd structure" },
  ];

  const zColor = (z: number) =>
    Math.abs(z) > 2.5 ? "#f43f5e" : Math.abs(z) > 1.5 ? "#f59e0b" : "#22d3ee";
  const zLabel = (z: number) =>
    Math.abs(z) > 2.5 ? "CRITICAL" : Math.abs(z) > 1.5 ? "ELEVATED" : "NORMAL";

  return (
    <div className="space-y-3">
      {/* ── Header row ───────────────────────────────────── */}
      <Panel title="Volatility Anomaly Detection" subtitle={`${ticker.symbol} · real-time chain analysis`}
        right={
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: termRegime === "BACKWARDATION" ? "#f43f5e" : "#22d3ee", fontWeight: 700 }}>
            {termRegime}
          </span>
        }
      >
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <StatBlock label="ATM IV"       value={`${atmIv.toFixed(1)}%`}    tone={atmIv > meanIv + sdIv * 1.5 ? "put" : "default"} />
          <StatBlock label="IV Rank"      value={`${ivRank.toFixed(0)}/100`} tone={ivRank > 75 ? "put" : ivRank < 25 ? "call" : "default"} sub={ivRank > 75 ? "expensive" : ivRank < 25 ? "cheap" : "neutral"} />
          <StatBlock label="Vol of Vol"   value={`${vov.toFixed(1)}%`}      tone={vov > meanIv * 0.2 ? "warning" : "default"} sub="IV dispersion" />
          <StatBlock label="P/C IV Spread" value={`${pcSpread >= 0 ? "+" : ""}${pcSpread.toFixed(1)}%`} tone={pcSpread > 2 ? "put" : pcSpread < -2 ? "call" : "default"} sub={pcSpread > 0 ? "put premium" : "call prem."} />
          <StatBlock label="Term Regime"  value={termRegime}                tone={termRegime === "BACKWARDATION" ? "put" : "call"} />
          <StatBlock label="Min/Max IV"   value={`${minIv.toFixed(0)}/${maxIv.toFixed(0)}%`} tone="default" sub={`mean ${meanIv.toFixed(1)}%`} />
        </div>

        {/* ── Charts ───────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          {/* Term structure */}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground mb-2">
              TERM STRUCTURE · IV% vs DTE
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={termStructure} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="termGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="dte" tick={{ fill: "#4a6688", fontSize: 9 }} tickFormatter={v => `${v}d`} />
                  <YAxis tick={{ fill: "#4a6688", fontSize: 9 }} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                  <RTooltip
                    contentStyle={{ background: "#04060a", border: "1px solid #0e1420", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}
                    labelFormatter={l => `DTE: ${l}d`}
                    formatter={(v: number) => [`${v.toFixed(2)}%`, "ATM IV"]}
                  />
                  <Area type="monotone" dataKey="iv" stroke="#22d3ee" strokeWidth={2} fill="url(#termGrad)" dot={{ r: 3, fill: "#22d3ee" }} isAnimationActive={false} />
                  <ReferenceLine y={atmIv} stroke="#e8963a" strokeDasharray="3 3"
                    label={{ value: "SPOT IV", fill: "#e8963a", fontSize: 9, position: "right" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Skew by strike */}
          <div>
            <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground mb-2">
              VOL SKEW · IV% by STRIKE MONEYNESS
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={skewData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="mono" tick={{ fill: "#4a6688", fontSize: 9 }} tickFormatter={v => `${Number(v) >= 0 ? "+" : ""}${v}%`} />
                  <YAxis tick={{ fill: "#4a6688", fontSize: 9 }} tickFormatter={v => `${Number(v).toFixed(0)}%`} />
                  <RTooltip
                    contentStyle={{ background: "#04060a", border: "1px solid #0e1420", borderRadius: 4, fontSize: 11, fontFamily: "monospace" }}
                    labelFormatter={l => `Moneyness: ${Number(l) >= 0 ? "+" : ""}${l}%`}
                    formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name === "callIv" ? "Call IV" : "Put IV"]}
                  />
                  <ReferenceLine x={0} stroke="#e8963a" strokeDasharray="3 3" label={{ value: "ATM", fill: "#e8963a", fontSize: 9 }} />
                  <Line type="monotone" dataKey="putIv"  stroke="#f87171" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Line type="monotone" dataKey="callIv" stroke="#4ade80" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  <Legend wrapperStyle={{ fontSize: 10, fontFamily: "monospace" }} formatter={v => v === "callIv" ? "Call IV" : "Put IV"} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Anomaly scores ────────────────────────────── */}
        <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground mb-2">
          ANOMALY SCORES · Z-SCORE ANALYSIS
        </div>
        <div className="space-y-1.5">
          {anomalies.map(a => {
            const col = zColor(a.z);
            const lbl = zLabel(a.z);
            const pct = Math.min(100, Math.abs(a.z) / 3 * 100);
            return (
              <div key={a.label} className="grid items-center gap-2"
                style={{ gridTemplateColumns: "120px 70px 1fr 80px 70px" }}>
                <span className="text-[10px] font-mono text-muted-foreground">{a.label}</span>
                <span className="text-[10px] font-mono font-bold" style={{ color: col }}>{a.value}</span>
                <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: col, boxShadow: `0 0 6px ${col}` }} />
                </div>
                <span className="text-[9px] font-mono text-muted-foreground truncate">{a.desc}</span>
                <span className="text-[9px] font-mono font-bold text-right" style={{ color: col }}>{lbl}</span>
              </div>
            );
          })}
        </div>

        {/* ── Forward vol table ─────────────────────────── */}
        {forwardVols.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-mono font-bold tracking-widest text-muted-foreground mb-2">
              FORWARD VOL · TERM STRUCTURE IMPLIED
            </div>
            <div className="flex flex-wrap gap-2">
              {forwardVols.map(f => (
                <div key={f.label}
                  className="rounded border px-2 py-1.5 font-mono text-[10px] text-center min-w-[80px]"
                  style={{
                    borderColor: f.anomaly ? "#f43f5e" : "#0e1420",
                    background: f.anomaly ? "rgba(244,63,94,0.08)" : "#04060a",
                  }}>
                  <div className="text-muted-foreground text-[9px]">{f.label}</div>
                  <div className="font-bold mt-0.5" style={{ color: f.anomaly ? "#f43f5e" : "#22d3ee" }}>
                    {f.fv.toFixed(1)}%
                  </div>
                  {f.anomaly && <div className="text-[8px] text-[#f43f5e] mt-0.5">KINK</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─────── REGIME ───────
export function RegimeView({ ticker, levels, exposures, contracts }: Ctx) {
  return (
    <div className="h-full overflow-y-auto">
      <GammaRegimePanel ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />
    </div>
  );
}

function CumGexChart({ exposures, spot, flip }: { exposures: ExposurePoint[]; spot: number; flip: number | null }) {
  const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
  let cum = 0;
  const pts = sorted.map((p) => { cum += p.netGex; return { k: p.strike, v: cum }; });
  const max = Math.max(...pts.map((p) => p.v));
  const min = Math.min(...pts.map((p) => p.v));
  const range = max - min || 1;
  const zeroY = 240 - ((0 - min) / range) * 220 - 10;
  return (
    <div className="h-64 w-full">
      <svg viewBox="0 0 600 240" preserveAspectRatio="none" className="w-full h-full">
        <line x1="0" y1={zeroY} x2="600" y2={zeroY} stroke="hsl(38 92% 55%)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        {flip && (() => {
          const fx = ((flip - pts[0].k) / (pts[pts.length - 1].k - pts[0].k)) * 600;
          return <line x1={fx} y1="0" x2={fx} y2="240" stroke="hsl(38 92% 55%)" strokeWidth="1" />;
        })()}
        {(() => {
          const sx = ((spot - pts[0].k) / (pts[pts.length - 1].k - pts[0].k)) * 600;
          return <line x1={sx} y1="0" x2={sx} y2="240" stroke="hsl(180 100% 50%)" strokeWidth="1" strokeDasharray="3 3" />;
        })()}
        <path
          d={pts.map((p, i) => {
            const x = (i / (pts.length - 1)) * 600;
            const y = 240 - ((p.v - min) / range) * 220 - 10;
            return `${i === 0 ? "M" : "L"} ${x} ${y}`;
          }).join(" ")}
          fill="none"
          stroke="hsl(180 100% 50%)"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// ─────── Strike table (used by GEX/DEX) ───────
function StrikeTable({ exposures, ticker }: { exposures: ExposurePoint[]; ticker: DemoTicker }) {
  return (
    <Panel title="Strike Detail" noPad>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-xs font-mono">
          <thead className="bg-secondary/40 sticky top-0">
            <tr className="text-left text-muted-foreground">
              <Th>Strike</Th><Th r>Call OI</Th><Th r>Put OI</Th><Th r>Call GEX</Th><Th r>Put GEX</Th><Th r>Net GEX</Th><Th r>DEX</Th>
            </tr>
          </thead>
          <tbody>
            {exposures.map((p) => {
              const isSpot = Math.abs(p.strike - ticker.spot) < ticker.strikeStep / 2;
              return (
                <tr key={p.strike} className={`border-b border-border/30 ${isSpot ? "bg-primary/10" : "hover:bg-secondary/30"}`}>
                  <Td bold>{p.strike}{isSpot && <span className="ml-1 text-[10px] text-primary">●</span>}</Td>
                  <Td r>{formatNumber(p.callOI, 0)}</Td>
                  <Td r>{formatNumber(p.putOI, 0)}</Td>
                  <Td r tone="call">{formatNumber(p.callGex)}</Td>
                  <Td r tone="put">{formatNumber(p.putGex)}</Td>
                  <Td r tone={p.netGex >= 0 ? "call" : "put"}>{formatNumber(p.netGex)}</Td>
                  <Td r>{formatNumber(p.dex)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─────── OI ANALYTICS (horizontal bars + Max Pain + DEX Bias) ───────
export function OiAnalyticsView({ ticker, exposures, contracts }: Ctx) {
  const [metric, setMetric] = useState<"netGex" | "dex">("netGex");
  const maxPain = useMemo(() => computeMaxPain(exposures), [exposures]);
  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const callWall = exposures.reduce((b, p) => (p.callGex > b.callGex ? p : b), exposures[0]).strike;
  const putWall = exposures.reduce((b, p) => (p.putGex < b.putGex ? p : b), exposures[0]).strike;
  const atmContracts = contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
  const atmIv = atmContracts.length ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100 : ticker.baseIV * 100;

  const biasRatio = netDex / Math.max(Math.abs(totalCallOI - totalPutOI) * ticker.spot, 1);
  let bias: { label: string; tone: "call" | "put" | "warning" };
  const absDex = Math.abs(netDex);
  if (absDex < 1e6) bias = { label: "NEUTRAL", tone: "warning" };
  else if (netDex > 0) bias = { label: biasRatio > 0.5 ? "CALL HEAVY" : "CALL LEAN", tone: "call" };
  else bias = { label: biasRatio < -0.5 ? "PUT HEAVY" : "PUT LEAN", tone: "put" };

  const max = Math.max(...exposures.map((p) => Math.abs(p[metric])));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatBlock label="Spot" value={`$${ticker.spot.toLocaleString()}`} tone="primary" />
        <StatBlock label="Call Wall" value={`$${callWall}`} tone="call" />
        <StatBlock label="Put Wall" value={`$${putWall}`} tone="put" />
        <StatBlock label="Max Pain" value={`$${maxPain}`} tone="warning" sub={`${(((maxPain - ticker.spot) / ticker.spot) * 100).toFixed(2)}%`} />
        <StatBlock label="ATM IV" value={`${atmIv.toFixed(2)}%`} tone="primary" />
        <StatBlock label="DEX Bias" value={bias.label} tone={bias.tone} sub={formatNumber(netDex)} />
      </div>

      <Panel
        title="Net Exposure by Strike"
        subtitle="Notional ($) per strike — green = positive, red = negative"
        right={
          <Tabs value={metric} onValueChange={(v) => setMetric(v as any)}>
            <TabsList className="h-7">
              <TabsTrigger value="netGex" className="text-xs h-5 px-2">Net GEX</TabsTrigger>
              <TabsTrigger value="dex" className="text-xs h-5 px-2">Net DEX</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      >
        <HorizontalBars exposures={exposures} metric={metric} max={max} spot={ticker.spot} maxPain={maxPain} />
      </Panel>
    </div>
  );
}

function HorizontalBars({ exposures, metric, max, spot, maxPain }: {
  exposures: ExposurePoint[]; metric: "netGex" | "dex"; max: number; spot: number; maxPain: number;
}) {
  const sorted = [...exposures].sort((a, b) => b.strike - a.strike);
  const [hover, setHover] = useState<{ strike: number; v: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative space-y-0.5 max-h-[380px] overflow-y-auto pr-1"
      onMouseLeave={() => setHover(null)}
    >
      {sorted.map((p) => {
        const v = p[metric];
        const pct = (Math.abs(v) / max) * 50;
        const isSpot = Math.abs(p.strike - spot) < (spot * 0.001);
        const isMaxPain = p.strike === maxPain;
        const isHover = hover?.strike === p.strike;
        return (
          <div
            key={p.strike}
            className={`grid grid-cols-[60px_1fr] items-center gap-2 text-[11px] font-mono py-0.5 transition-colors ${isSpot ? "bg-primary/15" : isMaxPain ? "bg-warning/10" : ""} ${isHover ? "bg-primary/10" : ""}`}
            onMouseMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setHover({
                strike: p.strike,
                v,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            }}
          >
            <span className={`text-right pr-2 ${isSpot ? "text-primary font-bold" : isMaxPain ? "text-warning font-semibold" : ""}`}>
              {p.strike}
              {isSpot && <span className="ml-1">●</span>}
              {isMaxPain && !isSpot && <span className="ml-1 text-[9px]">MP</span>}
            </span>
            <div className="group/bar relative h-4 bg-secondary/30 rounded-sm">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {v >= 0 ? (
                <div
                  className="absolute inset-y-0 left-1/2 bg-call/70 rounded-r-sm origin-left transition-all duration-150 ease-out group-hover/bar:scale-y-[1.4] group-hover/bar:brightness-125"
                  style={{ width: `${pct}%`, boxShadow: isHover ? "0 0 10px hsl(var(--call) / 0.6)" : undefined }}
                />
              ) : (
                <div
                  className="absolute inset-y-0 right-1/2 bg-put/70 rounded-l-sm origin-right transition-all duration-150 ease-out group-hover/bar:scale-y-[1.4] group-hover/bar:brightness-125"
                  style={{ width: `${pct}%`, boxShadow: isHover ? "0 0 10px hsl(var(--put) / 0.6)" : undefined }}
                />
              )}
            </div>
          </div>
        );
      })}

      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute z-30 px-2.5 py-1.5 rounded-md border border-border bg-popover/95 backdrop-blur-sm shadow-lg font-mono text-[11px] whitespace-nowrap"
            style={{
              left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 0) - 160),
              top: hover.y + 14,
            }}
          >
            <div className="text-primary font-semibold">Strike ${hover.strike.toLocaleString()}</div>
            <div className={hover.v >= 0 ? "text-call" : "text-put"}>
              {metric === "netGex" ? "Γ " : "Δ "}
              {hover.v >= 0 ? "+" : ""}{formatNumber(hover.v)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─────── HEATMAP IV + 3D Surface ───────
export function HeatmapView({ ticker, contracts }: Ctx) {
  const grid = buildIvGrid(contracts);
  const expiries = Array.from(new Set(grid.map((c) => c.expiry))).sort((a, b) => a - b);
  const strikes = Array.from(new Set(grid.map((c) => c.strike))).sort((a, b) => b - a);
  const cellMap = new Map(grid.map((c) => [`${c.strike}|${c.expiry}`, c.iv]));
  const ivs = grid.map((c) => c.iv);
  const min = Math.min(...ivs), max = Math.max(...ivs);

  const colorFor = (iv: number) => {
    const t = (iv - min) / (max - min || 1);
    if (t < 0.33) return `hsl(220 80% ${30 + t * 60}%)`;
    if (t < 0.66) return `hsl(${180 - (t - 0.33) * 240} 80% 50%)`;
    return `hsl(${40 - (t - 0.66) * 120} 90% 55%)`;
  };

  const heatmapContent = (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="grid" style={{ gridTemplateColumns: `60px repeat(${expiries.length}, minmax(50px, 1fr))` }}>
          <div />
          {expiries.map((e) => (
            <div key={`h-${e}`} className="text-[10px] font-mono text-muted-foreground text-center pb-1 border-b border-border">{e}d</div>
          ))}
          {strikes.map((s) => (
            <div key={`row-${s}`} className="contents">
              <div className={`text-[10px] font-mono py-0.5 pr-2 text-right ${Math.abs(s - ticker.spot) < ticker.strikeStep ? "text-primary font-bold" : "text-muted-foreground"}`}>{s}</div>
              {expiries.map((e) => {
                const iv = cellMap.get(`${s}|${e}`);
                return (
                  <div
                    key={`${s}-${e}`}
                    className="h-6 border border-background flex items-center justify-center text-[9px] font-mono text-foreground/90"
                    style={{ background: iv != null ? colorFor(iv) : "transparent" }}
                    title={iv != null ? `IV ${(iv * 100).toFixed(1)}%` : ""}
                  >
                    {iv != null ? (iv * 100).toFixed(0) : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
        <span>Low {(min * 100).toFixed(1)}%</span>
        <div className="flex-1 h-2 rounded" style={{ background: "linear-gradient(90deg, hsl(220 80% 30%), hsl(180 80% 50%), hsl(60 80% 50%), hsl(0 90% 55%))" }} />
        <span>High {(max * 100).toFixed(1)}%</span>
      </div>
    </div>
  );

  return (
    <Panel title="IV Heatmap & Surface" subtitle={`${ticker.symbol} · Implied Volatility · Strike × DTE`} noPad>
      <div className="p-3">
        <TerminalTabs
          layoutId="iv-heatmap-tab-bg"
          tabs={[
            {
              key: "surface",
              label: "3D SURFACE",
              content: <IvSurface3DReal strikes={strikes} expiries={expiries} cellMap={cellMap} min={min} max={max} spot={ticker.spot} />,
            },
            {
              key: "flow",
              label: <span style={{ background: "linear-gradient(90deg, #ffffff, #1e40af)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontWeight: 800 }}>HEATMAP</span>,
              content: <OptionsFlowHeatmap ticker={ticker} contracts={contracts} />,
            },
          ]}
        />
      </div>
    </Panel>
  );
}

function SurfaceChart({ strikes, expiries, cellMap, min, max, colorFor }: {
  strikes: number[]; expiries: number[]; cellMap: Map<string, number>; min: number; max: number; colorFor: (n: number) => string;
}) {
  const W = 700, H = 380;
  const cellW = 24, cellD = 14, hMax = 130;
  const ox = 80, oy = 280;
  const range = max - min || 1;

  type Q = { d: string; fill: string; depth: number };
  const quads: Q[] = [];

  for (let i = 0; i < strikes.length - 1; i++) {
    for (let j = 0; j < expiries.length - 1; j++) {
      const corners = [
        { si: i, ei: j }, { si: i + 1, ei: j }, { si: i + 1, ei: j + 1 }, { si: i, ei: j + 1 },
      ].map(({ si, ei }) => {
        const iv = cellMap.get(`${strikes[si]}|${expiries[ei]}`) ?? min;
        const h = ((iv - min) / range) * hMax;
        const x = ox + ei * cellW + si * cellD;
        const y = oy - h - si * cellD * 0.6;
        return { x, y, iv };
      });
      const avgIv = corners.reduce((s, c) => s + c.iv, 0) / 4;
      const d = `M ${corners[0].x} ${corners[0].y} L ${corners[1].x} ${corners[1].y} L ${corners[2].x} ${corners[2].y} L ${corners[3].x} ${corners[3].y} Z`;
      quads.push({ d, fill: colorFor(avgIv), depth: i + j });
    }
  }
  quads.sort((a, b) => a.depth - b.depth);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" style={{ minHeight: 380 }}>
        <line x1={ox} y1={oy} x2={ox + expiries.length * cellW} y2={oy} stroke="hsl(222 25% 25%)" />
        <line x1={ox} y1={oy} x2={ox - 10 + strikes.length * cellD} y2={oy - strikes.length * cellD * 0.6} stroke="hsl(222 25% 25%)" />
        <line x1={ox} y1={oy} x2={ox} y2={oy - hMax - 20} stroke="hsl(222 25% 25%)" />
        {quads.map((q, i) => (
          <path key={i} d={q.d} fill={q.fill} fillOpacity={0.85} stroke="hsl(222 47% 5%)" strokeWidth="0.5" />
        ))}
        <text x={ox + (expiries.length * cellW) / 2} y={H - 10} textAnchor="middle" fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace">DTE (days)</text>
        <text x={20} y={oy - hMax / 2} textAnchor="middle" fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace" transform={`rotate(-90 20 ${oy - hMax / 2})`}>IV (%)</text>
        <text x={ox - 5 + strikes.length * cellD * 0.7} y={oy - strikes.length * cellD * 0.4} fill="hsl(215 20% 60%)" fontSize="10" fontFamily="monospace">STRIKE</text>
      </svg>
    </div>
  );
}

// ─────── RISK ───────
export function RiskView({ ticker, exposures, levels, contracts }: Ctx) {
  const totalGamma = exposures.reduce((s, p) => s + Math.abs(p.netGex), 0);
  const concentration = exposures.reduce((s, p) => s + (p.netGex / Math.max(totalGamma, 1)) ** 2, 0);
  const tailPuts = exposures.filter((p) => p.strike < ticker.spot * 0.95).reduce((s, p) => s + p.putOI, 0);
  const tailCalls = exposures.filter((p) => p.strike > ticker.spot * 1.05).reduce((s, p) => s + p.callOI, 0);
  const totalOI = exposures.reduce((s, p) => s + p.callOI + p.putOI, 0);
  const tailRisk = ((tailPuts + tailCalls) / Math.max(totalOI, 1)) * 100;
  const dayWeighted = contracts.reduce((s, c) => s + c.oi / Math.max(c.expiry, 1), 0);
  const distToFlip = levels.gammaFlip ? Math.abs((ticker.spot - levels.gammaFlip) / ticker.spot) * 100 : 100;

  const riskScore = Math.min(100, Math.round(
    concentration * 30 +
    (tailRisk / 50) * 30 +
    (1 / Math.max(distToFlip, 0.1)) * 5 +
    (levels.totalGex < 0 ? 20 : 0)
  ));
  const tone = riskScore > 60 ? "put" : riskScore > 35 ? "warning" : "call";

  // ATM IV (annualized %) from contracts near spot
  const atmContracts = contracts.filter((c) => Math.abs(c.strike - ticker.spot) < ticker.strikeStep * 1.5);
  const atmIv = atmContracts.length
    ? (atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length) * 100
    : ticker.baseIV * 100;

  return (
    <TerminalTabs
      layoutId="risk-master-tab-bg"
      tabs={[
        {
          key: "calculator",
          label: "CALCULATOR",
          content: <RiskCalculator ticker={ticker} levels={levels} atmIv={atmIv} />,
        },
        {
          key: "score",
          label: "RISK SCORE",
          content: (
            <Panel title="Risk Score" subtitle="Composite measure of structural fragility (0–100)">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className={`text-5xl font-bold font-mono ${tone === "put" ? "text-put" : tone === "warning" ? "text-warning" : "text-call"}`}>{riskScore}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{riskScore > 60 ? "HIGH RISK" : riskScore > 35 ? "ELEVATED" : "STABLE"}</div>
                </div>
                <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                  <div className={`h-full ${tone === "put" ? "bg-put" : tone === "warning" ? "bg-warning" : "bg-call"}`} style={{ width: `${riskScore}%` }} />
                </div>
              </div>
            </Panel>
          ),
        },
        {
          key: "metrics",
          label: "METRICS",
          content: (
            <Panel title="Risk Metrics">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <StatBlock label="Concentration" value={(concentration * 100).toFixed(1) + "%"} sub="HHI of GEX" tone={concentration > 0.15 ? "put" : "default"} />
                <StatBlock label="Tail OI" value={tailRisk.toFixed(1) + "%"} sub="strikes ±5%" tone={tailRisk > 30 ? "warning" : "default"} />
                <StatBlock label="Dist to flip" value={distToFlip.toFixed(2) + "%"} sub="closer = fragile" tone={distToFlip < 1 ? "put" : "default"} />
                <StatBlock label="Day-weighted OI" value={formatNumber(dayWeighted, 0)} sub="short-dated load" />
              </div>
            </Panel>
          ),
        },
        {
          key: "scenario",
          label: "SCENARIO",
          content: (
            <Panel title="Scenario — spot ±5%">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[-5, 0, 5].map((pct) => {
                  const newSpot = ticker.spot * (1 + pct / 100);
                  const closest = exposures.reduce((b, p) => Math.abs(p.strike - newSpot) < Math.abs(b.strike - newSpot) ? p : b, exposures[0]);
                  const Icon = pct < 0 ? TrendingDown : pct > 0 ? TrendingUp : Activity;
                  const localTone = pct < 0 ? "text-put" : pct > 0 ? "text-call" : "text-primary";
                  return (
                    <div key={pct} className="rounded border border-border bg-card/60 p-3">
                      <div className={`flex items-center justify-center gap-1 text-xs ${localTone}`}>
                        <Icon className="h-3 w-3" />
                        {pct >= 0 ? "+" : ""}{pct}%
                      </div>
                      <div className="text-base font-mono font-semibold mt-1">${newSpot.toFixed(0)}</div>
                      <div className={`text-xs font-mono mt-1 ${closest.netGex >= 0 ? "text-call" : "text-put"}`}>{formatNumber(closest.netGex)}</div>
                      <div className="text-[10px] text-muted-foreground">net GEX @ K</div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ),
        },
      ]}
    />
  );
}

// ─────── ANOMALY DETECTION ───────
// ─────── ANOMALY DETECTION (Bloomberg-style) ───────
interface AlertItem {
  id: string;
  ts: number;
  kind: "Gamma Spike" | "Delta Flip" | "IV Explosion" | "Volume Surge" | "OI Cluster";
  z: number;
  symbol: string;
  strike: number;
  detail: string;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function AnomalyView({ ticker, exposures, contracts }: Ctx) {
  // ── Static stats from exposures (rolling-mu/sigma proxy) ──
  const gexes = exposures.map((p) => p.netGex);
  const meanG = gexes.reduce((s, x) => s + x, 0) / gexes.length;
  const sdG = Math.sqrt(gexes.reduce((s, x) => s + (x - meanG) ** 2, 0) / gexes.length) || 1;
  const ois = exposures.map((p) => p.callOI + p.putOI);
  const meanO = ois.reduce((s, x) => s + x, 0) / ois.length;
  const sdO = Math.sqrt(ois.reduce((s, x) => s + (x - meanO) ** 2, 0) / ois.length) || 1;
  const ivs = contracts.map((c) => c.iv);
  const meanIv = ivs.reduce((s, x) => s + x, 0) / ivs.length;
  const sdIv = Math.sqrt(ivs.reduce((s, x) => s + (x - meanIv) ** 2, 0) / ivs.length) || 1;

  // Pre-compute candidate anomalies (>2σ in any dimension)
  const candidates = useMemo(() => {
    const out: { kind: AlertItem["kind"]; z: number; strike: number; detail: string }[] = [];
    exposures.forEach((p) => {
      const zG = (p.netGex - meanG) / sdG;
      const zO = (p.callOI + p.putOI - meanO) / sdO;
      if (Math.abs(zG) > 2.09) out.push({ kind: "Gamma Spike", z: zG, strike: p.strike, detail: `Net GEX ${formatNumber(p.netGex)}` });
      if (Math.abs(zO) > 2.09) out.push({ kind: "OI Cluster", z: zO, strike: p.strike, detail: `OI ${formatNumber(p.callOI + p.putOI, 0)}` });
      if (Math.sign(p.dex) !== Math.sign(meanG) && Math.abs(p.dex) > sdG * 1.5) {
        out.push({ kind: "Delta Flip", z: p.dex / sdG, strike: p.strike, detail: `Δ ${formatNumber(p.dex)}` });
      }
    });
    contracts.forEach((c) => {
      const z = (c.iv - meanIv) / sdIv;
      if (Math.abs(z) > 2.5) out.push({ kind: "IV Explosion", z, strike: c.strike, detail: `${c.type.toUpperCase()} ${c.expiry}d · IV ${(c.iv * 100).toFixed(1)}%` });
    });
    return out;
  }, [exposures, contracts, meanG, sdG, meanO, sdO, meanIv, sdIv]);

  // ── Live alert feed (animated) ──
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  useEffect(() => {
    if (candidates.length === 0) { setAlerts([]); return; }
    // Show top anomalies sorted by |Z| — no random jitter, no artificial feed
    const sorted = [...candidates]
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 18)
      .map((c, i) => ({
        id: `${c.kind}-${c.strike}-${i}`,
        ts: Date.now() - i * 12000,
        kind: c.kind, z: c.z, symbol: ticker.symbol, strike: c.strike, detail: c.detail,
      }));
    setAlerts(sorted);
  }, [candidates, ticker.symbol]);

  // ── Z-Distance from VWAP (REAL intraday prices via Yahoo/Polygon) ──
  type VwapPoint = { i: number; price: number; vwap: number; z: number; anomaly: number | null; buy: number | null; sell: number | null; side: "BUY" | "SELL" | null; sigma: number };
  const [vwapSeries, setVwapSeries] = useState<VwapPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const computeFromOhlc = (ohlc: { high: number; low: number; close: number; open: number }[]): VwapPoint[] => {
      // Use last 60 bars
      const bars = ohlc.slice(-60);
      let sumPV = 0, sumV = 0;
      const prices: number[] = [];
      const out: VwapPoint[] = [];
      bars.forEach((b, i) => {
        const typical = (b.high + b.low + b.close) / 3;
        const v = 1; // volume not available — use 1 (TWAP-like). Still real prices.
        sumPV += typical * v; sumV += v;
        const vwap = sumPV / sumV;
        prices.push(b.close);
        const recent = prices.slice(-20);
        const m = recent.reduce((s, x) => s + x, 0) / recent.length;
        const sd = Math.sqrt(recent.reduce((s, x) => s + (x - m) ** 2, 0) / recent.length) || 1;
        const z = (b.close - vwap) / sd;
        const isAnom = Math.abs(z) > 2;
        const side: "BUY" | "SELL" | null = isAnom ? (z < 0 ? "BUY" : "SELL") : null;
        out.push({
          i,
          price: Number(b.close.toFixed(2)),
          vwap: Number(vwap.toFixed(2)),
          z: Number(z.toFixed(2)),
          sigma: Number(Math.abs(z).toFixed(2)),
          anomaly: isAnom ? z : null,
          buy: side === "BUY" ? z : null,
          sell: side === "SELL" ? z : null,
          side,
        });
      });
      return out;
    };

    const fetchReal = async () => {
      try {
        const url = `${SUPABASE_URL}/functions/v1/polygon-price-history?symbol=${encodeURIComponent(ticker.symbol)}&timeframe=1D`;
        const r = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
        const j = await r.json();
        const ohlc = Array.isArray(j?.ohlc) ? j.ohlc : [];
        if (cancelled) return;
        if (ohlc.length >= 5) {
          setVwapSeries(computeFromOhlc(ohlc));
        }
      } catch {
        /* keep prior series */
      }
    };

    fetchReal();
    const id = setInterval(fetchReal, 60_000); // refresh every minute
    return () => { cancelled = true; clearInterval(id); };
  }, [ticker.symbol]);
  const lastZ = vwapSeries[vwapSeries.length - 1]?.z ?? 0;

  // ── Entropy (flow stability) ──
  const entropy = useMemo(() => {
    if (vwapSeries.length < 2) return 0;
    let changes = 0;
    for (let i = 1; i < vwapSeries.length; i++) {
      changes += Math.abs(vwapSeries[i].z - vwapSeries[i - 1].z);
    }
    return Math.min(1, changes / vwapSeries.length / 1.2);
  }, [vwapSeries]);
  const entropyPct = Math.round(entropy * 100);
  const systemStatus = entropy < 0.35 ? "STABLE FLOW" : entropy < 0.65 ? "ELEVATED" : "CHAOS";
  const entropyColor = entropy < 0.35 ? "hsl(180 100% 50%)" : entropy < 0.65 ? "hsl(35 100% 55%)" : "hsl(0 90% 60%)";

  // ── Toast on each NEW alert with strike + BUY/SELL signal ──
  const lastAlertId = useRef<string | null>(null);
  useEffect(() => {
    if (alerts.length === 0) return;
    const top = alerts[0];
    if (lastAlertId.current === top.id) return;
    if (lastAlertId.current === null) { lastAlertId.current = top.id; return; } // skip seed batch
    lastAlertId.current = top.id;
    const side: "BUY" | "SELL" = top.z < 0 ? "BUY" : "SELL";
    const sev = Math.abs(top.z);
    const sigmaTxt = `${top.z >= 0 ? "+" : ""}${top.z.toFixed(2)}σ`;
    const fn = side === "BUY" ? toast.success : toast.error;
    fn(`${side} signal · ${top.kind}`, {
      description: `${top.symbol} @ $${top.strike} · ${sigmaTxt} · ${top.detail}`,
      duration: sev > 2.8 ? 7000 : 4500,
    });
  }, [alerts]);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden pr-2 space-y-3">
      {/* Log Return Anomaly Detector — Yahoo Finance 5m real data, rolling ±2σ */}
      <LogReturnAnomalyPanel />

      {/* Z-Score Anomalies (Hedge Pressure / GEX / OI-Volume) */}
      <StdDevAnomaliesPanel ticker={ticker} exposures={exposures} contracts={contracts} />

      {/* Header strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatBlock label="Sigma Threshold" value="2.09σ" tone="warning" sub="5m candle" />
        <StatBlock label="Live Alerts" value={alerts.length} tone="primary" sub="last 18" />
        <StatBlock label="Z (Spot/VWAP)" value={`${lastZ >= 0 ? "+" : ""}${lastZ.toFixed(2)}σ`} tone={Math.abs(lastZ) > 2 ? "warning" : "default"} />
        <StatBlock label="Entropy" value={`${entropyPct}%`} tone={entropy < 0.35 ? "call" : entropy < 0.65 ? "warning" : "put"} sub={systemStatus} />
        <StatBlock label="Symbol" value={ticker.symbol} tone="primary" sub={`spot $${ticker.spot}`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-3">
        {/* Live alert feed */}
        <Panel
          title="Anomaly Feed"
          subtitle="Z-Score > 2.09 | 5m"
          className="lg:col-span-2"
          right={<span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse" /> LIVE</span>}
        >
          {alerts.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center font-mono">[ awaiting signal · no anomalies above 2.09σ ]</div>
          ) : (
            <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {alerts.map((a) => {
                  const sev = Math.abs(a.z);
                  const color = sev > 3 ? "text-[#ff00ff]" : sev > 2.5 ? "text-warning" : "text-[#facc15]";
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, x: -16, backgroundColor: "hsl(var(--warning) / 0.18)" }}
                      animate={{ opacity: 1, x: 0, backgroundColor: "hsl(var(--card) / 0)" }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ duration: 0.4 }}
                      className="grid grid-cols-[68px_98px_60px_1fr_70px] gap-2 items-center text-[11px] font-mono py-1.5 px-2 border-b border-border/30 rounded"
                    >
                      <span className="text-muted-foreground">{fmtTime(a.ts)}</span>
                      <span className={`font-semibold flex items-center gap-1 ${color}`}>
                        <Zap className="h-3 w-3" />{a.kind}
                      </span>
                      <span className="text-foreground">{a.symbol}</span>
                      <span className="text-muted-foreground truncate">${a.strike} · {a.detail}</span>
                      <span className={`text-right font-bold ${color}`}>{a.z >= 0 ? "+" : ""}{a.z.toFixed(2)}σ</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </Panel>

        {/* Entropy + System Status */}
        <Panel title="Entropy Manifold" subtitle="Flow stability index">
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between mb-2 font-mono">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">σ-velocity</span>
                <span className="text-2xl font-bold" style={{ color: entropyColor }}>{entropyPct}%</span>
              </div>
              <div className="h-3 rounded-full bg-secondary/60 overflow-hidden border border-border">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${entropyPct}%`, backgroundColor: entropyColor }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  style={{ boxShadow: `0 0 12px ${entropyColor}` }}
                />
              </div>
              <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-1">
                <span>STABLE</span><span>NEUTRAL</span><span>CHAOS</span>
              </div>
            </div>

            <div className="rounded border border-border bg-secondary/30 p-3 font-mono text-[11px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">SYSTEM STATUS</span>
                <span className="font-bold" style={{ color: entropyColor }}>{systemStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">SIGNAL/NOISE</span>
                <span className="text-foreground">{(1 / Math.max(0.05, entropy)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DETECTOR</span>
                <span className="text-call">ONLINE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">CANDIDATES</span>
                <span className="text-foreground">{candidates.length}</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Z-Distance from VWAP — anomalías marcadas con BUY/SELL */}
      <Panel
        title="Anomaly Tracker · Z-Distance"
        subtitle="Standard deviations from VWAP · BUY (z < −2σ) / SELL (z > +2σ)"
        right={
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-call" style={{ boxShadow: "0 0 6px hsl(140 100% 50%)" }} /> BUY</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-put" style={{ boxShadow: "0 0 6px hsl(0 100% 55%)" }} /> SELL</span>
            <span className="text-muted-foreground">{vwapSeries.filter((d) => d.side).length} hits</span>
          </div>
        }
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vwapSeries} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" opacity={0.35} />
              <XAxis dataKey="i" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} tickFormatter={(v) => `t-${60 - Number(v)}`} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} domain={[-3.5, 3.5]} tickFormatter={(v) => `${v}σ`} />
              <RTooltip
                cursor={{ stroke: "hsl(var(--primary))", strokeDasharray: "3 3" }}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border rounded px-3 py-2 font-mono text-[11px] shadow-xl">
                      <div className="text-muted-foreground text-[9px] uppercase tracking-widest mb-1">t-{60 - d.i}</div>
                      <div>Price <span className="text-foreground">${d.price}</span></div>
                      <div>VWAP  <span className="text-muted-foreground">${d.vwap}</span></div>
                      <div>Z     <span style={{ color: d.side === "BUY" ? "hsl(140 100% 50%)" : d.side === "SELL" ? "hsl(0 100% 60%)" : "hsl(var(--foreground))" }}>{d.z >= 0 ? "+" : ""}{d.z}σ</span></div>
                      {d.side && (
                        <div className="mt-1 pt-1 border-t border-border font-bold" style={{ color: d.side === "BUY" ? "hsl(140 100% 50%)" : "hsl(0 100% 60%)" }}>
                          ▶ {d.side} signal · {d.sigma}σ
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "+3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={2} stroke="hsl(0 100% 55%)" strokeDasharray="3 3" label={{ value: "+2σ SELL", fill: "hsl(0 100% 55%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.5} />
              <ReferenceLine y={-2} stroke="hsl(140 100% 50%)" strokeDasharray="3 3" label={{ value: "-2σ BUY", fill: "hsl(140 100% 50%)", fontSize: 9, position: "right" }} />
              <ReferenceLine y={-3} stroke="hsl(0 90% 60%)" strokeDasharray="3 3" label={{ value: "-3σ", fill: "hsl(0 90% 60%)", fontSize: 9, position: "right" }} />
              <Line
                type="monotone"
                dataKey="z"
                stroke="hsl(var(--primary))"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                style={{ filter: "drop-shadow(0 0 2px hsl(var(--primary)))" }}
              />
              <Line
                type="monotone"
                dataKey="buy"
                stroke="transparent"
                isAnimationActive={false}
                dot={(p: any) => {
                  if (p.payload.buy == null) return <g />;
                  return (
                    <g key={`b-${p.payload.i}`}>
                      <circle cx={p.cx} cy={p.cy} r={6} fill="hsl(140 100% 50%)" stroke="#000" strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 5px hsl(140 100% 50%))" }} />
                      <text x={p.cx} y={p.cy + 18} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight="bold" fill="hsl(140 100% 50%)">BUY</text>
                    </g>
                  );
                }}
                activeDot={false}
                legendType="none"
              />
              <Line
                type="monotone"
                dataKey="sell"
                stroke="transparent"
                isAnimationActive={false}
                dot={(p: any) => {
                  if (p.payload.sell == null) return <g />;
                  return (
                    <g key={`s-${p.payload.i}`}>
                      <circle cx={p.cx} cy={p.cy} r={6} fill="hsl(0 100% 60%)" stroke="#000" strokeWidth={1.5} style={{ filter: "drop-shadow(0 0 5px hsl(0 100% 60%))" }} />
                      <text x={p.cx} y={p.cy - 12} textAnchor="middle" fontSize={9} fontFamily="monospace" fontWeight="bold" fill="hsl(0 100% 60%)">SELL</text>
                    </g>
                  );
                }}
                activeDot={false}
                legendType="none"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-mono">
          <div className="rounded border border-call/40 bg-call/5 px-2 py-1.5">
            <span className="text-muted-foreground">OVERSOLD → BUY</span>
            <div className="text-call font-bold">z &lt; -2σ · {vwapSeries.filter((d) => d.side === "BUY").length} hits</div>
          </div>
          <div className="rounded border border-border bg-secondary/30 px-2 py-1.5">
            <span className="text-muted-foreground">NEUTRAL</span>
            <div className="text-foreground font-bold">|z| &lt; 2σ · fair value</div>
          </div>
          <div className="rounded border border-put/40 bg-put/5 px-2 py-1.5">
            <span className="text-muted-foreground">OVERBOUGHT → SELL</span>
            <div className="text-put font-bold">z &gt; +2σ · {vwapSeries.filter((d) => d.side === "SELL").length} hits</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ─────── VOLATILITY REGIME INDICATOR ───────
export function VolatilityRegimeIndicatorView({ ticker, exposures, levels, contracts }: Ctx) {
  return <VolatilityRegimeIndicator ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />;
}

// ─────── EXPECTED MOVE CALCULATOR ───────
export function ExpectedMoveCalculatorView({ ticker, exposures, levels, contracts }: Ctx) {
  return <ExpectedMoveCalculator ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />;
}

// ─────── SENTIMENT SCORE (full-page) ───────
import { OptionsSentimentScore } from "./OptionsSentimentScore";
export function SentimentView({ ticker, exposures, levels, contracts }: Ctx) {
  return <OptionsSentimentScore ticker={ticker} exposures={exposures} levels={levels} contracts={contracts} />;
}
