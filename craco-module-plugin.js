module.exports = {
  overrideWebpackConfig: ({ webpackConfig }) => {
    // Ensure all .js files are treated as modules
    webpackConfig.module.rules.unshift({
      test: /\.js$/,
      type: "javascript/auto",
      resolve: {
        fullySpecified: false
      }
    });

    // Configure dev server to serve proper MIME types
    if (webpackConfig.devServer) {
      webpackConfig.devServer.headers = {
        ...webpackConfig.devServer.headers,
        "Content-Type": "application/javascript",
        "Service-Worker-Allowed": "/"
      };
      webpackConfig.devServer.static = {
        ...webpackConfig.devServer.static,
        serveIndex: false,
        headers: {
          "Content-Type": "application/javascript"
        }
      };
    }

    return webpackConfig;
  },

  overrideDevServerConfig: ({ devServerConfig }) => {
    devServerConfig.headers = {
      ...devServerConfig.headers,
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/"
    };
    return devServerConfig;
  }
};
