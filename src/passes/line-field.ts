import { Program, UniformsDefinition, LooseUniformsDefinition } from '../utils/shader';
import type { SceneContext } from '../renderer';
import PerformanceTimer from '../utils/performance-timer';
import alea from 'seedrandom/lib/alea';

import passthroughVertexSrc from '../shaders/passthrough-vert.glsl';
import noiseFragmentSrc from '../shaders/noise-frag.glsl';
import traceFragmentSrc from '../shaders/line-trace-frag.glsl';

import linesVertexSrc from '../shaders/lines-vert.glsl';
import linesFragmentSrc from '../shaders/lines-frag.glsl';

/** How much of the lines’ sides to antialias? in dpr-normalized pixels */
const LINE_FEATHER_WIDTH = 2;

/** Default settings for noise */
const DEFAULT_NOISE_PARAMS = {
  frequency: { type: 'float', value: 1 },            // (first harmonic’s) scale
  amplitude: { type: 'float', value: 0.5 },          // (first harmonic’s) height
  harmonics: { type: 'int', value: 4 },              // number of layers to stack
  harmonicSpread: { type: 'float', value: 1.5 },     // difference in frequency between harmonics
  harmonicGain: { type: 'float', value: 0.7 },       // difference in amplitude between harmonics
  harmonicTravel: { type: 'vec2', value: [13, 11] }, // how much we shift coordiantes between harmonics (so that the harmonics don't line up)
  speed: { type: 'float', value: 0.05 },             // how fast the noise moves
} satisfies UniformsDefinition;


const NOISE_PROGRAM_ATTRIBUTES = ['position'] as const;
const NOISE_PROGRAM_UNIFORMS = {
  time: { type: 'float' },
  screenDpr: { type: 'float' },
  resolution: { type: 'vec2' },
  ...DEFAULT_NOISE_PARAMS,
} satisfies LooseUniformsDefinition;


const TRACE_PROGRAM_ATTRIBUTES = ['position'] as const;
const TRACE_PROGRAM_UNIFORMS = {
  positionsTexture: { type: 'usampler2D' },
  fieldTexture: { type: 'usampler2D' },
  fieldAmplitude: { type: 'float' },
  stepNumber: { type: 'int' },
  stepSize: { type: 'float' },
  screenDpr: { type: 'float' },
  resolution: { type: 'vec2' },
} satisfies LooseUniformsDefinition;


const LINES_PROGRAM_ATTRIBUTES = ['linePoint', 'normal'] as const;
const LINES_PROGRAM_UNIFORMS = {
  positionsTexture: { type: 'usampler2D' },
  resolution: { type: 'vec2' },
  screenDpr: { type: 'float' },
  lineWidth: { type: 'float' },
  lineFeatherWidth: { type: 'float', value: LINE_FEATHER_WIDTH },
  lineAlpha: { type: 'float' },
  numLinePoints: { type: 'int' },
  stepSize: { type: 'float' },
} satisfies LooseUniformsDefinition;


/** Calculate maximum possible amplitude of noise based on its parameters */
function getMaxNoiseAmplitude(params: typeof DEFAULT_NOISE_PARAMS) {
  let maxAmplitude = 0;
  let tempAmplitude = params.amplitude.value;
  for (let i = 0; i < params.harmonics.value; i++) {
    maxAmplitude += tempAmplitude;
    tempAmplitude *= params.harmonicGain.value;
  }
  return maxAmplitude;
}



export default class LineField {
  gl: WebGL2RenderingContext;

  programs: {
    /** Program to draw noise field */
    noise: Program<keyof typeof NOISE_PROGRAM_UNIFORMS, (typeof NOISE_PROGRAM_ATTRIBUTES)[number]>;
    /** Program to trace the positions of the lines */
    trace: Program<keyof typeof TRACE_PROGRAM_UNIFORMS, (typeof TRACE_PROGRAM_ATTRIBUTES)[number]>;
    /** Program to render the lines in their final form */
    lines: Program<keyof typeof LINES_PROGRAM_UNIFORMS, (typeof LINES_PROGRAM_ATTRIBUTES)[number]>;
  };

  vaos: {
    /** VAO for the 'trace' and 'lines' programs */
    fullscreen: WebGLVertexArrayObject;
    /** VAO for the lines program */
    line: WebGLVertexArrayObject;
  };

  textures: {
    /** The “flow field” which influences the direction, shape, and movement of the lines. */
    field: WebGLTexture;
    /** Holds the current positions of each segment of each line. First row matches startingPoints. */
    positions: WebGLTexture;
    _tempPositions: WebGLTexture; // for swapping
  };
  framebuffer: WebGLFramebuffer;


  /** Settings for the simulation (accessed and controlled through getters & setters so that texture sizes stay up to date) */
  private settings = {
    /** How many lines to render? Can’t exceed GL_MAX_TEXTURE_SIZE */
    numLines: 2048,
    /** Seed for RNG that decides line start positions */
    seed: 'hello world',
    /** How many “points” in each line? Can’t exceed GL_MAX_TEXTURE_SIZE */
    numLinePoints: 40,
    /** How far across the noise field to move at each step? in dpr-normalized pixels */
    stepSize: 2,
    /** Line width in dpr-normalized pixels */
    lineWidth: 6,
    /** Line opacity */
    lineAlpha: 0.25,
    /** Noise parameters */
    noiseParams: structuredClone(DEFAULT_NOISE_PARAMS) as typeof DEFAULT_NOISE_PARAMS,
  };


  timers = {
    trace: new PerformanceTimer(),
    draw: new PerformanceTimer(),
  };



  // begin private 'generate' functions used by the constructor
  // these methods are “almost static,” by which I mean they only use 'this' for 'this.gl' and can
  // be called with no assumptions about which member variables are initialized beyond that



  /** Get two identical “positions” textures for a given numLines (width) and numLinePoints (height) */
  private generatePositionsTextures({ numLines, numLinePoints, seed }: { numLines: number, numLinePoints: number, seed: string }) {
    const { gl } = this;
    // Initialize starting values. The first NUM_LINES * 2 values encode the starting position for each line; the rest are 0
    // TODO: voronoi relaxation for more natural grid?
    const startingPoints = new Uint16Array(numLines * numLinePoints * 2);
    const rng = new alea(seed);
    for (let i = 0; i < numLines; i++) {
      startingPoints[i * 2] = Math.floor(rng() * (2 ** 16));
      startingPoints[i * 2 + 1] = Math.floor(rng() * (2 ** 16));
    }
    // Create the textures
    const textures = [1, 2].map(() => {
      const texture = gl.createTexture();
      if (!texture) throw new Error('couldn’t create texture');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16UI, numLines, numLinePoints, 0, gl.RG_INTEGER, gl.UNSIGNED_SHORT, startingPoints);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    // clean up
    gl.bindTexture(gl.TEXTURE_2D, null);

    return textures;
  }

  /** Get a blank R16UI texture of a given width and height */
  private generateFieldTexture(width: number, height: number) {
    const { gl } = this;
    const fieldTexture = gl.createTexture();
    if (!fieldTexture) throw new Error('couldn’t create texture');
    gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(width * height).fill(0));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // clean up
    gl.bindTexture(gl.TEXTURE_2D, null);

    return fieldTexture;
  }


  /** Get a VAO to draw a fullscreen quad. Used for “noise” and “trace” programs */
  private generateFullscreenVAO(noiseProgram: LineField['programs']['noise'], traceProgram: LineField['programs']['trace']) {
    const { gl } = this;
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
    // clean up
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return fullscreenVao;
  }


  /** Get a VAO for the geometry of a line. */
  private generateLineVAO(linesProgram: LineField['programs']['lines'], numLinePoints: number) {
    const { gl } = this;
    const lineVao = gl.createVertexArray();
    if (!lineVao) throw new Error('couldn’t create VAO');
    // In order to make thick lines, we need 2 points of geometry per “line point.”
    // For each point, we need to encode which “line point” it corresponds to, and whether it’s the
    // “left” or the “right” side of the line.
    const dataPerPoint = 2 * (1 + 1);
    const linePoints = new Uint16Array(numLinePoints * dataPerPoint);
    for (let i = 0; i < numLinePoints; i++) {
      // First point
      linePoints[i * dataPerPoint + 0] = i; // This point belongs to the ith “line point”
      linePoints[i * dataPerPoint + 1] = -1; // First point has -1 “normal” indicating the left side of the line
      // Second point
      linePoints[i * dataPerPoint + 2] = i;
      linePoints[i * dataPerPoint + 3] = 1; // Second point has +1 “normal” indicating the right side of the line
    }
    // 2 triangles (6 points) for each “step” between line points
    const lineIndices = new Int16Array((numLinePoints - 1) * 6);
    for (let i = 0; i < numLinePoints - 1; i++) {
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

    return lineVao;
  }



  // End private 'generate' functions used by the constructor
  // Begin constructor



  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;

    // Initialize textures
    const positionsTextures = this.generatePositionsTextures(this.settings);
    const fieldTexture = this.generateFieldTexture(gl.canvas.width, gl.canvas.height);
    this.textures = {
      field: fieldTexture,
      positions: positionsTextures[0],
      _tempPositions: positionsTextures[1],
    };

    // Create framebuffer
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error('couldn’t create framebuffer');
    this.framebuffer = framebuffer;

    // Create programs
    this.programs = {
      noise: new Program(gl, passthroughVertexSrc, noiseFragmentSrc, NOISE_PROGRAM_ATTRIBUTES, NOISE_PROGRAM_UNIFORMS),
      trace: new Program(gl, passthroughVertexSrc, traceFragmentSrc, TRACE_PROGRAM_ATTRIBUTES, TRACE_PROGRAM_UNIFORMS),
      lines: new Program(gl, linesVertexSrc, linesFragmentSrc, LINES_PROGRAM_ATTRIBUTES, LINES_PROGRAM_UNIFORMS),
    };
    // Create VAOs
    this.vaos = {
      fullscreen: this.generateFullscreenVAO(this.programs.noise, this.programs.trace),
      line: this.generateLineVAO(this.programs.lines, this.settings.numLinePoints),
    };
  }



  // End constructor
  // Begin the “main” public functions


  /**
   * Update the state of the simulation: update the noise field and trace new trajectories for all
   * the lines.
   */
  update(ctx: SceneContext) {
    const { gl } = this;
    // We’re going to render everything to textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    // We’re going to render the entire viewport with every draw.
    // This vao is enforced to be compatible with noiseProgram and traceProgram
    gl.bindVertexArray(this.vaos.fullscreen);
    // We don’t want blending because we’re drawing values out of 0–1 range
    gl.disable(gl.BLEND);

    // Draw noise shader to field texture
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.field, 0);
    this.programs.noise.use({
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
      time: { type: 'float', value: ctx.time / 1000 },
      ...this.noiseParams satisfies Parameters<typeof this.programs.noise.use>[0],
    });
    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Use trace shader to trace lines step by step
    this.timers.trace.start();
    this.programs.trace.use({
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
      fieldAmplitude: { type: 'float', value: this.noiseMaxAmplitude },
      stepSize: { type: 'float', value: this.stepSize },
    });

    gl.enable(gl.SCISSOR_TEST); // allows us to draw one row at a time

    // Each step is a separate draw call
    for (let i = 0; i < this.numLinePoints - 1; i++) {
      // We draw two rows at each step:
      // 1. We copy the “previous step” row from the input texture to the output texture to ensure every row is present in both textures
      // 2. We trace the field to write a new row to the output texture
      gl.viewport(0, i, this.numLines, 2); // y=i is the “previous step” row, y=i+1 is the new row
      gl.scissor(0, i, this.numLines, 2);
      // We render to the temp texture
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures._tempPositions, 0);
      this.programs.trace.bindUniforms({
        // and we read from the “primary” texture
        positionsTexture: { type: 'usampler2D', value: this.textures.positions },
        fieldTexture: { type: 'usampler2D', value: this.textures.field },
        stepNumber: { type: 'int', value: i },
      });

      // Draw
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Swap textures so that the (now more up to date) texture we rendered to becomes the “primary” texture
      const temp = this.textures.positions;
      this.textures.positions = this.textures._tempPositions;
      this.textures._tempPositions = temp;
    }

    // clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    this.timers.trace.stop();
  }


  /** Render the lines to the screen */
  draw(ctx: SceneContext) {
    const { gl } = this;
    this.timers.draw.start();
    gl.bindVertexArray(this.vaos.line);

    this.programs.lines.use({
      positionsTexture: { type: 'usampler2D', value: this.textures.positions },
      resolution: { type: 'vec2', value: ctx.size },
      screenDpr: { type: 'float', value: ctx.dpr },
      stepSize: { type: 'float', value: this.stepSize },
      lineWidth: { type: 'float', value: this.lineWidth },
      lineAlpha: { type: 'float', value: this.lineAlpha },
      numLinePoints: { type: 'int', value: this.numLinePoints },
    });

    // Draw
    gl.viewport(0, 0, ctx.size[0], ctx.size[1]);
    gl.drawElementsInstanced(gl.TRIANGLES, (this.numLinePoints - 1) * 6, gl.UNSIGNED_SHORT, 0, this.numLines);
    this.timers.draw.stop();
  }



  // End the “main” public functions
  // Begin the “settings” API



  /** Resize field texture to match the updated size of the canvas */
  onResize(ctx: SceneContext) {
    const { gl } = this;
    const [width, height] = ctx.size;
    // Activate texture
    gl.bindTexture(gl.TEXTURE_2D, this.textures.field);
    // Resize texture
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, new Uint16Array(width * height));
    // Clean up
    gl.bindTexture(gl.TEXTURE_2D, null);
  }


  // getters and setters for settings
  get numLines() { return this.settings.numLines; }
  set numLines(value: number) {
    // We need to update the size of the positions textures to accommodate the new number of lines
    const positionsTextures = this.generatePositionsTextures({ ...this.settings, numLines: value });
    this.textures.positions = positionsTextures[0];
    this.textures._tempPositions = positionsTextures[1];
    this.settings.numLines = value;
  }

  get seed() { return this.settings.seed; }
  set seed(value: string) {
    // We need to regenerate the positions textures so that starting positions reflect the new seed
    const positionsTextures = this.generatePositionsTextures({ ...this.settings, seed: value });
    this.textures.positions = positionsTextures[0];
    this.textures._tempPositions = positionsTextures[1];
    this.settings.seed = value;
  }

  get numLinePoints() { return this.settings.numLinePoints; }
  set numLinePoints(value: number) {
    // We need to update the size of the positions textures to accommodate the new number of line points
    const positionsTextures = this.generatePositionsTextures({ ...this.settings, numLinePoints: value });
    this.textures.positions = positionsTextures[0];
    this.textures._tempPositions = positionsTextures[1];
    // We also need to update the line VAO because now it needs to have more points
    this.vaos.line = this.generateLineVAO(this.programs.lines, value);
    this.settings.numLinePoints = value;
  }

  get stepSize() { return this.settings.stepSize; }
  set stepSize(value: number) { this.settings.stepSize = value; }

  get lineWidth() { return this.settings.lineWidth; }
  set lineWidth(value: number) { this.settings.lineWidth = value; }

  get lineAlpha() { return this.settings.lineAlpha; }
  set lineAlpha(value: number) { this.settings.lineAlpha = value; }

  get noiseParams() { return this.settings.noiseParams; }
  set noiseParams(value: typeof DEFAULT_NOISE_PARAMS) { this.settings.noiseParams = value; }

  get noiseMaxAmplitude() { return getMaxNoiseAmplitude(this.settings.noiseParams); }
}
