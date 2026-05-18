import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Unit test config. SWC transforms TS decorators + emitDecoratorMetadata
 * (which Vitest's default esbuild can't). E2E config: ./test/vitest-e2e.config.ts.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist', 'test/**'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/auth/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/dto/**',
        'src/**/*.module.ts',
        'src/modules/auth/strategies/**',
        'src/modules/auth/guards/**',
        'src/modules/auth/decorators/**',
      ],
    },
  },
});
