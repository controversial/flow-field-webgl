/** Holds timing results from multiple samples and reports averages */
export abstract class MultiSampleTimer {
  private timings: number[] = [];
  private pointer = 0;
  private _size: number;

  constructor(size = 120) {
    this._size = size;
    this.timings = [];
  }

  /** How many samples are stored in the timer? */
  get size() { return this._size; }
  /** Change the number of samples stored in the timer */
  set size(size) {
    this._size = size;
    this.timings = this.timings.slice(0, size);
    if (this.pointer >= size) this.pointer = 0;
  }

  /** Adds a new sample to the list. Called by subclasses according to their specific API. */
  protected addMeasurement(time: number) {
    this.timings[this.pointer] = time;
    this.pointer = (this.pointer + 1) % this.size;
  }

  abstract start(): void;
  abstract stop(): void;

  /** Returns the average from all the samples */
  get time() {
    if (!this.timings.length) return -1;
    return this.timings.reduce((a, b) => a + b, 0) / this.timings.length;
  }

  /** Assumes timings are in milliseconds */
  get opsPerSecond() {
    const { time } = this;
    if (time < 0) return -1;
    return 1000 / time;
  }

  /** Assumes timings are in milliseconds */
  get summary() {
    const { time, opsPerSecond } = this;
    if (time < 0 || opsPerSecond < 0) return 'No data';
    return `${time.toFixed(2)}ms = ${Math.round(opsPerSecond)} ops/sec`;
  }
}



/** Timer for CPU operaitons using performance.now() */
export class PerformanceTimer extends MultiSampleTimer {
  private startTime?: DOMHighResTimeStamp;

  start() { this.startTime = performance.now(); }
  stop() {
    const endTime = performance.now();
    if (typeof this.startTime === 'undefined') return;
    this.addMeasurement(endTime - this.startTime);
  }
}



/** Timer for GPU operations using WebGL queries */
export class WebGLTimer extends MultiSampleTimer {
  state:
    | { supported: false }
    | {
      supported: true;
      gl: WebGL2RenderingContext;
      ext: WebGLTimerQueryExt;
      query: WebGLQuery;
    };

  constructor(gl: WebGL2RenderingContext, size = 120) {
    super(size);

    const ext: WebGLTimerQueryExt | null = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) { this.state = { supported: false }; return; }

    const query = gl.createQuery();
    if (!query) { this.state = { supported: false }; return; }

    this.state = { supported: true, gl, ext, query };
  }

  start() {
    if (!this.state.supported) return;
    const { gl } = this.state;

    // Try to get the result from the previous query before we start a new query
    const lastResult = this.retrieve();
    if (lastResult !== -1) this.addMeasurement(lastResult / 1e6);

    gl.beginQuery(this.state.ext.TIME_ELAPSED_EXT, this.state.query);
  }

  stop() {
    if (!this.state.supported) return;
    const { gl } = this.state;
    gl.endQuery(this.state.ext.TIME_ELAPSED_EXT);
  }

  retrieve() {
    if (!this.state.supported) return -1;
    const { gl } = this.state;
    const available: GLboolean = gl.getQueryParameter(this.state.query, gl.QUERY_RESULT_AVAILABLE);
    const disjoint: GLboolean = gl.getParameter(this.state.ext.GPU_DISJOINT_EXT);
    if (!available || disjoint) return -1;

    const result: GLint = gl.getQueryParameter(this.state.query, gl.QUERY_RESULT);
    return result;
  }

  get supported() { return this.state.supported; }
}

type WebGLTimerQueryExt = {
  TIME_ELAPSED_EXT: Parameters<WebGL2RenderingContext['beginQuery']>[0],
  GPU_DISJOINT_EXT: Parameters<WebGL2RenderingContext['getParameter']>[0],
};
