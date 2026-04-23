// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const defaultConfig = require('./.config/jest.config');

module.exports = {
  ...defaultConfig,
  testMatch: [...(defaultConfig.testMatch || []), '<rootDir>/tests/unit/**/*.{spec,test}.{js,jsx,ts,tsx}'],
  setupFilesAfterEnv: [...(defaultConfig.setupFilesAfterEnv || []), '<rootDir>/tests/__mocks__/web-midi-api.ts'],
};
