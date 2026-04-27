import { useEffect, useMemo, useState } from "react";
import type { DemoTicker, OptionContract } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

type Mode = "volume" | "oi";

// ─── Color scale (teal-positive / red-negative) ──────────────────
const COLORS = {
  bg: "#0a0f1a",
  zero: "#0d1117",
  text: "#ffffff",
  headerBg: "#0a4a4a",
  headerText: "#5eead4",
  border: "#0f1a2a",
};

function colorForPositive(t: number): string {
  // t in [0,1]
  if (t < 0.001) return COLORS.zero;
  if (t < 0.25) return "#0d3d3d";
  if (t < 0.55) return "#0a6060";
  if (t < 0.85) return "#00b4b4";
  return "#00ffee";
}

function colorForNegative(t: number): string {
  // t in [0,1] (absolute intensity)
  if (t < 0.001) return COLORS.zero;
  if (t < 0.25) return "#3d1010";
  if (t < 0.55) return "#7a1818";
  if (t < 0.85) return "#c41e1e";
  return "#ff3344";
}

function fmtAbbrev(v: number): string {
  if (v === 0) return "0";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatExpiryHeader(daysFromNow: number): { dte: string; dow: string; date: string } {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return {
    dte: `${daysFromNow}D`,
    dow: DOW[d.getDay()],
    date: `${MON[d.getMonth()]} ${d.getDate()}`,
  };
}

export function OptionsFlowHeatmap({ ticker, contracts }: Props) {
  const [mode, setMode] = useState<Mode>("volume");
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Live update every 3s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  // Build column expiries: at least 12 cols. Use existing expiries from contracts and pad if needed.
  const expiries = useMemo<number[]>(() => {
    const set = new Set<number>(contracts.map((c) => c.expiry));
    const arr = Array.from(set).sort((a, b) => a - b);
    // Ensure at least 12 columns
    let pad = 1;
    while (arr.length < 12) {
      const next = (arr[arr.length - 1] ?? 0) + pad;
      if (!arr.includes(next)) arr.push(next);
      pad++;
      if (pad > 60) break;
    }
    return arr.slice(0, 14);
  }, [contracts]);

  // Build strike rows around spot — 28 rows centered
  const strikes = useMemo<number[]>(() => {
    const step = ticker.strikeStep || 1;
    const center = Math.round(ticker.spot / step) * step;
    const half = 14;
    const out: number[] = [];
    for (let i = half; i >= -half + 1; i--) out.push(center + i * step);
    return out;
  }, [ticker.spot, ticker.strikeStep]);

  // Cell value lookup: aggregate contracts at (strike, expiry) using OI as base, with deterministic synthetic flow
  const { cellAbs, cellSigned, maxAbs } = useMemo(() => {
    const baseMap = new Map<string, { oi: number; vol: number }>();
    contracts.forEach((c) => {
      const key = `${c.strike}|${c.expiry}`;
      const cur = baseMap.get(key) ?? { oi: 0, vol: 0 };
      cur.oi += c.oi;
      // Synthesize volume from OI when missing
      cur.vol += Math.round(c.oi * (0.05 + Math.random() * 0.4));
      baseMap.set(key, cur);
    });

    const signed = new Map<string, number>();
    const abs = new Map<string, number>();
    let m = 0;
    const midRow = Math.floor(strikes.length / 2);

    strikes.forEach((s, ri) => {
      expiries.forEach((e, ci) => {
        const seed = (ri * 131 + ci * 37 + tick) % 997;
        const noise = ((Math.sin(seed) + 1) / 2); // 0..1
        const base = baseMap.get(`${s}|${e}`);
        const baseVal = base ? (mode === "volume" ? base.vol : base.oi) : 0;

        // Add synthetic activity even when no contract data, scaled by proximity to ATM
        const distFromAtm = Math.abs(ri - midRow) / midRow;
        const proximity = Math.exp(-distFromAtm * distFromAtm * 4);
        const synthetic = Math.round(noise * proximity * (mode === "volume" ? 850_000 : 1_400_000));
        let val = baseVal + synthetic;

        // Lower rows are negative (puts dominate / outflow)
        const isLowerRow = ri > midRow + 2;
        if (isLowerRow && noise > 0.4) val = -val;

        // Sparse zeros for realism
        if (noise < 0.05 && distFromAtm > 0.6) val = 0;

        signed.set(`${ri}|${ci}`, val);
        abs.set(`${ri}|${ci}`, Math.abs(val));
        if (Math.abs(val) > m) m = Math.abs(val);
      });
    });

    return { cellAbs: abs, cellSigned: signed, maxAbs: m || 1 };
  }, [contracts, strikes, expiries, mode, tick]);

  const headers = useMemo(() => expiries.map((e) => formatExpiryHeader(e)), [expiries]);

  return (
    <div
      className="w-full rounded-md overflow-hidden"
      style={{ background: COLORS.bg, border: `1px solid ${COLORS.border}` }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "#000", borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] text-white uppercase">
              Options Flow · {ticker.symbol}
            </span>
          </div>
          <span className="text-[9px] text-muted-foreground font-mono">
            spot ${ticker.spot.toFixed(2)} · live ({Math.floor(tick) % 1000})
          </span>
        </div>

        <div
          className="flex border rounded-sm overflow-hidden"
          style={{ borderColor: "#1a3a3a", background: "#000" }}
        >
          {(["volume", "oi"] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="px-3 py-1 text-[10px] font-bold tracking-wider uppercase transition-colors"
                style={{
                  background: active ? "#0a4a4a" : "transparent",
                  color: active ? "#5eead4" : "#666",
                }}
              >
                {m === "volume" ? "VOLUME" : "OPEN INTEREST"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Heatmap table */}
      <div className="relative" style={{ maxHeight: 560, overflow: "auto" }}>
        <table
          className="w-full border-collapse font-mono"
          style={{ background: COLORS.bg, fontSize: 10 }}
        >
          <thead>
            <tr>
              <th
                className="sticky top-0 left-0 z-30 px-2 py-1.5 text-left"
                style={{
                  background: COLORS.headerBg,
                  color: COLORS.headerText,
                  borderBottom: `1px solid ${COLORS.border}`,
                  borderRight: `1px solid ${COLORS.border}`,
                  minWidth: 80,
                }}
              >
                STRIKE
              </th>
              {headers.map((h, ci) => {
                const isHover = hoverCol === ci;
                return (
                  <th
                    key={ci}
                    className="sticky top-0 z-20 px-2 py-1.5 text-center whitespace-nowrap"
                    style={{
                      background: isHover ? "#0d6060" : COLORS.headerBg,
                      color: COLORS.headerText,
                      borderBottom: `1px solid ${COLORS.border}`,
                      borderLeft: `1px solid ${COLORS.border}`,
                      minWidth: 78,
                    }}
                  >
                    <div className="text-[10px] font-bold">
                      {h.dte} <span className="opacity-70">({h.dow})</span>
                    </div>
                    <div className="text-[9px] opacity-80">{h.date}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {strikes.map((s, ri) => {
              const isAtm = Math.abs(s - ticker.spot) < (ticker.strikeStep || 1) / 2;
              const isHoverRow = hoverRow === ri;
              return (
                <tr
                  key={s}
                  onMouseEnter={() => setHoverRow(ri)}
                  onMouseLeave={() => setHoverRow((r) => (r === ri ? null : r))}
                >
                  <td
                    className="sticky left-0 z-10 px-2 py-1 text-right tabular-nums"
                    style={{
                      background: isAtm ? "#0a4a4a" : isHoverRow ? "#0d2a2a" : "#050a14",
                      color: isAtm ? "#00ffee" : "#ffffff",
                      fontWeight: isAtm ? 700 : 500,
                      borderRight: `1px solid ${COLORS.border}`,
                      borderBottom: `1px solid ${COLORS.border}`,
                    }}
                  >
                    ${s.toFixed(s < 100 ? 1 : 0)}
                    {isAtm && <span className="ml-1 text-[8px]">●</span>}
                  </td>
                  {headers.map((_, ci) => {
                    const v = cellSigned.get(`${ri}|${ci}`) ?? 0;
                    const a = cellAbs.get(`${ri}|${ci}`) ?? 0;
                    const t = a / maxAbs;
                    const bg = v < 0 ? colorForNegative(t) : colorForPositive(t);
                    const isHoverCell = hoverCol === ci || hoverRow === ri;
                    const isExact = hoverCol === ci && hoverRow === ri;
                    return (
                      <td
                        key={ci}
                        onMouseEnter={() => setHoverCol(ci)}
                        className="text-center tabular-nums transition-colors"
                        style={{
                          background: bg,
                          color: t > 0.7 ? "#001514" : "#ffffff",
                          borderLeft: `1px solid ${COLORS.border}`,
                          borderBottom: `1px solid ${COLORS.border}`,
                          padding: "4px 6px",
                          fontWeight: isExact ? 800 : t > 0.7 ? 700 : 500,
                          outline: isExact ? "1px solid #00ffee" : "none",
                          filter: isHoverCell && !isExact ? "brightness(1.25)" : "none",
                        }}
                        title={`Strike ${s} · ${headers[ci].dte} · ${fmtAbbrev(v)}`}
                      >
                        {fmtAbbrev(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div
        className="flex items-center justify-between px-3 py-2 text-[9px] font-mono"
        style={{ background: "#000", borderTop: `1px solid ${COLORS.border}`, color: "#5eead4" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase tracking-wider">
            {mode === "volume" ? "Volume Flow" : "Open Interest"}
          </span>
          <span className="text-white/50">· updates 3s</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "#ff3344" }}>NEG</span>
          <div
            className="h-2 w-44 rounded-sm"
            style={{
              background:
                "linear-gradient(90deg, #ff3344, #7a1818, #0d1117, #0d3d3d, #0a6060, #00b4b4, #00ffee)",
            }}
          />
          <span style={{ color: "#00ffee" }}>POS</span>
        </div>
      </div>
    </div>
  );
}
