'use strict';

// ESLint 9 flat config。小程序是 CommonJS + 微信注入全局对象，不按浏览器/Node 的预设走。
const miniProgramGlobals = {
  wx: 'readonly',
  App: 'readonly',
  Page: 'readonly',
  Component: 'readonly',
  Behavior: 'readonly',
  getApp: 'readonly',
  getCurrentPages: 'readonly',
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'miniprogram_npm/**',
      '.git/**',
      '.workbuddy/**',
      'assets/**',
    ],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: miniProgramGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
    },
  },
];
