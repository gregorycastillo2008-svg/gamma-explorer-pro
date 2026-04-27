import { useMemo, useState } from "react";
import { PriceGexChart } from "./PriceGexChart";
import { LiveMetricsSidebar } from "./LiveMetricsSidebar";
import { useOptionsData } from "@/hooks/useOptionsData";
import { computeExposures, computeKeyLevels } from "@/lib/gex";
import type { GexSnapshot } from "@/lib/gexSimData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";

const SYMBOLS = ["QQQ", "SPY", "SPX", "AAPL", "TSLA", "NVDA"];

interface Props { defaultSymbol?: string; }

type DteOpt = "1" | "2" | "3" | "all";
const DTE_OPTIONS: { value: DteOpt; label: string }[] = [
  { value: "1", label: "1 day" },
  { value: "2", label: "2 days" },
  { value: "3", label: "3 days" },
  { value: "all", label: "All expiries (≤3D)" },
];

export function PriceGexChartContainer({ defaultSymbol = "QQQ" }: Props) {
  const [symbol, setSymbol] = useState(SYMBOLS.includes(defaultSymbol) ? defaultSymbol : "QQQ");
  const [dte, setDte] = useState<DteOpt>(3);

  const { ticker, contracts, status, source } = useOptionsData(symbol);
  const livePrice = ticker.spot;

  // Filter contracts to <= selected DTE (in days)
  const filtered = useMemo(
    () => contracts.filter((c) => c.expiry <= dte),
    [contracts, dte],
  );

  const snapshot: GexSnapshot = useMemo(() => {
    const points = computeExposures(livePrice, filtered.length ? filtered : contracts);
    const kl = computeKeyLevels(points);

    // Build wider strike list: keep ALL strikes with any GEX/OI activity
    const maxOI = Math.max(1, ...points.map((p) => p.callOI + p.putOI));
    const gexByStrike = points.map((p) => ({
      strike: p.strike,
      callGEX: p.callGex,
      putGEX: p.putGex,
      netGEX: p.netGex,
      callOI: p.callOI,
      putOI: p.putOI,
      oiPct: ((p.callOI + p.putOI) / maxOI) * 100,
    }));

    const totalCallGEX = points.reduce((s, p) => s + p.callGex, 0);
    const totalPutGEX = points.reduce((s, p) => s + p.putGex, 0);
    const totalCallOI = points.reduce((s, p) => s + p.callOI, 0);
    const totalPutOI = points.reduce((s, p) => s + p.putOI, 0);

    // Top 5 strikes by absolute net GEX (real "biggest gamma" levels)
    const top = [...points]
      .sort((a, b) => Math.abs(b.netGex) - Math.abs(a.netGex))
      .slice(0, 5);

    return {
      timestamp: Date.now(),
      spot: livePrice,
      gexByStrike,
      keyLevels: {
        zeroGamma: kl.gammaFlip ?? kl.volTrigger ?? livePrice,
        majorPositive: kl.callWall,
        majorNegative: kl.putWall,
      },
      aggregates: {
        netGEX: totalCallGEX + totalPutGEX,
        totalCallGEX,
        totalPutGEX,
        totalCallOI,
        totalPutOI,
      },
      maxChange: top.map((p, i) => ({
        window: [1, 5, 10, 15, 30][i] ?? (i + 1),
        strike: p.strike,
        delta: p.netGex,
      })),
    };
  }, [filtered, contracts, livePrice]);

  return (
    <div className="flex gap-3 w-full">
      <div className="flex-1 min-w-0">
        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3">
          <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
            <div>
              <span className="text-lg font-bold text-foreground">{symbol}</span>
              <span className="ml-2 text-xl font-mono text-white">${livePrice.toFixed(2)}</span>
              <span className="ml-2 text-[10px] font-mono text-muted-foreground uppercase">
                {status === "live" ? `· LIVE (${source})` : status === "demo" ? "· demo" : "· loading"}
              </span>
            </div>

            {/* DTE selector — up to 3 days */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Gamma DTE</span>
              <div className="flex border border-[#1f1f1f] rounded overflow-hidden bg-black">
                {([1, 2, 3] as DteOpt[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDte(d)}
                    className={`px-2.5 py-1 text-[11px] font-bold font-mono transition-colors ${
                      dte === d
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "text-muted-foreground hover:text-white"
                    }`}
                  >
                    {d}D
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {filtered.length} contracts
              </div>
            </div>
          </div>
          <PriceGexChart
            symbol={symbol}
            basePrice={livePrice}
            currentPrice={livePrice}
            snapshot={snapshot}
          />
        </div>
      </div>

      <LiveMetricsSidebar snapshot={snapshot} symbol={symbol} onSymbolChange={setSymbol} symbols={SYMBOLS} />
    </div>
  );
}
