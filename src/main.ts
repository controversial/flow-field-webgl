import './style.scss';

import Renderer from './renderer';
import { canvas, gl } from './context';

import drawShaderFullscreen from './utils/debug-shader-view';
import textureViewFragment from './shaders/debug-texture-view-frag.glsl';

const renderer = new Renderer(canvas, gl);

renderer.start();

// Create red texture
const tex = gl.createTexture();
if (!tex) throw new Error('couldn’t create texture');
gl.bindTexture(gl.TEXTURE_2D, tex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255]));
gl.bindTexture(gl.TEXTURE_2D, null);

renderer.addRenderStep(drawShaderFullscreen(textureViewFragment, { 'u_texture': tex }));

// Vite cleanup
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { renderer.cleanup(); });
}
