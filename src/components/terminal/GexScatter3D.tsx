import Plot from "react-plotly.js";
import { useMemo } from "react";
import type { OptionContract } from "@/lib/gex";
import { bsGreeks, formatNumber } from "@/lib/gex";

const CONTRACT_SIZE = 100;

function contractGex(spot: number, c: OptionContract): number {
  const T = Math.max(c.expiry, 1) / 365;
  const hasReal = c.gamma != null && c.gamma !== 0;
  const gamma = hasReal ? c.gamma! : bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type).gamma;
  const sign = c.type === "call" ? 1 : -1;
  return gamma * c.oi * CONTRACT_SIZE * spot * spot * 0.01 * sign;
}

interface Props {
  contracts: OptionContract[];
  spot: number;
  symbol: string;
}

const AXIS_STYLE = {
  tickfont: { family: "JetBrains Mono, monospace", size: 9, color: "#6b7280" },
  gridcolor: "#1c1c1c",
  zerolinecolor: "#2a2a2a",
  backgroundcolor: "#030303",
  showbackground: true,
  showgrid: true,
  linecolor: "#2a2a2a",
};

export function GexScatter3D({ contracts, spot, symbol }: Props) {
  const { xs, ys, zs, gexVals, texts, sizes, maxAbsGex } = useMemo(() => {
    const lo = spot * 0.85;
    const hi = spot * 1.15;
    const filtered = contracts.filter((c) => c.strike >= lo && c.strike <= hi && c.oi > 0);

    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const gexVals: number[] = [];
    const texts: string[] = [];
    const sizes: number[] = [];

    const maxOI = Math.max(...filtered.map((c) => c.oi), 1);

    for (const c of filtered) {
      const gex = contractGex(spot, c);
      xs.push(c.strike);
      ys.push(c.expiry);
      zs.push(+(c.iv * 100).toFixed(2));
      gexVals.push(gex);
      texts.push(
        `<b>${c.type.toUpperCase()} $${c.strike}</b><br>` +
          `DTE: ${c.expiry}d<br>` +
          `IV: ${(c.iv * 100).toFixed(1)}%<br>` +
          `OI: ${c.oi.toLocaleString()}<br>` +
          `Net GEX: ${formatNumber(gex)}`
      );
      sizes.push(4 + Math.sqrt(c.oi / maxOI) * 10);
    }

    const maxAbsGex = Math.max(...gexVals.map(Math.abs), 1);
    return { xs, ys, zs, gexVals, texts, sizes, maxAbsGex };
  }, [contracts, spot]);

  return (
    <div className="w-full h-full relative">
      <Plot
        data={[
          {
            type: "scatter3d",
            mode: "markers",
            x: xs,
            y: ys,
            z: zs,
            text: texts,
            hoverinfo: "text",
            hoverlabel: {
              bgcolor: "#0a0a0a",
              bordercolor: "#2a2a2a",
              font: { family: "JetBrains Mono, monospace", size: 11, color: "#e5e7eb" },
            },
            marker: {
              size: sizes,
              color: gexVals,
              colorscale: "Viridis",
              cmin: -maxAbsGex,
              cmax: maxAbsGex,
              colorbar: {
                title: {
                  text: "Net GEX",
                  side: "right",
                  font: { family: "JetBrains Mono, monospace", size: 10, color: "#9ca3af" },
                },
                thickness: 12,
                len: 0.55,
                x: 1.01,
                tickfont: { family: "JetBrains Mono, monospace", size: 8, color: "#9ca3af" },
                tickformat: ".2s",
                outlinewidth: 0,
                bgcolor: "rgba(0,0,0,0)",
              },
              opacity: 0.9,
              line: { width: 0.3, color: "rgba(255,255,255,0.08)" },
            },
          } as any,
        ]}
        layout={
          {
            paper_bgcolor: "#000000",
            margin: { l: 0, r: 70, t: 10, b: 0 },
            scene: {
              bgcolor: "#000000",
              aspectmode: "manual",
              aspectratio: { x: 1.4, y: 1.0, z: 0.85 },
              xaxis: {
                title: {
                  text: "Strike",
                  font: { family: "JetBrains Mono, monospace", size: 10, color: "#9ca3af" },
                },
                ...AXIS_STYLE,
              },
              yaxis: {
                title: {
                  text: "DTE",
                  font: { family: "JetBrains Mono, monospace", size: 10, color: "#9ca3af" },
                },
                ...AXIS_STYLE,
              },
              zaxis: {
                title: {
                  text: "IV %",
                  font: { family: "JetBrains Mono, monospace", size: 10, color: "#9ca3af" },
                },
                ...AXIS_STYLE,
              },
              camera: { eye: { x: 1.6, y: 1.4, z: 1.1 } },
            },
            font: { family: "JetBrains Mono, monospace", color: "#9ca3af" },
            annotations: [
              {
                text: `${symbol} · Net Gamma Exposure · Drag to rotate`,
                x: 0,
                y: 1,
                xref: "paper",
                yref: "paper",
                xanchor: "left",
                yanchor: "top",
                showarrow: false,
                font: { family: "JetBrains Mono, monospace", size: 9, color: "#4b5563" },
              },
            ],
          } as any
        }
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </div>
  );
}
