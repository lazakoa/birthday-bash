import { createProgram } from './gl.js';
import { createTextureFromCanvas } from './texture.js';
import { SPRITE_DEFS, spriteUv } from './atlas.js';
import { cameraMatrix } from './iso.js';

const VERTEX_SOURCE = `
precision mediump float;
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform vec2 u_viewSize;
uniform vec2 u_camera;
uniform float u_dpr;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec2 device = (a_position - u_camera) * u_dpr + u_viewSize * 0.5;
  vec2 clip = device / u_viewSize * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
  v_color = a_color;
}
`;

const FRAGMENT_SOURCE = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec4 texel = texture2D(u_texture, v_uv);
  if (texel.a < 0.004) discard;
  gl_FragColor = texel * v_color;
}
`;

const FLOATS_PER_VERTEX = 8;
const VERTICES_PER_SPRITE = 6;
const GROUND_SPRITES = new Set(['floor', 'floorAlt', 'highlight', 'shadow', 'stairs']);

export class SpriteRenderer {
  constructor(gl, maxSprites) {
    this.gl = gl;
    this.maxSprites = maxSprites;
    this.data = new Float32Array(maxSprites * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);
    this.buffer = gl.createBuffer();
    this.program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    this.texture = null;
    this.atlasCanvas = null;
    this.spriteCount = 0;
    this.overflowed = 0;
    this.camera = { x: 0, y: 0 };
    this.matrix = cameraMatrix(null);

    this.locations = {
      position: gl.getAttribLocation(this.program, 'a_position'),
      uv: gl.getAttribLocation(this.program, 'a_uv'),
      color: gl.getAttribLocation(this.program, 'a_color'),
      viewSize: gl.getUniformLocation(this.program, 'u_viewSize'),
      camera: gl.getUniformLocation(this.program, 'u_camera'),
      dpr: gl.getUniformLocation(this.program, 'u_dpr'),
      texture: gl.getUniformLocation(this.program, 'u_texture'),
    };

    this.uv = {};
    for (const [name, def] of Object.entries(SPRITE_DEFS)) {
      this.uv[name] = { ...spriteUv(def), ...{ w: def.w, h: def.h, ax: def.ax, ay: def.ay } };
    }
    this.whiteUv = {
      u: (this.uv.bar.u0 + this.uv.bar.u1) / 2,
      v: (this.uv.bar.v0 + this.uv.bar.v1) / 2,
    };

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  uploadAtlas(atlasCanvas) {
    this.atlasCanvas = atlasCanvas;
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = createTextureFromCanvas(this.gl, atlasCanvas);
  }

  begin(camera = null) {
    this.spriteCount = 0;
    this.overflowed = 0;
    this._vertexCursor = 0;
    this.camera = camera ?? { x: 0, y: 0 };
    this.matrix = cameraMatrix(camera);
  }

  draw(name, x, y, options = {}) {
    const sprite = this.uv[name];
    if (!sprite) throw new Error(`Unknown sprite: ${name}`);
    if (this.spriteCount >= this.maxSprites) {
      this.overflowed += 1;
      return;
    }

    const scaleX = options.scaleX ?? options.scale ?? 1;
    const scaleY = options.scaleY ?? options.scale ?? 1;
    const tint = options.tint ?? WHITE;
    const alpha = options.alpha ?? 1;
    const flipX = options.flipX ? -1 : 1;
    const anchorX = options.anchorX ?? sprite.ax;
    const anchorY = options.anchorY ?? sprite.ay;

    const width = sprite.w * scaleX;
    const height = sprite.h * scaleY;
    const left = -anchorX * scaleX;
    const top = -anchorY * scaleY;
    const right = left + width;
    const bottom = top + height;

    const matrix = this.matrix;
    const relativeX = x - this.camera.x;
    const relativeY = y - this.camera.y;
    const baseX =
      this.camera.x + matrix.m00 * relativeX + matrix.m01 * relativeY;
    const baseY =
      this.camera.y + matrix.m10 * relativeX + matrix.m11 * relativeY;
    const ground = options.ground ?? GROUND_SPRITES.has(name);

    let topLeftX;
    let topLeftY;
    let topRightX;
    let topRightY;
    let bottomRightX;
    let bottomRightY;
    let bottomLeftX;
    let bottomLeftY;
    if (ground) {
      topLeftX = baseX + matrix.m00 * left + matrix.m01 * top;
      topLeftY = baseY + matrix.m10 * left + matrix.m11 * top;
      topRightX = baseX + matrix.m00 * right + matrix.m01 * top;
      topRightY = baseY + matrix.m10 * right + matrix.m11 * top;
      bottomRightX = baseX + matrix.m00 * right + matrix.m01 * bottom;
      bottomRightY = baseY + matrix.m10 * right + matrix.m11 * bottom;
      bottomLeftX = baseX + matrix.m00 * left + matrix.m01 * bottom;
      bottomLeftY = baseY + matrix.m10 * left + matrix.m11 * bottom;
    } else {
      topLeftX = baseX + left;
      topLeftY = baseY + top;
      topRightX = baseX + right;
      topRightY = baseY + top;
      bottomRightX = baseX + right;
      bottomRightY = baseY + bottom;
      bottomLeftX = baseX + left;
      bottomLeftY = baseY + bottom;
    }

    let u0 = sprite.u0;
    let u1 = sprite.u1;
    if (flipX < 0) {
      const swap = u0;
      u0 = u1;
      u1 = swap;
    }

    const r = tint[0];
    const g = tint[1];
    const b = tint[2];
    const a = (tint[3] ?? 1) * alpha;

    this.pushVertex(topLeftX, topLeftY, u0, sprite.v0, r, g, b, a);
    this.pushVertex(topRightX, topRightY, u1, sprite.v0, r, g, b, a);
    this.pushVertex(bottomRightX, bottomRightY, u1, sprite.v1, r, g, b, a);
    this.pushVertex(topLeftX, topLeftY, u0, sprite.v0, r, g, b, a);
    this.pushVertex(bottomRightX, bottomRightY, u1, sprite.v1, r, g, b, a);
    this.pushVertex(bottomLeftX, bottomLeftY, u0, sprite.v1, r, g, b, a);
  }

  drawGroundQuad(points, options = {}) {
    if (!points || points.length !== 4) return;
    if (this.spriteCount >= this.maxSprites) {
      this.overflowed += 1;
      return;
    }

    const tint = options.tint ?? WHITE;
    const alpha = options.alpha ?? 1;
    const r = tint[0];
    const g = tint[1];
    const b = tint[2];
    const a = (tint[3] ?? 1) * alpha;
    const { u, v } = this.whiteUv;
    const matrix = this.matrix;
    const camera = this.camera;
    const projected = points.map((point) => {
      const relativeX = point.x - camera.x;
      const relativeY = point.y - camera.y;
      return {
        x: camera.x + matrix.m00 * relativeX + matrix.m01 * relativeY,
        y: camera.y + matrix.m10 * relativeX + matrix.m11 * relativeY,
      };
    });

    this.pushVertex(projected[0].x, projected[0].y, u, v, r, g, b, a);
    this.pushVertex(projected[1].x, projected[1].y, u, v, r, g, b, a);
    this.pushVertex(projected[2].x, projected[2].y, u, v, r, g, b, a);
    this.pushVertex(projected[0].x, projected[0].y, u, v, r, g, b, a);
    this.pushVertex(projected[2].x, projected[2].y, u, v, r, g, b, a);
    this.pushVertex(projected[3].x, projected[3].y, u, v, r, g, b, a);
  }

  pushVertex(x, y, u, v, r, g, b, a) {
    const offset = this.spriteCount * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX + this._vertexCursor;
    const data = this.data;
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = u;
    data[offset + 3] = v;
    data[offset + 4] = r;
    data[offset + 5] = g;
    data[offset + 6] = b;
    data[offset + 7] = a;
    this._vertexCursor += FLOATS_PER_VERTEX;
    if (this._vertexCursor >= VERTICES_PER_SPRITE * FLOATS_PER_VERTEX) {
      this._vertexCursor = 0;
      this.spriteCount += 1;
    }
  }

  flush(viewWidth, viewHeight, camera, dpr, background) {
    const gl = this.gl;
    gl.viewport(0, 0, viewWidth, viewHeight);
    gl.clearColor(background[0], background[1], background[2], background[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.spriteCount === 0) return;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.spriteCount * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX));

    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.locations.uv);
    gl.vertexAttribPointer(this.locations.uv, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(this.locations.color);
    gl.vertexAttribPointer(this.locations.color, 4, gl.FLOAT, false, stride, 16);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.locations.texture, 0);
    gl.uniform2f(this.locations.viewSize, viewWidth, viewHeight);
    gl.uniform2f(this.locations.camera, camera.x, camera.y);
    gl.uniform1f(this.locations.dpr, dpr);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.spriteCount * VERTICES_PER_SPRITE);
  }

  dispose() {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.program) gl.deleteProgram(this.program);
    this.texture = null;
    this.buffer = null;
    this.program = null;
  }

  _vertexCursor = 0;
}

const WHITE = [1, 1, 1, 1];
