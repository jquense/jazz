// import * as Other from 'postcss-values-parser';

import Parser from '..';
import {
  Function as AstFunction,
  BinaryExpression,
  Calc,
  DOUBLE,
  Ident,
  InterpolatedIdent,
  List,
  Numeric,
  Operator,
  Operators,
  SINGLE,
  StringLiteral,
  StringTemplate,
  UnaryExpression,
  Variable,
} from '../Ast';

function op(str: Operators) {
  return new Operator(str);
}

const comma = ',' as const;
const space = ' ' as const;

describe('parser: values', () => {
  let parse: (input: string) => any;
  beforeEach(() => {
    const parser = new Parser({ trace: false });

    parse = (input: string) => {
      const result = parser.parse(input, { startRule: 'values' });
      // if (unwrap && result.nodes.length <= 1) {
      //   result = result.nodes[0];
      //   if (result) result.parent = null;
      // }
      return result;
    };
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
      new List(
        [new Variable('bar'), op('+'), new StringLiteral('blue', SINGLE)],
        space,
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
        new List([new Numeric(1), new Numeric(2), new Numeric(3)], comma),
      ),
    ],
    [
      'color.rgba(1 2 3)',
      new AstFunction(
        new Ident('rgba', 'color'),
        new List([new Numeric(1), new Numeric(2), new Numeric(3)], space),
      ),
    ],
  ])('parses functions %s', (input, expected) => {
    // expect(parse(input)).toEqual({});
    expect(parse(input)).toEqual(expected);
  });

  describe('calc', () => {
    it.each([
      [
        'calc(2 + 3 * 1)',
        new Calc(
          new BinaryExpression(
            new Numeric(2),
            op('+'),
            new BinaryExpression(new Numeric(3), op('*'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(2 ** 3 / 2 ** 1)',
        new Calc(
          new BinaryExpression(
            new BinaryExpression(new Numeric(2), op('**'), new Numeric(3)),
            op('/'),
            new BinaryExpression(new Numeric(2), op('**'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(2 ** 3 ** 1)',
        new Calc(
          new BinaryExpression(
            new Numeric(2),
            op('**'),
            new BinaryExpression(new Numeric(3), op('**'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(var(--foo) * 1)',
        new Calc(
          new BinaryExpression(
            new AstFunction(new Ident('var'), new List([new Ident('--foo')])),
            op('*'),
            new Numeric(1),
          ),
        ),
      ],
      [
        'calc(1 + 2 ** 3 ** 1 / 1)',
        new Calc(
          new BinaryExpression(
            new Numeric(1),
            op('+'),
            new BinaryExpression(
              new BinaryExpression(
                new Numeric(2),
                op('**'),
                new BinaryExpression(new Numeric(3), op('**'), new Numeric(1)),
              ),
              op('/'),
              new Numeric(1),
            ),
          ),
        ),
      ],
      [
        'calc(1 + 3)',
        new Calc(
          new BinaryExpression(new Numeric(1), op('+'), new Numeric(3)),
        ),
      ],

      ['calc(1px)', new Calc(new Numeric(1, 'px'))],
      [
        'calc(9e+1% % 1)',
        new Calc(
          new BinaryExpression(new Numeric(90, '%'), op('%'), new Numeric(1)),
        ),
      ],
      [
        'cAlC((1 - 3) / (1 + 4))',
        new Calc(
          new BinaryExpression(
            new BinaryExpression(new Numeric(1), op('-'), new Numeric(3)),
            op('/'),
            new BinaryExpression(new Numeric(1), op('+'), new Numeric(4)),
          ),
        ),
      ],
      [
        'calc((1 - 3) / 1 + 4)',
        new Calc(
          new BinaryExpression(
            new BinaryExpression(
              new BinaryExpression(new Numeric(1), op('-'), new Numeric(3)),
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
          new BinaryExpression(
            new BinaryExpression(
              new BinaryExpression(
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
          new BinaryExpression(
            new BinaryExpression(
              new BinaryExpression(new Numeric(1), op('-'), new Numeric(3)),
              op('/'),
              new AstFunction(
                new Ident('abs', 'math'),
                new List([new Numeric(-1)]),
              ),
            ),
            op('+'),
            new Numeric(4),
          ),
        ),
      ],
    ])('%s', (input, expected) => {
      expect(parse(input)).toEqual(expected);
    });
  });

  describe('identifiers', () => {
    it.each([
      ['foo-bar', new Ident('foo-bar')],
      ['foo.bar', new Ident('bar', 'foo')],
      ['-bar', new Ident('-bar')],

      ['-#{bar}', new InterpolatedIdent(['-', ''], [new Ident('bar')])],
      ['foo, bar', new List([new Ident('foo'), new Ident('bar')], comma)],
      ['--bar', new Ident('--bar')],
    ])('%s', (input, expected) => {
      expect(parse(input)).toEqual(expected);
    });
  });

  describe('lists', () => {
    it.each([
      ['bar foo', new List([new Ident('bar'), new Ident('foo')], space)],
      [
        `bar
      foo`,
        new List([new Ident('bar'), new Ident('foo')], space),
      ],
      [`bar\nfoo`, new List([new Ident('bar'), new Ident('foo')], space)],
      [
        'bar/*hi*/foo/*hi*/',
        new List([new Ident('bar'), new Ident('foo')], space),
      ],
      ['bar//hi\nfoo', new List([new Ident('bar'), new Ident('foo')], space)],
      ['bar,baz', new List([new Ident('bar'), new Ident('baz')], comma)],
      [
        'bar\t, baz \n  , foo  ',
        new List(
          [new Ident('bar'), new Ident('baz'), new Ident('foo')],
          comma,
        ),
      ],
      [
        'a b, c ',
        new List(
          [new List([new Ident('a'), new Ident('b')], space), new Ident('c')],
          comma,
        ),
      ],

      [
        '(a, b, c)',
        new List([new Ident('a'), new Ident('b'), new Ident('c')], comma),
      ],
      [
        'a / b / c',
        new List([new Ident('a'), new Ident('b'), new Ident('c')], '/'),
      ],
      [
        '1px -1px',
        new List([new Numeric(1, 'px'), new Numeric(-1, 'px')], space),
      ],
      ['1px-1px', new Numeric(1, 'px-1px')],
      [
        '(1cm + 2rem) + "hi"',
        new List(
          [
            new List(
              [new Numeric(1, 'cm'), op('+'), new Numeric(2, 'rem')],
              space,
            ),
            op('+'),
            new StringLiteral('hi', DOUBLE),
          ],
          space,
        ),
      ],

      [
        'foo(1px + #{20rem - $baz})',
        new AstFunction(
          new Ident('foo'),
          new List(
            [
              new Numeric(1, 'px'),
              op('+'),
              new List(
                [new Numeric(20, 'rem'), op('-'), new Variable('baz')],
                space,
              ),
            ],
            space,
          ),
        ),
      ],
      [
        '#{1}px + #{20rem - $baz}',

        new List(
          [
            new InterpolatedIdent(['', 'px'], [new Numeric(1)]),
            op('+'),
            new List(
              [new Numeric(20, 'rem'), op('-'), new Variable('baz')],
              space,
            ),
          ],
          space,
        ),
      ],
    ])('%s', (input, expected) => {
      expect(parse(input)).toEqual(expected);
    });
  });

  describe('expressions', () => {
    beforeEach(() => {
      const parser = new Parser({ trace: true });

      parse = (input: string) => {
        const result = parser.parse(input, { startRule: 'Expression' });
        return result;
      };
    });

    test.each([
      [
        '2 >= 5',
        new BinaryExpression(new Numeric(2), op('>='), new Numeric(5)),
      ],
      [
        '2 > 5 or 6 == 6',
        new BinaryExpression(
          new BinaryExpression(new Numeric(2), op('>'), new Numeric(5)),
          op('or'),
          new BinaryExpression(new Numeric(6), op('=='), new Numeric(6)),
        ),
      ],

      [
        '2 > $max or $other and 4',
        new BinaryExpression(
          new BinaryExpression(new Numeric(2), op('>'), new Variable('max')),
          op('or'),
          new BinaryExpression(
            new Variable('other'),
            op('and'),
            new Numeric(4),
          ),
        ),
      ],
      [
        'not 2 >= 5',
        new UnaryExpression(
          'not',
          new BinaryExpression(new Numeric(2), op('>='), new Numeric(5)),
        ),
      ],
      [
        '2 + (not $foo)',
        new BinaryExpression(
          new Numeric(2),
          op('+'),
          new UnaryExpression('not', new Variable('foo')),
        ),
      ],
      [
        '2 and not $foo',
        new BinaryExpression(
          new Numeric(2),
          op('and'),
          new UnaryExpression('not', new Variable('foo')),
        ),
      ],
      ['-$foo', new UnaryExpression('-', new Variable('foo'))],
      ['-$foo', new UnaryExpression('-', new Variable('foo'))],
      ['- $foo', new UnaryExpression('-', new Variable('foo'))],

      ['+$foo', new UnaryExpression('+', new Variable('foo'))],
      ['+ $foo', new UnaryExpression('+', new Variable('foo'))],
      [
        '2 + -$foo',
        new BinaryExpression(
          new Numeric(2),
          op('+'),
          new UnaryExpression('-', new Variable('foo')),
        ),
      ],
      // [],
    ])('%s', (input, expected) => {
      expect(parse(input)).toEqual(expected);
    });
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
