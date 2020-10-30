const sveltePreprocess = require('svelte-preprocess');
const Jazz = require('jazzjs').default;

let processor;

module.exports = {
  preprocess: sveltePreprocess({
    aliases: [['jazz', 'jazzlang']],
    /** Add a custom language preprocessor */
    async jazz({ content, filename, attributes }) {
      processor =
        processor ||
        new Jazz({
          icssCompatible: true,
        });

      const extname = attributes.scope === 'global' ? '.global.jazz' : '.jazz';

      const { result } = await processor.add(`${filename}${extname}`, content);

      return { code: result.css, map: result.map };
    },
  }),
};
