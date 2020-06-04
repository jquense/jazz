// import * as Other from 'postcss-values-parser';

import Parser from '..';
import {
  Function as AstFunction,
  BinaryExpression,
  Block,
  Calc,
  DOUBLE,
  Expression,
  Ident,
  InterpolatedIdent,
  List,
  MathExpression,
  Numeric,
  Operator,
  Operators,
  SINGLE,
  Separator,
  StringLiteral,
  StringTemplate,
  Variable,
} from '../Ast';

function op(str: Operators) {
  return new Operator(str);
}

const comma = () => new Separator(',');
const space = () => new Separator(' ');

describe('parser: values', () => {
  let parse: (input: string) => any;
  beforeEach(() => {
    const parser = new Parser({ trace: true });
    parse = (input: string) => parser.parse(input, { startRule: 'values' });
  });

  it.each([
    ['1', new Numeric(1)],
    ['1.54', new Numeric(1.54)],
    ['-1.54', new Numeric(-1.54)],
    ['1%', new Numeric(1, '%')],
    ['1px', new Numeric(1, 'px')],
    ['1.3yolo', new Numeric(1.3, 'yolo')],
    ['1cm', new Numeric(1, 'cm')],
  ])('parses numbers %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    // variables
    ['$bar', new Variable('bar')],
    ['foo.$bar', new Variable('bar', 'foo')],
    [
      "$bar + 'blue'",
      new BinaryExpression(
        new Variable('bar'),
        op('+'),
        new StringLiteral('blue', SINGLE),
      ),
    ],
  ])('parses variables %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    [
      '"hi #{$name}"',
      new StringTemplate(['hi ', ''], [new Variable('name')], DOUBLE),
    ],
    ['"hi $name"', new StringLiteral('hi $name', DOUBLE)],
    ['"#{1}px"', new StringTemplate(['', 'px'], [new Numeric(1)], DOUBLE)],
  ])('parses strings %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    [
      'rgba(1,2,3)',
      new AstFunction(
        new Ident('rgba'),
        new List([new Numeric(1), new Numeric(2), new Numeric(3)], comma()),
      ),
    ],
    [
      'color.rgba(1 2 3)',
      new AstFunction(
        new Ident('rgba', 'color'),
        new List([new Numeric(1), new Numeric(2), new Numeric(3)], space()),
      ),
    ],
  ])('parses functions %s', (input, expected) => {
    // expect(parse(input)).toEqual({});
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    [
      'calc(1 + 3)',
      new Calc(new MathExpression(new Numeric(1), op('+'), new Numeric(3))),
    ],
    ['calc(1px)', new Calc(new Numeric(1, 'px'))],
    [
      'cAlC((1 - 3) / (1 + 4))',
      new Calc(
        new MathExpression(
          new MathExpression(new Numeric(1), op('-'), new Numeric(3)),
          op('/'),
          new MathExpression(new Numeric(1), op('+'), new Numeric(4)),
        ),
      ),
    ],
    [
      'calc((1 - 3) / 1 + 4)',
      new Calc(
        new MathExpression(
          new MathExpression(
            new MathExpression(new Numeric(1), op('-'), new Numeric(3)),
            op('/'),
            new Numeric(1),
          ),
          op('+'),
          new Numeric(4),
        ),
      ),
    ],
    [
      'calc((1 - math.$pi) / $bar + 4)',
      new Calc(
        new MathExpression(
          new MathExpression(
            new MathExpression(
              new Numeric(1),
              op('-'),
              new Variable('pi', 'math'),
            ),
            op('/'),
            new Variable('bar'),
          ),
          op('+'),
          new Numeric(4),
        ),
      ),
    ],

    [
      'calc((1 - 3) / math.abs(-1) + 4)',
      new Calc(
        new MathExpression(
          new MathExpression(
            new MathExpression(new Numeric(1), op('-'), new Numeric(3)),
            op('/'),
            new AstFunction(
              new Ident('abs', 'math'),
              new Expression([new Numeric(-1)]),
            ),
          ),
          op('+'),
          new Numeric(4),
        ),
      ),
    ],
  ])('parses calc %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    ['foo-bar', new Ident('foo-bar')],
    ['foo.bar', new Ident('bar', 'foo')],
    ['-bar', new Ident('-bar')],

    ['-#{bar}', new InterpolatedIdent(['-', ''], [new Ident('bar')])],
    [
      'foo, bar',
      new Expression([new Ident('foo'), comma(), new Ident('bar')]),
    ],
    ['--bar', new Ident('--bar')],
  ])('parses identifiers %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.only.each([
    ['bar foo', new List([new Ident('bar'), new Ident('foo')], space())],
    ['bar, baz', new List([new Ident('bar'), new Ident('baz')], comma())],

    [
      '1px -1px',
      new List([new Numeric(1, 'px'), new Numeric(-1, 'px')], space()),
    ],
    [
      '1px-1px',
      new List([new Numeric(1, 'px'), new Numeric(-1, 'px')], space()),
    ],
  ])('parses lists %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  it.each([
    [
      '1cm -1px',
      new Expression([new Numeric(1, 'cm'), op('-'), new Numeric(1, 'px')]),
    ],

    [
      '(1cm + 2rem) + "hi"',
      new Expression([
        new Block(
          new Expression([
            new Numeric(1, 'cm'),
            op('+'),
            new Numeric(2, 'rem'),
          ]),
        ),
        op('+'),
        new StringLiteral('hi', DOUBLE),
      ]),
    ],

    [
      'foo(1px + #{20rem - $baz})',
      new AstFunction(
        new Ident('calc'),
        new Expression([
          new Numeric(1, 'px'),
          op('+'),
          new Numeric(20, 'rem'),
          op('-'),
          new Variable('baz'),
        ]),
      ),
    ],
    [
      '#{1}px + #{20rem - $baz}',

      new Expression([
        new InterpolatedIdent(['', 'px'], [new Numeric(1)]),
        op('+'),
        new Numeric(20, 'rem'),
        op('-'),
        new Variable('baz'),
      ]),
    ],
  ])('parses expressions %s', (input, expected) => {
    expect(parse(input)).toEqual(expected);
  });

  // it.each([
  //   ['#{30,}', 'Unexpected trailing comma'],
  //   ['foo, bar,', 'Unexpected trailing comma'],
  // ])('does not parse `%s`', (input, expected) => {
  //   expect(() => parse(input)).toThrowError(expected);
  // });

  // it('stringifies', () => {
  //   // console.log(
  //   //   Other.parse(`hi +`, {
  //   //     interpolation: { prefix: '#' },
  //   //     ignoreUnknownWords: true,
  //   //   }),
  //   // );
  //   expect(parse(`#{1 + 3}`)).toEqual({});
  // });
});
