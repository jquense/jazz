/* eslint-disable @typescript-eslint/no-use-before-define */
import { notDeepEqual } from 'assert';

import { ChildNode } from 'postcss';
import Operator from 'postcss-values-parser/lib/nodes/Operator';

import * as Ast from '../parsers/Ast';
import { Value } from '../types';
import Scope from './Scope';

export class Reducer {
  private inCalc = false;

  private inCalc = false;

  constructor(private scope: Scope) {}

  reduce(
    node: Ast.Expression | Ast.ExpressionTerm | Ast.Root,
  ): Ast.ReducedExpression {
    const { scope } = this;

    switch (node.type) {
      case 'variable': {
        const variable = scope.get(node);

        if (!variable) {
          throw new Error(`Variable not defined ${node.toString()}`);
        }
        const next = variable.node.clone();
        node.replaceWith(next);
        return next;
      }
      case 'numeric':
      case 'string':
      case 'color':
      case 'url':
      case 'operator':
        // return node;
        break;
      case 'block':
      case 'root':
      case 'interpolation':
        this.reduceChildren(node);

        break;
      case 'expression': {
        for (const [child, idx] of node.children()) {
          const reduced = this.reduce(child);
        }

        if (node.nodes.length === 1) {
          const first = node.nodes[0];
          node.replaceWith(first);
          return first as Ast.ReducedExpression;
        }

        break;
      }
      case 'function':
        this.reduceFunction(node);

        break;
      case 'interpolated-ident': {
        this.reduceChildren(node);

        const next = new Ast.Ident(node.toString());

        node.replaceWith(next);
        return next;
        break;
      }
      default:
      // console.log('hi', node.type);
      // return node;
      // throw new Error(`nope on  ${node.type}`);
    }

    return node as any;
  }

  reduceFunction(node: Ast.Function) {
    const fn = this.scope.get(node.name);

    // assume a css function grumble
    if (!fn) {
      node.replaceWith(new Ast.Ident(node.toString()));
      return;
    }

    const params = new Ast.Root(node.split(','));

    this.reduceChildren(params);

    node.replaceWith(fn.fn(...params.nodes));
  }

  reduceChildren(
    node: Ast.Container,
    fn?: (node: Ast.ReducedExpression) => void,
  ) {
    for (const [child] of node.children()) {
      const reduced = this.reduce(child as Ast.ExpressionTerm);
      fn?.(reduced);
    }
  }

  // reduceMath(node: Ast.MathExpressionTerm) {
  //   switch (node.type){
  //     case 'math-expression': {
  //     const right = this.reduceMath(node.right);
  //     const left = this.reduceMath(node.left);

  //     switch (node.operator.value) {
  //       case '+':
  //       case '-':
  //         this.reduceMath();
  //         break;
  //       default:
  //     }
  //   }
  //   case 'function'
  // }
}

export function evaluate(expr: Ast.Container, values: Record<string, Value>) {
  // for (const [valueNode, controller] of expr.children()) {
  //   valueNode;
  // }

  for (const [valueNode, controller] of expr.ancestors()) {
    console.log(valueNode.type);

    if (valueNode.type === 'variable')
      valueNode.replaceWith(new Ast.Ident(values[valueNode.name].value));

    if (valueNode.type === 'function') {
      controller.skip();
      evaluate(valueNode, values);
    }
  }
  return expr.toString();
}
