const Processor = require('jazzjs').default;

module.exports = function jazzPlugin(_, __) {
  const jazz = new Processor();
  const { graph } = jazz;

  return {
    name: 'jazz-plugin',
    resolve: {
      input: ['.jazz', '.global.jazz'],
      output: ['.js', '.css'],
    },
    async load({ filePath, log }) {
      // throw new Error('hey');

      // const { module } = await jazz.add(filePath);
      // log('HII');
      // const out = [];
      // graph.outgoingEdges[jazz.normalize(filePath)].forEach((dep) => {
      //   const file = jazz.files.get(dep);
      //   if (file.type !== 'jazzscript') {
      //     out.push(`import '${dep}';\n`);
      //   }
      // });

      // out.push(`export default ${JSON.stringify(module.exports, null, 2)};`);

      // out.push('');

      return {
        '.js': 'export default {}', // out.join('\n'),
        '.css': out.result.css,
      };
    },
  };
};
