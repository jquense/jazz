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
        'values',
        'selector',
        'declaration_prop',
        'declaration_value',
        'almost_any_value',
        'for_condition',
        'each_condition',
        'callable_declaration',
        'call_expression',
        'call_expressions',
        'compose_list',
        'selector',

        // for tests
        'UnaryExpression',
        // 'BinaryExpression',
        'Expression',
        'ExpressionWithDivision',
        'ListExpression',
        'Numeric',
        // 'MathCallExpression',
        // 'CallExpression',
        'Url',
      ],
      optimize: 'speed',
      tspegjs: {
        noTslint: true,
        customHeader: '/* eslint-disable */',
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
