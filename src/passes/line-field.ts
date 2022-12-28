import { gl, canvas } from '../context';
import { Program, UniformsDefinition } from '../utils/shader';
import type { SceneContext } from '../renderer';
import PerformanceTimer from '../utils/performance-timer';

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
/** How should the noise field look? */
const NOISE_PARAMS = {
  frequency: { type: 'float', value: 1 },            // (first harmonic’s) scale
  amplitude: { type: 'float', value: 0.5 },          // (first harmonic’s) height
  harmonics: { type: 'int', value: 4 },              // number of layers to stack
  harmonicSpread: { type: 'float', value: 1.5 },     // difference in frequency between harmonics
  harmonicGain: { type: 'float', value: 0.7 },       // difference in amplitude between harmonics
  harmonicTravel: { type: 'vec2', value: [13, 11] }, // how much we shift coordiantes between harmonics (so that the harmonics don't line up)
  speed: { type: 'float', value: 0.05 },             // how fast the noise moves
} satisfies UniformsDefinition;
// Calculate amplitude of noise based on these parameters
let NOISE_MAX_AMPLITUDE = 0;
let tempAmplitude = NOISE_PARAMS.amplitude.value;
for (let i = 0; i < NOISE_PARAMS.harmonics.value; i++) {
  NOISE_MAX_AMPLITUDE += tempAmplitude;
  tempAmplitude *= NOISE_PARAMS.harmonicGain.value;
}

const noiseProgram = new Program(
  gl,
  passthroughVertexSrc,
  noiseFragmentSrc,
  ['position'],
  {
    time: { type: 'float' },
    screenDpr: { type: 'float' },
    resolution: { type: 'vec2' },
    ...NOISE_PARAMS,
  }
);

const traceProgram = new Program(
  gl,
  passthroughVertexSrc,
  traceFragmentSrc,
  ['position'],
  {
    positionsTexture: { type: 'usampler2D' },
    fieldTexture: { type: 'usampler2D' },
    fieldAmplitude: { type: 'float', value: NOISE_MAX_AMPLITUDE },
    stepNumber: { type: 'int' },
    stepSize: { type: 'float', value: STEP_SIZE },
    screenDpr: { type: 'float' },
    resolution: { type: 'vec2' },
  }
);


// “fullscreen” vao is for noise/trace programs
const fullscreenVao = gl.createVertexArray();
if (!fullscreenVao) throw new Error('couldn’t create VAO');
const vertexBuffer = gl.createBuffer();
if (!vertexBuffer) throw new Error('couldn’t create vertex buffer');
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 3, -1, -1, 3, -1]), gl.STATIC_DRAW);
gl.bindVertexArray(fullscreenVao);
if (!noiseProgram.attributes.position || noiseProgram.attributes.position.location !== traceProgram.attributes.position.location) throw new Error('attribute locations don’t match in noise/trace shaders');
gl.enableVertexAttribArray(noiseProgram.attributes.position.location);
gl.vertexAttribPointer(noiseProgram.attributes.position.location, 2, gl.FLOAT, false, 0, 0);




const linesProgram = new Program(
  gl,
  linesVertexSrc,
  linesFragmentSrc,
  ['linePoint', 'normal'],
  {
    positionsTexture: { type: 'usampler2D' },
    resolution: { type: 'vec2' },
    screenDpr: { type: 'float' },
    lineWidth: { type: 'float', value: LINE_WIDTH },
    lineFeatherWidth: { type: 'float', value: LINE_FEATHER_WIDTH },
    lineAlpha: { type: 'float', value: LINE_ALPHA },
    numLinePoints: { type: 'int', value: NUM_LINE_POINTS },
    stepSize: { type: 'float', value: STEP_SIZE },
  }
);

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
gl.enableVertexAttribArray(linesProgram.attributes.linePoint.location);
gl.vertexAttribIPointer(linesProgram.attributes.linePoint.location, 1, gl.SHORT, 2 * Int16Array.BYTES_PER_ELEMENT, 0);
// Set up the “normal” attribute (second float from each pair)
gl.enableVertexAttribArray(linesProgram.attributes.normal.location);
gl.vertexAttribIPointer(linesProgram.attributes.normal.location, 1, gl.SHORT, 2 * Int16Array.BYTES_PER_ELEMENT, 1 * Int16Array.BYTES_PER_ELEMENT);
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

  timers: {
    trace: PerformanceTimer;
    draw: PerformanceTimer;
  };

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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create framebuffer
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('couldn’t create framebuffer');
    this.framebuffer = framebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    // Clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Timers
    this.timers = {
      trace: new PerformanceTimer(),
      draw: new PerformanceTimer(),
    };
  }

  onResize(ctx: SceneContext) {
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
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldTexture, 0);
    noiseProgram.use({
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
      time: { type: 'float', value: ctx.time / 1000 },
    });
    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Use trace shader to trace lines step by step
    this.timers.trace.start();
    traceProgram.use({
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
    });

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
      traceProgram.bindUniforms({
        // and we read from the “primary” texture
        positionsTexture: { type: 'usampler2D', value: this.positionsTexture },
        fieldTexture: { type: 'usampler2D', value: this.fieldTexture },
        stepNumber: { type: 'int', value: i },
      });

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Swap textures so that the (now more up to date) texture we rendered to becomes the “primary” texture
      const temp = this.positionsTexture;
      this.positionsTexture = this.tempPositionsTexture;
      this.tempPositionsTexture = temp;
    }

    // clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    this.timers.trace.stop();
  }

  draw(ctx: SceneContext) {
    this.timers.draw.start();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(lineVao);

    linesProgram.use({
      positionsTexture: { type: 'usampler2D', value: this.positionsTexture },
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
    });

    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawElementsInstanced(gl.TRIANGLES, lineIndices.length, gl.UNSIGNED_SHORT, 0, NUM_LINES);
    this.timers.draw.stop();
  }
}
