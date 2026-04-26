import { useEffect, useRef } from "react";

// Animated gamma exposure background: bars rising/falling like a live GEX chart
export function GammaBackground() {
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

    const BARS = 60;
    // Each bar has a phase + amplitude so motion looks organic
    const phases = Array.from({ length: BARS }, (_, i) => ({
      phase: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.006,
      amp: 0.5 + Math.random() * 0.5,
    }));

    let t = 0;
    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, w, h);

      // Soft gradient backdrop
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, "hsl(217, 91%, 96%)");
      bg.addColorStop(1, "hsl(210, 40%, 98%)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "hsla(221, 83%, 53%, 0.06)";
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      const midY = h / 2;
      const barW = w / BARS;
      const maxBar = h * 0.38;

      // Zero line
      ctx.strokeStyle = "hsla(222, 47%, 11%, 0.15)";
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();
      ctx.setLineDash([]);

      // Bars (GEX per strike)
      const values: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const p = phases[i];
        // Bell curve weighting: bigger near center (ATM)
        const center = (i - BARS / 2) / (BARS / 2);
        const bell = Math.exp(-center * center * 2.5);
        const wave =
          Math.sin(t * p.speed + p.phase) * 0.6 +
          Math.sin(t * p.speed * 0.4 + p.phase * 1.3) * 0.4;
        // Calls positive on right of center, puts negative on left, with noise
        const bias = center;
        const v = (bias * 0.7 + wave * 0.5) * bell * p.amp;
        values.push(v);

        const barH = v * maxBar;
        const x = i * barW + 2;
        const isPos = barH < 0; // up in canvas = negative y
        // Wait — bar going up visually = positive value; barH positive = downward.
        // Use sign of v explicitly:
        const positive = v >= 0;
        const top = positive ? midY - Math.abs(barH) : midY;
        const height = Math.abs(barH);

        const grad = ctx.createLinearGradient(0, top, 0, top + height);
        if (positive) {
          grad.addColorStop(0, "hsla(142, 71%, 45%, 0.85)");
          grad.addColorStop(1, "hsla(142, 71%, 45%, 0.25)");
        } else {
          grad.addColorStop(0, "hsla(0, 84%, 60%, 0.25)");
          grad.addColorStop(1, "hsla(0, 84%, 60%, 0.85)");
        }
        ctx.fillStyle = grad;
        const radius = Math.min(4, barW / 3);
        roundRect(ctx, x, top, barW - 4, Math.max(height, 1), radius);
        ctx.fill();
      }

      // Smooth net curve over bars
      ctx.beginPath();
      for (let i = 0; i < BARS; i++) {
        const x = i * barW + barW / 2;
        const y = midY - values[i] * maxBar;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "hsla(221, 83%, 53%, 0.7)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glow dot on the curve at "spot"
      const spotIdx = Math.floor(BARS / 2);
      const sx = spotIdx * barW + barW / 2;
      const sy = midY - values[spotIdx] * maxBar;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
      glow.addColorStop(0, "hsla(221, 83%, 53%, 0.6)");
      glow.addColorStop(1, "hsla(221, 83%, 53%, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 30, sy - 30, 60, 60);
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "hsl(221, 83%, 53%)";
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
      className="absolute inset-0 w-full h-full"
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
