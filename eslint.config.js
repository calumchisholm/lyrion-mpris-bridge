module.exports = [
  {
    ignores: ['dist/**', 'tmp/**'],
  },
  {
    files: ['extension/**/*.js'],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly',
        global: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    rules: {
      'no-constant-condition': ['error', {checkLoops: false}],
      'no-redeclare': 'error',
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': ['warn', {args: 'none', caughtErrors: 'none'}],
    },
  },
];
