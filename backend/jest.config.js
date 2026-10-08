/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json',
    }],
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  // Scope coverage to all of src, not just files a test happened to import.
  // Without this a brand-new untested module is invisible to the threshold.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  // Ratchet: set just under the baseline measured on 2026-10-08 so CI is
  // green today, but any drop in coverage fails the build. Raise these as
  // tests are added; never lower them.
  coverageThreshold: {
    global: {
      statements: 56,
      branches: 47,
      functions: 62,
      lines: 57
    }
  },
};
