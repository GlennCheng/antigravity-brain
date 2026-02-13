/* eslint-disable @typescript-eslint/no-var-requires */

//@ts-check
'use strict';

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require('path');
const webpack = require('webpack');

/** @type WebpackConfig */
const extensionConfig = {
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: 'node', // extensions run in a node context
  entry: {
    extension: './src/extension.ts',
    // 'test/runTest': './src/test/runTest.ts'
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist'),
    libraryTarget: 'commonjs',
    devtoolModuleFilenameTemplate: '../../[resource-path]'
  },
  resolve: {
    mainFields: ['module', 'main'],
    extensions: ['.ts', '.js'], // support ts-files and js-files
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    // new webpack.Optimizev8Plugin() // optional
  ],
  externals: {
    'vscode': 'commonjs vscode', // ignored because it doesn't exist
  },
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map', // create a source map that points to the original source file
};

/** @type WebpackConfig */
const webviewConfig = {
  mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: 'web', // webview runs in a browser context
  entry: {
    webview: './src/webview/index.tsx'
  },
  output: {
    filename: '[name].js',
    path: path.join(__dirname, './dist'),
    libraryTarget: 'var',
    library: 'webview'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'], // prefer browser build
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    // new webpack.Optimizev8Plugin() // optional
  ],
  performance: {
    hints: false
  },
  devtool: 'nosources-source-map', // create a source map that points to the original source file
};

module.exports = [extensionConfig, webviewConfig];
