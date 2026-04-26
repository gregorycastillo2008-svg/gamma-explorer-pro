import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { IvCell } from "@/lib/gex";
import { ZoomIn, ZoomOut, Maximize2, Lock, Unlock, Box, Square } from "lucide-react";

interface Props {
  cells: IvCell[];
  spot?: number;
}

interface HoverInfo {
  strike: number;
  expiry: number;
  iv: number;
  x: number;
  y: number;
}

const SIZE_X = 10;
const SIZE_Y = 6;
const SIZE_Z = 4.5;

// Smooth jet-style ramp: deep blue → cyan → green → yellow → orange → red
function ivColor(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  // Hue 240° (blue) → 0° (red), keep saturation high, brighten in mids
  const hue = (1 - t) * 240;
  const sat = 0.95;
  const light = 0.45 + 0.15 * Math.sin(t * Math.PI);
  const c = new THREE.Color();
  c.setHSL(hue / 360, sat, light);
  return c;
}

function Surface({
  cells,
  onHover,
  view2D,
}: {
  cells: IvCell[];
  onHover: (info: HoverInfo | null) => void;
  view2D: boolean;
}) {
  const { surfaceGeo, wireGeo, ivMin, ivMax, strikes, expiries, w, h } = useMemo(() => {
    const strikes = Array.from(new Set(cells.map((c) => c.strike))).sort((a, b) => a - b);
    const expiries = Array.from(new Set(cells.map((c) => c.expiry))).sort((a, b) => a - b);
    const grid = new Map<string, number>();
    for (const c of cells) grid.set(`${c.strike}|${c.expiry}`, c.iv);
    const ivs = cells.map((c) => c.iv);
    const ivMin = Math.min(...ivs);
    const ivMax = Math.max(...ivs);
    const w = strikes.length;
    const h = expiries.length;

    const surfaceGeo = new THREE.PlaneGeometry(SIZE_X, SIZE_Y, w - 1, h - 1);
    const colors: number[] = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const iv = grid.get(`${strikes[i]}|${expiries[j]}`) ?? ivMin;
        const norm = (iv - ivMin) / Math.max(1e-6, ivMax - ivMin);
        surfaceGeo.attributes.position.setZ(idx, view2D ? 0.001 : norm * SIZE_Z);
        const c = ivColor(norm);
        colors.push(c.r, c.g, c.b);
      }
    }
    surfaceGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    surfaceGeo.computeVertexNormals();
    surfaceGeo.rotateX(-Math.PI / 2);
    const wireGeo = new THREE.WireframeGeometry(surfaceGeo);
    return { surfaceGeo, wireGeo, ivMin, ivMax, strikes, expiries, w, h };
  }, [cells, view2D]);

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // Recover grid coords from world position
    const wx = e.point.x;
    const wz = e.point.z;
    const u = (wx + SIZE_X / 2) / SIZE_X; // 0..1 across strikes
    const v = (wz + SIZE_Y / 2) / SIZE_Y; // 0..1 across expiries
    const i = Math.round(u * (w - 1));
    const j = Math.round(v * (h - 1));
    if (i < 0 || j < 0 || i >= w || j >= h) return;
    const strike = strikes[i];
    const expiry = expiries[j];
    const cell = cells.find((c) => c.strike === strike && c.expiry === expiry);
    if (!cell) return;
    onHover({
      strike, expiry, iv: cell.iv,
      x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY,
    });
  };

  const xTicks = useMemo(() => {
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = Math.min(6, strikes.length - 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -SIZE_X / 2 + t * SIZE_X;
      const strike = strikes[Math.round(t * (strikes.length - 1))];
      out.push({ pos: [x, -0.05, SIZE_Y / 2 + 0.5], text: String(strike) });
    }
    return out;
  }, [strikes]);

  const yTicks = useMemo(() => {
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = Math.min(5, expiries.length - 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const z = -SIZE_Y / 2 + t * SIZE_Y;
      const exp = expiries[Math.round(t * (expiries.length - 1))];
      out.push({ pos: [-SIZE_X / 2 - 0.5, -0.05, z], text: `${exp}D` });
    }
    return out;
  }, [expiries]);

  const zTicks = useMemo(() => {
    if (view2D) return [];
    const out: { pos: [number, number, number]; text: string }[] = [];
    const n = 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = t * SIZE_Z;
      const iv = (ivMin + t * (ivMax - ivMin)) * 100;
      out.push({ pos: [-SIZE_X / 2 - 0.5, y, SIZE_Y / 2], text: `${iv.toFixed(0)}%` });
    }
    return out;
  }, [ivMin, ivMax, view2D]);

  return (
    <group>
      <mesh
        geometry={surfaceGeo}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => onHover(null)}
      >
        <meshPhongMaterial vertexColors side={THREE.DoubleSide} shininess={45} specular="#222" />
      </mesh>
      <lineSegments geometry={wireGeo}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.18} />
      </lineSegments>

      {/* Floor grid */}
      {Array.from({ length: 7 }).map((_, i) => {
        const t = i / 6;
        const x = -SIZE_X / 2 + t * SIZE_X;
        return (
          <Line key={`gx${i}`} points={[[x, 0, -SIZE_Y / 2], [x, 0, SIZE_Y / 2]]} color="#1f2937" lineWidth={0.5} transparent opacity={0.6} />
        );
      })}
      {Array.from({ length: 7 }).map((_, i) => {
        const t = i / 6;
        const z = -SIZE_Y / 2 + t * SIZE_Y;
        return (
          <Line key={`gy${i}`} points={[[-SIZE_X / 2, 0, z], [SIZE_X / 2, 0, z]]} color="#1f2937" lineWidth={0.5} transparent opacity={0.6} />
        );
      })}

      {/* Axis labels */}
      <Text position={[0, -0.85, SIZE_Y / 2 + 1.6]} fontSize={0.34} color="#9ca3af" font={undefined}>
        STRIKE
      </Text>
      <Text position={[-SIZE_X / 2 - 1.8, -0.85, 0]} fontSize={0.34} color="#9ca3af" rotation={[0, Math.PI / 2, 0]}>
        DTE
      </Text>
      {!view2D && (
        <Text position={[-SIZE_X / 2 - 1.6, SIZE_Z / 2 + 0.2, SIZE_Y / 2 + 0.3]} fontSize={0.32} color="#9ca3af" rotation={[0, 0, Math.PI / 2]}>
          IV %
        </Text>
      )}

      {xTicks.map((t, i) => (
        <Text key={`x${i}`} position={t.pos} fontSize={0.24} color="#d1d5db">{t.text}</Text>
      ))}
      {yTicks.map((t, i) => (
        <Text key={`y${i}`} position={t.pos} fontSize={0.24} color="#d1d5db" anchorX="right">{t.text}</Text>
      ))}
      {zTicks.map((t, i) => (
        <Text key={`z${i}`} position={t.pos} fontSize={0.22} color="#d1d5db" anchorX="right">{t.text}</Text>
      ))}
    </group>
  );
}

function CameraController({
  zoomTrigger, fitTrigger, view2D,
}: { zoomTrigger: number; fitTrigger: number; view2D: boolean }) {
  const { camera } = useThree();
  useEffect(() => {
    if (zoomTrigger === 0) return;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    camera.position.addScaledVector(dir, zoomTrigger > 0 ? 1.2 : -1.2);
    camera.position.clampLength(8, 28);
  }, [zoomTrigger, camera]);
  useEffect(() => {
    if (view2D) {
      camera.position.set(0, 18, 0.001);
    } else {
      camera.position.set(11, 8, 12);
    }
    camera.lookAt(0, SIZE_Z / 2, 0);
  }, [fitTrigger, view2D, camera]);
  return null;
}

export function IvSurface3D({ cells }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [zoomTrigger, setZoomTrigger] = useState(0);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [locked, setLocked] = useState(false);
  const [view2D, setView2D] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (cells.length < 4) {
    return (
      <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm bg-[#0a0a0c] rounded-md">
        Datos insuficientes
      </div>
    );
  }

  const ivs = cells.map((c) => c.iv);
  const ivMin = Math.min(...ivs);
  const ivMax = Math.max(...ivs);

  // Build legend gradient (12 stops)
  const stops = Array.from({ length: 12 }).map((_, i) => {
    const t = 1 - i / 11; // top = high
    const c = ivColor(t);
    return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  });
  const gradient = `linear-gradient(to bottom, ${stops.join(",")})`;

  const Btn = ({ onClick, title, children }: any) => (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 flex items-center justify-center rounded bg-white/5 hover:bg-white/15 border border-white/10 text-white/80 hover:text-white transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div ref={containerRef} className="relative h-[400px] w-full rounded-md overflow-hidden bg-[#0a0a0c] border border-white/5">
      <Canvas
        camera={{ position: [11, 8, 12], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#0a0a0c"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[10, 15, 10]} intensity={0.9} />
        <directionalLight position={[-8, 6, -10]} intensity={0.35} color="#7dd3fc" />
        <Surface cells={cells} onHover={setHover} view2D={view2D} />
        <OrbitControls
          enablePan={false}
          enableRotate={!locked && !view2D}
          minDistance={8}
          maxDistance={28}
          maxPolarAngle={view2D ? 0.001 : Math.PI / 2.05}
          target={[0, view2D ? 0 : SIZE_Z / 2, 0]}
        />
        <CameraController zoomTrigger={zoomTrigger} fitTrigger={fitTrigger} view2D={view2D} />
      </Canvas>

      {/* Tooltip */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded border border-white/15 bg-black/85 backdrop-blur px-3 py-2 text-[11px] font-mono text-white shadow-xl"
          style={{ left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 600) - 180), top: Math.max(8, hover.y - 70) }}
        >
          <div className="text-[9px] uppercase tracking-wider text-white/50 mb-1">IV Surface Point</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span className="text-white/60">Strike</span><span className="text-right">${hover.strike}</span>
            <span className="text-white/60">DTE</span><span className="text-right">{hover.expiry}d</span>
            <span className="text-white/60">IV</span><span className="text-right text-[#facc15]">{(hover.iv * 100).toFixed(2)}%</span>
            <span className="text-white/60">σ Price</span><span className="text-right">{(hover.iv * Math.sqrt(hover.expiry / 365) * 100).toFixed(2)}%</span>
          </div>
        </div>
      )}

      {/* Top-right control cluster */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <Btn onClick={() => setZoomTrigger((n) => n + 1)} title="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></Btn>
        <Btn onClick={() => setZoomTrigger((n) => -n - 1)} title="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></Btn>
        <Btn onClick={() => setFitTrigger((n) => n + 1)} title="Reset view"><Maximize2 className="h-3.5 w-3.5" /></Btn>
        <Btn onClick={() => setLocked((l) => !l)} title={locked ? "Unlock rotation" : "Lock rotation"}>
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </Btn>
        <Btn onClick={() => setView2D((v) => !v)} title={view2D ? "Switch to 3D" : "Switch to 2D"}>
          {view2D ? <Box className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </Btn>
      </div>

      {/* Legend bar */}
      <div className="absolute top-2 left-2 z-10 flex items-stretch gap-1.5">
        <div
          className="w-3 h-44 rounded-sm border border-white/15"
          style={{ background: gradient }}
        />
        <div className="flex flex-col justify-between text-[9px] font-mono text-white/70 py-0.5">
          <span>{(ivMax * 100).toFixed(0)}%</span>
          <span>{((ivMin + (ivMax - ivMin) * 0.75) * 100).toFixed(0)}%</span>
          <span>{((ivMin + (ivMax - ivMin) * 0.5) * 100).toFixed(0)}%</span>
          <span>{((ivMin + (ivMax - ivMin) * 0.25) * 100).toFixed(0)}%</span>
          <span>{(ivMin * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center text-[9px] font-mono text-white/50 -rotate-90 origin-center ml-1">IV %</div>
      </div>

      {/* Bottom-left mode badge */}
      <div className="absolute bottom-2 left-2 z-10 text-[10px] font-mono text-white/40 uppercase tracking-widest">
        {view2D ? "2D PROJECTION" : "3D SURFACE"} · {locked ? "ROTATION LOCKED" : "INTERACTIVE"}
      </div>
    </div>
  );
}
