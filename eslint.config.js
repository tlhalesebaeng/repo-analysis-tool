import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: ['**/node_modules/', '**/dist/', '**/coverage/', 'data/'],
  },
  // Base rules for every JS file in the monorepo. JSX parsing is enabled
  // globally: harmless for plain JS and required for web/src/*.jsx.
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: [
      'server/**/*.js',
      'shared/**/*.js',
      'eslint.config.js',
      'web/vite.config.js',
      'web/tailwind.config.js',
      'web/postcss.config.js',
      'server/vitest.config.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Vite uses the automatic JSX runtime, so the jsx-runtime preset applies
    // instead of the classic one (no React import needed in scope).
    ...react.configs.flat['jsx-runtime'],
    files: ['web/src/**/*.{js,jsx}'],
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['web/src/**/*.{js,jsx}'],
  },
  {
    files: ['web/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // The jsx-runtime preset omits this rule, but core no-unused-vars
      // needs it to see JSX identifiers as variable usages.
      'react/jsx-uses-vars': 'error',
    },
  },
];
