import js from '@eslint/js'
import homeyApp from 'eslint-plugin-homey-app'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['.homeybuild', 'node_modules', '.gitignore'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: {
      'homey-app': homeyApp,
    },
    rules: {
      ...homeyApp.configs.recommended.rules,
    },
  },
]
