import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { ZoomIn, ZoomOut, RotateCcw, Home, Download, Maximize2 } from "lucide-react";
import type { IvPoint } from "@/lib/volatilityCalculations";

interface Props {
  surface: IvPoint[];
  spot: number;
  symbol: string;
}

// IV → color (yellow / green / blue / dark blue)
function ivToColor(iv: number): THREE.Color {
  if (iv > 0.25) return new THREE.Color("#fbbf24");
  if (iv > 0.20) return new THREE.Color("#10b981");
  if (iv > 0.15) return new THREE.Color("#3b82f6");
  return new THREE.Color("#1e40af");
}

function SurfaceMesh({ surface }: { surface: IvPoint[] }) {
  const { geo, wire } = useMemo(() => {
    const expiries = Array.from(new Set(surface.map((p) => p.expiry))).sort((a, b) => a - b);
    const strikes  = Array.from(new Set(surface.map((p) => p.strike))).sort((a, b) => a - b);
    const w = strikes.length, h = expiries.length;
    const ivMap = new Map<string, number>();
    for (const p of surface) ivMap.set(`${p.expiry}|${p.strike}`, p.iv);

    const ivs = surface.map((p) => p.iv);
    const ivMin = Math.min(...ivs), ivMax = Math.max(...ivs);

    const g = new THREE.PlaneGeometry(10, 10, w - 1, h - 1);
    const colors: number[] = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const idx = j * w + i;
        const iv = ivMap.get(`${expiries[j]}|${strikes[i]}`) ?? ivMin;
        const norm = (iv - ivMin) / Math.max(1e-6, ivMax - ivMin);
        g.attributes.position.setZ(idx, norm * 3.2);
        const c = ivToColor(iv);
        colors.push(c.r, c.g, c.b);
      }
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    g.rotateX(-Math.PI / 2);
    const wireGeo = new THREE.WireframeGeometry(g);
    return { geo: g, wire: wireGeo };
  }, [surface]);

  return (
    <group>
      <mesh geometry={geo}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.55} metalness={0.05} />
      </mesh>
      <lineSegments geometry={wire}>
        <lineBasicMaterial color="#374151" transparent opacity={0.3} />
      </lineSegments>

      {/* Axis labels */}
      <Text position={[0, -0.4, 5.6]}  fontSize={0.32} color="#6b7280">EXPIRY</Text>
      <Text position={[-5.8, -0.4, 0]} fontSize={0.32} color="#6b7280" rotation={[0, Math.PI / 2, 0]}>STRIKE</Text>
      <Text position={[-5.4, 1.7, 5.4]} fontSize={0.32} color="#6b7280">IV %</Text>
    </group>
  );
}

export function IVSurface3D({ surface, spot, symbol }: Props) {
  const [resetKey, setResetKey] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleDownload = () => {
    const canvas = document.querySelector(".iv-surface-canvas canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url; a.download = `${symbol}-iv-surface.png`; a.click();
  };

  const Btn = ({ onClick, title, children }: any) => (
    <button onClick={onClick} title={title}
      className="h-7 w-7 flex items-center justify-center rounded text-[#6b7280] hover:text-[#e5e7eb] hover:bg-white/5 transition-colors">
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
          <Btn title="Zoom in" onClick={() => {}}><ZoomIn size={14} /></Btn>
          <Btn title="Zoom out" onClick={() => {}}><ZoomOut size={14} /></Btn>
          <Btn title="Reset"   onClick={() => setResetKey((k) => k + 1)}><RotateCcw size={14} /></Btn>
          <Btn title="Home"    onClick={() => setResetKey((k) => k + 1)}><Home size={14} /></Btn>
          <Btn title="Maximize" onClick={() => {}}><Maximize2 size={14} /></Btn>
          <Btn title="Download" onClick={handleDownload}><Download size={14} /></Btn>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 rounded border border-[#1f1f1f] bg-black overflow-hidden iv-surface-canvas">
        <Canvas key={resetKey} camera={{ position: [9, 7, 9], fov: 42 }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[8, 10, 6]} intensity={0.9} />
          <directionalLight position={[-6, 4, -6]} intensity={0.3} color="#3b82f6" />
          <SurfaceMesh surface={surface} />
          <OrbitControls enablePan={false} minDistance={6} maxDistance={20} maxPolarAngle={Math.PI / 2.05} />
        </Canvas>

        {/* Color scale legend */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-stretch gap-1.5 pointer-events-none">
          <div className="w-[18px] h-[180px] rounded-sm border border-[#1f1f1f]"
            style={{ background: "linear-gradient(to bottom, #fbbf24, #10b981, #3b82f6, #1e40af)" }} />
          <div className="flex flex-col justify-between text-[10px] font-jetbrains text-[#6b7280] py-0.5">
            <span>30</span><span>25</span><span>20</span><span>15</span><span>10</span>
          </div>
        </div>
      </div>
    </div>
  );
}
