import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { useMemo } from "react";
import { computeExposures, computeKeyLevels, DemoTicker, OptionContract, formatNumber } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

export function GexDexDashboard({ ticker, contracts }: Props) {
  const exposures = useMemo(() => computeExposures(ticker.spot, contracts), [contracts, ticker.spot]);
  const levels = useMemo(() => computeKeyLevels(exposures), [exposures]);

  // Build chart data: focus on strikes near spot for readability
  const data = useMemo(() => {
    const lo = ticker.spot * 0.94;
    const hi = ticker.spot * 1.06;
    return exposures
      .filter((p) => p.strike >= lo && p.strike <= hi)
      .sort((a, b) => a.strike - b.strike)
      .map((p) => ({
        strike: p.strike,
        // Convert raw exposure into "B" units (billions) for the Altaris look
        gex: +(p.netGex / 1e9).toFixed(3),
        dex: +(p.dex / 1e9).toFixed(3),
      }));
  }, [exposures, ticker.spot]);

  const netDex = useMemo(() => exposures.reduce((s, p) => s + p.dex, 0) / 1e9, [exposures]);
  const netDexLabel = `${netDex >= 0 ? "+" : ""}${netDex.toFixed(1)}B`;

  return (
    <div className="bg-[#0a0a0a] p-6 rounded-lg border border-[#1f1f1f] w-full h-full font-mono flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 shrink-0">
        <div>
          <h2 className="text-[#00e5ff] text-sm font-bold tracking-widest uppercase glow-cyan">
            Net DEX Exposure
          </h2>
          <p
            className={`text-3xl font-bold ${netDex >= 0 ? "text-white glow-cyan" : "text-[#ff3d00] glow-red"}`}
          >
            {netDexLabel}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[#666] text-xs uppercase block tracking-wider">Current Spot</span>
          <span className="text-white text-lg">${ticker.spot.toFixed(2)}</span>
          <div className="mt-1 flex gap-3 text-[10px] uppercase tracking-wider">
            <span className="text-[#00e5ff]">CW ${levels.callWall}</span>
            <span className="text-[#ff3d00]">PW ${levels.putWall}</span>
            {levels.gammaFlip != null && (
              <span className="text-[#7c4dff]">FLIP ${levels.gammaFlip}</span>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="strike"
              stroke="#666"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#666"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}B`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#000",
                border: "1px solid #1f1f1f",
                color: "#fff",
                fontSize: 12,
              }}
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              formatter={(value: number, name: string) => [`${value}B`, name.toUpperCase()]}
              labelFormatter={(label) => `Strike $${label}`}
            />

            {/* SPOT */}
            <ReferenceLine
              x={data.reduce((closest, p) =>
                Math.abs(p.strike - ticker.spot) < Math.abs(closest.strike - ticker.spot) ? p : closest,
                data[0] ?? { strike: ticker.spot }
              ).strike}
              stroke="#7c4dff"
              strokeDasharray="5 5"
              label={{ position: "top", value: `SPOT ${ticker.spot}`, fill: "#7c4dff", fontSize: 10 }}
            />
            {/* Call Wall */}
            <ReferenceLine
              x={levels.callWall}
              stroke="#00e5ff"
              strokeDasharray="3 3"
              label={{ position: "top", value: "CW", fill: "#00e5ff", fontSize: 10 }}
            />
            {/* Put Wall */}
            <ReferenceLine
              x={levels.putWall}
              stroke="#ff3d00"
              strokeDasharray="3 3"
              label={{ position: "top", value: "PW", fill: "#ff3d00", fontSize: 10 }}
            />

            <Bar dataKey="dex" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.dex > 0 ? "#00e5ff" : "#ff3d00"}
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
