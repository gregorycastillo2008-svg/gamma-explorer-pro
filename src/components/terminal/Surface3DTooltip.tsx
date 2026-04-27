import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type SurfaceType = "iv" | "vanna" | "charm" | "terrain";

export interface TooltipData {
  strike?: number;
  moneyness?: number;
  dte?: number;
  value: number;
  iv?: number;
  oiPct?: number;
  // Generic axes (terrain etc.)
  x?: number;
  y?: number;
  z?: number;
  xLabel?: string;
  yLabel?: string;
  zLabel?: string;
  position: { x: number; y: number };
}

function fmtAbs(v: number) {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(2)}`;
}

export function Surface3DTooltip({ data, type }: { data: TooltipData; type: SurfaceType }) {
  const [pos, setPos] = useState(data.position);

  useEffect(() => {
    const TW = 210, TH = 140, off = 15;
    let x = data.position.x + off;
    let y = data.position.y - off;
    if (x + TW > window.innerWidth) x = data.position.x - TW - off;
    if (y + TH > window.innerHeight) y = data.position.y - TH - off;
    if (y < 0) y = data.position.y + off;
    setPos({ x, y });
  }, [data.position.x, data.position.y]);

  const valColor =
    type === "iv" ? "#00ff88" : (data.value >= 0 ? "#00ff88" : "#ff3366");
  const valLabel = type === "iv" ? "IV" : type === "vanna" ? "Vanna" : type === "charm" ? "Charm" : "Z";
  const valText =
    type === "iv" && data.iv !== undefined
      ? `${(data.iv * 100).toFixed(2)}%`
      : fmtAbs(data.value);

  return createPortal(
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        background: "rgba(0,0,0,0.92)",
        border: "1px solid #06b6d4",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 0 25px rgba(6,182,212,0.5)",
        fontFamily: "monospace",
        fontSize: 11,
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
        zIndex: 9999,
        minWidth: 180,
        color: "#e5e7eb",
        lineHeight: 1.55,
      }}
    >
      {type === "terrain" ? (
        <>
          <div><span style={{ color: "#9ca3af" }}>{data.xLabel || "X"}: </span><span style={{ color: "#06b6d4" }}>{data.x?.toFixed(3)}</span></div>
          <div><span style={{ color: "#9ca3af" }}>{data.yLabel || "Y"}: </span><span style={{ color: "#06b6d4" }}>{data.y?.toFixed(3)}</span></div>
          <div style={{ borderTop: "1px solid #1f2937", margin: "6px 0" }} />
          <div><span style={{ color: "#9ca3af" }}>{data.zLabel || "Z"}: </span><span style={{ color: valColor, fontWeight: "bold" }}>{data.value.toFixed(3)}</span></div>
        </>
      ) : (
        <>
          {data.moneyness !== undefined && (
            <div><span style={{ color: "#9ca3af" }}>Moneyness: </span><span style={{ color: "#e5e7eb", fontWeight: "bold" }}>{data.moneyness.toFixed(1)}%</span></div>
          )}
          {data.dte !== undefined && (
            <div><span style={{ color: "#9ca3af" }}>DTE: </span><span style={{ color: "#e5e7eb" }}>{data.dte}d</span></div>
          )}
          <div><span style={{ color: "#9ca3af" }}>{valLabel}: </span><span style={{ color: valColor, fontWeight: "bold" }}>{valText}</span></div>
          <div style={{ borderTop: "1px solid #1f2937", margin: "6px 0" }} />
          {data.strike !== undefined && (
            <div><span style={{ color: "#9ca3af" }}>Strike: </span><span style={{ color: "#06b6d4" }}>${data.strike.toLocaleString()}</span></div>
          )}
          {type !== "iv" && data.value !== undefined && (
            <div><span style={{ color: "#9ca3af" }}>Value: </span><span style={{ color: valColor }}>{fmtAbs(data.value)}</span></div>
          )}
          {data.oiPct !== undefined && (
            <div><span style={{ color: "#9ca3af" }}>OI %: </span><span style={{ color: "#9ca3af" }}>{data.oiPct.toFixed(0)}%</span></div>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
