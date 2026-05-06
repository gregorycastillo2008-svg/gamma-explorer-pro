/**
 * Gamma Hotspots Panel
 * Muestra strikes con máxima presión de gamma (pinch points)
 * Análisis profesional de donde está el riesgo de gamma
 */

import { useMemo } from "react";
import { Panel } from "./Panel";
import type { ExposurePoint } from "@/lib/gex";
import { TrendingUp, AlertTriangle, Zap } from "lucide-react";

interface Props {
  exposures: ExposurePoint[];
  spot: number;
  strikeStep: number;
}

export function GammaHotspotsPanel({ exposures, spot, strikeStep }: Props) {
  const hotspots = useMemo(() => {
    // Find top 5 gamma concentration points
    const sorted = [...exposures]
      .map((e) => ({
        strike: e.strike,
        gamma: Math.abs(e.gamma),
        callGamma: Math.abs(e.callGamma),
        putGamma: Math.abs(e.putGamma),
        netGamma: e.gamma,
        distance: Math.abs(e.strike - spot) / spot,
        distPct: ((e.strike - spot) / spot) * 100,
      }))
      .sort((a, b) => b.gamma - a.gamma)
      .slice(0, 6);

    return sorted;
  }, [exposures, spot]);

  const totalGamma = useMemo(() => {
    return exposures.reduce((s, e) => s + Math.abs(e.gamma), 0);
  }, [exposures]);

  const maxGamma = hotspots[0]?.gamma || 1;

  // Find critical zone (highest gamma concentration)
  const criticalZone = hotspots[0]?.strike || spot;
  const criticalDist = ((criticalZone - spot) / spot) * 100;

  return (
    <Panel
      title="Gamma Hotspots"
      subtitle="Pinch points where gamma pressure is highest"
      className="h-full flex flex-col bg-gradient-to-br from-slate-900/50 to-slate-800/30"
    >
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto terminal-scrollbar">
        {/* Critical Zone Banner */}
        <div
          className="rounded border p-2 text-xs font-mono"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            borderColor: "rgba(239, 68, 68, 0.3)",
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-red-400">
              <Zap size={12} className="animate-pulse" />
              CRITICAL ZONE
            </div>
            <span className="text-red-300 font-bold">${criticalZone.toFixed(0)}</span>
          </div>
          <div className="text-muted-foreground">
            {criticalDist >= 0 ? "+" : ""}
            {criticalDist.toFixed(2)}% from spot · {((hotspots[0]?.gamma / totalGamma) * 100 || 0).toFixed(1)}% of total
          </div>
        </div>

        {/* Hotspots List */}
        <div className="space-y-px">
          {hotspots.map((hs, i) => {
            const pct = (hs.gamma / maxGamma) * 100;
            const isAboveSpot = hs.strike > spot;
            const significance = (hs.gamma / totalGamma) * 100;

            return (
              <div
                key={`${hs.strike}-${i}`}
                className="group rounded text-xs font-mono transition-colors hover:bg-slate-700/40"
              >
                {/* Strike and level */}
                <div className="flex items-center justify-between px-2 py-1 gap-2">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-primary">${hs.strike.toFixed(0)}</span>
                      <span className={isAboveSpot ? "text-call" : "text-put"}>
                        {isAboveSpot ? "↑" : "↓"}
                        {Math.abs(hs.distPct).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Gamma value */}
                  <div className="text-right">
                    <div className="font-bold text-amber-300">
                      {hs.gamma >= 1e6 ? (hs.gamma / 1e6).toFixed(2) + "M" : hs.gamma >= 1e3 ? (hs.gamma / 1e3).toFixed(1) + "K" : hs.gamma.toFixed(0)}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{significance.toFixed(1)}% of total</div>
                  </div>
                </div>

                {/* Visual bar */}
                <div className="h-1 bg-slate-800/50 rounded-sm overflow-hidden mx-2 mb-1">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Call/Put breakdown */}
                <div className="px-2 pb-1 flex items-center gap-2 text-[8px] text-muted-foreground">
                  <span className="text-call">C:{hs.callGamma >= 1e3 ? (hs.callGamma / 1e3).toFixed(1) + "K" : hs.callGamma.toFixed(0)}</span>
                  <span className="text-border">|</span>
                  <span className="text-put">P:{hs.putGamma >= 1e3 ? (hs.putGamma / 1e3).toFixed(1) + "K" : hs.putGamma.toFixed(0)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Stats */}
        <div className="mt-auto pt-2 border-t border-slate-700/50 space-y-1 text-xs font-mono">
          <div className="flex justify-between px-2 py-1">
            <span className="text-muted-foreground">Total Gamma:</span>
            <span className="text-amber-300 font-bold">
              {totalGamma >= 1e9 ? (totalGamma / 1e9).toFixed(2) + "B" : totalGamma >= 1e6 ? (totalGamma / 1e6).toFixed(2) + "M" : (totalGamma / 1e3).toFixed(1) + "K"}
            </span>
          </div>
          <div className="flex justify-between px-2 py-1">
            <span className="text-muted-foreground">Gamma Spread:</span>
            <span className="text-cyan-300 font-bold">${(hotspots[0]?.strike - hotspots[hotspots.length - 1]?.strike || 0).toFixed(0)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
