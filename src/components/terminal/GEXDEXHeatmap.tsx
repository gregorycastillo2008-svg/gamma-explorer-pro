import { useMemo, useState, useRef, useEffect } from "react";
import {
  computeExposures, formatNumber,
  DemoTicker, OptionContract,
} from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

const C = {
  bg:        "#0a0a0a",
  panel:     "#000000",
  border:    "#1f1f1f",
  text:      "#e5e7eb",
  muted:     "#666",
  greenHi:   "#10b981",
  greenMd:   "#059669",
  redHi:     "#dc2626",
  redMd:     "#ef4444",
  yellow:    "#facc15",
};
const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

// OI percentile column buckets (per spec)
const PCT_COLS = [0, 10, 20, 30, 40, 70, 80, 95, 100, 115] as const;

type Metric = "GEX" | "DEX";

type Theme = "dark" | "light";

// ── Heat ramp: dark (low |v|) → bright (high |v|) for a single hue per sign.
//   Dark theme: starts near black, peaks at neon green / red.
//   Light theme: starts near white, peaks at deep green / red.
function cellBg(v: number, max: number, theme: Theme): string {
  if (!max || v === 0) return theme === "light" ? "#ffffff" : "#000000";
  const t = Math.min(1, Math.abs(v) / max);
  // Gamma 0.5 lifts mid-low values so they're readable
  const a = 0.12 + 0.88 * Math.pow(t, 0.5);

  if (theme === "light") {
    // White → deep green / red. Lerp from #ffffff towards peak.
    const peak = v > 0 ? [4, 120, 60] : [160, 12, 24];     // deep emerald / deep red
    const r = Math.round(255 + (peak[0] - 255) * a);
    const g = Math.round(255 + (peak[1] - 255) * a);
    const b = Math.round(255 + (peak[2] - 255) * a);
    return `rgb(${r},${g},${b})`;
  }
  // Dark theme: black → neon. Single-hue ramp scaled by `a`.
  if (v > 0) {
    const r = Math.round(0   * a);
    const g = Math.round(255 * a);
    const b = Math.round(136 * a);
    return `rgb(${r},${g},${b})`;
  }
  const r = Math.round(255 * a);
  const g = Math.round(34  * a);
  const b = Math.round(68  * a);
  return `rgb(${r},${g},${b})`;
}

function cellFg(v: number, max: number, theme: Theme): string {
  if (!max || v === 0) return theme === "light" ? "#999" : "#444";
  const t = Math.abs(v) / max;
  if (theme === "light") {
    // Dark text on light cells, white text only on saturated peaks
    return t > 0.65 ? "rgba(255,255,255,0.95)" : "#0a0a0a";
  }
  return t > 0.6 ? "#000000" : "rgba(255,255,255,0.95)";
}

function fmt(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)}K`;
  return v.toFixed(0);
}

export function GEXDEXHeatmap({ ticker, contracts }: Props) {
  const [metric, setMetric] = useState<Metric>("GEX");
  const [theme, setTheme] = useState<Theme>("dark");
  const [expiryFilter, setExpiryFilter] = useState<string>("all");
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; strike: number; col: number; gex: number; dex: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Theme tokens — applied across container, panels and cells
  const T = theme === "light"
    ? { bg: "#f5f5f5", panel: "#ffffff", border: "#d4d4d4", text: "#0a0a0a", muted: "#666", cellBorder: "rgba(0,0,0,0.18)" }
    : { bg: C.bg,     panel: C.panel,    border: C.border,   text: C.text,    muted: C.muted, cellBorder: "#000000" };

  const expiries = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach((c) => set.add(c.expiry));
    return Array.from(set).sort((a, b) => a - b);
  }, [contracts]);

  // Filter by expiry
  const filtered = useMemo(() => {
    if (expiryFilter === "all") return contracts;
    return contracts.filter((c) => String(c.expiry) === expiryFilter);
  }, [contracts, expiryFilter]);

  // ── Build rows: for each strike, distribute GEX/DEX across OI percentile columns ──
  const { rows, maxGex, maxDex } = useMemo(() => {
    const exposures = computeExposures(ticker.spot, filtered);

    // Aggregate per-strike OI side maps so percentile columns reflect REAL OI distribution
    const sideMap = new Map<number, { callOI: number; putOI: number; callIv: number[]; putIv: number[] }>();
    for (const c of filtered) {
      const cur = sideMap.get(c.strike) ?? { callOI: 0, putOI: 0, callIv: [], putIv: [] };
      if (c.type === "call") { cur.callOI += c.oi; cur.callIv.push(c.iv); }
      else { cur.putOI += c.oi; cur.putIv.push(c.iv); }
      sideMap.set(c.strike, cur);
    }

    // OI percentile thresholds across all strikes (real data)
    const allOI: number[] = [];
    for (const e of exposures) allOI.push(e.callOI + e.putOI);
    allOI.sort((a, b) => a - b);
    const pct = (p: number) => {
      if (!allOI.length) return 0;
      if (p >= 100) {
        // 115% = max * 1.15 (extrapolated tail bucket)
        return allOI[allOI.length - 1] * (p / 100);
      }
      const idx = Math.min(allOI.length - 1, Math.max(0, Math.floor((p / 100) * (allOI.length - 1))));
      return allOI[idx];
    };
    const thresholds = PCT_COLS.map((p) => pct(p));

    let maxGex = 0;
    let maxDex = 0;

    const rows = exposures
      .sort((a, b) => b.strike - a.strike)
      .map((e) => {
        const totalOI = e.callOI + e.putOI;
        // For each percentile column, compute the share of GEX/DEX whose OI falls into [thresholds[i-1], thresholds[i]]
        // Using a smooth weight: weight = max(0, 1 - |totalOI - threshold| / spread) so neighbours bleed across cols.
        const spreadBase = Math.max(1, allOI[allOI.length - 1] || 1) * 0.12;
        const weights = thresholds.map((th) => {
          const d = Math.abs(totalOI - th);
          return Math.max(0, 1 - d / spreadBase);
        });
        const wSum = weights.reduce((s, w) => s + w, 0) || 1;
        const norm = weights.map((w) => w / wSum);

        // Sign carrier: net gex sign for GEX row, dex sign for DEX row.
        const gexCells = norm.map((w) => e.netGex * w);
        const dexCells = norm.map((w) => e.dex * w);

        // Track magnitudes per cell for color scaling
        for (const v of gexCells) if (Math.abs(v) > maxGex) maxGex = Math.abs(v);
        for (const v of dexCells) if (Math.abs(v) > maxDex) maxDex = Math.abs(v);

        return {
          strike: e.strike,
          totalOI,
          callOI: e.callOI,
          putOI: e.putOI,
          netGex: e.netGex,
          dex: e.dex,
          gexCells,
          dexCells,
          // CHAP column = simple = netGex, dex = dex
          chapSimple: e.netGex,
          chapDex: e.dex,
        };
      });

    return { rows, maxGex: maxGex || 1, maxDex: maxDex || 1 };
  }, [ticker.spot, filtered]);

  // ── Synchronized scroll between both panels ──
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  useEffect(() => {
    const l = leftRef.current, r = rightRef.current;
    if (!l || !r) return;
    const onL = () => {
      if (syncing.current) return;
      syncing.current = true;
      r.scrollTop = l.scrollTop;
      requestAnimationFrame(() => (syncing.current = false));
    };
    const onR = () => {
      if (syncing.current) return;
      syncing.current = true;
      l.scrollTop = r.scrollTop;
      requestAnimationFrame(() => (syncing.current = false));
    };
    l.addEventListener("scroll", onL);
    r.addEventListener("scroll", onR);
    return () => { l.removeEventListener("scroll", onL); r.removeEventListener("scroll", onR); };
  }, []);

  return (
    <div
      className="w-full h-full flex flex-col rounded-lg overflow-hidden"
      style={{ background: C.bg, border: `1px solid ${C.border}`, fontFamily: FONT }}
    >
      {/* ── TOOLBAR ── */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0 flex-wrap"
        style={{ borderBottom: `1px solid ${C.border}`, background: "#000" }}
      >
        <span style={{ color: C.muted, fontSize: 10, letterSpacing: "0.2em" }} className="uppercase font-bold">
          GEX/DEX Heatmap · {ticker.symbol}
        </span>

        {/* Metric toggle */}
        <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
          {(["GEX", "DEX"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className="px-2.5 py-1 text-[10px] font-bold tracking-wider transition-colors"
              style={{
                background: metric === m ? C.greenHi : "transparent",
                color: metric === m ? "#000" : C.muted,
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Expiry */}
        <div className="flex items-center gap-1.5">
          <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">EXP</span>
          <select
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value)}
            className="bg-transparent text-[10px] px-2 py-1 rounded outline-none cursor-pointer"
            style={{ color: C.text, border: `1px solid ${C.border}`, fontFamily: FONT }}
          >
            <option value="all" style={{ background: C.bg }}>ALL</option>
            {expiries.map((e) => (
              <option key={e} value={String(e)} style={{ background: C.bg }}>{e}D</option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2 text-[10px]" style={{ color: T.muted }}>
          <div className="flex rounded overflow-hidden mr-2" style={{ border: `1px solid ${T.border}` }}>
            {(["dark", "light"] as Theme[]).map((th) => (
              <button
                key={th}
                onClick={() => setTheme(th)}
                className="px-2.5 py-1 text-[10px] font-bold tracking-wider transition-colors"
                style={{
                  background: theme === th ? C.yellow : "transparent",
                  color: theme === th ? "#000" : T.muted,
                }}
              >
                {th === "dark" ? "● DARK" : "○ LIGHT"}
              </button>
            ))}
          </div>
          <span>SPOT</span>
          <span style={{ color: C.yellow, fontWeight: 700 }}>${ticker.spot.toFixed(2)}</span>
          <span>·</span>
          <span>{rows.length} strikes</span>
        </div>
      </div>

      {/* ── BODY: two synced heatmap panels ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-px" style={{ background: T.border }}>
        <HeatPanel
          title="GEX · Gamma Exposure"
          chapLabel="CHAP: simple"
          rows={rows}
          cellsKey="gexCells"
          chapKey="chapSimple"
          max={maxGex}
          spot={ticker.spot}
          hoverRow={hoverRow}
          hoverCol={hoverCol}
          setHoverRow={setHoverRow}
          setHoverCol={setHoverCol}
          setTooltip={setTooltip}
          selected={selected}
          setSelected={setSelected}
          scrollRef={leftRef}
          accent={C.greenHi}
        />
        <HeatPanel
          title="DEX · Delta Exposure"
          chapLabel="CHAP: dex"
          rows={rows}
          cellsKey="dexCells"
          chapKey="chapDex"
          max={maxDex}
          spot={ticker.spot}
          hoverRow={hoverRow}
          hoverCol={hoverCol}
          setHoverRow={setHoverRow}
          setHoverCol={setHoverCol}
          setTooltip={setTooltip}
          selected={selected}
          setSelected={setSelected}
          scrollRef={rightRef}
          accent={C.redHi}
        />
      </div>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none rounded px-3 py-2"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            background: "#000",
            border: `1px solid ${C.border}`,
            color: C.text,
            fontFamily: FONT,
            fontSize: 11,
            minWidth: 180,
            boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ color: C.yellow, fontSize: 10, letterSpacing: "0.15em" }} className="uppercase font-bold">
            Strike ${tooltip.strike} · {tooltip.col === -1 ? "CHAP" : `${PCT_COLS[tooltip.col]}% bucket`}
          </div>
          <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
          <RowKv k="GEX" v={formatNumber(tooltip.gex)} c={tooltip.gex >= 0 ? C.greenHi : C.redHi} />
          <RowKv k="DEX" v={formatNumber(tooltip.dex)} c={tooltip.dex >= 0 ? C.greenHi : C.redHi} />
        </div>
      )}

      {/* ── Selected strike detail ── */}
      {selected != null && (
        <SelectedFooter
          row={rows.find((r) => r.strike === selected)}
          spot={ticker.spot}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── PANEL ───────────────────────────
function HeatPanel({
  title, chapLabel, rows, cellsKey, chapKey, max, spot,
  hoverRow, hoverCol, setHoverRow, setHoverCol, setTooltip,
  selected, setSelected, scrollRef, accent,
}: {
  title: string;
  chapLabel: string;
  rows: any[];
  cellsKey: "gexCells" | "dexCells";
  chapKey: "chapSimple" | "chapDex";
  max: number;
  spot: number;
  hoverRow: number | null;
  hoverCol: number | null;
  setHoverRow: (n: number | null) => void;
  setHoverCol: (n: number | null) => void;
  setTooltip: (t: any) => void;
  selected: number | null;
  setSelected: (n: number | null) => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  accent: string;
}) {
  return (
    <div className="flex flex-col min-h-0" style={{ background: C.panel }}>
      <div className="px-3 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${C.border}` }}>
        <span style={{ color: accent, fontSize: 11, letterSpacing: "0.18em" }} className="uppercase font-bold">
          {title}
        </span>
        <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">
          {chapLabel}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ fontSize: 10 }}>
          <thead className="sticky top-0 z-10" style={{ background: C.panel }}>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th
                className="text-left px-2 py-1.5 font-bold uppercase tracking-wider sticky left-0 z-20"
                style={{
                  color: C.muted, fontSize: 9, background: C.panel,
                  borderRight: `1px solid ${C.border}`,
                }}
              >
                Strike
              </th>
              {PCT_COLS.map((p, i) => (
                <th
                  key={p}
                  onMouseEnter={() => setHoverCol(i)}
                  onMouseLeave={() => setHoverCol(null)}
                  className="px-1.5 py-1.5 text-right font-bold uppercase tracking-wider cursor-default"
                  style={{
                    color: hoverCol === i ? accent : C.muted,
                    fontSize: 9,
                    background: hoverCol === i ? "rgba(255,255,255,0.04)" : C.panel,
                  }}
                >
                  {p === 0 ? "MIN" : p === 100 ? "MAX" : `${p}%`}
                </th>
              ))}
              <th
                onMouseEnter={() => setHoverCol(-1)}
                onMouseLeave={() => setHoverCol(null)}
                className="px-2 py-1.5 text-right font-bold uppercase tracking-wider"
                style={{ color: hoverCol === -1 ? accent : C.muted, fontSize: 9, borderLeft: `1px solid ${C.border}` }}
              >
                CHAP
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const isSpot = Math.abs(r.strike - spot) < 0.5;
              const isSel = selected === r.strike;
              const isHover = hoverRow === ri;
              const cells: number[] = r[cellsKey];
              return (
                <tr
                  key={r.strike}
                  onMouseEnter={() => setHoverRow(ri)}
                  onMouseLeave={() => setHoverRow(null)}
                  onClick={() => setSelected(isSel ? null : r.strike)}
                  className="cursor-pointer"
                  style={{
                    background: isSel
                      ? "rgba(250,204,21,0.08)"
                      : isHover
                        ? "rgba(255,255,255,0.03)"
                        : "transparent",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <td
                    className="px-2 py-1 sticky left-0 z-10 font-bold tabular-nums"
                    style={{
                      color: isSpot ? C.yellow : isSel ? accent : C.text,
                      background: isSel
                        ? "rgba(250,204,21,0.06)"
                        : isHover ? "#0a0a0a" : C.panel,
                      borderRight: `1px solid ${C.border}`,
                      fontSize: 11,
                    }}
                  >
                    {r.strike}
                    {isSpot && <span className="ml-1" style={{ color: C.yellow, fontSize: 9 }}>◀</span>}
                  </td>
                  {cells.map((v, ci) => (
                    <td
                      key={ci}
                      onMouseMove={(ev) =>
                        setTooltip({ x: ev.clientX, y: ev.clientY, strike: r.strike, col: ci, gex: r.netGex, dex: r.dex })
                      }
                      onMouseLeave={() => setTooltip(null)}
                      className="text-right px-1.5 py-1 tabular-nums transition-colors"
                      style={{
                        background: cellBg(v, max),
                        color: cellFg(v, max),
                        border: "1px solid #000",
                        outline: hoverCol === ci ? `1px solid ${accent}` : "none",
                        outlineOffset: -1,
                        fontWeight: 600,
                      }}
                    >
                      {fmt(v)}
                    </td>
                  ))}
                  <td
                    onMouseMove={(ev) =>
                      setTooltip({ x: ev.clientX, y: ev.clientY, strike: r.strike, col: -1, gex: r.netGex, dex: r.dex })
                    }
                    onMouseLeave={() => setTooltip(null)}
                    className="text-right px-2 py-1 tabular-nums"
                    style={{
                      background: cellBg(r[chapKey], max * 1.2),
                      color: cellFg(r[chapKey], max * 1.2),
                      border: "1px solid #000",
                      borderLeft: `2px solid ${C.border}`,
                      fontWeight: 700,
                    }}
                  >
                    {fmt(r[chapKey])}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowKv({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] py-0.5">
      <span style={{ color: C.muted }} className="uppercase tracking-wider">{k}</span>
      <span style={{ color: c, fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function SelectedFooter({ row, spot, onClose }: { row?: any; spot: number; onClose: () => void }) {
  if (!row) return null;
  const dist = ((row.strike - spot) / spot) * 100;
  return (
    <div
      className="shrink-0 px-4 py-2 flex items-center gap-6 flex-wrap"
      style={{ background: "#000", borderTop: `1px solid ${C.border}`, fontFamily: FONT }}
    >
      <div style={{ color: C.yellow, fontSize: 14, fontWeight: 700 }}>${row.strike}</div>
      <Stat k="Distance" v={`${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%`} c={dist >= 0 ? C.greenHi : C.redHi} />
      <Stat k="Call OI" v={fmt(row.callOI)} c={C.greenHi} />
      <Stat k="Put OI"  v={fmt(row.putOI)}  c={C.redHi} />
      <Stat k="Total OI" v={fmt(row.totalOI)} c={C.text} />
      <Stat k="Net GEX" v={formatNumber(row.netGex)} c={row.netGex >= 0 ? C.greenHi : C.redHi} />
      <Stat k="Net DEX" v={formatNumber(row.dex)} c={row.dex >= 0 ? C.greenHi : C.redHi} />
      <button
        onClick={onClose}
        className="ml-auto text-[9px] uppercase tracking-wider px-2 py-1 rounded"
        style={{ color: C.muted, border: `1px solid ${C.border}` }}
      >
        Close
      </button>
    </div>
  );
}

function Stat({ k, v, c }: { k: string; v: string; c: string }) {
  return (
    <div className="flex flex-col">
      <span style={{ color: C.muted, fontSize: 9 }} className="uppercase tracking-wider">{k}</span>
      <span style={{ color: c, fontSize: 12, fontWeight: 700 }}>{v}</span>
    </div>
  );
}
