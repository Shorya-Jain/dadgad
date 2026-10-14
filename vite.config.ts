import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Three pages: converter (index), chord directory, tuner.
export default defineConfig({
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
