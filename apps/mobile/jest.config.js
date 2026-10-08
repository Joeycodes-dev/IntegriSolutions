module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo-google-fonts/.*|@expo/vector-icons|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  // Scope coverage to all of src, not just files a test happened to import.
  // Without this a brand-new untested module is invisible to the threshold.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  // Ratchet: set just under the baseline measured on 2026-10-08 so CI is
  // green today, but any drop in coverage fails the build. Raise these as
  // tests are added; never lower them.
  coverageThreshold: {
    global: {
      statements: 45,
      branches: 40,
      functions: 44,
      lines: 47
    }
  },
};
