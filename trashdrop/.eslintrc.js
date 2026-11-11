module.exports = {
  // This is the app's whole ESLint configuration; don't merge configs from parent folders.
  root: true,
  extends: ['react-app', 'react-app/jest'],
  rules: {
    // Disable rules that are causing the most warnings
    'no-unused-vars': 'off',
    'react-hooks/exhaustive-deps': 'off',
    'default-case': 'off',
    'import/no-anonymous-default-export': 'off',
    'no-loop-func': 'off',
    'no-unreachable': 'off'
  },
  // Only apply these relaxed rules in production builds
  overrides: [
    {
      files: ['**/*.js'],
      env: {
        node: true,
        browser: true
      }
    },
    {
      // Service worker scripts run in the worker scope (self, clients).
      files: ['src/serviceWorker.js', 'src/service-worker.js', 'public/sw.js'],
      env: { serviceworker: true },
      rules: { 'no-restricted-globals': 'off' }
    }
  ]
};
