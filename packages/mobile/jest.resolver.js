const fs = require('node:fs');
const path = require('node:path');

const clientCoreSrc = path.resolve(__dirname, '../client-core/src');

/**
 * The same remapping `metro.config.js` performs, for Jest.
 *
 * `@meet/client-core` ships TypeScript sources that import each other with
 * standards-compliant ESM specifiers — `./emitter.js` meaning `emitter.ts`.
 * Node and the web bundler both understand that; neither Metro nor Jest does,
 * so relative `.js` specifiers originating inside that package are pointed at
 * their TypeScript source.
 */
module.exports = (request, options) => {
  const basedir = options.basedir ?? '';
  if (request.startsWith('.') && request.endsWith('.js') && basedir.startsWith(clientCoreSrc)) {
    const candidate = path.resolve(basedir, request.replace(/\.js$/, '.ts'));
    if (fs.existsSync(candidate)) return candidate;
  }
  return options.defaultResolver(request, options);
};
