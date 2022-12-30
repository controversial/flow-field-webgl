import './style.scss';

import Renderer, { SceneContext } from './renderer';
import LineField from './line-field';


// Set up canvas

const canvas = document.getElementById('canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Failed to find canvas element');

const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: true, premultipliedAlpha: true });
if (!gl) throw new Error('Failed to get WebGL2 context');


// Create simulator for flow field

const lineField = new LineField(gl);
window.lineField = lineField;


// Set up render pipeline

const renderer = new Renderer(canvas, gl);
window.renderer = renderer;

renderer.addRenderStep((ctx: SceneContext) => lineField.update(ctx), true);
renderer.addRenderStep((ctx: SceneContext) => lineField.draw(ctx));
renderer.addResizeListener((ctx: SceneContext) => lineField.onResize(ctx));

renderer.start();


// Set up tweakpane

import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import type { FpsGraphBladeParams } from '@tweakpane/plugin-essentials/dist/types/fps-graph/plugin';
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials/dist/types/fps-graph/api/fps-graph';
import MemoryMonitor from './utils/memory';

const pane = new Pane({ title: 'Settings' });
pane.registerPlugin(EssentialsPlugin);

// Set up “lines” folder

const lineFieldFolder = pane.addFolder({ title: 'Lines' });
lineFieldFolder.addInput(lineField, 'numLines', { label: 'count', min: 1, max: gl.getParameter(gl.MAX_TEXTURE_SIZE), step: 1 });
lineFieldFolder.addInput(lineField, 'voronoiIterations', { label: 'uniform spacing', min: 0, max: 5, step: 0.1 });
lineFieldFolder.addInput(lineField, 'numLinePoints', { label: '# points', min: 1, max: 100, step: 1 });
lineFieldFolder.addInput(lineField, 'stepSize', { label: 'step distance', min: 0.1, max: 10, step: 0.1 });
lineFieldFolder.addInput(lineField, 'lineWidth', { label: 'width', min: 1, max: 30, step: 0.1 });
lineFieldFolder.addInput(lineField, 'lineAlpha', { label: 'alpha', min: 0, max: 1, step: 0.01 });
// Respond to changes after canvas is resized
renderer.addResizeListener(() => pane.refresh());

// Set up “noise field” folder

const noiseFolder = pane.addFolder({ title: 'Noise field' });
noiseFolder.addInput(lineField.noiseParams.frequency, 'value', { label: 'frequency', min: 0.1, max: 5, step: 0.1 });
noiseFolder.addInput(lineField.noiseParams.amplitude, 'value', { label: 'amplitude', min: 0.1, max: 5, step: 0.1 });
noiseFolder.addInput(lineField.noiseParams.harmonics, 'value', { label: 'harmonics', min: 1, max: 10, step: 1 });
noiseFolder.addInput(lineField.noiseParams.harmonicSpread, 'value', { label: 'harmonic spread', min: 1.1, max: 5, step: 0.1 });
noiseFolder.addInput(lineField.noiseParams.harmonicGain, 'value', { label: 'harmonic gain', min: 0.1, max: 1, step: 0.01 });
noiseFolder.addInput(lineField.noiseParams.speed, 'value', { label: 'speed', min: 0.01, max: 1, step: 0.01 });


// Set up “performance” folder

const performanceFolder = pane.addFolder({ title: 'Performance' });

// FPS meter: we ensure 'start' is the first step and 'end' is the last step
const fpsGraph = performanceFolder.addBlade({ view: 'fpsgraph', label: 'FPS', interval: 500, min: 0, max: 150 } satisfies FpsGraphBladeParams) as FpsGraphBladeApi;
renderer.beforeFrameSteps.unshift(() => fpsGraph.begin());
renderer.renderSteps.push(() => fpsGraph.end());
// Timers
const timers = {
  '      Noise': lineField.timers.noise,
  '      Trace': lineField.timers.trace,
  '      Lines': lineField.timers.draw,
  'Full render': renderer.renderTimer,
};
const supportedTimers = Object.entries(timers).filter(([, timer]) => timer.supported);
if (supportedTimers.length > 0) {
  performanceFolder.addMonitor(
    { get value() { return supportedTimers.map(([label, timer]) => `${label}: ${timer.summary}`).join('\n'); } },
    'value',
    { label: 'Timers', interval: 500, multiline: true, lineCount: supportedTimers.length + 0.4 },
  );
}
// Memory
const memoryMonitor = new MemoryMonitor();
if (memoryMonitor.supported) {
  performanceFolder.addMonitor(memoryMonitor, 'summary', { label: 'Memory', interval: 500, multiline: true, lineCount: 5 });
}

// Hide/show pane with 'p' key
document.addEventListener('keydown', (e) => {
  if (e.key === 'p') pane.hidden = !pane.hidden;
});
