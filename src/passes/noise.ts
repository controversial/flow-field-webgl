import { gl } from '../context';
import { createProgram } from '../utils/shader';
import type { SceneContext } from '../renderer';


// Create program
import vertexShaderSrc from '../shaders/passthrough-vert.glsl';
import fragmentShaderSrc from '../shaders/noise-frag.glsl';

const program = createProgram(gl, vertexShaderSrc, fragmentShaderSrc);
if (!program) throw new Error('Failed to create program');


// Create VAO
const vao = gl.createVertexArray();
if (!vao) throw new Error('couldn’t create VAO');

const vertexBuffer = gl.createBuffer();
if (!vertexBuffer) throw new Error('couldn’t create vertex buffer');
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);

gl.bindVertexArray(vao);
const aPosition = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(aPosition);
gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

const uResolution = gl.getUniformLocation(program, 'u_resolution');
const uScreenDpr = gl.getUniformLocation(program, 'u_screen_dpr');
const uTime = gl.getUniformLocation(program, 'u_time');


// Draw step
export function draw(ctx: SceneContext) {
  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.uniform2f(uResolution, ctx.size[0], ctx.size[1]);
  gl.uniform1f(uScreenDpr, window.devicePixelRatio);
  gl.uniform1f(uTime, ctx.time / 1000);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
