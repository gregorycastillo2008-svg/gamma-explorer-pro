import { useMemo } from "react";
import { DemoTicker, OptionContract, computeExposures } from "@/lib/gex";
import { buildVolatilityDataset } from "@/lib/mockVolatilityData";
import { TopMetricsBar } from "./TopMetricsBar";
import { Volatility3DSurface } from "@/components/terminal/Volatility3DSurface";
import { IVSkewChart } from "./IVSkewChart";
import { PutCallSkewPanel } from "./PutCallSkewPanel";
import { RealizedVolatilityChart } from "./RealizedVolatilityChart";
import { VolatilityTable } from "./VolatilityTable";
import { RealVolatilityDashboard } from "./RealVolatilityDashboard";
import { GexDivergingBars } from "./GexDivergingBars";


interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

export function VolatilityDashboard({ ticker, contracts }: Props) {
  const data = useMemo(
    () => buildVolatilityDataset(ticker.symbol, ticker.spot, ticker.baseIV, 7, contracts),
    [ticker.symbol, ticker.spot, ticker.baseIV, contracts],
  );

  return (
    <div className="space-y-3" style={{ background: "#000000" }}>
      <TopMetricsBar data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel className="min-h-[660px]"><Volatility3DSurface surface={data.surface} spot={data.spot} symbol={data.symbol} /></Panel>
        <Panel className="h-[500px]"><IVSkewChart data={data} /></Panel>
        <Panel className="h-[500px]"><PutCallSkewPanel data={data} /></Panel>
        <Panel className="h-[500px]"><VolatilityTable data={data} /></Panel>
      </div>

      <Panel className="h-[400px]">
        <RealizedVolatilityChart data={data} />
      </Panel>

      <RealVolatilityDashboard defaultTicker={ticker.symbol} />
    </div>
  );
}

function Panel({ className = "mx-0 my-0 px-0 py-0 mr-0 mb-0", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border border-[#1f1f1f] bg-[#0a0a0a] p-4 overflow-auto ${className}`}>
      {children}
    </div>
  );
}
