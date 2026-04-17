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
  const scratchForwardWorld = new THREE.Vector3();
  const scratchInverseOrientation = new THREE.Quaternion();
  const scratchLocalTargetOffset = new THREE.Vector3();
  const scratchLocalVelocity = new THREE.Vector3();
  const scratchUprightLocal = new THREE.Vector3();
  const scratchLocalAngularVelocity = new THREE.Vector3();
  const scratchTargetOffsetWorld = new THREE.Vector3();
  const scratchTargetDirectionWorld = new THREE.Vector3();
  const scratchDesiredForwardWorld = new THREE.Vector3();
  const scratchTotalForceWorld = new THREE.Vector3();
  const scratchAcceleration = new THREE.Vector3();
  const scratchTorque = new THREE.Vector3();
  const scratchAngularAcceleration = new THREE.Vector3();
  const scratchThrustForce = new THREE.Vector3();
  const scratchDeltaRotation = new THREE.Vector3();
  const scratchRotationAxis = new THREE.Vector3();
  const scratchDeltaQuaternion = new THREE.Quaternion();
  const scratchPolicyInputs = new Float32Array(INPUT_SIZE);
  const scratchHidden = new Float32Array(HIDDEN_SIZE);
  const scratchPolicyOutputs = new Float32Array(OUTPUT_SIZE);
  const scratchStabilizerOutputs = new Float32Array(OUTPUT_SIZE);
  const scenarioStarts = buildScenarioStarts();
  const episodeSteps = Math.floor(config.episodeDuration / config.simDt);

  function createDroneState(overrides = {}) {
    const motorOutputs = new Float32Array(OUTPUT_SIZE);

    if (overrides.motorOutputs) {
      for (let index = 0; index < OUTPUT_SIZE; index += 1) {
        motorOutputs[index] = overrides.motorOutputs[index] ?? 0;
      }
    }

    return {
      position:
        overrides.position?.clone() ??
        new THREE.Vector3(0, config.groundY, 0),
      velocity: overrides.velocity?.clone() ?? new THREE.Vector3(),
      orientation:
        overrides.orientation?.clone() ?? new THREE.Quaternion(),
      angularVelocity:
        overrides.angularVelocity?.clone() ?? new THREE.Vector3(),
      motorOutputs
    };
  }

  function getPreviewSpawnPosition(index, count) {
    if (config.startSpread <= 0.0001) {
      return new THREE.Vector3(0, config.groundY, 0);
    }

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
    const next = new Float32Array(baseGenome.length);
    const localScale = scale * (forceWideSearch ? 1.9 : 1);

    for (let index = 0; index < next.length; index += 1) {
      next[index] = baseGenome[index] + gaussianRandom() * localScale;
    }

    return next;
  }

  function getTiltRadians(orientation) {
    scratchUpWorld.copy(WORLD_UP).applyQuaternion(orientation);
    return Math.acos(clamp(scratchUpWorld.y, -1, 1));
  }

  function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function updateLocalUpright(droneState) {
    scratchInverseOrientation.copy(droneState.orientation).invert();
    scratchUprightLocal.copy(WORLD_UP).applyQuaternion(scratchInverseOrientation);
  }

  function getCurrentYaw(droneState) {
    scratchForwardWorld.set(0, 0, 1).applyQuaternion(droneState.orientation);
    scratchForwardWorld.y = 0;

    if (scratchForwardWorld.lengthSq() < 0.0001) {
      return 0;
    }

    scratchForwardWorld.normalize();
    return Math.atan2(scratchForwardWorld.x, scratchForwardWorld.z);
  }

  function getDesiredWorldYaw(droneState) {
    scratchTargetOffsetWorld.copy(config.target).sub(droneState.position);
    scratchTargetOffsetWorld.y = 0;

    if (scratchTargetOffsetWorld.lengthSq() < 0.04) {
      return getCurrentYaw(droneState);
    }

    return Math.atan2(
      scratchTargetOffsetWorld.x,
      scratchTargetOffsetWorld.z
    );
  }

  function getHorizontalYawError(droneState) {
    return normalizeAngle(
      getDesiredWorldYaw(droneState) - getCurrentYaw(droneState)
    );
  }

  function getHeadingAlignment(droneState) {
    const desiredYaw = getDesiredWorldYaw(droneState);
    scratchDesiredForwardWorld.set(
      Math.sin(desiredYaw),
      0,
      Math.cos(desiredYaw)
    );
    scratchForwardWorld.set(0, 0, 1).applyQuaternion(droneState.orientation);
    scratchForwardWorld.y = 0;

    if (scratchForwardWorld.lengthSq() < 0.0001) {
      return 0;
    }

    scratchForwardWorld.normalize();
    return clamp(
      scratchForwardWorld.dot(scratchDesiredForwardWorld),
      -1,
      1
    );
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
    const yawError = getHorizontalYawError(droneState);
    const headingAlignment = getHeadingAlignment(droneState);

    scratchPolicyInputs[0] = clamp(scratchLocalTargetOffset.x, -1.6, 1.6);
    scratchPolicyInputs[1] = clamp(scratchLocalTargetOffset.y, -1.6, 1.6);
    scratchPolicyInputs[2] = clamp(scratchLocalTargetOffset.z, -1.6, 1.6);
    scratchPolicyInputs[3] = clamp(scratchLocalVelocity.x, -1.5, 1.5);
    scratchPolicyInputs[4] = clamp(scratchLocalVelocity.y, -1.5, 1.5);
    scratchPolicyInputs[5] = clamp(scratchLocalVelocity.z, -1.5, 1.5);
    scratchPolicyInputs[6] = clamp(scratchUprightLocal.x, -1, 1);
    scratchPolicyInputs[7] = clamp(scratchUprightLocal.y, -1, 1);
    scratchPolicyInputs[8] = clamp(scratchUprightLocal.z, -1, 1);
    scratchPolicyInputs[9] = clamp(scratchLocalAngularVelocity.x, -1.4, 1.4);
    scratchPolicyInputs[10] = clamp(scratchLocalAngularVelocity.y, -1.4, 1.4);
    scratchPolicyInputs[11] = clamp(scratchLocalAngularVelocity.z, -1.4, 1.4);
    scratchPolicyInputs[12] = clamp(Math.sin(yawError), -1, 1);
    scratchPolicyInputs[13] = clamp(headingAlignment, -1, 1);

    return scratchPolicyInputs;
  }

  function policyMotorOutputs(params, droneState) {
    const inputs = buildPolicyInputs(droneState);
    let offset = 0;

    for (let hiddenIndex = 0; hiddenIndex < HIDDEN_SIZE; hiddenIndex += 1) {
      let activation = params[INPUT_SIZE * HIDDEN_SIZE + hiddenIndex];

      for (let inputIndex = 0; inputIndex < INPUT_SIZE; inputIndex += 1) {
        activation += inputs[inputIndex] * params[offset];
        offset += 1;
      }

      scratchHidden[hiddenIndex] = Math.tanh(activation);
    }

    const outputBase = INPUT_SIZE * HIDDEN_SIZE + HIDDEN_SIZE;
    const outputBiasBase = outputBase + HIDDEN_SIZE * OUTPUT_SIZE;

    for (let outputIndex = 0; outputIndex < OUTPUT_SIZE; outputIndex += 1) {
      let activation = params[outputBiasBase + outputIndex];

      for (let hiddenIndex = 0; hiddenIndex < HIDDEN_SIZE; hiddenIndex += 1) {
        activation +=
          scratchHidden[hiddenIndex] *
          params[outputBase + hiddenIndex * OUTPUT_SIZE + outputIndex];
      }

      scratchPolicyOutputs[outputIndex] =
        Math.tanh(activation) * config.residualMotorRange;
    }

    return scratchPolicyOutputs;
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
    updateLocalUpright(droneState);
    const currentPitch = Math.atan2(scratchUprightLocal.z, scratchUprightLocal.y);
    const currentRoll = Math.atan2(-scratchUprightLocal.x, scratchUprightLocal.y);

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
    const yawError = getHorizontalYawError(droneState);
    const yawCommand = clamp(
      yawError * 1.8 - droneState.angularVelocity.y * 0.52,
      -1.1,
      1.1
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

    scratchStabilizerOutputs[0] = clamp(
      baseMotorThrust - pitchCommand - rollCommand - yawCommand,
      0,
      config.maxMotorThrust
    );
    scratchStabilizerOutputs[1] = clamp(
      baseMotorThrust - pitchCommand + rollCommand + yawCommand,
      0,
      config.maxMotorThrust
    );
    scratchStabilizerOutputs[2] = clamp(
      baseMotorThrust + pitchCommand - rollCommand + yawCommand,
      0,
      config.maxMotorThrust
    );
    scratchStabilizerOutputs[3] = clamp(
      baseMotorThrust + pitchCommand + rollCommand - yawCommand,
      0,
      config.maxMotorThrust
    );

    return scratchStabilizerOutputs;
  }

  function evaluateStepReward(droneState, acceleration, motorOutputs) {
    const distance = droneState.position.distanceTo(config.target);
    const speed = droneState.velocity.length();
    const tilt = getTiltRadians(droneState.orientation);
    const angularSpeed = droneState.angularVelocity.length();
    const leftThrust = motorOutputs[0] + motorOutputs[2];
    const rightThrust = motorOutputs[1] + motorOutputs[3];
    const frontThrust = motorOutputs[0] + motorOutputs[1];
    const rearThrust = motorOutputs[2] + motorOutputs[3];
    const maxPairThrust = Math.max(config.maxMotorThrust * 2, 0.0001);
    const rollImbalance = Math.abs(leftThrust - rightThrust) / maxPairThrust;
    const pitchImbalance = Math.abs(frontThrust - rearThrust) / maxPairThrust;
    const symmetryPenalty = (rollImbalance + pitchImbalance) * 0.12;

    let reward = 4.6;
    reward -= distance * 1.95;
    reward -= speed * 0.42;
    reward -= tilt * 1.45;
    reward -= angularSpeed * 0.32;
    reward -= acceleration.length() * 0.02;
    reward -= symmetryPenalty;

    if (distance < 0.8) {
      reward += 1.8;
    }

    if (distance < 0.45 && speed < 0.35 && tilt < 0.18) {
      reward += 4.8;
    }

    if (
      distance < 0.22 &&
      speed < 0.18 &&
      tilt < 0.1 &&
      angularSpeed < 0.24
    ) {
      reward += 8.5;
    }

    if (droneState.position.y <= config.groundY + 0.02) {
      reward -= 0.9;
    }

    return { reward, distance, speed, tilt, angularSpeed };
  }

  function simulateDroneStep(params, droneState, dt) {
    const stabilizerOutputs = computeStabilizerMotorOutputs(droneState);
    const policyAdjustments = policyMotorOutputs(params, droneState);
    let totalThrust = 0;

    for (let index = 0; index < OUTPUT_SIZE; index += 1) {
      const motorOutput = clamp(
        stabilizerOutputs[index] + policyAdjustments[index],
        0,
        config.maxMotorThrust
      );
      droneState.motorOutputs[index] = motorOutput;
      totalThrust += motorOutput;
    }

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
      scratchThrustForce.set(0, droneState.motorOutputs[index], 0);
      scratchTorque.add(
        scratchLocalAngularVelocity
          .copy(motorOffsets[index])
          .cross(scratchThrustForce)
      );
      scratchTorque.y +=
        MOTOR_SPIN_DIRECTIONS[index] *
        droneState.motorOutputs[index] *
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

    return {
      crashed,
      totalThrust,
      ...evaluateStepReward(
        droneState,
        scratchAcceleration,
        droneState.motorOutputs
      ),
      motorOutputs: droneState.motorOutputs
    };
  }

  function makeStartOrientation(roll = 0, pitch = 0, yaw = 0) {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(roll, pitch, yaw, "XYZ")
    );
  }

  function buildScenarioStarts() {
    const spread = config.startSpread;
    const target = config.target;

    if (spread <= 0.0001) {
      return [
        createDroneState({
          position: target.clone(),
          orientation: makeStartOrientation(0, 0, 0)
        }),
        createDroneState({
          position: target.clone().add(new THREE.Vector3(0.08, -0.12, -0.06)),
          velocity: new THREE.Vector3(0.03, 0, -0.02),
          orientation: makeStartOrientation(0.03, -0.02, 0.01)
        }),
        createDroneState({
          position: target.clone().add(new THREE.Vector3(-0.1, 0.1, 0.07)),
          velocity: new THREE.Vector3(-0.02, 0.01, 0.03),
          orientation: makeStartOrientation(-0.025, 0.015, -0.02)
        })
      ];
    }

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
    let totalScore = 0;

    for (const start of scenarioStarts) {
      const droneState = createDroneState(start);
      let episodeScore = 0;

      for (let step = 0; step < episodeSteps; step += 1) {
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

    return totalScore / scenarioStarts.length;
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
      state.lastImprovementAtMs = Date.now();
      state.stagnation = 0;
    } else {
      state.stagnation += 1;
    }

    state.generation += 1;
    state.recentGenerationHistory.push(localBestScore);

    if (state.recentGenerationHistory.length > 100) {
      state.recentGenerationHistory.shift();
    }

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
