// Vite build for the household app (replaced Create React App + craco, TD12).
//
// The source keeps Create React App's conventions, so no app code changed
// (including the protected pricing and points files):
// - process.env.REACT_APP_* (and NODE_ENV, PUBLIC_URL) are replaced at build
//   time, exactly like CRA. Only REACT_APP_* variables are published, and
//   scripts/env-guard.cjs refuses to build if one of them holds a secret.
// - JSX in .js files, as CRA allowed.
// - The service worker is still built from src/service-worker.js into
//   /service-worker.js with the precache list injected (TD8), as CRA's
//   Workbox InjectManifest did: built JS/CSS and index.html, files up to 5 MB.
// - PostCSS uses postcss.config.js (the chain craco used).
// - Output goes to build/ (hashed files in build/static/), which Netlify publishes.
// - The dev server forwards /.netlify/functions/ to `netlify functions:serve`
//   (port 9999), as src/setupProxy.js did.
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { findPublishedSecrets } = require('./scripts/env-guard.cjs');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'REACT_APP_');
  const problems = findPublishedSecrets(env);
  if (problems.length) {
    throw new Error(`Refusing to build: these REACT_APP_ variables would be published to every browser:\n  ${problems.join('\n  ')}`);
  }
  const nodeEnv = mode === 'production' ? 'production' : 'development';
  const processEnv = { ...env, NODE_ENV: nodeEnv, PUBLIC_URL: '' };

  return {
    plugins: [
      react({ include: /\.(js|jsx)$/ }),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'service-worker.js',
        injectRegister: false, // src/serviceWorkerRegistration.js registers it
        manifest: false, // public/manifest.json
        injectManifest: {
          globPatterns: ['index.html', 'static/**/*'],
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        devOptions: { enabled: false },
      }),
    ],
    define: {
      'process.env': JSON.stringify(processEnv),
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },
    esbuild: { loader: 'jsx', include: /src\/.*\.jsx?$/, exclude: [] },
    optimizeDeps: { esbuildOptions: { loader: { '.js': 'jsx' } } },
    // static/, like CRA: public/assets/ already exists, and netlify.toml caches
    // /static/* for a year (file names change with their content).
    build: { outDir: 'build', assetsDir: 'static', emptyOutDir: true, sourcemap: false },
    server: {
      port: Number(process.env.PORT) || 3000,
      proxy: {
        '/.netlify/functions/': { target: 'http://localhost:9999', changeOrigin: true },
      },
    },
    preview: { port: Number(process.env.PORT) || 3000 },
  };
});
