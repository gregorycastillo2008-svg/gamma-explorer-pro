import { useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface Props {
  contracts?: any[];
  spot?: number;
  symbol?: string;
}

function generateTopologyData(spot: number) {
  const history = [];
  const recent  = [];
  const seed    = spot % 100;

  // Historical cluster — 60 points
  for (let i = 0; i < 60; i++) {
    const angle = (i / 60) * Math.PI * 2;
    const r     = 0.8 + Math.sin(i * 0.7 + seed) * 0.6;
    history.push({
      trend:      parseFloat((Math.cos(angle) * r).toFixed(2)),
      momentum:   parseFloat((Math.sin(angle) * r * 0.8).toFixed(2)),
      volatility: parseFloat((0.5 + Math.abs(Math.sin(i * 0.3)) * 1.5).toFixed(2)),
      z: 20,
    });
  }

  // Recent path — 12 points in orange
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    recent.push({
      trend:      parseFloat((-2 + t * 2.5).toFixed(2)),
      momentum:   parseFloat((-1.5 + t * 1.8 + Math.sin(t * 4) * 0.3).toFixed(2)),
      volatility: parseFloat((2.5 - t * 1.8).toFixed(2)),
      z: 30,
    });
  }

  // Current market point
  const current = [{
    trend:      parseFloat(recent[recent.length - 1].trend.toFixed(2)),
    momentum:   parseFloat(recent[recent.length - 1].momentum.toFixed(2)),
    volatility: parseFloat(recent[recent.length - 1].volatility.toFixed(2)),
    z: 80,
  }];

  return { history, recent, current };
}

const TOOLTIP_STYLE = {
  background: "#0a0a0a",
  border: "1px solid #333",
  fontFamily: "monospace",
  fontSize: 11,
  color: "#fff",
};

export function MarketTopology3D({ contracts, spot = 5350, symbol = "SPX" }: Props) {
  const { history, recent, current } = useMemo(() => generateTopologyData(spot), [spot]);

  const currentPoint = current[0];

  return (
    <div className="w-full h-full flex flex-col bg-black p-3 gap-3">

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 opacity-60" />
          <span className="text-zinc-500 font-mono text-xs">History</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-orange-400" />
          <span className="text-zinc-500 font-mono text-xs">Recent Path</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 border-2 border-white rotate-45" />
          <span className="text-zinc-500 font-mono text-xs">Current (Base)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="text-white font-mono text-xs">✛</div>
          <span className="text-zinc-500 font-mono text-xs">CURRENT MARKET</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="2 6" stroke="#111" />
            <XAxis
              dataKey="trend"
              type="number"
              domain={[-4, 4]}
              name="Trend"
              stroke="#333"
              tick={{ fill: "#555", fontFamily: "monospace", fontSize: 10 }}
              label={{ value: "Trend", position: "insideBottom", offset: -10, fill: "#555", fontFamily: "monospace", fontSize: 11 }}
            />
            <YAxis
              dataKey="momentum"
              type="number"
              domain={[-4, 4]}
              name="Momentum"
              stroke="#333"
              tick={{ fill: "#555", fontFamily: "monospace", fontSize: 10 }}
              label={{ value: "Momentum", angle: -90, position: "insideLeft", fill: "#555", fontFamily: "monospace", fontSize: 11 }}
            />
            <ZAxis dataKey="z" range={[15, 80]} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ strokeDasharray: "3 3", stroke: "#333" }}
              formatter={(val: any, name: string) => [typeof val === "number" ? val.toFixed(2) : val, name]}
            />
            <ReferenceLine x={0} stroke="#222" strokeDasharray="3 3" />
            <ReferenceLine y={0} stroke="#222" strokeDasharray="3 3" />

            {/* Historical points */}
            <Scatter
              name="History"
              data={history}
              fill="#818CF8"
              fillOpacity={0.45}
              shape="circle"
            />

            {/* Recent path */}
            <Scatter
              name="Recent Path"
              data={recent}
              fill="#F97316"
              fillOpacity={0.85}
              line={{ stroke: "#F97316", strokeWidth: 2 }}
              shape="circle"
            />

            {/* Current market */}
            <Scatter
              name="NOW"
              data={current}
              fill="#ffffff"
              fillOpacity={1}
              shape={(props: any) => {
                const { cx, cy } = props;
                return (
                  <g>
                    <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke="white" strokeWidth={2} />
                    <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke="white" strokeWidth={2} />
                    <text x={cx + 10} y={cy - 8} fill="white" fontFamily="monospace" fontSize={10}>NOW</text>
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2 text-center">
          <p className="text-zinc-600 font-mono text-xs">TREND</p>
          <p className="text-cyan-400 font-mono text-sm font-bold">{currentPoint.trend > 0 ? "+" : ""}{currentPoint.trend}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2 text-center">
          <p className="text-zinc-600 font-mono text-xs">MOMENTUM</p>
          <p className="text-orange-400 font-mono text-sm font-bold">{currentPoint.momentum > 0 ? "+" : ""}{currentPoint.momentum}</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-2 text-center">
          <p className="text-zinc-600 font-mono text-xs">VOLATILITY</p>
          <p className="text-purple-400 font-mono text-sm font-bold">{currentPoint.volatility}</p>
        </div>
      </div>

    </div>
  );
}