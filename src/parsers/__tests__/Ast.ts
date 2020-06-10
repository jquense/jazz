import Parser from '..';
import {
  BinaryExpression,
  Calc,
  Ident,
  List,
  Node,
  Numeric,
  Operator,
  UnaryExpression,
  Variable,
} from '../Ast';
import { calc } from '../helpers';

const parser = new Parser();
function stringify(cases: Array<[Node, string] | [Node, string, false]>) {
  cases.forEach((test) => {
    const [node, expected] = test;
    expect(node.toString()).toEqual(expected);

    // if (test.length === 2)
    //   expect(
    //     parser.parse(expected, { startRule: node.constructor.name }),
    //   ).toEqual(node);
  });
}

describe('AST Nodes', () => {
  const v = (s: string) => new Ident(s);

  describe('List', () => {
    it('stringifies ', () => {
      stringify([
        [
          new List([new Ident('a'), new Ident('b'), new Ident('c')]),
          'a b c',
          false,
        ],
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
      ]);
    });

    it('parses from flat stream of tokens', () => {
      expect(
        List.fromTokens(v('a'), [
          [' ', v('b')],
          [',', v('c')],
          [' ', v('d')],
          [',', v('e')],
          [',', v('f')],
        ]),
      ).toEqual(
        new List(
          [
            new List([v('a'), v('b')], ' '),
            new List([v('c'), v('d')], ' '),
            v('e'),
            v('f'),
          ],
          ',',
        ),
      );
    });

    it('parses nested from flat stream of tokens', () => {
      //  a/b c/d, e
      expect(
        List.fromTokens(v('a'), [
          ['/', v('b')],
          [' ', v('c')],
          ['/', v('d')],
          [',', v('e')],
        ]),
      ).toEqual(
        new List(
          [
            new List(
              [
                new List([v('a'), v('b')], '/'),
                new List([v('c'), v('d')], '/'),
              ],
              ' ',
            ),
            v('e'),
          ],
          ',',
        ),
      );
    });

    it('parses ', () => {
      //  a/b c/d, e
      expect(
        List.fromTokens(v('a'), [
          [',', v('b')],
          [' ', v('c')],
          [',', v('d')],
        ]),
      ).toEqual(
        new List([v('a'), new List([v('b'), v('c')], ' '), v('d')], ','),
      );
    });

    it('doesnt add to parameterized lists', () => {
      // a b, (c) d
      expect(
        List.fromTokens(new List([v('a')]), [
          [' ', v('b')],
          [',', new List([v('c')])],
          [' ', v('d')],
          [',', new List([v('e')])],
          [' ', v('f')],
        ]),
      ).toEqual(
        new List(
          [
            new List([new List([v('a')]), v('b')], ' '),
            new List([new List([v('c')]), v('d')], ' '),
            new List([new List([v('e')]), v('f')], ' '),
          ],
          ',',
        ),
      );
    });
  });

  describe('UnaryExpression', () => {
    it('stringifies ', () => {
      stringify([
        [new UnaryExpression('not', new Variable('a')), 'not $a', false],
        [new UnaryExpression('-', new Variable('a')), '-$a', false],
        [new UnaryExpression('+', new Variable('a')), '+$a', false],
      ]);
    });
  });

  describe('Calc', () => {
    it('stringifies ', () => {
      stringify([
        [
          new Calc(
            new BinaryExpression(
              new Numeric(1, 'em'),
              new Operator('+'),
              new Numeric(3, 'px'),
            ),
          ),
          'calc(1em + 3px)',
        ],
        [
          new Calc(
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
          new Calc(
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
        [calc`(1px - 1px) + (20em / 2)`, 'calc(1px - 1px + 20em / 2)'],
        [calc`(1px - (1px + 20em)) / 2`, 'calc((1px - (1px + 20em)) / 2)'],
        [calc`(1px - 1px) + calc(20em / 2)`, 'calc(1px - 1px + 20em / 2)'],
        // [calc`(1px - 1px) + calc(20em) / 2`, 'calc(((1px - 1px) + 20em) / 2)'],
      ]);
    });
  });
});
