import Parser from '..';
// import { CallExpression, Ident, StringLiteral } from '../../Ast';

// const url = (str: string, quote?: string) =>
//   new CallExpression(new Ident('url'), new StringLiteral(str, quote as any));

describe('parser: imports', () => {
  let parse: (input: string) => any;

  beforeEach(() => {
    const parser = new Parser();
    parse = (input: string) =>
      parser.parse(input, { startRule: 'imports', source: false });
  });

  test.each([
    [`"./foo/bar"`, './foo/bar'],
    [`'foo/bar'`, 'foo/bar'],
    [`"./foo/bar"`, './foo/bar'],
    // [`url('./foo/bar')`, url('./foo/bar', SINGLE)],
    // [`url(./foo/bar)`, url('./foo/bar')],
  ])('%s parses to AST', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  test.each([
    [`'./foo/bar.css' supports(meh)`],
    [`'./foo/bar' screen and (orientation:landscape)`],
    [`url(./foo/bar) screen`],
  ])('%s does not parse', (input) => {
    // console.log(parse(input));
    expect(() => parse(input)).toThrow();
  });
});
