import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['UPSTREAM', 'dist'],
  },
  {
    // src/pptx is a verbatim copy of slidevjs/slidev PR #2722 (see UPSTREAM
    // and scripts/sync.sh). Style rules that upstream does not enforce stay
    // off there, so a sync never needs a follow-up edit.
    files: ['src/pptx/**'],
    rules: {
      'e18e/prefer-static-regex': 'off',
      'e18e/prefer-array-at': 'off',
      'e18e/prefer-array-from-map': 'off',
    },
  },
)
