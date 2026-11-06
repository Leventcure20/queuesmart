const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '../src') + path.sep;

// In-memory repositories must start empty in each test. Clear only application
// modules, leaving Node and third-party dependency caches alone.
function freshModule(relativePath, overrides = {}) {
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(sourceRoot)) delete require.cache[filename];
  }
  // Existing unit/API tests must never select a developer's database implicitly.
  const bindings = { 'src/config/database.js': { pool: null }, ...overrides };
  const target = path.resolve(__dirname, '..', relativePath);
  const dependencies = [];
  try {
    for (const [modulePath, exports] of Object.entries(bindings)) {
      const applicationModule = modulePath.startsWith('src/');
      const filename = applicationModule
        ? path.resolve(__dirname, '..', modulePath)
        : require.resolve(modulePath, { paths: [path.resolve(__dirname, '..')] });
      if (filename === target) continue;
      if (!applicationModule) dependencies.push([filename, require.cache[filename]]);
      require.cache[filename] = { id: filename, filename, loaded: true, exports };
    }
    return require(target);
  } finally {
    // Dependency substitutes are needed only while application modules load.
    for (const [filename, original] of dependencies) {
      if (original) require.cache[filename] = original;
      else delete require.cache[filename];
    }
  }
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    ended: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; this.ended = true; return this; },
    end() { this.ended = true; return this; },
  };
}

module.exports = { freshModule, createResponse };
