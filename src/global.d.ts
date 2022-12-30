import type LineField from './passes/line-field';
import type Renderer from './renderer';

declare global {
  interface Window {
    lineField: LineField;
    renderer: Renderer;
  }
}
