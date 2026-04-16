import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import powerButtonImage from "./assets/power-button.png";
import propellerImage from "./assets/propeller.png";
import axisImage from "./assets/axis.png";
import droneImage from "../drone.png";

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DRONE_BASE_OFFSET = 0.42;
const INPUT_SIZE = 12;
const HIDDEN_SIZE = 12;
const OUTPUT_SIZE = 4;
const GENOME_SIZE = INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE + HIDDEN_SIZE * OUTPUT_SIZE + OUTPUT_SIZE;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sigmoid = (value) => 1 / (1 + Math.exp(-value));

const app = document.querySelector("#app");
const favicon = document.querySelector("link[rel='icon']") ?? document.createElement("link");

favicon.rel = "icon";
favicon.type = "image/png";
favicon.href = droneImage;
document.head.appendChild(favicon);

function tintImageToAccent(imageUrl, color) {
  const image = new Image();
  image.crossOrigin = "anonymous";

  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.drawImage(image, 0, 0);
    context.globalCompositeOperation = "source-in";
    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    favicon.href = canvas.toDataURL("image/png");
  };

  image.src = imageUrl;
}

app.innerHTML = `
  <div class="app-shell">
    <section class="viewport">
      <button
        class="power-button"
        id="power-button"
        type="button"
        aria-pressed="false"
        style="--power-button-image: url('${powerButtonImage}')"
      >
        <span class="power-button-image" aria-hidden="true"></span>
      </button>

      <button class="mode-switch" id="mode-switch" type="button" aria-pressed="true">
        Training Mode
      </button>

      <label class="gizmo-toggle" for="gizmo-toggle" style="--axis-toggle-image: url('${axisImage}')">
        <input class="gizmo-toggle-checkbox" id="gizmo-toggle" type="checkbox" checked />
        <span class="gizmo-toggle-icon" aria-hidden="true"></span>
      </label>

      <div class="overlay-card hud-card" id="hud-card">
        <div class="hud-header hud-drag-handle" id="hud-drag-handle">
          <div class="hud-title-row">
            <span class="eyebrow">Live Drone Stats</span>
          </div>
          <span class="badge status-badge hud-status" id="training-status" data-running="true">Training</span>
        </div>

        <div class="hud-grid">
          <div class="hud-row"><span class="hud-label">Generation:</span><span class="hud-value" id="generation-readout">0</span></div>
          <div class="hud-row"><span class="hud-label">Best Score:</span><span class="hud-value" id="score-readout">0.00</span></div>
          <div class="hud-row"><span class="hud-label">Reward:</span><span class="hud-value" id="reward-readout">0.00</span></div>
          <div class="hud-row"><span class="hud-label">Distance:</span><span class="hud-value" id="distance-readout">0.00 m</span></div>
          <div class="hud-row"><span class="hud-label">Position:</span><span class="hud-value" id="position-readout">0.0, 0.0, 0.0</span></div>
          <div class="hud-row"><span class="hud-label">Speed:</span><span class="hud-value" id="speed-readout">0.00 m/s</span></div>
          <div class="hud-row"><span class="hud-label">Tilt:</span><span class="hud-value" id="tilt-readout">0.0°</span></div>
          <div class="hud-row"><span class="hud-label">Total Thrust:</span><span class="hud-value" id="thrust-readout">0.00 N</span></div>
        </div>
      </div>
    </section>
    <div
      class="panel-resizer"
      id="panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize navigation panel"
    >
      <span class="panel-resizer-grip"></span>
    </div>

    <aside class="panel" id="panel">
      <div class="panel-topbar">
        <div class="panel-heading">
          <div class="panel-brand">
            <img class="panel-brand-image" src="${droneImage}" alt="Drone" />
            <span class="panel-brand-badge">AI Drone</span>
          </div>
          <h2>Navigation Lab</h2>
          <p class="panel-intro">
            Drag the glowing waypoint in the scene to place the 3D target.
          </p>
        </div>
      </div>
        <section class="panel-section">
        <div class="panel-section-header">
          <h3>Target</h3>
          <img class="header-icon" src="${axisImage}" alt="" />
        </div>
        <div class="target-fields" id="target-readout" aria-label="Target coordinates">
          <label class="target-field">
            <span class="target-field-label">X</span>
            <input id="target-x" type="number" min="-6" max="6" step="0.1" />
          </label>
          <label class="target-field">
            <span class="target-field-label">Y</span>
            <input id="target-y" type="number" min="1.2" max="8.5" step="0.1" />
          </label>
          <label class="target-field">
            <span class="target-field-label">Z</span>
            <input id="target-z" type="number" min="-6" max="6" step="0.1" />
          </label>
        </div>

        <div class="button-row">
          <button class="primary" id="random-target">Random Target</button>
          <button id="center-target">Center Target</button>
        </div>
        </section>

        <section class="panel-section">
        <h3>Learning Progress</h3>
        <div class="chart-wrap">
          <div class="chart-label">
            <span>Best reward over recent generations</span>
            <span id="chart-range-label">Starting...</span>
          </div>
          <canvas id="learning-chart" width="320" height="120"></canvas>
        </div>
        </section>

        <section class="panel-section">
        <h3>Motor Thrust</h3>
        <div class="motor-grid">
          <div class="motor-card">
            <div class="motor-name">Front Left</div>
            <div class="motor-value" id="motor-0-value">0%</div>
            <div class="motor-bar"><div class="motor-fill" id="motor-0-fill"></div></div>
            <img class="motor-propeller" src="${propellerImage}" alt="Front left propeller" />
          </div>
          <div class="motor-card">
            <div class="motor-name">Front Right</div>
            <div class="motor-value" id="motor-1-value">0%</div>
            <div class="motor-bar"><div class="motor-fill" id="motor-1-fill"></div></div>
            <img class="motor-propeller" src="${propellerImage}" alt="Front right propeller" />
          </div>
          <div class="motor-card">
            <div class="motor-name">Rear Left</div>
            <div class="motor-value" id="motor-2-value">0%</div>
            <div class="motor-bar"><div class="motor-fill" id="motor-2-fill"></div></div>
            <img class="motor-propeller" src="${propellerImage}" alt="Rear left propeller" />
          </div>
          <div class="motor-card">
            <div class="motor-name">Rear Right</div>
            <div class="motor-value" id="motor-3-value">0%</div>
            <div class="motor-bar"><div class="motor-fill" id="motor-3-fill"></div></div>
            <img class="motor-propeller" src="${propellerImage}" alt="Rear right propeller" />
          </div>
        </div>
        </section>

        <section class="panel-section">
        <h3>Scenario</h3>
        <div class="control-grid control-grid-compact">
          <label class="control">
            <span class="control-label">
              <span>Episode Duration</span>
              <span id="episode-duration-value"></span>
            </span>
            <input id="episode-duration" type="range" min="4" max="12" step="0.5" />
          </label>

          <label class="control">
            <span class="control-label">
              <span>Start Spread</span>
              <span id="start-spread-value"></span>
            </span>
            <input id="start-spread" type="range" min="0.8" max="3.5" step="0.1" />
          </label>
        </div>
        </section>

        <section class="panel-section">
        <h3>Physics</h3>
        <div class="control-grid control-grid-compact">
          <label class="control">
            <span class="control-label">
              <span>Mass</span>
              <span id="mass-value"></span>
            </span>
            <input id="mass" type="range" min="0.7" max="2.2" step="0.05" />
          </label>

          <label class="control">
            <span class="control-label">
              <span>Max Motor Thrust</span>
              <span id="max-motor-thrust-value"></span>
            </span>
            <input id="max-motor-thrust" type="range" min="5" max="14" step="0.1" />
          </label>

          <label class="control">
            <span class="control-label">
              <span>Linear Damping</span>
              <span id="linear-damping-value"></span>
            </span>
            <input id="linear-damping" type="range" min="0.03" max="0.45" step="0.01" />
          </label>

          <label class="control">
            <span class="control-label">
              <span>Angular Damping</span>
              <span id="angular-damping-value"></span>
            </span>
            <input id="angular-damping" type="range" min="0.5" max="3.5" step="0.05" />
          </label>
        </div>
        </section>

        <section class="panel-section">
        <h3>Training</h3>
        <div class="control-grid control-grid-compact">
          <label class="control">
            <span class="control-label">
              <span>Population</span>
              <span id="population-value"></span>
            </span>
            <input id="population" type="range" min="1" max="35" step="1" />
            </label>

            <label class="control">
            <span class="control-label">
              <span>Mutation Scale</span>
              <span id="mutation-scale-value"></span>
            </span>
            <input id="mutation-scale" type="range" min="0.02" max="0.5" step="0.01" />
            </label>

          <label class="control control-span-2">
            <span class="control-label">
              <span>Training Speed</span>
              <span id="training-speed-value"></span>
            </span>
            <input id="training-speed" type="range" min="1" max="5" step="1" />
          </label>
        </div>

        <div class="button-row">
          <button class="primary" id="toggle-training">Pause Training</button>
          <button id="reset-learning">Reset Learning</button>
        </div>
        <div class="button-row">
          <button id="reset-drone">Reset Drone</button>
        </div>
        </section>

        <footer class="panel-footer">
          <span class="panel-copyright"> © Copyright Konrad Kunkel</span>
        </footer>
    </aside>
  </div>
`;

const viewport = document.querySelector(".viewport");
const appShell = document.querySelector(".app-shell");
const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1e6fd4";

tintImageToAccent(droneImage, accentColor);

const ui = {
  powerButton: document.querySelector("#power-button"),
  modeSwitch: document.querySelector("#mode-switch"),
  gizmoToggle: document.querySelector("#gizmo-toggle"),
  hudCard: document.querySelector("#hud-card"),
  hudDragHandle: document.querySelector("#hud-drag-handle"),
  panelResizer: document.querySelector("#panel-resizer"),
  panel: document.querySelector("#panel"),
  trainingStatus: document.querySelector("#training-status"),
  generation: document.querySelector("#generation-readout"),
  score: document.querySelector("#score-readout"),
  reward: document.querySelector("#reward-readout"),
  distance: document.querySelector("#distance-readout"),
  position: document.querySelector("#position-readout"),
  speed: document.querySelector("#speed-readout"),
  tilt: document.querySelector("#tilt-readout"),
  thrust: document.querySelector("#thrust-readout"),
  targetReadout: document.querySelector("#target-readout"),
  chartRange: document.querySelector("#chart-range-label"),
  chartCanvas: document.querySelector("#learning-chart"),
  toggleTraining: document.querySelector("#toggle-training"),
  resetLearning: document.querySelector("#reset-learning"),
  resetDrone: document.querySelector("#reset-drone"),
  randomTarget: document.querySelector("#random-target"),
  centerTarget: document.querySelector("#center-target"),
  motors: Array.from({ length: OUTPUT_SIZE }, (_, index) => ({
    value: document.querySelector(`#motor-${index}-value`),
    fill: document.querySelector(`#motor-${index}-fill`)
  })),
  inputs: {
    targetX: document.querySelector("#target-x"),
    targetY: document.querySelector("#target-y"),
    targetZ: document.querySelector("#target-z"),
    episodeDuration: document.querySelector("#episode-duration"),
    startSpread: document.querySelector("#start-spread"),
    mass: document.querySelector("#mass"),
    maxMotorThrust: document.querySelector("#max-motor-thrust"),
    linearDamping: document.querySelector("#linear-damping"),
    angularDamping: document.querySelector("#angular-damping"),
    population: document.querySelector("#population"),
    mutationScale: document.querySelector("#mutation-scale"),
    trainingSpeed: document.querySelector("#training-speed")
  },
  values: {
    episodeDuration: document.querySelector("#episode-duration-value"),
    startSpread: document.querySelector("#start-spread-value"),
    mass: document.querySelector("#mass-value"),
    maxMotorThrust: document.querySelector("#max-motor-thrust-value"),
    linearDamping: document.querySelector("#linear-damping-value"),
    angularDamping: document.querySelector("#angular-damping-value"),
    population: document.querySelector("#population-value"),
    mutationScale: document.querySelector("#mutation-scale-value"),
    trainingSpeed: document.querySelector("#training-speed-value")
  }
};

const config = {
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

const motorOffsets = [
  new THREE.Vector3(-config.armLength, 0, config.armLength),
  new THREE.Vector3(config.armLength, 0, config.armLength),
  new THREE.Vector3(-config.armLength, 0, -config.armLength),
  new THREE.Vector3(config.armLength, 0, -config.armLength)
];

const motorSpinDirections = [1, -1, -1, 1];
const inertia = new THREE.Vector3(0.5, 0.8, 0.5);

const state = {
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
  motorOutputs: [0, 0, 0, 0],
  propellerSpin: [0, 0, 0, 0],
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

function applyHudPosition() {
  if (window.innerWidth <= 640) {
    ui.hudCard.style.left = "";
    ui.hudCard.style.top = "";
    return;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const hudRect = ui.hudCard.getBoundingClientRect();
  const maxLeft = Math.max(12, viewportRect.width - hudRect.width - 12);
  const maxTop = Math.max(12, viewportRect.height - hudRect.height - 12);

  state.hudPosition.left = clamp(state.hudPosition.left, 12, maxLeft);
  state.hudPosition.top = clamp(state.hudPosition.top, 12, maxTop);

  ui.hudCard.style.left = `${state.hudPosition.left}px`;
  ui.hudCard.style.top = `${state.hudPosition.top}px`;
}

function applyPanelWidth() {
  if (window.innerWidth <= 980) {
    appShell.style.removeProperty("--panel-width");
    return;
  }

  const maxWidth = Math.min(560, Math.max(260, window.innerWidth - 280));
  state.panelWidth = clamp(state.panelWidth, 260, maxWidth);
  appShell.style.setProperty("--panel-width", `${state.panelWidth}px`);
}

ui.hudDragHandle.addEventListener("pointerdown", (event) => {
  if (window.innerWidth <= 640) {
    return;
  }

  state.hudDragging = true;
  state.hudDragPointerId = event.pointerId;
  ui.hudDragHandle.setPointerCapture(event.pointerId);

  const hudRect = ui.hudCard.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  state.hudDragOffset.x = event.clientX - hudRect.left;
  state.hudDragOffset.y = event.clientY - hudRect.top;
  state.hudPosition.left = hudRect.left - viewportRect.left;
  state.hudPosition.top = hudRect.top - viewportRect.top;
  ui.hudCard.classList.add("dragging");
});

ui.hudDragHandle.addEventListener("pointermove", (event) => {
  if (!state.hudDragging || event.pointerId !== state.hudDragPointerId) {
    return;
  }

  const viewportRect = viewport.getBoundingClientRect();
  state.hudPosition.left = event.clientX - viewportRect.left - state.hudDragOffset.x;
  state.hudPosition.top = event.clientY - viewportRect.top - state.hudDragOffset.y;
  applyHudPosition();
});

function stopHudDragging(event) {
  if (!state.hudDragging || event.pointerId !== state.hudDragPointerId) {
    return;
  }

  state.hudDragging = false;
  ui.hudCard.classList.remove("dragging");

  if (ui.hudDragHandle.hasPointerCapture(event.pointerId)) {
    ui.hudDragHandle.releasePointerCapture(event.pointerId);
  }

  state.hudDragPointerId = null;
}

ui.hudDragHandle.addEventListener("pointerup", stopHudDragging);
ui.hudDragHandle.addEventListener("pointercancel", stopHudDragging);

ui.panelResizer.addEventListener("pointerdown", (event) => {
  if (window.innerWidth <= 980) {
    return;
  }

  state.panelResizing = true;
  state.panelResizePointerId = event.pointerId;
  ui.panelResizer.setPointerCapture(event.pointerId);
  ui.panelResizer.classList.add("is-resizing");
});

ui.panelResizer.addEventListener("pointermove", (event) => {
  if (!state.panelResizing || event.pointerId !== state.panelResizePointerId) {
    return;
  }

  const nextWidth = window.innerWidth - event.clientX;
  state.panelWidth = nextWidth;
  applyPanelWidth();
});

function stopPanelResizing(event) {
  if (!state.panelResizing || event.pointerId !== state.panelResizePointerId) {
    return;
  }

  state.panelResizing = false;
  ui.panelResizer.classList.remove("is-resizing");

  if (ui.panelResizer.hasPointerCapture(event.pointerId)) {
    ui.panelResizer.releasePointerCapture(event.pointerId);
  }

  state.panelResizePointerId = null;
}

ui.panelResizer.addEventListener("pointerup", stopPanelResizing);
ui.panelResizer.addEventListener("pointercancel", stopPanelResizing);

function randomSigned() {
  return Math.random() * 2 - 1;
}

function gaussianRandom() {
  let u = 0;
  let v = 0;

  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function createDroneState(overrides = {}) {
  return {
    position: overrides.position?.clone() ?? new THREE.Vector3(0, config.groundY, 0),
    velocity: overrides.velocity?.clone() ?? new THREE.Vector3(),
    orientation: overrides.orientation?.clone() ?? new THREE.Quaternion(),
    angularVelocity: overrides.angularVelocity?.clone() ?? new THREE.Vector3(),
    motorOutputs: overrides.motorOutputs ? [...overrides.motorOutputs] : [0, 0, 0, 0]
  };
}

function getPreviewSpawnPosition(index, count) {
  const radius = 1.2;
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;

  return new THREE.Vector3(
    Math.cos(angle) * radius,
    config.groundY,
    Math.sin(angle) * radius
  );
}

function getHoverRatio() {
  return clamp((config.mass * config.gravity) / (config.maxMotorThrust * OUTPUT_SIZE), 0.12, 0.88);
}

function createSeedGenome() {
  const params = new Float32Array(GENOME_SIZE);

  for (let index = 0; index < params.length; index += 1) {
    params[index] = gaussianRandom() * 0.02;
  }

  return params;
}

function mutateGenome(baseGenome, scale, forceWideSearch = false) {
  const next = Float32Array.from(baseGenome);
  const localScale = scale * (forceWideSearch ? 1.9 : 1);

  for (let index = 0; index < next.length; index += 1) {
    next[index] += gaussianRandom() * localScale;
  }

  return next;
}

function getTiltRadians(orientation) {
  const upWorld = WORLD_UP.clone().applyQuaternion(orientation);
  return Math.acos(clamp(upWorld.y, -1, 1));
}

function buildPolicyInputs(droneState) {
  const inverseOrientation = droneState.orientation.clone().invert();
  const localTargetOffset = config.target
    .clone()
    .sub(droneState.position)
    .applyQuaternion(inverseOrientation)
    .multiplyScalar(0.22);
  const localVelocity = droneState.velocity.clone().applyQuaternion(inverseOrientation).multiplyScalar(0.18);
  const uprightLocal = WORLD_UP.clone().applyQuaternion(inverseOrientation);
  const localAngularVelocity = droneState.angularVelocity.clone().multiplyScalar(0.45);

  return [
    clamp(localTargetOffset.x, -1.6, 1.6),
    clamp(localTargetOffset.y, -1.6, 1.6),
    clamp(localTargetOffset.z, -1.6, 1.6),
    clamp(localVelocity.x, -1.5, 1.5),
    clamp(localVelocity.y, -1.5, 1.5),
    clamp(localVelocity.z, -1.5, 1.5),
    clamp(uprightLocal.x, -1, 1),
    clamp(uprightLocal.y, -1, 1),
    clamp(uprightLocal.z, -1, 1),
    clamp(localAngularVelocity.x, -1.4, 1.4),
    clamp(localAngularVelocity.y, -1.4, 1.4),
    clamp(localAngularVelocity.z, -1.4, 1.4)
  ];
}

function policyMotorOutputs(params, droneState) {
  const inputs = buildPolicyInputs(droneState);
  const hidden = new Array(HIDDEN_SIZE);
  let offset = 0;

  for (let hiddenIndex = 0; hiddenIndex < HIDDEN_SIZE; hiddenIndex += 1) {
    let activation = params[INPUT_SIZE * HIDDEN_SIZE + hiddenIndex];

    for (let inputIndex = 0; inputIndex < INPUT_SIZE; inputIndex += 1) {
      activation += inputs[inputIndex] * params[offset];
      offset += 1;
    }

    hidden[hiddenIndex] = Math.tanh(activation);
  }

  const outputBase = INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE;
  const outputBiasBase = outputBase + HIDDEN_SIZE * OUTPUT_SIZE;
  const outputs = new Array(OUTPUT_SIZE);

  for (let outputIndex = 0; outputIndex < OUTPUT_SIZE; outputIndex += 1) {
    let activation = params[outputBiasBase + outputIndex];

    for (let hiddenIndex = 0; hiddenIndex < HIDDEN_SIZE; hiddenIndex += 1) {
      activation += hidden[hiddenIndex] * params[outputBase + hiddenIndex * OUTPUT_SIZE + outputIndex];
    }

    outputs[outputIndex] = Math.tanh(activation) * config.residualMotorRange;
  }

  return outputs;
}

function computeStabilizerMotorOutputs(droneState) {
  const inverseOrientation = droneState.orientation.clone().invert();
  const localTargetOffset = config.target.clone().sub(droneState.position).applyQuaternion(inverseOrientation);
  const localVelocity = droneState.velocity.clone().applyQuaternion(inverseOrientation);
  const attitude = new THREE.Euler().setFromQuaternion(droneState.orientation, "XYZ");
  const currentPitch = attitude.x;
  const currentYaw = attitude.y;
  const currentRoll = attitude.z;

  const desiredPitch = clamp(localTargetOffset.z * 0.11 - localVelocity.z * 0.2, -0.35, 0.35);
  const desiredRoll = clamp(-localTargetOffset.x * 0.11 + localVelocity.x * 0.2, -0.35, 0.35);

  const pitchCommand = clamp((desiredPitch - currentPitch) * 3.2 - droneState.angularVelocity.x * 0.85, -2.2, 2.2);
  const rollCommand = clamp((desiredRoll - currentRoll) * 3.2 - droneState.angularVelocity.z * 0.85, -2.2, 2.2);
  const yawCommand = clamp(-currentYaw * 1.2 - droneState.angularVelocity.y * 0.35, -0.5, 0.5);
  const uprightFactor = Math.max(0.45, WORLD_UP.clone().applyQuaternion(droneState.orientation).y);
  const desiredVerticalAcceleration = (config.target.y - droneState.position.y) * 1.7 - droneState.velocity.y * 1.1;
  const totalThrust = clamp(
    (config.mass * (config.gravity + desiredVerticalAcceleration)) / uprightFactor,
    0,
    config.maxMotorThrust * OUTPUT_SIZE * 0.92
  );
  const baseMotorThrust = totalThrust / OUTPUT_SIZE;

  return [
    clamp(baseMotorThrust - pitchCommand - rollCommand - yawCommand, 0, config.maxMotorThrust),
    clamp(baseMotorThrust - pitchCommand + rollCommand + yawCommand, 0, config.maxMotorThrust),
    clamp(baseMotorThrust + pitchCommand - rollCommand + yawCommand, 0, config.maxMotorThrust),
    clamp(baseMotorThrust + pitchCommand + rollCommand - yawCommand, 0, config.maxMotorThrust)
  ];
}

function evaluateStepReward(droneState, acceleration) {
  const distance = droneState.position.distanceTo(config.target);
  const speed = droneState.velocity.length();
  const tilt = getTiltRadians(droneState.orientation);
  const angularSpeed = droneState.angularVelocity.length();

  let reward = 4.6;
  reward -= distance * 1.65;
  reward -= speed * 0.22;
  reward -= tilt * 1.1;
  reward -= angularSpeed * 0.18;
  reward -= acceleration.length() * 0.02;

  if (distance < 1.0) {
    reward += 1.5;
  }

  if (distance < 0.45 && speed < 0.55 && tilt < 0.24) {
    reward += 4.3;
  }

  if (droneState.position.y <= config.groundY + 0.02) {
    reward -= 0.9;
  }

  return { reward, distance, speed, tilt, angularSpeed };
}

function simulateDroneStep(params, droneState, dt) {
  const stabilizerOutputs = computeStabilizerMotorOutputs(droneState);
  const policyAdjustments = policyMotorOutputs(params, droneState);
  const motorOutputs = stabilizerOutputs.map((baseThrust, index) =>
    clamp(baseThrust + policyAdjustments[index], 0, config.maxMotorThrust)
  );
  const totalThrust = motorOutputs.reduce((sum, thrust) => sum + thrust, 0);
  const totalForceLocal = new THREE.Vector3(0, totalThrust, 0);
  const totalForceWorld = totalForceLocal.clone().applyQuaternion(droneState.orientation);
  const acceleration = totalForceWorld.multiplyScalar(1 / config.mass);

  acceleration.y -= config.gravity;
  acceleration.addScaledVector(droneState.velocity, -config.linearDamping);

  droneState.velocity.addScaledVector(acceleration, dt);
  droneState.position.addScaledVector(droneState.velocity, dt);

  const torque = new THREE.Vector3();

  for (let index = 0; index < OUTPUT_SIZE; index += 1) {
    const thrustForce = new THREE.Vector3(0, motorOutputs[index], 0);
    torque.add(motorOffsets[index].clone().cross(thrustForce));
    torque.y += motorSpinDirections[index] * motorOutputs[index] * config.yawTorqueFactor;
  }

  const angularAcceleration = new THREE.Vector3(
    torque.x / inertia.x,
    torque.y / inertia.y,
    torque.z / inertia.z
  );
  angularAcceleration.addScaledVector(droneState.angularVelocity, -config.angularDamping);

  droneState.angularVelocity.addScaledVector(angularAcceleration, dt);

  const deltaRotation = droneState.angularVelocity.clone().multiplyScalar(dt);
  const deltaAngle = deltaRotation.length();

  if (deltaAngle > 0.000001) {
    const deltaQuaternion = new THREE.Quaternion().setFromAxisAngle(deltaRotation.normalize(), deltaAngle);
    droneState.orientation.multiply(deltaQuaternion).normalize();
  }

  let crashed = false;

  if (droneState.position.y < config.groundY) {
    droneState.position.y = config.groundY;

    if (droneState.velocity.y < 0) {
      droneState.velocity.y = 0;
    }

    droneState.velocity.x *= 0.9;
    droneState.velocity.z *= 0.9;
    droneState.angularVelocity.multiplyScalar(0.92);
  }

  const radialDistance = Math.hypot(droneState.position.x, droneState.position.z);
  const tilt = getTiltRadians(droneState.orientation);

  if (droneState.position.y > config.ceiling || radialDistance > config.worldRadius + 2 || tilt > 1.4) {
    crashed = true;
  }

  droneState.motorOutputs = motorOutputs;

  const metrics = evaluateStepReward(droneState, acceleration);

  return {
    crashed,
    totalThrust,
    ...metrics,
    motorOutputs
  };
}

function makeStartOrientation(roll = 0, pitch = 0, yaw = 0) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, yaw, pitch, "XYZ"));
}

function buildScenarioStarts() {
  const spread = config.startSpread;
  const target = config.target;

  return [
    createDroneState({
      position: new THREE.Vector3(0, 1.8, 0),
      orientation: makeStartOrientation(0, 0, 0)
    }),
    createDroneState({
      position: new THREE.Vector3(-spread, 2.5, spread * 0.85),
      orientation: makeStartOrientation(0.08, -0.04, -0.06)
    }),
    createDroneState({
      position: new THREE.Vector3(spread * 0.9, 3.0, -spread * 1.15),
      velocity: new THREE.Vector3(0.25, 0, -0.2),
      orientation: makeStartOrientation(-0.12, 0.03, 0.08)
    }),
    createDroneState({
      position: new THREE.Vector3(target.x * -0.25, Math.max(1.7, target.y * 0.6), target.z * 0.2),
      orientation: makeStartOrientation(0.05, 0.02, -0.1)
    })
  ];
}

function scoreGenome(params) {
  const starts = buildScenarioStarts();
  let totalScore = 0;

  for (const start of starts) {
    const droneState = createDroneState(start);
    const steps = Math.floor(config.episodeDuration / config.simDt);
    let episodeScore = 0;

    for (let step = 0; step < steps; step += 1) {
      const snapshot = simulateDroneStep(params, droneState, config.simDt);
      episodeScore += snapshot.reward;

      if (snapshot.crashed) {
        episodeScore -= 18;
        break;
      }
    }

    const finalDistance = droneState.position.distanceTo(config.target);
    const finalSpeed = droneState.velocity.length();
    const finalTilt = getTiltRadians(droneState.orientation);

    episodeScore -= finalDistance * 9;
    episodeScore -= finalSpeed * 2.6;
    episodeScore -= finalTilt * 5;
    totalScore += episodeScore;
  }

  return totalScore / starts.length;
}

function trainGeneration() {
  let localBest = state.bestParams;
  let localBestScore = scoreGenome(localBest);
  const adaptiveScale = config.mutationScale * (state.stagnation > 16 ? 1.8 : 1);
  const rankedCandidates = [{ params: localBest, score: localBestScore }];

  for (let index = 1; index < config.population; index += 1) {
    const shouldWideSearch = index === config.population - 1 || state.stagnation > 32;
    const candidate =
      shouldWideSearch && state.stagnation > 46
        ? createSeedGenome()
        : mutateGenome(localBest, adaptiveScale, shouldWideSearch);
    const score = scoreGenome(candidate);
    rankedCandidates.push({ params: candidate, score });

    if (score > localBestScore) {
      localBest = candidate;
      localBestScore = score;
    }
  }

  if (localBestScore > state.bestScore + 0.001) {
    state.bestParams = localBest;
    state.bestScore = localBestScore;
    state.stagnation = 0;
  } else {
    state.stagnation += 1;
  }

  state.generation += 1;

  if (state.generation % 2 === 0) {
    state.learningHistory.push(state.bestScore);

    if (state.learningHistory.length > 180) {
      state.learningHistory.shift();
    }
  }

  rankedCandidates.sort((left, right) => right.score - left.score);
  state.previewCandidates = rankedCandidates
    .filter((candidate) => candidate.params !== state.bestParams)
    .slice(0, config.previewDroneCount)
    .map((candidate) => candidate.params);
}

function resetVisibleDrone() {
  state.liveDrone = createDroneState({
    position: new THREE.Vector3(0, config.groundY, 0),
    orientation: makeStartOrientation(0, 0, 0)
  });
  state.motorOutputs = [0, 0, 0, 0];
  state.totalThrust = 0;
  state.reward = 0;
  state.distance = state.liveDrone.position.distanceTo(config.target);
  if (!state.dronePowered) {
    state.propellerSpin = [0, 0, 0, 0];
  }
  resetTrailHistory();
}

function resetLearning() {
  state.bestParams = createSeedGenome();
  state.bestScore = scoreGenome(state.bestParams);
  state.generation = 0;
  state.stagnation = 0;
  state.learningHistory = [];
  state.previewCandidates = Array.from({ length: config.previewDroneCount }, (_, index) =>
    mutateGenome(state.bestParams, config.mutationScale * (0.55 + index * 0.06), false)
  );
  resetVisibleDrone();
  resetPreviewFleet();
  updateTargetVisuals();
  syncTargetControls();
  updateUi();
}

function setTarget(nextX, nextY, nextZ, shouldReset = false) {
  config.target.set(
    clamp(nextX, -config.worldRadius, config.worldRadius),
    clamp(nextY, 1.2, config.ceiling - 0.2),
    clamp(nextZ, -config.worldRadius, config.worldRadius)
  );

  targetGroup.position.copy(config.target);
  updateTargetVisuals();
  syncTargetControls();

  if (shouldReset) {
    resetLearning();
  } else {
    updateUi();
  }
}

function syncTargetControls() {
  ui.inputs.targetX.value = config.target.x.toFixed(1);
  ui.inputs.targetY.value = config.target.y.toFixed(1);
  ui.inputs.targetZ.value = config.target.z.toFixed(1);
}

function randomizeTarget() {
  const radius = 2 + Math.random() * 3.3;
  const angle = Math.random() * Math.PI * 2;
  const nextX = Math.cos(angle) * radius;
  const nextZ = Math.sin(angle) * radius;
  const nextY = 1.6 + Math.random() * 4.6;
  setTarget(nextX, nextY, nextZ, false);
}

function bindNumericControl(input, value, key, formatter, shouldReset = true) {
  input.value = String(config[key]);
  value.textContent = formatter(config[key]);

  input.addEventListener("input", () => {
    config[key] = Number(input.value);
    value.textContent = formatter(config[key]);

    if (shouldReset) {
      resetLearning();
    } else {
      updateUi();
    }
  });
}

bindNumericControl(ui.inputs.episodeDuration, ui.values.episodeDuration, "episodeDuration", (value) => `${value.toFixed(1)} s`);
bindNumericControl(ui.inputs.startSpread, ui.values.startSpread, "startSpread", (value) => `${value.toFixed(1)} m`);
bindNumericControl(ui.inputs.mass, ui.values.mass, "mass", (value) => `${value.toFixed(2)} kg`, false);
bindNumericControl(
  ui.inputs.maxMotorThrust,
  ui.values.maxMotorThrust,
  "maxMotorThrust",
  (value) => `${value.toFixed(1)} N`,
  false
);
bindNumericControl(
  ui.inputs.linearDamping,
  ui.values.linearDamping,
  "linearDamping",
  (value) => value.toFixed(2),
  false
);
bindNumericControl(
  ui.inputs.angularDamping,
  ui.values.angularDamping,
  "angularDamping",
  (value) => value.toFixed(2),
  false
);
bindNumericControl(ui.inputs.population, ui.values.population, "population", (value) => `${value}`, false);
ui.inputs.population.addEventListener("input", () => {
  config.previewDroneCount = Math.min(config.population, 12);
  resetPreviewFleet();
});
bindNumericControl(
  ui.inputs.mutationScale,
  ui.values.mutationScale,
  "mutationScale",
  (value) => value.toFixed(2)
);
bindNumericControl(
  ui.inputs.trainingSpeed,
  ui.values.trainingSpeed,
  "trainingSpeed",
  (value) => `${value}x`,
  false
);

ui.inputs.targetX.addEventListener("input", () => {
  setTarget(Number(ui.inputs.targetX.value), config.target.y, config.target.z, false);
});

ui.inputs.targetY.addEventListener("input", () => {
  setTarget(config.target.x, Number(ui.inputs.targetY.value), config.target.z, false);
});

ui.inputs.targetZ.addEventListener("input", () => {
  setTarget(config.target.x, config.target.y, Number(ui.inputs.targetZ.value), false);
});

ui.toggleTraining.addEventListener("click", () => {
  if (!state.dronePowered) {
    return;
  }

  state.trainingActive = !state.trainingActive;
  updateUi();
});

ui.modeSwitch.addEventListener("click", () => {
  if (!state.dronePowered) {
    return;
  }

  state.trainingActive = !state.trainingActive;
  updateUi();
});

ui.gizmoToggle.addEventListener("change", () => {
  state.showTargetGizmo = ui.gizmoToggle.checked;
  updateUi();
});

ui.resetLearning.addEventListener("click", () => {
  resetLearning();
});

ui.resetDrone.addEventListener("click", () => {
  resetVisibleDrone();
  updateUi();
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
  } else {
    state.trainingActive = false;
    resetVisibleDrone();
    state.propellerSpin = [0, 0, 0, 0];
    resetPreviewFleet();
    updateTargetVisuals();
    updateUi();
  }
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff");

const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
camera.position.set(9, 6.8, 9.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 2.5, 0);
controls.minDistance = 4.5;
controls.maxDistance = 24;
controls.minPolarAngle = 0.18;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("translate");
transformControls.setSpace("world");
transformControls.showX = true;
transformControls.showY = true;
transformControls.showZ = true;
transformControls.setSize(0.58);
const transformHelper = transformControls.getHelper();
scene.add(transformHelper);

const ambientLight = new THREE.HemisphereLight("#ffffff", "#cfd9e6", 1.3);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight("#ffffff", 1.55);
sunLight.position.set(7, 13, 6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -12;
sunLight.shadow.camera.right = 12;
sunLight.shadow.camera.top = 12;
sunLight.shadow.camera.bottom = -12;
scene.add(sunLight);

const groundCanvas = document.createElement("canvas");
groundCanvas.width = 512;
groundCanvas.height = 512;
const groundCtx = groundCanvas.getContext("2d");
const groundGradient = groundCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
groundGradient.addColorStop(0, "#f3f5f8");
groundGradient.addColorStop(0.75, "#f3f5f8");
groundGradient.addColorStop(1, "#ffffff");
groundCtx.fillStyle = groundGradient;
groundCtx.fillRect(0, 0, 512, 512);

const groundTexture = new THREE.CanvasTexture(groundCanvas);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(45, 45),
  new THREE.MeshStandardMaterial({
    map: groundTexture,
    roughness: 0.9,
    metalness: 0.01
  })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(20, 20, "#d5dbe4", "#edf1f6");
grid.position.y = 0.001;
scene.add(grid);

const worldDisc = new THREE.Mesh(
  new THREE.RingGeometry(config.worldRadius - 0.04, config.worldRadius + 0.04, 120),
  new THREE.MeshBasicMaterial({ color: "#dce6f5", transparent: true, opacity: 0.8, side: THREE.DoubleSide })
);
worldDisc.rotation.x = -Math.PI / 2;
worldDisc.position.y = 0.005;
scene.add(worldDisc);

const targetStem = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: "#b9cbe3" })
);
scene.add(targetStem);

const dronePathLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineDashedMaterial({ color: "#9eb9db", dashSize: 0.18, gapSize: 0.1 })
);
scene.add(dronePathLine);

const droneTrailLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: "#6ea7ea", transparent: true, opacity: 0.7 })
);
scene.add(droneTrailLine);

const targetGroup = new THREE.Group();
scene.add(targetGroup);

const targetSphere = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 24, 24),
  new THREE.MeshStandardMaterial({
    color: "#1e6fd4",
    emissive: "#74a8ee",
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.12
  })
);
targetGroup.add(targetSphere);

const targetRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.46, 0.025, 12, 48),
  new THREE.MeshBasicMaterial({ color: "#8ab8f0", transparent: true, opacity: 0.95 })
);
targetRing.rotation.x = Math.PI / 2;
targetGroup.add(targetRing);

const targetHalo = new THREE.Mesh(
  new THREE.RingGeometry(0.54, 0.72, 48),
  new THREE.MeshBasicMaterial({ color: "#d7e9ff", transparent: true, opacity: 0.72, side: THREE.DoubleSide })
);
targetHalo.rotation.x = -Math.PI / 2;
targetGroup.add(targetHalo);

function createTargetAxisGuide(color, axis) {
  const guide = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 10), material);
  shaft.position.y = 0.21;

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 14), material);
  tip.position.y = 0.47;

  guide.add(shaft);
  guide.add(tip);

  if (axis === "x") {
    guide.rotation.z = -Math.PI / 2;
  } else if (axis === "z") {
    guide.rotation.x = Math.PI / 2;
  }

  return guide;
}

const targetAxisGuides = new THREE.Group();
targetAxisGuides.add(createTargetAxisGuide("#e14b52", "x"));
targetAxisGuides.add(createTargetAxisGuide("#23a55a", "y"));
targetAxisGuides.add(createTargetAxisGuide("#2f7ef5", "z"));
targetAxisGuides.traverse((child) => {
  if (!child.material) {
    return;
  }

  child.renderOrder = 998;

  const materials = Array.isArray(child.material) ? child.material : [child.material];
  materials.forEach((material) => {
    material.depthTest = false;
    material.depthWrite = false;
  });
});
targetGroup.add(targetAxisGuides);

transformControls.attach(targetGroup);

transformControls.addEventListener("dragging-changed", (event) => {
  controls.enabled = !event.value;
  state.targetDragging = event.value;

  if (!event.value) {
    setTarget(targetGroup.position.x, targetGroup.position.y, targetGroup.position.z, false);
  }
});

transformControls.addEventListener("objectChange", () => {
  if (!state.targetDragging) {
    return;
  }

  targetGroup.position.set(
    clamp(targetGroup.position.x, -config.worldRadius, config.worldRadius),
    clamp(targetGroup.position.y, 1.2, config.ceiling - 0.2),
    clamp(targetGroup.position.z, -config.worldRadius, config.worldRadius)
  );

  config.target.copy(targetGroup.position);
  updateTargetVisuals();
  syncTargetControls();
  updateUi();
});

let droneGltf = null;
const gltfLoader = new GLTFLoader();

const modelLoadPromise = new Promise((resolve, reject) => {
  gltfLoader.load("/drone.glb", (gltf) => {
    droneGltf = gltf;
    console.log("✓ Drone model loaded successfully");
    
    const foundObjects = [];
    gltf.scene.traverse((node) => {
      if (node.name) {
        foundObjects.push(node.name);
      }
    });
    console.log("Model objects:", foundObjects);
    
    if (gltf.animations && gltf.animations.length > 0) {
      console.log("Model animations:", gltf.animations.map(a => a.name));
    }
    
    resolve(gltf);
  }, undefined, (error) => {
    console.error("Failed to load drone model:", error);
    reject(error);
  });
});

function createDrone(options = {}) {
  const {
    bodyColor = "#e4e9f1",
    accentColor = "#1e6fd4",
    armColor = "#8793a6",
    opacity = 1,
    scale = 1
  } = options;

  if (!droneGltf) {
    console.warn("Drone model not loaded yet, creating fallback drone");
    return createFallbackDrone(options);
  }

  const drone = droneGltf.scene.clone();
  
  drone.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      
      if (opacity < 1) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            mat.transparent = true;
            mat.opacity = opacity;
          });
        } else {
          child.material.transparent = true;
          child.material.opacity = opacity;
        }
      }
    }
  });

  const propellerNames = ["front-left", "front-right", "back-left", "back-right"];
  const propellers = propellerNames.map((name, index) => {
    const propeller = drone.getObjectByName(name);
    if (!propeller) {
      console.warn(`Propeller "${name}" (motor ${index}) not found in model`);
    }
    return propeller || new THREE.Group();
  });

  drone.scale.setScalar(scale);

  return { drone, propellers };
}

function createFallbackDrone(options = {}) {
  const {
    bodyColor = "#e4e9f1",
    accentColor = "#1e6fd4",
    armColor = "#8793a6",
    opacity = 1,
    scale = 1
  } = options;

  const propeller = () => {
    const group = new THREE.Group();
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20),
      new THREE.MeshStandardMaterial({ 
        color: "#4a5568", 
        roughness: 0.5, 
        metalness: 0.3,
        transparent: opacity < 1,
        opacity
      })
    );
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = true;
    group.add(hub);

    const bladeGeometry = new THREE.BoxGeometry(0.86, 0.02, 0.12);
    const bladeMaterial = new THREE.MeshStandardMaterial({ 
      color: "#2d3645", 
      roughness: 0.35, 
      metalness: 0.08,
      transparent: opacity < 1,
      opacity
    });
    const bladeA = new THREE.Mesh(bladeGeometry, bladeMaterial);
    bladeA.castShadow = true;
    group.add(bladeA);

    const bladeB = bladeA.clone();
    bladeB.rotation.y = Math.PI / 2;
    group.add(bladeB);

    return group;
  };

  const drone = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.55,
    metalness: 0.2,
    transparent: opacity < 1,
    opacity
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.45,
    metalness: 0.15,
    transparent: opacity < 1,
    opacity
  });
  const armMaterial = new THREE.MeshStandardMaterial({
    color: armColor,
    roughness: 0.6,
    metalness: 0.25,
    transparent: opacity < 1,
    opacity
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.92), bodyMaterial);
  body.castShadow = true;
  drone.add(body);

  const topShell = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.55), accentMaterial);
  topShell.position.y = 0.2;
  topShell.castShadow = true;
  drone.add(topShell);

  const armLength = config.armLength * 2.02;
  const armThickness = 0.09;
  const armA = new THREE.Mesh(new THREE.BoxGeometry(armLength, armThickness, 0.11), armMaterial);
  armA.rotation.y = Math.PI / 4;
  armA.castShadow = true;
  drone.add(armA);

  const armB = armA.clone();
  armB.rotation.y = -Math.PI / 4;
  drone.add(armB);

  const propellers = motorOffsets.map((offset) => {
    const mount = new THREE.Group();
    mount.position.copy(offset);

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 12), armMaterial);
    strut.castShadow = true;
    mount.add(strut);

    const prop = propeller();
    prop.position.y = 0.12;
    mount.add(prop);
    drone.add(mount);

    return prop;
  });

  drone.scale.setScalar(scale);

  return { drone, propellers };
}

let drone;
let propellers;

// Wait for model to load before creating initial drone
modelLoadPromise.then(() => {
  const droneData = createDrone();
  drone = droneData.drone;
  propellers = droneData.propellers;
  scene.add(drone);
  
  // Now safe to start animation loop
  resetLearning();
  resize();
  updateGizmoVisibility();
  animate();
}).catch((error) => {
  console.error("Failed to initialize due to model loading error:", error);
  // Still initialize with fallback drone
  const droneData = createDrone();
  drone = droneData.drone;
  propellers = droneData.propellers;
  scene.add(drone);
  
  resetLearning();
  resize();
  updateGizmoVisibility();
  animate();
});

const previewFleetGroup = new THREE.Group();
scene.add(previewFleetGroup);

function buildPreviewFleet() {
  while (state.previewFleet.length > config.previewDroneCount) {
    const preview = state.previewFleet.pop();
    previewFleetGroup.remove(preview.group);
  }

  while (state.previewFleet.length < config.previewDroneCount) {
    const index = state.previewFleet.length;
    const hue = 210 + index * 18;
    const { drone: previewDrone, propellers: previewPropellers } = createDrone({
      bodyColor: `hsl(${hue} 70% 90%)`,
      accentColor: `hsl(${hue} 72% 66%)`,
      armColor: `hsl(${hue} 16% 68%)`,
      opacity: 0.36,
      scale: 0.72
    });

    state.previewFleet.push({
      group: previewDrone,
      propellers: previewPropellers,
      propellerSpin: [0, 0, 0, 0],
      droneState: createDroneState(),
      params: createSeedGenome(),
      trailPoints: [],
      trailLine: new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: `hsl(${hue} 70% 66%)`,
          transparent: true,
          opacity: 0.25
        })
      )
    });

    const lastAdded = state.previewFleet[state.previewFleet.length - 1];
    scene.add(lastAdded.trailLine);
    previewFleetGroup.add(previewDrone);
    }
    }
function resetPreviewFleet() {
  buildPreviewFleet();

  state.previewFleet.forEach((preview, index) => {
    preview.params = state.previewCandidates[index] ?? mutateGenome(state.bestParams, config.mutationScale * 0.6, false);
    preview.droneState = createDroneState({
      position: getPreviewSpawnPosition(index, config.previewDroneCount),
      orientation: makeStartOrientation(0, 0, 0)
    });
    preview.propellerSpin = [0, 0, 0, 0];
    preview.group.position.copy(preview.droneState.position);
    preview.group.quaternion.copy(preview.droneState.orientation);
    preview.group.visible = false;
  });
}

function resetTrailHistory() {
  if (!state.liveDrone) {
    state.trailPoints = [];
    state.lastTrailPoint = null;
    droneTrailLine.geometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    return;
  }

  const startPoint = state.liveDrone.position.clone();
  state.trailPoints = [startPoint];
  state.lastTrailPoint = startPoint.clone();
  droneTrailLine.geometry.setFromPoints(state.trailPoints);
}

function sampleTrailPoint(force = false) {
  if (!state.liveDrone) {
    return;
  }

  const currentPoint = state.liveDrone.position.clone();

  if (!force && state.lastTrailPoint && currentPoint.distanceTo(state.lastTrailPoint) < config.trailSampleDistance) {
    return;
  }

  state.trailPoints.push(currentPoint);

  if (state.trailPoints.length > config.trailMaxPoints) {
    state.trailPoints.shift();
  }

  state.lastTrailPoint = currentPoint;
  droneTrailLine.geometry.setFromPoints(state.trailPoints);
}

function updateTargetVisuals() {
  targetGroup.position.copy(config.target);

  targetStem.geometry.setFromPoints([
    config.target.clone(),
    new THREE.Vector3(config.target.x, config.groundY, config.target.z)
  ]);

  if (state.liveDrone) {
    dronePathLine.geometry.setFromPoints([state.liveDrone.position.clone(), config.target.clone()]);
    dronePathLine.computeLineDistances();
  }
}

function updateGizmoVisibility() {
  const gizmoVisible = state.showTargetGizmo;
  transformControls.enabled = gizmoVisible;
  transformHelper.visible = gizmoVisible;
  targetAxisGuides.visible = gizmoVisible;
}

function updateUi() {
  const liveDrone = state.liveDrone;
  const positionText = liveDrone
    ? `${liveDrone.position.x.toFixed(1)}, ${liveDrone.position.y.toFixed(1)}, ${liveDrone.position.z.toFixed(1)}`
    : "0.0, 0.0, 0.0";
  const speedValue = liveDrone ? liveDrone.velocity.length() : 0;
  const tiltDegrees = liveDrone ? getTiltRadians(liveDrone.orientation) * THREE.MathUtils.RAD2DEG : 0;

  ui.powerButton.classList.toggle("is-on", state.dronePowered);
  ui.powerButton.setAttribute("aria-pressed", String(state.dronePowered));
  viewport.classList.toggle("is-training", state.dronePowered && state.trainingActive);
  ui.modeSwitch.classList.toggle("is-training", state.dronePowered && state.trainingActive);
  ui.modeSwitch.classList.toggle("is-simulating", state.dronePowered && !state.trainingActive);
  ui.modeSwitch.disabled = !state.dronePowered;
  ui.modeSwitch.setAttribute("aria-pressed", String(state.dronePowered && state.trainingActive));
  ui.modeSwitch.textContent = !state.dronePowered
    ? "Training Mode"
    : state.trainingActive
      ? "Training Mode"
      : "Simulation Mode";
  ui.gizmoToggle.checked = state.showTargetGizmo;
  ui.trainingStatus.textContent = !state.dronePowered ? "Off" : state.trainingActive ? "Training" : "Cruising";
  ui.trainingStatus.dataset.running = String(state.dronePowered && state.trainingActive);
  ui.toggleTraining.textContent = !state.dronePowered ? "Power To Train" : state.trainingActive ? "Pause Training" : "Resume Training";
  ui.toggleTraining.disabled = !state.dronePowered;
  updateGizmoVisibility();

  ui.generation.textContent = state.generation.toLocaleString();
  ui.score.textContent = state.bestScore.toFixed(2);
  ui.reward.textContent = state.reward.toFixed(2);
  ui.distance.textContent = `${state.distance.toFixed(2)} m`;
  ui.position.textContent = positionText;
  ui.speed.textContent = `${speedValue.toFixed(2)} m/s`;
  ui.tilt.textContent = `${tiltDegrees.toFixed(1)}°`;
  ui.thrust.textContent = `${state.totalThrust.toFixed(2)} N`;

  state.motorOutputs.forEach((output, index) => {
    const ratio = clamp(output / config.maxMotorThrust, 0, 1);
    const hue = 210 - ratio * 210;
    const topColor = `hsl(${hue} 88% 74%)`;
    const bottomColor = `hsl(${hue} 82% 46%)`;
    ui.motors[index].value.textContent = `${Math.round(ratio * 100)}%`;
    ui.motors[index].fill.style.height = `${ratio * 100}%`;
    ui.motors[index].fill.style.setProperty("--motor-fill-top", topColor);
    ui.motors[index].fill.style.setProperty("--motor-fill-bottom", bottomColor);
  });

  if (state.learningHistory.length > 0) {
    ui.chartRange.textContent = `${state.learningHistory.length} samples`;
  } else {
    ui.chartRange.textContent = "Starting...";
  }
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  applyPanelWidth();
  applyHudPosition();
}

window.addEventListener("resize", resize);

const chartContext = ui.chartCanvas.getContext("2d");

function drawLearningChart() {
  const { width, height } = ui.chartCanvas;
  chartContext.clearRect(0, 0, width, height);

  chartContext.fillStyle = "#ffffff";
  chartContext.fillRect(0, 0, width, height);
  chartContext.strokeStyle = "#e7ecf3";
  chartContext.lineWidth = 1;
  chartContext.beginPath();
  chartContext.moveTo(0, height - 18);
  chartContext.lineTo(width, height - 18);
  chartContext.moveTo(0, 18);
  chartContext.lineTo(width, 18);
  chartContext.stroke();

  if (state.learningHistory.length < 2) {
    chartContext.fillStyle = "#7b8797";
    chartContext.font = '12px "Avenir Next", "Segoe UI", sans-serif';
    chartContext.fillText("Learning curve will appear here.", 18, height / 2);
    return;
  }

  const min = Math.min(...state.learningHistory);
  const max = Math.max(...state.learningHistory);
  const range = Math.max(max - min, 1);

  chartContext.strokeStyle = "#1e6fd4";
  chartContext.lineWidth = 2.5;
  chartContext.beginPath();

  state.learningHistory.forEach((value, index) => {
    const x = (index / (state.learningHistory.length - 1)) * (width - 24) + 12;
    const y = height - 18 - ((value - min) / range) * (height - 36);

    if (index === 0) {
      chartContext.moveTo(x, y);
    } else {
      chartContext.lineTo(x, y);
    }
  });

  chartContext.stroke();
  chartContext.fillStyle = "#7b8797";
  chartContext.font = '12px "Avenir Next", "Segoe UI", sans-serif';
  chartContext.fillText(`min ${min.toFixed(1)}`, 12, height - 4);
  chartContext.fillText(`max ${max.toFixed(1)}`, width - 64, 14);
}

function stepLiveSimulation(dt) {
  if (!state.dronePowered) {
    state.motorOutputs = [0, 0, 0, 0];
    state.totalThrust = 0;
    state.reward = 0;
    return;
  }

  const snapshot = simulateDroneStep(state.bestParams, state.liveDrone, dt);

  state.reward = snapshot.reward;
  state.distance = snapshot.distance;
  state.totalThrust = snapshot.totalThrust;
  state.motorOutputs = [...snapshot.motorOutputs];

  if (snapshot.crashed || !Number.isFinite(snapshot.distance)) {
    resetVisibleDrone();
    return;
  }

  sampleTrailPoint();

  if (state.liveDrone.position.y <= config.groundY + 0.01 && snapshot.distance > config.worldRadius + 0.5) {
    resetVisibleDrone();
  }
}

function stepPreviewFleet(dt) {
  const showPreviewFleet = state.dronePowered && state.trainingActive;

  state.previewFleet.forEach((preview, index) => {
    preview.group.visible = showPreviewFleet;
    preview.trailLine.visible = showPreviewFleet;

    if (!showPreviewFleet) {
      return;
    }

    preview.params = state.previewCandidates[index] ?? preview.params;
    const snapshot = simulateDroneStep(preview.params, preview.droneState, dt);

    if (snapshot.crashed || !Number.isFinite(snapshot.distance)) {
      preview.droneState = createDroneState({
        position: getPreviewSpawnPosition(index, config.previewDroneCount),
        orientation: makeStartOrientation(0, 0, 0)
      });
      preview.propellerSpin = [0, 0, 0, 0];
      preview.trailPoints = [];
    }

    preview.group.position.copy(preview.droneState.position);
    preview.group.quaternion.copy(preview.droneState.orientation);

    preview.trailPoints.push(preview.droneState.position.clone());
    if (preview.trailPoints.length > 35) {
      preview.trailPoints.shift();
    }
    preview.trailLine.geometry.setFromPoints(preview.trailPoints);

    const previewOutputs = preview.droneState.motorOutputs ?? [0, 0, 0, 0];
    previewOutputs.forEach((output, motorIndex) => {
      preview.propellerSpin[motorIndex] += 0.18 + (output / config.maxMotorThrust) * 0.42;
      preview.propellers[motorIndex].rotation.y = preview.propellerSpin[motorIndex] * motorSpinDirections[motorIndex];
    });
  });
}

function animate() {
  requestAnimationFrame(animate);

  if (state.dronePowered && state.trainingActive && !state.targetDragging) {
    for (let index = 0; index < config.trainingSpeed; index += 1) {
      trainGeneration();
    }
  }

  stepLiveSimulation(config.liveDt);
  stepPreviewFleet(config.liveDt);

  drone.position.copy(state.liveDrone.position);
  drone.quaternion.copy(state.liveDrone.orientation);

  state.motorOutputs.forEach((output, index) => {
    if (!state.dronePowered) {
      state.propellerSpin[index] = 0;
      propellers[index].rotation.y = 0;
      return;
    }

    state.propellerSpin[index] += 0.32 + (output / config.maxMotorThrust) * 0.9;
    propellers[index].rotation.y = state.propellerSpin[index] * motorSpinDirections[index];
  });

  const focusPoint = state.liveDrone.position.clone().lerp(config.target, 0.35);
  controls.target.lerp(focusPoint, 0.06);
  controls.update();

  updateTargetVisuals();
  updateUi();
  drawLearningChart();
  renderer.render(scene, camera);
}


