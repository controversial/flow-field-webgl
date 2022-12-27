import './style.scss';

import Renderer from './renderer';
import { canvas, gl } from './context';

import drawShaderFullscreen from './utils/debug-shader-view';
import noiseFragmentSrc from './shaders/noise-frag.glsl';

const renderer = new Renderer(canvas, gl);

renderer.start();

renderer.addRenderStep(drawShaderFullscreen(noiseFragmentSrc));

// Vite cleanup
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { renderer.cleanup(); });
}
