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

document.body.appendChild(renderer.stats.dom);

// Vite cleanup
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    renderer.cleanup();
    document.body.removeChild(renderer.stats.dom);
  });
}
