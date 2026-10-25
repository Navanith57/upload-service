import { defineConfig } from 'vitest/config';
import { tscDecoratorMetadata } from './vitest.plugin.mts';

// e2e boots the real AppModule, so it needs MongoDB reachable at MONGODB_URI (.env).
export default defineConfig({
  plugins: [tscDecoratorMetadata],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    testTimeout: 30000,
  },
});
