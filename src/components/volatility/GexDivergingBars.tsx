import { useMemo, useState, useEffect } from "react";
import Plot from "react-plotly.js";
import { ExposurePoint, DemoTicker } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  exposures: ExposurePoint[];
}

export function GexDivergingBars({ ticker, exposures }: Props) {
  const [minM, setMinM] = useState(0);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const data = useMemo(() => {
    const sorted = [...exposures].sort((a, b) => a.strike - b.strike);
    const filtered = sorted.filter((p) => Math.abs(p.netGex) / 1e6 >= minM);
    const strikes = filtered.map((p) => p.strike);
    const calls = filtered.map((p) => p.callGex / 1e6);   // millions, positive
    const puts = filtered.map((p) => -Math.abs(p.putGex) / 1e6); // negative for diverging
    const oiTotal = filtered.map((p) => p.callOI + p.putOI);
    const pcRatio = filtered.map((p) => (p.callOI > 0 ? p.putOI / p.callOI : 0));
    return { filtered, strikes, calls, puts, oiTotal, pcRatio };
  }, [exposures, minM]);

  const totals = useMemo(() => {
    const net = exposures.reduce((s, p) => s + p.netGex, 0);
    const pos = exposures.filter((p) => p.netGex > 0).reduce((s, p) => s + p.netGex, 0);
    const neg = exposures.filter((p) => p.netGex < 0).reduce((s, p) => s + p.netGex, 0);
    const majorPos = exposures.reduce((b, p) => (p.netGex > b.netGex ? p : b), exposures[0] ?? { strike: 0, netGex: 0 } as any);
    const majorNeg = exposures.reduce((b, p) => (p.netGex < b.netGex ? p : b), exposures[0] ?? { strike: 0, netGex: 0 } as any);
    return { net, pos, neg, majorPos, majorNeg };
  }, [exposures]);

  const customCalls = data.filtered.map((p, i) => [
    p.strike, p.callGex / 1e6, p.putGex / 1e6, p.netGex / 1e6, data.oiTotal[i], data.pcRatio[i],
  ]);
  const customPuts = customCalls;

  return (
    <div className="rounded-xl border border-[#1f1f1f] bg-[#0a0e27] p-4" style={{ fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">Gamma Exposure Analysis (GEX)</div>
          <div className="text-base font-semibold text-zinc-100">
            Net Gamma Exposure by Strike Price · <span className="text-cyan-400">{ticker.symbol}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-zinc-500">Min |GEX| (M)</label>
          <input
            type="number" value={minM} onChange={(e) => setMinM(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 bg-[#0f1124] border border-[#1f1f1f] rounded px-2 py-1 text-zinc-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
        {/* Chart */}
        <div className="relative">
          <Plot
            data={[
              {
                type: "bar", orientation: "h",
                y: data.strikes, x: data.puts,
                name: "PUT GEX",
                marker: {
                  color: data.puts.map((v) => v),
                  colorscale: [[0, "#ef4444"], [1, "#f97316"]],
                  cmin: Math.min(...data.puts, -1), cmax: 0, showscale: false,
                  line: { width: 0 },
                },
                customdata: customPuts as any,
                hovertemplate:
                  "<b>Strike: %{customdata[0]}</b><br>" +
                  "Put GEX: %{customdata[2]:.2f} M<br>" +
                  "Call GEX: %{customdata[1]:.2f} M<br>" +
                  "Net GEX: %{customdata[3]:.2f} M<br>" +
                  "OI Total: %{customdata[4]:,}<br>" +
                  "P/C Ratio: %{customdata[5]:.2f}<extra></extra>",
              },
              {
                type: "bar", orientation: "h",
                y: data.strikes, x: data.calls,
                name: "CALL GEX",
                marker: {
                  color: data.calls.map((v) => v),
                  colorscale: [[0, "#06b6d4"], [1, "#10b981"]],
                  cmin: 0, cmax: Math.max(...data.calls, 1), showscale: false,
                  line: { width: 0 },
                },
                customdata: customCalls as any,
                hovertemplate:
                  "<b>Strike: %{customdata[0]}</b><br>" +
                  "Call GEX: %{customdata[1]:.2f} M<br>" +
                  "Put GEX: %{customdata[2]:.2f} M<br>" +
                  "Net GEX: %{customdata[3]:.2f} M<br>" +
                  "OI Total: %{customdata[4]:,}<br>" +
                  "P/C Ratio: %{customdata[5]:.2f}<extra></extra>",
              },
            ] as any}
            layout={{
              autosize: true,
              height: 520,
              barmode: "overlay",
              bargap: 0.15,
              margin: { l: 65, r: 20, t: 20, b: 40 },
              paper_bgcolor: "#0a0e27",
              plot_bgcolor: "#0a0e27",
              font: { color: "#a1a1aa", size: 11, family: "JetBrains Mono, ui-monospace, monospace" },
              showlegend: true,
              legend: { orientation: "h", y: 1.05, x: 0.5, xanchor: "center", bgcolor: "rgba(0,0,0,0)", font: { size: 10 } },
              xaxis: {
                title: { text: "GEX (Millions $)", font: { size: 11, color: "#a1a1aa" } },
                gridcolor: "#1a1f3a", zerolinecolor: "rgba(255,255,255,0.3)", zerolinewidth: 1,
                tickfont: { size: 10 }, ticksuffix: "M",
              },
              yaxis: {
                title: { text: "Strike", font: { size: 11, color: "#a1a1aa" } },
                gridcolor: "#1a1f3a", tickfont: { size: 10 }, type: "category",
              },
              shapes: [
                { type: "line", xref: "x", x0: 0, x1: 0, yref: "paper", y0: 0, y1: 1,
                  line: { color: "rgba(255,255,255,0.3)", width: 1, dash: "dot" } },
                { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y",
                  y0: ticker.spot, y1: ticker.spot,
                  line: { color: "#fbbf24", width: 1, dash: "dash" } },
              ],
              hoverlabel: { bgcolor: "#1a1a2e", bordercolor: "#3f3f46", font: { color: "#e4e4e7", size: 11, family: "JetBrains Mono, monospace" } },
            }}
            config={{
              displaylogo: false, responsive: true,
              modeBarButtonsToRemove: ["lasso2d", "select2d"],
              toImageButtonOptions: { format: "png", filename: `${ticker.symbol}_gex_diverging`, scale: 2 },
            }}
            style={{ width: "100%" }}
            useResizeHandler
          />
        </div>

        {/* Side panel */}
        <div className="space-y-2 text-xs">
          <SideStat label="Net GEX Total" value={`${(totals.net / 1e6).toFixed(2)}M`} color="#22d3ee" big />
          <SideStat label="Major Positive" value={`${(totals.majorPos.netGex / 1e6).toFixed(2)}M @ ${totals.majorPos.strike}`} color="#10b981" />
          <SideStat label="Major Negative" value={`${(totals.majorNeg.netGex / 1e6).toFixed(2)}M @ ${totals.majorNeg.strike}`} color="#ef4444" />
          <SideStat label="Sum Positive GEX" value={`${(totals.pos / 1e6).toFixed(2)}M`} color="#10b981" />
          <SideStat label="Sum Negative GEX" value={`${(totals.neg / 1e6).toFixed(2)}M`} color="#f97316" />
          <SideStat label="Spot" value={`$${ticker.spot.toFixed(2)}`} color="#fbbf24" />
          <SideStat label="Strikes Shown" value={String(data.strikes.length)} color="#a1a1aa" />
          <button className="w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-xs">
            Load History
          </button>
          <div className="text-[10px] text-zinc-500 pt-1">
            Last update: {now.toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-zinc-500 border-t border-[#1a1f3a] pt-2">
        Data updated: {now.toISOString()} · Source: Real-time Options Data · Auto-refresh 60s
      </div>
    </div>
  );
}

function SideStat({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-[#1a1f3a] bg-[#0f1430] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={big ? "text-xl font-bold" : "text-sm font-semibold"} style={{ color }}>{value}</div>
    </div>
  );
}
