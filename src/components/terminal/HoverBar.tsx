import { useState } from "react";

/**
 * Custom Recharts Bar shape with hover-scale animation.
 * Slightly grows the bar (1.4× thickness) and brightens on mouse over.
 *
 * Usage:
 *   <Bar dataKey="value" shape={(props: any) => <HoverBar {...props} fill={...} />} />
 */
export function HoverBar(
  props: any & { fill: string; orientation?: "vertical" | "horizontal" }
) {
  const { x, y, width, height, fill, orientation = "vertical" } = props;
  const [hover, setHover] = useState(false);

  // Scale orthogonal to bar direction (thicker on hover)
  const scale = hover ? 1.4 : 1;
  const sx = orientation === "vertical" ? scale : 1;
  const sy = orientation === "vertical" ? 1 : scale;

  // keep growth centered on the bar's own axis
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g
      transform={`translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`}
      style={{ transition: "transform 150ms ease-out, filter 150ms ease-out" }}
      filter={hover ? "brightness(1.25)" : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={2}
        ry={2}
      />
    </g>
  );
}
