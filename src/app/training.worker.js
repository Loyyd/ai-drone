import { createConfig, createInitialState, createMotorOffsets } from "./config.js";
import { createSimulationEngine } from "./simulation.js";

const config = createConfig();
const state = createInitialState();
let motorOffsets = createMotorOffsets(config);
let simulation = createSimulationEngine({
  config,
  motorOffsets,
  state
});

let trainingActive = false;
let trainingLoopRunning = false;
let revision = 0;
let lastImprovementAtMs = Date.now();

function getTrainingBudgetMs() {
  return Math.min(20, Math.max(4, config.trainingSpeed * 4));
}

function applyConfigSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  Object.entries(snapshot).forEach(([key, value]) => {
    if (key === "target" && value) {
      config.target.set(value.x, value.y, value.z);
      return;
    }

    config[key] = value;
  });

  motorOffsets = createMotorOffsets(config);
  simulation = createSimulationEngine({
    config,
    motorOffsets,
    state
  });
}

function postTrainingState() {
  self.postMessage({
    type: "training-state",
    payload: {
      bestParams: state.bestParams,
      bestScore: state.bestScore,
      generation: state.generation,
      learningHistory: [...state.learningHistory],
      lastImprovementAtMs: state.lastImprovementAtMs ?? lastImprovementAtMs,
      previewCandidates: state.previewCandidates,
      revision,
      stagnation: state.stagnation
    }
  });
}

function resetLearning() {
  revision += 1;
  lastImprovementAtMs = Date.now();
  state.lastImprovementAtMs = lastImprovementAtMs;
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
  postTrainingState();
}

async function ensureTrainingLoop() {
  if (trainingLoopRunning) {
    return;
  }

  trainingLoopRunning = true;

  while (trainingActive) {
    const deadline = performance.now() + getTrainingBudgetMs();
    let generationsCompleted = 0;

    do {
      simulation.trainGeneration();
      generationsCompleted += 1;
    } while (trainingActive && performance.now() < deadline);

    if (generationsCompleted > 0) {
      postTrainingState();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  trainingLoopRunning = false;
}

self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  if (type === "init") {
    applyConfigSnapshot(payload?.config);
    return;
  }

  if (type === "reset-learning") {
    applyConfigSnapshot(payload?.config);
    resetLearning();
    return;
  }

  if (type === "update-config") {
    applyConfigSnapshot(payload?.config);
    return;
  }

  if (type === "set-training-active") {
    trainingActive = Boolean(payload?.trainingActive);

    if (trainingActive) {
      void ensureTrainingLoop();
    }
  }
});
