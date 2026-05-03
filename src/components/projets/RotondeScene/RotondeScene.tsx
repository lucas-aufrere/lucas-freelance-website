"use client";

import {
  Suspense,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useFrame } from "@react-three/fiber";
import { Text, useTexture } from "@react-three/drei";
import {
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Group,
  type Mesh,
  type Texture,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { findProjectBySlug, projects, type Project } from "@/data/projects";
import {
  DOLLY_DISTANCE,
  getDragMoved,
  getFocusPlaneKey,
  getFocusProgress,
  getOpenSlug,
  getProjectScroll,
  getRotation,
  openProject,
  subscribe as subscribeRotondeStore,
} from "@/components/projets/rotondeStore";
import { useRotondeControls } from "./useRotondeControls";

// -------------------------------------------------------------------
// Geometry — 3 rows × 4 angular slots. Top & bottom are offset by 30°
// from the center row and show different project permutations.
// -------------------------------------------------------------------

const SLOTS_PER_ROW = projects.length; // 8
const RADIUS = 11;
const ANGLE_STEP = (Math.PI * 2) / SLOTS_PER_ROW;
const SIDE_OFFSET_ANGLE = Math.PI / 8; // 22.5° — half-slot, true quincunx

// Main (center) row — dominant plane, labels attached.
const MAIN_PLANE_W = 8;
const MAIN_PLANE_H = 4.5; // 16:9
const MAIN_HALF_W = MAIN_PLANE_W / 2;

// Side rows — small editorial "accents".
const SIDE_PLANE_W = 3;
const SIDE_PLANE_H = 2; // close to 3:2

type RowConfig = {
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly angleOffset: number;
  readonly projectOrder: readonly number[];
  readonly isMain: boolean;
};

// Same canonical sequence on every row, but cyclically shifted so each row
// starts with a different project at slot 0. Relative order (Dexnill →
// Kengo → Jacquemus → Fyconic → …) is preserved across all rows.
const CANONICAL_ORDER: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

function cyclicShift(
  order: readonly number[],
  shift: number,
): readonly number[] {
  const n = order.length;
  return order.map((_, i) => order[(i + shift) % n] ?? 0);
}

const ROWS: readonly RowConfig[] = [
  // Top — offset +22.5°, order shifted by +3
  {
    y: 4.5,
    w: SIDE_PLANE_W,
    h: SIDE_PLANE_H,
    angleOffset: SIDE_OFFSET_ANGLE,
    projectOrder: cyclicShift(CANONICAL_ORDER, 3),
    isMain: false,
  },
  // Center — no offset, canonical order
  {
    y: 0,
    w: MAIN_PLANE_W,
    h: MAIN_PLANE_H,
    angleOffset: 0,
    projectOrder: CANONICAL_ORDER,
    isMain: true,
  },
  // Bottom — same +22.5° offset as top, order shifted by +5
  {
    y: -4.5,
    w: SIDE_PLANE_W,
    h: SIDE_PLANE_H,
    angleOffset: SIDE_OFFSET_ANGLE,
    projectOrder: cyclicShift(CANONICAL_ORDER, 5),
    isMain: false,
  },
];

// Mirror "ghost" rows above and below — pure visual depth, not clickable,
// no animations. The vertical scale is flipped so the planes look like
// reflections off a ceiling / floor mirror.
type GhostRow = {
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly angleOffset: number;
  readonly projectOrder: readonly number[];
  readonly opacity: number;
  readonly mirrorY: boolean;
};

const GHOST_ROWS: readonly GhostRow[] = [
  // Above the top row — first reflection (upside-down)
  {
    y: 9.5,
    w: SIDE_PLANE_W,
    h: SIDE_PLANE_H,
    angleOffset: 0,
    projectOrder: cyclicShift(CANONICAL_ORDER, 1),
    opacity: 0.45,
    mirrorY: true,
  },
  // Above that — second bounce (right-side-up, smaller, fainter)
  {
    y: 14,
    w: SIDE_PLANE_W * 0.85,
    h: SIDE_PLANE_H * 0.85,
    angleOffset: SIDE_OFFSET_ANGLE,
    projectOrder: cyclicShift(CANONICAL_ORDER, 6),
    opacity: 0.22,
    mirrorY: false,
  },
  // Below the bottom row — first reflection (upside-down)
  {
    y: -9.5,
    w: SIDE_PLANE_W,
    h: SIDE_PLANE_H,
    angleOffset: 0,
    projectOrder: cyclicShift(CANONICAL_ORDER, 7),
    opacity: 0.45,
    mirrorY: true,
  },
  // Below that — second bounce
  {
    y: -14,
    w: SIDE_PLANE_W * 0.85,
    h: SIDE_PLANE_H * 0.85,
    angleOffset: SIDE_OFFSET_ANGLE,
    projectOrder: cyclicShift(CANONICAL_ORDER, 2),
    opacity: 0.22,
    mirrorY: false,
  },
];

const HOVER_SCALE = 1.03;

// Scale curve as a plane leaves the camera front axis.
// At 0° (perfectly centered) → SCALE_FRONT; at 90° or beyond → SCALE_SIDE.
const SCALE_FRONT = 1;
const SCALE_SIDE = 0.6;
const SCALE_LERP = 0.12;

// Cinematic focus dolly — plane uses ease-OUT so it leads the camera.
const PLANE_END = 0.6;
function planeEaseOut(focusProgress: number): number {
  const t = Math.max(0, Math.min(1, focusProgress / PLANE_END));
  return 1 - Math.pow(1 - t, 3);
}


// -------------------------------------------------------------------
// Typography
// -------------------------------------------------------------------

const MANROPE_FONT =
  "https://cdn.jsdelivr.net/fontsource/fonts/manrope@latest/latin-500-normal.woff";
const MONO_FONT =
  "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.woff";

const INDEX_SIZE = 0.16;
const NAME_SIZE = 0.38;
const META_SIZE = 0.13;

const INDEX_Y = 3.05;
const NAME_Y = 2.45;
const META_Y = -2.45;

const COLOR_FG = "#ffffff";
const COLOR_FG_MUTED = "#888888";
const COLOR_FG_SUBTLE = "#555555";

const TOTAL_SLOTS = SLOTS_PER_ROW.toString().padStart(2, "0");

// -------------------------------------------------------------------
// Saturation via onBeforeCompile on MeshBasicMaterial — canonical three.js
// pattern to extend a built-in material with a custom per-instance uniform.
// Each plane stores its material in a module-level registry so it survives
// React 19 / StrictMode remounts.
// -------------------------------------------------------------------

type InjectedShader = WebGLProgramParametersWithUniforms;

interface MaterialWithShader extends MeshBasicMaterial {
  userData: { shader?: InjectedShader };
}

const planeMaterialRegistry = new Map<string, MaterialWithShader>();

// Ghost-material registry — opaque-less MeshBasicMaterial clones for the
// non-interactive mirror rows. Keyed by (texture, opacityBucket) so each
// rendered ghost shares its material when it shares both.
const ghostMaterialRegistry = new Map<string, MeshBasicMaterial>();

function getGhostMaterial(
  texture: Texture,
  opacity: number,
): MeshBasicMaterial {
  const key = `${texture.uuid}@${opacity.toFixed(2)}`;
  const cached = ghostMaterialRegistry.get(key);
  if (cached) return cached;
  const mat = new MeshBasicMaterial({
    map: texture,
    toneMapped: false,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  ghostMaterialRegistry.set(key, mat);
  return mat;
}

// Curved plane geometry cache — one shared geometry per (width, height)
// pair. Each plane's vertices are pushed toward the camera so the whole
// surface lies on a sphere of radius RADIUS (the cylinder inner wall).
const curvedGeometryCache = new Map<string, BufferGeometry>();

const CURVE_SEGMENTS = 16;

function getCurvedPlaneGeometry(
  width: number,
  height: number,
  radius: number,
): BufferGeometry {
  const key = `${width}x${height}@${radius}`;
  const cached = curvedGeometryCache.get(key);
  if (cached) return cached;

  const geo = new PlaneGeometry(width, height, CURVE_SEGMENTS, 1);
  const pos = geo.attributes.position;
  if (pos) {
    const arr = pos.array as Float32Array;
    const r2 = radius * radius;
    for (let i = 0; i < arr.length; i += 3) {
      const x = arr[i] ?? 0;
      const xClamped = Math.min(Math.abs(x), radius);
      const zOffset = radius - Math.sqrt(r2 - xClamped * xClamped);
      arr[i + 2] = zOffset;
    }
    pos.needsUpdate = true;
  }
  geo.computeVertexNormals();
  curvedGeometryCache.set(key, geo);
  return geo;
}

function getOrCreatePlaneMaterial(
  key: string,
  texture: Texture,
): MaterialWithShader {
  const cached = planeMaterialRegistry.get(key);
  if (cached) {
    if (cached.map !== texture) {
      cached.map = texture;
      cached.needsUpdate = true;
    }
    return cached;
  }

  const mat = new MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  }) as MaterialWithShader;

  // Force three.js to compile a *distinct* shader program for each plane.
  // Without this, two materials with identical generated source share
  // the same compiled program, and `onBeforeCompile` only runs once (for
  // the first one to render) — so only the first material ends up with
  // its `userData.shader` populated, breaking every other plane's uniform
  // updates. Keying the cache on planeKey guarantees per-plane compilation.
  mat.customProgramCacheKey = () => `plane-${key}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSaturation = { value: 1 };
    shader.uniforms.uFlatProgress = { value: 0 };

    // Vertex: flatten the curved plane by scaling its z offset toward 0
    // as uFlatProgress rises (0 = fully curved, 1 = perfectly flat).
    shader.vertexShader =
      "uniform float uFlatProgress;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        transformed.z *= 1.0 - uFlatProgress;
        `,
      );

    // Fragment: desaturate based on uSaturation.
    shader.fragmentShader =
      "uniform float uSaturation;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #include <map_fragment>
        float mapGrayLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(mapGrayLuma), diffuseColor.rgb, uSaturation);
        `,
      );
    mat.userData.shader = shader;
  };

  planeMaterialRegistry.set(key, mat);
  return mat;
}

function computeFrontness(slotAngle: number, rotation: number): number {
  // A slot is at the camera front when slotAngle - rotation = 0.
  // (Three.js Y-rotation takes a point at initial angle α to world angle
  //  α − θ after group.rotation.y = θ.)
  let delta = (slotAngle - rotation) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  const absDeg = Math.abs(delta) * (180 / Math.PI);
  return Math.max(0, Math.min(1, 1 - absDeg / 90));
}

// -------------------------------------------------------------------
// Scene root
// -------------------------------------------------------------------

export function RotondeScene(): React.ReactElement {
  const groupRef = useRef<Group>(null);
  useRotondeControls(groupRef);

  return (
    <>
      <fogExp2 attach="fog" args={["#050505", 0.035]} />
      <ambientLight intensity={0.65} />

      <group ref={groupRef}>
        <Suspense fallback={null}>
          <Rows />
        </Suspense>
      </group>

      {/*
        FocusedGallery sits OUTSIDE the rotonde rotation group — at world
        coordinates — so its slider planes don't spin with the carousel.
        It only renders when a project is open, then carries its gallery
        textures on flat planes side-by-side at the focus position.
        Horizontal scroll input from the overlay translates the group
        sideways, sliding the next plane into view.
      */}
      <Suspense fallback={null}>
        <FocusedGallery />
      </Suspense>
    </>
  );
}

// -------------------------------------------------------------------
// Rows
// -------------------------------------------------------------------

function Rows(): React.ReactElement {
  const imagePaths = useMemo(() => projects.map((p) => p.image), []);
  const raw = useTexture(imagePaths, (loaded) => {
    const arr = Array.isArray(loaded) ? loaded : [loaded];
    for (const t of arr) {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
    }
  });
  const textures = Array.isArray(raw) ? (raw as Texture[]) : [raw as Texture];

  return (
    <group>
      {ROWS.map((row, rowIdx) => (
        <group key={`row-${rowIdx}`}>
          {Array.from({ length: SLOTS_PER_ROW }).map((_, slotIdx) => {
            const projectIdx = row.projectOrder[slotIdx] ?? 0;
            const project = projects[projectIdx];
            const texture = textures[projectIdx];
            if (!project || !texture) return null;

            const angle = slotIdx * ANGLE_STEP + row.angleOffset;

            const planeKey = `${rowIdx}-${slotIdx}`;
            return (
              <ProjectPlane
                key={planeKey}
                planeKey={planeKey}
                project={project}
                texture={texture}
                slotAngle={angle}
                rowY={row.y}
                planeW={row.w}
                planeH={row.h}
                showLabels={row.isMain}
              />
            );
          })}
        </group>
      ))}

      {/* Mirror "ghost" rows — visual depth only, never interactive */}
      {GHOST_ROWS.map((row, ghostIdx) => (
        <group key={`ghost-${ghostIdx}`}>
          {Array.from({ length: SLOTS_PER_ROW }).map((_, slotIdx) => {
            const projectIdx = row.projectOrder[slotIdx] ?? 0;
            const texture = textures[projectIdx];
            if (!texture) return null;

            const angle = slotIdx * ANGLE_STEP + row.angleOffset;
            const x = Math.sin(angle) * RADIUS;
            const z = -Math.cos(angle) * RADIUS;

            return (
              <GhostPlane
                key={`g-${ghostIdx}-${slotIdx}`}
                texture={texture}
                position={[x, row.y, z]}
                rotationY={-angle}
                planeW={row.w}
                planeH={row.h}
                opacity={row.opacity}
                mirrorY={row.mirrorY}
              />
            );
          })}
        </group>
      ))}
    </group>
  );
}

// -------------------------------------------------------------------
// GhostPlane — non-interactive, no animation, optional Y flip
// -------------------------------------------------------------------

interface GhostPlaneProps {
  readonly texture: Texture;
  readonly position: [number, number, number];
  readonly rotationY: number;
  readonly planeW: number;
  readonly planeH: number;
  readonly opacity: number;
  readonly mirrorY: boolean;
}

function GhostPlane({
  texture,
  position,
  rotationY,
  planeW,
  planeH,
  opacity,
  mirrorY,
}: GhostPlaneProps): React.ReactElement {
  const material = getGhostMaterial(texture, opacity);
  const geometry = getCurvedPlaneGeometry(planeW, planeH, RADIUS);
  const scale: [number, number, number] = mirrorY ? [1, -1, 1] : [1, 1, 1];

  return (
    <mesh position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <primitive object={geometry} attach="geometry" />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// -------------------------------------------------------------------
// A single plane (with optional labels if it's the main row)
// -------------------------------------------------------------------

interface ProjectPlaneProps {
  readonly planeKey: string;
  readonly project: Project;
  readonly texture: Texture;
  readonly slotAngle: number;
  readonly rowY: number;
  readonly planeW: number;
  readonly planeH: number;
  readonly showLabels: boolean;
}

function ProjectPlane({
  planeKey,
  project,
  texture,
  slotAngle,
  rowY,
  planeW,
  planeH,
  showLabels,
}: ProjectPlaneProps): React.ReactElement {
  const meshRef = useRef<Mesh>(null);
  const slotGroupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);

  const material = getOrCreatePlaneMaterial(planeKey, texture);
  const geometry = getCurvedPlaneGeometry(planeW, planeH, RADIUS);

  useFrame((state) => {
    const frontness = computeFrontness(slotAngle, getRotation());

    const mesh = meshRef.current;
    if (mesh) {
      const baseScale = SCALE_SIDE + (SCALE_FRONT - SCALE_SIDE) * frontness;
      const hoverMul = hovered ? HOVER_SCALE : 1;
      const isFocusedNow = getFocusPlaneKey() === planeKey;
      const focusProg = getFocusProgress();
      const planeT = isFocusedNow ? planeEaseOut(focusProg) : 0;

      // Grow the focused plane up to the slider's target size as the
      // dolly progresses — at planeT = 1 the rotonde plane is the same
      // dimensions as the gallery slider planes, so the hand-off when
      // the rotonde plane hides is seamless (no size jump).
      let focusGrowth = 1;
      if (isFocusedNow && planeT > 0) {
        const camera = state.camera as { fov?: number };
        const fov = camera.fov ?? 72;
        const { w: galleryW } = computeFocusedPlaneSize(
          fov,
          state.size.width,
          state.size.height,
        );
        const focusMul = galleryW / MAIN_PLANE_W;
        focusGrowth = 1 + (focusMul - 1) * planeT;
      }

      const targetScale = baseScale * hoverMul * focusGrowth;
      if (isFocusedNow && planeT > 0.01) {
        // Apply the target directly during focus — planeT already
        // carries the easing, so a second SCALE_LERP would lag behind
        // the dolly position and miss the gallery size at planeT = 1.
        mesh.scale.set(targetScale, targetScale, targetScale);
      } else {
        const next = mesh.scale.x + (targetScale - mesh.scale.x) * SCALE_LERP;
        mesh.scale.set(next, next, next);
      }

      // Hide the rotonde plane once it's fully focused — the
      // <FocusedGallery /> sibling group takes over the visual with its
      // own slider planes carrying the gallery textures. Both are
      // sized identically at this moment so the swap is invisible.
      mesh.visible = !(isFocusedNow && focusProg >= 0.99);
    }

    // --- Slot transform, lerped toward the focus target when selected ---
    const slotGroup = slotGroupRef.current;
    if (slotGroup) {
      const isFocused = getFocusPlaneKey() === planeKey;
      const planeT = isFocused ? planeEaseOut(getFocusProgress()) : 0;

      const baseX = Math.sin(slotAngle) * RADIUS;
      const baseZ = -Math.cos(slotAngle) * RADIUS;
      const baseY = rowY;
      const baseRotY = -slotAngle;

      if (planeT > 0) {
        // Target = world (0, 0, -(R + DOLLY)) so the plane lands dead
        // ahead of the camera regardless of its slot. On portrait
        // viewports the plane is also pushed down (Y offset) so it
        // sits below the fixed mobile text panel — the FocusedGallery
        // applies the same offset, so the hand-off stays seamless.
        const θ = getRotation();
        const D = RADIUS + DOLLY_DISTANCE;
        const camera2 = state.camera as { fov?: number };
        const fovDegPP = camera2.fov ?? 72;
        const yOffset = computeFocusedPlaneYOffset(
          state.size.width,
          state.size.height,
          fovDegPP,
        );
        const targetX = Math.sin(θ) * D;
        const targetY = yOffset;
        const targetZ = -Math.cos(θ) * D;
        const targetRotY = -θ;

        slotGroup.position.x = baseX + (targetX - baseX) * planeT;
        slotGroup.position.y = baseY + (targetY - baseY) * planeT;
        slotGroup.position.z = baseZ + (targetZ - baseZ) * planeT;

        // Shortest-arc lerp for rotation to avoid spinning past π.
        let diff = targetRotY - baseRotY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        slotGroup.rotation.y = baseRotY + diff * planeT;
      } else {
        slotGroup.position.set(baseX, baseY, baseZ);
        slotGroup.rotation.y = baseRotY;
      }
    }

    // --- Shader uniforms: saturation + flatten-during-focus -----------
    const m = planeMaterialRegistry.get(planeKey);
    const shader = m?.userData.shader;
    if (shader) {
      if (shader.uniforms.uSaturation) {
        shader.uniforms.uSaturation.value = frontness;
      }
      if (shader.uniforms.uFlatProgress) {
        const flatT =
          getFocusPlaneKey() === planeKey ? getFocusProgress() : 0;
        shader.uniforms.uFlatProgress.value = flatT;
      }
    }
  });

  return (
    <group ref={slotGroupRef}>
      <mesh
        ref={meshRef}
        name={project.slug}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (getDragMoved() > 6) return;
          openProject(project.slug, planeKey, slotAngle);
        }}
      >
        <primitive object={geometry} attach="geometry" />
        <primitive object={material} attach="material" />
      </mesh>

      {showLabels ? (
        <ProjectLabels project={project} planeKey={planeKey} />
      ) : null}
    </group>
  );
}

// -------------------------------------------------------------------
// Focused gallery — horizontal slider of plain planes that takes over
// the visual once a project is fully focused.
// -------------------------------------------------------------------

// Target world width on a generous (16:9) desktop viewport. The actual
// width is recomputed each frame in useFrame so the plane stays fully
// visible on narrower viewports — never wider than 78% of the
// horizontally visible world space, and the height never taller than
// 88% of the vertically visible world space (so it always reads as
// floating in the column with margin around it).
const SLIDER_TARGET_WORLD_W = 14;
const SLIDER_FILL_W = 0.78;
const SLIDER_FILL_H = 0.88;
const SLIDER_GAP_RATIO = 0.08; // gap between slides as a fraction of plane width
const SLIDER_ASPECT = MAIN_PLANE_W / MAIN_PLANE_H; // 16:9

// Vertical offset (in world units) for the focused plane on portrait
// viewports — pushes the image down to the lower half of the viewport
// so it sits below the fixed text panel pinned at the top of mobile.
// 0 on landscape so desktop is unchanged.
function computeFocusedPlaneYOffset(
  canvasW: number,
  canvasH: number,
  fovDeg: number,
): number {
  if (canvasW >= canvasH) return 0;
  const fovRad = (fovDeg * Math.PI) / 180;
  const visibleH = 2 * RADIUS * Math.tan(fovRad / 2);
  // Shift down by ~22% of visible height — places the plane center
  // roughly at viewport Y = 72% (= bottom third of the viewport).
  return -visibleH * 0.22;
}

// Single source of truth for the focused-state plane size (in world
// units). Used by both:
//   - the rotonde ProjectPlane during the focus dolly, so its mesh
//     scales up to match the slider's target size at planeT = 1
//   - the FocusedGalleryInner each frame to lay out its slider planes
// Same formula on both sides means the hand-off (rotonde plane hide /
// gallery plane show at focusProgress ≥ 0.99) lands on identical
// dimensions — no size jump.
function computeFocusedPlaneSize(
  fovDeg: number,
  canvasW: number,
  canvasH: number,
): { w: number; h: number } {
  const fovRad = (fovDeg * Math.PI) / 180;
  const visibleH = 2 * RADIUS * Math.tan(fovRad / 2);
  const visibleW = visibleH * (canvasW / canvasH);
  let w = Math.min(SLIDER_TARGET_WORLD_W, visibleW * SLIDER_FILL_W);
  let h = w / SLIDER_ASPECT;
  if (h > visibleH * SLIDER_FILL_H) {
    h = visibleH * SLIDER_FILL_H;
    w = h * SLIDER_ASPECT;
  }
  return { w, h };
}

function getOpenSlugServerSnapshot(): string | null {
  return null;
}

// Outer wrapper that subscribes to the focused slug; its inner sibling
// (keyed by slug) is what actually loads textures + renders the slider.
// Keying on slug forces useTexture to reload per project without us
// having to pre-load every project's gallery upfront.
function FocusedGallery(): React.ReactElement | null {
  const focusedSlug = useSyncExternalStore(
    subscribeRotondeStore,
    getOpenSlug,
    getOpenSlugServerSnapshot,
  );

  if (!focusedSlug) return null;
  const project = findProjectBySlug(focusedSlug);
  if (!project) return null;

  const gallery =
    project.gallery ??
    [{ src: project.image, caption: project.description }];

  return (
    <FocusedGalleryInner
      key={project.slug}
      slug={project.slug}
      sources={gallery.map((g) => g.src)}
    />
  );
}

interface FocusedGalleryInnerProps {
  readonly slug: string;
  readonly sources: readonly string[];
}

function FocusedGalleryInner({
  slug,
  sources,
}: FocusedGalleryInnerProps): React.ReactElement {
  const groupRef = useRef<Group>(null);
  // Unit plane (1×1) — each mesh scales to (planeW, planeH) per frame
  // based on the current viewport. One shared geometry for all slides.
  const unitGeometry = useMemo(() => new PlaneGeometry(1, 1), []);

  const raw = useTexture(sources as string[], (loaded) => {
    const arr = Array.isArray(loaded) ? loaded : [loaded];
    for (const t of arr) {
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = 8;
    }
  });
  const textures = Array.isArray(raw) ? (raw as Texture[]) : [raw as Texture];

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    const focusProgress = getFocusProgress();
    group.visible = focusProgress >= 0.99;
    if (!group.visible) return;

    // Same helper used by ProjectPlane to scale the rotonde plane up
    // during the focus dolly — guarantees the slider planes here have
    // identical dimensions, so the rotonde→slider hand-off doesn't pop.
    const camera = state.camera as { fov?: number };
    const fov = camera.fov ?? 72;
    const { w: planeW, h: planeH } = computeFocusedPlaneSize(
      fov,
      state.size.width,
      state.size.height,
    );
    const pitch = planeW * (1 + SLIDER_GAP_RATIO);

    const children = group.children;
    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!child) continue;
      child.scale.set(planeW, planeH, 1);
      child.position.set(i * pitch, 0, 0);
    }

    const slideProgress = getProjectScroll() / state.size.height;
    // Match the rotonde plane's mobile-portrait Y offset so the hand-off
    // (rotonde plane hides → gallery becomes visible) lands on the
    // exact same world Y. On landscape viewports yOffset = 0, so this
    // is a no-op for desktop.
    const yOffset = computeFocusedPlaneYOffset(
      state.size.width,
      state.size.height,
      fov,
    );
    group.position.x = -slideProgress * pitch;
    group.position.y = yOffset;
  });

  return (
    <group
      ref={groupRef}
      name={`focused-gallery-${slug}`}
      position={[0, 0, -(RADIUS + DOLLY_DISTANCE)]}
    >
      {textures.map((tex, i) => (
        <mesh key={i} geometry={unitGeometry}>
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// -------------------------------------------------------------------
// Labels (main row only)
// -------------------------------------------------------------------

interface ProjectLabelsProps {
  readonly project: Project;
  readonly planeKey: string;
}

function ProjectLabels({
  project,
  planeKey,
}: ProjectLabelsProps): React.ReactElement {
  const indexLabel = `${project.index} / ${TOTAL_SLOTS}`;
  const metaLabel = `${project.year} · ${project.stack}`;
  const groupRef = useRef<Group>(null);

  // Hide the on-plane labels as soon as this plane becomes the focused
  // one. The focused plane scales up to the slider's target size, which
  // would otherwise cover the index / name / meta labels (they sit at
  // fixed Y positions outside the original 8 × 4.5 plane). The side
  // panel + the gallery counter already carry the same information
  // when a project is open, so hiding them here keeps the view clean.
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.visible = getFocusPlaneKey() !== planeKey;
  });

  return (
    <group ref={groupRef}>
      <Text
        font={MONO_FONT}
        fontSize={INDEX_SIZE}
        color={COLOR_FG_MUTED}
        anchorX="left"
        anchorY="bottom"
        letterSpacing={0.12}
        position={[-MAIN_HALF_W, INDEX_Y, 0]}
        // @ts-expect-error troika-three-text supports curveRadius at runtime; drei's TS prop list is incomplete.
        curveRadius={-RADIUS}
      >
        {indexLabel}
      </Text>

      <Text
        font={MANROPE_FONT}
        fontSize={NAME_SIZE}
        color={COLOR_FG}
        anchorX="left"
        anchorY="bottom"
        letterSpacing={-0.02}
        position={[-MAIN_HALF_W, NAME_Y, 0]}
        maxWidth={MAIN_PLANE_W * 1.1}
        // @ts-expect-error troika-three-text supports curveRadius at runtime; drei's TS prop list is incomplete.
        curveRadius={-RADIUS}
      >
        {project.name}
      </Text>

      <Text
        font={MONO_FONT}
        fontSize={META_SIZE}
        color={COLOR_FG_SUBTLE}
        anchorX="left"
        anchorY="top"
        letterSpacing={0.12}
        position={[-MAIN_HALF_W, META_Y, 0]}
        // @ts-expect-error troika-three-text supports curveRadius at runtime; drei's TS prop list is incomplete.
        curveRadius={-RADIUS}
      >
        {metaLabel.toUpperCase()}
      </Text>
    </group>
  );
}
