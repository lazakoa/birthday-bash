import { CAMERA } from '../config.js';

const DEGREES_TO_RADIANS = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export const INITIAL_YAW = CAMERA.initialYawDegrees * DEGREES_TO_RADIANS;
export const INITIAL_PITCH = CAMERA.initialPitchDegrees * DEGREES_TO_RADIANS;
const MIN_PITCH = CAMERA.minPitchDegrees * DEGREES_TO_RADIANS;
const MAX_PITCH = CAMERA.maxPitchDegrees * DEGREES_TO_RADIANS;

export function createCamera(x, y) {
  return { x, y, yaw: INITIAL_YAW, pitch: INITIAL_PITCH };
}

export function snapCamera(camera, target) {
  camera.x = target.x;
  camera.y = target.y;
}

export function followCamera(camera, target, dt, sharpness) {
  const t = 1 - Math.exp(-sharpness * dt);
  camera.x += (target.x - camera.x) * t;
  camera.y += (target.y - camera.y) * t;
  return camera;
}

export function isInitialView(camera) {
  if (!Number.isFinite(camera?.yaw) || !Number.isFinite(camera?.pitch)) return true;
  return Math.abs(camera.yaw - INITIAL_YAW) < 1e-9 && Math.abs(camera.pitch - INITIAL_PITCH) < 1e-9;
}

export function resetCameraView(camera) {
  if (!camera) return;
  camera.yaw = INITIAL_YAW;
  camera.pitch = INITIAL_PITCH;
}

export function updateCameraView(camera, dt, { left = false, right = false, up = false, down = false } = {}) {
  if (!camera) return;
  const yawDirection = (left ? 1 : 0) - (right ? 1 : 0);
  const pitchDirection = (up ? 1 : 0) - (down ? 1 : 0);

  camera.yaw = wrapAngle(
    camera.yaw + yawDirection * CAMERA.yawDegreesPerSecond * DEGREES_TO_RADIANS * dt,
  );
  const pitch = camera.pitch + pitchDirection * CAMERA.pitchDegreesPerSecond * DEGREES_TO_RADIANS * dt;
  camera.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
}

function wrapAngle(angle) {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}
