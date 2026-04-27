import { useEffect, useMemo, useState } from "react";
import { PriceChart } from "./PriceChart";
import { GEXOverlay } from "./GEXOverlay";
import { LiveMetricsSidebar } from "./LiveMetricsSidebar";
import { generateGexSnapshot } from "@/lib/gexSimData";

const SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];
const BASE_PRICES: Record<string, number> = { SPY: 609.23, QQQ: 542.10, AAPL: 232.15, TSLA: 412.88, NVDA: 145.67 };

interface Props {
  defaultSymbol?: string;
}

export function PriceGexChartContainer({ defaultSymbol = "SPY" }: Props) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const basePrice = BASE_PRICES[symbol] ?? 100;
  const [livePrice, setLivePrice] = useState(basePrice);
  const [tick, setTick] = useState(0);

  // Simulate live price drift
  useEffect(() => {
    setLivePrice(basePrice);
    const id = setInterval(() => {
      setLivePrice((p) => {
        const drift = (Math.random() - 0.5) * basePrice * 0.0008;
        return Math.max(basePrice * 0.95, Math.min(basePrice * 1.05, p + drift));
      });
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [basePrice]);

  const snapshot = useMemo(() => generateGexSnapshot(symbol, livePrice, tick), [symbol, livePrice, tick]);

  return (
    <div className="flex gap-3 w-full">
      <div className="flex-1 min-w-0 space-y-3">
        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-lg font-bold text-foreground">{symbol}</span>
              <span className="ml-2 text-xl font-mono text-yellow-400">${livePrice.toFixed(2)}</span>
              <span className={`ml-2 text-xs font-mono ${livePrice >= basePrice ? "text-emerald-400" : "text-red-400"}`}>
                {livePrice >= basePrice ? "+" : ""}{((livePrice - basePrice) / basePrice * 100).toFixed(3)}%
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">PRICE + GAMMA EXPOSURE</div>
          </div>
          <PriceChart
            symbol={symbol}
            basePrice={basePrice}
            currentPrice={livePrice}
            zeroGamma={snapshot.keyLevels.zeroGamma}
            majorPositive={snapshot.keyLevels.majorPositive}
            majorNegative={snapshot.keyLevels.majorNegative}
          />
        </div>

        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3">
          <div className="text-[10px] font-bold tracking-wider text-cyan-400 mb-1.5 uppercase">GEX by Strike (±4%)</div>
          <GEXOverlay snapshot={snapshot} currentPrice={livePrice} />
        </div>
      </div>

      <LiveMetricsSidebar snapshot={snapshot} symbol={symbol} onSymbolChange={setSymbol} symbols={SYMBOLS} />
    </div>
  );
}
