import { VolatilityDataset } from "@/lib/mockVolatilityData";

interface Props { data: VolatilityDataset }

const LABEL = "text-[10px] uppercase tracking-[0.18em] text-[#6b7280] font-jetbrains";
const SUB = "text-[9px] text-[#4b5563] font-jetbrains";

export function TopMetricsBar({ data }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 px-4 py-3 rounded-lg border border-[#1f1f1f] bg-[#0a0a0a]">
      {/* DI-Risk */}
      <div className="flex flex-col">
        <span className={LABEL}>DI-Risk</span>
        <span className="text-2xl font-bold font-jetbrains text-white tabular-nums">{data.diRisk.toFixed(1)}</span>
        <span className={SUB}>2yr ATM range</span>
      </div>

      {/* ATM IV */}
      <div className="flex flex-col">
        <span className={LABEL}>ATM IV</span>
        <span className="text-[14px] font-bold font-jetbrains tabular-nums" style={{ color: "#10b981" }}>
          {data.atmIV.toFixed(2)}%
        </span>
        <span className={SUB}>{data.symbol} · 30D</span>
      </div>

      {/* HV15 / HV20 / HV30 */}
      <div className="flex flex-col">
        <span className={LABEL}>HV15 / HV20 / HV30</span>
        <span className="text-[12px] font-jetbrains text-[#9ca3af] tabular-nums">
          {data.hv15.toFixed(2)}% <span className="text-[#374151]">/</span> {data.hv20.toFixed(2)}% <span className="text-[#374151]">/</span> {data.hv30.toFixed(2)}%
        </span>
        <span className={SUB}>realized · annualized</span>
      </div>

      {/* Vol Premium */}
      <div className="flex flex-col">
        <span className={LABEL}>VOL PREMIUM</span>
        <span
          className="text-[14px] font-bold font-jetbrains tabular-nums"
          style={{ color: data.volPremium >= 0 ? "#10b981" : "#ef4444" }}
        >
          {data.volPremium >= 0 ? "+" : ""}{data.volPremium.toFixed(2)}%
        </span>
        <span className={SUB}>IV − HV30</span>
      </div>

      {/* VIX Term Structure */}
      <div className="flex flex-col">
        <span className={LABEL}>VIX TERM STRUCT</span>
        <div className="flex items-baseline gap-2 font-jetbrains text-[11px] text-[#9ca3af] tabular-nums">
          <span>9D <b className="text-[#e5e7eb]">{data.vix.v9d.toFixed(2)}</b></span>
          <span>VIX <b className="text-[#e5e7eb]">{data.vix.vix.toFixed(2)}</b></span>
          <span>3M <b className="text-[#e5e7eb]">{data.vix.m3.toFixed(2)}</b></span>
        </div>
        <span className={SUB}>Calls (contango)</span>
      </div>
    </div>
  );
}
