import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

export default [
  {
    ignores: ['ghostscript-10.07.1/**', 'site/gs.js'],
  },
  {
    files: ['site/index.html'],
    plugins: { html },
    rules: js.configs.recommended.rules,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
  },
  {
    files: ['site/worker.js'],
    rules: {
      ...js.configs.recommended.rules,
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.worker,
        // Provided by gs.js (importScripts), the Emscripten module factory
        // built with -sEXPORT_NAME=createGSModule.
        createGSModule: 'readonly',
      },
    },
  },
];
