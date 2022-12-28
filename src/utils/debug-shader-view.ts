import vertexShaderSrc from '../shaders/passthrough-vert.glsl';
import { LooseUniformsDefinition, Program, UniformsDefinition } from './shader';
import { gl } from '../context';
import type { SceneContext } from '../renderer';


export default function drawShaderFullscreen(
  fragmentShaderSrc: string,
  uniforms: UniformsDefinition,
) {
  const allUniforms = {
    ...uniforms,
    resolution: { type: 'vec2' },
    screenDpr: { type: 'float' },
    time: { type: 'float' },
  } satisfies LooseUniformsDefinition;

  const program = new Program(gl, vertexShaderSrc, fragmentShaderSrc, ['position'], allUniforms);

  const vao = gl.createVertexArray();
  if (!vao) throw new Error('couldn’t create VAO');

  const vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) throw new Error('couldn’t create vertex buffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);

  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(program.attributes.position.location);
  gl.vertexAttribPointer(program.attributes.position.location, 2, gl.FLOAT, false, 0, 0);

  // cleanup
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return (ctx: SceneContext) => {
    // Set up
    program.use({
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
      time: { type: 'float', value: ctx.time },
    });
    gl.bindVertexArray(vao);

    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Clean up
    gl.bindVertexArray(null);
    gl.useProgram(null);
  };
}
