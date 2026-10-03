module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    '^.+[\\\\/]node_modules[\\\\/]jose[\\\\/].+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2022' } },
    ],
  },
  transformIgnorePatterns: ['[\\\\/]node_modules[\\\\/](?!jose[\\\\/])'],
};
