import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
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
    // Componentes shadcn/ui vendorizados y el ThemeProvider: exportan constantes
    // (cva variants, hooks) junto al componente por diseño (docs/specs/DSN-03-ui-kit-appshell/).
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/components/theme/ThemeProvider.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
