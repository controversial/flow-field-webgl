import './style.scss';

import Renderer, { SceneContext } from './renderer';
import { canvas, gl } from './context';
import LineField from './passes/line-field';


const renderer = new Renderer(canvas, gl);
const lineField = new LineField();

renderer.start();

renderer.addRenderStep((ctx: SceneContext) => lineField.update(ctx), true);
renderer.addRenderStep((ctx: SceneContext) => lineField.draw(ctx));
renderer.addResizeListener((ctx: SceneContext) => lineField.onResize(ctx));



// Set up monitoring pane

import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import type { FpsGraphBladeParams } from '@tweakpane/plugin-essentials/dist/types/fps-graph/plugin';
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials/dist/types/fps-graph/api/fps-graph';
import MemoryMonitor from './utils/memory';

const pane = new Pane();
pane.registerPlugin(EssentialsPlugin);

const performanceFolder = pane.addFolder({ title: 'Performance' });

// FPS meter: we ensure 'start' is the first step and 'end' is the last step
const fpsGraph = performanceFolder.addBlade({ view: 'fpsgraph', label: 'FPS', interval: 500, min: 0, max: 150 } satisfies FpsGraphBladeParams) as FpsGraphBladeApi;
renderer.beforeFrameSteps.unshift(() => fpsGraph.begin());
renderer.renderSteps.push(() => fpsGraph.end());
// Timers
performanceFolder.addMonitor(
  { get value() { return `Trace: ${lineField.timers.trace.summary}\nDraw: ${lineField.timers.draw.summary}\nFrame: ${renderer.renderTimer.summary}`; } },
  'value',
  { label: 'Timers', interval: 500, multiline: true, lineCount: 3.4 },
);
// Memory
const memoryMonitor = new MemoryMonitor();
if (memoryMonitor.supported) {
  performanceFolder.addMonitor(memoryMonitor, 'summary', { label: 'Memory', interval: 500, multiline: true, lineCount: 5 });
}

// Hide/show pane with 'p' key
document.addEventListener('keydown', (e) => {
  if (e.key === 'p') pane.hidden = !pane.hidden;
});
