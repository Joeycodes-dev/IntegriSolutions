import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/test-setup.ts',
    coverage: {
      provider: 'v8',
      // Scope coverage to all of src, not just files a test happened to
      // import. Without this a brand-new untested module is invisible.
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary'],
      // Ratchet: set just under the baseline measured on 2026-10-08 so CI is
      // green today, but any drop in coverage fails the build. Raise these as
      // tests are added; never lower them.
      thresholds: {
        statements: 59,
        branches: 48,
        functions: 53,
        lines: 60
      },
    },
  },
});
