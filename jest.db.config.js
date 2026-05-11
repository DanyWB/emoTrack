const baseConfig = require('./jest.config');

const {
  collectCoverageFrom,
  coverageDirectory,
  coverageReporters,
  coverageThreshold,
  testRegex,
  ...dbConfig
} = baseConfig;

module.exports = {
  ...dbConfig,
  roots: ['<rootDir>/test/db'],
  testRegex: '.*\\.db-spec\\.ts$',
};
