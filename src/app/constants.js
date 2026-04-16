import * as THREE from "three";

export const WORLD_UP = new THREE.Vector3(0, 1, 0);
export const DRONE_BASE_OFFSET = 0.35;
export const INPUT_SIZE = 14;
export const HIDDEN_SIZE = 12;
export const OUTPUT_SIZE = 4;
export const GENOME_SIZE =
  INPUT_SIZE * HIDDEN_SIZE +
  HIDDEN_SIZE +
  HIDDEN_SIZE * OUTPUT_SIZE +
  OUTPUT_SIZE;

export const MOTOR_SPIN_DIRECTIONS = [1, -1, -1, 1];
export const INERTIA = new THREE.Vector3(0.5, 0.8, 0.5);
