export function createCamera(x, y) {
  return { x, y };
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
