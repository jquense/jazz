const path = require('path');

const Jazz = require('jazzjs').default;
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const mode = process.env.NODE_ENV || 'development';
const prod = mode === 'production';

const styleRegex = /<style([\S\s]*?)>([\S\s]*?)<\/style>/im;

const replace = (source, map) => {
  const ids = Object.keys(map).join('|');

  return (
    source
      // Replace {<identifier>.<key>} values
      // Note extra exclusion to avoid accidentally matching ${<identifier>.<key>}
      .replace(new RegExp(`([^$]){(${ids})}`, 'gm'), (match, before, key) => {
        const replacement = map[key];
        return `${before}${replacement}`;
      })

      // Then any remaining <identifier>.<key> values
      .replace(
        new RegExp(`(\\b)(${ids})(\\b)`, 'gm'),
        (match, before, key, suffix) => {
          const replacement = map[key];
          return `${before}${replacement}${suffix}`;
        },
      )
  );
};

function preprocess() {
  const processor = new Jazz({ icssCompatible: true });

  function getFile(filename, attributes) {
    const extname = attributes.scope === 'global' ? '.global.jazz' : '.jazz';
    const file = processor.files.get(
      processor.normalize(`${filename}${extname}`),
    );
    return file;
  }

  return {
    style: ({ filename, content, attributes }) => {
      const file = getFile(filename, attributes);
      return {
        code: file ? file.result.css : content,
      };
    },
    // script: ({ filename, content, attributes }) => {
    //   const file = getFile(filename, attributes);
    //   return {
    //     code: file ? file.result.css : content,
    //   };
    // },
    markup: async ({ filename, content }) => {
      const style = content.match(styleRegex);
      if (!style || !style[1].includes('jazz')) {
        return { code: content };
      }

      const m = style[1].match(/scope=['"]?(.+)['"]?/im);
      const extname = m && m[1].trim() === 'global' ? '.global.jazz' : '.jazz';
      const cssFile = `${filename}${extname}`;

      if (processor.has(cssFile)) {
        processor.invalidate(cssFile);
      }

      let result;
      try {
        result = await processor.add(cssFile, style[2]);
      } catch (e) {
        e.message = e.toString();
        throw e;
      }

      const code = replace(content, result.exports);

      return {
        code,
        dependencies: processor.dependencies(cssFile),
      };
    },
  };
}

module.exports = {
  entry: {
    bundle: ['./src/main.js'],
  },
  resolve: {
    alias: {
      svelte: path.resolve('../node_modules', 'svelte'),
    },
    extensions: ['.mjs', '.js', '.svelte'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
  },
  output: {
    path: `${__dirname}/public`,
    filename: '[name].js',
    chunkFilename: '[name].[id].js',
  },
  module: {
    rules: [
      {
        test: /\.svelte$/,
        use: {
          loader: 'svelte-loader',
          options: {
            emitCss: true,
            hotReload: true,
            preprocess: [preprocess()],
          },
        },
      },
      {
        test: /\.svelte\.css$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              // importLoaders: 1,
              modules: {
                compileType: 'icss',
              },
            },
          },
        ],
      },
    ],
  },
  mode,
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
  ],
  devtool: prod ? false : 'source-map',
};
