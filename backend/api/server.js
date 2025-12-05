// Simple serverless wrapper for Vercel / other serverless hosts.
// It requires the Express `app` exported by `../src/index.js` and
// exports it so the platform can call it as a request handler.

const app = require('../src/index');

// Express apps are callable functions (req, res) so exporting the
// app works for many serverless platforms that expect a function.
module.exports = app;
