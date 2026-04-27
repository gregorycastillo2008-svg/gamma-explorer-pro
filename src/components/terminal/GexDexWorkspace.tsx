import { useState } from "react";
import { HorizontalGEXChart } from "./HorizontalGEXChart";
import { GEXDEXHeatmap } from "./GEXDEXHeatmap";
import { GexExposureTabs } from "./GexExposureTabs";
import type { DemoTicker, OptionContract } from "@/lib/gex";

interface Props {
  ticker: DemoTicker;
  contracts: OptionContract[];
}

type Tab = "heatmap" | "strike" | "surface" | "expiries";

const TABS: { id: Tab; label: string }[] = [
  { id: "heatmap",  label: "HEATMAP" },
  { id: "strike",   label: "STRIKE CHART" },
  { id: "surface",  label: "3D SURFACE" },
  { id: "expiries", label: "EXPIRIES" },
];

const C = {
  bg:     "#0a0a0a",
  border: "#1f1f1f",
  green:  "#10b981",
  muted:  "#666",
};
const FONT = `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`;

export function GexDexWorkspace({ ticker, contracts }: Props) {
  const [tab, setTab] = useState<Tab>("heatmap");

  return (
    <div
      className="w-full h-full flex flex-col"
      style={{ background: C.bg, fontFamily: FONT }}
    >
      {/* Tabs bar */}
      <div
        className="flex items-center gap-1 px-3 pt-2 shrink-0"
        style={{ borderBottom: `1px solid ${C.border}`, background: "#000" }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-2 text-[10px] font-bold tracking-[0.2em] uppercase transition-colors relative"
              style={{
                color: active ? C.green : C.muted,
                background: active ? "rgba(16,185,129,0.06)" : "transparent",
                borderTop: `1px solid ${active ? C.green : "transparent"}`,
                borderLeft: `1px solid ${active ? C.border : "transparent"}`,
                borderRight: `1px solid ${active ? C.border : "transparent"}`,
                borderBottom: active ? `1px solid ${C.bg}` : "none",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body — split: left = horizontal chart (always visible), right = active tab content */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-2 p-2">
        {/* Left card: horizontal histogram */}
        <div className="min-h-0">
          <HorizontalGEXChart ticker={ticker} contracts={contracts} />
        </div>

        {/* Right card: switches by tab */}
        <div className="min-h-0">
          {tab === "heatmap"  && <GEXDEXHeatmap ticker={ticker} contracts={contracts} />}
          {tab === "strike"   && <GexExposureTabs ticker={ticker} contracts={contracts} metric="netGex" />}
          {tab === "surface"  && <GexExposureTabs ticker={ticker} contracts={contracts} metric="netGex" />}
          {tab === "expiries" && <GexExposureTabs ticker={ticker} contracts={contracts} metric="dex" />}
        </div>
      </div>
    </div>
  );
}
