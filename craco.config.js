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
  eslint: {
    enable: process.env.DISABLE_ESLINT_PLUGIN !== 'true',
    mode: 'extends',
    configure: () => {
      // Return empty config when disabled
      if (process.env.DISABLE_ESLINT_PLUGIN === 'true') {
        return {
          rules: {}
        };
      }
      
      // Return normal config
      return {
        extends: ['react-app'],
        rules: {
          // Relax rules for development
          'no-unused-vars': 'warn',
          'react-hooks/exhaustive-deps': 'warn'
        }
      };
    }
  }
};
