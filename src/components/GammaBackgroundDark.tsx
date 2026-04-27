import { useEffect, useRef } from "react";

// Dark gamma background with vivid green/red bars for the Auth screen
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

      // Zero line
      ctx.strokeStyle = "rgba(255,215,0,0.18)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
      ctx.setLineDash([]);

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

        const grad = ctx.createLinearGradient(0, top, 0, top + barH);
        if (positive) {
          // Vivid neon green
          grad.addColorStop(0, "rgba(0,255,120,0.95)");
          grad.addColorStop(1, "rgba(0,200,90,0.15)");
        } else {
          // Vivid neon red
          grad.addColorStop(0, "rgba(255,40,60,0.15)");
          grad.addColorStop(1, "rgba(255,40,60,0.95)");
        }
        ctx.fillStyle = grad;

        // Glow
        ctx.shadowBlur = 12;
        ctx.shadowColor = positive ? "rgba(0,255,120,0.6)" : "rgba(255,40,60,0.6)";

        const radius = Math.min(4, barW / 3);
        roundRect(ctx, x, top, barW - 4, Math.max(barH, 1), radius);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Net curve in gold
      ctx.beginPath();
      for (let i = 0; i < BARS; i++) {
        const x = i * barW + barW / 2;
        const y = midY - values[i] * maxBar;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(255,215,0,0.65)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(255,215,0,0.6)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Spot dot
      const spotIdx = Math.floor(BARS / 2);
      const sx = spotIdx * barW + barW / 2;
      const sy = midY - values[spotIdx] * maxBar;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 40);
      glow.addColorStop(0, "rgba(255,215,0,0.8)");
      glow.addColorStop(1, "rgba(255,215,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 40, sy - 40, 80, 80);
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd700";
      ctx.fill();

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
