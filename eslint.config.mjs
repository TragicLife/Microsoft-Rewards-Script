import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs']
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts'],
        rules: {
            'linebreak-style': ['error', 'unix'],
            'quotes': ['error', 'single'],
            'semi': ['error', 'never'],
            '@typescript-eslint/no-explicit-any': [
                'warn',
                {
                    fixToUnknown: false
                }
            ],
            'prefer-arrow-callback': 'error',
            'no-empty': 'off'
        }
    }
)

