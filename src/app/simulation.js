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
  const scratchUpWorld = new THREE.Vector3();
  const scratchInverseOrientation = new THREE.Quaternion();
  const scratchLocalTargetOffset = new THREE.Vector3();
  const scratchLocalVelocity = new THREE.Vector3();
  const scratchUprightLocal = new THREE.Vector3();
  const scratchLocalAngularVelocity = new THREE.Vector3();
  const scratchAttitude = new THREE.Euler();
  const scratchTotalForceWorld = new THREE.Vector3();
  const scratchAcceleration = new THREE.Vector3();
  const scratchTorque = new THREE.Vector3();
  const scratchAngularAcceleration = new THREE.Vector3();
  const scratchThrustForce = new THREE.Vector3();
  const scratchDeltaRotation = new THREE.Vector3();
  const scratchRotationAxis = new THREE.Vector3();
  const scratchDeltaQuaternion = new THREE.Quaternion();

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
    scratchUpWorld.copy(WORLD_UP).applyQuaternion(orientation);
    return Math.acos(clamp(scratchUpWorld.y, -1, 1));
  }

  function buildPolicyInputs(droneState) {
    scratchInverseOrientation.copy(droneState.orientation).invert();
    scratchLocalTargetOffset
      .copy(config.target)
      .sub(droneState.position)
      .applyQuaternion(scratchInverseOrientation)
      .multiplyScalar(0.22);
    scratchLocalVelocity
      .copy(droneState.velocity)
      .applyQuaternion(scratchInverseOrientation)
      .multiplyScalar(0.18);
    scratchUprightLocal.copy(WORLD_UP).applyQuaternion(scratchInverseOrientation);
    scratchLocalAngularVelocity
      .copy(droneState.angularVelocity)
      .multiplyScalar(0.45);

    return [
      clamp(scratchLocalTargetOffset.x, -1.6, 1.6),
      clamp(scratchLocalTargetOffset.y, -1.6, 1.6),
      clamp(scratchLocalTargetOffset.z, -1.6, 1.6),
      clamp(scratchLocalVelocity.x, -1.5, 1.5),
      clamp(scratchLocalVelocity.y, -1.5, 1.5),
      clamp(scratchLocalVelocity.z, -1.5, 1.5),
      clamp(scratchUprightLocal.x, -1, 1),
      clamp(scratchUprightLocal.y, -1, 1),
      clamp(scratchUprightLocal.z, -1, 1),
      clamp(scratchLocalAngularVelocity.x, -1.4, 1.4),
      clamp(scratchLocalAngularVelocity.y, -1.4, 1.4),
      clamp(scratchLocalAngularVelocity.z, -1.4, 1.4)
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
    scratchInverseOrientation.copy(droneState.orientation).invert();
    scratchLocalTargetOffset
      .copy(config.target)
      .sub(droneState.position)
      .applyQuaternion(scratchInverseOrientation);
    scratchLocalVelocity
      .copy(droneState.velocity)
      .applyQuaternion(scratchInverseOrientation);
    scratchAttitude.setFromQuaternion(droneState.orientation, "XYZ");
    const currentPitch = scratchAttitude.x;
    const currentYaw = scratchAttitude.y;
    const currentRoll = scratchAttitude.z;

    const desiredPitch = clamp(
      scratchLocalTargetOffset.z * 0.11 - scratchLocalVelocity.z * 0.2,
      -0.35,
      0.35
    );
    const desiredRoll = clamp(
      -scratchLocalTargetOffset.x * 0.11 + scratchLocalVelocity.x * 0.2,
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
    scratchUpWorld.copy(WORLD_UP).applyQuaternion(droneState.orientation);
    const uprightFactor = Math.max(0.45, scratchUpWorld.y);
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
    scratchTotalForceWorld
      .set(0, totalThrust, 0)
      .applyQuaternion(droneState.orientation)
      .multiplyScalar(1 / config.mass);
    scratchAcceleration.copy(scratchTotalForceWorld);

    scratchAcceleration.y -= config.gravity;
    scratchAcceleration.addScaledVector(
      droneState.velocity,
      -config.linearDamping
    );

    droneState.velocity.addScaledVector(scratchAcceleration, dt);
    droneState.position.addScaledVector(droneState.velocity, dt);

    scratchTorque.set(0, 0, 0);

    for (let index = 0; index < OUTPUT_SIZE; index += 1) {
      scratchThrustForce.set(0, motorOutputs[index], 0);
      scratchTorque.add(
        scratchLocalAngularVelocity
          .copy(motorOffsets[index])
          .cross(scratchThrustForce)
      );
      scratchTorque.y +=
        MOTOR_SPIN_DIRECTIONS[index] *
        motorOutputs[index] *
        config.yawTorqueFactor;
    }

    scratchAngularAcceleration.set(
      scratchTorque.x / INERTIA.x,
      scratchTorque.y / INERTIA.y,
      scratchTorque.z / INERTIA.z
    );
    scratchAngularAcceleration.addScaledVector(
      droneState.angularVelocity,
      -config.angularDamping
    );

    droneState.angularVelocity.addScaledVector(
      scratchAngularAcceleration,
      dt
    );

    scratchDeltaRotation.copy(droneState.angularVelocity).multiplyScalar(dt);
    const deltaAngle = scratchDeltaRotation.length();

    if (deltaAngle > 0.000001) {
      scratchRotationAxis.copy(scratchDeltaRotation).normalize();
      scratchDeltaQuaternion.setFromAxisAngle(
        scratchRotationAxis,
        deltaAngle
      );
      droneState.orientation.multiply(scratchDeltaQuaternion).normalize();
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
      ...evaluateStepReward(droneState, scratchAcceleration),
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
