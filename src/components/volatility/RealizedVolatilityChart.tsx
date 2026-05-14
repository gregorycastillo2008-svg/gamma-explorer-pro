import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import type { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const SUPA_URL = "https://ikvwejdepfvjuofcnbww.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrdndlamRlcGZ2anVvZmNuYnd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTQ4OTEsImV4cCI6MjA5Mjc5MDg5MX0.JC55rSwUf8tG3VEjMAE-MCrxCpncGKIcf3La9oUS0JE";

interface OHLC { time: number; close: number; }
interface Row { ts: number; hv10: number; hv20: number; hv30: number; iv: number; }

const ANN = Math.sqrt(252);

function rollingStd(closes: number[], w: number): (number | null)[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  return rets.map((_, i) => {
    if (i < w - 1) return null;
    const s = rets.slice(i - w + 1, i + 1);
    const m = s.reduce((a, b) => a + b, 0) / w;
    return Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (w - 1)) * ANN * 100;
  });
}

const tooltipStyle: React.CSSProperties = {
  background: "rgba(10,10,10,0.96)", border: "1px solid #1f1f1f",
  borderRadius: 6, fontSize: 11, fontFamily: "JetBrains Mono, monospace",
};

export function RealizedVolatilityChart({ data }: Props) {
  const symbol = data.symbol;
  const atmIV = data.atmIV;

  const [ohlc, setOhlc] = useState<OHLC[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    fetch(`${SUPA_URL}/functions/v1/polygon-price-history?symbol=${encodeURIComponent(symbol)}&timeframe=1Y`, {
      headers: { apikey: SUPA_KEY },
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ohlc?.length) throw new Error(j.error || "No data");
        setOhlc(j.ohlc);
        setLoading(false);
      })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [symbol]);

  const series = useMemo<Row[]>(() => {
    if (ohlc.length < 32) return [];
    const closes = ohlc.map((p) => p.close);
    const dates  = ohlc.map((p) => p.time);
    const hv10raw = rollingStd(closes, 10);
    const hv20raw = rollingStd(closes, 20);
    const hv30raw = rollingStd(closes, 30);
    const rows: Row[] = [];
    for (let i = 30; i < closes.length; i++) {
      const hv10 = hv10raw[i - 1];
      const hv20 = hv20raw[i - 1];
      const hv30 = hv30raw[i - 1];
      if (hv10 == null || hv20 == null || hv30 == null) continue;
      rows.push({ ts: dates[i] * 1000, hv10, hv20, hv30, iv: atmIV });
    }
    return rows;
  }, [ohlc, atmIV]);

  const meanHv30 = series.length
    ? series.reduce((s, r) => s + r.hv30, 0) / series.length
    : 0;

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">
          REALIZED VOLATILITY — HV10 / HV20 / HV30
          {loading && <span className="ml-2 text-[#f59e0b]">· cargando…</span>}
          {err && <span className="ml-2 text-[#ef4444] text-[10px]">· {err}</span>}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-jetbrains">
          <Legend dot="#3b82f6" label="HV10" />
          <Legend dot="#e5e7eb" label="HV20" />
          <Legend dot="#fbbf24" label="HV30" />
          <Legend dot="#fb923c" label="ATM IV" />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 10, right: 16, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} />
              <XAxis
                dataKey="ts" type="number" domain={["dataMin", "dataMax"]}
                tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v: number) => format(new Date(v), "MMM dd")}
                minTickGap={32}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "JetBrains Mono" }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(v: number) => format(new Date(v), "MMM dd, yyyy")}
                formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n.toUpperCase()]}
              />
              {meanHv30 > 0 && (
                <ReferenceLine y={meanHv30} stroke="#6b7280" strokeDasharray="4 4"
                  label={{ value: `mean ${meanHv30.toFixed(1)}%`, fill: "#9ca3af", fontSize: 9, position: "right" }} />
              )}
              <Line type="monotone" dataKey="hv10" stroke="#3b82f6" strokeWidth={1.6} dot={false} name="HV10" />
              <Line type="monotone" dataKey="hv20" stroke="#e5e7eb" strokeWidth={1.8} dot={false} name="HV20" />
              <Line type="monotone" dataKey="hv30" stroke="#fbbf24" strokeWidth={2}   dot={false} name="HV30" />
              <Line type="monotone" dataKey="iv"   stroke="#fb923c" strokeWidth={2} strokeDasharray="5 4" dot={false} name="ATM IV" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          !loading && (
            <div className="h-full flex items-center justify-center text-[#4b5563] text-xs font-jetbrains">
              Sin datos históricos disponibles para {symbol}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[#9ca3af]">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: dot }} />
      {label}
    </span>
  );
}
