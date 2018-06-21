import babel from 'rollup-plugin-babel'

export default {
  input: 'src/index.js',
  output: [
    {
      format: 'es',
      file: 'dist/vue-wc-wrapper.js'
    },
    {
      format: 'iife',
      name: 'wrapVueWebComponent',
      file: 'dist/vue-wc-wrapper.global.js'
    }
  ],
  plugins: [
    babel({
      exclude: 'node_modules/**',
      plugins: [
        '@babel/plugin-transform-arrow-functions',
        '@babel/plugin-transform-block-scoping'
      ]
    })
  ]
}
