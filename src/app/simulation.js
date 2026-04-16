import * as THREE from "three";

import {
  GENOME_SIZE,
  HIDDEN_SIZE,
  INERTIA,
  INPUT_SIZE,
  MOTOR_SPIN_DIRECTIONS,
  OUTPUT_SIZE,
  WORLD_UP
} from "./constants.js";
import { clamp, gaussianRandom } from "./utils.js";

export function createSimulationEngine({ config, motorOffsets, state }) {
  function createDroneState(overrides = {}) {
    return {
      position:
        overrides.position?.clone() ??
        new THREE.Vector3(0, config.groundY, 0),
      velocity: overrides.velocity?.clone() ?? new THREE.Vector3(),
      orientation:
        overrides.orientation?.clone() ?? new THREE.Quaternion(),
      angularVelocity:
        overrides.angularVelocity?.clone() ?? new THREE.Vector3(),
      motorOutputs: overrides.motorOutputs
        ? [...overrides.motorOutputs]
        : [0, 0, 0, 0]
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
    const localVelocity = droneState.velocity
      .clone()
      .applyQuaternion(inverseOrientation)
      .multiplyScalar(0.18);
    const uprightLocal = WORLD_UP.clone().applyQuaternion(inverseOrientation);
    const localAngularVelocity = droneState.angularVelocity
      .clone()
      .multiplyScalar(0.45);

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
        activation +=
          hidden[hiddenIndex] *
          params[outputBase + hiddenIndex * OUTPUT_SIZE + outputIndex];
      }

      outputs[outputIndex] =
        Math.tanh(activation) * config.residualMotorRange;
    }

    return outputs;
  }

  function computeStabilizerMotorOutputs(droneState) {
    const inverseOrientation = droneState.orientation.clone().invert();
    const localTargetOffset = config.target
      .clone()
      .sub(droneState.position)
      .applyQuaternion(inverseOrientation);
    const localVelocity = droneState.velocity
      .clone()
      .applyQuaternion(inverseOrientation);
    const attitude = new THREE.Euler().setFromQuaternion(
      droneState.orientation,
      "XYZ"
    );
    const currentPitch = attitude.x;
    const currentYaw = attitude.y;
    const currentRoll = attitude.z;

    const desiredPitch = clamp(
      localTargetOffset.z * 0.11 - localVelocity.z * 0.2,
      -0.35,
      0.35
    );
    const desiredRoll = clamp(
      -localTargetOffset.x * 0.11 + localVelocity.x * 0.2,
      -0.35,
      0.35
    );

    const pitchCommand = clamp(
      (desiredPitch - currentPitch) * 3.2 -
        droneState.angularVelocity.x * 0.85,
      -2.2,
      2.2
    );
    const rollCommand = clamp(
      (desiredRoll - currentRoll) * 3.2 -
        droneState.angularVelocity.z * 0.85,
      -2.2,
      2.2
    );
    const yawCommand = clamp(
      -currentYaw * 1.2 - droneState.angularVelocity.y * 0.35,
      -0.5,
      0.5
    );
    const uprightFactor = Math.max(
      0.45,
      WORLD_UP.clone().applyQuaternion(droneState.orientation).y
    );
    const desiredVerticalAcceleration =
      (config.target.y - droneState.position.y) * 1.7 -
      droneState.velocity.y * 1.1;
    const totalThrust = clamp(
      (config.mass * (config.gravity + desiredVerticalAcceleration)) /
        uprightFactor,
      0,
      config.maxMotorThrust * OUTPUT_SIZE * 0.92
    );
    const baseMotorThrust = totalThrust / OUTPUT_SIZE;

    return [
      clamp(
        baseMotorThrust - pitchCommand - rollCommand - yawCommand,
        0,
        config.maxMotorThrust
      ),
      clamp(
        baseMotorThrust - pitchCommand + rollCommand + yawCommand,
        0,
        config.maxMotorThrust
      ),
      clamp(
        baseMotorThrust + pitchCommand - rollCommand + yawCommand,
        0,
        config.maxMotorThrust
      ),
      clamp(
        baseMotorThrust + pitchCommand + rollCommand - yawCommand,
        0,
        config.maxMotorThrust
      )
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
      clamp(
        baseThrust + policyAdjustments[index],
        0,
        config.maxMotorThrust
      )
    );
    const totalThrust = motorOutputs.reduce((sum, thrust) => sum + thrust, 0);
    const totalForceLocal = new THREE.Vector3(0, totalThrust, 0);
    const totalForceWorld = totalForceLocal
      .clone()
      .applyQuaternion(droneState.orientation);
    const acceleration = totalForceWorld.multiplyScalar(1 / config.mass);

    acceleration.y -= config.gravity;
    acceleration.addScaledVector(droneState.velocity, -config.linearDamping);

    droneState.velocity.addScaledVector(acceleration, dt);
    droneState.position.addScaledVector(droneState.velocity, dt);

    const torque = new THREE.Vector3();

    for (let index = 0; index < OUTPUT_SIZE; index += 1) {
      const thrustForce = new THREE.Vector3(0, motorOutputs[index], 0);
      torque.add(motorOffsets[index].clone().cross(thrustForce));
      torque.y +=
        MOTOR_SPIN_DIRECTIONS[index] *
        motorOutputs[index] *
        config.yawTorqueFactor;
    }

    const angularAcceleration = new THREE.Vector3(
      torque.x / INERTIA.x,
      torque.y / INERTIA.y,
      torque.z / INERTIA.z
    );
    angularAcceleration.addScaledVector(
      droneState.angularVelocity,
      -config.angularDamping
    );

    droneState.angularVelocity.addScaledVector(angularAcceleration, dt);

    const deltaRotation = droneState.angularVelocity.clone().multiplyScalar(dt);
    const deltaAngle = deltaRotation.length();

    if (deltaAngle > 0.000001) {
      const deltaQuaternion = new THREE.Quaternion().setFromAxisAngle(
        deltaRotation.normalize(),
        deltaAngle
      );
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

    const radialDistance = Math.hypot(
      droneState.position.x,
      droneState.position.z
    );
    const tilt = getTiltRadians(droneState.orientation);

    if (
      droneState.position.y > config.ceiling ||
      radialDistance > config.worldRadius + 2 ||
      tilt > 1.4
    ) {
      crashed = true;
    }

    droneState.motorOutputs = motorOutputs;

    return {
      crashed,
      totalThrust,
      ...evaluateStepReward(droneState, acceleration),
      motorOutputs
    };
  }

  function makeStartOrientation(roll = 0, pitch = 0, yaw = 0) {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(roll, yaw, pitch, "XYZ")
    );
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
        position: new THREE.Vector3(
          spread * 0.9,
          3.0,
          -spread * 1.15
        ),
        velocity: new THREE.Vector3(0.25, 0, -0.2),
        orientation: makeStartOrientation(-0.12, 0.03, 0.08)
      }),
      createDroneState({
        position: new THREE.Vector3(
          target.x * -0.25,
          Math.max(1.7, target.y * 0.6),
          target.z * 0.2
        ),
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
    const seededBest = state.bestParams ?? createSeedGenome();
    let localBest = seededBest;
    let localBestScore = scoreGenome(localBest);
    const adaptiveScale =
      config.mutationScale * (state.stagnation > 16 ? 1.8 : 1);
    const rankedCandidates = [{ params: localBest, score: localBestScore }];

    for (let index = 1; index < config.population; index += 1) {
      const shouldWideSearch =
        index === config.population - 1 || state.stagnation > 32;
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

  return {
    createDroneState,
    createSeedGenome,
    getPreviewSpawnPosition,
    getTiltRadians,
    makeStartOrientation,
    mutateGenome,
    scoreGenome,
    simulateDroneStep,
    trainGeneration
  };
}
