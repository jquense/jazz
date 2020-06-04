const { promises: fs, readFileSync } = require('fs');
const path = require('path');

const peg = require('pegjs');

const dest = path.resolve(__dirname, '../src/parsers/');
const grammar = readFileSync(require.resolve('./grammar.pegjs'), 'utf-8');

const generate = async () => {
  try {
    const parser = peg.generate(grammar, {
      output: 'source',
      format: 'commonjs',
      allowedStartRules: [
        'imports',
        'exports',
        'at_composes',
        'values',
        'declaration',
      ],
      optimize: 'speed',
      tspegjs: {
        noTslint: true,
      },
      trace: true,
      plugins: [require('ts-pegjs')],
    });

    await fs.writeFile(path.join(dest, `parser.ts`), parser);
  } catch (err) {
    console.error(err);
  }
};

generate();
