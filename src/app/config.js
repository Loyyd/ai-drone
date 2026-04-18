import * as THREE from "three";

import { DRONE_BASE_OFFSET, OUTPUT_SIZE } from "./constants.js";

export function createConfig() {
  return {
    gravity: 9.81,
    mass: 1.15,
    armLength: 0.2,
    maxMotorThrust: 8.8,
    linearDamping: 0.2,
    angularDamping: 2.0,
    yawTorqueFactor: 0.02,
    residualMotorRange: 0.55,
    episodeDuration: 10,
    startSpread: 0,
    population: 80,
    mutationScale: 0.04,
    trainingSpeed: 2,
    simDt: 1 / 60,
    liveDt: 1 / 120,
    worldRadius: 8,
    ceiling: 9.5,
    groundY: DRONE_BASE_OFFSET,
    previewDroneCount: 3,
    trailMaxPoints: 220,
    trailSampleDistance: 0.12,
    target: new THREE.Vector3(0, 4, 0)
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
    trainingTimeAccumulatedMs: 0,
    trainingTimeStartedAtMs: null,
    lastImprovementAtMs: null,
    hasPoweredOnOnce: false,
    reward: 0,
    distance: 0,
    totalThrust: 0,
    learningHistory: [],
    recentGenerationHistory: [],
    stagnation: 0,
    powerDropActive: false,
    motorOutputs: Array.from({ length: OUTPUT_SIZE }, () => 0),
    propellerSpin: Array.from({ length: OUTPUT_SIZE }, () => 0),
    targetDragging: false,
    liveDrone: null,
    previewCandidates: [],
    previewFleet: [],
    trailPoints: [],
    lastTrailPoint: null,
    showTargetGizmo: true,
    performanceMode: false,
    learningCardPosition: { left: 12, top: 12 },
    learningCardDragging: false,
    learningCardDragPointerId: null,
    learningCardDragOffset: { x: 0, y: 0 },
    hudPosition: { left: 12, top: 312 },
    hudDragging: false,
    hudDragPointerId: null,
    hudDragOffset: { x: 0, y: 0 },
    panelWidth: 396,
    panelResizing: false,
    panelResizePointerId: null
  };
}
