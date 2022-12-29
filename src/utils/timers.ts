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
    return this.timings.reduce((a, b) => a + b, 0) / this.size;
  }

  /** Assumes timings are in milliseconds */
  get opsPerSecond() {
    return 1000 / this.time;
  }

  /** Assumes timings are in milliseconds */
  get summary() {
    return `${this.time.toFixed(2)}ms / ${Math.round(this.opsPerSecond)} ops/sec`;
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
