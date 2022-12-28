/** Measures execution time with high efficiency, and averages results from multiple samples */
export default class PerformanceTimer {
  timings: DOMHighResTimeStamp[] = [];
  pointer = 0;
  _size: number;

  private startTime?: DOMHighResTimeStamp;

  constructor(size = 120) {
    this._size = size;
    this.timings = [];
  }

  get size() { return this._size; }
  set size(size) {
    this._size = size;
    this.timings = this.timings.slice(0, size);
    if (this.pointer >= size) this.pointer = 0;
  }

  start() { this.startTime = performance.now(); }
  stop() {
    if (typeof this.startTime === 'undefined') return;
    this.timings[this.pointer] = performance.now() - this.startTime;
    this.pointer = (this.pointer + 1) % this.size;
    this.startTime = undefined;
  }

  get time() {
    return this.timings.reduce((a, b) => a + b, 0) / this.size;
  }

  get opsPerSecond() {
    return 1000 / this.time;
  }

  get summary() {
    return `${this.time.toFixed(2)}ms / ${Math.round(this.opsPerSecond)} ops/sec`;
  }
}
