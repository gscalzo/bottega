import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'shared/**/*.test.ts',
      'src/**/*.test.{ts,tsx}',
      'worker/**/*.test.ts',
      'agent/**/*.test.ts',
    ],
    // Node by default; browser-facing tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      // The measured set (ADR-0012, mirroring raffaello): every pure rule in
      // shared/, the whole Worker except its entry point, the whole agent
      // client except its entry point, the typed API client and view helpers,
      // and the shared components. Screens and the two entry points stay out:
      // they are wiring, exercised through the helpers they delegate to.
      include: [
        'shared/**/*.ts',
        'worker/**/*.ts',
        'agent/**/*.ts',
        'src/lib/**/*.ts',
        'src/components/**/*.tsx',
      ],
      exclude: [
        '**/*.test.*',
        '**/test/**',
        '**/*.d.ts',
        'shared/types.ts',
        'worker/index.ts',
        'agent/main.ts',
      ],
      // Ratchets (ADR-0012): the suite's own level, raised when it rises,
      // never lowered without a superseding ADR.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 99.5,
        statements: 100,
      },
    },
  },
});
