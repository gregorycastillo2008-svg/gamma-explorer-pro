import { useState } from "react";
import { classifyGreekIntensity, INTENSITY_CONFIGS, formatGreekValue } from "@/lib/greeks/greekClassification";
import { GreekTooltip, type GreekType } from "./GreekTooltip";

interface Props {
  value: number;
  type: GreekType;
  allValues: number[];
}

export function GreekCell({ value, type, allValues }: Props) {
  const [hover, setHover] = useState(false);
  const intensity = classifyGreekIntensity(value, allValues);
  const cfg = INTENSITY_CONFIGS[intensity];
  const valueColor = value >= 0 ? "#10b981" : value < 0 ? "#ef4444" : "#6b7280";

  return (
    <td
      className="relative px-2 py-1.5 text-center transition-colors"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ borderLeft: "1px solid #1a1a1a" }}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span style={{ color: valueColor, fontWeight: 600, fontSize: 12, fontFamily: "monospace" }}>
          {formatGreekValue(value, type)}
        </span>
        <span
          style={{
            background: cfg.gradient,
            color: cfg.textColor,
            border: cfg.border,
            boxShadow: cfg.shadow,
            fontWeight: cfg.fontWeight as any,
            padding: "1px 6px",
            borderRadius: 3,
            fontSize: 8,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            lineHeight: 1.4,
          }}
        >
          {cfg.label}
        </span>
      </div>
      {hover && <GreekTooltip type={type} value={value} intensity={intensity} />}
    </td>
  );
}
