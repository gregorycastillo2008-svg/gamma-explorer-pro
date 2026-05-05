import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ReferenceLine } from "recharts";
import { Panel } from "./Panel";
import type { ExposurePoint, KeyLevels, OptionContract, DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
  levels: KeyLevels;
  contracts: OptionContract[];
}

const MONO: React.CSSProperties = { fontFamily: "JetBrains Mono, ui-monospace, monospace" };
const BG = "#07090f";
const BORDER = "#131929";

function fmtGex(n: number) {
  const a = Math.abs(n);
  const s = n >= 0 ? "+" : "−";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

function fmtK(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(0);
}

export function GexIntelPanel({ ticker, exposures, levels, contracts }: Props) {
  const spot = ticker.spot;

  const isPositive = levels.gammaFlip == null || spot > levels.gammaFlip;

  const totalCallOI = useMemo(() => exposures.reduce((s, p) => s + p.callOI, 0), [exposures]);
  const totalPutOI  = useMemo(() => exposures.reduce((s, p) => s + p.putOI, 0),  [exposures]);
  const pcr = totalPutOI / Math.max(totalCallOI, 1);

  const netDex = useMemo(() => exposures.reduce((s, p) => s + p.dex, 0), [exposures]);
  const totalVex = useMemo(() => exposures.reduce((s, p) => s + p.vex, 0), [exposures]);

  const atmIv = useMemo(() => {
    const window = ticker.strikeStep * 1.5;
    const near = contracts.filter(c => Math.abs(c.strike - spot) <= window);
    return near.length > 0 ? (near.reduce((s, c) => s + c.iv, 0) / near.length) * 100 : 0;
  }, [contracts, spot, ticker.strikeStep]);

  // Skew: difference between 25-delta put IV and 25-delta call IV (proxy: OTM puts vs calls)
  const skew25 = useMemo(() => {
    const otmRange = ticker.strikeStep * 6;
    const otmPuts  = contracts.filter(c => c.type === "put"  && c.strike < spot && c.strike >= spot - otmRange);
    const otmCalls = contracts.filter(c => c.type === "call" && c.strike > spot && c.strike <= spot + otmRange);
    const avgPutIv  = otmPuts.length  ? otmPuts.reduce((s, c)  => s + c.iv, 0) / otmPuts.length  : 0;
    const avgCallIv = otmCalls.length ? otmCalls.reduce((s, c) => s + c.iv, 0) / otmCalls.length : 0;
    return avgPutIv > 0 && avgCallIv > 0 ? (avgPutIv - avgCallIv) * 100 : null;
  }, [contracts, spot, ticker.strikeStep]);

  // Top 7 strikes by |netGex|, sorted by strike price for the chart
  const topStrikes = useMemo(() =>
    [...exposures]
      .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
      .slice(0, 7)
      .sort((a, b) => a.strike - b.strike),
    [exposures],
  );

  const distPct = (price: number) => {
    const d = ((price - spot) / spot) * 100;
    return (d >= 0 ? "+" : "") + d.toFixed(2) + "%";
  };

  const keyLevels = [
    { label: "Call Wall",   price: levels.callWall,           color: "#22c55e", glyph: "▲" },
    { label: "Put Wall",    price: levels.putWall,            color: "#ef4444", glyph: "▼" },
    { label: "Gamma Flip",  price: levels.gammaFlip ?? 0,     color: "#fbbf24", glyph: "⚡" },
    { label: "Max Pain",    price: levels.maxPain,            color: "#fb923c", glyph: "✦" },
    { label: "Vol Trigger", price: levels.volTrigger,         color: "#a78bfa", glyph: "⬡" },
  ].filter(l => l.price > 0);

  const stats = [
    { label: "ATM IV",    value: atmIv > 0 ? atmIv.toFixed(1) + "%" : "N/A",   col: "#22d3ee" },
    { label: "25Δ Skew",  value: skew25 != null ? (skew25 >= 0 ? "+" : "") + skew25.toFixed(1) + "%" : "N/A", col: skew25 != null && skew25 > 0 ? "#ef4444" : "#22c55e" },
    { label: "PCR",       value: pcr.toFixed(2),   col: pcr > 1.2 ? "#ef4444" : pcr < 0.8 ? "#22c55e" : "#f59e0b" },
    { label: "Net DEX",   value: fmtGex(netDex),   col: netDex  >= 0 ? "#22c55e" : "#ef4444" },
    { label: "Net VEX",   value: fmtGex(totalVex), col: "#a78bfa" },
    { label: "Call OI",   value: fmtK(totalCallOI), col: "#22c55e" },
    { label: "Put OI",    value: fmtK(totalPutOI),  col: "#ef4444" },
    { label: "Max Pain",  value: "$" + levels.maxPain.toLocaleString(), col: "#fb923c" },
  ];

  return (
    <Panel
      title="GEX Intelligence"
      subtitle={`${ticker.symbol} · Market Structure`}
      className="h-full flex flex-col"
    >
      <div className="flex-1 min-h-0 overflow-y-auto terminal-scrollbar" style={{ ...MONO, background: BG, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ── Gamma Regime Banner ── */}
        <div style={{
          padding: "8px 12px",
          borderRadius: 6,
          background: isPositive ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${isPositive ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.28)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: isPositive ? "#22c55e" : "#ef4444",
              display: "inline-block",
              boxShadow: `0 0 8px ${isPositive ? "#22c55e88" : "#ef444488"}`,
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", color: isPositive ? "#22c55e" : "#ef4444" }}>
                {isPositive ? "POSITIVE" : "NEGATIVE"} GAMMA REGIME
              </div>
              <div style={{ fontSize: 9, color: "#4b5563", marginTop: 1 }}>
                {isPositive
                  ? "Dealers hedge by buying dips & selling rips → mean-reversion"
                  : "Dealers hedge by selling dips & buying rips → trend amplification"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: 10 }}>
            <div style={{ fontSize: 9, color: "#4b5563", letterSpacing: "0.1em" }}>NET GEX</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: levels.totalGex >= 0 ? "#22c55e" : "#ef4444" }}>
              {fmtGex(levels.totalGex)}
            </div>
          </div>
        </div>

        {/* ── Key Level Proximity ── */}
        <div>
          <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
            Key Level Proximity · spot ${spot.toLocaleString()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {keyLevels.map(lv => {
              const d = ((lv.price - spot) / spot) * 100;
              const isAbove = d >= 0;
              const fill = Math.min(Math.abs(d) * 8, 46); // max 46% of half-bar
              return (
                <div key={lv.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 8, color: lv.color, width: 10, textAlign: "center", flexShrink: 0 }}>{lv.glyph}</span>
                  <span style={{ fontSize: 9, color: "#6b7280", width: 68, flexShrink: 0 }}>{lv.label}</span>
                  {/* Symmetric bar centered at 50% = spot */}
                  <div style={{ flex: 1, height: 5, background: BORDER, borderRadius: 3, position: "relative", overflow: "hidden" }}>
                    <div style={{
                      position: "absolute", height: "100%", borderRadius: 3,
                      background: lv.color,
                      opacity: 0.75,
                      width: `${fill}%`,
                      left: isAbove ? "50%" : `${50 - fill}%`,
                    }} />
                    <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "#ffffff22" }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: lv.color, width: 50, textAlign: "right", flexShrink: 0 }}>
                    {distPct(lv.price)}
                  </span>
                  <span style={{ fontSize: 9, color: "#374151", width: 55, textAlign: "right", flexShrink: 0 }}>
                    ${lv.price.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px" }}>
          {stats.map(s => (
            <div key={s.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline",
              borderBottom: `1px solid ${BORDER}`, paddingBottom: 3,
            }}>
              <span style={{ fontSize: 9, color: "#4b5563" }}>{s.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.col }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* ── Top GEX Strikes ── */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: 9, color: "#374151", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
            Top GEX Concentration
          </div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topStrikes} margin={{ top: 2, right: 4, bottom: 18, left: 4 }}>
                <XAxis
                  dataKey="strike"
                  tick={{ fill: "#6b7280", fontSize: 8 }}
                  tickFormatter={(v) => `$${v}`}
                  axisLine={{ stroke: BORDER }}
                  tickLine={false}
                />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "#0d1120", border: `1px solid ${BORDER}`, fontSize: 10, ...MONO }}
                  formatter={(v: any) => [fmtGex(Number(v)), "Net GEX"]}
                  labelFormatter={(l) => `Strike $${l}`}
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                />
                <ReferenceLine y={0} stroke="#1e2a40" />
                <Bar dataKey="netGex" radius={[2, 2, 0, 0]} maxBarSize={28}>
                  {topStrikes.map((d) => (
                    <Cell key={d.strike} fill={d.netGex >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 2 }}>
            <span style={{ fontSize: 9, color: "#22c55e", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "#22c55e", borderRadius: 1 }} />
              Call GEX (long γ)
            </span>
            <span style={{ fontSize: 9, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "#ef4444", borderRadius: 1 }} />
              Put GEX (short γ)
            </span>
          </div>
        </div>

      </div>
    </Panel>
  );
}
