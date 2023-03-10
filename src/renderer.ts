import type { MultiSampleTimer } from './utils/timers';
import { WebGLTimer } from './utils/timers';


export interface SceneContext {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  size: [number, number],
  time: number,
  frameCount: number,
  canUseTimerQuery: boolean,
  dpr: number,
}


export type RenderStep =
  | ((ctx: SceneContext, delta: DOMHighResTimeStamp) => void)
  | ((ctx: SceneContext) => void);


type EventListenersRecord = Partial<{
  [K in keyof HTMLElementEventMap]: Map<
    (ctx: SceneContext, e: HTMLElementEventMap[K]) => void,
    (e: HTMLElementEventMap[K]) => void
  >
}>;



export default class Renderer {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  resizeObserver: ResizeObserver;
  raf?: ReturnType<typeof requestAnimationFrame>;
  startTime?: DOMHighResTimeStamp;
  frameCount = 0;
  eventListeners: EventListenersRecord = {};
  resizeListeners: ((ctx: SceneContext) => void)[] = [];

  renderTimer: MultiSampleTimer;

  // Rendering is split into “steps”
  beforeFrameSteps: RenderStep[] = [];
  renderSteps: RenderStep[] = [];


  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.updateCanvasSize();
    this.resizeObserver = new ResizeObserver(() => this.updateCanvasSize());
    this.resizeObserver.observe(this.canvas);

    // Observability
    this.renderTimer = new WebGLTimer(gl);
  }



  private updateCanvasSize() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio ?? 1);
    this.canvas.height = rect.height * (window.devicePixelRatio ?? 1);
    this.resizeListeners.forEach((listener) => listener(this.sceneContext));
  }
  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
  addResizeListener(listener: (ctx: SceneContext) => void) {
    this.resizeListeners.push(listener);
  }
  removeResizeListener(listener: (ctx: SceneContext) => void) {
    this.resizeListeners.splice(this.resizeListeners.indexOf(listener), 1);
  }


  /**
   * Context objects are a consistent encoding of relevant scene info that’s passed to all render
   * steps
   */
  get sceneContext(): SceneContext {
    return {
      canvas: this.canvas,
      gl: this.gl,
      size: [this.width, this.height],
      dpr: window.devicePixelRatio ?? 1,
      time: this.startTime ? (performance.now() - this.startTime) : -1,
      frameCount: this.frameCount,
      // on even frames, the renderer uses the timer query; on odd frames it allows child steps to use it.
      canUseTimerQuery: this.frameCount % 2 === 1,
    };
  }

  /** Draw a single frame */
  draw(delta: DOMHighResTimeStamp) {
    const weCanUseTimerQuery = this.frameCount % 2 === 0; // opposite of sceneContext.canUseTimerQuery, which dictates permission for child steps
    if (weCanUseTimerQuery) this.renderTimer.start();
    const context = this.sceneContext;
    // Do setup steps
    this.beforeFrameSteps.forEach((step) => step(context, delta));

    // Prepare for drawing new frame
    const { gl } = this;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.viewport(0, 0, this.width, this.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Do render steps
    this.renderSteps.forEach((step) => step(context, delta));
    if (weCanUseTimerQuery) this.renderTimer.stop();
  }

  /** Start render loop */
  start() {
    this.stop();
    this.startTime = performance.now();
    let previousTime = this.startTime;
    this.frameCount = 0;

    const frame = (time: DOMHighResTimeStamp) => {
      const delta = time - previousTime;
      previousTime = time;

      this.draw(delta);

      this.frameCount += 1;
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Stop render loop */
  stop() {
    if (typeof this.raf === 'undefined') return;
    cancelAnimationFrame(this.raf);
    this.raf = undefined;
  }



  /**
   * Add a new “render” step—a function that will be called with appropriate context during the
   * “draw” part of every frame
   */
  addRenderStep(step: RenderStep, beforeFrame = false) {
    if (beforeFrame) this.beforeFrameSteps.push(step);
    else this.renderSteps.push(step);
  }


  /** Remove a render step */
  removeRenderStep(step: RenderStep, beforeFrame = false) {
    const stepsArr = beforeFrame ? this.beforeFrameSteps : this.renderSteps;
    stepsArr.splice(stepsArr.indexOf(step), 1);
  }


  addEventListener<T extends keyof HTMLElementEventMap>(
    eventName: T,
    listener: (ctx: SceneContext, event: HTMLElementEventMap[T]) => void,
    options?: Parameters<(typeof this.canvas)['addEventListener']>[2],
  ) {
    const wrappedListener = (e: HTMLElementEventMap[T]) => listener(this.sceneContext, e);
    let listeners = this.eventListeners[eventName];
    if (!listeners) {
      listeners = new Map();
      this.eventListeners[eventName] = listeners;
    }
    listeners.set(listener, wrappedListener);
    this.canvas.addEventListener(eventName, wrappedListener, options);
  }

  removeEventListener<T extends keyof HTMLElementEventMap>(eventName: T, listener: (ctx: SceneContext, event: HTMLElementEventMap[T]) => void) {
    const listeners = this.eventListeners[eventName];
    if (!listeners) return;
    const wrappedListener = listeners.get(listener);
    if (!wrappedListener) return;
    this.canvas.removeEventListener(eventName, wrappedListener);
    listeners.delete(listener);
  }

  /** Stop everything */
  cleanup() {
    this.stop();
    this.resizeObserver.disconnect();
    // Get the “entry type” (a value of this.eventListeners) given its key as a string type
    type EventEntryType<T> = T extends keyof HTMLElementEventMap ? [T, EventListenersRecord[T]] : never;
    // Get event listener entries, strongly typed
    const entries = Object.entries(this.eventListeners) as EventEntryType<keyof HTMLElementEventMap>[];

    entries.forEach(([eventName, listeners]) => {
      if (!listeners) return;
      listeners.forEach((_, original) => {
        this.removeEventListener(eventName, original as (ctx: SceneContext, event: HTMLElementEventMap[typeof eventName]) => void);
      });
    });
  }
}
