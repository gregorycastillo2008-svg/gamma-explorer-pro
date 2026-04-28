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
        <OIMatrixPanel rows={perStrike} spot={ticker.spot} />
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
              <div className="group/put flex justify-end h-3.5">
                <div
                  className="origin-right transition-all duration-150 ease-out group-hover/put:scale-y-[1.4] group-hover/put:brightness-125"
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
              <div className="group/call flex justify-start h-3.5">
                <div
                  className="origin-left transition-all duration-150 ease-out group-hover/call:scale-y-[2] group-hover/call:brightness-125"
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

// ─────────── OPEN INTEREST MATRIX (QuikStrike-style) ───────────
function OIMatrixPanel({
  rows,
  spot,
}: {
  rows: { strike: number; callOI: number; putOI: number }[];
  spot: number;
}) {
  const data = useMemo(
    () => [...rows].sort((a, b) => a.strike - b.strike),
    [rows]
  );

  const maxOI = useMemo(
    () => Math.max(1, ...data.flatMap((r) => [r.callOI, r.putOI])),
    [data]
  );

  // ATM strike = closest to spot
  const atmStrike = useMemo(() => {
    if (!data.length) return null;
    return data.reduce((best, r) =>
      Math.abs(r.strike - spot) < Math.abs(best.strike - spot) ? r : best
    ).strike;
  }, [data, spot]);

  const [hoverStrike, setHoverStrike] = useState<number | null>(null);

  // Heatmap intensity → cyan tint with alpha
  const cellBg = (oi: number) => {
    if (!oi) return "transparent";
    const t = Math.min(1, oi / maxOI);
    // log-ish scaling so mid values still pop
    const alpha = 0.08 + Math.pow(t, 0.55) * 0.65;
    return `rgba(6,182,212,${alpha.toFixed(3)})`;
  };

  const totalCall = data.reduce((s, r) => s + r.callOI, 0);
  const totalPut = data.reduce((s, r) => s + r.putOI, 0);

  return (
    <div
      className="rounded-lg flex flex-col overflow-hidden"
      style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, height: 800 }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: BORDER }}
      >
        <div className="text-[11px] uppercase tracking-wider" style={{ color: TEXT }}>
          Open Interest Matrix
        </div>
        <div className="flex items-center gap-3 text-[9px] font-mono" style={{ color: MUTED }}>
          <span style={{ color: GREEN_NEON }}>● CALL {formatNumber(totalCall, 0)}</span>
          <span style={{ color: RED_NEON }}>● PUT {formatNumber(totalPut, 0)}</span>
          <span style={{ color: CYAN }}>● ATM ${atmStrike ?? "—"}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse text-[11px] font-mono">
          <thead className="sticky top-0 z-10" style={{ background: PANEL_BG }}>
            <tr style={{ borderBottom: `1px solid ${BORDER}` }}>
              <th
                className="py-2 px-3 text-right font-semibold uppercase tracking-wider"
                style={{ color: MUTED, fontSize: 9, width: "20%" }}
              >
                Call OI
              </th>
              <th
                className="py-2 px-3 text-center font-bold uppercase tracking-wider"
                style={{ color: TEXT_HI, fontSize: 10, width: 80 }}
              >
                Strike
              </th>
              <th
                className="py-2 px-3 text-left font-semibold uppercase tracking-wider"
                style={{ color: MUTED, fontSize: 9, width: "20%" }}
              >
                Put OI
              </th>
              <th
                className="py-2 px-3 text-center font-semibold uppercase tracking-wider"
                style={{ color: MUTED, fontSize: 9 }}
              >
                C / P Ratio
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const isAtm = r.strike === atmStrike;
              const isHover = hoverStrike === r.strike;
              const ratio = r.putOI > 0 ? r.callOI / r.putOI : r.callOI > 0 ? Infinity : 0;
              const rowBg = isAtm
                ? "rgba(6,182,212,0.08)"
                : isHover
                ? "rgba(255,255,255,0.03)"
                : "transparent";

              return (
                <tr
                  key={r.strike}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  style={{
                    background: rowBg,
                    borderBottom: `1px solid ${BORDER}`,
                    transition: "background 120ms",
                  }}
                >
                  {/* Call OI cell — heatmap */}
                  <td
                    className="py-1.5 px-3 text-right tabular-nums"
                    style={{
                      background: cellBg(r.callOI),
                      color: r.callOI > 0 ? TEXT_HI : MUTED,
                      transition: "background 120ms",
                    }}
                  >
                    {r.callOI > 0 ? formatNumber(r.callOI, 0) : "—"}
                  </td>

                  {/* Strike */}
                  <td
                    className="py-1.5 px-3 text-center tabular-nums"
                    style={{
                      color: isAtm ? CYAN : TEXT_HI,
                      fontWeight: isAtm ? 800 : 600,
                      borderLeft: `1px solid ${BORDER}`,
                      borderRight: `1px solid ${BORDER}`,
                    }}
                  >
                    {isAtm && <span style={{ color: CYAN, marginRight: 4 }}>▶</span>}
                    {r.strike}
                  </td>

                  {/* Put OI cell — heatmap */}
                  <td
                    className="py-1.5 px-3 text-left tabular-nums"
                    style={{
                      background: cellBg(r.putOI),
                      color: r.putOI > 0 ? TEXT_HI : MUTED,
                      transition: "background 120ms",
                    }}
                  >
                    {r.putOI > 0 ? formatNumber(r.putOI, 0) : "—"}
                  </td>

                  {/* C/P ratio */}
                  <td
                    className="py-1.5 px-3 text-center tabular-nums"
                    style={{
                      color:
                        ratio === Infinity
                          ? GREEN_NEON
                          : ratio > 1.5
                          ? GREEN_NEON
                          : ratio < 0.67
                          ? RED_NEON
                          : YELLOW,
                    }}
                  >
                    {ratio === Infinity ? "∞" : ratio === 0 ? "0" : ratio.toFixed(2)}
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
