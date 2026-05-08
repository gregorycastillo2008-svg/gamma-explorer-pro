/**
 * Monte Carlo Price Simulation — Geometric Brownian Motion
 * dS = S · exp((μ − σ²/2)·dt + σ·√dt·Z)
 * Uses ATM implied volatility computed from the real options chain.
 */
import { useMemo, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { DemoTicker, OptionContract } from "@/lib/gex";

// ─── constants ───────────────────────────────────────────────────────────────
const N_DAYS   = 252;
const DRIFT    = 0.04; // annual drift (risk-neutral ~0, slight positive bias)

const PATH_COLORS = [
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#f97316", // orange
  "#a855f7", // purple
  "#a16207", // amber-brown
  "#84cc16", // lime
  "#9ca3af", // gray
  "#f43f5e", // rose
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#fb923c", // light orange
  "#4ade80", // light green
  "#60a5fa", // light blue
  "#f472b6", // light pink
  "#facc15", // yellow
  "#34d399", // emerald
  "#c084fc", // light purple
];

// ─── RNG (seeded LCG) ────────────────────────────────────────────────────────
function makeRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller → standard normal
function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── simulation ──────────────────────────────────────────────────────────────
function runMonteCarlo(
  spot: number,
  iv: number,       // decimal annual IV
  nPaths: number,
  seed: number,
): number[][] {
  const rng   = makeRng(seed);
  const dt    = 1 / 252;
  const drift = (DRIFT - 0.5 * iv * iv) * dt;
  const volDt = iv * Math.sqrt(dt);
  const paths: number[][] = [];

  for (let p = 0; p < nPaths; p++) {
    const path = new Array<number>(N_DAYS + 1);
    path[0] = spot;
    for (let d = 1; d <= N_DAYS; d++) {
      path[d] = path[d - 1] * Math.exp(drift + volDt * gauss(rng));
    }
    paths.push(path);
  }
  return paths;
}

// ─── types ───────────────────────────────────────────────────────────────────
interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const values: number[] = payload.map((p: any) => p.value as number).filter(Boolean);
  if (!values.length) return null;
  const hi   = Math.max(...values);
  const lo   = Math.min(...values);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    <div style={{
      background: "rgba(6,6,6,0.97)",
      border: "1px solid #1f1f1f",
      borderRadius: 4,
      padding: "8px 12px",
      fontFamily: "'Courier New', monospace",
      fontSize: 10,
      minWidth: 150,
      boxShadow: "0 0 16px rgba(6,182,212,0.12)",
    }}>
      <div style={{ color: "#6b7280", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>
        Day {label}
      </div>
      <div style={{ color: "#06b6d4" }}>Mean  ${fmt(mean)}</div>
      <div style={{ color: "#22c55e" }}>High  ${fmt(hi)}</div>
      <div style={{ color: "#ef4444" }}>Low   ${fmt(lo)}</div>
      <div style={{ color: "#6b7280", fontSize: 8, marginTop: 4 }}>{values.length} paths</div>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────
export function MonteCarloSimulation({ ticker, contracts }: Props) {
  const [nPaths, setNPaths] = useState(10);
  const [seed,   setSeed]   = useState(42);
  const [showMean, setShowMean] = useState(true);
  const [showBands, setShowBands] = useState(true);

  // ── compute ATM IV from real contracts ──────────────────────────────────────
  const atmIv = useMemo(() => {
    const near = contracts.filter(
      (c) => Math.abs(c.strike - ticker.spot) <= ticker.strikeStep * 2,
    );
    if (!near.length) return ticker.baseIV;
    return near.reduce((s, c) => s + c.iv, 0) / near.length;
  }, [contracts, ticker]);

  // ── run simulation ──────────────────────────────────────────────────────────
  const paths = useMemo(
    () => runMonteCarlo(ticker.spot, atmIv, nPaths, seed),
    [ticker.spot, atmIv, nPaths, seed],
  );

  // ── compute mean + 1σ bands (across all paths, per day) ────────────────────
  const { chartData, meanPath, upperBand, lowerBand } = useMemo(() => {
    const meanPath: number[] = [];
    const upperBand: number[] = [];
    const lowerBand: number[] = [];
    const chartData: Record<string, number>[] = [];

    for (let d = 0; d <= N_DAYS; d++) {
      const vals = paths.map((p) => p[d]);
      const mu   = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sigma = Math.sqrt(vals.reduce((s, v) => s + (v - mu) ** 2, 0) / vals.length);

      meanPath.push(mu);
      upperBand.push(mu + sigma);
      lowerBand.push(Math.max(0, mu - sigma));

      const point: Record<string, number> = { day: d, mean: mu, upper: mu + sigma, lower: Math.max(0, mu - sigma) };
      paths.forEach((p, i) => { point[`p${i}`] = p[d]; });
      chartData.push(point);
    }
    return { chartData, meanPath, upperBand, lowerBand };
  }, [paths]);

  // ── final-day stats ─────────────────────────────────────────────────────────
  const finalStats = useMemo(() => {
    const finals = paths.map((p) => p[N_DAYS]);
    const mu    = finals.reduce((a, b) => a + b, 0) / finals.length;
    const sigma = Math.sqrt(finals.reduce((s, v) => s + (v - mu) ** 2, 0) / finals.length);
    const pAbove = finals.filter((v) => v > ticker.spot).length / finals.length;
    return {
      mean:  mu,
      upper: mu + sigma,
      lower: Math.max(0, mu - sigma),
      max:   Math.max(...finals),
      min:   Math.min(...finals),
      pAbove,
    };
  }, [paths, ticker.spot]);

  const regenerate = useCallback(() => setSeed((s) => s + 1), []);

  const yDomain = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const d of chartData) {
      for (let i = 0; i < nPaths; i++) {
        const v = d[`p${i}`] as number;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const pad = (hi - lo) * 0.06;
    return [Math.floor((lo - pad) / 5) * 5, Math.ceil((hi + pad) / 5) * 5];
  }, [chartData, nPaths]);

  return (
    <div style={{
      background: "#050505",
      border: "1px solid #1a1a1a",
      borderRadius: 6,
      padding: "16px 16px 12px",
      fontFamily: "'Courier New', monospace",
    }}>
      {/* ── header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ color: "#e5e7eb", fontSize: 13, fontWeight: 700, letterSpacing: "0.04em" }}>
            Predicted Price — 1 YR Simulation
          </div>
          <div style={{ color: "#6b7280", fontSize: 9, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {ticker.symbol} · Spot ${ticker.spot.toLocaleString()} · ATM IV {(atmIv * 100).toFixed(1)}% · Sample of {nPaths} runs
          </div>
        </div>

        {/* controls */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {/* N paths */}
          {([5, 10, 20] as const).map((n) => (
            <button
              key={n}
              onClick={() => setNPaths(n)}
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 9,
                padding: "3px 8px",
                borderRadius: 3,
                border: "1px solid",
                cursor: "pointer",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                background: nPaths === n ? "#1a1a1a" : "transparent",
                color:      nPaths === n ? "#e5e7eb" : "#444",
                borderColor: nPaths === n ? "#333" : "#1a1a1a",
                transition: "all 0.15s",
              }}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setShowMean((v) => !v)}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 3,
              border: "1px solid",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: showMean ? "#1a1a1a" : "transparent",
              color:      showMean ? "#06b6d4" : "#444",
              borderColor: showMean ? "#0e4a5a" : "#1a1a1a",
              transition: "all 0.15s",
            }}
          >
            MEAN
          </button>
          <button
            onClick={() => setShowBands((v) => !v)}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 3,
              border: "1px solid",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: showBands ? "#1a1a1a" : "transparent",
              color:      showBands ? "#a78bfa" : "#444",
              borderColor: showBands ? "#3b2a6e" : "#1a1a1a",
              transition: "all 0.15s",
            }}
          >
            1σ
          </button>
          <button
            onClick={regenerate}
            style={{
              fontFamily: "'Courier New', monospace",
              fontSize: 9,
              padding: "3px 10px",
              borderRadius: 3,
              border: "1px solid #1f3a1f",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: "#0a1a0a",
              color: "#22c55e",
              transition: "all 0.15s",
            }}
          >
            ↺ NEW
          </button>
        </div>
      </div>

      {/* ── chart ── */}
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
            <CartesianGrid stroke="#0d0d0d" strokeDasharray="0" />
            <XAxis
              dataKey="day"
              tick={{ fill: "#444", fontSize: 9, fontFamily: "'Courier New', monospace" }}
              axisLine={{ stroke: "#1a1a1a" }}
              tickLine={false}
              label={{ value: "Day", position: "insideBottom", offset: -12, fill: "#555", fontSize: 10, fontFamily: "'Courier New', monospace" }}
              ticks={[0, 50, 100, 150, 200, 250]}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: "#444", fontSize: 9, fontFamily: "'Courier New', monospace" }}
              axisLine={false}
              tickLine={false}
              width={50}
              tickFormatter={(v) => `$${v}`}
              label={{ value: "Price", angle: -90, position: "insideLeft", offset: 12, fill: "#555", fontSize: 10, fontFamily: "'Courier New', monospace" }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* spot reference line */}
            <ReferenceLine
              y={ticker.spot}
              stroke="#2a2a2a"
              strokeWidth={1}
              strokeDasharray="4 4"
            />

            {/* 1σ bands */}
            {showBands && (
              <>
                <Line dataKey="upper" stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 3" dot={false} opacity={0.5} />
                <Line dataKey="lower" stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 3" dot={false} opacity={0.5} />
              </>
            )}

            {/* mean line */}
            {showMean && (
              <Line dataKey="mean" stroke="#06b6d4" strokeWidth={1.5} dot={false} opacity={0.8} strokeDasharray="5 3" />
            )}

            {/* individual simulation paths */}
            {Array.from({ length: nPaths }, (_, i) => (
              <Line
                key={i}
                dataKey={`p${i}`}
                stroke={PATH_COLORS[i % PATH_COLORS.length]}
                strokeWidth={1.2}
                dot={false}
                opacity={0.85}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── stats strip (day 252 outcomes) ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 6,
        marginTop: 12,
        paddingTop: 10,
        borderTop: "1px solid #111",
      }}>
        {[
          { label: "Spot Now",     value: `$${fmt(ticker.spot)}`,       color: "#e5e7eb" },
          { label: "Mean @ 252d",  value: `$${fmt(finalStats.mean)}`,   color: "#06b6d4" },
          { label: "1σ Upper",     value: `$${fmt(finalStats.upper)}`,  color: "#22c55e" },
          { label: "1σ Lower",     value: `$${fmt(finalStats.lower)}`,  color: "#ef4444" },
          { label: "Max Outcome",  value: `$${fmt(finalStats.max)}`,    color: "#ec4899" },
          { label: "P(S > Spot)",  value: `${(finalStats.pAbove * 100).toFixed(0)}%`, color: finalStats.pAbove >= 0.5 ? "#22c55e" : "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 4, padding: "6px 8px" }}>
            <div style={{ color: "#444", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 3 }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 13, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── methodology note ── */}
      <div style={{ color: "#2a2a2a", fontSize: 8, marginTop: 8, textAlign: "right", letterSpacing: "0.08em" }}>
        GBM · σ={( atmIv * 100).toFixed(1)}% ATM IV · μ={( DRIFT * 100).toFixed(0)}% drift · dt=1/252 · {nPaths} paths × {N_DAYS} days
      </div>
    </div>
  );
}
