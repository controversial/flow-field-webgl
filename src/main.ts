import './style.scss';

import { createProgram } from './shaders';
import vertexShaderSrc from './shaders/vertex.glsl';
import fragmentShaderSrc from './shaders/fragment.glsl';

const canvas = document.getElementById('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Can’t find canvas');

// Set canvas size
const size = canvas.getBoundingClientRect();
const dpr = window.devicePixelRatio ?? 1;
canvas.width = size.width * dpr;
canvas.height = size.height * dpr;

// Get webgl context
const gl = canvas.getContext('webgl2');
if (!gl) throw new Error('Can’t get gl context');

// Compile shaders and create program
const program = createProgram(gl, vertexShaderSrc, fragmentShaderSrc);
if (!program) throw new Error('Program was null');

// Set up geometry
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);

// Bind vertex data to `a_position` attribute
const positionAttributeLocation = gl.getAttribLocation(program, 'a_position');
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
gl.enableVertexAttribArray(positionAttributeLocation);
gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

const resolutionUniformLocation = gl.getUniformLocation(program, 'u_resolution');
const dprUniformLocation = gl.getUniformLocation(program, 'u_screen_dpr');
const timeUniformLocation = gl.getUniformLocation(program, 'u_time');

const startTime = Date.now();
function draw() {
  if (!gl) return;
  // Set up clear viewport
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  // Bind attributes
  gl.bindVertexArray(vao);
  // Bind uniforms
  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
  gl.uniform1f(dprUniformLocation, window.devicePixelRatio ?? 1);
  gl.uniform1f(timeUniformLocation, (Date.now() - startTime) / 1000);
  // Draw call
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Render loop
let nextFrame: number | null = null;
function render() {
  draw();
  nextFrame = requestAnimationFrame(render);
}
render();

// ResizeObserver for canvas
const resizeObserver = new ResizeObserver(() => {
  const newSize = canvas.getBoundingClientRect();
  const newDpr = window.devicePixelRatio ?? 1;
  canvas.width = newSize.width * newDpr;
  canvas.height = newSize.height * newDpr;
  draw();
});

resizeObserver.observe(canvas);

// Vite HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (nextFrame) cancelAnimationFrame(nextFrame);
    resizeObserver.disconnect();
  });
}
