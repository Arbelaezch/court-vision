import * as THREE from 'three';
import {
  BASELINE_Z,
  CENTER_CIRCLE_RADIUS,
  COURT_LINE_WIDTH,
  FREE_THROW_CIRCLE_RADIUS,
  FREE_THROW_LINE_FROM_BASELINE,
  FREE_THROW_LINE_Z,
  HALF_COURT_DEPTH,
  HALF_COURT_LINE_Z,
  HALF_COURT_WIDTH,
  KEY_WIDTH,
  RIM_CENTER,
  SIDELINE_X,
  THREE_POINT_CORNER_END_Z,
  THREE_POINT_CORNER_X,
  THREE_POINT_RADIUS,
} from '../sim';

const LINE_Y = 0.01;
const PAINT_Y = 0.005;
const RING_SEGMENTS = 64;

export function createCourtMarkings(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'court-markings';

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const paintMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a6ea5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const flat = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    cx: number,
    cz: number,
    y: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, y, cz);
    return mesh;
  };

  const strip = (name: string, cx: number, cz: number, sizeX: number, sizeZ: number): THREE.Mesh =>
    flat(name, new THREE.PlaneGeometry(sizeX, sizeZ), lineMaterial, cx, cz, LINE_Y);

  const ring = (
    name: string,
    cx: number,
    cz: number,
    radius: number,
    thetaStart = 0,
    thetaLength = Math.PI * 2,
  ): THREE.Mesh =>
    flat(
      name,
      new THREE.RingGeometry(
        radius - COURT_LINE_WIDTH / 2,
        radius + COURT_LINE_WIDTH / 2,
        RING_SEGMENTS,
        1,
        thetaStart,
        thetaLength,
      ),
      lineMaterial,
      cx,
      cz,
      LINE_Y,
    );

  const laneLength = FREE_THROW_LINE_Z - BASELINE_Z;
  const laneCenterZ = (BASELINE_Z + FREE_THROW_LINE_Z) / 2;
  const cornerLength = THREE_POINT_CORNER_END_Z - BASELINE_Z;
  const cornerCenterZ = (BASELINE_Z + THREE_POINT_CORNER_END_Z) / 2;
  const alpha = Math.asin((THREE_POINT_CORNER_END_Z - RIM_CENTER.z) / THREE_POINT_RADIUS);

  group.add(
    flat(
      'key-paint',
      new THREE.PlaneGeometry(KEY_WIDTH, FREE_THROW_LINE_FROM_BASELINE),
      paintMaterial,
      0,
      laneCenterZ,
      PAINT_Y,
    ),
    strip('baseline', 0, BASELINE_Z, HALF_COURT_WIDTH, COURT_LINE_WIDTH),
    strip('sideline-left', -SIDELINE_X, 0, COURT_LINE_WIDTH, HALF_COURT_DEPTH),
    strip('sideline-right', SIDELINE_X, 0, COURT_LINE_WIDTH, HALF_COURT_DEPTH),
    strip('half-court-line', 0, HALF_COURT_LINE_Z, HALF_COURT_WIDTH, COURT_LINE_WIDTH),
    strip('lane-line-left', -KEY_WIDTH / 2, laneCenterZ, COURT_LINE_WIDTH, laneLength),
    strip('lane-line-right', KEY_WIDTH / 2, laneCenterZ, COURT_LINE_WIDTH, laneLength),
    strip('free-throw-line', 0, FREE_THROW_LINE_Z, KEY_WIDTH, COURT_LINE_WIDTH),
    ring('free-throw-circle', 0, FREE_THROW_LINE_Z, FREE_THROW_CIRCLE_RADIUS),
    strip(
      'three-point-corner-left',
      -THREE_POINT_CORNER_X,
      cornerCenterZ,
      COURT_LINE_WIDTH,
      cornerLength,
    ),
    strip(
      'three-point-corner-right',
      THREE_POINT_CORNER_X,
      cornerCenterZ,
      COURT_LINE_WIDTH,
      cornerLength,
    ),
    ring(
      'three-point-arc',
      RIM_CENTER.x,
      RIM_CENTER.z,
      THREE_POINT_RADIUS,
      Math.PI + alpha,
      Math.PI - 2 * alpha,
    ),
    ring('center-circle', 0, HALF_COURT_LINE_Z, CENTER_CIRCLE_RADIUS, 0, Math.PI),
  );

  return group;
}
