const path = require('node:path');
const fs = require('node:fs');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const clientCoreSrc = path.resolve(monorepoRoot, 'packages/client-core/src');

/**
 * Metro configuration for this monorepo.
 *
 * Two things need explaining:
 *
 * 1. `@meet/protocol` and `@meet/client-core` are symlinked in from `packages/`,
 *    outside this project root, so Metro must watch those folders and resolve
 *    modules from both node_modules trees.
 *
 * 2. `@meet/client-core` ships TypeScript sources that use standards-compliant
 *    ESM specifiers (`./emitter.js` referring to `emitter.ts`). Node and the web
 *    bundler both understand that; Metro does not, so relative `.js` specifiers
 *    originating inside that package are remapped to their `.ts` source.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [
    path.resolve(monorepoRoot, 'packages/protocol'),
    path.resolve(monorepoRoot, 'packages/client-core'),
  ],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,

    resolveRequest: (context, moduleName, platform) => {
      const origin = context.originModulePath ?? '';
      if (moduleName.startsWith('.') && moduleName.endsWith('.js') && origin.startsWith(clientCoreSrc)) {
        const candidate = path.resolve(path.dirname(origin), moduleName.replace(/\.js$/, '.ts'));
        if (fs.existsSync(candidate)) {
          return { type: 'sourceFile', filePath: candidate };
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
