const maybeCanvas = document.getElementById('canvas');
if (!(maybeCanvas instanceof HTMLCanvasElement)) throw new Error('Failed to find canvas element');

const maybeGl = maybeCanvas.getContext('webgl2', {
  antialias: false,
  depth: false,
  stencil: false,
  alpha: true,
  premultipliedAlpha: true,
});
if (!maybeGl) throw new Error('Failed to get WebGL2 context');

// Exported types should stay narrowed
export const canvas = maybeCanvas as NonNullable<typeof maybeCanvas>;
export const gl = maybeGl as NonNullable<typeof maybeGl>;
