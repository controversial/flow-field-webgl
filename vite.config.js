import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';


export default defineConfig({
  plugins: [glsl({ compress: true })],

  // Enable high-resolution timers for performance measuring (see https://web.dev/coop-coep/)
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  // Split tweakpane into its own chunk
  build: {
    rollupOptions: {
      plugins: [visualizer({ emitFile: true })],
      output: {
        manualChunks(id) {
          if (/node_modules\/@?tweakpane/.test(id)) return 'tweakpane';
        },
      },
    },
  },
});
