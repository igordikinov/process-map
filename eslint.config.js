import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

const HEX_COLOR_PATTERN = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Запрет хардкода hex-цветов в компонентах (CLAUDE.md): цвета и размеры
    // берутся только из src/theme/tokens.css.
    files: ['src/**/*.tsx', 'src/**/*.ts'],
    ignores: ['src/theme/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${HEX_COLOR_PATTERN}/]`,
          message: 'Хардкод hex-цвета запрещён — используйте переменные из src/theme/tokens.css.',
        },
        {
          selector: `TemplateElement[value.raw=/${HEX_COLOR_PATTERN}/]`,
          message: 'Хардкод hex-цвета запрещён — используйте переменные из src/theme/tokens.css.',
        },
      ],
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'e2e/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['scripts/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettierConfig,
);
