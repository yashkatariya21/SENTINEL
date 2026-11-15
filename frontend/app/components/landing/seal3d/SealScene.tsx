"use client";
/**
 * The three-dimensional seal — the crest, extruded in gold, turning slowly on its axis.
 *
 * Deliberately small: one extruded shape, one ring, three lights, no environment map,
 * no external asset, no post-processing. Everything is generated at runtime from the same
 * outline the flat SVG uses, so there is nothing to download beyond the code itself.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/motion";

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8D48B";
const NAVY = "#0B1437";

/** The crest outline, in the same coordinates as the flat SVG, scaled to scene units. */
function useShieldGeometry() {
  return useMemo(() => {
    const s = 0.021; // 100 svg units ≈ 2.1 scene units
    const shape = new THREE.Shape();
    shape.moveTo(0, 66 * s);
    shape.lineTo(50 * s, 50 * s);
    shape.lineTo(50 * s, 8 * s);
    shape.bezierCurveTo(50 * s, -26 * s, 28 * s, -48 * s, 0, -60 * s);
    shape.bezierCurveTo(-28 * s, -48 * s, -50 * s, -26 * s, -50 * s, 8 * s);
    shape.lineTo(-50 * s, 50 * s);
    shape.closePath();

    const outer = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSize: 0.022,
      bevelThickness: 0.022,
      bevelSegments: 3,
      curveSegments: 24,
    });
    outer.center();
    return outer;
  }, []);
}

function Shield({ reduced }: { reduced: boolean }) {
  const geometry = useShieldGeometry();
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (!reduced) {
      group.current.rotation.y += delta * 0.28;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.06 - 0.05;
    }
    if (ring.current && !reduced) {
      ring.current.rotation.z -= delta * 0.16;
    }
  });

  return (
    <group ref={group} scale={0.92}>
      <mesh geometry={geometry} castShadow>
        {/* metalness stays low on purpose: a metallic material with no environment map
            renders as a dark silhouette, and this scene must not fetch an HDR file. */}
        <meshStandardMaterial
          color={GOLD}
          metalness={0.35}
          roughness={0.32}
          emissive={GOLD_LIGHT}
          emissiveIntensity={0.16}
        />
      </mesh>

      {/* the rule inside the shield, as three thin raised bars */}
      {[-0.24, 0, 0.24].map((y, i) => (
        <mesh key={y} position={[0, y + 0.06, 0.11]}>
          <boxGeometry args={[i === 0 ? 0.42 : 0.3, 0.035, 0.02]} />
          <meshStandardMaterial color={GOLD_LIGHT} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* the gold rule that orbits the crest */}
      <mesh ref={ring} rotation={[Math.PI / 2.35, 0, 0]}>
        <torusGeometry args={[1.32, 0.008, 8, 96]} />
        <meshStandardMaterial color={GOLD_LIGHT} metalness={0.85} roughness={0.3} />
      </mesh>
      <mesh rotation={[Math.PI / 1.9, 0.4, 0]}>
        <torusGeometry args={[1.52, 0.005, 6, 96]} />
        <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.45} transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

export default function SealScene({ onReady }: { onReady: () => void }) {
  const reduced = useReducedMotion();

  // Tell the stage the canvas has actually painted, so the flat seal can step aside.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => onReady());
    return () => window.cancelAnimationFrame(id);
  }, [onReady]);

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 4.9], fov: 38 }}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      style={{ pointerEvents: "none" }}
    >
      <ambientLight intensity={1.1} color="#FBF7EE" />
      <hemisphereLight intensity={0.9} color="#FFF6DC" groundColor="#3D2468" />
      <directionalLight position={[3, 4, 5]} intensity={2.6} color="#FFF6DC" />
      <directionalLight position={[-4, -2, 2]} intensity={1.1} color="#C9D2F5" />
      <pointLight position={[0, -3, 3.5]} intensity={1.6} color="#E8D48B" />
      <Shield reduced={reduced} />
    </Canvas>
  );
}
