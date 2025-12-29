module.exports = {
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
    }
  ]
};
