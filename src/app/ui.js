import * as THREE from "three";

function formatElapsedCompact(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function syncTargetControls(ui, config) {
  ui.inputs.targetX.value = config.target.x.toFixed(1);
  ui.inputs.targetY.value = config.target.y.toFixed(1);
  ui.inputs.targetZ.value = config.target.z.toFixed(1);
}

export function bindNumericControl({
  formatter,
  input,
  onInput,
  value,
  valueProvider
}) {
  const initialValue = valueProvider();
  input.value = String(initialValue);
  value.textContent = formatter(initialValue);

  input.addEventListener("input", () => {
    const nextValue = Number(input.value);
    value.textContent = formatter(nextValue);
    onInput(nextValue);
  });
}

export function createLearningChart(ui) {
  const chartContext = ui.chartCanvas.getContext("2d");

  return function drawLearningChart(history) {
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

    if (history.length < 2) {
      chartContext.fillStyle = "#7b8797";
      chartContext.font = '12px "Avenir Next", "Segoe UI", sans-serif';
      chartContext.fillText("Learning curve will appear here.", 18, height / 2);
      return;
    }

    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = Math.max(max - min, 1);

    chartContext.strokeStyle = "#1e6fd4";
    chartContext.lineWidth = 2.5;
    chartContext.beginPath();

    history.forEach((value, index) => {
      const x = (index / (history.length - 1)) * (width - 24) + 12;
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
  };
}

export function updateUi({
  clamp,
  config,
  getTiltRadians,
  state,
  ui,
  updateGizmoVisibility,
  viewport
}) {
  const liveDrone = state.liveDrone;
  const positionText = liveDrone
    ? `${liveDrone.position.x.toFixed(1)}, ${liveDrone.position.y.toFixed(1)}, ${liveDrone.position.z.toFixed(1)}`
    : "0.0, 0.0, 0.0";
  const speedValue = liveDrone ? liveDrone.velocity.length() : 0;
  const tiltDegrees = liveDrone
    ? getTiltRadians(liveDrone.orientation) * THREE.MathUtils.RAD2DEG
    : 0;

  ui.powerButton.classList.toggle("is-on", state.dronePowered);
  ui.powerButton.setAttribute("aria-pressed", String(state.dronePowered));
  viewport.classList.toggle(
    "is-training",
    state.dronePowered && state.trainingActive
  );
  ui.modeSwitch.classList.toggle(
    "is-training",
    state.dronePowered && state.trainingActive
  );
  ui.modeSwitch.classList.toggle(
    "is-simulating",
    state.dronePowered && !state.trainingActive
  );
  ui.modeSwitch.disabled = !state.dronePowered;
  ui.modeSwitch.setAttribute(
    "aria-pressed",
    String(state.dronePowered && state.trainingActive)
  );
  ui.modeSwitch.textContent = !state.dronePowered
    ? "Training Mode"
    : state.trainingActive
      ? "Training Mode"
      : "Simulation Mode";
  ui.gizmoToggle.checked = state.showTargetGizmo;
  ui.trainingStatus.textContent = !state.dronePowered
    ? "Off"
    : state.trainingActive
      ? "Training"
      : "Cruising";
  ui.trainingStatus.dataset.running = String(
    state.dronePowered && state.trainingActive
  );
  ui.toggleTraining.textContent = !state.dronePowered
    ? "Power To Train"
    : state.trainingActive
      ? "Pause Training"
      : "Resume Training";
  ui.toggleTraining.disabled = !state.dronePowered;
  updateGizmoVisibility();

  ui.generation.textContent = state.generation.toLocaleString();
  ui.trainingTime.textContent = formatElapsedCompact(
    state.trainingTimeAccumulatedMs +
      (state.trainingActive && state.trainingTimeStartedAtMs
        ? Date.now() - state.trainingTimeStartedAtMs
        : 0)
  );
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

  ui.chartRange.textContent =
    state.learningHistory.length > 0
      ? `${state.learningHistory.length} samples`
      : "Starting...";
  ui.chartLastChange.textContent = `Last change: ${formatElapsedCompact(
    state.lastImprovementAtMs ? Date.now() - state.lastImprovementAtMs : 0
  )}`;
}
