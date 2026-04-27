import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ZoomIn, ZoomOut, RotateCcw, Home, Download, Maximize2 } from "lucide-react";
import type { IvPoint } from "@/lib/volatilityCalculations";

interface Props {
  surface: IvPoint[];
  spot: number;
  symbol: string;
}

const N = 50;
const SX = 4.4;
const SZ = 4.0;
const SY = 2.4;

// Generated peak/drop surface (mirrors uploaded HTML)
function surfaceFn(u: number, v: number): number {
  const peak = 1.8 * Math.exp(-Math.pow((u - 0.85) * 3.5, 2) - Math.pow((v - 0.8) * 3.5, 2));
  const drop = -0.9 * Math.exp(-Math.pow((u - 0.05) * 4, 2)) * (1 - v * 0.5);
  const base = 0.25 + 0.3 * u + 0.2 * v - 0.15 * Math.pow(u - 0.5, 2);
  const wave = 0.06 * Math.sin(u * Math.PI * 2.5) * Math.cos(v * Math.PI * 1.8);
  return base + peak + drop + wave;
}

// Full saturated rainbow colormap
function rainbow(t: number): THREE.Color {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, [number, number, number]][] = [
    [0.0, [0.0, 0.0, 1.0]],
    [0.15, [0.0, 0.5, 1.0]],
    [0.3, [0.0, 1.0, 1.0]],
    [0.45, [0.0, 1.0, 0.4]],
    [0.58, [0.7, 1.0, 0.0]],
    [0.7, [1.0, 1.0, 0.0]],
    [0.82, [1.0, 0.5, 0.0]],
    [0.92, [1.0, 0.0, 0.0]],
    [1.0, [1.0, 0.0, 1.0]],
  ];
  for (let k = 0; k < stops.length - 1; k++) {
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return new THREE.Color(
        c0[0] + f * (c1[0] - c0[0]),
        c0[1] + f * (c1[1] - c0[1]),
        c0[2] + f * (c1[2] - c0[2]),
      );
    }
  }
  return new THREE.Color(1, 0, 1);
}

function PeakDropSurface() {
  const { geometry, gridLines } = useMemo(() => {
    let mn = Infinity, mx = -Infinity;
    const raw: number[][] = [];
    for (let i = 0; i < N; i++) {
      raw.push([]);
      for (let j = 0; j < N; j++) {
        const v = surfaceFn(i / (N - 1), j / (N - 1));
        raw[i].push(v);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }

    const verts: number[] = [];
    const cols: number[] = [];
    const idxs: number[] = [];

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = (i / (N - 1) - 0.5) * SX;
        const z = (j / (N - 1) - 0.5) * SZ;
        const norm = (raw[i][j] - mn) / (mx - mn);
        const y = norm * SY - 0.6;
        verts.push(x, y, z);
        const c = rainbow(norm);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < N - 1; j++) {
        const a = i * N + j;
        const b = i * N + j + 1;
        const c = (i + 1) * N + j;
        const d = (i + 1) * N + j + 1;
        idxs.push(a, c, b, b, c, d);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    g.setIndex(idxs);
    g.computeVertexNormals();

    // White grid overlay lines (every 4th row/col)
    const lines: THREE.BufferGeometry[] = [];
    for (let j = 0; j < N; j += 4) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < N; i++) {
        const idx = (i * N + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      lines.push(new THREE.BufferGeometry().setFromPoints(pts));
    }
    for (let i = 0; i < N; i += 4) {
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j < N; j++) {
        const idx = (i * N + j) * 3;
        pts.push(new THREE.Vector3(verts[idx], verts[idx + 1], verts[idx + 2]));
      }
      lines.push(new THREE.BufferGeometry().setFromPoints(pts));
    }

    return { geometry: g, gridLines: lines };
  }, []);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshPhongMaterial
          vertexColors
          side={THREE.DoubleSide}
          shininess={80}
          specular={new THREE.Color(0.5, 0.5, 0.5)}
        />
      </mesh>
      {gridLines.map((g, i) => (
        <line key={i}>
          <primitive object={g} attach="geometry" />
          <lineBasicMaterial color="#ffffff" transparent opacity={0.22} />
        </line>
      ))}

      {/* Floor grid */}
      <gridHelper args={[5, 12, 0x222222, 0x1a1a1a]} position={[0, -0.65, 0]} />

      {/* Axis lines */}
      <AxisLine from={[-2.2, -0.65, -2.0]} to={[2.4, -0.65, -2.0]} />
      <AxisLine from={[-2.2, -0.65, -2.0]} to={[-2.2, 2.0, -2.0]} />
      <AxisLine from={[-2.2, -0.65, -2.0]} to={[-2.2, -0.65, 2.2]} />
    </group>
  );
}

function AxisLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const geo = useMemo(
    () => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]),
    [from, to],
  );
  return (
    <line>
      <primitive object={geo} attach="geometry" />
      <lineBasicMaterial color={0x444444} transparent opacity={0.6} />
    </line>
  );
}

interface CamCtl {
  setElev: (n: number) => void;
  setAzim: (n: number) => void;
  setDist: (n: number) => void;
  reset: () => void;
}

function CameraRig({
  elev,
  azim,
  dist,
  ctlRef,
  onChange,
}: {
  elev: number;
  azim: number;
  dist: number;
  ctlRef: React.MutableRefObject<CamCtl | null>;
  onChange: (e: number, a: number, d: number) => void;
}) {
  const { camera, gl } = useThree();
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const stateRef = useRef({ elev, azim, dist });
  stateRef.current = { elev, azim, dist };

  // expose imperative controls
  useEffect(() => {
    ctlRef.current = {
      setElev: (n) => onChange(n, stateRef.current.azim, stateRef.current.dist),
      setAzim: (n) => onChange(stateRef.current.elev, n, stateRef.current.dist),
      setDist: (n) => onChange(stateRef.current.elev, stateRef.current.azim, n),
      reset: () => onChange(32, 220, 7.5),
    };
  }, [ctlRef, onChange]);

  useEffect(() => {
    const el = (elev * Math.PI) / 180;
    const az = (azim * Math.PI) / 180;
    camera.position.set(
      dist * Math.cos(el) * Math.sin(az),
      dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(0, 0.3, 0);
  }, [elev, azim, dist, camera]);

  // mouse drag + wheel
  useEffect(() => {
    const dom = gl.domElement;
    const md = (e: MouseEvent) => {
      dragRef.current.active = true;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
    };
    const mu = () => { dragRef.current.active = false; };
    const mm = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      dragRef.current.x = e.clientX;
      dragRef.current.y = e.clientY;
      const s = stateRef.current;
      onChange(
        Math.max(5, Math.min(80, s.elev + dy * 0.35)),
        s.azim - dx * 0.45,
        s.dist,
      );
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      onChange(s.elev, s.azim, Math.max(3.5, Math.min(15, s.dist + e.deltaY * 0.012)));
    };
    dom.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    window.addEventListener("mousemove", mm);
    dom.addEventListener("wheel", wh, { passive: false });
    return () => {
      dom.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("mousemove", mm);
      dom.removeEventListener("wheel", wh);
    };
  }, [gl, onChange]);

  return null;
}

export function IVSurface3D({ surface: _surface, spot, symbol }: Props) {
  const [elev, setElev] = useState(32);
  const [azim, setAzim] = useState(220);
  const [dist, setDist] = useState(7.5);
  const ctlRef = useRef<CamCtl | null>(null);

  const apply = (e: number, a: number, d: number) => {
    setElev(e);
    setAzim(((Math.round(a) % 360) + 360) % 360);
    setDist(d);
  };

  const handleDownload = () => {
    const canvas = document.querySelector(".iv-surface-canvas canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol}-iv-surface.png`;
    a.click();
  };

  const Btn = ({ onClick, title, children }: any) => (
    <button
      onClick={onClick}
      title={title}
      className="h-7 w-7 flex items-center justify-center rounded text-[#6b7280] hover:text-[#e5e7eb] hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  );

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[12px] uppercase tracking-[0.2em] text-[#9ca3af] font-jetbrains">IV SURFACE</span>
          <span className="text-[14px] font-jetbrains text-[#e5e7eb]">
            {symbol} <span className="text-[#6b7280]">AT*</span> SPOT <span className="text-[#fbbf24]">${spot.toFixed(2)}</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Btn title="Zoom in" onClick={() => apply(elev, azim, Math.max(3.5, dist - 0.6))}><ZoomIn size={14} /></Btn>
          <Btn title="Zoom out" onClick={() => apply(elev, azim, Math.min(15, dist + 0.6))}><ZoomOut size={14} /></Btn>
          <Btn title="Reset" onClick={() => ctlRef.current?.reset()}><RotateCcw size={14} /></Btn>
          <Btn title="Home" onClick={() => ctlRef.current?.reset()}><Home size={14} /></Btn>
          <Btn title="Maximize" onClick={() => {}}><Maximize2 size={14} /></Btn>
          <Btn title="Download" onClick={handleDownload}><Download size={14} /></Btn>
        </div>
      </div>

      <div
        className="relative flex-1 min-h-0 rounded border border-[#1f1f1f] overflow-hidden iv-surface-canvas"
        style={{ background: "#0a0a0a" }}
      >
        <Canvas
          camera={{ fov: 44, near: 0.1, far: 1000 }}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          onCreated={({ scene }) => {
            scene.fog = new THREE.FogExp2(0x0a0a0a, 0.055);
            scene.background = new THREE.Color(0x0a0a0a);
          }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[6, 14, 6]} intensity={1.1} />
          <directionalLight position={[-6, 4, -4]} intensity={0.5} color={0x4488ff} />
          <directionalLight position={[8, 2, 0]} intensity={0.3} color={0xff4400} />
          <PeakDropSurface />
          <CameraRig elev={elev} azim={azim} dist={dist} ctlRef={ctlRef} onChange={apply} />
        </Canvas>

        {/* Hint + sliders */}
        <div className="absolute bottom-2 left-0 right-0 flex flex-wrap items-center justify-center gap-4 px-3 text-[11px] font-mono pointer-events-none">
          <span className="text-[#666]">🖱 drag: rotate | scroll: zoom</span>
          <label className="text-[#777] flex items-center gap-1 pointer-events-auto">
            Elev
            <input
              type="range" min={5} max={80} value={Math.round(elev)}
              onChange={(e) => apply(+e.target.value, azim, dist)}
              className="w-20 accent-cyan-500"
            />
            <span className="text-[#aaa] w-9">{Math.round(elev)}°</span>
          </label>
          <label className="text-[#777] flex items-center gap-1 pointer-events-auto">
            Az
            <input
              type="range" min={0} max={360} value={Math.round(azim)}
              onChange={(e) => apply(elev, +e.target.value, dist)}
              className="w-20 accent-cyan-500"
            />
            <span className="text-[#aaa] w-10">{Math.round(azim)}°</span>
          </label>
        </div>

        {/* Rainbow colorbar */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none">
          <span className="text-[9px] font-mono text-[#555]">High</span>
          <div
            className="w-[14px] h-[200px] rounded border border-[#333]"
            style={{
              background:
                "linear-gradient(to top, #0000ff, #0088ff, #00ffff, #00ff88, #aaff00, #ffff00, #ff8800, #ff0000, #ff00ff)",
            }}
          />
          <span className="text-[9px] font-mono text-[#555]">Low</span>
        </div>
      </div>
    </div>
  );
}
