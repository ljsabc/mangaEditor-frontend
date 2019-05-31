const path = require('path')
const uglify = require('uglifyjs-webpack-plugin')
//const CleanWebpackPlugin = require('clean-webpack-plugin')
module.exports = {
  // entry为入口,webpack从这里开始编译
  entry: [
    'babel-polyfill',
    path.join(__dirname, './src/index.js')
  ],
  // output为输出 path代表路径 filename代表文件名称
  output: {
    path: path.join(__dirname, './js/'),
    filename: 'bundle.min.js',
    publicPath: './'
  },
  // module是配置所有模块要经过什么处理
  // test:处理什么类型的文件,use:用什么,include:处理这里的,exclude:不处理这里的
  module: {
    rules: [{
      test: /\.js$/,
      use: ['babel-loader'],
      include: path.join(__dirname, 'src'),
      exclude: /node_modules/
    }]
  },
  plugins: [
    //new CleanWebpackPlugin(['js'])
  ],
  optimization: {
    minimizer: [new uglify({
      exclude: /\.min\.js$/,
      parallel: true,
      uglifyOptions: {
        warnings: false,
        parse: {},
        compress: true,
        mangle: true,
        output: {
          comments: false
        },
        toplevel: false,
        nameCache: null,
        ie8: false,
        keep_fnames: false
      }
    })]
  },
  mode: 'production'
}
