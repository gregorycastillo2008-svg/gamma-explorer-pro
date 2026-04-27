import { useMemo, useState } from "react";
import { computeExposures, computeKeyLevels, formatNumber } from "@/lib/gex";
import type { DemoTicker, OptionContract, ExposurePoint, KeyLevels } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

const GREEN = "#10b981";
const RED = "#ef4444";
const CYAN = "#06b6d4";
const YELLOW = "#fbbf24";
const MUTED = "#6b7280";
const ZERO = "#4b5563";
const BORDER = "#1f1f1f";
const PANEL_BG = "#0a0a0a";

interface PanelConfig {
  key: string;
  label: string;
  filter: (c: OptionContract) => boolean;
}

export function DepthMultiPanel({ ticker, contracts }: Props) {
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);

  const panels: PanelConfig[] = useMemo(
    () => [
      { key: "all", label: "ALL", filter: () => true },
      { key: "0dte", label: "0 DTE", filter: (c) => c.expiry <= 1 },
      { key: "2dte", label: "2 DTE", filter: (c) => c.expiry === 2 || c.expiry === 3 },
      { key: "3dte", label: "3 DTE", filter: (c) => c.expiry > 3 && c.expiry <= 7 },
    ],
    []
  );

  return (
    <div className="h-full w-full flex flex-col bg-black p-6 font-mono">
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="text-[11px] uppercase tracking-[0.25em]"
          style={{ color: MUTED }}
        >
          Depth View
        </h2>
        <div className="text-[10px]" style={{ color: ZERO }}>
          {ticker.symbol} · spot ${ticker.spot.toFixed(2)}
        </div>
      </div>

      <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden pb-2">
        {panels.map((p) => {
          const filtered = contracts.filter(p.filter);
          const exposures = computeExposures(ticker.spot, filtered);
          const levels = computeKeyLevels(exposures);
          return (
            <DepthPanel
              key={p.key}
              label={p.label}
              ticker={ticker}
              exposures={exposures}
              levels={levels}
              panelKeys={panels.map((x) => x.label)}
              activeLabel={p.label}
              hoverStrike={hoverStrike}
              setHoverStrike={setHoverStrike}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DepthPanelProps {
  label: string;
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  panelKeys: string[];
  activeLabel: string;
  hoverStrike: number | null;
  setHoverStrike: (s: number | null) => void;
}

function DepthPanel({
  label,
  ticker,
  exposures,
  levels,
  panelKeys,
  activeLabel,
  hoverStrike,
  setHoverStrike,
}: DepthPanelProps) {
  // Sort high → low for top-down display
  const rows = useMemo(
    () => [...exposures].sort((a, b) => b.strike - a.strike),
    [exposures]
  );

  const maxAbsGex = Math.max(...rows.map((r) => Math.abs(r.netGex)), 1);
  const maxOI = Math.max(...rows.map((r) => Math.max(r.callOI, r.putOI)), 1);

  const spot = ticker.spot;
  const flip = levels.gammaFlip;

  // Identify support/resistance: largest put OI below spot / largest call OI above
  const support = rows
    .filter((r) => r.strike < spot)
    .reduce((b, r) => (r.putOI > (b?.putOI ?? 0) ? r : b), null as ExposurePoint | null);
  const resistance = rows
    .filter((r) => r.strike > spot)
    .reduce((b, r) => (r.callOI > (b?.callOI ?? 0) ? r : b), null as ExposurePoint | null);

  return (
    <div
      className="flex-shrink-0 flex flex-col"
      style={{
        width: 340,
        height: 500,
        background: PANEL_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex flex-col gap-1.5"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>
          GEX DEX BY STRIKE
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {panelKeys.map((k) => (
            <span
              key={k}
              style={{
                color: k === activeLabel ? CYAN : MUTED,
                fontWeight: k === activeLabel ? 700 : 400,
              }}
            >
              {k}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* LEFT — horizontal bars mirror chart */}
        <div className="flex flex-col min-h-0 relative">
          <div
            className="flex justify-between px-2 py-1 text-[9px]"
            style={{ color: MUTED, borderBottom: `1px solid ${BORDER}` }}
          >
            <span style={{ color: RED }}>PUTS</span>
            <span style={{ color: GREEN }}>CALLS</span>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-1 relative">
            {rows.map((r) => {
              const isSpot = Math.abs(r.strike - spot) < ticker.strikeStep / 2;
              const isFlip = flip != null && Math.abs(r.strike - flip) < ticker.strikeStep / 2;
              const isSupport = support && r.strike === support.strike;
              const isResistance = resistance && r.strike === resistance.strike;
              const putW = (r.putOI / maxOI) * 100;
              const callW = (r.callOI / maxOI) * 100;
              const isHover = hoverStrike === r.strike;
              return (
                <div
                  key={r.strike}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className="grid grid-cols-[28px_1fr_1fr] items-center gap-0.5 leading-none"
                  style={{
                    background: isHover ? "rgba(255,255,255,0.05)" : "transparent",
                    borderTop: isSpot
                      ? `1px dashed ${YELLOW}`
                      : isFlip
                      ? `1px dashed ${CYAN}`
                      : "1px solid transparent",
                  }}
                  title={`Strike $${r.strike} · NET GEX: ${formatNumber(r.netGex)}`}
                >
                  <div
                    className="text-[8px] text-right pr-1 tabular-nums"
                    style={{
                      color: isSpot ? YELLOW : isFlip ? CYAN : MUTED,
                      fontWeight: isSpot || isFlip ? 700 : 400,
                    }}
                  >
                    {r.strike}
                  </div>
                  {/* Put bar (grows leftward from center) */}
                  <div className="flex justify-end h-2.5">
                    <div
                      style={{
                        width: `${putW}%`,
                        background: RED,
                        opacity: 0.8,
                        borderRadius: "2px 0 0 2px",
                      }}
                    />
                  </div>
                  {/* Call bar (grows rightward from center) */}
                  <div className="flex justify-start h-2.5 relative">
                    <div
                      style={{
                        width: `${callW}%`,
                        background: GREEN,
                        opacity: 0.8,
                        borderRadius: "0 2px 2px 0",
                      }}
                    />
                    {isSupport && (
                      <span
                        className="absolute left-full ml-1 text-[7px] whitespace-nowrap"
                        style={{ color: GREEN }}
                      >
                        SUPPORT ${r.strike}
                      </span>
                    )}
                    {isResistance && (
                      <span
                        className="absolute left-full ml-1 text-[7px] whitespace-nowrap"
                        style={{ color: RED }}
                      >
                        RESIST ${r.strike}
                      </span>
                    )}
                    {isFlip && (
                      <span
                        className="absolute left-full ml-1 text-[7px] font-bold whitespace-nowrap"
                        style={{ color: CYAN }}
                      >
                        FLIP ${r.strike}
                      </span>
                    )}
                    {isSpot && (
                      <span
                        className="absolute left-full ml-1 text-[7px] font-bold whitespace-nowrap"
                        style={{ color: YELLOW }}
                      >
                        ◀ ${spot.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — data table */}
        <div
          className="flex flex-col min-h-0"
          style={{
            borderLeft: `1px solid ${BORDER}`,
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div
            className="grid grid-cols-3 px-2 py-1 text-[9px] uppercase tracking-wider"
            style={{ color: MUTED, borderBottom: `1px solid ${BORDER}` }}
          >
            <span>Strike</span>
            <span className="text-center">GEX Net</span>
            <span className="text-right">Strike</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rows.map((r) => {
              const isSpot = Math.abs(r.strike - spot) < ticker.strikeStep / 2;
              const isFlip = flip != null && Math.abs(r.strike - flip) < ticker.strikeStep / 2;
              const isHover = hoverStrike === r.strike;
              const v = r.netGex;
              const valueColor =
                Math.abs(v) < maxAbsGex * 0.01
                  ? ZERO
                  : v > 0
                  ? GREEN
                  : RED;
              return (
                <div
                  key={r.strike}
                  onMouseEnter={() => setHoverStrike(r.strike)}
                  onMouseLeave={() => setHoverStrike(null)}
                  className="grid grid-cols-3 px-2 py-0.5 text-[9px] tabular-nums cursor-default"
                  style={{
                    background: isHover ? "rgba(255,255,255,0.06)" : "transparent",
                    borderBottom: `1px solid rgba(31,31,31,0.5)`,
                  }}
                >
                  <span
                    style={{
                      color: isSpot ? YELLOW : isFlip ? CYAN : "#e5e7eb",
                      fontWeight: isSpot || isFlip ? 700 : 400,
                    }}
                  >
                    ${r.strike}
                  </span>
                  <span className="text-center" style={{ color: valueColor }}>
                    {Math.abs(v) < maxAbsGex * 0.01
                      ? "0"
                      : `${v > 0 ? "+" : ""}${formatNumber(v)}`}
                  </span>
                  <span
                    className="text-right"
                    style={{ color: MUTED }}
                  >
                    ${r.strike + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
