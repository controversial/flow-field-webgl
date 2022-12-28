import './style.scss';

import Renderer, { SceneContext } from './renderer';
import { canvas, gl } from './context';
import LineField from './passes/line-field';

import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import type { FpsGraphBladeParams } from '@tweakpane/plugin-essentials/dist/types/fps-graph/plugin';
import type { FpsGraphBladeApi } from '@tweakpane/plugin-essentials/dist/types/fps-graph/api/fps-graph';


const renderer = new Renderer(canvas, gl);
const lineField = new LineField();

renderer.start();

renderer.addRenderStep((ctx: SceneContext) => lineField.update(ctx), true);
renderer.addRenderStep((ctx: SceneContext) => lineField.draw(ctx));
renderer.addResizeListener((ctx: SceneContext) => lineField.onResize(ctx));


const pane = new Pane();
pane.registerPlugin(EssentialsPlugin);

// FPS meter: we ensure 'start' is the first step and 'end' is the last step
const fpsGraph = pane.addBlade({ view: 'fpsgraph', label: 'FPS', interval: 500, min: 0, max: 150 } satisfies FpsGraphBladeParams) as FpsGraphBladeApi;
renderer.beforeFrameSteps.unshift(() => fpsGraph.begin());
renderer.renderSteps.push(() => fpsGraph.end());

// Vite cleanup
// This is probably not the right way to use the Vite HMR APIs
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    renderer.cleanup();
    pane.dispose();
  });
}
