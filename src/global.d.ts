/// <reference types="vite/client" />

import type LineField from './passes/line-field';
import type Renderer from './renderer';

declare module '*.glsl' {
  const value: string;
  export default value;
}

declare module 'seedrandom/lib/alea' {
  const alea: import('seedrandom')['alea'];
  export default alea;
}

interface Performance {
  measureUserAgentSpecificMemory?(): Promise<{
    bytes: number,
    breakdown: ({
      types: string[],
      bytes: number,
    })[],
  }>;
}

interface ObjectConstructor {
  // redefine Object.fromEntries to preserve key type as long as that key type extends string
  // I think this produces correct results in all cases
  fromEntries<K extends string, V>(entries: Iterable<readonly [K, V]>): Record<K, V>;
  // 2 overloads from typescript core are preserved
}

declare global {
  interface Window {
    lineField: LineField;
    renderer: Renderer;
  }
}
