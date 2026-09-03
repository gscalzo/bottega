/**
 * Mutation testing (ADR-0012). Business logic only: the same modules the
 * coverage gate holds to its ratchet — screens and the two entry points are
 * exercised through the helpers they delegate to and are not mutated.
 * String-literal mutants are off: killing them means asserting labels and
 * error copy verbatim, which couples tests to wording instead of behaviour.
 * `break: 100` fails the run when any mutant survives.
 */
export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutator: { excludedMutations: ['StringLiteral'] },
  reporters: ['html', 'json', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  incremental: true,
  incrementalFile: 'reports/mutation/stryker-incremental.json',
  mutate: [
    'shared/**/*.ts',
    'worker/**/*.ts',
    'agent/**/*.ts',
    'src/lib/**/*.ts',
    '!**/*.test.ts',
    '!**/*.d.ts',
    '!shared/types.ts',
    '!worker/index.ts',
    '!worker/test/**',
    '!agent/test/**',
    '!agent/main.ts',
  ],
  vitest: { configFile: 'vitest.config.ts' },
  thresholds: { high: 100, low: 100, break: 100 },
};
