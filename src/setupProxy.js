/* Proxy CRA requests to local Netlify Functions server during development.
 * This allows using relative paths like "/.netlify/functions/check-batch" from the browser
 * without needing Netlify Dev, by forwarding them to http://localhost:9999.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/.netlify/functions/',
    createProxyMiddleware({
      target: 'http://localhost:9999',
      changeOrigin: true,
      // Keep path intact; functions:serve expects "/.netlify/functions/<name>"
      pathRewrite: { '^/.netlify/functions/': '/.netlify/functions/' },
      logLevel: 'debug',
    })
  );
};
