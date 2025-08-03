module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add module resolution configuration
      webpackConfig.resolve = {
        ...webpackConfig.resolve,
        extensions: ['.js', '.jsx', '.json'],
        modules: ['node_modules', 'src']
      };

      // Ensure proper module handling
      webpackConfig.module.rules.push({
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false
        }
      });

      return webpackConfig;
    }
  },
  style: {
    postcss: {
      loaderOptions: {
        postcssOptions: {
          plugins: [
            require('postcss-flexbugs-fixes'),
            require('postcss-preset-env')({
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3
            }),
            require('tailwindcss'),
            require('autoprefixer'),
          ],
        },
      },
    },
  },
};
