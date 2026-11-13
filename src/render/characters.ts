import * as THREE from 'three';
import { BODY_TYPES } from '../content';
import type { BodyTypeSpec, BodyTypeTable, CastContent } from '../content';
import type { CourtPoint, RoleId, TeamSide } from '../sim';
import { createAnimator, MOVING_SPEED_MPS, resolveAnimState, stepAnimator } from './animation';
import type { AnimState, Animator, BodyPose } from './animation';
import { disposeObject3D } from './dispose';
import type { LabelAtlas, LabelCell } from './labelAtlas';
import { createOutlineMaterial, createToonMaterial, outlineScale } from './toon';

export interface CharacterRosterEntry {
  id: number;
  side: TeamSide;
  role: RoleId;
}

export interface CharacterPose {
  id: number;
  pos: CourtPoint;
  vel: CourtPoint;
  anim?: AnimState;
}

export interface CharacterLayer {
  readonly object: THREE.Group;
  sync(players: readonly CharacterPose[], controlledPlayerId: number | null, dtSec?: number): void;
  dispose(): void;
}

export interface BodyProportions {
  heightM: number;
  headRadius: number;
  headCenterY: number;
  hipY: number;
  legLength: number;
  legRadius: number;
  torsoHeight: number;
  torsoWidth: number;
  torsoDepth: number;
  /** Relative to hipY. */
  torsoCenterY: number;
  hipsHeight: number;
  armLength: number;
  armRadius: number;
  /** Top of the torso, relative to hipY. */
  shoulderY: number;
  leanRad: number;
}

export const SKIN_COLOR = 0xc68e6a;
// Gap 0.25 above the head + marker height 0.4 + outline margin.
export const MARKER_TOP_OFFSET_M = 0.75;
const MARKER_GAP_M = 0.25;
const MARKER_RADIUS_M = 0.22;
const MARKER_HEIGHT_M = 0.4;
const MARKER_OUTLINE_SCALE = 1.2;

// Fixed shared ratios: all variation between body types comes from the spec (content data).
export function bodyProportions(spec: BodyTypeSpec): BodyProportions {
  const headRadius = spec.headRadiusM;
  const bodyBelowHead = spec.heightM - 2 * headRadius;
  const legLength = 0.48 * bodyBelowHead;
  const torsoHeight = bodyBelowHead - legLength;
  return {
    heightM: spec.heightM,
    headRadius,
    headCenterY: spec.heightM - headRadius,
    hipY: legLength,
    legLength,
    legRadius: spec.limbRadiusM * 1.15,
    torsoHeight,
    torsoWidth: spec.shoulderWidthM,
    torsoDepth: 0.55 * spec.shoulderWidthM,
    torsoCenterY: torsoHeight / 2,
    hipsHeight: 0.25 * torsoHeight,
    armLength: 0.85 * torsoHeight,
    armRadius: spec.limbRadiusM,
    shoulderY: torsoHeight,
    leanRad: THREE.MathUtils.degToRad(spec.leanDeg),
  };
}

export function characterFitHeight(bodyTypes: BodyTypeTable): number {
  let tallest = 0;
  for (const type of BODY_TYPES) tallest = Math.max(tallest, bodyTypes[type].heightM);
  return tallest + MARKER_TOP_OFFSET_M;
}

type Triple = [number, number, number];

interface Slot {
  entry: CharacterRosterEntry;
  index: number;
  props: BodyProportions;
  jersey: THREE.Mesh;
  animator: Animator | null;
}

/**
 * How far to lower the root so the lower foot stays planted. A leg whose axis has vertical
 * component a = cos(swing) * cos(spread) has its lowest point (the tilted foot disc's rim) at
 * hip - len * a - radius * sqrt(1 - a^2); we drop by the smaller of the two legs' heights.
 */
function plantDrop(props: BodyProportions, body: BodyPose): number {
  const legLen = props.legLength - body.crouchM;
  const hipY = props.hipY - body.crouchM;
  const lowest = (swing: number, spread: number): number => {
    const a = Math.cos(swing) * Math.cos(spread);
    return hipY - legLen * a - props.legRadius * Math.sqrt(Math.max(0, 1 - a * a));
  };
  return Math.min(
    lowest(body.legRSwingRad, body.legRSpreadRad),
    lowest(body.legLSwingRad, body.legLSpreadRad),
  );
}

function createJerseyGeometry(props: BodyProportions, cell: LabelCell): THREE.BufferGeometry {
  const h = (0.6 * props.torsoWidth) / 2;
  const z = props.torsoDepth / 2 + 0.01;
  const cy = props.torsoCenterY;
  // Front quad faces +z; back quad faces -z with x mirrored so the number reads from behind.
  // prettier-ignore
  const positions = [
    -h, cy - h, z, h, cy - h, z, h, cy + h, z, -h, cy + h, z,
    h, cy - h, -z, -h, cy - h, -z, -h, cy + h, -z, h, cy + h, -z,
  ];
  const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  const quadUv = [cell.u0, cell.v0, cell.u1, cell.v0, cell.u1, cell.v1, cell.u0, cell.v1];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([...quadUv, ...quadUv], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  return geometry;
}

function createInstanced(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Hidden until sync() supplies a pose (identity would draw a 1 m part at the origin).
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) mesh.setMatrixAt(i, hidden);
  return mesh;
}

export function createCharacterLayer(opts: {
  cast: CastContent;
  roster: readonly CharacterRosterEntry[];
  labels: LabelAtlas;
}): CharacterLayer {
  const { cast, roster, labels } = opts;
  const ids = new Set<number>();
  for (const entry of roster) {
    if (ids.has(entry.id)) throw new Error(`Court Vision: duplicate character id ${entry.id}`);
    ids.add(entry.id);
  }

  const n = roster.length;
  const group = new THREE.Group();
  group.name = 'characters';

  const { material: toon, gradient } = createToonMaterial();
  const outlineMaterial = createOutlineMaterial();

  // Unit primitives; each part is scaled to size by its instance matrix.
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8); // limbs: radius 1, height 1

  const heads = createInstanced('character-heads', sphere, toon, n);
  const bodies = createInstanced('character-bodies', box, toon, n * 2);
  const limbs = createInstanced('character-limbs', cylinder, toon, n * 4);
  const headsOutline = createInstanced('character-heads-outline', sphere, outlineMaterial, n);
  const bodiesOutline = createInstanced('character-bodies-outline', box, outlineMaterial, n * 2);
  const limbsOutline = createInstanced('character-limbs-outline', cylinder, outlineMaterial, n * 4);
  group.add(heads, bodies, limbs, headsOutline, bodiesOutline, limbsOutline);

  const jerseyMaterials: Record<TeamSide, THREE.MeshBasicMaterial> = {
    offense: createLabelMaterial(labels, cast.teams.offense.colors.secondary),
    defense: createLabelMaterial(labels, cast.teams.defense.colors.secondary),
  };

  const skin = new THREE.Color(SKIN_COLOR);
  const color = new THREE.Color();
  const slots: Slot[] = [];
  const slotById = new Map<number, Slot>();
  roster.forEach((entry, index) => {
    const team = cast.teams[entry.side];
    const spec = cast.bodyTypes[cast.roles[entry.role].bodyType];
    const props = bodyProportions(spec);
    const primary = color.set(team.colors.primary).clone();
    const secondary = color.set(team.colors.secondary).clone();

    heads.setColorAt(index, skin);
    bodies.setColorAt(index * 2, primary);
    bodies.setColorAt(index * 2 + 1, secondary);
    limbs.setColorAt(index * 4, primary);
    limbs.setColorAt(index * 4 + 1, primary);
    limbs.setColorAt(index * 4 + 2, skin);
    limbs.setColorAt(index * 4 + 3, skin);

    const jersey = new THREE.Mesh(
      createJerseyGeometry(props, labels.cell(String(team.jerseyNumbers[entry.role]))),
      jerseyMaterials[entry.side],
    );
    jersey.name = `jersey-${entry.id}`;
    jersey.matrixAutoUpdate = false;
    jersey.frustumCulled = false;
    jersey.visible = false;
    group.add(jersey);

    const slot: Slot = { entry, index, props, jersey, animator: null };
    slots.push(slot);
    slotById.set(entry.id, slot);
  });

  // Controlled-player marker: a downward-pointing 4-sided cone, distinct from every body part.
  const markerGeometry = new THREE.ConeGeometry(MARKER_RADIUS_M, MARKER_HEIGHT_M, 4);
  markerGeometry.rotateX(Math.PI);
  const marker = new THREE.Mesh(
    markerGeometry,
    new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient }),
  );
  marker.name = 'controlled-marker';
  marker.visible = false;
  const markerOutline = new THREE.Mesh(markerGeometry, outlineMaterial);
  markerOutline.name = 'controlled-marker-outline';
  markerOutline.scale.setScalar(MARKER_OUTLINE_SCALE);
  marker.add(markerOutline);
  group.add(marker);

  // Scratch objects.
  const root = new THREE.Matrix4();
  const upper = new THREE.Matrix4();
  const part = new THREE.Matrix4();
  const hull = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const rot = new THREE.Matrix4();
  const size = new THREE.Vector3();
  const extentVec = new THREE.Vector3();
  const grow = new THREE.Vector3();
  const euler = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();

  // part = base * T(x, y, z) * S(size); the outline twin grows the same part by the hull factor.
  function setPart(
    mesh: THREE.InstancedMesh,
    outline: THREE.InstancedMesh,
    index: number,
    base: THREE.Matrix4,
    offset: Triple,
    dims: Triple,
    // Full extents per axis; differs from dims for radius-scaled unit spheres/cylinders.
    extent: Triple = dims,
  ): void {
    size.set(...dims);
    part.copy(base).multiply(tmp.makeTranslation(...offset)).scale(size);
    mesh.setMatrixAt(index, part);
    hull.copy(part).scale(outlineScale(extentVec.set(...extent), grow));
    outline.setMatrixAt(index, hull);
  }

  // part = base * T(hinge) * Rz(side * spread) * Rx(-swing) * T(0, -length / 2, 0) * S(r, length, r)
  function setLimb(
    mesh: THREE.InstancedMesh,
    outline: THREE.InstancedMesh,
    index: number,
    base: THREE.Matrix4,
    hinge: Triple,
    side: -1 | 1,
    swingRad: number,
    spreadRad: number,
    length: number,
    radius: number,
  ): void {
    size.set(radius, length, radius);
    part
      .copy(base)
      .multiply(tmp.makeTranslation(...hinge))
      .multiply(rot.makeRotationZ(side * spreadRad))
      .multiply(rot.makeRotationX(-swingRad))
      .multiply(tmp.makeTranslation(0, -length / 2, 0))
      .scale(size);
    mesh.setMatrixAt(index, part);
    hull.copy(part).scale(outlineScale(extentVec.set(2 * radius, length, 2 * radius), grow));
    outline.setMatrixAt(index, hull);
  }

  function sync(
    players: readonly CharacterPose[],
    controlledPlayerId: number | null,
    dtSec = 0,
  ): void {
    for (const pose of players) {
      const slot = slotById.get(pose.id);
      if (!slot) continue;
      const { entry, index, props } = slot;
      const speed = Math.hypot(pose.vel.x, pose.vel.z);
      const yaw =
        speed > MOVING_SPEED_MPS
          ? Math.atan2(pose.vel.x, pose.vel.z)
          : entry.side === 'offense'
            ? Math.PI
            : 0;

      const state = resolveAnimState(pose.anim, speed);
      slot.animator ??= createAnimator(state);
      const body = stepAnimator(slot.animator, state, speed, dtSec);

      root.compose(
        pos.set(pose.pos.x, body.jumpM - plantDrop(props, body), pose.pos.z),
        euler.setFromAxisAngle(axisY, yaw),
        one,
      );
      const hipY = props.hipY - body.crouchM;
      const legLen = props.legLength - body.crouchM;
      upper
        .copy(root)
        .multiply(tmp.makeTranslation(0, hipY, 0))
        .multiply(
          tmp.makeRotationFromQuaternion(
            euler.setFromAxisAngle(axisX, props.leanRad + body.torsoPitchRad),
          ),
        );

      const legX = 0.25 * props.torsoWidth;
      const armX = props.torsoWidth / 2 + props.armRadius;

      const headR = props.headRadius;
      const legR = props.legRadius;
      const armR = props.armRadius;
      const headDims: Triple = [headR, headR, headR];
      const torsoDims: Triple = [props.torsoWidth, props.torsoHeight, props.torsoDepth];
      const hipsDims: Triple = [props.torsoWidth * 0.95, props.hipsHeight, props.torsoDepth * 1.05];
      const l = index * 4;

      const headExt: Triple = [2 * headR, 2 * headR, 2 * headR];

      const headOff: Triple = [0, props.headCenterY - props.hipY, 0];
      setPart(heads, headsOutline, index, upper, headOff, headDims, headExt);
      setPart(bodies, bodiesOutline, index * 2, upper, [0, props.torsoCenterY, 0], torsoDims);
      setPart(bodies, bodiesOutline, index * 2 + 1, root, [0, hipY, 0], hipsDims);
      const { legRSwingRad, legRSpreadRad, legLSwingRad, legLSpreadRad } = body;
      const { armRSwingRad, armRSpreadRad, armLSwingRad, armLSpreadRad } = body;
      const sy = props.shoulderY;
      const al = props.armLength;
      const legRHinge: Triple = [-legX, hipY, 0];
      const legLHinge: Triple = [legX, hipY, 0];
      const armRHinge: Triple = [-armX, sy, 0];
      const armLHinge: Triple = [armX, sy, 0];
      const lo = limbsOutline;
      setLimb(limbs, lo, l, root, legRHinge, -1, legRSwingRad, legRSpreadRad, legLen, legR);
      setLimb(limbs, lo, l + 1, root, legLHinge, 1, legLSwingRad, legLSpreadRad, legLen, legR);
      setLimb(limbs, lo, l + 2, upper, armRHinge, -1, armRSwingRad, armRSpreadRad, al, armR);
      setLimb(limbs, lo, l + 3, upper, armLHinge, 1, armLSwingRad, armLSpreadRad, al, armR);

      slot.jersey.visible = true;
      slot.jersey.matrix.copy(upper);
      slot.jersey.matrixWorldNeedsUpdate = true;
    }
    for (const mesh of [heads, bodies, limbs, headsOutline, bodiesOutline, limbsOutline]) {
      mesh.instanceMatrix.needsUpdate = true;
    }

    const controlled =
      controlledPlayerId === null ? undefined : players.find((p) => p.id === controlledPlayerId);
    const controlledSlot = controlled ? slotById.get(controlled.id) : undefined;
    if (controlled && controlledSlot) {
      const cur = controlledSlot.animator?.current;
      const lift = cur ? cur.jumpM - cur.crouchM - plantDrop(controlledSlot.props, cur) : 0;
      marker.position.set(
        controlled.pos.x,
        controlledSlot.props.heightM + MARKER_GAP_M + MARKER_HEIGHT_M / 2 + lift,
        controlled.pos.z,
      );
      marker.visible = true;
    } else {
      marker.visible = false;
    }
  }

  return {
    object: group,
    sync,
    dispose() {
      disposeObject3D(group);
      gradient.dispose();
    },
  };
}

function createLabelMaterial(labels: LabelAtlas, color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: labels.texture,
    transparent: true,
    alphaTest: 0.4,
    color,
  });
}
