import type LineField from '../line-field';
import type Renderer from '../renderer';

declare global {
  interface Window {
    lineField: LineField;
    renderer: Renderer;
  }
}
