// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // vi.fn()-mocked methods and expect.any(...) are both typed loosely by
    // design in vitest — these two rules exist to catch real bugs (a class
    // method losing its `this` binding, an untyped value flowing into typed
    // code) that don't apply to mock assertions. Scoped to spec files only.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
);
