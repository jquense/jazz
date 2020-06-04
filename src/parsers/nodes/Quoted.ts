import Container from 'postcss-values-parser/lib/nodes/Container';

import Interpolation from './Interpolation';

const SINGLE_QUOTE = "'".charCodeAt(0);
const DOUBLE_QUOTE = '"'.charCodeAt(0);
const BACKSLASH = '\\'.charCodeAt(0);
const HASH = '#'.charCodeAt(0);
const OPEN_CURLY = '{'.charCodeAt(0);
const CLOSE_CURLY = '}'.charCodeAt(0);

class Quoted extends Container {
  constructor(opts) {
    super(opts);

    this.type = 'quoted';
    this.quote = opts.value[0];

    this.expressions = [];
    this.quasis = [];
  }

  toString(stringifier: any) {
    // console.log('gi'); ,                                                                                                                            m j,,
    return this.quasis.reduce((acc, next, idx) => {
      const expr = this.expressions[idx]?.toString(stringifier) | '';
      return `${acc}${expr}${next}`;
    });
  }

  static fromTokens(tokens, parser) {
    const [first, ...rest] = tokens;
    const [, value, startLine, startChar] = first;

    const node = new Quoted({ value });
    const innerTokens = Quoted.tokenize(
      value.slice(1, -1),
      startLine,
      startChar + 1,
    );

    for (const token of innerTokens) {
      if (token[0] === 'string') {
        node.quasis.push(token[1]);
      } else if (token[0] === 'interpolation') {
        node.expressions.push(Interpolation.fromTokens([token], parser));
      }
    }
  }

  static *tokenize(content: string, startLine: number, startChar: number) {
    const { length } = content;
    let code: number, n: number;
    let next = -1;
    let escaped = false;
    let start = 0;

    function getToken(type: 'string' | 'interpolation', end: number) {
      const slice = content.slice(start, end + 1);
      const token = [type, slice, startLine, startChar];
      start = end + 1;
      return token;
    }

    while (next < length) {
      next++;

      code = content.charCodeAt(next);
      n = content.charCodeAt(next + 1);

      if (code === BACKSLASH) {
        escaped = !escaped;
      } else if (escaped) {
        escaped = false;
      } else if (code === HASH && n === OPEN_CURLY) {
        let deep = 1;
        let stringQuote: number | boolean = false;
        let stringEscaped: number | boolean = false;

        yield getToken('string', next - 1);

        while (deep > 0) {
          next += 1;

          if (length <= next) return;

          code = content.charCodeAt(next);

          if (stringQuote) {
            if (!stringEscaped && code === stringQuote) {
              stringQuote = false;
              stringEscaped = false;
            } else if (code === BACKSLASH) {
              stringEscaped = !escaped;
            } else if (stringEscaped) {
              stringEscaped = false;
            }
          } else if (code === SINGLE_QUOTE || code === DOUBLE_QUOTE) {
            stringQuote = code;
          } else if (code === CLOSE_CURLY) {
            deep -= 1;
          } else if (code === HASH && n === OPEN_CURLY) {
            deep += 1;
          }
        }

        yield getToken('interpolation', next);
      }
    }

    yield getToken('string', next);
  }
}

export default Quoted;
