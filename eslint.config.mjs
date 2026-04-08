import path from 'node:path';

import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs, plugins, rules } from 'eslint-config-airbnb-extended';

const gitignorePath = path.resolve('.', '.gitignore');

const jsConfig = defineConfig([
  // ESLint recommended config
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
  // Stylistic plugin
  plugins.stylistic,
  // Import X plugin
  plugins.importX,
  // Airbnb base recommended config
  ...configs.base.recommended,
  // Strict import rules
  rules.base.importsStrict,
]);

const nodeConfig = defineConfig([
  // Node plugin
  plugins.node,
  // Airbnb Node recommended config
  ...configs.node.recommended,
]);

const typescriptConfig = defineConfig([
  // TypeScript ESLint plugin
  plugins.typescriptEslint,
  // Airbnb base TypeScript config
  ...configs.base.typescript,
  // Strict TypeScript rules
  rules.typescript.typescriptEslintStrict,
]);

export default defineConfig([
  // Ignore files and folders listed in .gitignore
  includeIgnoreFile(gitignorePath),
  // JavaScript config
  ...jsConfig,
  // Node config
  ...nodeConfig,
  // TypeScript config
  ...typescriptConfig,
  {
    rules: {
      '@stylistic/max-len': ['error', {
        code: 160,
        ignoreTemplateLiterals: true
      }],

      '@stylistic/object-curly-newline': ['error', {
        'ImportDeclaration': { "multiline": true },
      }],

      '@stylistic/array-bracket-spacing': ["error", "always"],
      '@stylistic/comma-dangle': ["error", "never"],

      'no-console': 'off',
      '@stylistic/quotes': 'off',
      'quote-props': ['error', 'consistent'],
      "no-return-await": "off",
      "no-continue": "off",
      "no-plusplus": "off",
      "import-x/prefer-default-export": "off",
      "@typescript-eslint/no-use-before-define": "off",

      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/return-await": "off",
      "prefer-template": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      'no-await-in-loop': 'off',
      '@stylistic/lines-between-class-members': 'off',
      "@stylistic/padded-blocks": 'off',
      "import-x/order": "off",
      "import-x/consistent-type-specifier-style": "off",
    }
  }
]);
