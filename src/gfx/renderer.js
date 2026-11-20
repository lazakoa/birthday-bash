import { createProgram } from './gl.js';
import { createTextureFromCanvas } from './texture.js';
import { SPRITE_DEFS, spriteUv } from './atlas.js';

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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  uploadAtlas(atlasCanvas) {
    this.atlasCanvas = atlasCanvas;
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = createTextureFromCanvas(this.gl, atlasCanvas);
  }

  begin() {
    this.spriteCount = 0;
    this.overflowed = 0;
    this._vertexCursor = 0;
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
    const x0 = x - anchorX * scaleX;
    const y0 = y - anchorY * scaleY;
    const x1 = x0 + width;
    const y1 = y0 + height;

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

    this.pushVertex(x0, y0, u0, sprite.v0, r, g, b, a);
    this.pushVertex(x1, y0, u1, sprite.v0, r, g, b, a);
    this.pushVertex(x1, y1, u1, sprite.v1, r, g, b, a);
    this.pushVertex(x0, y0, u0, sprite.v0, r, g, b, a);
    this.pushVertex(x1, y1, u1, sprite.v1, r, g, b, a);
    this.pushVertex(x0, y1, u0, sprite.v1, r, g, b, a);
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
