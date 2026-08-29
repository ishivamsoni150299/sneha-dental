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
      ...tsEslint.configs.recommended,
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
      '@typescript-eslint/no-floating-promises':        'error',
      '@typescript-eslint/no-misused-promises':         ['error', {
        checksVoidReturn: { inheritedMethods: false },
      }],
      '@typescript-eslint/no-unused-vars':              ['error', { argsIgnorePattern: '^_' }],

      // ── General best practices ──────────────────────────────────────────
      'no-console':            ['error', { allow: ['error', 'info', 'warn'] }],
      'prefer-const':          'error',
      'eqeqeq':               ['error', 'smart'],
      'no-var':                'error',
      'object-shorthand':      'error',
      'prefer-template':       'error',
    },
  },

  // ── Unit tests ────────────────────────────────────────────────────────────
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
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
      '@angular-eslint/template/eqeqeq':               ['error', { allowNullOrUndefined: true }],
      '@angular-eslint/template/use-track-by-function': 'warn',
      '@angular-eslint/template/alt-text':              'error',
      '@angular-eslint/template/elements-content':      'error',
    },
  },
);
