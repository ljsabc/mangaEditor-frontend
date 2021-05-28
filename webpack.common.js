const path = require('path')
const glob = require('glob')
const webpack = require('webpack')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const FixStyleOnlyEntriesPlugin = require('webpack-fix-style-only-entries')

module.exports = {
  target: 'web',
  // entry为入口,webpack从这里开始编译
  entry: {
    'index': [
      path.resolve(__dirname, './src/index.js')
    ],
    'style': glob.sync('./fonts/*.css').concat([
      path.resolve(__dirname, './css/bootstrap.min.css'),
      path.resolve(__dirname, './css/balloon.css'),
      path.resolve(__dirname, './css/basic.css'),
      path.resolve(__dirname, './css/dropzone.css'),
      path.resolve(__dirname, './css/style.css'),
      path.resolve(__dirname, './css/fonts.css')
    ]),
    'web': path.resolve(__dirname, 'index.html')
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build/')
  },
  module: {
    rules: [{
      test: /\.js$/,
      exclude: path.resolve(__dirname, 'node_modules/'),
      use: [{
        loader: 'babel-loader'
      }]
    },
    {
      test: /\.css$/,
      use: [MiniCssExtractPlugin.loader,
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1
          }
        }
      ]

    },
    {
      test: /\.(png|jpg|jpeg|gif|ico|svg|eot|otf|ttf|woff|woff2)$/,
      use: [{
        loader: 'file-loader',
        options: {
          outputPath: './assets/',
          name: '[name].[hash].[ext]'
        }
      }]
    },
    {
      test: /\.html$/,
      use: [{
        loader: 'file-loader',
        options: {
          outputPath: './',
          name: '[name].html'
        }
      }]
    }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({ $: 'jquery', jQuery: 'jquery' }),
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new FixStyleOnlyEntriesPlugin({
      extensions: ['css', 'html']
    }),
    new OptimizeCSSAssetsPlugin({
      assetNameRegExp: /.css$/,
      cssProcessor: require('cssnano'),
      cssProcessorPluginOptions: {
        preset: ['default', { discardComments: { removeAll: true } }]
      },
      canPrint: true,
      filename: '[name].min.css'
    }),
    new CleanWebpackPlugin({
    })
  ]
}
