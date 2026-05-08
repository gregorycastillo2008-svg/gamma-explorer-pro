import Plot from "react-plotly.js";
import { useMemo } from "react";
import type { OptionContract } from "@/lib/gex";
import { bsGreeks, formatNumber } from "@/lib/gex";

const CONTRACT_SIZE = 100;
const GEX_CAP_M = 8;

function contractGex(spot: number, c: OptionContract): number {
  const T = Math.max(c.expiry, 1) / 365;
  const hasReal = c.gamma != null && c.gamma !== 0;
  const gamma = hasReal
    ? c.gamma!
    : bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type).gamma;
  const sign = c.type === "call" ? 1 : -1;
  return gamma * c.oi * CONTRACT_SIZE * spot * spot * 0.01 * sign;
}

interface Props {
  contracts: OptionContract[];
  spot: number;
  symbol: string;
}

const AXIS_STYLE = {
  tickfont: { family: "JetBrains Mono, monospace", size: 9, color: "#4b6080" },
  gridcolor: "#0f1e30",
  zerolinecolor: "#1a3040",
  backgroundcolor: "#020c18",
  showbackground: true,
  showgrid: true,
  linecolor: "#0f1e30",
};

const CATEGORIES = [
  {
    label: "Near Calls ≤14d",
    color: "#00e5ff",
    filter: (c: OptionContract) => c.type === "call" && c.expiry <= 14,
  },
  {
    label: "Mid Calls 15-45d",
    color: "#9b59e8",
    filter: (c: OptionContract) =>
      c.type === "call" && c.expiry > 14 && c.expiry <= 45,
  },
  {
    label: "Far Calls >45d",
    color: "#4ecdc4",
    filter: (c: OptionContract) => c.type === "call" && c.expiry > 45,
  },
  {
    label: "Near Puts ≤14d",
    color: "#ff4757",
    filter: (c: OptionContract) => c.type === "put" && c.expiry <= 14,
  },
  {
    label: "Mid Puts 15-45d",
    color: "#ffa502",
    filter: (c: OptionContract) =>
      c.type === "put" && c.expiry > 14 && c.expiry <= 45,
  },
  {
    label: "Far Puts >45d",
    color: "#2ed573",
    filter: (c: OptionContract) => c.type === "put" && c.expiry > 45,
  },
];

export function GexScatter3D({ contracts, spot, symbol }: Props) {
  const { traces, subtitle } = useMemo(() => {
    const lo = spot * 0.85;
    const hi = spot * 1.15;
    const filtered = contracts.filter(
      (c) => c.strike >= lo && c.strike <= hi && c.oi > 0
    );

    const builtTraces: any[] = CATEGORIES.map(({ label, color, filter }) => {
      const group = filtered.filter(filter);
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      const texts: string[] = [];

      for (const c of group) {
        const rawGex = contractGex(spot, c);
        const gexM = Math.max(-GEX_CAP_M, Math.min(GEX_CAP_M, rawGex / 1e6));
        const money = ((c.strike / spot) - 1) * 100;
        xs.push(+money.toFixed(2));
        ys.push(c.expiry);
        zs.push(+gexM.toFixed(4));
        texts.push(
          `<b>${c.type.toUpperCase()} $${c.strike}</b><br>` +
          `Moneyness: ${money >= 0 ? "+" : ""}${money.toFixed(1)}%<br>` +
          `DTE: ${c.expiry}d<br>` +
          `IV: ${(c.iv * 100).toFixed(1)}%<br>` +
          `OI: ${c.oi.toLocaleString()}<br>` +
          `Net GEX: ${formatNumber(rawGex)}`
        );
      }

      return {
        type: "scatter3d",
        mode: "markers",
        name: label,
        x: xs,
        y: ys,
        z: zs,
        text: texts,
        hoverinfo: "text",
        hoverlabel: {
          bgcolor: "#020c18",
          bordercolor: color,
          font: { family: "JetBrains Mono, monospace", size: 11, color: "#e5e7eb" },
        },
        marker: {
          size: 5,
          color,
          opacity: 0.82,
          line: { width: 0.5, color: "rgba(255,255,255,0.06)" },
        },
        showlegend: true,
      };
    });

    // Diamond marker at spot (ATM, GEX=0)
    builtTraces.push({
      type: "scatter3d",
      mode: "markers",
      name: `Spot $${spot.toFixed(0)}`,
      x: [0],
      y: [1],
      z: [0],
      text: [`<b>Spot</b> $${spot.toFixed(2)}<br>ATM reference`],
      hoverinfo: "text",
      hoverlabel: {
        bgcolor: "#020c18",
        bordercolor: "#f9ca24",
        font: { family: "JetBrains Mono, monospace", size: 11, color: "#e5e7eb" },
      },
      marker: {
        size: 9,
        color: "#f9ca24",
        opacity: 1,
        symbol: "diamond",
        line: { width: 1.5, color: "#ffffff" },
      },
      showlegend: true,
    });

    const subtitle = `${filtered.length.toLocaleString()} contracts · ±15% moneyness · ${symbol}`;
    return { traces: builtTraces, subtitle };
  }, [contracts, spot, symbol]);

  return (
    <div className="w-full h-full relative flex flex-col" style={{ background: "#020c18" }}>
      {/* Title */}
      <div className="text-center pt-2 shrink-0">
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            fontWeight: 700,
            color: "#f9ca24",
            letterSpacing: "0.05em",
          }}
        >
          Moneyness × DTE × GEX &rarr; Gamma Exposure Manifold
        </span>
      </div>

      {/* 3D Plot */}
      <div className="flex-1 min-h-0">
        <Plot
          data={traces}
          layout={
            {
              paper_bgcolor: "#020c18",
              plot_bgcolor: "#020c18",
              margin: { l: 0, r: 0, t: 4, b: 0 },
              legend: {
                x: 0.01,
                y: 0.99,
                xanchor: "left",
                yanchor: "top",
                bgcolor: "rgba(2,12,24,0.88)",
                bordercolor: "#0f1e30",
                borderwidth: 1,
                font: {
                  family: "JetBrains Mono, monospace",
                  size: 9,
                  color: "#8a9ab0",
                },
                tracegroupgap: 2,
              },
              scene: {
                bgcolor: "#020c18",
                aspectmode: "manual",
                aspectratio: { x: 1.5, y: 1.0, z: 0.9 },
                xaxis: {
                  title: {
                    text: "Moneyness %",
                    font: {
                      family: "JetBrains Mono, monospace",
                      size: 10,
                      color: "#6b82a0",
                    },
                  },
                  ...AXIS_STYLE,
                },
                yaxis: {
                  title: {
                    text: "DTE",
                    font: {
                      family: "JetBrains Mono, monospace",
                      size: 10,
                      color: "#6b82a0",
                    },
                  },
                  ...AXIS_STYLE,
                },
                zaxis: {
                  title: {
                    text: "Net GEX ($M)",
                    font: {
                      family: "JetBrains Mono, monospace",
                      size: 10,
                      color: "#6b82a0",
                    },
                  },
                  ...AXIS_STYLE,
                },
                camera: { eye: { x: 1.7, y: 1.5, z: 1.0 } },
              },
              font: { family: "JetBrains Mono, monospace", color: "#9ca3af" },
              annotations: [
                {
                  text: subtitle,
                  x: 0.5,
                  y: 0,
                  xref: "paper",
                  yref: "paper",
                  xanchor: "center",
                  yanchor: "bottom",
                  showarrow: false,
                  font: {
                    family: "JetBrains Mono, monospace",
                    size: 9,
                    color: "#3d5570",
                  },
                },
              ],
            } as any
          }
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Bottom caption */}
      <div
        className="text-center pb-1 shrink-0"
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9,
          color: "#3d5570",
          letterSpacing: "0.02em",
        }}
      >
        {CATEGORIES.map(({ label, color }, i) => (
          <span key={label}>
            <span style={{ color }}>{label}</span>
            {i < CATEGORIES.length - 1 && (
              <span style={{ color: "#0f1e30" }}> | </span>
            )}
          </span>
        ))}
        <span style={{ color: "#0f1e30" }}> | </span>
        <span style={{ color: "#f9ca24" }}>★ Spot</span>
      </div>
    </div>
  );
}
