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

function resetVisibleDrone() {
  state.liveDrone = simulation.createDroneState({
    position: new THREE.Vector3(0, config.groundY, 0),
    orientation: simulation.makeStartOrientation(0, 0, 0)
  });
  state.motorOutputs = [0, 0, 0, 0];
  state.totalThrust = 0;
  state.reward = 0;
  state.distance = state.liveDrone.position.distanceTo(config.target);

  if (!state.dronePowered) {
    state.propellerSpin = [0, 0, 0, 0];
  }

  scene.resetTrailHistory(state.liveDrone);
}

function resetLearning() {
  state.bestParams = simulation.createSeedGenome();
  state.bestScore = simulation.scoreGenome(state.bestParams);
  state.generation = 0;
  state.stagnation = 0;
  state.learningHistory = [];
  state.previewCandidates = Array.from(
    { length: config.previewDroneCount },
    (_, index) =>
      simulation.mutateGenome(
        state.bestParams,
        config.mutationScale * (0.55 + index * 0.06),
        false
      )
  );

  resetVisibleDrone();
  scene.resetPreviewFleet({
    createDroneState: simulation.createDroneState,
    createSeedGenome: simulation.createSeedGenome,
    getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
    makeStartOrientation: simulation.makeStartOrientation,
    mutateGenome: simulation.mutateGenome
  });
  scene.updateTargetVisuals(state.liveDrone);
  syncTargetControls(ui, config);
  renderUi();
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

  renderUi();
}

function randomizeTarget() {
  const radius = 2 + Math.random() * 3.3;
  const angle = Math.random() * Math.PI * 2;
  const nextX = Math.cos(angle) * radius;
  const nextZ = Math.sin(angle) * radius;
  const nextY = 1.6 + Math.random() * 4.6;
  setTarget(nextX, nextY, nextZ, false);
}

function toggleTrainingMode() {
  if (!state.dronePowered) {
    return;
  }

  state.trainingActive = !state.trainingActive;
  renderUi();
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
      renderUi();
    },
    value: ui.values.mass,
    valueProvider: () => config.mass
  });

  bindNumericControl({
    formatter: (value) => `${value.toFixed(1)} N`,
    input: ui.inputs.maxMotorThrust,
    onInput: (value) => {
      config.maxMotorThrust = value;
      renderUi();
    },
    value: ui.values.maxMotorThrust,
    valueProvider: () => config.maxMotorThrust
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.linearDamping,
    onInput: (value) => {
      config.linearDamping = value;
      renderUi();
    },
    value: ui.values.linearDamping,
    valueProvider: () => config.linearDamping
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.angularDamping,
    onInput: (value) => {
      config.angularDamping = value;
      renderUi();
    },
    value: ui.values.angularDamping,
    valueProvider: () => config.angularDamping
  });

  bindNumericControl({
    formatter: (value) => `${value}`,
    input: ui.inputs.population,
    onInput: (value) => {
      config.population = value;
      config.previewDroneCount = Math.min(config.population, 12);
      scene.resetPreviewFleet({
        createDroneState: simulation.createDroneState,
        createSeedGenome: simulation.createSeedGenome,
        getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
        makeStartOrientation: simulation.makeStartOrientation,
        mutateGenome: simulation.mutateGenome
      });
      renderUi();
    },
    value: ui.values.population,
    valueProvider: () => config.population
  });

  bindNumericControl({
    formatter: (value) => value.toFixed(2),
    input: ui.inputs.mutationScale,
    onInput: (value) => {
      config.mutationScale = value;
      resetLearning();
    },
    value: ui.values.mutationScale,
    valueProvider: () => config.mutationScale
  });

  bindNumericControl({
    formatter: (value) => `${value}x`,
    input: ui.inputs.trainingSpeed,
    onInput: (value) => {
      config.trainingSpeed = value;
      renderUi();
    },
    value: ui.values.trainingSpeed,
    valueProvider: () => config.trainingSpeed
  });

  ui.inputs.targetX.addEventListener("input", () => {
    setTarget(Number(ui.inputs.targetX.value), config.target.y, config.target.z, false);
  });

  ui.inputs.targetY.addEventListener("input", () => {
    setTarget(config.target.x, Number(ui.inputs.targetY.value), config.target.z, false);
  });

  ui.inputs.targetZ.addEventListener("input", () => {
    setTarget(config.target.x, config.target.y, Number(ui.inputs.targetZ.value), false);
  });

  ui.toggleTraining.addEventListener("click", toggleTrainingMode);
  ui.modeSwitch.addEventListener("click", toggleTrainingMode);

  ui.gizmoToggle.addEventListener("change", () => {
    state.showTargetGizmo = ui.gizmoToggle.checked;
    renderUi();
  });

  ui.resetLearning.addEventListener("click", () => {
    resetLearning();
  });

  ui.resetDrone.addEventListener("click", () => {
    resetVisibleDrone();
    renderUi();
  });

  ui.randomTarget.addEventListener("click", () => {
    randomizeTarget();
  });

  ui.centerTarget.addEventListener("click", () => {
    setTarget(0, 4.2, 0, false);
  });

  ui.powerButton.addEventListener("click", () => {
    state.dronePowered = !state.dronePowered;

    if (state.dronePowered) {
      state.trainingActive = true;
      resetLearning();
      return;
    }

    state.trainingActive = false;
    resetVisibleDrone();
    state.propellerSpin = [0, 0, 0, 0];
    scene.resetPreviewFleet({
      createDroneState: simulation.createDroneState,
      createSeedGenome: simulation.createSeedGenome,
      getPreviewSpawnPosition: simulation.getPreviewSpawnPosition,
      makeStartOrientation: simulation.makeStartOrientation,
      mutateGenome: simulation.mutateGenome
    });
    scene.updateTargetVisuals(state.liveDrone);
    renderUi();
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

function resize() {
  scene.resize({
    applyHudPosition,
    applyPanelWidth
  });
}

function animate() {
  requestAnimationFrame(animate);

  if (state.dronePowered && state.trainingActive && !state.targetDragging) {
    for (let index = 0; index < config.trainingSpeed; index += 1) {
      simulation.trainGeneration();
    }
  }

  stepLiveSimulation(config.liveDt);
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

    state.propellerSpin[index] += 0.32 + (output / config.maxMotorThrust) * 0.9;
  });

  scene.updateLiveDroneVisual(state.liveDrone, state.propellerSpin);
  scene.updateCameraFocus(state.liveDrone);
  scene.updateTargetVisuals(state.liveDrone);

  renderUi();
  drawLearningChart(state.learningHistory);
  scene.render();
}

scene.setTargetHandlers({
  onTargetCommit: (position) => {
    setTarget(position.x, position.y, position.z, false);
  },
  onTargetPreview: () => {
    syncTargetControls(ui, config);
    renderUi();
  }
});

bindControls();
syncTargetControls(ui, config);
window.addEventListener("resize", resize);

async function start() {
  await scene.initialize();
  resetLearning();
  resize();
  scene.updateGizmoVisibility();
  renderUi();
  animate();
}

start();
