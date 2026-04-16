import * as THREE from "three";

import { DRONE_BASE_OFFSET, OUTPUT_SIZE } from "./constants.js";

export function createConfig() {
  return {
    gravity: 9.81,
    mass: 1.15,
    armLength: 1.08,
    maxMotorThrust: 8.8,
    linearDamping: 0.14,
    angularDamping: 1.65,
    yawTorqueFactor: 0.02,
    residualMotorRange: 1.35,
    episodeDuration: 8,
    startSpread: 2.1,
    population: 5,
    mutationScale: 0.1,
    trainingSpeed: 2,
    simDt: 1 / 24,
    liveDt: 1 / 60,
    worldRadius: 8,
    ceiling: 9.5,
    groundY: DRONE_BASE_OFFSET,
    previewDroneCount: 5,
    trailMaxPoints: 220,
    trailSampleDistance: 0.12,
    target: new THREE.Vector3(2.4, 4.2, -2.2)
  };
}

export function createMotorOffsets(config) {
  return [
    new THREE.Vector3(-config.armLength, 0, config.armLength),
    new THREE.Vector3(config.armLength, 0, config.armLength),
    new THREE.Vector3(-config.armLength, 0, -config.armLength),
    new THREE.Vector3(config.armLength, 0, -config.armLength)
  ];
}

export function createInitialState() {
  return {
    dronePowered: false,
    trainingActive: false,
    generation: 0,
    bestScore: Number.NEGATIVE_INFINITY,
    bestParams: null,
    reward: 0,
    distance: 0,
    totalThrust: 0,
    learningHistory: [],
    stagnation: 0,
    motorOutputs: Array.from({ length: OUTPUT_SIZE }, () => 0),
    propellerSpin: Array.from({ length: OUTPUT_SIZE }, () => 0),
    targetDragging: false,
    liveDrone: null,
    previewCandidates: [],
    previewFleet: [],
    trailPoints: [],
    lastTrailPoint: null,
    showTargetGizmo: true,
    hudPosition: { left: 12, top: 12 },
    hudDragging: false,
    hudDragPointerId: null,
    hudDragOffset: { x: 0, y: 0 },
    panelWidth: 376,
    panelResizing: false,
    panelResizePointerId: null
  };
}
