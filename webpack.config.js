const merge = require('webpack-merge')
const common = require('./webpack.common.js')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = merge(common, {
  mode: 'production',
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      test: /\.js$/,
      exclude: /node_modules/,
      parallel: true,
      terserOptions: {
        mangle: true,
        parallel: true,
        extractComments: 'all',
        compress: {
          drop_console: true
        }
      }
    })]
  }
})
