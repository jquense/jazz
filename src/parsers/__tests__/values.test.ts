// import * as Other from 'postcss-values-parser';

import Parser from '..';
import {
  ArgumentList,
  BinaryExpression,
  BooleanLiteral,
  CallExpression,
  DOUBLE,
  EachCondition,
  Expression,
  Ident,
  InterpolatedIdent,
  Interpolation,
  KeywordArgument,
  List,
  Map,
  MathCallExpression,
  Node,
  NullLiteral,
  Numeric,
  Operator,
  Operators,
  ParentSelectorReference,
  Range,
  SINGLE,
  SpreadArgument,
  StringLiteral,
  StringTemplate,
  UnaryExpression,
  Variable,
} from '../Ast';

function op(str: Operators) {
  return new Operator(str);
}

function calc(expr: Expression) {
  return new MathCallExpression('calc', expr);
}

const comma = ',' as const;
const space = ' ' as const;

describe('parser: values', () => {
  let parser: Parser;
  let startRule = 'values';

  beforeEach(() => {
    parser = new Parser({ trace: false });
    startRule = 'values';
  });

  function parse(input: string) {
    return parser.parse(input, { startRule, source: false });
  }

  function processTestCases(input: string, expected: Node) {
    expect(parse(input)).toEqual(expected);
  }

  function shouldThrow(input: string, expected: string | RegExp | Error) {
    expect(() => parse(input)).toThrow(expected);
  }

  describe('Numeric', () => {
    it.each([
      ['1', new Numeric(1)],
      ['1.54', new Numeric(1.54)],
      ['-1.54', new Numeric(-1.54)],
      ['1%', new Numeric(1, '%')],
      ['1px', new Numeric(1, 'px')],
      ['1.3yolo', new Numeric(1.3, 'yolo')],
      ['1cm', new Numeric(1, 'cm')],
    ])('%s', processTestCases);
  });

  describe('literals', () => {
    test.each([
      ['true', new BooleanLiteral(true)],
      ['false', new BooleanLiteral(false)],
      ['null', new NullLiteral()],
    ])('%s', processTestCases);
  });

  describe('variables', () => {
    it.each([
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
    ])('%s', processTestCases);
  });

  describe('strings', () => {
    it.each([
      [
        '"hi #{$name}"',
        new StringTemplate(['hi ', ''], [new Variable('name')], DOUBLE),
      ],
      ['"hi $name"', new StringLiteral('hi $name', DOUBLE)],
      ['"#{1}px"', new StringTemplate(['', 'px'], [new Numeric(1)], DOUBLE)],
      [
        '~"hi #{$name}"',
        new StringTemplate(['hi ', ''], [new Variable('name')]),
      ],
      ['~"hi there"', new StringLiteral('hi there')],
      ["~'hi there'", new StringLiteral('hi there')],
    ])('%s', processTestCases);
  });

  describe('call expressions', () => {
    it.each([
      [`foo()`, new CallExpression(new Ident('foo'), [])],
      [
        'round($number: 4)',
        new CallExpression(
          new Ident('round'),
          new ArgumentList(
            [],
            new Map([[new Ident('number'), new Numeric(4)]]),
          ),
        ),
      ],
      [
        'color.rgba(1 2 3)',
        new CallExpression(
          new Ident('rgba', 'color'),
          new List([new Numeric(1), new Numeric(2), new Numeric(3)], space),
        ),
      ],
      [
        `foo(1, $foo ...)`,
        new CallExpression(
          new Ident('foo'),

          new ArgumentList([new Numeric(1)], undefined, [
            new SpreadArgument(new Variable('foo')),
          ]),
        ),
      ],
      [
        `foo(1, 3 + 4..., (2: 4)...)`,
        new CallExpression(
          new Ident('foo'),
          new ArgumentList([new Numeric(1)], undefined, [
            new SpreadArgument(
              new BinaryExpression(new Numeric(3), op('+'), new Numeric(4)),
            ),
            new SpreadArgument(new Map([[new Numeric(2), new Numeric(4)]])),
          ]),
        ),
      ],
      [
        `foo(1, 3 4...)`,
        new CallExpression(
          new Ident('foo'),
          new ArgumentList([new Numeric(1)], undefined, [
            new SpreadArgument(
              new List([new Numeric(3), new Numeric(4)], space),
            ),
          ]),
        ),
      ],
      [
        'rgba($r: 1, $g: 2, $b: 3)',
        new CallExpression(
          new Ident('rgba'),
          new ArgumentList(
            [],
            new Map([
              [new Ident('r'), new Numeric(1)],
              [new Ident('g'), new Numeric(2)],
              [new Ident('b'), new Numeric(3)],
            ]),
          ),
        ),
      ],
    ])('%s', processTestCases);

    it.each([
      [
        'rgba($r: 1, $g: 2, 3)',
        'Positional arguments cannot follow keyword arguments',
      ],

      // [
      //   'rgba($a..., $b)',
      //   'A spread argument must be the last argument passed',
      // ],
    ])('%s throws: %s', shouldThrow);
  });

  describe('calc', () => {
    it.each([
      [
        'calc(2 + 3 * 1)',
        calc(
          new BinaryExpression(
            new Numeric(2),
            op('+'),
            new BinaryExpression(new Numeric(3), op('*'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(2 ** 3 / 2 ** 1)',
        calc(
          new BinaryExpression(
            new BinaryExpression(new Numeric(2), op('**'), new Numeric(3)),
            op('/'),
            new BinaryExpression(new Numeric(2), op('**'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(2 ** 3 ** 1)',
        calc(
          new BinaryExpression(
            new Numeric(2),
            op('**'),
            new BinaryExpression(new Numeric(3), op('**'), new Numeric(1)),
          ),
        ),
      ],
      [
        'calc(var(--foo) * 1)',
        calc(
          new BinaryExpression(
            new CallExpression(new Ident('var'), [new Ident('--foo')]),
            op('*'),
            new Numeric(1),
          ),
        ),
      ],
      [
        'calc(1 + 2 ** 3 ** 1 / 1)',
        calc(
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
        calc(new BinaryExpression(new Numeric(1), op('+'), new Numeric(3))),
      ],

      ['calc(1px)', calc(new Numeric(1, 'px'))],
      [
        'calc(9e+1% % 1)',
        calc(
          new BinaryExpression(new Numeric(90, '%'), op('%'), new Numeric(1)),
        ),
      ],
      [
        'cAlC((1 - 3) / (1 + 4))',
        calc(
          new BinaryExpression(
            new BinaryExpression(new Numeric(1), op('-'), new Numeric(3)),
            op('/'),
            new BinaryExpression(new Numeric(1), op('+'), new Numeric(4)),
          ),
        ),
      ],
      [
        'calc((1 - 3) / 1 + 4)',
        calc(
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
        calc(
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
        calc(
          new BinaryExpression(
            new BinaryExpression(
              new BinaryExpression(new Numeric(1), op('-'), new Numeric(3)),
              op('/'),
              new CallExpression(new Ident('abs', 'math'), new Numeric(-1)),
            ),
            op('+'),
            new Numeric(4),
          ),
        ),
      ],
    ])('%s', processTestCases);
  });

  describe('identifiers', () => {
    it.each([
      ['foo-bar', new Ident('foo-bar')],
      ['foo.bar', new Ident('bar', 'foo')],
      ['-bar', new Ident('-bar')],
      ['-true', new Ident('-true')],
      ['true-bar', new Ident('true-bar')],

      ['-#{bar}', new InterpolatedIdent(['-', ''], [new Ident('bar')])],
      ['foo, bar', new List([new Ident('foo'), new Ident('bar')], comma)],
      ['--bar', new Ident('--bar')],
    ])('%s', processTestCases);
  });

  describe('lists', () => {
    it.each([
      ['()', new List([])],
      ['[ ]', new List([], undefined, true)],

      ['[bar]', new List([new Ident('bar')], undefined, true)],
      ['(bar)', new Ident('bar')],
      ['(bar,)', new List([new Ident('bar')], comma)],
      ['(bar/)', new List([new Ident('bar')], '/')],

      ['bar foo ', new List([new Ident('bar'), new Ident('foo')], space)],
      [
        '$bar$foo',
        new List([new Variable('bar'), new Variable('foo')], space),
      ],
      [
        '$bar&',
        new List([new Variable('bar'), new ParentSelectorReference()], space),
      ],
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
        'a b, c ,',
        new List(
          [new List([new Ident('a'), new Ident('b')], space), new Ident('c')],
          comma,
        ),
      ],
      [
        'a b, e f',
        new List(
          [
            new List([new Ident('a'), new Ident('b')], space),
            new List([new Ident('e'), new Ident('f')], space),
          ],
          comma,
        ),
      ],
      [
        'a b / e f',
        new List(
          [
            new List([new Ident('a'), new Ident('b')], space),
            new List([new Ident('e'), new Ident('f')], space),
          ],
          '/',
        ),
      ],
      [
        'a (b / e) f',
        new List(
          [
            new Ident('a'),
            new List([new Ident('b'), new Ident('e')], '/'),
            new Ident('f'),
          ],
          ' ',
        ),
      ],
      [
        'a b, e f / g',
        new List(
          [
            new List([new Ident('a'), new Ident('b')], space),
            new List(
              [
                new List([new Ident('e'), new Ident('f')], space),
                new Ident('g'),
              ],
              '/',
            ),
          ],
          comma,
        ),
      ],
      [
        'a / b / c',
        new List([new Ident('a'), new Ident('b'), new Ident('c')], '/'),
      ],
      [
        '(a, b, c)',
        new List([new Ident('a'), new Ident('b'), new Ident('c')], comma),
      ],
      [
        '[a, b, c]',
        new List(
          [new Ident('a'), new Ident('b'), new Ident('c')],
          comma,
          true,
        ),
      ],
      [
        '1px -1px',
        new List([new Numeric(1, 'px'), new Numeric(-1, 'px')], space),
      ],
      [
        '1px -1px -1px',
        new List(
          [new Numeric(1, 'px'), new Numeric(-1, 'px'), new Numeric(-1, 'px')],
          space,
        ),
      ],
      ['1px-1px', new Numeric(1, 'px-1px')],
      [
        'a 1cm + 2rem "hi"',
        new List(
          [
            new Ident('a'),
            new BinaryExpression(
              new Numeric(1, 'cm'),
              op('+'),
              new Numeric(2, 'rem'),
            ),

            new StringLiteral('hi', DOUBLE),
          ],
          space,
        ),
      ],

      [
        'foo(1px + #{20rem - $baz})',
        new CallExpression(new Ident('foo'), [
          new BinaryExpression(
            new Numeric(1, 'px'),
            op('+'),
            new Interpolation(
              new BinaryExpression(
                new Numeric(20, 'rem'),
                op('-'),
                new Variable('baz'),
              ),
            ),
          ),
        ]),
      ],
      [
        '#{1}px + #{20rem - $baz}',

        new BinaryExpression(
          new InterpolatedIdent(['', 'px'], [new Numeric(1)]),
          op('+'),
          new Interpolation(
            new BinaryExpression(
              new Numeric(20, 'rem'),
              op('-'),
              new Variable('baz'),
            ),
          ),
        ),
      ],
    ])('%s  ->  %s', processTestCases);
  });

  describe('maps', () => {
    it.each([
      [
        '(4: 5, 7: 4)',
        new Map([
          [new Numeric(4), new Numeric(5)],
          [new Numeric(7), new Numeric(4)],
        ]),
      ],
      [
        '(4: 5, 7: 4, )',
        new Map([
          [new Numeric(4), new Numeric(5)],
          [new Numeric(7), new Numeric(4)],
        ]),
      ],
      [
        "('4': 5,\n'7':/* */4)",
        new Map([
          [new StringLiteral('4', SINGLE), new Numeric(5)],
          [new StringLiteral('7', SINGLE), new Numeric(4)],
        ]),
      ],
      [
        '(4 + 4: 5, 7: 4)',
        new Map<any, any>([
          [
            new BinaryExpression(new Numeric(4), op('+'), new Numeric(4)),
            new Numeric(5),
          ],
          [new Numeric(7), new Numeric(4)],
        ]),
      ],
    ])('%s', processTestCases);
  });

  describe('expressions', () => {
    describe('and', () =>
      test.each([
        [
          '2 and 5',
          new BinaryExpression(new Numeric(2), op('and'), new Numeric(5)),
        ],
        [
          '2 and+5',
          new BinaryExpression(new Numeric(2), op('and'), new Numeric(5)),
        ],
        [
          '2 and[5]',
          new BinaryExpression(
            new Numeric(2),
            op('and'),
            new List([new Numeric(5)], undefined, true),
          ),
        ],
      ])('%s', processTestCases));

    describe('or', () =>
      test.each([
        [
          '2 or 5',
          new BinaryExpression(new Numeric(2), op('or'), new Numeric(5)),
        ],
        [
          '2 or+5',
          new BinaryExpression(new Numeric(2), op('or'), new Numeric(5)),
        ],
        [
          '2 or[5]',
          new BinaryExpression(
            new Numeric(2),
            op('or'),
            new List([new Numeric(5)], undefined, true),
          ),
        ],
      ])('%s', processTestCases));

    describe('not', () =>
      test.each([
        ['not 5', new UnaryExpression('not', new Numeric(5))],
        ['not(5)', new UnaryExpression('not', new Numeric(5))],
        ['not$foo', new UnaryExpression('not', new Variable('foo'))],
        ['not1px', new Ident('not1px')],
        ['not-1', new Ident('not-1')],
        [
          'nOT false',
          new List([new Ident('nOT'), new BooleanLiteral(false)], ' '),
        ],
      ])('%s', processTestCases));

    test.each([
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
      // ['- $foo', new UnaryExpression('-', new Variable('foo'))],

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
    ])('%s', processTestCases);
  });

  describe('each to/through', () => {
    beforeEach(() => {
      startRule = 'each_condition';
    });

    test.each([
      [
        '$i, $j in 5 to 6',
        new EachCondition(
          [new Variable('i'), new Variable('j')],
          new Range(new Numeric(5), new Numeric(6), true),
        ),
      ],
      [
        '$i in $a to 6',
        new EachCondition(
          new Variable('i'),
          new Range(new Variable('a'), new Numeric(6), true),
        ),
      ],
      [
        '$i in ($a) to 6',
        new EachCondition(
          new Variable('i'),
          new Range(new Variable('a'), new Numeric(6), true),
        ),
      ],
      [
        '$i in $a or $b to 6',
        new EachCondition(
          new Variable('i'),
          new Range(
            new BinaryExpression(
              new Variable('a'),
              op('or'),
              new Variable('b'),
            ),
            new Numeric(6),
            true,
          ),
        ),
      ],
    ])('%s', processTestCases);
  });

  describe('declaration value', () => {
    beforeEach(() => {
      startRule = 'declaration_value';
    });

    test.each([
      [
        'i (can put { anything } balanced) here',
        new StringLiteral('i (can put { anything } balanced) here'),
      ],
      [
        'i (can put { #{interpolations} } in ) here',
        new StringTemplate(
          ['i (can put { ', ' } in ) here'],
          [new Ident('interpolations')],
        ),
      ],
    ])('%s', processTestCases);

    it('throws on unbalanced inner parens', () => {
      expect(() => parse('this ( doesnt work')).toThrow('Expected "(", ")"');
    });

    it('throws on unbalanced inner brackets', () => {
      expect(() => parse('this { doesnt work')).toThrow(
        'Expected "(", "\\\\", "{", "}"',
      );
    });

    it('throws on unbalanced mixed', () => {
      expect(() => parse('this ( { ) } doesnt work')).toThrow(
        'Expected "(", "\\\\", "{", "}"',
      );
    });
  });
});
