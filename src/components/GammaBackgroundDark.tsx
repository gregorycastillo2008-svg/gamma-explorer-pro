import { useEffect, useRef } from "react";

// Dark gamma background with heat-gradient bars (purple→yellow→red) for the Auth screen
export function GammaBackgroundDark() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const BARS = 70;
    const phases = Array.from({ length: BARS }, () => ({
      phase: Math.random() * Math.PI * 2,
      speed: 0.005 + Math.random() * 0.008,
      amp: 0.55 + Math.random() * 0.55,
    }));

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // Pure black backdrop
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);

      // Grid removed — pure black background only

      const midY = h / 2;
      const barW = w / BARS;
      const maxBar = h * 0.85; // much taller bars

      // Zero line removed for cleaner background

      const values: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const p = phases[i];
        const center = (i - BARS / 2) / (BARS / 2);
        const bell = Math.exp(-center * center * 2.2);
        const wave =
          Math.sin(t * p.speed + p.phase) * 0.6 +
          Math.sin(t * p.speed * 0.4 + p.phase * 1.3) * 0.4;
        const bias = center;
        const v = (bias * 0.7 + wave * 0.55) * bell * p.amp;
        values.push(v);

        const positive = v >= 0;
        const barH = Math.abs(v * maxBar);
        const x = i * barW + 2;
        const top = positive ? midY - barH : midY;

        // Heat gradient: dark purple (base) → violet → yellow → orange → red (tip)
        const grad = ctx.createLinearGradient(0, top, 0, top + barH);
        if (positive) {
          grad.addColorStop(0,    "rgba(255,0,0,0.95)");
          grad.addColorStop(0.18, "rgba(255,68,0,0.92)");
          grad.addColorStop(0.42, "rgba(255,208,0,0.88)");
          grad.addColorStop(0.66, "rgba(123,0,212,0.75)");
          grad.addColorStop(1,    "rgba(26,0,53,0.20)");
        } else {
          grad.addColorStop(0,    "rgba(26,0,53,0.20)");
          grad.addColorStop(0.34, "rgba(123,0,212,0.75)");
          grad.addColorStop(0.58, "rgba(255,208,0,0.88)");
          grad.addColorStop(0.82, "rgba(255,68,0,0.92)");
          grad.addColorStop(1,    "rgba(255,0,0,0.95)");
        }
        ctx.fillStyle = grad;

        // Glow — red-hot at tips
        ctx.shadowBlur = 14;
        ctx.shadowColor = Math.abs(v) > 0.5 ? "rgba(255,40,0,0.7)" : "rgba(140,0,210,0.5)";

        const radius = Math.min(4, barW / 3);
        roundRect(ctx, x, top, barW - 4, Math.max(barH, 1), radius);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Net curve and spot dot removed (no yellow line)


      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
