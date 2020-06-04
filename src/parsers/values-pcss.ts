// /* eslint-disable max-classes-per-file */

// import scssTokenizer from 'postcss-scss/lib/scss-tokenize';
// import { Container } from 'postcss-values-parser';
// import ValuesParser, { Token } from 'postcss-values-parser/lib/ValuesParser';
// import ValuesStringifier from 'postcss-values-parser/lib/ValuesStringifier';
// import BaseOperator from 'postcss-values-parser/lib/nodes/Operator';
// import Input from 'postcss/lib/input';

// import Interpolation from './nodes/Interpolation';
// import Quoted from './nodes/Quoted';

// class Operator extends BaseOperator {
//   static get chars() {
//     return [...BaseOperator.chars, '>=', '<='];
//   }
// }

// class ScssValueParser extends ValuesParser {
//   constructor(input: any) {
//     super(input, {
//       interpolation: { prefix: '#' },
//       ignoreUnknownWords: true,
//       variables: {
//         prefixes: ['--', '(\\w+)\\.?\\$'],
//       },
//     });
//   }

//   createTokenizer() {
//     this.tokenizer = scssTokenizer(this.input);
//   }

//   unknownWord(tokens: Token[]) {
//     console.log('unknown', tokens);
//     const [first] = tokens;
//     const [type, value] = first;

//     if (type === 'string') {
//       Quoted.fromTokens(tokens, this);
//     } else if (type === 'word') {
//       if (Interpolation.test(tokens)) {
//         Interpolation.fromTokens(tokens, this);
//       } else if (Operator.chars.includes(value)) {
//         Operator.fromTokens(tokens, this);
//       } else {
//         super.unknownWord(tokens);
//       }
//     } else {
//       super.unknownWord(tokens);
//     }
//   }
// }

// export function parse(css: string) {
//   const input = new Input(css);
//   const parser = new ScssValueParser(input);

//   parser.parse();

//   const { root } = parser;
//   const original = root.toString;

//   root.toString = () => original.call(root, ValuesStringifier.stringify);

//   return parser.root;
// }
