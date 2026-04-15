// @ts-check
import eslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import angular from '@angular-eslint/eslint-plugin';
import angularTemplate from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';

export default tsEslint.config(
  // ── Ignore patterns ────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'node_modules/**', '.angular/**', 'coverage/**'],
  },

  // ── TypeScript source files ────────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'api/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tsEslint.configs.strictTypeChecked,
      ...tsEslint.configs.stylisticTypeChecked,
    ],
    plugins: {
      '@angular-eslint': angular,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './api/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── Angular rules ───────────────────────────────────────────────────
      '@angular-eslint/component-class-suffix':          'error',
      '@angular-eslint/directive-class-suffix':          'error',
      '@angular-eslint/no-empty-lifecycle-method':       'error',
      '@angular-eslint/no-input-rename':                 'error',
      '@angular-eslint/no-output-rename':                'error',
      '@angular-eslint/use-lifecycle-interface':         'error',
      '@angular-eslint/prefer-on-push-change-detection': 'error',
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],

      // ── TypeScript rules ────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any':             'error',
      '@typescript-eslint/no-non-null-assertion':       'error',
      '@typescript-eslint/no-floating-promises':        'error',
      '@typescript-eslint/no-misused-promises':         'error',
      '@typescript-eslint/consistent-type-imports':     ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      '@typescript-eslint/no-unused-vars':              ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/prefer-readonly':             'error',
      '@typescript-eslint/no-unnecessary-condition':    'error',
      '@typescript-eslint/no-unsafe-assignment':        'error',
      '@typescript-eslint/no-unsafe-member-access':     'error',
      '@typescript-eslint/no-unsafe-return':            'error',
      '@typescript-eslint/no-unsafe-call':              'error',
      '@typescript-eslint/no-unsafe-argument':          'error',

      // ── General best practices ──────────────────────────────────────────
      'no-console':            ['error', { allow: ['error', 'warn'] }],
      'prefer-const':          'error',
      'eqeqeq':               ['error', 'always'],
      'no-var':                'error',
      'object-shorthand':      'error',
      'prefer-template':       'error',
    },
  },

  // ── Angular HTML templates ─────────────────────────────────────────────────
  {
    files: ['src/**/*.html'],
    plugins: {
      '@angular-eslint/template': angularTemplate,
    },
    languageOptions: {
      parser: angularTemplateParser,
    },
    rules: {
      '@angular-eslint/template/no-negated-async':      'error',
      '@angular-eslint/template/eqeqeq':               'error',
      '@angular-eslint/template/no-any':                'error',
      '@angular-eslint/template/use-track-by-function': 'warn',
      '@angular-eslint/template/alt-text':              'error',
      '@angular-eslint/template/elements-content':      'error',
      '@angular-eslint/template/label-has-associated-control': 'error',
      '@angular-eslint/template/no-duplicate-attributes': 'error',
    },
  },
);
