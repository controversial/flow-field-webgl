import glsl from 'vite-plugin-glsl';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';


export default defineConfig({
  plugins: [glsl({ compress: true })],

  // Enable high-resolution timers for performance measuring (see https://web.dev/coop-coep/)
  server: {
    host: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },

  // Split tweakpane into its own chunk
  build: {
    rollupOptions: {
      plugins: [visualizer({ emitFile: true, gzipSize: true, brotliSize: true })],
      output: {
        manualChunks(id) {
          // Split tweakpane into its own chunk
          if (/node_modules\/@?tweakpane/.test(id)) return 'tweakpane';
          // Split all node modules (besides whitelisted ones) into their own chunk
          const whitelist = ['seedrandom'];
          if (id.includes('node_modules') && !whitelist.some((x) => id.includes(`node_modules/${x}`))) return 'vendor';
        },
      },
    },
  },
});
