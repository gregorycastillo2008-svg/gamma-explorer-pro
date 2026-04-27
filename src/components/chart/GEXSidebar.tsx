import { useEffect, useState } from "react";

interface KeyLevels {
  zeroGamma?: number;
  callWall?: number;
  putWall?: number;
}

interface Aggregates {
  netGEX: number;
  callGEX: number;
  putGEX: number;
  totalCallOI: number;
  totalPutOI: number;
}

interface MaxChange {
  time: string;
  strike: number;
  gex: string;
}

interface Props {
  symbol: string;
  spot: number;
  keyLevels: KeyLevels;
  aggregates: Aggregates;
  maxChanges: MaxChange[];
  onLoadHistory?: () => void;
  onClearCache?: () => void;
  onTickerChange?: (s: string) => void;
  tickers: string[];
  expirationLatest?: string;
  expirationNext?: string;
}

export function GEXSidebar({
  symbol, spot, keyLevels, aggregates, maxChanges,
  onLoadHistory, onClearCache, onTickerChange, tickers,
  expirationLatest, expirationNext,
}: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="w-[300px] flex flex-col font-mono text-[11px] shrink-0"
      style={{ background: "#0a0a0a", borderLeft: "1px solid #1f1f1f" }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1f1f1f]">
        <div className="text-amber-400 text-base font-bold tracking-[0.2em]">gex bot</div>
        <div className="text-muted-foreground text-[10px]">classic</div>
      </div>

      {/* Ticker */}
      <div className="px-4 py-3 border-b border-[#1f1f1f]">
        <label className="text-muted-foreground text-[9px] uppercase tracking-widest mb-1.5 block">Ticker</label>
        <select
          value={symbol}
          onChange={(e) => onTickerChange?.(e.target.value)}
          className="w-full bg-black border border-[#2a2a2a] rounded px-2 py-1.5 text-foreground text-[11px] font-bold"
        >
          {tickers.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {/* Expirations */}
      <div className="px-4 py-3 border-b border-[#1f1f1f]">
        <div className="text-muted-foreground text-[10px] mb-2">90d (agg)</div>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-cyan-400">latest ({expirationLatest ?? "—"})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">next ({expirationNext ?? "—"})</span>
          </div>
        </div>
      </div>

      {/* Update */}
      <Section title="Update">
        <Row k="date" v={now.toLocaleDateString()} />
        <Row k="time" v={now.toLocaleTimeString()} />
        <Row k="spot" v={spot ? spot.toFixed(2) : "—"} />
      </Section>

      {/* Volume / Gamma key levels */}
      <Section title="Volume">
        <Row k="zero gamma" v={keyLevels.zeroGamma?.toFixed(2) ?? "—"} kColor="#10b981" />
        <Row k="major positive" v={keyLevels.callWall?.toFixed(2) ?? "—"} kColor="#10b981" />
        <Row k="major negative" v={keyLevels.putWall?.toFixed(2) ?? "—"} kColor="#ef4444" />
        <Row k="net gex" v={fmtBn(aggregates.netGEX)} />
      </Section>

      {/* Open Interest */}
      <Section title="Open Interest">
        <Row k="major positive" v={fmtCompact(aggregates.totalCallOI)} kColor="#10b981" />
        <Row k="major negative" v={fmtCompact(aggregates.totalPutOI)} kColor="#ef4444" />
        <Row k="net oi" v={fmtCompact(aggregates.totalCallOI + aggregates.totalPutOI)} />
      </Section>

      {/* Max Change GEX */}
      <Section title="Max Change GEX">
        {maxChanges.map((m, i) => (
          <div key={i} className="flex justify-between items-center text-[10px]">
            <span className="text-cyan-400 w-12">{m.time}</span>
            <span className="text-muted-foreground tabular-nums">{m.strike}</span>
            <span className="text-foreground/80 tabular-nums">{m.gex}</span>
          </div>
        ))}
      </Section>

      <div className="flex-1" />

      <div className="px-4 py-3 space-y-1.5">
        <button
          onClick={onLoadHistory}
          className="w-full py-1.5 text-[10px] font-bold rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20"
        >
          load history
        </button>
        <button
          onClick={onClearCache}
          className="w-full py-1.5 text-[10px] font-bold rounded border border-[#2a2a2a] bg-[#0f0f0f] text-muted-foreground hover:bg-[#181818]"
        >
          clear cache
        </button>
      </div>

      <div className="px-4 py-2 border-t border-[#1f1f1f] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] text-muted-foreground">1x</span>
        </div>
        <span className="text-[9px] text-muted-foreground tabular-nums">{now.toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-[#1f1f1f]">
      <div className="text-muted-foreground text-[9px] uppercase tracking-widest mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ k, v, kColor }: { k: string; v: string; kColor?: string }) {
  return (
    <div className="flex justify-between text-[10px]">
      <span style={{ color: kColor ?? "#6b7280" }}>{k}</span>
      <span className="text-foreground tabular-nums">{v}</span>
    </div>
  );
}

function fmtBn(v: number): string {
  if (!v) return "—";
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)}M`;
  return `${sign}${a.toFixed(0)}`;
}
function fmtCompact(v: number): string {
  if (!v) return "—";
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
