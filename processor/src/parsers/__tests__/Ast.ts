import {
  BinaryExpression,
  DOUBLE,
  Ident,
  List,
  MathCallExpression,
  Node,
  Numeric,
  Operator,
  SINGLE,
  StringLiteral,
  UnaryExpression,
  Variable,
} from '../../Ast';

function stringify(cases: Array<[Node, string] | [Node, string, false]>) {
  cases.forEach(([node, expected]) => {
    expect(node.toString()).toEqual(expected);
  });
}

describe('AST Nodes', () => {
  const v = (s: string) => new Ident(s);

  describe('List', () => {
    it('stringifies ', () => {
      stringify([
        [new List([new Ident('a'), new Ident('b'), new Ident('c')]), 'a b c'],
        [
          new List([new Ident('a'), new Ident('b'), new Ident('c')], ','),
          'a, b, c',
        ],
        [
          new List([new Ident('a'), new Ident('b'), new Ident('c')], '/'),
          'a / b / c',
        ],
        [
          new List(
            [new Ident('a'), new Ident('b'), new Ident('c')],
            ' ',
            true,
          ),
          '[a b c]',
        ],

        [
          new List(
            [
              new List([v('a'), v('b')], ' '),
              new List([v('c'), v('d')], ' '),
              v('e'),
              v('f'),
            ],
            ',',
          ),
          'a b, c d, e, f',
        ],
        [
          new List(
            [
              new List([v('a'), v('b')], ','),
              new List([v('c'), v('d')], ','),
              v('e'),
              v('f'),
            ],
            ' ',
          ),
          '(a, b) (c, d) e f',
        ],
        [
          new List(
            [
              new List([v('a'), v('b')], ','),
              new List([v('c'), v('d')], ','),
              v('e'),
              v('f'),
            ],
            ' ',
          ),
          '(a, b) (c, d) e f',
        ],
        [
          new List(
            [new List([v('a'), v('b')], ','), new List([v('c'), v('d')], ',')],
            ',',
          ),
          '(a, b), (c, d)',
        ],
        [
          new List(
            [
              new List([v('a'), v('b')], ' ', true),
              new List([v('c'), v('d')], ' '),
            ],
            ',',
          ),
          '[a b], c d',
        ],
        [
          new List(
            [
              new List([v('a'), v('b')], '/'),
              new List([v('c'), v('d')], '/'),
              v('e'),
              v('f'),
            ],
            ' ',
          ),
          '(a / b) (c / d) e f',
        ],
      ]);
    });
  });

  describe('UnaryExpression', () => {
    it('stringifies ', () => {
      stringify([
        [new UnaryExpression('not', new Variable('a')), 'not $a'],
        [new UnaryExpression('-', new Variable('a')), '-$a'],
        [new UnaryExpression('+', new Variable('a')), '+$a'],
      ]);
    });
  });

  describe('strings', () => {
    it('stringifies ', () => {
      stringify([[new StringLiteral('hi', DOUBLE), `"hi"`]]);
      stringify([[new StringLiteral('hi', SINGLE), `'hi'`]]);
      stringify([[new StringLiteral('hi there'), `hi there`]]);
    });
  });
  describe('Calc', () => {
    it('stringifies ', () => {
      stringify([
        [
          new MathCallExpression(
            'calc',
            new BinaryExpression(
              new Numeric(1, 'em'),
              new Operator('+'),
              new Numeric(3, 'px'),
            ),
          ),
          'calc(1em + 3px)',
        ],
        [
          new MathCallExpression(
            'calc',
            new BinaryExpression(
              new BinaryExpression(
                new Numeric(1, 'em'),
                new Operator('+'),
                new Numeric(3, 'px'),
              ),
              new Operator('-'),
              new Numeric(1, 'px'),
            ),
          ),
          'calc(1em + 3px - 1px)',
        ],
        [
          new MathCallExpression(
            'calc',
            new BinaryExpression(
              new Numeric(1, 'em'),
              new Operator('-'),
              new BinaryExpression(
                new Numeric(3, 'px'),
                new Operator('+'),
                new Numeric(1, 'px'),
              ),
            ),
          ),
          'calc(1em - (3px + 1px))',
        ],
        // [calc`(1px - 1px) + (20em / 2)`, 'calc(1px - 1px + 20em / 2)'],
        // [calc`(1px - (1px + 20em)) / 2`, 'calc((1px - (1px + 20em)) / 2)'],
        // [calc`(1px - 1px) + calc(20em / 2)`, 'calc(1px - 1px + (20em / 2))'],
        // [calc`(1px - 1px) + calc(20em) / 2`, 'calc(1px - 1px + (20em) / 2)'],
      ]);
    });
  });
});
