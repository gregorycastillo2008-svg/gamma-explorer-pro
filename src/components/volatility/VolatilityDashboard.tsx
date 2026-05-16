import { useMemo } from "react";
import { DemoTicker, OptionContract } from "@/lib/gex";
import { buildVolatilityDataset } from "@/lib/mockVolatilityData";
import { TopMetricsBar } from "./TopMetricsBar";
import { IvSurface3DReal } from "@/components/terminal/IvSurface3DReal";
import { IVSkewChart } from "./IVSkewChart";
import { PutCallSkewPanel } from "./PutCallSkewPanel";
import { RealizedVolatilityChart } from "./RealizedVolatilityChart";
import { VolatilityTable } from "./VolatilityTable";
import { MonteCarloSimulation } from "./MonteCarloSimulation";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

export function VolatilityDashboard({ ticker, contracts }: Props) {
  const data = useMemo(
    () => buildVolatilityDataset(ticker.symbol, ticker.spot, ticker.baseIV, 7, contracts),
    [ticker.symbol, ticker.spot, ticker.baseIV, contracts],
  );
  // Build cellMap for IvSurface3DReal from real contracts
  const { strikes, expiries, cellMap, ivMin, ivMax } = useMemo(() => {
    const strikeSet = new Set<number>();
    const expirySet = new Set<number>();
    const ivAcc = new Map<string, { sum: number; count: number }>();
    for (const c of contracts) {
      if (c.iv <= 0 || c.iv > 5) continue;
      strikeSet.add(c.strike);
      expirySet.add(c.expiry);
      const key = `${c.strike}|${c.expiry}`;
      const acc = ivAcc.get(key) ?? { sum: 0, count: 0 };
      acc.sum += c.iv; acc.count += 1;
      ivAcc.set(key, acc);
    }
    const cellMap = new Map<string, number>();
    let lo = Infinity, hi = -Infinity;
    ivAcc.forEach(({ sum, count }, key) => {
      const iv = sum / count;
      cellMap.set(key, iv);
      if (iv < lo) lo = iv;
      if (iv > hi) hi = iv;
    });
    return {
      strikes: Array.from(strikeSet).sort((a, b) => a - b),
      expiries: Array.from(expirySet).sort((a, b) => a - b),
      cellMap,
      ivMin: lo === Infinity ? 0.05 : lo,
      ivMax: hi === -Infinity ? 0.50 : hi,
    };
  }, [contracts]);

  return (
    <div className="space-y-3" style={{ background: "#000000" }}>
      <TopMetricsBar data={data} />

      {/* 3D IV Surface (smooth Plotly) + IV Skew side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #1f1f1f" }}>
          <IvSurface3DReal
            strikes={strikes}
            expiries={expiries}
            cellMap={cellMap}
            min={ivMin}
            max={ivMax}
            spot={ticker.spot}
          />
        </div>
        <Panel className="h-[560px]"><IVSkewChart data={data} /></Panel>
      </div>

      {/* Monte Carlo — below 3D Surface */}
      <MonteCarloSimulation ticker={ticker} contracts={contracts} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel className="h-[500px]"><PutCallSkewPanel data={data} /></Panel>
        <Panel className="h-[500px]"><VolatilityTable data={data} /></Panel>
      </div>

      <Panel className="h-[400px]">
        <RealizedVolatilityChart data={data} />
      </Panel>

    </div>
  );
}

function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] p-4 overflow-auto ${className}`}>
      {children}
    </div>
  );
}
