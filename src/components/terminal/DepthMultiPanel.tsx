import { useEffect, useMemo, useRef, useState } from "react";
import { computeExposures, computeKeyLevels, formatNumber } from "@/lib/gex";
import type { DemoTicker, OptionContract, ExposurePoint, KeyLevels } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[]; // fallback (demo)
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

interface RealChainContract {
  ticker: string; strike: number; expiration: string; side: "call" | "put";
  bid: number; ask: number; last: number; iv: number; oi: number; volume: number;
  delta: number; gamma: number; theta: number; vega: number;
}
interface RealChain {
  symbol: string; spot: number; selectedExpiration: string; expirations: string[];
  contracts: RealChainContract[]; error?: string;
}

function daysUntil(iso: string): number {
  const exp = new Date(iso + "T21:00:00Z").getTime();
  return Math.max(0, Math.round((exp - Date.now()) / 86_400_000));
}

export function DepthMultiPanel({ ticker, contracts }: Props) {
  const [hoverStrike, setHoverStrike] = useState<number | null>(null);
  const [realChain, setRealChain] = useState<RealChain | null>(null);
  const fetchSeq = useRef(0);

  // Fetch real options chain (ALL near-term expirations) from edge function
  useEffect(() => {
    const seq = ++fetchSeq.current;
    const load = async () => {
      try {
        const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/polygon-options-chain?symbol=${ticker.symbol}&all=1`;
        const r = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        const j: RealChain = await r.json();
        if (seq !== fetchSeq.current) return;
        if (!j.error) setRealChain(j);
      } catch {}
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [ticker.symbol]);

  // Map real chain to OptionContract[] expected by computeExposures
  const realContracts: OptionContract[] = useMemo(() => {
    if (!realChain || !realChain.contracts.length) return [];
    return realChain.contracts.map((c) => ({
      strike: c.strike,
      expiry: daysUntil(c.expiration),
      type: c.side,
      iv: c.iv || 0.25,
      oi: c.oi || 0,
      gamma: c.gamma,
      delta: c.delta,
      vega: c.vega,
      theta: c.theta,
    }));
  }, [realChain]);

  // Use REAL contracts when available, otherwise fall back to demo
  const sourceContracts = realContracts.length > 0 ? realContracts : contracts;
  const realSpot = realChain?.spot ?? ticker.spot;
  const liveTicker = { ...ticker, spot: realSpot };

  // Available DTE buckets: only show buckets that actually have real contracts
  const availableDtes = useMemo(() => {
    const set = new Set<number>();
    for (const c of sourceContracts) set.add(c.expiry);
    return [...set].filter((d) => d <= 7).sort((a, b) => a - b);
  }, [sourceContracts]);

  // Each panel bucket = contracts with EXACT DTE match (real gamma for that day)
  const dteOptions: PanelConfig[] = useMemo(() => {
    const list = availableDtes.length > 0 ? availableDtes : [0, 1, 2, 3];
    return list.map((d) => ({
      key: `${d}dte`,
      label: d === 0 ? "0 DTE" : `${d} DTE`,
      filter: (c: OptionContract) => c.expiry === d,
    }));
  }, [availableDtes]);

  const [leftKey, setLeftKey] = useState<string>("1dte");
  const [rightKey, setRightKey] = useState<string>("3dte");

  // Ensure selected keys exist in current dteOptions; otherwise fall back
  const leftCfg = dteOptions.find((o) => o.key === leftKey) ?? dteOptions[0];
  const rightCfg = dteOptions.find((o) => o.key === rightKey) ?? dteOptions[Math.min(2, dteOptions.length - 1)] ?? dteOptions[0];

  const buildPanel = (cfg: PanelConfig) => {
    const filtered = sourceContracts.filter(cfg.filter);
    const exposures = computeExposures(realSpot, filtered);
    const levels = computeKeyLevels(exposures);
    return { exposures, levels };
  };

  const left = buildPanel(leftCfg);
  const right = buildPanel(rightCfg);

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
          {ticker.symbol} · spot ${realSpot.toFixed(2)} {realContracts.length > 0 ? "· LIVE" : "· demo"}
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
        <DepthPanel
          ticker={liveTicker}
          exposures={left.exposures}
          levels={left.levels}
          dteOptions={dteOptions}
          activeKey={leftKey}
          onSelectKey={setLeftKey}
          hoverStrike={hoverStrike}
          setHoverStrike={setHoverStrike}
        />
        <DepthPanel
          ticker={liveTicker}
          exposures={right.exposures}
          levels={right.levels}
          dteOptions={dteOptions}
          activeKey={rightKey}
          onSelectKey={setRightKey}
          hoverStrike={hoverStrike}
          setHoverStrike={setHoverStrike}
        />
      </div>
    </div>
  );
}


interface DepthPanelProps {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  dteOptions: PanelConfig[];
  activeKey: string;
  onSelectKey: (k: string) => void;
  hoverStrike: number | null;
  setHoverStrike: (s: number | null) => void;
}

function DepthPanel({
  ticker,
  exposures,
  levels,
  dteOptions,
  activeKey,
  onSelectKey,
  hoverStrike,
  setHoverStrike,
}: DepthPanelProps) {
  const [tooltip, setTooltip] = useState<
    | { strike: number; callOI: number; putOI: number; netGex: number; x: number; y: number }
    | null
  >(null);

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
      className="w-full h-full flex flex-col min-h-0"
      style={{
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
        <div className="flex items-center gap-3 text-[10px] flex-wrap">
          {dteOptions.map((o) => (
            <button
              key={o.key}
              onClick={() => onSelectKey(o.key)}
              className="transition-colors hover:text-white"
              style={{
                color: o.key === activeKey ? CYAN : MUTED,
                fontWeight: o.key === activeKey ? 700 : 400,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {o.label}
            </button>
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
          <div
            className="flex-1 overflow-y-auto px-1 py-1 relative"
            onMouseLeave={() => setTooltip(null)}
          >
            {rows.length === 0 && (
              <div className="h-full flex items-center justify-center text-[10px]" style={{ color: MUTED }}>
                Sin opciones reales en este rango DTE
              </div>
            )}
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
                  onMouseMove={(e) => {
                    const host = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                    setTooltip({
                      strike: r.strike,
                      callOI: r.callOI,
                      putOI: r.putOI,
                      netGex: r.netGex,
                      x: e.clientX - host.left,
                      y: e.clientY - host.top,
                    });
                  }}
                  className="grid grid-cols-[28px_1fr_1fr] items-center gap-0.5 leading-none cursor-crosshair"
                  style={{
                    background: isHover ? "rgba(255,255,255,0.05)" : "transparent",
                    borderTop: isSpot
                      ? `1px dashed ${YELLOW}`
                      : isFlip
                      ? `1px dashed ${CYAN}`
                      : "1px solid transparent",
                  }}
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
            {tooltip && (
              <div
                className="absolute pointer-events-none z-20 rounded px-2 py-1.5 text-[10px] font-mono leading-tight whitespace-nowrap"
                style={{
                  left: Math.min(tooltip.x + 12, 220),
                  top: tooltip.y + 12,
                  background: "rgba(0,0,0,0.92)",
                  border: `1px solid ${CYAN}`,
                  color: "#e5e7eb",
                  boxShadow: `0 0 8px rgba(6,182,212,0.4)`,
                }}
              >
                <div style={{ color: YELLOW, fontWeight: 700 }}>STRIKE ${tooltip.strike}</div>
                <div style={{ color: GREEN }}>Calls OI: {formatNumber(tooltip.callOI, 0)}</div>
                <div style={{ color: RED }}>Puts OI: {formatNumber(tooltip.putOI, 0)}</div>
                <div style={{ color: tooltip.netGex >= 0 ? GREEN : RED }}>
                  NET GEX: {tooltip.netGex >= 0 ? "+" : ""}{formatNumber(tooltip.netGex)}
                </div>
                <div style={{ color: MUTED }}>Total OI: {formatNumber(tooltip.callOI + tooltip.putOI, 0)}</div>
              </div>
            )}
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
