const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '../src') + path.sep;

// In-memory repositories must start empty in each test. Clear only application
// modules, leaving Node and third-party dependency caches alone.
function freshModule(relativePath) {
  for (const filename of Object.keys(require.cache)) {
    if (filename.startsWith(sourceRoot)) delete require.cache[filename];
  }
  return require(path.resolve(__dirname, '..', relativePath));
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
