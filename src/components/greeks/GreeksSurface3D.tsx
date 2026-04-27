import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

export interface SurfacePoint {
  strike: number;
  dte: number;
  value: number; // gamma, vega, etc
}

interface Props {
  symbol: string;
  /** Grid of surface points: rows = strikes, cols = expirations */
  points: SurfacePoint[];
  metric?: "GAMMA" | "VEGA" | "DELTA" | "THETA";
}

/**
 * 3D Greek Surface (strike × dte × value) rendered as a deformed mesh.
 * Self-contained inside its own card.
 */
export function GreeksSurface3D({ symbol, points, metric: metricProp }: Props) {
  const [metric] = useState<"GAMMA" | "VEGA" | "DELTA" | "THETA">(metricProp ?? "GAMMA");

  // Build grid
  const grid = useMemo(() => buildGrid(points), [points]);

  return (
    <div className="font-mono" style={{ background: "#000", border: "1px solid #1f1f1f", borderRadius: 6 }}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1f1f1f]" style={{ background: "#0a0a0a" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-[0.2em] text-white">{metric} SURFACE 3D</span>
          <span className="text-[9px] text-muted-foreground">·</span>
          <span className="text-[10px] font-bold text-foreground">{symbol}</span>
        </div>
        <span className="text-[8px] text-muted-foreground tracking-widest">DRAG · SCROLL · ROTATE</span>
      </div>

      <div style={{ height: 300, background: "radial-gradient(circle at 50% 40%, #050a14, #000)" }}>
        {grid.strikes.length < 2 || grid.dtes.length < 2 ? (
          <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground">
            Awaiting surface data…
          </div>
        ) : (
          <Canvas camera={{ position: [3.2, 2.6, 3.6], fov: 45 }}>
            <ambientLight intensity={0.45} />
            <pointLight position={[5, 6, 5]} intensity={1.2} color="#06b6d4" />
            <pointLight position={[-5, 4, -3]} intensity={0.8} color="#a855f7" />
            <Surface grid={grid} />
            <Axes />
            <OrbitControls enablePan={false} autoRotate autoRotateSpeed={0.5} minDistance={3} maxDistance={8} />
          </Canvas>
        )}
      </div>

      <div className="flex items-center justify-between px-3 py-1 text-[8px] text-muted-foreground border-t border-[#1f1f1f]">
        <span>X: STRIKE</span>
        <span>Y: {metric}</span>
        <span>Z: DTE</span>
      </div>
    </div>
  );
}

function buildGrid(points: SurfacePoint[]) {
  const strikes = Array.from(new Set(points.map((p) => p.strike))).sort((a, b) => a - b);
  const dtes = Array.from(new Set(points.map((p) => p.dte))).sort((a, b) => a - b);
  const map = new Map<string, number>();
  points.forEach((p) => map.set(`${p.strike}-${p.dte}`, p.value));
  return { strikes, dtes, map };
}

function Surface({ grid }: { grid: ReturnType<typeof buildGrid> }) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const { strikes, dtes, map } = grid;
    const w = strikes.length;
    const h = dtes.length;
    const geo = new THREE.PlaneGeometry(3, 3, w - 1, h - 1);
    const pos = geo.attributes.position;
    const colors: number[] = [];

    let maxV = 1e-9;
    for (const v of map.values()) maxV = Math.max(maxV, Math.abs(v));

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = strikes[i];
        const d = dtes[j];
        const v = map.get(`${s}-${d}`) ?? 0;
        const idx = j * w + i;
        const norm = v / maxV;
        const y = norm * 1.2;
        pos.setZ(idx, y);
        // Colour ramp: cool (low) -> hot (high)
        const t = (norm + 1) / 2;
        const c = new THREE.Color().setHSL(0.6 - t * 0.6, 0.9, 0.4 + t * 0.2);
        colors.push(c.r, c.g, c.b);
      }
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [grid]);

  useFrame((_, dt) => {
    if (meshRef.current) meshRef.current.rotation.z += dt * 0.05;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} wireframe={false} flatShading={false} />
    </mesh>
  );
}

function Axes() {
  return (
    <group>
      <gridHelper args={[3, 12, "#1f2937", "#111827"]} position={[0, -0.01, 0]} />
    </group>
  );
}
