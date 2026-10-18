import { resolve } from 'node:path';
import { defineConfig } from 'vite';

import { reticle } from '@reticlehq/vite-plugin';
// Three pages: converter (index), chord directory, tuner.
export default defineConfig({
  plugins: [reticle({ port: 4400 })],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        chords: resolve(__dirname, 'chords.html'),
        tuner: resolve(__dirname, 'tuner.html'),
      },
    },
  },
});
