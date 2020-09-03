const f = require('gatsby-plugin-css');

exports.onCreateWebpackConfig = ({
  stage,
  rules,
  loaders,
  plugins,
  actions,
}) => {
  actions.setWebpackConfig({
    module: {
      rules: [
        {
          test: /\.mcss$/,
          use: [
            {
              loader: 'style-loader',
              options: { esModule: true },
            },
            {
              loader: 'css-loader',
              options: { modules: { compileType: 'icss' } },
            },
            {
              loader: require.resolve('../../../packages/loader'),
              options: {},
            },
          ],
        },
      ],
    },
  });
};
