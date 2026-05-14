import { useEffect, useMemo, useRef, useState } from "react";

import { calculateAllGreeks } from "@/lib/greeks/greekCalculations";
import { classifyGreekIntensity, formatGreekValue } from "@/lib/greeks/greekClassification";
import { GreekTooltip, type GreekType } from "./GreekTooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeftRight, RefreshCw, Activity } from "lucide-react";
import { type DealerStrikeRow } from "./DealerExposureBars";
import { GexGreekSurface3D } from "./GexGreekSurface3D";
import type { SurfacePoint } from "./GreeksSurface3D";
import { StrikerDeltaGrid } from "./StrikerDeltaGrid";
import { DeltaStrikerPanel } from "./DeltaStrikerPanel";

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

const GREEK_COLS: { key: GreekType; label: string }[] = [
  { key: "delta", label: "DELTA" },
  { key: "gamma", label: "GAMMA" },
  { key: "vega",  label: "VEGA"  },
  { key: "theta", label: "THETA" },
  { key: "vanna", label: "VANNA" },
  { key: "charm", label: "CHARM" },
];

const MONO = "JetBrains Mono, ui-monospace, monospace";

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
  off: number;
}

export function GreekLadder({ symbol: initialSymbol = "QQQ" }: Props) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<"call" | "put">("call");
  const [expiration, setExpiration] = useState<string>("");
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState<"ladder" | "delta" | "striker">("ladder");
  const fetchSeq = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const rows: Row[] = useMemo(() => {
    if (!chain || !chain.contracts.length) return [];
    const spot = chain.spot;
    const dte = chain.selectedExpiration ? daysBetween(chain.selectedExpiration) : 7;
    const filtered = chain.contracts.filter((c) => c.side === side);
    const built = filtered.map((c) => {
      const ivUse = c.iv > 0 ? c.iv : 0.25;
      const need = !c.gamma || !c.vega || !c.theta;
      const calc = calculateAllGreeks({ spot, strike: c.strike, dte, iv: ivUse, rate: 0.045, isCall: side === "call" });
      const g = need
        ? { delta: calc.delta, gamma: calc.gamma, vega: calc.vega, theta: calc.theta, vanna: calc.vanna, charm: calc.charm }
        : { delta: c.delta, gamma: c.gamma, vega: c.vega, theta: c.theta, vanna: calc.vanna, charm: calc.charm };
      return { strike: c.strike, bid: c.bid, ask: c.ask, last: c.last, iv: c.iv, oi: c.oi, volume: c.volume, greeks: g, isAtm: false, off: 0 } as Row;
    });
    if (!built.length) return [];
    const sorted = [...built].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot));
    const atmStrike = sorted[0].strike;
    const all = built.sort((a, b) => b.strike - a.strike);
    const atmIdx = all.findIndex((r) => r.strike === atmStrike);
    const window = all.slice(Math.max(0, atmIdx - 12), atmIdx + 13);
    return window.map((r) => ({
      ...r,
      isAtm: r.strike === atmStrike,
      off: window.findIndex((x) => x.strike === r.strike) - window.findIndex((x) => x.strike === atmStrike),
    }));
  }, [chain, side]);

  const allValues = useMemo(() => {
    const map: Record<GreekType, number[]> = { delta: [], gamma: [], vega: [], theta: [], vanna: [], charm: [] };
    rows.forEach((r) => GREEK_COLS.forEach((g) => map[g.key].push(r.greeks[g.key])));
    return map;
  }, [rows]);

  const insights = useMemo(() => {
    if (!rows.length) return null;
    const maxBy = (k: GreekType) => rows.reduce((b, r) => (Math.abs(r.greeks[k]) > Math.abs(b.greeks[k]) ? r : b), rows[0]);
    return { gMax: maxBy("gamma"), vMax: maxBy("vega"), tMax: maxBy("theta") };
  }, [rows]);

  const dealerRows: DealerStrikeRow[] = useMemo(() => {
    if (!chain || !chain.contracts.length) return [];
    const spot = chain.spot;
    const dteN = chain.selectedExpiration ? daysBetween(chain.selectedExpiration) : 7;
    const byStrike = new Map<number, DealerStrikeRow>();
    chain.contracts.forEach((c) => {
      const ivUse = c.iv > 0 ? c.iv : 0.25;
      const calc = calculateAllGreeks({ spot, strike: c.strike, dte: dteN, iv: ivUse, rate: 0.045, isCall: c.side === "call" });
      const g = !c.gamma ? calc.gamma : c.gamma;
      const d = !c.delta ? calc.delta : c.delta;
      const cur = byStrike.get(c.strike) ?? { strike: c.strike, callOI: 0, putOI: 0, callGamma: 0, putGamma: 0, callDelta: 0, putDelta: 0 };
      if (c.side === "call") { cur.callOI = c.oi; cur.callGamma = g; cur.callDelta = d; }
      else { cur.putOI = c.oi; cur.putGamma = g; cur.putDelta = d; }
      byStrike.set(c.strike, cur);
    });
    const arr = Array.from(byStrike.values()).sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)).slice(0, 25);
    return arr.sort((a, b) => b.strike - a.strike);
  }, [chain]);

  // Delta Exposure surface: |delta| × OI × 100 per (strike, DTE) node
  // Using absolute values so Z is always positive → creates terrain spikes at high-OI strikes.
  // Falls back to Black-Scholes delta when real greek is missing.
  const dexSurfacePoints: SurfacePoint[] = useMemo(() => {
    if (!chain) return [];
    const spot = chain.spot;
    const m = new Map<string, number>();
    for (const c of chain.contracts) {
      if (!c.oi || c.oi <= 0) continue;
      const dte = Math.max(0, Math.round(daysBetween(c.expiration)));
      let delta = c.delta;
      if (!delta && c.iv > 0) {
        try {
          const bs = calculateAllGreeks({
            spot, strike: c.strike, dte: Math.max(dte, 1),
            iv: c.iv, rate: 0.05, isCall: c.side === "call",
          });
          delta = bs.delta;
        } catch { delta = 0; }
      }
      // Last resort: use OI as weight (always available) so surface is never empty
      const weight = delta ? Math.abs(delta) : 0.5;
      // |delta| × OI × 100 — absolute exposure per (strike, DTE) node
      const dex = weight * c.oi * 100;
      const key = `${c.strike}|${dte}`;
      m.set(key, (m.get(key) ?? 0) + dex);
    }
    const pts: SurfacePoint[] = [];
    m.forEach((value, key) => {
      const [ks, ds] = key.split("|");
      pts.push({ strike: +ks, dte: +ds, value });
    });
    return pts;
  }, [chain]);

  const dte = chain?.selectedExpiration ? Math.round(daysBetween(chain.selectedExpiration)) : 0;
  const totalCallOI = chain?.contracts.filter((c) => c.side === "call").reduce((s, c) => s + c.oi, 0) ?? 0;
  const totalPutOI  = chain?.contracts.filter((c) => c.side === "put").reduce((s, c) => s + c.oi, 0) ?? 0;
  const pcRatio     = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;

  return (
    <div
      className="font-mono"
      style={{
        background: "#000000", border: "1px solid #1f1f1f", borderRadius: 8,
        overflow: "hidden", contain: "layout", isolation: "isolate",
      }}
    >
      {/* ═════ HEADER ═════ */}
      <div style={{ background: "linear-gradient(180deg, #0a0a0a, #050505)", borderBottom: "1px solid #1f1f1f" }}>
        {/* Title row */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#141414]">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-[#ef4444]" />
              <span className="text-[11px] font-bold tracking-[0.2em] text-white">GREEK LADDER</span>
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
              style={{ color: side === "call" ? "#22c55e" : "#ef4444" }}
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

        {/* Session metrics row */}
        <div className="grid grid-cols-6 px-3 py-1.5 gap-x-3 text-[9px]">
          <Metric label="SPOT"    value={chain ? `$${chain.spot.toFixed(2)}` : "—"} color="#ffffff" />
          <Metric label="ATM IV"  value={chain ? `${((rows[Math.floor(rows.length / 2)]?.iv ?? 0) * 100).toFixed(1)}%` : "—"} color="#fbbf24" />
          <Metric label="HV30"    value={chain ? `${(chain.hv30 * 100).toFixed(1)}%` : "—"} color="#06b6d4" />
          <Metric label="IV RANK" value={chain ? `${chain.ivRank.toFixed(0)}` : "—"} color={chain && chain.ivRank > 50 ? "#ef4444" : "#22c55e"} />
          <Metric label="SKEW"    value={chain ? `${(chain.skew * 100).toFixed(2)}%` : "—"} color={chain && chain.skew > 0 ? "#ef4444" : "#22c55e"} />
          <Metric label="P/C OI"  value={pcRatio ? pcRatio.toFixed(2) : "—"} color={pcRatio > 1 ? "#ef4444" : "#22c55e"} />
        </div>
      </div>

      {/* ═════ TABS ═════ */}
      <div
        className="flex items-center gap-1 px-3 pt-2"
        style={{ borderBottom: "1px solid #1f1f1f", background: "#000" }}
      >
        {(["ladder", "delta", "striker"] as const).map((id) => {
          const labels = { ladder: "GREEK LADDER", delta: "DELTA EXPOSURE", striker: "STRIKER DELTA" };
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="relative px-3 py-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-all"
              style={{
                color: active ? "#22c55e" : "#555",
                background: active ? "rgba(34,197,94,0.07)" : "transparent",
                border: `1px solid ${active ? "#22c55e33" : "transparent"}`,
                borderBottom: active ? "1px solid #000" : "1px solid transparent",
                borderTopLeftRadius: 4, borderTopRightRadius: 4,
                boxShadow: active ? "0 -2px 8px rgba(34,197,94,0.15)" : "none",
                marginBottom: -1, fontFamily: MONO,
              }}
            >
              {labels[id]}
              {active && (
                <span
                  className="absolute left-2 right-2 -top-px h-px"
                  style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ═════ GREEK LADDER TAB ═════ */}
      {activeTab === "ladder" && (
        <>
          {err && <div className="p-4 text-center text-[11px] text-red-400">Error: {err}</div>}

          {/* Skeleton loader */}
          {loading && rows.length === 0 && !err && (
            <div style={{ background: "#0d0d0d", padding: "14px 12px" }}>
              <style>{`@keyframes glimmer{0%,100%{opacity:.45}50%{opacity:.9}}`}</style>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 21, borderRadius: 2, marginBottom: 3,
                    background: i % 2 ? "#111111" : "#0d0d0d",
                    border: "1px solid #181818",
                    animation: `glimmer 1.6s ease infinite`,
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              ))}
            </div>
          )}

          {!err && rows.length === 0 && !loading && (
            <div className="p-4 text-center text-[11px] text-muted-foreground">
              No options data for {symbol} / {expiration}
            </div>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table
                style={{
                  width: "100%", borderCollapse: "collapse",
                  fontFamily: MONO, fontSize: 10,
                }}
              >
                <thead>
                  <tr>
                    <Th>STRIKE</Th>
                    <Th r>BID</Th>
                    <Th r>ASK</Th>
                    <Th r>LAST</Th>
                    <Th r>IV</Th>
                    <Th r>OI</Th>
                    <Th r>VOL</Th>
                    {GREEK_COLS.map((g) => (
                      <th
                        key={g.key}
                        style={{
                          background: "#1a1a1a", color: "#6b7280", fontSize: 11,
                          letterSpacing: "0.08em", textTransform: "uppercase",
                          textAlign: "right", padding: "6px 8px", fontWeight: 500,
                          borderBottom: "1px solid #1f1f1f", fontFamily: MONO, whiteSpace: "nowrap",
                        }}
                      >
                        {g.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const distColor =
                      r.off > 5 ? "#22c55e" : r.off > 0 ? "#84cc16"
                      : r.off === 0 ? "#22c55e"
                      : r.off >= -5 ? "#fbbf24" : "#f97316";
                    const distLabel = r.isAtm ? "ATM" : r.off > 0 ? `+${r.off}` : `${r.off}`;
                    return (
                      <tr
                        key={r.strike}
                        style={{
                          background: r.isAtm ? "#1a2a1a" : idx % 2 === 0 ? "#0d0d0d" : "#111111",
                          borderLeft: r.isAtm ? "2px solid #22c55e" : "2px solid transparent",
                          borderBottom: "1px solid #1f1f1f",
                        }}
                      >
                        <td style={{ padding: "3px 8px", whiteSpace: "nowrap" }}>
                          <span style={{ color: r.isAtm ? "#22c55e" : "#e0e0e0", fontWeight: 700, fontSize: 11 }}>
                            ${r.strike.toFixed(r.strike >= 100 ? 0 : 1)}
                          </span>
                          <span style={{ color: distColor, fontSize: 8, fontWeight: 600, marginLeft: 4 }}>
                            {distLabel}
                          </span>
                        </td>
                        <NumCell value={r.bid}      color="#22c55e"  prefix="$" digits={2} />
                        <NumCell value={r.ask}      color="#ef4444"  prefix="$" digits={2} />
                        <NumCell value={r.last}     color="#e0e0e0"  prefix="$" digits={2} />
                        <NumCell value={r.iv * 100} color="#fbbf24"  suffix="%" digits={1} />
                        <NumCell value={r.oi}       color={r.oi > 1000 ? "#4a9eff" : "#a0a0a0"} digits={0} format="int" />
                        <NumCell value={r.volume}   color={r.volume > 500 ? "#a855f7" : "#6b7280"} digits={0} format="int" />
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
        </>
      )}

      {/* ═════ DELTA EXPOSURE TAB ═════ */}
      {activeTab === "delta" && (
        <div style={{ isolation: "isolate", overflow: "hidden", background: "#000", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!chain ? (
            <div className="p-8 text-center text-[11px] text-muted-foreground" style={{ fontFamily: MONO }}>
              {loading ? "Loading greek surface data…" : "No data available"}
            </div>
          ) : (
            <>
              <GexGreekSurface3D chain={chain} symbol={symbol} />
              {dealerRows.length > 0 && (
                <DeltaStrikerPanel rows={dealerRows} spot={chain.spot} symbol={symbol} updatedAt={now} />
              )}
            </>
          )}
        </div>
      )}

      {/* ═════ STRIKER DELTA TAB ═════ */}
      {activeTab === "striker" && chain && (
        <StrikerDeltaGrid chain={chain} symbol={symbol} />
      )}

      {/* ═════ FOOTER INSIGHTS ═════ */}
      {insights && (
        <div className="px-3 py-2 border-t border-[#1f1f1f]" style={{ background: "#050505" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[9px] font-bold tracking-widest text-amber-400" style={{ fontFamily: MONO }}>INSIGHTS</span>
            <span className="text-[9px] text-muted-foreground">·</span>
            <span className="text-[9px] text-muted-foreground" style={{ fontFamily: MONO }}>{now.toLocaleTimeString()}</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[10px]">
            <Insight color="#ef4444" label="GAMMA MAX" strike={insights.gMax.strike} value={insights.gMax.greeks.gamma.toFixed(4)} note="Highest pin risk" />
            <Insight color="#a855f7" label="VEGA MAX"  strike={insights.vMax.strike} value={insights.vMax.greeks.vega.toFixed(2)}  note="Max IV exposure"  />
            <Insight color="#fbbf24" label="THETA MAX" strike={insights.tMax.strike} value={insights.tMax.greeks.theta.toFixed(2)} note="Max daily decay"  />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Th({ children, r }: { children: React.ReactNode; r?: boolean }) {
  return (
    <th
      style={{
        background: "#1a1a1a", color: "#6b7280", fontSize: 11,
        letterSpacing: "0.08em", textTransform: "uppercase",
        textAlign: r ? "right" : "left", padding: "6px 8px",
        fontWeight: 500, borderBottom: "1px solid #1f1f1f",
        fontFamily: MONO, whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground tracking-widest" style={{ fontSize: 8, fontFamily: MONO }}>{label}</span>
      <span style={{ color, fontWeight: 700, fontSize: 10, fontFamily: MONO }}>{value}</span>
    </div>
  );
}

function NumCell({
  value, color, prefix = "", suffix = "", digits = 2, format,
}: {
  value: number; color: string; prefix?: string; suffix?: string; digits?: number; format?: "int";
}) {
  if (!value) {
    return (
      <td style={{ textAlign: "right", padding: "3px 8px", color: "#374151", borderBottom: "1px solid #1f1f1f", fontSize: 10, fontFamily: MONO }}>
        —
      </td>
    );
  }
  const formatted = format === "int" ? value.toLocaleString() : value.toFixed(digits);
  return (
    <td style={{ textAlign: "right", padding: "3px 8px", borderBottom: "1px solid #1f1f1f", fontSize: 10, fontFamily: MONO, color, whiteSpace: "nowrap" }}>
      {prefix}{formatted}{suffix}
    </td>
  );
}

function Insight({ label, strike, value, note, color }: { label: string; strike: number; value: string; note: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", borderLeft: `2px solid ${color}`, padding: "4px 8px", borderRadius: 0 }}>
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 8, letterSpacing: "0.12em", color: "#6b7280", fontWeight: 700, fontFamily: MONO }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#e0e0e0", fontFamily: MONO }}>${strike}</span>
      </div>
      <div className="flex items-baseline justify-between mt-0.5">
        <span style={{ fontSize: 9, color: "#4b5563", fontStyle: "italic" }}>{note}</span>
        <span style={{ fontSize: 10, fontFamily: MONO, color }}>{value}</span>
      </div>
    </div>
  );
}

function GreekCell({ value, type, allValues }: { value: number; type: GreekType; allValues: number[] }) {
  const [hover, setHover] = useState(false);
  const intensity = classifyGreekIntensity(value, allValues);
  const color = value > 0 ? "#22c55e" : value < 0 ? "#ef4444" : "#4b5563";
  return (
    <td
      style={{
        textAlign: "right", padding: "3px 8px", borderBottom: "1px solid #1f1f1f",
        fontSize: 10, fontFamily: MONO, color, position: "relative", cursor: "default",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {formatGreekValue(value, type)}
      {hover && <GreekTooltip type={type} value={value} intensity={intensity} />}
    </td>
  );
}
