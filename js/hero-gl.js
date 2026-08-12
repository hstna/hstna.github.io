/* Hero 粒子：從亂數位置（混亂）隨捲動內插到規則網格（秩序）。
   原生 WebGL，單一 draw call，30fps 上限，離開視窗即停。
   COLS/ROWS 必須與 main.js 的靜態 SVG 網格一致。 */

const COLS = 24;
const ROWS = 12;
const MAX_PARTICLES = 2000;
const FPS_CAP = 30;

const VERT = `
attribute vec2 a_chaos;
attribute vec2 a_order;
attribute float a_seed;
uniform float u_progress;
uniform float u_time;
uniform vec2 u_res;
varying float v_alpha;
void main() {
  float t = clamp(u_progress * 1.35 - a_seed * 0.35, 0.0, 1.0);
  float e = t * t * (3.0 - 2.0 * t);
  vec2 drift = vec2(sin(u_time * 0.4 + a_seed * 30.0),
                    cos(u_time * 0.33 + a_seed * 21.0)) * 0.012 * (1.0 - e);
  vec2 p = mix(a_chaos + drift, a_order, e);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = mix(2.0, 3.2, e) * min(u_res.x / 600.0, 2.0);
  v_alpha = mix(0.5, 0.95, e);
}`;

const FRAG = `
precision mediump float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(u_color, v_alpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.info('[hero] shader error', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
}

export default function initHero(canvas, { accent }) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const count = Math.min(COLS * ROWS, MAX_PARTICLES);
  const chaos = new Float32Array(count * 2);
  const order = new Float32Array(count * 2);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    order[i * 2] = (c + 0.5) / COLS;
    order[i * 2 + 1] = 1.0 - (r + 0.5) / ROWS;
    chaos[i * 2] = Math.random();
    chaos[i * 2 + 1] = Math.random();
    seed[i] = Math.random();
  }

  function bindAttr(name, data, size) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  }

  const buffers = [
    bindAttr('a_chaos', chaos, 2),
    bindAttr('a_order', order, 2),
    bindAttr('a_seed', seed, 1),
  ];

  const uProgress = gl.getUniformLocation(prog, 'u_progress');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uColor = gl.getUniformLocation(prog, 'u_color');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  gl.uniform3fv(uColor, hexToRgb(accent));

  /* 主題切換時同步顏色 */
  const themeWatcher = new MutationObserver(() => {
    const next = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent')
      .trim();
    gl.useProgram(prog);
    gl.uniform3fv(uColor, hexToRgb(next));
  });
  themeWatcher.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5); /* 上限 1.5x：省 GPU */
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    }
  }

  let running = false;
  let raf = 0;
  let last = 0;
  const interval = 1000 / FPS_CAP;
  const t0 = performance.now();

  /* 對齊必須在 hero 還看得見的時候完成，否則敘事的關鍵時刻發生在畫面外。
     只用 hero 前 45% 的捲動距離走完 0 → 1。 */
  const CONVERGE_SPAN = 0.45;

  function progress() {
    const rect = canvas.getBoundingClientRect();
    const total = (rect.height || 1) * CONVERGE_SPAN;
    return Math.min(Math.max(-rect.top / total, 0), 1);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < interval) return; /* 節流到 30fps */
    last = now;
    resize();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uProgress, progress());
    gl.uniform1f(uTime, (now - t0) / 1000);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  const handle = {
    setRunning(on) {
      if (on === running) return;
      running = on;
      if (on) raf = requestAnimationFrame(frame);
      else cancelAnimationFrame(raf);
    },
    destroy() {
      handle.setRunning(false);
      themeWatcher.disconnect();
      buffers.forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };

  handle.setRunning(true);
  return handle;
}
