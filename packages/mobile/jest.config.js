const path = require('node:path');

/**
 * Jest configuration.
 *
 * `modulePaths` is what makes the sibling packages usable from a test. Metro is
 * told about both `node_modules` trees in `metro.config.js`; Jest resolves from
 * the file doing the requiring, so a compiled file inside `packages/protocol`
 * walks up to the monorepo root and never sees this project's dependencies —
 * including the Babel runtime helpers its own output was compiled against.
 */
module.exports = {
  preset: '@react-native/jest-preset',
  modulePaths: [path.resolve(__dirname, 'node_modules')],
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
};
