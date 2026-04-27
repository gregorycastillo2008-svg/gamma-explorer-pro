import { useMemo, useState } from "react";
import type { ExposurePoint, KeyLevels, DemoTicker, OptionContract } from "@/lib/gex";
import { formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

const CYAN = "#00e5ff";
const RED = "#ff3d00";
const BORDER = "#1f1f1f";
const BG = "#000000";
const FLIP_ORANGE = "#ff8a1a";

// Heatmap cell background — opacity scales with |value| / max
function heatBg(val: number, max: number) {
  if (!max || !val) return "transparent";
  const intensity = Math.min(1, Math.abs(val) / max);
  const color = val >= 0 ? "0,229,255" : "255,61,0";
  return `rgba(${color}, ${intensity * 0.55})`;
}

function MirrorBar({
  value,
  max,
  side,
  color,
}: {
  value: number;
  max: number;
  side: "left" | "right";
  color: string;
}) {
  // Log scale to prevent walls from crushing detail
  const v = Math.abs(value);
  const scaled = v > 0 ? Math.log10(1 + v) / Math.log10(1 + max) : 0;
  const w = Math.max(0, Math.min(1, scaled)) * 100;
  return (
    <div className={`h-3 flex ${side === "left" ? "justify-end" : "justify-start"}`}>
      <div
        style={{
          width: `${w}%`,
          background: color,
          opacity: 0.75,
          boxShadow: w > 70 ? `0 0 8px ${color}` : "none",
        }}
        className="h-full"
      />
    </div>
  );
}

export function DepthAltaris({ ticker, exposures, levels }: Props) {
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);

  // Sort high → low so spot sits roughly in the middle visually
  const rows = useMemo(
    () => [...exposures].sort((a, b) => b.strike - a.strike),
    [exposures]
  );

  const dexRows = rows;
  const gexRows = rows;
  const oiRows = rows;

  const maxAbsDex = Math.max(...rows.map((r) => Math.abs(r.dex)), 1);
  const maxAbsGex = Math.max(...rows.map((r) => Math.abs(r.netGex)), 1);
  const maxAbsOi = Math.max(...rows.map((r) => r.callOI - r.putOI).map(Math.abs), 1);
  const maxCall = Math.max(...rows.map((r) => Math.abs(r.callGex)), 1);
  const maxPut = Math.max(...rows.map((r) => Math.abs(r.putGex)), 1);

  const totalCallOI = exposures.reduce((s, p) => s + p.callOI, 0);
  const totalPutOI = exposures.reduce((s, p) => s + p.putOI, 0);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);
  const netDex = exposures.reduce((s, p) => s + p.dex, 0);
  const atmIv = (() => {
    const atm = exposures.filter(
      (p) => Math.abs(p.strike - ticker.spot) < ticker.strikeStep * 2
    );
    if (!atm.length) return ticker.baseIV * 100;
    return ticker.baseIV * 100;
  })();

  const spot = ticker.spot;
  const flip = levels.gammaFlip ?? 0;

  // Pick visible strike window for the mirror chart (all rows but with explicit refs)
  const minS = rows.length ? rows[rows.length - 1].strike : 0;
  const maxS = rows.length ? rows[0].strike : 1;
  const yPos = (s: number) => {
    if (maxS === minS) return 50;
    return ((maxS - s) / (maxS - minS)) * 100;
  };

  return (
    <div
      className="h-full w-full flex flex-col gap-2 p-2 font-mono"
      style={{ background: BG, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
    >
      {/* ── HEADER KPIs ────────────────────────────────────────────── */}
      <div
        className="flex items-stretch gap-3 px-4 py-3"
        style={{ background: BG, border: `1px solid ${BORDER}` }}
      >
        <div className="flex flex-col justify-center pr-6 border-r" style={{ borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Ticker</div>
          <div className="text-2xl font-bold text-white tracking-wider">{ticker.symbol}</div>
        </div>
        <div className="flex flex-col justify-center pr-6 border-r" style={{ borderColor: BORDER }}>
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Price</div>
          <div className="text-3xl font-bold" style={{ color: CYAN }}>
            ${spot.toFixed(2)}
          </div>
        </div>
        <Kpi label="ATM IV" value={`${atmIv.toFixed(1)}%`} />
        <Kpi label="P/C Ratio" value={pcr.toFixed(2)} tone={pcr > 1 ? "put" : "call"} />
        <Kpi label="Net DEX" value={formatNumber(netDex)} tone={netDex >= 0 ? "call" : "put"} />
        <Kpi label="Net GEX" value={formatNumber(levels.totalGex)} tone={levels.totalGex >= 0 ? "call" : "put"} />
        <Kpi label="Call Wall" value={`$${levels.callWall}`} tone="call" />
        <Kpi label="Put Wall" value={`$${levels.putWall}`} tone="put" />
        <Kpi label="Gamma Flip" value={flip ? `$${flip}` : "—"} tone="flip" />
      </div>

      {/* ── MIRROR CHARTS ─────────────────────────────────────────── */}
      <div
        className="grid grid-cols-2 gap-0 relative"
        style={{ background: BG, border: `1px solid ${BORDER}`, height: "38%" }}
      >
        {/* Spot line overlay */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{ top: `${yPos(spot)}%`, borderTop: `1px dashed ${CYAN}` }}
        >
          <div
            className="absolute right-1 -top-2.5 px-1.5 text-[10px] font-bold"
            style={{ background: BG, color: CYAN }}
          >
            SPOT ${spot.toFixed(2)}
          </div>
        </div>
        {/* Flip line overlay */}
        {flip > 0 && (
          <div
            className="absolute left-0 right-0 pointer-events-none z-10"
            style={{ top: `${yPos(flip)}%`, borderTop: `1px dashed ${FLIP_ORANGE}` }}
          >
            <div
              className="absolute left-1 -top-2.5 px-1.5 text-[10px] font-bold"
              style={{ background: BG, color: FLIP_ORANGE }}
            >
              FLIP ${flip}
            </div>
          </div>
        )}

        {/* LEFT: Puts vs Calls (DEX direction) */}
        <div className="flex flex-col" style={{ borderRight: `1px solid ${BORDER}` }}>
          <div
            className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider"
            style={{ borderBottom: `1px solid ${BORDER}`, color: "#888" }}
          >
            <span style={{ color: RED }}>● PUTS</span>
            <span className="text-white/60">DEX BY STRIKE</span>
            <span style={{ color: CYAN }}>CALLS ●</span>
          </div>
          <div className="flex-1 grid grid-cols-[1fr_56px_1fr] items-center gap-1 px-2 py-1 overflow-hidden">
            <div className="flex flex-col justify-between h-full">
              {dexRows.map((r) => (
                <div
                  key={`pl-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={hoverStrike === r.strike ? "bg-white/5" : ""}
                >
                  <MirrorBar value={r.putGex} max={maxPut} side="left" color={RED} />
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between h-full text-[9px] text-white/50 text-center">
              {dexRows.map((r) => (
                <div
                  key={`ks-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={`leading-3 ${hoverStrike === r.strike ? "text-white" : ""}`}
                >
                  {r.strike}
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between h-full">
              {dexRows.map((r) => (
                <div
                  key={`pr-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={hoverStrike === r.strike ? "bg-white/5" : ""}
                >
                  <MirrorBar value={r.callGex} max={maxCall} side="right" color={CYAN} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: GEX OI mirrored (Put GEX / Call GEX) */}
        <div className="flex flex-col">
          <div
            className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-wider"
            style={{ borderBottom: `1px solid ${BORDER}`, color: "#888" }}
          >
            <span style={{ color: RED }}>● PUT GEX</span>
            <span className="text-white/60">GEX OI</span>
            <span style={{ color: CYAN }}>CALL GEX ●</span>
          </div>
          <div className="flex-1 grid grid-cols-[1fr_56px_1fr] items-center gap-1 px-2 py-1 overflow-hidden">
            <div className="flex flex-col justify-between h-full">
              {gexRows.map((r) => (
                <div
                  key={`gl-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={hoverStrike === r.strike ? "bg-white/5" : ""}
                >
                  <MirrorBar value={r.putOI} max={Math.max(...rows.map((x) => x.putOI), 1)} side="left" color={RED} />
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between h-full text-[9px] text-white/50 text-center">
              {gexRows.map((r) => (
                <div
                  key={`gks-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={`leading-3 ${hoverStrike === r.strike ? "text-white" : ""}`}
                >
                  {r.strike}
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between h-full">
              {gexRows.map((r) => (
                <div
                  key={`gr-${r.strike}`}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className={hoverStrike === r.strike ? "bg-white/5" : ""}
                >
                  <MirrorBar value={r.callOI} max={Math.max(...rows.map((x) => x.callOI), 1)} side="right" color={CYAN} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── THREE HEATMAP TABLES ──────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
        <HeatTable
          title="DEX · NET · 30"
          rows={dexRows.slice(0, 30).map((r) => ({ strike: r.strike, value: r.dex }))}
          max={maxAbsDex}
          spot={spot}
          flip={flip}
          hover={hoverStrike}
          setHover={setHoverStrike}
          formatter={(v) => formatNumber(v)}
        />
        <HeatTable
          title="GEX · NET · 20"
          rows={gexRows.slice(0, 20).map((r) => ({ strike: r.strike, value: r.netGex }))}
          max={maxAbsGex}
          spot={spot}
          flip={flip}
          hover={hoverStrike}
          setHover={setHoverStrike}
          formatter={(v) => formatNumber(v)}
        />
        <HeatTable
          title="OI · NET · 20"
          rows={oiRows.slice(0, 20).map((r) => ({ strike: r.strike, value: r.callOI - r.putOI }))}
          max={maxAbsOi}
          spot={spot}
          flip={flip}
          hover={hoverStrike}
          setHover={setHoverStrike}
          formatter={(v) => formatNumber(v, 0)}
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "call" | "put" | "flip" }) {
  const color =
    tone === "call" ? CYAN : tone === "put" ? RED : tone === "flip" ? FLIP_ORANGE : "#ffffff";
  return (
    <div className="flex flex-col justify-center pr-6 border-r" style={{ borderColor: BORDER }}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">{label}</div>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function HeatTable({
  title,
  rows,
  max,
  spot,
  flip,
  hover,
  setHover,
  formatter,
}: {
  title: string;
  rows: { strike: number; value: number }[];
  max: number;
  spot: number;
  flip: number;
  hover: number | null;
  setHover: (s: number | null) => void;
  formatter: (v: number) => string;
}) {
  return (
    <div
      className="flex flex-col min-h-0"
      style={{ background: BG, border: `1px solid ${BORDER}` }}
    >
      <div
        className="px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/60 sticky top-0 z-10"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        {title}
      </div>
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10" style={{ background: BG }}>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th className="text-left px-3 py-1.5 text-[9px] uppercase tracking-wider text-white/40 font-normal">
                Strike
              </th>
              <th className="text-right px-3 py-1.5 text-[9px] uppercase tracking-wider text-white/40 font-normal">
                {title.split(" · ")[0]} Net
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSpot = Math.abs(r.strike - spot) < 0.5;
              const isFlip = flip && Math.abs(r.strike - flip) < 0.5;
              const isHover = hover === r.strike;
              return (
                <tr
                  key={r.strike}
                  onMouseEnter={() => setHover(r.strike)}
                  onMouseLeave={() => setHover(null)}
                  className="cursor-default"
                  style={{
                    background: isHover ? "rgba(255,255,255,0.06)" : "transparent",
                    borderBottom: `1px solid ${BORDER}`,
                  }}
                >
                  <td
                    className="px-3 py-1 text-white"
                    style={{
                      color: isSpot ? CYAN : isFlip ? FLIP_ORANGE : "#ffffff",
                      fontWeight: isSpot || isFlip ? 700 : 500,
                    }}
                  >
                    {r.strike}
                    {isSpot && <span className="ml-1 text-[9px]">◀ SPOT</span>}
                    {isFlip && !isSpot && <span className="ml-1 text-[9px]">◀ FLIP</span>}
                  </td>
                  <td
                    className="px-3 py-1 text-right tabular-nums"
                    style={{
                      background: heatBg(r.value, max),
                      color: "rgba(255,255,255,0.8)",
                    }}
                  >
                    {formatter(r.value)}
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
