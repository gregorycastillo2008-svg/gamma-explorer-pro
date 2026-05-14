import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { OptionContract } from "@/lib/gex";

interface Props {
  contracts:      OptionContract[];
  spot:           number;
  symbol:         string;
  regime:         "LOW" | "TRANSITION" | "HIGH";
  compositeScore: number;
}

const MONO = "JetBrains Mono, ui-monospace, monospace";

const REGIME_CFG = {
  LOW:        { color: "#22c55e", label: "LOW VOL",        bg: "#22c55e14" },
  TRANSITION: { color: "#facc15", label: "TRANSITION",     bg: "#facc1514" },
  HIGH:       { color: "#ef4444", label: "HIGH VOL",       bg: "#ef444414" },
};

export function VolRegimeSurface({ contracts, spot, symbol, regime, compositeScore }: Props) {
  const { termData, smileData, atmIv, termSlope, skew, nearDte } = useMemo(() => {
    // ── Term Structure ──────────────────────────────────────────────────────────
    const expiryMap = new Map<number, {
      atmSum: number; atmN: number;
      putSum: number; putN: number;
      callSum: number; callN: number;
    }>();

    for (const c of contracts) {
      if (c.iv <= 0 || c.expiry <= 0 || c.expiry > 180) continue;
      const step = spot * 0.02;
      const key = c.expiry;
      const cur = expiryMap.get(key) ?? { atmSum: 0, atmN: 0, putSum: 0, putN: 0, callSum: 0, callN: 0 };
      if (Math.abs(c.strike - spot) <= step * 1.5) {
        cur.atmSum += c.iv; cur.atmN++;
      }
      if (c.type === "put" && c.strike >= spot * 0.90 && c.strike < spot * 0.98) {
        cur.putSum += c.iv; cur.putN++;
      }
      if (c.type === "call" && c.strike > spot * 1.02 && c.strike <= spot * 1.10) {
        cur.callSum += c.iv; cur.callN++;
      }
      expiryMap.set(key, cur);
    }

    const termData = Array.from(expiryMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([dte, d]) => ({
        dte,
        atm:  d.atmN  > 0 ? +(d.atmSum  / d.atmN  * 100).toFixed(2) : null,
        put:  d.putN  > 0 ? +(d.putSum  / d.putN  * 100).toFixed(2) : null,
        call: d.callN > 0 ? +(d.callSum / d.callN * 100).toFixed(2) : null,
      }))
      .filter(d => d.atm !== null || d.put !== null);

    // ── Vol Smile ───────────────────────────────────────────────────────────────
    const nearDte = contracts
      .filter(c => c.expiry > 0)
      .reduce((m, c) => Math.min(m, c.expiry), Infinity);

    const smileMap = new Map<number, { sum: number; n: number }>();
    for (const c of contracts) {
      if (c.expiry !== nearDte || c.iv <= 0) continue;
      if (Math.abs(c.strike - spot) / spot > 0.14) continue;
      const cur = smileMap.get(c.strike) ?? { sum: 0, n: 0 };
      cur.sum += c.iv; cur.n++;
      smileMap.set(c.strike, cur);
    }
    const smileData = Array.from(smileMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([strike, { sum, n }]) => ({ strike, iv: +(sum / n * 100).toFixed(2) }));

    // ── Summary stats ────────────────────────────────────────────────────────────
    const first = termData[0];
    const last  = termData[termData.length - 1];
    const atmIv    = first?.atm ?? 0;
    const termSlope = last && first ? +((last.atm ?? 0) - (first.atm ?? 0)).toFixed(2) : 0;
    const skew     = first ? +((first.put ?? atmIv) - (first.call ?? atmIv)).toFixed(2) : 0;

    return { termData, smileData, atmIv, termSlope, skew, nearDte: isFinite(nearDte) ? nearDte : 0 };
  }, [contracts, spot]);

  const RC = REGIME_CFG[regime];

  const ttStyle = {
    contentStyle: {
      background: "#0a0a0a", border: "1px solid #1f2937",
      borderRadius: 4, fontFamily: MONO, fontSize: 9, padding: "5px 8px",
    },
    labelStyle:   { color: "#6b7280", fontFamily: MONO, fontSize: 9 },
    itemStyle:    { fontFamily: MONO, fontSize: 9 },
  };

  const axTick = { fontSize: 8, fill: "#374151", fontFamily: MONO };
  const axLine = { stroke: "#111111" };
  const grid   = <CartesianGrid strokeDasharray="2 4" stroke="#111111" />;

  // dynamic Y domains
  const allAtm = termData.map(d => d.atm ?? 0).filter(Boolean);
  const allIv  = smileData.map(d => d.iv);
  const termMin = allAtm.length ? Math.max(0, Math.min(...allAtm) - 2) : 0;
  const termMax = allAtm.length ? Math.max(...allAtm) + 3 : 50;
  const smileMin = allIv.length ? Math.max(0, Math.min(...allIv) - 2) : 0;
  const smileMax = allIv.length ? Math.max(...allIv) + 3 : 50;

  return (
    <div style={{ background: "#04080f", borderRadius: 6, overflow: "hidden", border: "1px solid #0e1a10" }}>

      {/* ── HEADER ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#060a0f", borderBottom: "1px solid #0e1a10",
        padding: "8px 12px", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#4b5563", letterSpacing: "0.14em", textTransform: "uppercase" }}>
          ◈ VOL REGIME SURFACE · {symbol}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Chip label="ATM IV"    value={`${atmIv.toFixed(1)}%`}
            color={atmIv > 28 ? "#ef4444" : atmIv < 14 ? "#22c55e" : "#94a3b8"} />
          <Chip label="TERM SLOPE" value={`${termSlope >= 0 ? "+" : ""}${termSlope.toFixed(1)}%`}
            color={termSlope < -1.5 ? "#ef4444" : termSlope > 2 ? "#22c55e" : "#94a3b8"} />
          <Chip label="PUT SKEW"  value={`${skew.toFixed(2)}%`}
            color={skew > 4 ? "#ef4444" : skew < 1 ? "#22c55e" : "#facc15"} />
          <div style={{
            fontFamily: MONO, fontSize: 8, padding: "2px 9px", borderRadius: 3,
            background: RC.bg, border: `1px solid ${RC.color}55`,
            color: RC.color, letterSpacing: "0.15em", fontWeight: 700,
          }}>
            {RC.label}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: 9, fontWeight: 900, color: RC.color,
            letterSpacing: "0.05em",
          }}>
            {compositeScore}<span style={{ fontSize: 7, color: "#374151", fontWeight: 400 }}>/100</span>
          </div>
        </div>
      </div>

      {/* ── CHARTS ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>

        {/* Left — Term Structure */}
        <div style={{ padding: "10px 12px 8px", borderRight: "1px solid #0e1a10" }}>
          <div style={{ fontFamily: MONO, fontSize: 8, color: "#374151", letterSpacing: "0.12em", marginBottom: 6, textTransform: "uppercase" }}>
            Term Structure — IV × DTE
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={termData} margin={{ top: 2, right: 6, left: -14, bottom: 0 }}>
              {grid}
              <XAxis dataKey="dte" tick={axTick} tickLine={false} axisLine={axLine}
                tickFormatter={v => `${v}d`} interval="preserveStartEnd" />
              <YAxis domain={[termMin, termMax]} tick={axTick} tickLine={false} axisLine={axLine}
                tickFormatter={v => `${v}%`} />
              <Tooltip
                {...ttStyle}
                formatter={(v: number, name: string) => [`${v.toFixed(2)}%`, name.toUpperCase()]}
                labelFormatter={(l: number) => `DTE: ${l}d`}
              />
              <Line dataKey="put"  name="Put"  stroke="#ef4444" strokeWidth={1.5} dot={false} connectNulls />
              <Line dataKey="atm"  name="ATM"  stroke="#22c55e" strokeWidth={2}   dot={false} connectNulls />
              <Line dataKey="call" name="Call" stroke="#4a9eff" strokeWidth={1.5} dot={false} connectNulls strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 4 }}>
            <Legend color="#ef4444" label="OTM Put" />
            <Legend color="#22c55e" label="ATM"     />
            <Legend color="#4a9eff" label="OTM Call" dashed />
          </div>
        </div>

        {/* Right — Vol Smile */}
        <div style={{ padding: "10px 12px 8px" }}>
          <div style={{ fontFamily: MONO, fontSize: 8, color: "#374151", letterSpacing: "0.12em", marginBottom: 6, textTransform: "uppercase" }}>
            Vol Smile — IV × Strike&nbsp;
            {nearDte > 0 && (
              <span style={{ color: "#1f2937" }}>({nearDte}d exp)</span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={smileData} margin={{ top: 2, right: 6, left: -14, bottom: 0 }}>
              {grid}
              <XAxis dataKey="strike" tick={axTick} tickLine={false} axisLine={axLine}
                tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
                interval="preserveStartEnd" />
              <YAxis domain={[smileMin, smileMax]} tick={axTick} tickLine={false} axisLine={axLine}
                tickFormatter={v => `${v}%`} />
              <ReferenceLine x={spot} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 3"
                label={{ value: "SPOT", position: "insideTopRight", fill: "#fbbf24", fontSize: 7, fontFamily: MONO }} />
              <Tooltip
                {...ttStyle}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "IV"]}
                labelFormatter={(l: number) => `$${Number(l).toLocaleString()}`}
              />
              <Line dataKey="iv" name="IV" stroke="#a78bfa" strokeWidth={2}
                dot={{ r: 2, fill: "#a78bfa", strokeWidth: 0 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 4 }}>
            <Legend color="#a78bfa" label="Vol Smile" />
            <Legend color="#fbbf24" label="Spot"      dashed />
          </div>
        </div>
      </div>

      {/* ── REGIME HEATSTRIP ─────────────────────────────────────────────────────── */}
      <RegimeHeatStrip termData={termData} regime={regime} />
    </div>
  );
}

// ── IV heat-strip: colour-coded IV level per expiry ─────────────────────────
function RegimeHeatStrip({ termData, regime }: {
  termData: { dte: number; atm: number | null }[];
  regime: "LOW" | "TRANSITION" | "HIGH";
}) {
  if (!termData.length) return null;
  const vals  = termData.map(d => d.atm ?? 0).filter(Boolean);
  const minV  = Math.min(...vals);
  const maxV  = Math.max(...vals);
  const range = Math.max(1, maxV - minV);

  return (
    <div style={{ borderTop: "1px solid #0e1a10", padding: "6px 12px 8px" }}>
      <div style={{ fontFamily: MONO, fontSize: 7, color: "#1f2937", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
        IV LEVEL BY EXPIRY
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 28 }}>
        {termData.map(d => {
          if (!d.atm) return null;
          const t = (d.atm - minV) / range;
          // colour: green → yellow → red
          const r = Math.round(lerp(34,  239, t));
          const g = Math.round(lerp(197, 68,  t));
          const b = Math.round(lerp(94,  68,  t));
          const h = Math.max(4, Math.round(t * 24));
          return (
            <div key={d.dte} title={`${d.dte}d: ${d.atm.toFixed(1)}%`}
              style={{
                flex: 1, height: h, borderRadius: 2,
                background: `rgb(${r},${g},${b})`,
                opacity: 0.75 + t * 0.25,
                cursor: "default",
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: MONO, fontSize: 7, color: "#1f2937" }}>
        <span>LOW IV</span><span>HIGH IV</span>
      </div>
    </div>
  );
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ fontFamily: MONO, textAlign: "center" }}>
      <div style={{ fontSize: 7, color: "#374151", letterSpacing: "0.1em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 16, height: 2,
        background: dashed ? "transparent" : color,
        borderTop: dashed ? `2px dashed ${color}` : "none",
      }} />
      <span style={{ fontFamily: MONO, fontSize: 8, color: "#374151" }}>{label}</span>
    </div>
  );
}
