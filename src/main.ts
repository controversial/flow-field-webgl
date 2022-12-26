import './style.scss';

import Renderer from './renderer';
import { canvas, gl } from './context';

import { draw as renderNoise } from './passes/noise';

const renderer = new Renderer(canvas, gl);

renderer.start();

renderer.addRenderStep(renderNoise);

// Vite cleanup
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { renderer.cleanup(); });
}
