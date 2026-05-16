import { useState, useMemo } from "react";
import { GexNetHorizontalChart } from "./GexNetHorizontalChart";
import { GexExposureTabs } from "./GexExposureTabs";
import { GexDexSurface3D } from "./GexDexSurface3D";
import { GexStrikeHeatmap } from "./GexStrikeHeatmap";

import {
  computeExposures, computeKeyLevels,
  type DemoTicker, type OptionContract,
} from "@/lib/gex";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from "recharts";

interface Props { ticker: DemoTicker; contracts: OptionContract[] }

type Tab = "heatmap" | "strike" | "surface" | "dealer" | "flows" | "scenario";

const TABS: { id: Tab; label: string; isNew?: boolean }[] = [
  { id: "heatmap",  label: "HEATMAP" },
  { id: "strike",   label: "STRIKE CHART" },
  { id: "surface",  label: "3D SURFACE" },
  { id: "dealer",   label: "DEALER FLOW",  isNew: true },
  { id: "flows",    label: "VANNA/CHARM",  isNew: true },
  { id: "scenario", label: "SCENARIO",     isNew: true },
];

const C = { bg: "#0a0a0a", border: "#1f1f1f", green: "#10b981", muted: "#555" };
const FONT = `"JetBrains Mono", ui-monospace, monospace`;

const fmtB = (n: number) => {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "+";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
};

// ── Shared card ────────────────────────────────────────────────────
function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#04080f", border: "1px solid #0e1a10", borderRadius: 6, padding: "10px 12px" }}>
      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: C.green, marginBottom: 2 }}>
        {title}
      </div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginBottom: 8 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Stat({ label, value, col = "#ccc", sub }: { label: string; value: string; col?: string; sub?: string }) {
  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ fontSize: 8, color: C.muted, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: col, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.muted }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL 1 — DEALER FLOW
// Answers: how are dealers hedging RIGHT NOW, and what triggers their
// next big rebalance?
// ══════════════════════════════════════════════════════════════════
function DealerFlowPanel({ ticker, contracts }: Props) {
  const spot = ticker.spot;
  const exposures = useMemo(() => computeExposures(spot, contracts), [spot, contracts]);
  const levels    = useMemo(() => computeKeyLevels(exposures), [exposures]);

  const totalNetGex  = levels.totalGex;
  const isPositive   = totalNetGex >= 0;
  const totalAbsGex  = exposures.reduce((s, p) => s + Math.abs(p.netGex), 0);

  // Dealer hedge $ for 1% price move
  const hedgePerPct = Math.abs(totalNetGex) * 0.01;

  // GEX Concentration (Herfindahl-Hirschman Index, 0–1)
  const hhi = totalAbsGex > 0
    ? exposures.reduce((s, p) => s + (p.netGex / totalAbsGex) ** 2, 0)
    : 0;
  const pinStrength = Math.round(hhi * 100); // 0 = dispersed, 100 = all at one strike

  // Distance to flip (%)
  const distFlip = levels.gammaFlip
    ? ((spot - levels.gammaFlip) / spot) * 100
    : null;

  // Top 5 rebalancing hotspots (highest |netGex| strikes)
  const hotspots = [...exposures]
    .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
    .slice(0, 5);

  // Bar chart data: net GEX by strike, ±8% window
  const barData = exposures
    .filter(p => Math.abs(p.strike - spot) / spot < 0.07)
    .sort((a, b) => a.strike - b.strike)
    .map(p => ({ k: p.strike, v: p.netGex / 1e6, atm: Math.abs(p.strike - spot) < ticker.strikeStep / 2 }));

  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1 pb-2">
      {/* Dealer mode hero */}
      <Card title="DEALER HEDGING MODE" sub="Based on net gamma exposure sign at current spot">
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{
            padding: "10px 20px", borderRadius: 6,
            background: isPositive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${isPositive ? "#10b981" : "#ef4444"}`,
            fontFamily: FONT, fontWeight: 900, fontSize: 18,
            color: isPositive ? "#10b981" : "#ef4444",
            letterSpacing: "0.1em",
          }}>
            {isPositive ? "↕ STABILIZING" : "↕ AMPLIFYING"}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 9, color: C.muted, maxWidth: 260, lineHeight: "15px" }}>
            {isPositive
              ? "Dealers are LONG gamma → they sell into rallies and buy into dips, dampening price moves. Expect mean-reversion behavior near key strikes."
              : "Dealers are SHORT gamma → they buy into rallies and sell into dips, amplifying price moves. Expect trending behavior and wider ranges."}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat label="NET GEX"        value={fmtB(totalNetGex)} col={isPositive ? "#10b981" : "#ef4444"} sub="total dealer gamma $" />
          <Stat label="HEDGE PER 1%"   value={fmtB(hedgePerPct)} col="#facc15" sub="$ dealers buy/sell per 1% move" />
          <Stat label="PIN STRENGTH"   value={`${pinStrength}/100`} col={pinStrength > 60 ? "#10b981" : "#888"} sub="GEX concentration (HHI)" />
          <Stat label="DIST TO FLIP"   value={distFlip != null ? `${distFlip.toFixed(2)}%` : "–"}
            col={distFlip != null && Math.abs(distFlip) < 1 ? "#f59e0b" : "#888"}
            sub={distFlip != null ? (distFlip > 0 ? "above γ flip" : "below γ flip") : "n/a"} />
        </div>
      </Card>

      {/* Net GEX bar chart */}
      <Card title="NET GEX BY STRIKE" sub="Dealer gamma exposure · ±7% window · green=positive / red=negative">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#0e1a10" />
              <XAxis dataKey="k" tick={{ fill: C.muted, fontSize: 8, fontFamily: FONT }}
                tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
              <YAxis tick={{ fill: C.muted, fontSize: 8, fontFamily: FONT }}
                tickFormatter={v => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(0)}M`} />
              <Tooltip
                contentStyle={{ background: "#04080f", border: "1px solid #0e1a10", fontFamily: FONT, fontSize: 10 }}
                labelFormatter={l => `Strike $${l}`}
                formatter={(v: number) => [`${fmtB(v * 1e6)}`, "Net GEX"]}
              />
              <ReferenceLine y={0} stroke="#1f1f1f" />
              <ReferenceLine x={spot} stroke="#e8963a" strokeDasharray="3 3"
                label={{ value: "SPOT", fill: "#e8963a", fontSize: 8, fontFamily: FONT }} />
              <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                {barData.map((d, i) => (
                  <Cell key={i}
                    fill={d.atm ? "#facc15" : d.v >= 0 ? "#10b981" : "#ef4444"}
                    opacity={d.atm ? 1 : 0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Rebalancing hotspots */}
      <Card title="TOP REBALANCING HOTSPOTS" sub="Strikes where a price touch triggers the heaviest dealer hedging">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
          {hotspots.map((p, i) => {
            const distPct = ((p.strike - spot) / spot * 100);
            const col = p.netGex >= 0 ? "#10b981" : "#ef4444";
            return (
              <div key={p.strike} style={{
                background: "#010508", border: `1px solid ${col}33`,
                borderRadius: 4, padding: "6px 8px", fontFamily: FONT, textAlign: "center",
              }}>
                <div style={{ fontSize: 8, color: C.muted }}>#{i + 1}</div>
                <div style={{ fontSize: 12, fontWeight: 900, color: col }}>${p.strike}</div>
                <div style={{ fontSize: 8, color: col }}>{fmtB(p.netGex)}</div>
                <div style={{ fontSize: 8, color: C.muted }}>{distPct >= 0 ? "+" : ""}{distPct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Gamma flip proximity */}
      {levels.gammaFlip != null && (
        <Card title="GAMMA FLIP PROXIMITY" sub="Distance between spot and the zero-gamma level">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT, fontSize: 8, color: C.muted, marginBottom: 3 }}>
                <span style={{ color: "#ef4444" }}>NEG γ ← {levels.gammaFlip}</span>
                <span style={{ color: "#10b981" }}>→ POS γ</span>
              </div>
              <div style={{ height: 8, background: "#0e1a10", borderRadius: 4, position: "relative", overflow: "hidden" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: "50%", background: "linear-gradient(90deg, #ef444433, #ef444411)",
                }} />
                <div style={{
                  position: "absolute", right: 0, top: 0, bottom: 0,
                  width: "50%", background: "linear-gradient(90deg, #10b98111, #10b98133)",
                }} />
                {/* Spot indicator */}
                <div style={{
                  position: "absolute", top: 0, bottom: 0, width: 2, borderRadius: 2,
                  left: `${Math.max(5, Math.min(95, 50 + (distFlip ?? 0) * 5))}%`,
                  background: distFlip != null && Math.abs(distFlip) < 1 ? "#f59e0b" : "#facc15",
                  boxShadow: "0 0 6px #facc15",
                  transform: "translateX(-50%)",
                }} />
              </div>
              <div style={{ textAlign: "center", fontFamily: FONT, fontSize: 9, fontWeight: 700,
                color: distFlip != null && Math.abs(distFlip) < 1 ? "#f59e0b" : "#888", marginTop: 4 }}>
                {distFlip != null ? `SPOT is ${Math.abs(distFlip).toFixed(2)}% ${distFlip > 0 ? "ABOVE" : "BELOW"} γ flip` : "–"}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL 2 — VANNA / CHARM FLOWS
// Answers: without any price move, what systematic buying/selling
// pressure do dealers face today from (1) time decay and (2) vol moves?
// ══════════════════════════════════════════════════════════════════
function VannaCharmPanel({ ticker, contracts }: Props) {
  const spot = ticker.spot;
  const exposures = useMemo(() => computeExposures(spot, contracts), [spot, contracts]);

  // Total charm ($ delta change per calendar day)
  const totalCharm = exposures.reduce((s, p) => s + p.charm, 0);
  // Total vanna ($ delta change per 1% IV move)
  const totalVanna = exposures.reduce((s, p) => s + p.vanna, 0);

  // Charm by expiry group
  const charmByExpiry = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contracts) {
      const key = c.expiry === 0 ? "0DTE" : c.expiry <= 7 ? "≤7DTE" : c.expiry <= 30 ? "≤30DTE" : ">30DTE";
      const exp = computeExposures(spot, [c]);
      const ch = exp.reduce((s, p) => s + p.charm, 0);
      map.set(key, (map.get(key) ?? 0) + ch);
    }
    return [
      { label: "0DTE",   value: map.get("0DTE") ?? 0 },
      { label: "≤7DTE",  value: map.get("≤7DTE") ?? 0 },
      { label: "≤30DTE", value: map.get("≤30DTE") ?? 0 },
      { label: ">30DTE", value: map.get(">30DTE") ?? 0 },
    ];
  }, [contracts, spot]);

  // Vanna by strike (for chart)
  const vannaByStrike = exposures
    .filter(p => Math.abs(p.strike - spot) / spot < 0.06)
    .sort((a, b) => a.strike - b.strike)
    .map(p => ({ k: p.strike, v: p.vanna / 1e6 }));

  const charmCol  = totalCharm < 0 ? "#10b981" : "#ef4444";
  const vannaCol  = totalVanna >= 0 ? "#22d3ee" : "#f59e0b";

  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1 pb-2">
      {/* Hero: expected flows */}
      <Card title="SYSTEMATIC DEALER FLOWS" sub="Flows that occur WITHOUT any price move — pure time & vol effects">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Charm */}
          <div style={{ background: "#010508", border: `1px solid ${charmCol}33`, borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ fontFamily: FONT, fontSize: 9, color: C.muted, marginBottom: 4, letterSpacing: "0.1em" }}>
              CHARM FLOW · ∂Δ/∂t
            </div>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 900, color: charmCol }}>{fmtB(totalCharm)}</div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginTop: 2 }}>expected dealer buy/sell TODAY from time decay alone</div>
            <div style={{ fontFamily: FONT, fontSize: 9, color: charmCol, marginTop: 6, fontWeight: 700 }}>
              {totalCharm < 0 ? "→ Dealers must BUY to re-hedge (bullish time pressure)" : "→ Dealers must SELL to re-hedge (bearish time pressure)"}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginTop: 4, lineHeight: "14px" }}>
              As short-term options decay through the day, dealers' delta positions shift — requiring hedging adjustments even if price doesn't move.
            </div>
          </div>

          {/* Vanna */}
          <div style={{ background: "#010508", border: `1px solid ${vannaCol}33`, borderRadius: 6, padding: "10px 14px" }}>
            <div style={{ fontFamily: FONT, fontSize: 9, color: C.muted, marginBottom: 4, letterSpacing: "0.1em" }}>
              VANNA FLOW · ∂Δ/∂σ
            </div>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 900, color: vannaCol }}>{fmtB(totalVanna)}</div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginTop: 2 }}>expected dealer buy/sell per +1% IV move</div>
            <div style={{ fontFamily: FONT, fontSize: 9, color: vannaCol, marginTop: 6, fontWeight: 700 }}>
              {totalVanna >= 0 ? `IV ↑1% → dealers BUY ${fmtB(totalVanna)}` : `IV ↑1% → dealers SELL ${fmtB(Math.abs(totalVanna))}`}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginTop: 4, lineHeight: "14px" }}>
              When IV compresses (VIX falling), vanna creates systematic selling. When IV spikes, it reverses — crucial for gap/crush moves.
            </div>
          </div>
        </div>

        {/* IV scenarios */}
        <div style={{ marginTop: 12 }}>
          <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: "0.1em", marginBottom: 6 }}>
            VANNA SCENARIO — IV CHANGE IMPACT
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[-5, -3, -1, +1, +3, +5].map(dIv => {
              const flow = totalVanna * dIv;
              const col  = flow < 0 ? "#ef4444" : "#10b981";
              return (
                <div key={dIv} style={{
                  background: "#010508", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "5px 10px", textAlign: "center", fontFamily: FONT, minWidth: 72,
                }}>
                  <div style={{ fontSize: 8, color: C.muted }}>IV {dIv >= 0 ? "+" : ""}{dIv}%</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: col }}>{fmtB(flow)}</div>
                  <div style={{ fontSize: 7, color: col }}>{flow >= 0 ? "BUY" : "SELL"}</div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Charm by expiry */}
      <Card title="CHARM FLOW BY EXPIRY" sub="Which expiry bucket contributes most to today's time-decay dealer flow">
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charmByExpiry} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#0e1a10" />
              <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 9, fontFamily: FONT }} />
              <YAxis tick={{ fill: C.muted, fontSize: 8, fontFamily: FONT }}
                tickFormatter={v => fmtB(Number(v))} />
              <Tooltip contentStyle={{ background: "#04080f", border: "1px solid #0e1a10", fontFamily: FONT, fontSize: 10 }}
                formatter={(v: number) => [fmtB(v), "Charm $"]} />
              <ReferenceLine y={0} stroke="#1f1f1f" />
              <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                {charmByExpiry.map((d, i) => (
                  <Cell key={i} fill={d.value < 0 ? "#10b981" : "#ef4444"} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Vanna by strike */}
      <Card title="VANNA EXPOSURE BY STRIKE" sub="Delta sensitivity to IV per strike · ±6% window">
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vannaByStrike} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#0e1a10" />
              <XAxis dataKey="k" tick={{ fill: C.muted, fontSize: 8, fontFamily: FONT }}
                tickFormatter={v => `$${v}`} interval="preserveStartEnd" />
              <YAxis tick={{ fill: C.muted, fontSize: 8, fontFamily: FONT }}
                tickFormatter={v => `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}M`} />
              <Tooltip contentStyle={{ background: "#04080f", border: "1px solid #0e1a10", fontFamily: FONT, fontSize: 10 }}
                labelFormatter={l => `Strike $${l}`}
                formatter={(v: number) => [fmtB(v * 1e6), "Vanna per 1% IV"]} />
              <ReferenceLine y={0} stroke="#1f1f1f" />
              <ReferenceLine x={spot} stroke="#e8963a" strokeDasharray="3 3"
                label={{ value: "SPOT", fill: "#e8963a", fontSize: 8 }} />
              <Bar dataKey="v" radius={[2, 2, 0, 0]}>
                {vannaByStrike.map((d, i) => (
                  <Cell key={i} fill={d.v >= 0 ? "#22d3ee" : "#f59e0b"} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// PANEL 3 — SCENARIO ANALYSIS
// Answers: if price moves to X, what gamma regime am I in, how are
// dealers positioned, and how far am I from key walls?
// ══════════════════════════════════════════════════════════════════
function ScenarioPanel({ ticker, contracts }: Props) {
  const spot = ticker.spot;
  const exposures = useMemo(() => computeExposures(spot, contracts), [spot, contracts]);
  const levels    = useMemo(() => computeKeyLevels(exposures), [exposures]);

  const scenarios = useMemo(() => {
    const pcts = [-5, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 5];
    return pcts.map(pct => {
      const scenarioPrice = spot * (1 + pct / 100);

      // Local GEX at this price: sum net GEX of strikes within ±2%
      const localGex = exposures
        .filter(p => Math.abs(p.strike - scenarioPrice) / scenarioPrice < 0.02)
        .reduce((s, p) => s + p.netGex, 0);

      // Cumulative GEX (all strikes if price were here)
      const aboveFlip = levels.gammaFlip != null ? scenarioPrice > levels.gammaFlip : null;
      const isPos     = localGex >= 0;

      const distCallWall = levels.callWall ? ((levels.callWall - scenarioPrice) / scenarioPrice * 100) : null;
      const distPutWall  = levels.putWall  ? ((scenarioPrice - levels.putWall)  / scenarioPrice * 100) : null;

      return {
        pct,
        price: scenarioPrice,
        localGex,
        isPos,
        aboveFlip,
        distCallWall,
        distPutWall,
        mode: isPos ? "STABILIZING" : "AMPLIFYING",
      };
    });
  }, [exposures, levels, spot]);

  const current = scenarios.find(s => s.pct === 0)!;

  return (
    <div className="space-y-3 h-full overflow-y-auto pr-1 pb-2">
      <Card title="PRICE SCENARIO STRESS TEST"
        sub="For each price target: local gamma regime, dealer mode, distance from key walls">
        {/* Legend */}
        <div style={{ display: "flex", gap: 12, marginBottom: 10, fontFamily: FONT, fontSize: 8, color: C.muted, flexWrap: "wrap" }}>
          <span><span style={{ color: "#10b981" }}>■</span> POS γ — stabilizing</span>
          <span><span style={{ color: "#ef4444" }}>■</span> NEG γ — amplifying</span>
          <span><span style={{ color: "#facc15" }}>■</span> CURRENT SPOT</span>
          <span><span style={{ color: "#e8963a" }}>⬤</span> = above γ flip</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: 10 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #0e1a10" }}>
                {["MOVE", "PRICE", "LOCAL GEX", "REGIME", "MODE", "γ FLIP", "CALL WALL", "PUT WALL"].map(h => (
                  <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: "0.1em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scenarios.map(s => {
                const isCurrent = s.pct === 0;
                const rowBg = isCurrent ? "rgba(250,204,21,0.06)" : "transparent";
                const gexCol = s.isPos ? "#10b981" : "#ef4444";
                return (
                  <tr key={s.pct} style={{ background: rowBg, borderBottom: "1px solid #0a0f0a" }}>
                    <td style={{ padding: "5px 8px", color: s.pct < 0 ? "#ef4444" : s.pct > 0 ? "#10b981" : "#facc15", fontWeight: 700 }}>
                      {s.pct >= 0 ? "+" : ""}{s.pct}%
                    </td>
                    <td style={{ padding: "5px 8px", color: isCurrent ? "#facc15" : "#ccc", fontWeight: isCurrent ? 700 : 400 }}>
                      ${s.price.toFixed(0)}
                      {isCurrent && <span style={{ color: "#facc15", fontSize: 8 }}> ●</span>}
                    </td>
                    <td style={{ padding: "5px 8px", color: gexCol, fontWeight: 700 }}>
                      {fmtB(s.localGex)}
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      <span style={{
                        background: gexCol + "22", color: gexCol,
                        border: `1px solid ${gexCol}44`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>
                        {s.isPos ? "POS γ" : "NEG γ"}
                      </span>
                    </td>
                    <td style={{ padding: "5px 8px", color: gexCol, fontSize: 9 }}>{s.mode}</td>
                    <td style={{ padding: "5px 8px" }}>
                      {s.aboveFlip == null
                        ? <span style={{ color: C.muted }}>–</span>
                        : s.aboveFlip
                          ? <span style={{ color: "#e8963a" }}>✓ ABOVE</span>
                          : <span style={{ color: "#888" }}>✗ BELOW</span>}
                    </td>
                    <td style={{ padding: "5px 8px", color: s.distCallWall != null && s.distCallWall < 1 ? "#f59e0b" : "#888" }}>
                      {s.distCallWall != null ? `${s.distCallWall.toFixed(1)}% away` : "–"}
                    </td>
                    <td style={{ padding: "5px 8px", color: s.distPutWall != null && s.distPutWall < 1 ? "#f59e0b" : "#888" }}>
                      {s.distPutWall != null ? `${s.distPutWall.toFixed(1)}% away` : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary callout */}
      <Card title="SCENARIO SUMMARY" sub="Key structural observations">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            {
              label: "Gamma Flip Level",
              value: levels.gammaFlip ? `$${levels.gammaFlip}` : "–",
              col: "#facc15",
              desc: "Price must cross this to change dealer regime",
            },
            {
              label: "Current Dealer Mode",
              value: current.mode,
              col: current.isPos ? "#10b981" : "#ef4444",
              desc: current.isPos ? "Selling into rallies, buying dips" : "Buying into rallies, selling dips",
            },
            {
              label: "Call Wall",
              value: levels.callWall ? `$${levels.callWall}` : "–",
              col: "#10b981",
              desc: "Heaviest dealer call resistance above spot",
            },
            {
              label: "Put Wall",
              value: levels.putWall ? `$${levels.putWall}` : "–",
              col: "#ef4444",
              desc: "Heaviest dealer put support below spot",
            },
          ].map(item => (
            <div key={item.label} style={{ background: "#010508", border: "1px solid #0e1a10", borderRadius: 4, padding: "8px 10px" }}>
              <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, letterSpacing: "0.08em" }}>{item.label}</div>
              <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 900, color: item.col }}>{item.value}</div>
              <div style={{ fontFamily: FONT, fontSize: 8, color: C.muted, marginTop: 2, lineHeight: "13px" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// GAMMA EXPOSURE PANEL (left panel) — con filtro por días 0D–5D
// ══════════════════════════════════════════════════════════════════
const DAY_FILTERS = ["ALL", "0D", "1D", "2D", "3D", "4D", "5D"] as const;
type DayFilter = typeof DAY_FILTERS[number];

const FBAR = `"Courier New", monospace`;

// Calendar DTE → trading DTE (skips weekends so "1D" = next trading day)
function calToTradingDTE(calDTE: number): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(today);
  for (let i = 0; i < calDTE; i++) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function GammaExposurePanel({ ticker, contracts }: Props) {
  const [dayFilter, setDayFilter] = useState<DayFilter>("ALL");

  // Map each unique calendar DTE → trading DTE once per contracts change
  const tradingDTEMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const c of contracts) {
      if (!map.has(c.expiry)) map.set(c.expiry, calToTradingDTE(c.expiry));
    }
    return map;
  }, [contracts]);

  const availableDays = useMemo(() => {
    const s = new Set<number>();
    for (const tDTE of tradingDTEMap.values()) {
      if (tDTE >= 0 && tDTE <= 5) s.add(tDTE);
    }
    return s;
  }, [tradingDTEMap]);

  const filtered = useMemo(() => {
    if (dayFilter === "ALL") return contracts;
    const day = parseInt(dayFilter);
    return contracts.filter(c => (tradingDTEMap.get(c.expiry) ?? -1) === day);
  }, [contracts, dayFilter, tradingDTEMap]);

  const exposures = useMemo(() => computeExposures(ticker.spot, filtered), [ticker.spot, filtered]);
  const levels    = useMemo(() => computeKeyLevels(exposures), [exposures]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#080810", border: "1px solid #0d0d1a", borderRadius: 4, overflow: "hidden" }}>
      {/* ── Day filter bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 3, padding: "5px 8px",
        borderBottom: "1px solid #0d0d1a", flexShrink: 0, background: "#000",
      }}>
        <span style={{ fontFamily: FBAR, fontSize: 7.5, color: "#252535", letterSpacing: "0.18em", textTransform: "uppercase", marginRight: 4 }}>
          EXP
        </span>
        {DAY_FILTERS.map(f => {
          const day     = f === "ALL" ? -1 : parseInt(f);
          const avail   = f === "ALL" || availableDays.has(day);
          const active  = dayFilter === f;
          return (
            <button
              key={f}
              onClick={() => avail && setDayFilter(f)}
              style={{
                fontFamily: FBAR,
                fontSize: 8.5,
                letterSpacing: "0.08em",
                padding: "2px 7px",
                borderRadius: 3,
                border: `1px solid ${active ? "#00ff44" : avail ? "#2a4a30" : "#111118"}`,
                background: active ? "rgba(0,255,68,0.10)" : "transparent",
                color: active ? "#00ff44" : avail ? "#4d8060" : "#202020",
                cursor: avail ? "pointer" : "default",
                fontWeight: active ? 700 : 400,
                transition: "all 0.12s",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* ── Gamma chart ── */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <GexNetHorizontalChart
          exposures={exposures}
          spot={ticker.spot}
          gammaFlip={levels.gammaFlip}
          callWall={levels.callWall}
          putWall={levels.putWall}
          contracts={filtered}
          height="100%"
          solidColors
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN WORKSPACE
// ══════════════════════════════════════════════════════════════════
export function GexDexWorkspace({ ticker, contracts }: Props) {
  const [tab, setTab] = useState<Tab>("heatmap");
  const isNewTab  = tab === "dealer" || tab === "flows" || tab === "scenario";
  const isFullTab = tab === "surface";

  const surfaceExposures = useMemo(() => computeExposures(ticker.spot, contracts), [ticker.spot, contracts]);
  const surfaceLevels    = useMemo(() => computeKeyLevels(surfaceExposures), [surfaceExposures]);

  return (
    <div className="w-full h-full flex flex-col" style={{ background: C.bg, fontFamily: FONT }}>
      {/* Tabs bar */}
      <div className="flex items-center gap-1 px-3 pt-2 shrink-0 overflow-x-auto"
        style={{ borderBottom: `1px solid ${C.border}`, background: "#000" }}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative shrink-0"
              style={{
                color: active ? C.green : t.isNew ? "#22d3ee88" : C.muted,
                background: active ? "rgba(16,185,129,0.06)" : "transparent",
                borderTop: `1px solid ${active ? C.green : "transparent"}`,
                borderLeft: `1px solid ${active ? C.border : "transparent"}`,
                borderRight: `1px solid ${active ? C.border : "transparent"}`,
                borderBottom: active ? `1px solid ${C.bg}` : "none",
                marginBottom: -1,
              }}>
              {t.label}
              {t.isNew && !active && (
                <span style={{
                  marginLeft: 4, fontSize: 7, background: "#22d3ee22",
                  color: "#22d3ee", border: "1px solid #22d3ee44",
                  borderRadius: 3, padding: "0 3px", verticalAlign: "middle",
                }}>NEW</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isNewTab ? (
          <div className="h-full overflow-y-auto p-2">
            {tab === "dealer"   && <DealerFlowPanel   ticker={ticker} contracts={contracts} />}
            {tab === "flows"    && <VannaCharmPanel   ticker={ticker} contracts={contracts} />}
            {tab === "scenario" && <ScenarioPanel     ticker={ticker} contracts={contracts} />}
          </div>
        ) : isFullTab ? (
          <div className="h-full p-2 grid grid-cols-2 gap-2">
            <GexDexSurface3D
              contracts={contracts}
              spot={ticker.spot}
              symbol={ticker.symbol}
              callWall={surfaceLevels.callWall}
              putWall={surfaceLevels.putWall}
              gammaFlip={surfaceLevels.gammaFlip}
              defaultMetric="gex"
            />
            <GexDexSurface3D
              contracts={contracts}
              spot={ticker.spot}
              symbol={ticker.symbol}
              callWall={surfaceLevels.callWall}
              putWall={surfaceLevels.putWall}
              gammaFlip={surfaceLevels.gammaFlip}
              defaultMetric="dex"
            />
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-2 p-2">
            <div className="min-h-0"><GammaExposurePanel ticker={ticker} contracts={contracts} /></div>
            <div className="min-h-0">
              {tab === "heatmap" && <GexStrikeHeatmap ticker={ticker} contracts={contracts} />}
              {tab === "strike"  && <GexExposureTabs  ticker={ticker} contracts={contracts} metric="netGex" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
