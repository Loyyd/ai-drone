import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { MOTOR_SPIN_DIRECTIONS } from "./constants.js";

export function createSceneController({ clamp, config, state, viewport }) {
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
  const groundGradient = groundCtx.createRadialGradient(
    256,
    256,
    0,
    256,
    256,
    256
  );
  groundGradient.addColorStop(0, "#f3f5f8");
  groundGradient.addColorStop(0.68, "#f3f5f8");
  groundGradient.addColorStop(0.9, "rgba(255, 255, 255, 0.45)");
  groundGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  groundCtx.fillStyle = groundGradient;
  groundCtx.fillRect(0, 0, 512, 512);

  const groundTexture = new THREE.CanvasTexture(groundCanvas);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(45, 45),
    new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.9,
      metalness: 0.01,
      transparent: true
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(20, 20, "#8ea3bd", "#bccde0");
  grid.position.y = 0.001;
  scene.add(grid);

  const worldDisc = new THREE.Mesh(
    new THREE.RingGeometry(config.worldRadius - 0.04, config.worldRadius + 0.04, 120),
    new THREE.MeshBasicMaterial({
      color: "#b8d2f0",
      opacity: 0.98,
      side: THREE.DoubleSide,
      transparent: true
    })
  );
  worldDisc.rotation.x = -Math.PI / 2;
  worldDisc.position.y = 0.005;
  scene.add(worldDisc);

  const targetStem = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]),
    new THREE.LineBasicMaterial({ color: "#b9cbe3" })
  );
  scene.add(targetStem);

  const dronePathLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]),
    new THREE.LineDashedMaterial({
      color: "#9eb9db",
      dashSize: 0.18,
      gapSize: 0.1
    })
  );
  scene.add(dronePathLine);

  const droneTrailLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]),
    new THREE.LineBasicMaterial({
      color: "#6ea7ea",
      opacity: 0.7,
      transparent: true
    })
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
      metalness: 0.12,
      roughness: 0.2
    })
  );
  targetGroup.add(targetSphere);

  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.025, 12, 48),
    new THREE.MeshBasicMaterial({
      color: "#8ab8f0",
      opacity: 0.95,
      transparent: true
    })
  );
  targetRing.rotation.x = Math.PI / 2;
  targetGroup.add(targetRing);

  const targetHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.54, 0.72, 48),
    new THREE.MeshBasicMaterial({
      color: "#d7e9ff",
      opacity: 0.72,
      side: THREE.DoubleSide,
      transparent: true
    })
  );
  targetHalo.rotation.x = -Math.PI / 2;
  targetGroup.add(targetHalo);

  function createTargetAxisGuide(color, axis) {
    const guide = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, 0.42, 10),
      material
    );
    shaft.position.y = 0.21;

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.12, 14),
      material
    );
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

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      material.depthTest = false;
      material.depthWrite = false;
    });
  });
  targetGroup.add(targetAxisGuides);

  transformControls.attach(targetGroup);

  const previewFleetGroup = new THREE.Group();
  scene.add(previewFleetGroup);

  let droneGltf = null;
  let mainDrone = null;
  let mainPropellers = [];
  let onTargetCommit = () => {};
  let onTargetPreview = () => {};

  const gltfLoader = new GLTFLoader();

  function setTargetHandlers(handlers) {
    onTargetCommit = handlers.onTargetCommit ?? onTargetCommit;
    onTargetPreview = handlers.onTargetPreview ?? onTargetPreview;
  }

  transformControls.addEventListener("dragging-changed", (event) => {
    controls.enabled = !event.value;
    state.targetDragging = event.value;

    if (!event.value) {
      onTargetCommit(targetGroup.position.clone());
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
    updateTargetVisuals(state.liveDrone);
    onTargetPreview(targetGroup.position.clone());
  });

  function loadDroneModel() {
    return new Promise((resolve, reject) => {
      gltfLoader.load(
        "/drone.glb",
        (gltf) => {
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
            console.log(
              "Model animations:",
              gltf.animations.map((animation) => animation.name)
            );
          }

          resolve(gltf);
        },
        undefined,
        (error) => {
          console.error("Failed to load drone model:", error);
          reject(error);
        }
      );
    });
  }

  function createFallbackDrone({
    accentColor = "#1e6fd4",
    armColor = "#8793a6",
    bodyColor = "#e4e9f1",
    opacity = 1,
    scale = 1
  } = {}) {
    const propeller = () => {
      const group = new THREE.Group();
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20),
        new THREE.MeshStandardMaterial({
          color: "#4a5568",
          metalness: 0.3,
          opacity,
          roughness: 0.5,
          transparent: opacity < 1
        })
      );
      hub.rotation.x = Math.PI / 2;
      hub.castShadow = true;
      group.add(hub);

      const bladeGeometry = new THREE.BoxGeometry(0.86, 0.02, 0.12);
      const bladeMaterial = new THREE.MeshStandardMaterial({
        color: "#2d3645",
        metalness: 0.08,
        opacity,
        roughness: 0.35,
        transparent: opacity < 1
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
      metalness: 0.2,
      opacity,
      roughness: 0.55,
      transparent: opacity < 1
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: accentColor,
      metalness: 0.15,
      opacity,
      roughness: 0.45,
      transparent: opacity < 1
    });
    const armMaterial = new THREE.MeshStandardMaterial({
      color: armColor,
      metalness: 0.25,
      opacity,
      roughness: 0.6,
      transparent: opacity < 1
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.3, 0.92),
      bodyMaterial
    );
    body.castShadow = true;
    drone.add(body);

    const topShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.16, 0.55),
      accentMaterial
    );
    topShell.position.y = 0.2;
    topShell.castShadow = true;
    drone.add(topShell);

    const armLength = config.armLength * 2.02;
    const armThickness = 0.09;
    const armA = new THREE.Mesh(
      new THREE.BoxGeometry(armLength, armThickness, 0.11),
      armMaterial
    );
    armA.rotation.y = Math.PI / 4;
    armA.castShadow = true;
    drone.add(armA);

    const armB = armA.clone();
    armB.rotation.y = -Math.PI / 4;
    drone.add(armB);

    const propellers = [
      new THREE.Vector3(-config.armLength, 0, config.armLength),
      new THREE.Vector3(config.armLength, 0, config.armLength),
      new THREE.Vector3(-config.armLength, 0, -config.armLength),
      new THREE.Vector3(config.armLength, 0, -config.armLength)
    ].map((offset) => {
      const mount = new THREE.Group();
      mount.position.copy(offset);

      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.18, 12),
        armMaterial
      );
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

  function createDrone(options = {}) {
    const { opacity = 1, scale = 1 } = options;

    if (!droneGltf) {
      console.warn("Drone model not loaded yet, creating fallback drone");
      return createFallbackDrone(options);
    }

    const drone = droneGltf.scene.clone();

    drone.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;

      if (opacity < 1) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        materials.forEach((material) => {
          material.transparent = true;
          material.opacity = opacity;
        });
      }
    });

    const propellerNames = [
      "front-left",
      "front-right",
      "back-left",
      "back-right"
    ];
    const propellers = propellerNames.map((name, index) => {
      const bone = drone.getObjectByName(name);

      if (!bone) {
        console.warn(`Propeller bone "${name}" (motor ${index}) not found in model`);
      }

      return bone || new THREE.Group();
    });

    drone.scale.setScalar(scale);

    return { drone, propellers };
  }

  async function initialize() {
    try {
      await loadDroneModel();
    } catch (error) {
      console.error("Falling back to generated drone mesh:", error);
    }

    const droneData = createDrone();
    mainDrone = droneData.drone;
    mainPropellers = droneData.propellers;
    scene.add(mainDrone);
  }

  function buildPreviewFleet({
    createDroneState,
    createSeedGenome
  }) {
    while (state.previewFleet.length > config.previewDroneCount) {
      const preview = state.previewFleet.pop();
      previewFleetGroup.remove(preview.group);
      scene.remove(preview.trailLine);
    }

    while (state.previewFleet.length < config.previewDroneCount) {
      const index = state.previewFleet.length;
      const hue = 210 + index * 18;
      const { drone, propellers } = createDrone({
        bodyColor: `hsl(${hue} 70% 90%)`,
        accentColor: `hsl(${hue} 72% 66%)`,
        armColor: `hsl(${hue} 16% 68%)`,
        opacity: 0.36,
        scale: 0.72
      });

      const preview = {
        droneState: createDroneState(),
        group: drone,
        params: createSeedGenome(),
        propellerSpin: [0, 0, 0, 0],
        propellers,
        trailLine: new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: `hsl(${hue} 70% 66%)`,
            opacity: 0.25,
            transparent: true
          })
        ),
        trailPoints: []
      };

      state.previewFleet.push(preview);
      scene.add(preview.trailLine);
      previewFleetGroup.add(drone);
    }
  }

  function resetPreviewFleet({
    createDroneState,
    createSeedGenome,
    getPreviewSpawnPosition,
    makeStartOrientation,
    mutateGenome
  }) {
    buildPreviewFleet({ createDroneState, createSeedGenome });
    const baseParams = state.bestParams ?? createSeedGenome();

    state.previewFleet.forEach((preview, index) => {
      preview.params =
        state.previewCandidates[index] ??
        mutateGenome(
          baseParams,
          config.mutationScale * 0.6,
          false
        );
      preview.droneState = createDroneState({
        position: getPreviewSpawnPosition(index, config.previewDroneCount),
        orientation: makeStartOrientation(0, 0, 0)
      });
      preview.propellerSpin = [0, 0, 0, 0];
      preview.group.position.copy(preview.droneState.position);
      preview.group.quaternion.copy(preview.droneState.orientation);
      preview.group.visible = false;
      preview.trailPoints = [];
      preview.trailLine.geometry.setFromPoints([]);
      preview.trailLine.visible = false;
    });
  }

  function resetTrailHistory(liveDrone) {
    if (!liveDrone) {
      state.trailPoints = [];
      state.lastTrailPoint = null;
      droneTrailLine.geometry.setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
      ]);
      return;
    }

    const startPoint = liveDrone.position.clone();
    state.trailPoints = [startPoint];
    state.lastTrailPoint = startPoint.clone();
    droneTrailLine.geometry.setFromPoints(state.trailPoints);
  }

  function sampleTrailPoint(liveDrone) {
    if (!liveDrone) {
      return;
    }

    const currentPoint = liveDrone.position.clone();

    if (
      state.lastTrailPoint &&
      currentPoint.distanceTo(state.lastTrailPoint) <
        config.trailSampleDistance
    ) {
      return;
    }

    state.trailPoints.push(currentPoint);

    if (state.trailPoints.length > config.trailMaxPoints) {
      state.trailPoints.shift();
    }

    state.lastTrailPoint = currentPoint;
    droneTrailLine.geometry.setFromPoints(state.trailPoints);
  }

  function updateTargetVisuals(liveDrone) {
    targetGroup.position.copy(config.target);

    targetStem.geometry.setFromPoints([
      config.target.clone(),
      new THREE.Vector3(config.target.x, config.groundY, config.target.z)
    ]);

    if (liveDrone) {
      dronePathLine.geometry.setFromPoints([
        liveDrone.position.clone(),
        config.target.clone()
      ]);
      dronePathLine.computeLineDistances();
    }
  }

  function updateGizmoVisibility() {
    const gizmoVisible = state.showTargetGizmo;
    transformControls.enabled = gizmoVisible;
    transformHelper.visible = gizmoVisible;
    targetAxisGuides.visible = gizmoVisible;
  }

  function applyPropellerRotation(propellers, propellerSpin) {
    propellers.forEach((propeller, index) => {
      propeller.rotation.x =
        propellerSpin[index] * MOTOR_SPIN_DIRECTIONS[index];
    });
  }

  function stepPreviewFleet({
    createDroneState,
    dt,
    getPreviewSpawnPosition,
    makeStartOrientation,
    simulateDroneStep
  }) {
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
        preview.propellerSpin[motorIndex] +=
          (output / config.maxMotorThrust) * 0.6;
      });
      applyPropellerRotation(preview.propellers, preview.propellerSpin);
    });
  }

  function updateLiveDroneVisual(liveDrone, propellerSpin) {
    if (!mainDrone || !liveDrone) {
      return;
    }

    mainDrone.position.copy(liveDrone.position);
    mainDrone.quaternion.copy(liveDrone.orientation);

    applyPropellerRotation(mainPropellers, propellerSpin);
  }

  function updateCameraFocus(liveDrone) {
    if (!liveDrone) {
      controls.update();
      return;
    }

    const focusPoint = liveDrone.position.clone().lerp(config.target, 0.35);
    controls.target.lerp(focusPoint, 0.06);
    controls.update();
  }

  function resize({ applyHudPosition, applyPanelWidth }) {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    applyPanelWidth();
    applyHudPosition();
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    initialize,
    render,
    resetPreviewFleet,
    resetTrailHistory,
    resize,
    sampleTrailPoint,
    setTargetHandlers,
    stepPreviewFleet,
    updateCameraFocus,
    updateGizmoVisibility,
    updateLiveDroneVisual,
    updateTargetVisuals
  };
}
