import vertexShaderSrc from '../shaders/passthrough-vert.glsl';
import { createProgram } from './shader';
import { gl } from '../context';
import type { SceneContext } from '../renderer';


export default function drawShaderFullscreen(
  fragmentShaderSrc: string,
  uniforms: Record<string, number[] | number | WebGLTexture> = {},
) {
  const program = createProgram(gl, vertexShaderSrc, fragmentShaderSrc);

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
  const otherUniforms = Object.keys(uniforms).map((name) => gl.getUniformLocation(program, name));

  return (ctx: SceneContext) => {
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // Bind uniforms
    gl.uniform2f(uResolution, ctx.size[0], ctx.size[1]);
    gl.uniform1f(uScreenDpr, ctx.dpr);
    gl.uniform1f(uTime, ctx.time / 1000);
    let textureCount = 0;
    const textureLimit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    otherUniforms.forEach((_, i) => {
      const position = otherUniforms[i];
      const value = uniforms[Object.keys(uniforms)[i]];
      if (Array.isArray(value)) {
        if (value.length !== 1 && value.length !== 2 && value.length !== 3 && value.length !== 4) return;
        gl[`uniform${value.length}fv`](position, value);
      } else if (typeof value === 'number') {
        gl.uniform1f(position, value);
      } else if (value instanceof WebGLTexture) {
        if (textureCount > textureLimit) return;
        gl.activeTexture(gl.TEXTURE0 + textureCount);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(position, textureCount);
        textureCount++;
      }
    });

    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}
