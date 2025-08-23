/* Proxy CRA requests to local Netlify Functions server during development.
 * This allows using relative paths like "/.netlify/functions/check-batch" from the browser
 * without needing Netlify Dev, by forwarding them to http://localhost:50964.
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
      timeout: 10000,
      proxyTimeout: 10000,
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        res.status(500).send('Proxy connection failed');
      }
    })
  );
};
