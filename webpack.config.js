const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin')
const path = require('path')
const glob = require('glob')
const TerserPlugin = require('terser-webpack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

module.exports = {
  mode: 'production',
  // entry为入口,webpack从这里开始编译
  entry: { 'bundle.min.js': [
    'babel-polyfill',
    path.resolve(__dirname, './src/index.js'),
    path.resolve(__dirname, './bdshare/bdshare.min.js')
  ],
  'bundle.min.css': glob.sync('./@(css)/**/*.css')
  },
  // output为输出 path代表路径 filename代表文件名称
  output: {
    path: path.resolve(__dirname, './build'),
    filename: '[name]',
    publicPath: './build/'
  },
  // module是配置所有模块要经过什么处理
  // test:处理什么类型的文件,use:用什么,include:处理这里的,exclude:不处理这里的
  module: {
    rules: [{
      test: /\.js$/,
      use: ['babel-loader'],
      exclude: /node_modules/
    },
    {
      test: /\.css$/,
	  use: [
        {
          loader: MiniCssExtractPlugin.loader,
          options: {
            // you can specify a publicPath here
            // by default it uses publicPath in webpackOptions.output
          }
        },
        'css-loader'
      ]
    },
    {
      test: /\.(png|jpg|jpeg|gif|ico|svg|eot|otf|ttf|woff)$/,
      loader: 'file-loader',
      options: {
        outputPath: './assets/',
        name: '[name].[hash].[ext]'
      }
    }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      // Options similar to the same options in webpackOptions.output
      // both options are optional
      filename: '[name].css',
      chunkFilename: '[id].css'
    })
  ],

  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
      test: /\.js$/,
      exclude: /node_modules/,
      parallel: true,
      terserOptions: {
        compress: {},
        mangle: true
      }
    })
    // new OptimizeCSSAssetsPlugin({})]
    ]
  }
}
