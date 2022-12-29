export function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Can’t create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

export function linkProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader | null, fragmentShader: WebGLShader | null) {
  if (!vertexShader || !fragmentShader) throw new Error('Can’t create program with null shaders');
  const program = gl.createProgram();
  if (!program) throw new Error('Can’t create program');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) return program;

  console.error(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

export function createProgram(gl: WebGL2RenderingContext, vertexShaderSrc: string, fragmentShaderSrc: string) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
  const program = linkProgram(gl, vertexShader, fragmentShader);
  if (!program) throw new Error('Failed to create program');
  return program;
}



export type GlslTypeValuePair =
  | { type: 'float', value: number }
  | { type: 'int', value: number }
  | { type: 'uint', value: number }
  | { type: 'vec2', value: [number, number] }
  | { type: 'vec3', value: [number, number, number] }
  | { type: 'vec4', value: [number, number, number, number] }
  | { type: 'ivec2', value: [number, number] }
  | { type: 'ivec3', value: [number, number, number] }
  | { type: 'ivec4', value: [number, number, number, number] }
  | { type: 'uvec2', value: [number, number] }
  | { type: 'uvec3', value: [number, number, number] }
  | { type: 'uvec4', value: [number, number, number, number] }
  | { type: 'sampler2D', value: WebGLTexture }
  | { type: 'isampler2D', value: WebGLTexture }
  | { type: 'usampler2D', value: WebGLTexture };
export type GlslType = GlslTypeValuePair['type'];
export type GlslTypeMaybeValue = GlslTypeValuePair | Omit<GlslTypeValuePair, 'value'>

export type LooseUniformsDefinition = Record<string, GlslTypeMaybeValue>;
export type UniformsDefinition = Record<string, GlslTypeValuePair>;

type UniformRecord = GlslTypeMaybeValue & {
  name: `u_${string}`;
  location: ReturnType<WebGL2RenderingContext['getUniformLocation']>;
}
type CompleteUniformRecord = GlslTypeValuePair & {
  name: `u_${string}`;
  location: ReturnType<WebGL2RenderingContext['getUniformLocation']>;
}

interface AttributeRecord {
  name: `a_${string}`;
  location: ReturnType<WebGL2RenderingContext['getAttribLocation']>;
}

// String utilities
const camelToSnake = (str: string) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const getUniformName = (str: string) => `u_${str.includes('_') ? str : camelToSnake(str)}` as const;
const getAttributeName = (str: string) => `a_${str.includes('_') ? str : camelToSnake(str)}` as const;

// Type utilities
function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}
type Entries<T> = { [K in keyof T]: [K, T[K]]; }[keyof T][];


export class Program<UniformName extends string, AttributeName extends string> {
  gl: WebGL2RenderingContext;
  vertexShaderSrc: string;
  fragmentShaderSrc: string;
  program: WebGLProgram;
  attributes: { [key in AttributeName]: AttributeRecord };
  uniforms: { [key in UniformName]: UniformRecord };

  constructor(
    gl: WebGL2RenderingContext,
    vertexShaderSrc: string,
    fragmentShaderSrc: string,
    attributeNames: readonly AttributeName[],
    uniforms: { [key in UniformName]: GlslTypeMaybeValue },
  ) {
    this.gl = gl;
    this.vertexShaderSrc = vertexShaderSrc;
    this.fragmentShaderSrc = fragmentShaderSrc;
    this.program = createProgram(this.gl, vertexShaderSrc, fragmentShaderSrc);

    this.attributes = Object.fromEntries(attributeNames.map((name) => {
      const transformedName = getAttributeName(name);
      const location = this.gl.getAttribLocation(this.program, transformedName);
      return [name, { name: transformedName, location }];
    }));

    this.uniforms = Object.fromEntries(
      (Object.entries(uniforms) as Entries<typeof uniforms>)
        .map(([name, definition]) => {
          const transformedName = getUniformName(name);
          const location = this.gl.getUniformLocation(this.program, transformedName);
          return [name, { ...definition, name: transformedName, location }];
        })
    );
  }

  get uniformsList(): UniformRecord[] { return Object.values(this.uniforms); }
  get attributesList(): AttributeRecord[] { return Object.values(this.attributes); }

  use(overrides?: Partial<Record<UniformName, GlslTypeValuePair>>) {
    this.gl.useProgram(this.program);
    if (overrides) this.bindUniforms(overrides);
  }

  bindUniforms(overrides: Partial<Record<UniformName, GlslTypeValuePair>>) {
    const overrides2 = (Object.entries(overrides) as Entries<typeof overrides>)
      .filter(([name]) => Object.keys(this.uniforms).includes(name))
      .map(([name, definition]) => ({ ...definition, name: getUniformName(name) }));
    const uniforms = this.uniformsList.map((uniform) => ({
      ...uniform,
      ...[...overrides2].reverse().find((override) => {
        if (override.name !== uniform.name) return false;
        if (override.type !== uniform.type) throw new Error(`Uniform ${override.name} has type ${override.type} but was expected to be ${uniform.type}`);
        return true;
      }),
    }));
    const isComplete = (uniform: UniformRecord): uniform is CompleteUniformRecord => 'value' in uniform;
    const completeUniforms = uniforms.filter(isComplete);

    let textureCount = 0;
    completeUniforms.forEach((uniform) => {
      if (uniform.type === 'sampler2D' || uniform.type === 'isampler2D' || uniform.type === 'usampler2D') {
        this.gl.uniform1i(uniform.location, textureCount);
        this.gl.activeTexture(this.gl.TEXTURE0 + textureCount);
        this.gl.bindTexture(this.gl.TEXTURE_2D, uniform.value);
        textureCount++;
      } else if (uniform.type === 'float') {
        this.gl.uniform1f(uniform.location, uniform.value);
      } else if (uniform.type === 'int' || uniform.type === 'uint') {
        this.gl.uniform1i(uniform.location, uniform.value);
      } else if (uniform.type === 'vec2' || uniform.type === 'vec3' || uniform.type === 'vec4') {
        const name = `uniform${uniform.value.length}fv` as const;
        this.gl[name](uniform.location, uniform.value);
      } else if (uniform.type === 'ivec2' || uniform.type === 'ivec3' || uniform.type === 'ivec4' || uniform.type === 'uvec2' || uniform.type === 'uvec3' || uniform.type === 'uvec4') {
        const name = `uniform${uniform.value.length}iv` as const;
        this.gl[name](uniform.location, uniform.value);
      } else {
        assertNever(uniform); // compile error if we didn’t handle all cases :)
      }
    });
  }
}
