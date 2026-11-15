"use client";
/**
 * The three-dimensional seal — the mark, extruded in ink, turning slowly on its axis.
 *
 * Deliberately small: one extruded shape, one ring, three lights, no environment map,
 * no external asset, no post-processing. Everything is generated at runtime from the same
 * outline the flat SVG uses, so there is nothing to download beyond the code itself.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useReducedMotion } from "@/lib/motion";

/* Proof-desk props: a steel-ink seal with a highlighter rule and a red pen orbit.
   Kept mid-tone so the object reads on both paper and proof black. */
const INK = "#4B5160";
const HIGHLIGHT = "#FFE066";
const MARK = "#D92D20";

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
      // an oscillation rather than a full turn: the face must stay readable, like a
      // seal being tilted on a desk, not a coin spinning in a shop window.
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.32) * 0.38;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.24) * 0.05 - 0.04;
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
          color={INK}
          metalness={0.28}
          roughness={0.36}
          emissive="#111318"
          emissiveIntensity={0.12}
        />
      </mesh>

      {/* the rule inside the shield, as three thin raised bars */}
      {[-0.24, 0, 0.24].map((y, i) => (
        <mesh key={y} position={[0, y + 0.06, 0.11]}>
          <boxGeometry args={[i === 0 ? 0.42 : 0.3, 0.035, 0.02]} />
          <meshStandardMaterial color={HIGHLIGHT} metalness={0.1} roughness={0.55} emissive={HIGHLIGHT} emissiveIntensity={0.22} />
        </mesh>
      ))}

      {/* the red pen rule that orbits the seal */}
      <mesh ref={ring} rotation={[Math.PI / 2.35, 0, 0]}>
        <torusGeometry args={[1.32, 0.008, 8, 96]} />
        <meshStandardMaterial color={MARK} metalness={0.2} roughness={0.42} />
      </mesh>
      <mesh rotation={[Math.PI / 1.9, 0.4, 0]}>
        <torusGeometry args={[1.52, 0.005, 6, 96]} />
        <meshStandardMaterial color={HIGHLIGHT} metalness={0.15} roughness={0.5} transparent opacity={0.55} />
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
      <ambientLight intensity={1.15} color="#FFFFFF" />
      <hemisphereLight intensity={0.9} color="#FFFFFF" groundColor="#4B5160" />
      <directionalLight position={[3, 4, 5]} intensity={2.4} color="#FFFFFF" />
      <directionalLight position={[-4, -2, 2]} intensity={1.0} color="#D6DAE1" />
      <pointLight position={[0, -3, 3.5]} intensity={1.4} color="#FFE066" />
      <Shield reduced={reduced} />
    </Canvas>
  );
}
