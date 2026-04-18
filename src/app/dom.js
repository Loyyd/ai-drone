import powerButtonImage from "../assets/power-button.png";
import propellerImage from "../assets/propeller.png";
import axisImage from "../assets/axis.png";
import droneImage from "../../drone.png";
import performanceImage from "../../performance.svg";

import { OUTPUT_SIZE } from "./constants.js";

function tintImageToAccent(favicon, imageUrl, color) {
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

function createUiReferences() {
  return {
    powerButton: document.querySelector("#power-button"),
    modeSwitch: document.querySelector("#mode-switch"),
    gizmoToggle: document.querySelector("#gizmo-toggle"),
    performanceToggle: document.querySelector("#performance-toggle"),
    learningCard: document.querySelector("#learning-card"),
    learningCardDragHandle: document.querySelector("#learning-card-drag-handle"),
    hudCard: document.querySelector("#hud-card"),
    hudDragHandle: document.querySelector("#hud-drag-handle"),
    panelResizer: document.querySelector("#panel-resizer"),
    panel: document.querySelector("#panel"),
    trainingStatus: document.querySelector("#training-status"),
    generation: document.querySelector("#generation-readout"),
    trainingTime: document.querySelector("#training-time-readout"),
    score: document.querySelector("#score-readout"),
    reward: document.querySelector("#reward-readout"),
    distance: document.querySelector("#distance-readout"),
    position: document.querySelector("#position-readout"),
    speed: document.querySelector("#speed-readout"),
    tilt: document.querySelector("#tilt-readout"),
    thrust: document.querySelector("#thrust-readout"),
    targetReadout: document.querySelector("#target-readout"),
    chartRange: document.querySelector("#chart-range-label"),
    chartLastChange: document.querySelector("#chart-last-change"),
    chartCanvas: document.querySelector("#learning-chart"),
    recentChartRange: document.querySelector("#recent-chart-range-label"),
    recentChartCanvas: document.querySelector("#recent-learning-chart"),
    toggleTraining: document.querySelector("#toggle-training"),
    resetLearning: document.querySelector("#reset-learning"),
    resetDrone: document.querySelector("#reset-drone"),
    randomTarget: document.querySelector("#random-target"),
    wanderTarget: document.querySelector("#wander-target"),
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
      previewDroneCount: document.querySelector("#preview-drone-count"),
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
      previewDroneCount: document.querySelector("#preview-drone-count-value"),
      mutationScale: document.querySelector("#mutation-scale-value"),
      trainingSpeed: document.querySelector("#training-speed-value")
    }
  };
}

export function initializeDom() {
  const app = document.querySelector("#app");
  const favicon =
    document.querySelector("link[rel='icon']") ?? document.createElement("link");

  favicon.rel = "icon";
  favicon.type = "image/png";
  favicon.href = droneImage;
  document.head.appendChild(favicon);

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

        <label
          class="gizmo-toggle gizmo-toggle-secondary"
          for="performance-toggle"
          aria-label="Performance Mode"
          style="--axis-toggle-image: url('${performanceImage}')"
        >
          <input class="gizmo-toggle-checkbox" id="performance-toggle" type="checkbox" />
          <span class="gizmo-toggle-icon" aria-hidden="true"></span>
        </label>

        <div class="overlay-card learning-card" id="learning-card">
          <div class="hud-header hud-drag-handle" id="learning-card-drag-handle">
            <div class="hud-title-row">
              <span class="eyebrow">Learning Progress</span>
            </div>
            <span class="chart-range-badge" id="chart-range-label">Starting...</span>
          </div>

          <div class="chart-wrap chart-wrap-overlay">
            <div class="chart-label">
              <span>Best reward over recent generations</span>
            </div>
            <canvas id="learning-chart" width="320" height="120"></canvas>
            <div class="chart-meta">
              <span class="chart-last-change" id="chart-last-change">Last change: 0s</span>
            </div>
          </div>

          <div class="chart-wrap chart-wrap-overlay chart-wrap-secondary">
            <div class="chart-label">
              <span>Current generation trend</span>
              <span class="chart-range-badge chart-range-badge-inline" id="recent-chart-range-label">Starting...</span>
            </div>
            <canvas id="recent-learning-chart" width="320" height="120"></canvas>
          </div>
        </div>

        <div class="overlay-card hud-card" id="hud-card">
          <div class="hud-header hud-drag-handle" id="hud-drag-handle">
            <div class="hud-title-row">
              <span class="eyebrow">Live Drone Stats</span>
            </div>
            <span class="badge status-badge hud-status" id="training-status" data-running="true">Training</span>
          </div>

          <div class="hud-grid">
            <div class="hud-row"><span class="hud-label">Generation:</span><span class="hud-value" id="generation-readout">0</span></div>
            <div class="hud-row"><span class="hud-label">Training Time:</span><span class="hud-value" id="training-time-readout">0s</span></div>
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

          <div class="button-row button-row-triple">
            <button class="primary" id="random-target">Random Target</button>
            <button id="wander-target">Roam Target</button>
            <button id="center-target">Center Target</button>
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
                <span class="control-label-title">
                  <span>Episode Duration</span>
                  <span
                    class="control-info-badge"
                    tabindex="0"
                    aria-label="Retrain required"
                    title="Retrain required"
                  >i</span>
                </span>
                <span id="episode-duration-value"></span>
              </span>
              <input id="episode-duration" type="range" min="4" max="12" step="0.5" />
            </label>

            <label class="control">
              <span class="control-label">
                <span class="control-label-title">
                  <span>Start Spread</span>
                  <span
                    class="control-info-badge"
                    tabindex="0"
                    aria-label="Retrain required"
                    title="Retrain required"
                  >i</span>
                </span>
                <span id="start-spread-value"></span>
              </span>
              <input id="start-spread" type="range" min="0" max="3.5" step="0.1" />
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
              <input id="mass" type="range" min="0.5" max="4" step="0.05" />
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
              <input id="population" type="range" min="1" max="100" step="1" />
            </label>

            <label class="control">
              <span class="control-label">
                <span>Preview Drones</span>
                <span id="preview-drone-count-value"></span>
              </span>
              <input id="preview-drone-count" type="range" min="0" max="12" step="1" />
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
  const accentColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#1e6fd4";

  tintImageToAccent(favicon, droneImage, accentColor);

  return {
    appShell,
    ui: createUiReferences(),
    viewport
  };
}
