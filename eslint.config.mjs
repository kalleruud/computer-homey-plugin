import js from '@eslint/js';
import homeyApp from 'eslint-plugin-homey-app';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['.homeybuild', 'node_modules', '.gitignore'],
  },
  {
    files: ['**/*.{js,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    plugins: {
      'homey-app': homeyApp,
    },
    rules: {
      ...homeyApp.configs.recommended.rules,
      semi: ['error', 'always'],
    },
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      'homey-app': homeyApp,
    },
    rules: {
      ...homeyApp.configs.recommended.rules,
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.{ts,mts,cts}'],
  })),
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    plugins: {
      'homey-app': homeyApp,
    },
    rules: {
      ...homeyApp.configs.recommended.rules,
    },
  },
];
