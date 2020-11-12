const Jazz = require('jazzjs').default;

const styleRegex = /<style([\S\s]*?)>([\S\s]*?)<\/style>/im;

const replace = (source, map) => {
  const keys = Object.keys(map);

  if (!keys.length) return source;

  const ids = keys.map((k) => (k[0] === '$' ? k : `%${k}`)).join('|');

  return source.replace(new RegExp(`(${ids})`, 'gm'), (match, key) => {
    return map[key.replace(/^%/, '')];
  });
};

module.exports = function preprocess(config) {
  const processor = new Jazz(config || { map: { inline: false } });

  function getFile(filename, attributes) {
    const extname = attributes.scope === 'global' ? '.global.jazz' : '.jazz';
    const file = processor.files.get(
      processor.normalize(`${filename}${extname}`),
    );
    return file;
  }

  return {
    processor,
    preprocess: {
      style: ({ filename, content, attributes }) => {
        const file = getFile(filename, attributes);

        if (!file) {
          return { code: content };
        }
        const { css: code } = file.toICSS();
        return {
          code, /// '/* extracted jazz file */',
          // map,
        };
      },
      markup: async ({ filename, content }) => {
        const style = content.match(styleRegex);
        if (!style || !style[1].includes('jazz')) {
          return { code: content };
        }

        const m = style[1].match(/scope=['"]?(.+)['"]?/im);
        const extname =
          m && m[1].trim() === 'global' ? '.global.jazz' : '.jazz';
        const cssFile = `${filename}${extname}`;

        if (processor.has(cssFile)) {
          processor.invalidate(cssFile);
        }

        const result = await processor.add(cssFile, style[2]);

        const code = replace(content, result.exports);

        return {
          code,
          dependencies: processor.dependencies(cssFile),
        };
      },
    },
  };
};

module.exports.rollup = require('./rollup');
