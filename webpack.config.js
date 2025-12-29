module.exports = {
  module: {
    rules: [
      {
        test: /\.m?js$/,
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false
        }
      }
    ]
  },
  devServer: {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/javascript'
    },
    static: {
      directory: './public',
      publicPath: '/',
      serveIndex: false,
      watch: true,
      headers: {
        'Content-Type': 'application/javascript'
      }
    },
    historyApiFallback: true,
    hot: true,
    compress: true
  }
};
