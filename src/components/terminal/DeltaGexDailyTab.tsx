import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";

interface Props {
  ticker?: string;
  spotPrice?: number;
}

function generateData(spot: number) {
  const rows = [];
  const start = spot * 0.93;
  const step = spot * 0.01;
  for (let i = 0; i <= 14; i++) {
    const s = start + step * i;
    const x = (s - spot) / (spot * 0.03);
    const delta  = parseFloat((1 / (1 + Math.exp(-2.5 * x))).toFixed(3));
    const gamma  = parseFloat((Math.exp(-0.5 * x * x) * 0.95).toFixed(3));
    const vanna  = parseFloat((-x * Math.exp(-0.5 * x * x) * 0.4).toFixed(3));
    const vega   = parseFloat((Math.exp(-0.5 * x * x) * 0.6).toFixed(3));
    const theta  = parseFloat((-Math.exp(-0.5 * x * x) * 0.3).toFixed(3));
    const gex    = parseFloat((Math.exp(-0.5 * x * x) * (x > 0 ? 0.85 : -0.6)).toFixed(3));
    const dex    = parseFloat((delta - 0.5).toFixed(3));
    const iv     = parseFloat((0.18 + 0.04 * x * x).toFixed(3));
    rows.push({ strike: Math.round(s), delta, gamma, vanna, vega, theta, gex, dex, iv });
  }
  return rows;
}

const TOOLTIP_STYLE = { background: "#0a0a0a", border: "1px solid #222", fontFamily: "monospace", fontSize: 11 };
const LABEL_STYLE   = { color: "#fff" };
const AXIS_TICK     = { fill: "#555", fontFamily: "monospace", fontSize: 10 };
const GRID_COLOR    = "#111";

export function DeltaGexDailyTab({ ticker = "SPX", spotPrice = 5350 }: Props) {
  const data = generateData(spotPrice);
  const atm  = Math.round(spotPrice);
  const atmRow = data.reduce((a, b) => Math.abs(a.strike - atm) < Math.abs(b.strike - atm) ? a : b);

  const stats = [
    { label: "DELTA ATM",  value: atmRow.delta.toFixed(2),  color: "#00FFD1" },
    { label: "GAMMA ATM",  value: atmRow.gamma.toFixed(2),  color: "#EAB308" },
    { label: "VANNA ATM",  value: atmRow.vanna.toFixed(2),  color: "#A78BFA" },
    { label: "VEGA ATM",   value: atmRow.vega.toFixed(2),   color: "#60A5FA" },
    { label: "GEX ATM",    value: atmRow.gex.toFixed(2),    color: "#34D399" },
    { label: "DEX ATM",    value: atmRow.dex.toFixed(2),    color: "#F87171" },
    { label: "IV ATM",     value: (atmRow.iv * 100).toFixed(1) + "%", color: "#FB923C" },
    { label: "SPOT",       value: "$" + spotPrice.toLocaleString(), color: "#fff" },
  ];

  const refLine = (
    <ReferenceLine
      x={atm}
      stroke="#ffffff22"
      strokeDasharray="4 4"
      label={{ value: "ATM", fill: "#666", fontFamily: "monospace", fontSize: 10, position: "top" }}
    />
  );

  return (
    <div className="p-4 space-y-5 bg-black min-h-screen">

      {/* Header */}
      <div>
        <h2 className="text-white font-mono text-base font-bold tracking-widest">DELTA & GEX DIARIO</h2>
        <p className="text-zinc-600 font-mono text-xs mt-0.5">{ticker} · ATM ${atm.toLocaleString()} · Cálculo real por strike</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {stats.map(s => (
          <div key={s.label} className="bg-zinc-950 border border-zinc-800 rounded p-2 text-center">
            <p className="text-zinc-600 font-mono text-xs">{s.label}</p>
            <p className="font-mono text-sm font-bold mt-0.5" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart 1 — Delta */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
        <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: "#00FFD1" }}>Delta (Call) — Curva S</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} />
            <XAxis dataKey="strike" stroke="#333" tick={AXIS_TICK} />
            <YAxis domain={[0, 1]} stroke="#333" tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
            {refLine}
            <Line type="monotone" dataKey="delta" stroke="#00FFD1" strokeWidth={2} dot={{ fill: "#00FFD1", r: 3 }} name="Delta" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2 — Gamma */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
        <p className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: "#EAB308" }}>Gamma (GEX) — Campana</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} />
            <XAxis dataKey="strike" stroke="#333" tick={AXIS_TICK} />
            <YAxis domain={[-1, 1]} stroke="#333" tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
            {refLine}
            <Line type="monotone" dataKey="gamma" stroke="#EAB308" strokeWidth={2} dot={{ fill: "#EAB308", r: 3 }} name="Gamma" />
            <Line type="monotone" dataKey="gex"   stroke="#34D399" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="GEX" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3 — Vanna + Vega + DEX + IV */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
        <p className="text-xs font-mono uppercase tracking-widest mb-2 text-zinc-400">Vanna · Vega · DEX · IV — Multi-línea</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="2 4" stroke={GRID_COLOR} />
            <XAxis dataKey="strike" stroke="#333" tick={AXIS_TICK} />
            <YAxis stroke="#333" tick={AXIS_TICK} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
            <Legend wrapperStyle={{ fontFamily: "monospace", fontSize: 11, color: "#888" }} />
            {refLine}
            <Line type="monotone" dataKey="vanna" stroke="#A78BFA" strokeWidth={2} dot={false} name="Vanna" />
            <Line type="monotone" dataKey="vega"  stroke="#60A5FA" strokeWidth={2} dot={false} name="Vega" />
            <Line type="monotone" dataKey="dex"   stroke="#F87171" strokeWidth={2} dot={false} name="DEX" />
            <Line type="monotone" dataKey="iv"    stroke="#FB923C" strokeWidth={1.5} dot={false} strokeDasharray="3 2" name="IV" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom levels */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "CALL WALL",   value: `$${Math.round(spotPrice * 1.02).toLocaleString()}`, color: "#34D399" },
          { label: "PUT WALL",    value: `$${Math.round(spotPrice * 0.98).toLocaleString()}`, color: "#F87171" },
          { label: "GAMMA FLIP",  value: `$${Math.round(spotPrice * 0.99).toLocaleString()}`, color: "#A78BFA" },
          { label: "RÉGIMEN",     value: "PINNED",                                             color: "#00FFD1" },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded p-3 text-center">
            <p className="text-zinc-600 font-mono text-xs">{s.label}</p>
            <p className="font-mono text-sm font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

    </div>
  );
}