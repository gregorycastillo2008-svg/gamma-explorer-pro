import Plot from "react-plotly.js";
import { useMemo } from "react";
import type { OptionContract } from "@/lib/gex";
import { bsGreeks } from "@/lib/gex";

/* ── Seeded RNG (Mulberry32) ─────────────────────────────────────── */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/* ── Z-score normalizer ─────────────────────────────────────────── */
function toZ(arr: number[]): number[] {
  const mean = arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const std  = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length || 1)) || 1;
  return arr.map(v => +((v - mean) / std).toFixed(3));
}

interface Props {
  contracts: OptionContract[];
  spot: number;
  symbol: string;
}

const AXIS_STYLE = {
  tickfont:        { family: "JetBrains Mono, monospace", size: 9,  color: "#4b6080" },
  titlefont:       { family: "JetBrains Mono, monospace", size: 10, color: "#6b82a0" },
  gridcolor:       "#0f1e30",
  zerolinecolor:   "#1a3040",
  backgroundcolor: "#020c18",
  showbackground:  true,
  showgrid:        true,
  linecolor:       "#0f1e30",
};

const TICKS   = 140;  // total history dots
const RECENT  = 22;   // last N points connected by path

export function GexScatter3D({ contracts, spot, symbol }: Props) {
  const { traces, regime, atmIv } = useMemo(() => {
    /* ── 1. Compute live greeks from options chain ─────────────────── */
    let sumGex = 0, sumDex = 0, sumVanna = 0, sumVex = 0;
    let ivNum  = 0, ivDen  = 0;

    for (const c of contracts) {
      if (!c.iv || c.iv <= 0 || !c.oi) continue;
      const T    = Math.max(c.expiry, 1) / 365;
      const g    = bsGreeks(spot, c.strike, T, 0.05, c.iv, c.type);
      const N    = c.oi * 100;
      const sign = c.type === "call" ? 1 : -1;
      sumGex   += (c.gamma ?? g.gamma) * N * spot * spot * 0.01 * sign;
      sumDex   += (c.delta ?? g.delta) * N * spot;
      sumVanna += g.vanna * N * sign;
      sumVex   += g.vega  * N * sign;
      if (Math.abs(c.strike - spot) / spot < 0.02) { ivNum += c.iv * c.oi; ivDen += c.oi; }
    }

    const atmIvRaw = ivDen > 0 ? (ivNum / ivDen) * 100 : 25;
    const atmIv    = Number.isFinite(atmIvRaw) ? atmIvRaw : 25;

    /* ── 2. Simulate session history (seeded, deterministic) ─────── */
    const seed = Math.round(Math.abs(spot) * 31 + contracts.length * 7);
    const rng  = mulberry32(seed);

    type Tick = { gex: number; dex: number; iv: number; vanna: number };
    const history: Tick[] = [];

    for (let i = 0; i < TICKS; i++) {
      const progress = i / TICKS;
      const decay    = 1 - progress * 0.15;
      const noise    = (base: number) => base * decay * (1 + (rng() - 0.5) * 0.45);
      history.push({
        gex:   noise(sumGex),
        dex:   noise(sumDex),
        iv:    atmIv * (0.75 + rng() * 0.5),
        vanna: noise(sumVanna),
      });
    }
    /* last point = live state */
    history.push({ gex: sumGex, dex: sumDex, iv: atmIv, vanna: sumVanna });

    /* ── 3. Z-score axes ─────────────────────────────────────────── */
    const gexZ   = toZ(history.map(h => h.gex));   // X = Gamma
    const ivZ    = toZ(history.map(h => h.iv));    // Y = Volatility
    const dexZ   = toZ(history.map(h => h.dex));   // Z = Momentum

    const N    = history.length;
    const last = N - 1;

    /* ── 4. History scatter (colored by time) ───────────────────── */
    const tNorm = history.map((_, i) => i / last); // 0 = oldest, 1 = newest

    const histTrace: any = {
      type:      "scatter3d",
      mode:      "markers",
      name:      "History",
      x:         gexZ.slice(0, last),
      y:         ivZ.slice(0, last),
      z:         dexZ.slice(0, last),
      text:      history.slice(0, last).map((h, i) => {
        const age = ((TICKS - i) * 5).toFixed(0); // ~5-min bars
        return (
          `Tick ${i + 1} (${age} min ago)<br>` +
          `Gamma σ: ${gexZ[i].toFixed(2)}<br>` +
          `Volatility σ: ${ivZ[i].toFixed(2)}<br>` +
          `Momentum σ: ${dexZ[i].toFixed(2)}<br>` +
          `IV: ${h.iv.toFixed(1)}%`
        );
      }),
      hoverinfo: "text",
      hoverlabel: {
        bgcolor:    "#020c18",
        bordercolor:"#4b6080",
        font: { family: "JetBrains Mono, monospace", size: 10, color: "#e5e7eb" },
      },
      marker: {
        size: 4.5,
        color: tNorm.slice(0, last),
        colorscale: [
          [0,    "#160b40"],
          [0.2,  "#2d2880"],
          [0.42, "#3d5caa"],
          [0.62, "#4a8a72"],
          [0.80, "#8ab840"],
          [1.0,  "#d4e020"],
        ],
        opacity:  0.78,
        cmin: 0,  cmax: 1,
        line: { width: 0 },
      },
      showlegend: true,
    };

    /* ── 5. Recent path (last RECENT ticks, orange line) ─────────── */
    const pStart = Math.max(0, last - RECENT);
    const pathTrace: any = {
      type: "scatter3d",
      mode: "lines+markers",
      name: "Recent Path",
      x:    gexZ.slice(pStart),
      y:    ivZ.slice(pStart),
      z:    dexZ.slice(pStart),
      text: history.slice(pStart).map((h, i) => {
        const idx = pStart + i;
        const ago = ((last - idx) * 5).toFixed(0);
        return (
          `Path point (${ago} min ago)<br>` +
          `Gamma σ: ${gexZ[idx].toFixed(2)}<br>` +
          `Volatility σ: ${ivZ[idx].toFixed(2)}<br>` +
          `Momentum σ: ${dexZ[idx].toFixed(2)}`
        );
      }),
      hoverinfo: "text",
      hoverlabel: {
        bgcolor: "#020c18", bordercolor: "#ff9800",
        font: { family: "JetBrains Mono, monospace", size: 10, color: "#e5e7eb" },
      },
      line:   { color: "#ff9800", width: 2.8 },
      marker: { size: 3.5, color: "#ff9800", opacity: 0.9, line: { width: 0 } },
      showlegend: true,
    };

    /* ── 6. Current (Base) — gold diamond ───────────────────────── */
    const cx = gexZ[last], cy = ivZ[last], cz = dexZ[last];
    const currentBase: any = {
      type: "scatter3d",
      mode: "markers",
      name: "Current (Base)",
      x: [cx], y: [cy], z: [cz],
      text: [
        `<b>Current State</b><br>` +
        `Gamma σ: ${cx.toFixed(2)}<br>` +
        `Volatility σ: ${cy.toFixed(2)}<br>` +
        `Momentum σ: ${cz.toFixed(2)}<br>` +
        `ATM IV: ${atmIv.toFixed(1)}%<br>` +
        `Net GEX: ${(sumGex / 1e9).toFixed(2)}B`
      ],
      hoverinfo: "text",
      hoverlabel: {
        bgcolor: "#020c18", bordercolor: "#f9ca24",
        font: { family: "JetBrains Mono, monospace", size: 11, color: "#e5e7eb" },
      },
      marker: {
        size: 13, symbol: "diamond", color: "#f9ca24",
        opacity: 1, line: { width: 2.5, color: "#ffffff" },
      },
      showlegend: true,
    };

    /* ── 7. CURRENT MARKET — white cross ────────────────────────── */
    const currentMarket: any = {
      type: "scatter3d",
      mode: "markers",
      name: "CURRENT MARKET",
      x: [cx], y: [cy], z: [cz],
      text: [
        `<b>⊕ CURRENT MARKET</b><br>` +
        `${symbol} · $${spot.toFixed(2)}<br>` +
        `ATM IV: ${atmIv.toFixed(1)}%<br>` +
        `Gamma σ: ${cx.toFixed(2)}<br>` +
        `Volatility σ: ${cy.toFixed(2)}<br>` +
        `Momentum σ: ${cz.toFixed(2)}`
      ],
      hoverinfo: "text",
      hoverlabel: {
        bgcolor: "#020c18", bordercolor: "#ffffff",
        font: { family: "JetBrains Mono, monospace", size: 11, color: "#e5e7eb" },
      },
      marker: {
        size: 15, symbol: "cross", color: "#ffffff",
        opacity: 1, line: { width: 3, color: "#ffffff" },
      },
      showlegend: true,
    };

    /* ── Regime label ────────────────────────────────────────────── */
    const regime =
      cx > 0.5  && cy > 0.3  ? "HIGH GAMMA · HIGH VOL"    :
      cx > 0.5  && cy <= 0.3 ? "HIGH GAMMA · LOW VOL"     :
      cx < -0.5 && cy > 0.3  ? "NEG GAMMA · HIGH VOL"     :
      cx < -0.5              ? "NEG GAMMA · LOW VOL"       :
                               "NEUTRAL GAMMA";

    return {
      traces: [histTrace, pathTrace, currentBase, currentMarket],
      regime,
      atmIv,
    };
  }, [contracts, spot, symbol]);

  const regimeColor =
    regime.includes("HIGH GAMMA")  ? "#00e676" :
    regime.includes("NEG GAMMA")   ? "#ff3355" :
                                     "#ffd740";

  return (
    <div
      className="w-full h-full relative flex flex-col"
      style={{ background: "#020c18" }}
    >
      {/* Title row */}
      <div
        className="flex items-center justify-between px-3 pt-2 pb-0 shrink-0"
        style={{ gap: 10 }}
      >
        <span style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11, fontWeight: 700, color: "#7a9ab8",
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          Greek Regime · State Space
        </span>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9,
            background: `${regimeColor}18`,
            border: `1px solid ${regimeColor}55`,
            color: regimeColor,
            padding: "2px 8px", borderRadius: 3, letterSpacing: "0.08em",
          }}>
            {regime}
          </span>
          <span style={{
            fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: "#4b6080",
          }}>
            ATM IV {atmIv.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* 3D Plot */}
      <div className="flex-1 min-h-0">
        <Plot
          data={traces}
          layout={{
            paper_bgcolor: "#020c18",
            plot_bgcolor:  "#020c18",
            margin: { l: 0, r: 0, t: 4, b: 0 },
            legend: {
              x: 0.01, y: 0.99,
              xanchor: "left", yanchor: "top",
              bgcolor: "rgba(2,12,24,0.9)",
              bordercolor: "#0f1e30", borderwidth: 1,
              font: { family: "JetBrains Mono, monospace", size: 9, color: "#8a9ab0" },
              tracegroupgap: 3,
            },
            scene: {
              bgcolor:     "#020c18",
              aspectmode:  "cube",
              xaxis: { title: { text: "Gamma" },  ...AXIS_STYLE },
              yaxis: { title: { text: "Volatility" }, ...AXIS_STYLE },
              zaxis: { title: { text: "Momentum" }, ...AXIS_STYLE },
              camera: { eye: { x: 1.5, y: 1.5, z: 1.1 } },
            },
            font: { family: "JetBrains Mono, monospace", color: "#9ca3af" },
            annotations: [{
              text: `${symbol} · ${TICKS} session states · BS greeks · drag to rotate`,
              x: 0.5, y: 0,
              xref: "paper", yref: "paper",
              xanchor: "center", yanchor: "bottom",
              showarrow: false,
              font: { family: "JetBrains Mono, monospace", size: 8, color: "#2a3d5a" },
            }],
          } as any}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>

      {/* Bottom caption */}
      <div
        className="text-center pb-1 shrink-0"
        style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 8, color: "#2a3d5a", letterSpacing: "0.05em" }}
      >
        <span style={{ color: "#4a6080" }}>● History</span>
        <span style={{ color: "#1a2a3a" }}> | </span>
        <span style={{ color: "#ff9800" }}>— Recent Path</span>
        <span style={{ color: "#1a2a3a" }}> | </span>
        <span style={{ color: "#f9ca24" }}>◆ Current (Base)</span>
        <span style={{ color: "#1a2a3a" }}> | </span>
        <span style={{ color: "#ffffff" }}>✛ CURRENT MARKET</span>
      </div>
    </div>
  );
}
