import { gl, canvas } from '../context';
import { createProgram } from '../utils/shader';
import type { SceneContext } from '../renderer';

import passthroughVertexSrc from '../shaders/passthrough-vert.glsl';
import noiseFragmentSrc from '../shaders/noise-frag.glsl';
import traceFragmentSrc from '../shaders/line-trace-frag.glsl';

import linesVertexSrc from '../shaders/lines-vert.glsl';
import linesFragmentSrc from '../shaders/lines-frag.glsl';



/** How many lines to render? needs to be capped at GL_MAX_TEXTURE_SIZE */
const NUM_LINES = 2048;
/** How many “points” in each line? needs to be capped as well */
const NUM_LINE_POINTS = 40;
/** How far across the noise field to move at each step? in dpr-normalized pixels */
const STEP_SIZE = 2;
/** Line width in dpr-normalized pixels */
const LINE_WIDTH = 6;
/** Line opacity */
const LINE_ALPHA = 0.25;
/** How much of the lines’ sides to antialias? in dpr-normalized pixels */
const LINE_FEATHER_WIDTH = 2;


const noiseProgram = createProgram(gl, passthroughVertexSrc, noiseFragmentSrc);
const noiseProgramLocations = {
  aPosition: gl.getAttribLocation(noiseProgram, 'a_position'),

  uTime: gl.getUniformLocation(noiseProgram, 'u_time'),
  uScreenDpr: gl.getUniformLocation(noiseProgram, 'u_screen_dpr'),
  uResolution: gl.getUniformLocation(noiseProgram, 'u_resolution'),
};

const traceProgram = createProgram(gl, passthroughVertexSrc, traceFragmentSrc);
const traceProgramLocations = {
  aPosition: gl.getAttribLocation(traceProgram, 'a_position'),

  uPositionsTexture: gl.getUniformLocation(traceProgram, 'u_positions_texture'),
  uFieldTexture: gl.getUniformLocation(traceProgram, 'u_field_texture'),
  uStepNumber: gl.getUniformLocation(traceProgram, 'u_step_number'),
  uStepSize: gl.getUniformLocation(traceProgram, 'u_step_size'),
  uScreenDpr: gl.getUniformLocation(traceProgram, 'u_screen_dpr'),
  uResolution: gl.getUniformLocation(traceProgram, 'u_resolution'),
};


// “fullscreen” vao is for noise/trace programs
const fullscreenVao = gl.createVertexArray();
if (!fullscreenVao) throw new Error('couldn’t create VAO');
const vertexBuffer = gl.createBuffer();
if (!vertexBuffer) throw new Error('couldn’t create vertex buffer');
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);
gl.bindVertexArray(fullscreenVao);
if (noiseProgramLocations.aPosition !== traceProgramLocations.aPosition) throw new Error('attribute locations don’t match in noise/trace shaders');
gl.enableVertexAttribArray(noiseProgramLocations.aPosition);
gl.vertexAttribPointer(noiseProgramLocations.aPosition, 2, gl.FLOAT, false, 0, 0);




const linesProgram = createProgram(gl, linesVertexSrc, linesFragmentSrc);
const linesProgramLocations = {
  // which line instance this point belongs to comes from gl_InstanceID
  aLinePoint: gl.getAttribLocation(linesProgram, 'a_line_point'), // which “line point” this point in geometry belongs to
  aNormal: gl.getAttribLocation(linesProgram, 'a_normal'), // is this the left or right side of the line?

  uPositionsTexture: gl.getUniformLocation(linesProgram, 'u_positions_texture'),
  uResolution: gl.getUniformLocation(linesProgram, 'u_resolution'),
  uScreenDpr: gl.getUniformLocation(linesProgram, 'u_screen_dpr'),
  uLineWidth: gl.getUniformLocation(linesProgram, 'u_line_width'),
  uLineFeatherWidth: gl.getUniformLocation(linesProgram, 'u_line_feather_width'),
  uLineAlpha: gl.getUniformLocation(linesProgram, 'u_line_alpha'),
  uNumLinePoints: gl.getUniformLocation(linesProgram, 'u_num_line_points'),
  uStepSize: gl.getUniformLocation(linesProgram, 'u_step_size'),
};

// Line VAO is for lines program
const lineVao = gl.createVertexArray();
if (!lineVao) throw new Error('couldn’t create VAO');

// In order to make thick lines, we need 2 points of geometry per “line point.”
// For each point, we need to encode which “line point” it corresponds to, and whether it’s the
// “left” or the “right” side of the line.
const dataPerPoint = 2 * (1 + 1);
const linePoints = new Uint16Array(NUM_LINE_POINTS * dataPerPoint);
for (let i = 0; i < NUM_LINE_POINTS; i++) {
  // First point
  linePoints[i * dataPerPoint + 0] = i; // This point belongs to the ith “line point”
  linePoints[i * dataPerPoint + 1] = -1; // First point has -1 “normal” indicating the left side of the line
  // Second point
  linePoints[i * dataPerPoint + 2] = i;
  linePoints[i * dataPerPoint + 3] = 1; // Second point has +1 “normal” indicating the right side of the line
}

// 2 triangles (6 points) for each “step” between line points
const lineIndices = new Int16Array((NUM_LINE_POINTS - 1) * 6);
for (let i = 0; i < NUM_LINE_POINTS - 1; i++) {
  const bottomLeft = i * 2 + 0;
  const bottomRight = i * 2 + 1;
  const topLeft = i * 2 + 2;
  const topRight = i * 2 + 3;
  // Triangle 1: bottomRight/topRight/bottomLeft
  lineIndices[i * 6 + 0] = bottomRight;
  lineIndices[i * 6 + 1] = topRight;
  lineIndices[i * 6 + 2] = bottomLeft;
  // Triangle 2: bottomLeft/topRight/topLeft
  lineIndices[i * 6 + 3] = bottomLeft;
  lineIndices[i * 6 + 4] = topRight;
  lineIndices[i * 6 + 5] = topLeft;
}

// Fill lines VAO
gl.bindVertexArray(lineVao);
const lineVertexBuffer = gl.createBuffer();
if (!lineVertexBuffer) throw new Error('couldn’t create vertex buffer');
// Bind gl.ARRAY_BUFFER to our constructed data
gl.bindBuffer(gl.ARRAY_BUFFER, lineVertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, linePoints, gl.STATIC_DRAW);
// Set up the “line point” attribute (first float from each pair)
gl.enableVertexAttribArray(linesProgramLocations.aLinePoint);
gl.vertexAttribIPointer(linesProgramLocations.aLinePoint, 1, gl.SHORT, 2 * Int16Array.BYTES_PER_ELEMENT, 0);
// Set up the “normal” attribute (second float from each pair)
gl.enableVertexAttribArray(linesProgramLocations.aNormal);
gl.vertexAttribIPointer(linesProgramLocations.aNormal, 1, gl.SHORT, 2 * Int16Array.BYTES_PER_ELEMENT, 1 * Int16Array.BYTES_PER_ELEMENT);
// Set up the index buffer
const lineIndexBuffer = gl.createBuffer();
if (!lineIndexBuffer) throw new Error('couldn’t create index buffer');
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineIndexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lineIndices, gl.STATIC_DRAW);


// clean up
gl.bindVertexArray(null);
gl.bindBuffer(gl.ARRAY_BUFFER, null);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);


export default class LineField {
  /**
   * The “flow field” which influences the direction, shape, and movement of the lines.
   * - size: matches canvas size
   * - format: R16UI
   * - data: 0 represents an angle pointing to the right; 65535 represents a ccw rotation of 360° from that point
   */
  fieldTexture: WebGLTexture;

  /**
   * Holds the current positions of each segment of each line. First row matches startingPoints.
   * - size: NUM_LINES × NUM_LINE_POINTS
   * - format: RG16UI
   */
  positionsTexture: WebGLTexture;
  private tempPositionsTexture: WebGLTexture; // for swapping

  private framebuffer: WebGLFramebuffer;

  constructor() {
    // Initialize starting values. The first NUM_LINES * 2 values are the starting positions; the rest are 0
    // TODO: voronoi relaxation for more natural grid?
    const startingPoints = new Uint16Array(NUM_LINES * NUM_LINE_POINTS * 2);
    for (let i = 0; i < NUM_LINES; i++) {
      startingPoints[i * 2] = Math.floor(Math.random() * (2 ** 16));
      startingPoints[i * 2 + 1] = Math.floor(Math.random() * (2 ** 16));
    }
    // Initialize primary positions texture
    const positionsTexture = gl.createTexture();
    if (!positionsTexture) throw new Error('couldn’t create texture');
    this.positionsTexture = positionsTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, NUM_LINES, NUM_LINE_POINTS, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, startingPoints);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Initialize secondary positions texture
    const tempPositionsTexture = gl.createTexture();
    if (!tempPositionsTexture) throw new Error('couldn’t create texture');
    this.tempPositionsTexture = tempPositionsTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.tempPositionsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, NUM_LINES, NUM_LINE_POINTS, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, startingPoints);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Initialize field texture
    const fieldTexture = gl.createTexture();
    if (!fieldTexture) throw new Error('couldn’t create texture');
    this.fieldTexture = fieldTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, canvas.width, canvas.height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(canvas.width * canvas.height).fill(2 ** 16 - 1));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    // Create framebuffer
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('couldn’t create framebuffer');
    this.framebuffer = framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // Clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  onResize(ctx: SceneContext) {
    console.log('onResize');
    const [width, height] = ctx.size;
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(width * height));
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  update(ctx: SceneContext) {
    // We’re going to render everything to textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    // We’re going to render the entire viewport with every draw.
    // This vao is enforced to be compatible with noiseProgram and traceProgram
    gl.bindVertexArray(fullscreenVao);
    // We don’t want blending because we’re drawing values out of 0–1 range
    gl.disable(gl.BLEND);

    // Draw noise shader to field texture
    gl.useProgram(noiseProgram);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTexture, 0);
    // Bind uniforms
    gl.uniform2f(noiseProgramLocations.uResolution, ctx.size[0], ctx.size[1]);
    gl.uniform1f(noiseProgramLocations.uScreenDpr, ctx.dpr);
    gl.uniform1f(noiseProgramLocations.uTime, ctx.time / 1000);
    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Use trace shader to trace lines step by step
    gl.useProgram(traceProgram);
    gl.enable(gl.SCISSOR_TEST); // allows us to draw one row at a time

    // Each step is a separate draw call
    for (let i = 0; i < NUM_LINE_POINTS - 1; i++) {
      // We draw two rows at each step:
      // 1. We copy the “previous step” row from the input texture to the output texture to ensure every row is present in both textures
      // 2. We trace the field to write a new row to the output texture
      gl.viewport(0, i, NUM_LINES, 2); // y=i is the “previous step” row, y=i+1 is the new row
      gl.scissor(0, i, NUM_LINES, 2);
      // We render to the temp texture
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tempPositionsTexture, 0);
      // Pass in the “primary” texture to read positions from
      gl.uniform1i(traceProgramLocations.uPositionsTexture, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.positionsTexture);
      // Pass in field texture
      gl.uniform1i(traceProgramLocations.uFieldTexture, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.fieldTexture);
      // Pass in the current step
      gl.uniform1i(traceProgramLocations.uStepNumber, i);
      // Pass in step size
      gl.uniform1f(traceProgramLocations.uStepSize, STEP_SIZE);
      // Pass in screen parameters
      gl.uniform2f(traceProgramLocations.uResolution, ctx.size[0], ctx.size[1]);
      gl.uniform1f(traceProgramLocations.uScreenDpr, ctx.dpr);
      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Swap textures so the texture we rendered to is the “primary” texture
      const temp = this.positionsTexture;
      this.positionsTexture = this.tempPositionsTexture;
      this.tempPositionsTexture = temp;
    }

    // clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
  }

  draw(ctx: SceneContext) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(linesProgram);
    gl.bindVertexArray(lineVao);

    // Bind positions texture
    gl.uniform1i(linesProgramLocations.uPositionsTexture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.positionsTexture);
    // Bind uniforms
    gl.uniform2f(linesProgramLocations.uResolution, ctx.size[0], ctx.size[1]);
    gl.uniform1f(linesProgramLocations.uScreenDpr, ctx.dpr);
    gl.uniform1f(linesProgramLocations.uLineWidth, LINE_WIDTH);
    gl.uniform1f(linesProgramLocations.uLineFeatherWidth, LINE_FEATHER_WIDTH);
    gl.uniform1f(linesProgramLocations.uLineAlpha, LINE_ALPHA);
    gl.uniform1i(linesProgramLocations.uNumLinePoints, NUM_LINE_POINTS);
    gl.uniform1f(linesProgramLocations.uStepSize, STEP_SIZE);

    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawElementsInstanced(gl.TRIANGLES, lineIndices.length, gl.UNSIGNED_SHORT, 0, NUM_LINES);
  }
}
