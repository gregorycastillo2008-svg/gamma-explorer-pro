import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";
import { classifyGreekIntensity, INTENSITY_CONFIGS, formatGreekValue } from "@/lib/greeks/greekClassification";
import { GreekTooltip, type GreekType } from "./GreekTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, RefreshCw, Activity } from "lucide-react";

interface RawContract {
  ticker: string;
  strike: number;
  expiration: string;
  side: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  iv: number;
  oi: number;
  volume: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}
interface ChainResponse {
  symbol: string;
  spot: number;
  timestamp: string;
  source: string;
  expirations: string[];
  selectedExpiration: string;
  hv30: number;
  ivRank: number;
  skew: number;
  contracts: RawContract[];
  error?: string;
}

interface Props {
  symbol?: string;
  spot?: number;
  strikeStep?: number;
  iv?: number;
}

const TICKERS = ["SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "TSLA", "AMD", "META", "GOOGL", "AMZN"];

const GREEK_COLS: { key: GreekType; label: string; sub: string }[] = [
  { key: "delta", label: "DELTA", sub: "Δ" },
  { key: "gamma", label: "GAMMA", sub: "Γ" },
  { key: "vega", label: "VEGA", sub: "ν" },
  { key: "theta", label: "THETA", sub: "Θ" },
  { key: "vanna", label: "VANNA", sub: "∂Δ/∂σ" },
  { key: "charm", label: "CHARM", sub: "∂Δ/∂t" },
];

function daysBetween(iso: string): number {
  const exp = new Date(iso + "T21:00:00Z").getTime();
  return Math.max(0.5, (exp - Date.now()) / 86_400_000);
}

interface Row {
  strike: number;
  bid: number;
  ask: number;
  last: number;
  iv: number;
  oi: number;
  volume: number;
  greeks: { delta: number; gamma: number; vega: number; theta: number; vanna: number; charm: number };
  isAtm: boolean;
  off: number; // strike offset rank from ATM
}

export function GreekLadder({ symbol: initialSymbol = "SPY" }: Props) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<"call" | "put">("call");
  const [expiration, setExpiration] = useState<string>("");
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const fetchSeq = useRef(0);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch chain
  const load = async () => {
    setLoading(true);
    setErr(null);
    const seq = ++fetchSeq.current;
    try {
      const params = new URLSearchParams({ symbol });
      if (expiration) params.set("expiration", expiration);
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/polygon-options-chain?${params.toString()}`;
      const r = await fetch(url, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const json: ChainResponse = await r.json();
      if (seq !== fetchSeq.current) return;
      if (json.error) throw new Error(json.error);
      setChain(json);
      if (!expiration && json.selectedExpiration) setExpiration(json.selectedExpiration);
    } catch (e: any) {
      if (seq !== fetchSeq.current) return;
      setErr(e?.message || "fetch error");
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, expiration]);

  // Build rows for the selected side
  const rows: Row[] = useMemo(() => {
    if (!chain || !chain.contracts.length) return [];
    const spot = chain.spot;
    const dte = chain.selectedExpiration ? daysBetween(chain.selectedExpiration) : 7;
    // Group by strike (one side)
    const filtered = chain.contracts.filter((c) => c.side === side);
    // Build rows + recompute greeks if missing
    const built = filtered.map((c) => {
      const ivUse = c.iv > 0 ? c.iv : 0.25;
      let g = {
        delta: c.delta,
        gamma: c.gamma,
        vega: c.vega,
        theta: c.theta,
        vanna: 0,
        charm: 0,
      };
      // If broker greeks are zero/degenerate (common at 0DTE in CBOE), recompute
      const need = !c.gamma || !c.vega || !c.theta;
      const calc = calculateAllGreeks({
        spot,
        strike: c.strike,
        dte,
        iv: ivUse,
        rate: 0.045,
        isCall: side === "call",
      });
      if (need) g = { delta: calc.delta, gamma: calc.gamma, vega: calc.vega, theta: calc.theta, vanna: calc.vanna, charm: calc.charm };
      else g = { ...g, vanna: calc.vanna, charm: calc.charm };
      return {
        strike: c.strike,
        bid: c.bid,
        ask: c.ask,
        last: c.last,
        iv: c.iv,
        oi: c.oi,
        volume: c.volume,
        greeks: g,
        isAtm: false,
        off: 0,
      } as Row;
    });
    // Determine ATM
    if (!built.length) return [];
    const sorted = [...built].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
    const atmStrike = sorted[0].strike;
    // Limit to ±12 strikes around ATM
    const all = built.sort((a, b) => b.strike - a.strike);
    const atmIdx = all.findIndex((r) => r.strike === atmStrike);
    const window = all.slice(Math.max(0, atmIdx - 12), atmIdx + 13);
    return window.map((r, i) => ({
      ...r,
      isAtm: r.strike === atmStrike,
      off: window.findIndex((x) => x.strike === r.strike) - window.findIndex((x) => x.strike === atmStrike),
    }));
  }, [chain, side]);

  // All values per greek for intensity classification
  const allValues = useMemo(() => {
    const map: Record<GreekType, number[]> = { delta: [], gamma: [], vega: [], theta: [], vanna: [], charm: [] };
    rows.forEach((r) => GREEK_COLS.forEach((g) => map[g.key].push(r.greeks[g.key])));
    return map;
  }, [rows]);

  // Insights
  const insights = useMemo(() => {
    if (!rows.length) return null;
    const maxBy = (k: GreekType) =>
      rows.reduce((b, r) => (Math.abs(r.greeks[k]) > Math.abs(b.greeks[k]) ? r : b), rows[0]);
    return {
      gMax: maxBy("gamma"),
      vMax: maxBy("vega"),
      tMax: maxBy("theta"),
    };
  }, [rows]);

  const dte = chain?.selectedExpiration ? Math.round(daysBetween(chain.selectedExpiration)) : 0;
  const totalCallOI = chain?.contracts.filter((c) => c.side === "call").reduce((s, c) => s + c.oi, 0) ?? 0;
  const totalPutOI = chain?.contracts.filter((c) => c.side === "put").reduce((s, c) => s + c.oi, 0) ?? 0;
  const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  return (
    <div
      className="overflow-hidden font-mono"
      style={{ background: "#000000", border: "1px solid #1f1f1f", borderRadius: 8 }}
    >
      {/* ═════ HEADER ═════ */}
      <div style={{ background: "linear-gradient(180deg, #0a0a0a, #050505)", borderBottom: "1px solid #1f1f1f" }}>
        {/* Title row */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-bold tracking-[0.2em] text-amber-400">GREEK LADDER</span>
            </div>
            <span className="text-[9px] text-muted-foreground">|</span>
            <span className="text-[10px] font-bold text-foreground tracking-wider">{symbol}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{chain?.source?.toUpperCase() ?? "—"}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{dte}D</span>
            <span className="flex items-center gap-1 ml-2">
              <span className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`} />
              <span className="text-[9px] text-muted-foreground tracking-wider">{loading ? "LOADING" : "LIVE"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={symbol} onValueChange={(v) => { setSymbol(v); setExpiration(""); }}>
              <SelectTrigger className="h-6 w-[80px] bg-black border-[#2a2a2a] text-[10px] font-bold rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-black border-[#2a2a2a]">
                {TICKERS.map((t) => <SelectItem key={t} value={t} className="text-[10px] font-mono">{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={expiration} onValueChange={setExpiration}>
              <SelectTrigger className="h-6 w-[120px] bg-black border-[#2a2a2a] text-[10px] rounded-sm">
                <SelectValue placeholder="EXP" />
              </SelectTrigger>
              <SelectContent className="bg-black border-[#2a2a2a] max-h-[300px]">
                {(chain?.expirations ?? []).map((e) => {
                  const d = Math.round(daysBetween(e));
                  return <SelectItem key={e} value={e} className="text-[10px] font-mono">{e} <span className="text-muted-foreground">({d}D)</span></SelectItem>;
                })}
              </SelectContent>
            </Select>
            <button
              onClick={() => setSide(side === "call" ? "put" : "call")}
              className="flex items-center gap-1 h-6 px-2 text-[10px] font-bold rounded-sm border border-[#2a2a2a] bg-black hover:bg-[#0f0f0f]"
              style={{ color: side === "call" ? "#10b981" : "#ef4444" }}
            >
              <ArrowLeftRight className="w-2.5 h-2.5" />
              {side.toUpperCase()}
            </button>
            <button
              onClick={load}
              className="flex items-center justify-center h-6 w-6 rounded-sm border border-[#2a2a2a] bg-black hover:bg-[#0f0f0f] text-muted-foreground"
              title="Refresh"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Session metrics row (Bloomberg style) */}
        <div className="grid grid-cols-6 px-3 py-1.5 gap-x-3 text-[9px]">
          <Metric label="SPOT" value={chain ? `$${chain.spot.toFixed(2)}` : "—"} color="#ffffff" />
          <Metric
            label="ATM IV"
            value={chain ? `${(chain.contracts.find((c) => c.side === "call" && c.iv > 0)?.iv ? rows[0]?.iv * 100 : (rows[Math.floor(rows.length / 2)]?.iv ?? 0) * 100).toFixed(1)}%` : "—"}
            color="#fbbf24"
          />
          <Metric label="HV30" value={chain ? `${(chain.hv30 * 100).toFixed(1)}%` : "—"} color="#06b6d4" />
          <Metric label="IV RANK" value={chain ? `${chain.ivRank.toFixed(0)}` : "—"} color={chain && chain.ivRank > 50 ? "#ef4444" : "#10b981"} />
          <Metric label="SKEW" value={chain ? `${(chain.skew * 100).toFixed(2)}%` : "—"} color={chain && chain.skew > 0 ? "#ef4444" : "#10b981"} />
          <Metric label="P/C OI" value={pcRatio ? pcRatio.toFixed(2) : "—"} color={pcRatio > 1 ? "#ef4444" : "#10b981"} />
        </div>
      </div>

      {/* ═════ TABLE ═════ */}
      {err && (
        <div className="p-4 text-center text-[11px] text-red-400">Error: {err}</div>
      )}
      {!err && rows.length === 0 && !loading && (
        <div className="p-4 text-center text-[11px] text-muted-foreground">No options data for {symbol} / {expiration}</div>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 10 }}>
            <thead style={{ background: "#0a0a0a", borderBottom: "1px solid #2a2a2a" }}>
              <tr style={{ color: "#6b7280" }}>
                <Th>STRIKE</Th>
                <Th r>BID</Th>
                <Th r>ASK</Th>
                <Th r>LAST</Th>
                <Th r>IV</Th>
                <Th r>OI</Th>
                <Th r>VOL</Th>
                {GREEK_COLS.map((g) => (
                  <th key={g.key} className="text-center px-1.5 py-1.5 font-bold tracking-wider uppercase" style={{ color: "#9ca3af", borderLeft: "1px solid #1a1a1a" }}>
                    <div>{g.label}</div>
                    <div className="text-[8px] text-muted-foreground font-normal normal-case">({g.sub})</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const distColor =
                  r.off > 5 ? "#22c55e" :
                  r.off > 0 ? "#84cc16" :
                  r.off === 0 ? "#06b6d4" :
                  r.off >= -5 ? "#fbbf24" : "#f97316";
                const distLabel = r.isAtm ? "ATM" : r.off > 0 ? `+${r.off}` : `${r.off}`;
                const spread = r.ask - r.bid;
                return (
                  <tr
                    key={r.strike}
                    className="hover:brightness-150 transition-all"
                    style={{
                      background: r.isAtm
                        ? "rgba(6, 182, 212, 0.10)"
                        : idx % 2 === 0 ? "#050505" : "#0a0a0a",
                      boxShadow: r.isAtm ? "inset 3px 0 0 #06b6d4, inset -3px 0 0 #06b6d4" : undefined,
                      borderBottom: "1px solid #111",
                    }}
                  >
                    <td className="px-2 py-1">
                      <div className="flex items-baseline gap-1.5">
                        <span style={{ color: r.isAtm ? "#06b6d4" : "#ffffff", fontWeight: 700, fontSize: 11 }}>
                          ${r.strike.toFixed(r.strike >= 100 ? 0 : 1)}
                        </span>
                        <span style={{ color: distColor, fontSize: 8, fontWeight: 600 }}>{distLabel}</span>
                      </div>
                    </td>
                    <NumCell value={r.bid} color="#10b981" prefix="$" digits={2} />
                    <NumCell value={r.ask} color="#ef4444" prefix="$" digits={2} />
                    <NumCell value={r.last} color="#e5e7eb" prefix="$" digits={2} />
                    <NumCell value={r.iv * 100} color="#fbbf24" suffix="%" digits={1} />
                    <NumCell value={r.oi} color={r.oi > 1000 ? "#06b6d4" : "#9ca3af"} digits={0} format="int" />
                    <NumCell value={r.volume} color={r.volume > 500 ? "#a855f7" : "#6b7280"} digits={0} format="int" />
                    {GREEK_COLS.map((g) => (
                      <GreekCell
                        key={g.key}
                        value={r.greeks[g.key]}
                        type={g.key}
                        allValues={allValues[g.key]}
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═════ FOOTER INSIGHTS ═════ */}
      {insights && (
        <div className="px-3 py-2 border-t border-[#1f1f1f]" style={{ background: "#050505" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] font-bold tracking-widest text-amber-400">INSIGHTS</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className="text-[9px] text-muted-foreground">{now.toLocaleTimeString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <Insight color="#ef4444" label="GAMMA MAX" strike={insights.gMax.strike} value={insights.gMax.greeks.gamma.toFixed(4)} note="Highest pin risk" />
            <Insight color="#a855f7" label="VEGA MAX" strike={insights.vMax.strike} value={insights.vMax.greeks.vega.toFixed(2)} note="Max IV exposure" />
            <Insight color="#fbbf24" label="THETA MAX" strike={insights.tMax.strike} value={insights.tMax.greeks.theta.toFixed(2)} note="Max daily decay" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ───
function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return (
    <th className={`px-2 py-1.5 font-bold tracking-wider uppercase ${r ? "text-right" : "text-left"}`} style={{ fontSize: 9 }}>
      {children}
    </th>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground tracking-widest" style={{ fontSize: 8 }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 10 }}>{value}</span>
    </div>
  );
}

function NumCell({ value, color, prefix = "", suffix = "", digits = 2, format }: { value: number; color: string; prefix?: string; suffix?: string; digits?: number; format?: "int" }) {
  if (!value) return <td className="text-right px-2 py-1 text-muted-foreground" style={{ borderLeft: "1px solid #111" }}>—</td>;
  const formatted = format === "int" ? value.toLocaleString() : value.toFixed(digits);
  return (
    <td className="text-right px-2 py-1 font-mono tabular-nums" style={{ color, borderLeft: "1px solid #111", fontSize: 10 }}>
      {prefix}{formatted}{suffix}
    </td>
  );
}

function Insight({ label, strike, value, note, color }: { label: string; strike: number; value: string; note: string; color: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 rounded" style={{ background: "rgba(255,255,255,0.02)", borderLeft: `2px solid ${color}` }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[8px] tracking-widest text-muted-foreground font-bold">{label}</span>
        <span className="text-[10px] font-bold text-foreground">${strike}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] text-muted-foreground italic">{note}</span>
        <span className="text-[10px] font-mono" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

function GreekCell({ value, type, allValues }: { value: number; type: GreekType; allValues: number[] }) {
  const [hover, setHover] = useState(false);
  const intensity = classifyGreekIntensity(value, allValues);
  const cfg = INTENSITY_CONFIGS[intensity];
  const valueColor = value > 0 ? "#10b981" : value < 0 ? "#ef4444" : "#6b7280";
  return (
    <td
      className="relative px-1.5 py-1 text-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderLeft: "1px solid #111" }}
    >
      <div className="flex items-center justify-center gap-1">
        <span style={{ color: valueColor, fontWeight: 600, fontSize: 10 }} className="tabular-nums">
          {formatGreekValue(value, type)}
        </span>
        <span
          style={{
            background: cfg.gradient,
            color: cfg.textColor,
            border: cfg.border,
            boxShadow: cfg.shadow,
            fontWeight: cfg.fontWeight as any,
            padding: "0px 4px",
            borderRadius: 2,
            fontSize: 7,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            lineHeight: 1.4,
          }}
        >
          {cfg.label}
        </span>
      </div>
      {hover && <GreekTooltip type={type} value={value} intensity={intensity} />}
    </td>
  );
}
