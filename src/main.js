import "./style.css";

import * as THREE from "three";

import { createConfig, createInitialState, createMotorOffsets } from "./app/config.js";
import { initializeDom } from "./app/dom.js";
import { setupLayoutInteractions } from "./app/layout.js";
import { createSceneController } from "./app/scene.js";
import { createSimulationEngine } from "./app/simulation.js";
import { bindNumericControl, createLearningChart, syncTargetControls, updateUi } from "./app/ui.js";
import { clamp } from "./app/utils.js";

const config = createConfig();
const state = createInitialState();
const motorOffsets = createMotorOffsets(config);

const { appShell, ui, viewport } = initializeDom();
const { applyHudPosition, applyPanelWidth } = setupLayoutInteractions({
  appShell,
  clamp,
  state,
  ui,
  viewport
});

const simulation = createSimulationEngine({
  config,
  motorOffsets,
  state
});
const scene = createSceneController({
  clamp,
  config,
  state,
  viewport
});
const drawLearningChart = createLearningChart(ui);
const UI_REFRESH_INTERVAL = 1000 / 12;

let lastUiRenderAt = 0;
let lastChartLength = -1;
let lastChartTail = Number.NaN;
let latestTrainingRevision = 0;
let lastFrameAt = 0;
let powerOnTimeoutId = null;
let powerTransitioning = false;
let targetRoamActive = false;
let targetRoamFrom = null;
let targetRoamTo = null;
let targetRoamLegElapsed = 0;
let targetRoamLegDuration = 0;
let lastRoamWorkerSyncAt = 0;

function resetBrainTrainingTimer(now = Date.now()) {
  state.trainingTimeAccumulatedMs = 0;
  state.trainingTimeStartedAtMs =
    state.dronePowered && state.trainingActive ? now : null;
}

function pauseBrainTrainingTimer(now = Date.now()) {
  if (!state.trainingTimeStartedAtMs) {
    return;
  }

  state.trainingTimeAccumulatedMs += now - state.trainingTimeStartedAtMs;
  state.trainingTimeStartedAtMs = null;
}

function resumeBrainTrainingTimer(now = Date.now()) {
  if (!state.dronePowered || !state.trainingActive || state.trainingTimeStartedAtMs) {
    return;
  }

  state.trainingTimeStartedAtMs = now;
}

const trainingWorker = new Worker(
  new URL("./app/training.worker.js", import.meta.url),
  { type: "module" }
);

function getConfigSnapshot() {
  return {
    angularDamping: config.angularDamping,
    ceiling: config.ceiling,
    episodeDuration: config.episodeDuration,
    gravity: config.gravity,
    groundY: config.groundY,
    linearDamping: config.linearDamping,
    liveDt: config.liveDt,
    mass: config.mass,
    maxMotorThrust: config.maxMotorThrust,
    mutationScale: config.mutationScale,
    population: config.population,
    previewDroneCount: config.previewDroneCount,
    residualMotorRange: config.residualMotorRange,
    simDt: config.simDt,
    startSpread: config.startSpread,
    target: {
      x: config.target.x,
      y: config.target.y,
      z: config.target.z
    },
    trainingSpeed: config.trainingSpeed,
    worldRadius: config.worldRadius,
    yawTorqueFactor: config.yawTorqueFactor
  };
}

function postTrainingWorker(type, payload = {}) {
  trainingWorker.postMessage({ type, payload });
}

function syncTrainingState(payload) {
  if (!payload || payload.revision < latestTrainingRevision) {
    return;
  }

  latestTrainingRevision = payload.revision;
  state.bestParams = payload.bestParams;
  state.bestScore = payload.bestScore;
  state.generation = payload.generation;
  state.learningHistory = payload.learningHistory;
  state.lastImprovementAtMs = payload.lastImprovementAtMs ?? state.lastImprovementAtMs;
  state.previewCandidates = payload.previewCandidates;
  state.stagnation = payload.stagnation;
  maybeDrawLearningChart();
}

trainingWorker.addEventListener("message", (event) => {
  if (event.data?.type !== "training-state") {
    return;
  }

  syncTrainingState(event.data.payload);
});

function renderUi() {
  updateUi({
    clamp,
    config,
    getTiltRadians: simulation.getTiltRadians,
    state,
    ui,
    updateGizmoVisibility: scene.updateGizmoVisibility,
    viewport
  });
}

function maybeRenderUi(now) {
  if (now - lastUiRenderAt < UI_REFRESH_INTERVAL) {
    return;
  }

  renderUi();
  lastUiRenderAt = now;
}

function syncUi(now = performance.now()) {
  renderUi();
  lastUiRenderAt = now;
}

function maybeDrawLearningChart(force = false) {
  const nextLength = state.learningHistory.length;
  const nextTail =
    nextLength > 0 ? state.learningHistory[nextLength - 1] : Number.NaN;

  if (
    !force &&
    nextLength === lastChartLength &&
    Object.is(nextTail, lastChartTail)
  ) {
    return;
  }

  drawLearningChart(state.learningHistory);
  lastChartLength = nextLength;
  lastChartTail = nextTail;
}

function resetVisibleDrone(overrides = {}) {
  state.liveDrone = simulation.createDroneState({
    position:
      overrides.position ??
      new THREE.Vector3(0, config.groundY, 0),
    orientation:
      overrides.orientation ??
      simulation.makeStartOrientation(0, 0, 0)
  });
  state.powerDropActive = false;
  state.motorOutputs = [0, 0, 0, 0];
  state.totalThrust = 0;
  state.reward = 0;
  state.distance = state.liveDrone.position.distanceTo(config.target);

  if (!state.dronePowered) {
    state.propellerSpin = [0, 0, 0, 0];
  }

  scene.resetTrailHistory(state.liveDrone);
}

function completePowerOn() {
  state.dronePowered = true;
  state.trainingActive = true;
  state.powerDropActive = false;
  powerTransitioning = false;
  powerOnTimeoutId = null;
  resetLearning({
    preserveCurrentPosition: state.hasPoweredOnOnce
  });
  state.hasPoweredOnOnce = true;
  postTrainingWorker("set-training-active", {
    trainingActive: true
  });
}

function startPowerOnSequence() {
  if (state.dronePowered || powerTransitioning) {
    return;
  }

  powerTransitioning = true;
  scene.playMainDroneAnimation("unfolded");
  syncUi();

  powerOnTimeoutId = window.setTimeout(() => {
    completePowerOn();
  }, 2000);
}

function resetLearning(options = {}) {
  const { preserveCurrentPosition = false } = options;
  latestTrainingRevision += 1;
  state.bestParams = null;
  state.bestScore = 0;
  state.generation = 0;
  state.stagnation = 0;
  state.learningHistory = [];
  state.lastImprovementAtMs = Date.now();
  state.previewCandidates = [];
  resetBrainTrainingTimer();

  if (preserveCurrentPosition && state.liveDrone) {
    resetVisibleDrone({
      orientation: state.liveDrone.orientation.clone(),
      position: state.liveDrone.position.clone()
    });
  } else {
    resetVisibleDrone();
  }
  scene.resetPreviewFleet({
    createDroneState: simulation.createDroneState,
    createSeedGenome: simulation.createSeedGenome,
    getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
    makeStartOrientation: simulation.makeStartOrientation,
    mutateGenome: simulation.mutateGenome
  });
  scene.updateTargetVisuals(state.liveDrone);
  syncTargetControls(ui, config);
  syncUi();
  maybeDrawLearningChart(true);
  postTrainingWorker("reset-learning", {
    config: getConfigSnapshot()
  });
}

function setTarget(nextX, nextY, nextZ, shouldReset = false) {
  config.target.set(
    clamp(nextX, -config.worldRadius, config.worldRadius),
    clamp(nextY, 1.2, config.ceiling - 0.2),
    clamp(nextZ, -config.worldRadius, config.worldRadius)
  );

  scene.updateTargetVisuals(state.liveDrone);
  syncTargetControls(ui, config);

  if (shouldReset) {
    resetLearning();
    return;
  }

  syncUi();
  postTrainingWorker("update-config", {
    config: getConfigSnapshot()
  });
}

function randomizeTarget() {
  const radius = 2 + Math.random() * 3.3;
  const angle = Math.random() * Math.PI * 2;
  const nextX = Math.cos(angle) * radius;
  const nextZ = Math.sin(angle) * radius;
  const nextY = 1.6 + Math.random() * 4.6;
  setTarget(nextX, nextY, nextZ, false);
}

function updateRoamButtonLabel() {
  if (!ui.wanderTarget) {
    return;
  }

  ui.wanderTarget.textContent = targetRoamActive ? "Stop Roam" : "Roam Target";
}

function stopTargetRoam() {
  targetRoamActive = false;
  targetRoamFrom = null;
  targetRoamTo = null;
  targetRoamLegElapsed = 0;
  targetRoamLegDuration = 0;
  updateRoamButtonLabel();
}

function createRandomTargetVector() {
  const radius = 2 + Math.random() * 3.3;
  const angle = Math.random() * Math.PI * 2;
  const nextY = 1.6 + Math.random() * 4.6;

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    nextY,
    Math.sin(angle) * radius
  );
}

function beginTargetRoamLeg() {
  targetRoamFrom = config.target.clone();
  targetRoamTo = createRandomTargetVector();
  targetRoamLegElapsed = 0;
  targetRoamLegDuration = 2.4 + Math.random() * 2.2;
}

function startTargetRoam() {
  targetRoamActive = true;
  beginTargetRoamLeg();
  updateRoamButtonLabel();
}

function updateTargetRoam(dt, now) {
  if (!targetRoamActive || !targetRoamFrom || !targetRoamTo) {
    return;
  }

  targetRoamLegElapsed += dt;
  const progress = clamp(targetRoamLegElapsed / targetRoamLegDuration, 0, 1);
  const easedProgress = progress * progress * (3 - 2 * progress);
  const nextTarget = targetRoamFrom.clone().lerp(targetRoamTo, easedProgress);

  setTarget(nextTarget.x, nextTarget.y, nextTarget.z, false);

  if (now - lastRoamWorkerSyncAt > 250) {
    postTrainingWorker("update-config", {
      config: getConfigSnapshot()
    });
    lastRoamWorkerSyncAt = now;
  }

  if (progress >= 1) {
    beginTargetRoamLeg();
  }
}

function toggleTrainingMode() {
  if (!state.dronePowered || powerTransitioning) {
    return;
  }

  state.trainingActive = !state.trainingActive;
  if (state.trainingActive) {
    resumeBrainTrainingTimer();
  } else {
    pauseBrainTrainingTimer();
  }
  syncUi();
  postTrainingWorker("set-training-active", {
    trainingActive: state.dronePowered && state.trainingActive
  });
}

function bindControls() {
  bindNumericControl({
    formatter: (value) => `${value.toFixed(1)} s`,
    input: ui.inputs.episodeDuration,
    onInput: (value) => {
      config.episodeDuration = value;
      resetLearning();
    },
    value: ui.values.episodeDuration,
    valueProvider: () => config.episodeDuration
  });

  bindNumericControl({
    formatter: (value) => `${value.toFixed(1)} m`,
    input: ui.inputs.startSpread,
    onInput: (value) => {
      config.startSpread = value;
      resetLearning();
    },
    value: ui.values.startSpread,
    valueProvider: () => config.startSpread
  });

  bindNumericControl({
    formatter: (value) => `${value.toFixed(2)} kg`,
    input: ui.inputs.mass,
    onInput: (value) => {
      config.mass = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.mass,
    valueProvider: () => config.mass
  });

  bindNumericControl({
    formatter: (value) => `${value.toFixed(1)} N`,
    input: ui.inputs.maxMotorThrust,
    onInput: (value) => {
      config.maxMotorThrust = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.maxMotorThrust,
    valueProvider: () => config.maxMotorThrust
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.linearDamping,
    onInput: (value) => {
      config.linearDamping = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.linearDamping,
    valueProvider: () => config.linearDamping
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.angularDamping,
    onInput: (value) => {
      config.angularDamping = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.angularDamping,
    valueProvider: () => config.angularDamping
  });

  bindNumericControl({
    formatter: (value) => `${value}`,
    input: ui.inputs.population,
    onInput: (value) => {
      config.population = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.population,
    valueProvider: () => config.population
  });

  bindNumericControl({
    formatter: (value) => `${value}`,
    input: ui.inputs.previewDroneCount,
    onInput: (value) => {
      config.previewDroneCount = value;
      scene.resetPreviewFleet({
        createDroneState: simulation.createDroneState,
        createSeedGenome: simulation.createSeedGenome,
        getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
        makeStartOrientation: simulation.makeStartOrientation,
        mutateGenome: simulation.mutateGenome
      });
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.previewDroneCount,
    valueProvider: () => config.previewDroneCount
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.mutationScale,
    onInput: (value) => {
      config.mutationScale = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.mutationScale,
    valueProvider: () => config.mutationScale
  });

  bindNumericControl({
    formatter: (value) => `${value}x`,
    input: ui.inputs.trainingSpeed,
    onInput: (value) => {
      config.trainingSpeed = value;
      syncUi();
      postTrainingWorker("update-config", {
        config: getConfigSnapshot()
      });
    },
    value: ui.values.trainingSpeed,
    valueProvider: () => config.trainingSpeed
  });

  ui.inputs.targetX.addEventListener("input", () => {
    stopTargetRoam();
    setTarget(Number(ui.inputs.targetX.value), config.target.y, config.target.z, false);
  });

  ui.inputs.targetY.addEventListener("input", () => {
    stopTargetRoam();
    setTarget(config.target.x, Number(ui.inputs.targetY.value), config.target.z, false);
  });

  ui.inputs.targetZ.addEventListener("input", () => {
    stopTargetRoam();
    setTarget(config.target.x, config.target.y, Number(ui.inputs.targetZ.value), false);
  });

  ui.toggleTraining.addEventListener("click", toggleTrainingMode);
  ui.modeSwitch.addEventListener("click", toggleTrainingMode);

  ui.gizmoToggle.addEventListener("change", () => {
    state.showTargetGizmo = ui.gizmoToggle.checked;
    syncUi();
  });

  ui.resetLearning.addEventListener("click", () => {
    resetLearning();
  });

  ui.resetDrone.addEventListener("click", () => {
    resetVisibleDrone();
    syncUi();
  });

  ui.randomTarget.addEventListener("click", () => {
    stopTargetRoam();
    randomizeTarget();
  });

  ui.wanderTarget.addEventListener("click", () => {
    if (targetRoamActive) {
      stopTargetRoam();
      return;
    }

    startTargetRoam();
  });

  ui.centerTarget.addEventListener("click", () => {
    stopTargetRoam();
    setTarget(0, 4.2, 0, false);
  });

  ui.powerButton.addEventListener("click", () => {
    if (!state.dronePowered) {
      startPowerOnSequence();
      return;
    }

    if (powerOnTimeoutId) {
      window.clearTimeout(powerOnTimeoutId);
      powerOnTimeoutId = null;
    }

    state.dronePowered = false;
    state.trainingActive = false;
    pauseBrainTrainingTimer();
    state.powerDropActive = true;
    state.motorOutputs = [0, 0, 0, 0];
    state.totalThrust = 0;
    state.reward = 0;
    state.propellerSpin = [0, 0, 0, 0];
    scene.playMainDroneAnimation("unfolded", { reverse: true });
    scene.resetPreviewFleet({
      createDroneState: simulation.createDroneState,
      createSeedGenome: simulation.createSeedGenome,
      getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
      makeStartOrientation: simulation.makeStartOrientation,
      mutateGenome: simulation.mutateGenome
    });
    scene.updateTargetVisuals(state.liveDrone);
    syncUi();
    postTrainingWorker("set-training-active", {
      trainingActive: false
    });
  });
}

function stepLiveSimulation(dt) {
  if (!state.dronePowered || !state.bestParams || !state.liveDrone) {
    state.motorOutputs = [0, 0, 0, 0];
    state.totalThrust = 0;
    state.reward = 0;
    return;
  }

  const snapshot = simulation.simulateDroneStep(
    state.bestParams,
    state.liveDrone,
    dt
  );

  state.reward = snapshot.reward;
  state.distance = snapshot.distance;
  state.totalThrust = snapshot.totalThrust;
  state.motorOutputs = [...snapshot.motorOutputs];

  if (snapshot.crashed || !Number.isFinite(snapshot.distance)) {
    resetVisibleDrone();
    return;
  }

  scene.sampleTrailPoint(state.liveDrone);

  if (
    state.liveDrone.position.y <= config.groundY + 0.01 &&
    snapshot.distance > config.worldRadius + 0.5
  ) {
    resetVisibleDrone();
  }
}

function stepPowerDrop(dt) {
  if (!state.powerDropActive || !state.liveDrone) {
    return;
  }

  const fallAcceleration = new THREE.Vector3(
    -state.liveDrone.velocity.x * config.linearDamping,
    -config.gravity - state.liveDrone.velocity.y * config.linearDamping,
    -state.liveDrone.velocity.z * config.linearDamping
  );

  state.liveDrone.velocity.addScaledVector(fallAcceleration, dt);
  state.liveDrone.position.addScaledVector(state.liveDrone.velocity, dt);
  state.liveDrone.angularVelocity.multiplyScalar(
    Math.max(0, 1 - config.angularDamping * dt * 0.35)
  );

  if (state.liveDrone.position.y <= config.groundY) {
    state.liveDrone.position.y = config.groundY;
    state.liveDrone.velocity.set(0, 0, 0);
    state.liveDrone.angularVelocity.set(0, 0, 0);
    state.powerDropActive = false;
  }

  state.distance = state.liveDrone.position.distanceTo(config.target);
  scene.sampleTrailPoint(state.liveDrone);
}

function resize() {
  scene.resize({
    applyHudPosition,
    applyPanelWidth
  });
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = lastFrameAt === 0 ? config.liveDt : (now - lastFrameAt) / 1000;
  lastFrameAt = now;

  updateTargetRoam(dt, now);
  stepLiveSimulation(config.liveDt);
  stepPowerDrop(config.liveDt);
  scene.stepPreviewFleet({
    createDroneState: simulation.createDroneState,
    dt: config.liveDt,
    getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
    makeStartOrientation: simulation.makeStartOrientation,
    simulateDroneStep: simulation.simulateDroneStep
  });

  state.motorOutputs.forEach((output, index) => {
    if (!state.dronePowered) {
      state.propellerSpin[index] = 0;
      return;
    }

    state.propellerSpin[index] += (output / config.maxMotorThrust) * 1.22;
  });

  scene.updateLiveDroneVisual(state.liveDrone, state.propellerSpin);
  scene.updateAnimations(dt);
  scene.updateCameraFocus(state.liveDrone);
  scene.updateTargetVisuals(state.liveDrone);

  maybeRenderUi(now);
  maybeDrawLearningChart();
  scene.render();
}

scene.setTargetHandlers({
  onTargetCommit: (position) => {
    stopTargetRoam();
    setTarget(position.x, position.y, position.z, false);
  },
  onTargetPreview: () => {
    syncTargetControls(ui, config);
    syncUi();
  }
});

bindControls();
syncTargetControls(ui, config);
window.addEventListener("resize", resize);

async function start() {
  await scene.initialize();
  postTrainingWorker("init", {
    config: getConfigSnapshot()
  });
  resetLearning();
  resize();
  scene.updateGizmoVisibility();
  syncUi();
  maybeDrawLearningChart(true);
  animate();
}

start();
