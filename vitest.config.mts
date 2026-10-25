import { defineConfig } from 'vitest/config';
import { tscDecoratorMetadata } from './vitest.plugin.mts';

export default defineConfig({
  plugins: [tscDecoratorMetadata],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
