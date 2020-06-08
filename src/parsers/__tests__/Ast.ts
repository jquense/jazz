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

    if (test.length === 2)
      expect(
        parser.parse(expected, { startRule: node.constructor.name }),
      ).toEqual(node);
  });
}

describe('AST Nodes', () => {
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
      ]);
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
      // console.log(calc`(1px - 1px) + (20em / 2)`.right);
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
          'calc((1em + 3px) - 1px)',
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
          'calc((1em + 3px) - 1px)',
        ],
        [calc`(1px - 1px) + (20em / 2)`, 'calc((1px - 1px) + (20em / 2))'],
        [calc`(1px - 1px) + calc(20em / 2)`, 'calc((1px - 1px) + (20em / 2))'],
        // [calc`(1px - 1px) + calc(20em) / 2`, 'calc(((1px - 1px) + 20em) / 2)'],
      ]);
    });
  });
});
