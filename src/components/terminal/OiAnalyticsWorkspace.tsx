import { useMemo, useState } from "react";
import type { DemoTicker, OptionContract } from "@/lib/gex";
import { bsGreeks, formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

const PANEL_BG = "#0a0a0a";
const BORDER = "#1f1f1f";
const MUTED = "#6b7280";
const TEXT = "#9ca3af";
const TEXT_HI = "#e5e7eb";
const RED_NEON = "#ff3366";
const GREEN_NEON = "#00ff88";
const CYAN = "#06b6d4";
const YELLOW = "#fbbf24";

export function OiAnalyticsWorkspace({ ticker, contracts }: Props) {
  // ── Aggregate per strike ──
  const perStrike = useMemo(() => {
    const m = new Map<number, { strike: number; callOI: number; putOI: number; callDelta: number; putDelta: number; ivVolNum: number; ivVolDen: number; volume: number }>();
    for (const c of contracts) {
      const T = Math.max(c.expiry, 1) / 365;
      const g = bsGreeks(ticker.spot, c.strike, T, 0.05, c.iv, c.type);
      // Pseudo-volume from OI for IV-weighted calc (no real volume in mock)
      const volume = c.oi;
      const cur = m.get(c.strike) ?? { strike: c.strike, callOI: 0, putOI: 0, callDelta: 0, putDelta: 0, ivVolNum: 0, ivVolDen: 0, volume: 0 };
      if (c.type === "call") {
        cur.callOI += c.oi;
        cur.callDelta += g.delta * c.oi;
      } else {
        cur.putOI += c.oi;
        cur.putDelta += Math.abs(g.delta) * c.oi;
      }
      cur.ivVolNum += c.iv * volume;
      cur.ivVolDen += volume;
      cur.volume += volume;
      m.set(c.strike, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.strike - a.strike);
  }, [contracts, ticker.spot]);

  const totals = useMemo(() => {
    const callOI = perStrike.reduce((s, p) => s + p.callOI, 0);
    const putOI = perStrike.reduce((s, p) => s + p.putOI, 0);
    const callDelta = perStrike.reduce((s, p) => s + p.callDelta, 0);
    const putDelta = perStrike.reduce((s, p) => s + p.putDelta, 0);
    const ivVolNum = perStrike.reduce((s, p) => s + p.ivVolNum, 0);
    const ivVolDen = perStrike.reduce((s, p) => s + p.ivVolDen, 0);
    const totalOI = callOI + putOI;
    const maxPut = perStrike.reduce((b, p) => (p.putOI > b.putOI ? p : b), perStrike[0]);
    const maxCall = perStrike.reduce((b, p) => (p.callOI > b.callOI ? p : b), perStrike[0]);
    const concentration = totalOI > 0 ? (Math.max(maxPut.putOI, maxCall.callOI) / totalOI) * 100 : 0;
    const ivWeighted = ivVolDen > 0 ? ivVolNum / ivVolDen : 0;
    const diRatio = callDelta > 0 ? putDelta / callDelta : 0;
    // IV-weighted strike (proxy "price")
    const strikeNum = perStrike.reduce((s, p) => s + p.strike * p.volume, 0);
    const ivWeightedStrike = ivVolDen > 0 ? strikeNum / ivVolDen : 0;
    // Max volume concentration band: lowest/highest strikes covering 50% of total volume
    const sortedByVol = [...perStrike].sort((a, b) => b.volume - a.volume);
    let cum = 0; const halfVol = ivVolDen * 0.5;
    const band: number[] = [];
    for (const p of sortedByVol) {
      cum += p.volume;
      band.push(p.strike);
      if (cum >= halfVol) break;
    }
    const bandLo = Math.min(...band);
    const bandHi = Math.max(...band);
    return { callOI, putOI, totalOI, maxPut, maxCall, concentration, ivWeighted, diRatio, ivWeightedStrike, bandLo, bandHi };
  }, [perStrike]);

  return (
    <div className="h-full w-full overflow-y-auto bg-black p-6 font-mono">
      {/* ── 3 metric cards ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="DI RATIO"
          value={totals.diRatio.toFixed(2)}
          sublabel="STRIKE WITH MAX PUT OI"
          subvalue={`$${totals.maxPut?.strike ?? "—"}`}
          subColor={GREEN_NEON}
        />
        <MetricCard
          label="CALL PUT CONCENTRATION"
          value={`${totals.concentration.toFixed(0)}%`}
          valueColor={RED_NEON}
          sublabel="STRIKE WITH MAX CALL OI"
          subvalue={`$${totals.maxCall?.strike ?? "—"}`}
          subColor={GREEN_NEON}
        />
        <MetricCard
          label="IV WEIGHTED BY VOLUME"
          value={`$${totals.ivWeightedStrike.toFixed(2)}`}
          valueColor={CYAN}
          sublabel="MAX VOLUME CONCENTRATION"
          subvalue={`$${totals.bandLo} – $${totals.bandHi}`}
          subColor={YELLOW}
        />
      </div>

      {/* ── 2 main panels ── */}
      <div className="grid grid-cols-2 gap-4">
        <NormalizedOIPanel rows={perStrike} maxPutStrike={totals.maxPut?.strike} maxCallStrike={totals.maxCall?.strike} />
        <PCSkewPanel rows={perStrike} />
      </div>
    </div>
  );
}

function MetricCard({
  label, value, valueColor = TEXT_HI, sublabel, subvalue, subColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sublabel: string;
  subvalue: string;
  subColor: string;
}) {
  return (
    <div
      className="rounded-lg p-5"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}` }}
    >
      <div className="text-[9px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>{label}</div>
      <div className="text-[32px] font-bold tabular-nums mt-1" style={{ color: valueColor }}>{value}</div>
      <div className="text-[9px] uppercase tracking-[0.2em] mt-3" style={{ color: MUTED }}>{sublabel}</div>
      <div className="text-base font-bold tabular-nums mt-1" style={{ color: subColor }}>{subvalue}</div>
    </div>
  );
}

// ─────────── NORMALIZED OI DISTRIBUTION ───────────
function NormalizedOIPanel({
  rows, maxPutStrike, maxCallStrike,
}: {
  rows: { strike: number; callOI: number; putOI: number }[];
  maxPutStrike?: number;
  maxCallStrike?: number;
}) {
  const maxOI = Math.max(...rows.map((r) => Math.max(r.callOI, r.putOI)), 1);
  const [tt, setTt] = useState<{ strike: number; callOI: number; putOI: number; x: number; y: number } | null>(null);

  return (
    <div
      className="rounded-lg p-5 flex flex-col"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, height: 800 }}
    >
      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: TEXT }}>NORMALIZED OI DISTRIBUTION</div>
      <div className="grid grid-cols-2 text-[10px] mb-2 px-10">
        <span className="text-right pr-2" style={{ color: RED_NEON }}>Put OI %</span>
        <span className="pl-2" style={{ color: GREEN_NEON }}>Call OI %</span>
      </div>

      <div
        className="flex-1 overflow-y-auto relative pr-1"
        onMouseLeave={() => setTt(null)}
      >
        {rows.map((r) => {
          const putW = (r.putOI / maxOI) * 50;   // up to 50% half
          const callW = (r.callOI / maxOI) * 50;
          const isMaxPut = r.strike === maxPutStrike;
          const isMaxCall = r.strike === maxCallStrike;
          return (
            <div
              key={r.strike}
              className="grid grid-cols-[40px_1fr_1fr] items-center gap-1 cursor-crosshair"
              style={{ height: 18, marginBottom: 2 }}
              onMouseMove={(e) => {
                const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                setTt({
                  strike: r.strike,
                  callOI: r.callOI,
                  putOI: r.putOI,
                  x: e.clientX - host.left,
                  y: e.clientY - host.top,
                });
              }}
            >
              <span className="text-[9px] text-right tabular-nums" style={{ color: MUTED }}>${r.strike}</span>
              {/* PUT side (right-aligned, grows leftward) */}
              <div className="flex justify-end h-3.5">
                <div
                  style={{
                    width: `${(putW / 50) * 100}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #8b0000, #ff3366)",
                    boxShadow: putW > 25
                      ? "0 0 12px rgba(255,51,102,0.7)"
                      : "0 0 6px rgba(255,51,102,0.3)",
                    borderRadius: "2px 0 0 2px",
                    borderLeft: isMaxPut ? `3px solid ${RED_NEON}` : "none",
                    opacity: 0.95,
                  }}
                />
              </div>
              {/* CALL side (left-aligned, grows rightward) */}
              <div className="flex justify-start h-3.5">
                <div
                  style={{
                    width: `${(callW / 50) * 100}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #00ff88, #00cc6a)",
                    boxShadow: callW > 25
                      ? "0 0 12px rgba(0,255,136,0.7)"
                      : "0 0 6px rgba(0,255,136,0.3)",
                    borderRadius: "0 2px 2px 0",
                    borderRight: isMaxCall ? `3px solid ${GREEN_NEON}` : "none",
                    opacity: 0.95,
                  }}
                />
              </div>
            </div>
          );
        })}

        {tt && (
          <div
            className="absolute pointer-events-none z-20 rounded px-2 py-1.5 text-[10px] leading-tight"
            style={{
              left: Math.min(tt.x + 12, 280),
              top: tt.y + 12,
              background: "rgba(10,10,10,0.95)",
              border: `1px solid ${CYAN}`,
              boxShadow: "0 0 8px rgba(6,182,212,0.4)",
              minWidth: 140,
            }}
          >
            <div style={{ color: CYAN, fontWeight: 700 }}>Strike: ${tt.strike}</div>
            <div style={{ color: RED_NEON }}>Put OI: {formatNumber(tt.putOI, 0)}</div>
            <div style={{ color: GREEN_NEON }}>Call OI: {formatNumber(tt.callOI, 0)}</div>
            <div style={{ color: MUTED }}>P/C: {(tt.putOI / Math.max(tt.callOI, 1)).toFixed(2)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────── P/C SKEW BY STRIKE ───────────
function PCSkewPanel({
  rows,
}: {
  rows: { strike: number; callOI: number; putOI: number }[];
}) {
  const data = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.strike - b.strike)
        .map((r) => ({
          strike: r.strike,
          ratio: Math.min(6, r.putOI / Math.max(r.callOI, 1)),
          rawRatio: r.putOI / Math.max(r.callOI, 1),
          putOI: r.putOI,
          callOI: r.callOI,
        })),
    [rows]
  );

  const [tt, setTt] = useState<{ d: typeof data[number]; x: number; y: number } | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxRatio = 6;
  const chartH = 680;
  const barWidthPct = 100 / data.length;

  function colorFor(ratio: number) {
    if (ratio > 3) return { bg: "linear-gradient(180deg, #ff0066, #ff3366)", glow: "0 0 15px rgba(255,0,102,0.65)" };
    if (ratio > 1.5) return { bg: "linear-gradient(180deg, #ff3366, #ff6699)", glow: "0 0 10px rgba(255,51,102,0.45)" };
    if (ratio > 0.7) return { bg: YELLOW, glow: "0 0 8px rgba(251,191,36,0.35)" };
    if (ratio > 0.3) return { bg: "linear-gradient(180deg, #00ff88, #00cc6a)", glow: "0 0 10px rgba(0,255,136,0.45)" };
    return { bg: "linear-gradient(180deg, #00ffaa, #00ff88)", glow: "0 0 15px rgba(0,255,170,0.65)" };
  }

  return (
    <div
      className="rounded-lg p-5 flex flex-col"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, height: 800 }}
    >
      <div className="text-[11px] uppercase tracking-wider mb-3" style={{ color: TEXT }}>P/C SKEW BY STRIKE</div>

      <div className="flex-1 flex">
        {/* Y axis */}
        <div className="flex flex-col justify-between pr-2 text-[9px] text-right" style={{ color: MUTED, height: chartH }}>
          {[6, 5, 4, 3, 2, 1, 0].map((v) => (
            <span key={v}>{v}</span>
          ))}
        </div>

        {/* Chart area */}
        <div
          className="flex-1 relative"
          style={{ height: chartH, borderLeft: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}
          onMouseLeave={() => { setTt(null); setHoverIdx(null); }}
        >
          {/* horizontal grid */}
          {[1, 2, 3, 4, 5].map((v) => (
            <div
              key={v}
              className="absolute left-0 right-0"
              style={{ bottom: `${(v / maxRatio) * 100}%`, borderTop: `1px dashed ${BORDER}` }}
            />
          ))}

          {/* bars */}
          <div className="absolute inset-0 flex items-end px-1">
            {data.map((d, i) => {
              const h = (d.ratio / maxRatio) * 100;
              const c = colorFor(d.rawRatio);
              const isHover = hoverIdx === i;
              return (
                <div
                  key={d.strike}
                  className="flex-1 flex justify-center items-end mx-[1px] cursor-crosshair"
                  style={{ height: "100%" }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseMove={(e) => {
                    const host = (e.currentTarget.parentElement?.parentElement as HTMLElement).getBoundingClientRect();
                    setTt({ d, x: e.clientX - host.left, y: e.clientY - host.top });
                  }}
                >
                  <div
                    style={{
                      width: "85%",
                      maxWidth: 14,
                      height: `${h}%`,
                      background: c.bg,
                      boxShadow: c.glow,
                      borderRadius: "2px 2px 0 0",
                      transform: isHover ? "scaleY(1.05)" : "scaleY(1)",
                      transformOrigin: "bottom",
                      filter: isHover ? "brightness(1.2)" : "none",
                      transition: "transform 150ms, filter 150ms",
                    }}
                  />
                </div>
              );
            })}
          </div>

          {tt && (
            <div
              className="absolute pointer-events-none z-20 rounded px-2 py-1.5 text-[10px] leading-tight"
              style={{
                left: Math.min(tt.x + 12, 320),
                top: tt.y + 12,
                background: "rgba(10,10,10,0.95)",
                border: `1px solid ${CYAN}`,
                boxShadow: "0 0 8px rgba(6,182,212,0.4)",
                minWidth: 130,
              }}
            >
              <div style={{ color: CYAN, fontWeight: 700 }}>Strike: ${tt.d.strike}</div>
              <div style={{ color: tt.d.rawRatio > 1 ? RED_NEON : GREEN_NEON }}>P/C Ratio: {tt.d.rawRatio.toFixed(2)}</div>
              <div style={{ color: RED_NEON }}>Put OI: {formatNumber(tt.d.putOI, 0)}</div>
              <div style={{ color: GREEN_NEON }}>Call OI: {formatNumber(tt.d.callOI, 0)}</div>
            </div>
          )}
        </div>
      </div>

      {/* X axis labels */}
      <div className="flex pl-6 mt-1 text-[8px]" style={{ color: MUTED }}>
        {data.map((d, i) => (
          <div
            key={d.strike}
            className="flex-1 text-center"
            style={{ transform: "rotate(45deg)", transformOrigin: "top left", whiteSpace: "nowrap" }}
          >
            {i % Math.max(1, Math.floor(data.length / 12)) === 0 ? `$${d.strike}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
