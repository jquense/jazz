const path = require('path');

const { plugins, rules, loaders } = require('webpack-atoms');

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

module.exports = {
  entry: {
    bundle: ['./src/main.js'],
  },
  output: {
    path: `${__dirname}/public`,
    filename: '[name].js',
    chunkFilename: '[name].[id].js',
  },
  module: {
    rules: [
      rules.js(),
      {
        test: /\.jazz$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              modules: {
                compileType: 'icss',
              },
            },
          },
          'jazz-loader',
        ],
      },
    ],
  },
  mode,
  plugins: [plugins.html(), plugins.extractCss()],
  devtool: prod ? false : 'source-map',
};
