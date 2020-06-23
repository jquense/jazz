/* eslint-disable @typescript-eslint/no-use-before-define */
import postcss, { AtRule, ChildNode, Declaration, atRule } from 'postcss';

import Parser from '../parsers';
// import * as Ast from '../parsers/Ast';
import { PostcssPlugin } from '../types';
import Scope from '../utils/Scope';
// import { isVariableDeclaration } from '../utils/Variables';
import { Reducer } from '../utils/evaluate3';
// import walk from '../utils/visitor';

// const ParseCache = new WeakMap<postcss.Node, T>()

// const insertBeforeParent = (node: postcss.ChildNode) =>
//   (node.parent as postcss.Container).insertBefore(node, node.nodes);

// function fixElseIfAtRule(rule?: ChildNode) {
//   if (rule?.type !== 'atrule') return rule;
//   if (rule.name !== 'else') return rule;

//   const [ifPart, rest] = rule.params.split(/\s*if\s+/g);
//   if (!ifPart.length && rest) {
//     rule.name += ' if';
//     rule.params = rest;
//   }
//   return rule;
// }

const valueProcessingPlugin: PostcssPlugin = (css, { opts }) => {
  const { files, from } = opts;
  const file = files[from!];

  const parser = Parser.get(css);

  const rootScope = file.scope || (file.scope = new Scope());

  Reducer.reduce(css, rootScope, parser);
  // const getAtRuleBoolean = (node: AtRule, reducer: Reducer) =>
  //   Ast.isTruthy(reducer.reduce(parser.expression(node)) as Ast.Value);

  // function transformForRule(node: AtRule, reducer: Reducer, scope: Scope) {
  //   const parsed = parser.forCondition(node);
  //   const fromExpr = reducer.reduce(parsed.from) as Ast.ReducedExpression;
  //   const toExpr = reducer.reduce(parsed.to) as Ast.ReducedExpression;

  //   if (fromExpr.type !== 'numeric') {
  //     throw node.error(`${fromExpr} is not numeric`);
  //   }
  //   if (toExpr.type !== 'numeric') {
  //     throw node.error(`${toExpr} is not numeric`);
  //   }
  //   if (!Ast.Numeric.compatible(fromExpr, toExpr)) {
  //     throw node.error(
  //       `${fromExpr.unit} is not compatible with ${toExpr.unit}`,
  //     );
  //   }

  //   const end = parsed.exclusive ? toExpr.value : toExpr.value + 1;
  //   const start = fromExpr.value;

  //   const nodes = [];
  //   for (let i = start; i < end; i++) {
  //     const loopScope = new Scope().from(scope);
  //     loopScope.set(parsed.variable.clone(), new Ast.Numeric(i));

  //     const iter = node.clone({ parent: node.parent });
  //     // console.log('SCOPE', i, loopScope.get(parsed.variable));
  //     transform(node);

  //     nodes.push(...iter.nodes!);
  //   }

  //   node.parent.insertBefore(node, nodes);
  //   node.remove();
  //   return false;
  // }

  // function transformNode(node: ChildNode, scope: Scope) {
  //   const reducer = new Reducer(scope);

  //   if (node.type === 'decl') {
  //   }
  //   if (node.type === 'atrule') {
  //   }
  // }

  // function transformIfRule(node: AtRule) {
  //   let current: ChildNode | undefined = node;
  //   let result = false;

  //   while (current && current.type === 'atrule') {
  //     const next = fixElseIfAtRule(current.next());

  //     if (current.name.endsWith('if')) {
  //       result = getAtRuleBoolean(current, reducer);
  //       if (result) insertBeforeParent(current);
  //     }
  //     if (current.name === 'else') {
  //       if (!result) insertBeforeParent(current);
  //     }

  //     current.remove();
  //     current = next;
  //   }
  // }

  // function transform(node: postcss.Container, root: Scope) {
  //   let scope = root;
  //   let reducer = new Reducer(scope);

  //   walk(css, {
  //     'rule|atRule': {
  //       enter() {
  //         scope = scope.createChildScope();
  //         reducer = new Reducer(scope);
  //       },
  //       leave() {
  //         scope = scope.close()!;
  //         reducer = new Reducer(scope);
  //       },
  //     },

  //     'decl': function (node: postcss.Declaration) {
  //       let parsed;
  //       try {
  //         parsed = reducer.reduce(parser.value(node)) as Ast.Root<
  //           Ast.ReducedExpression
  //         >;
  //       } catch (err) {
  //         console.log('H', node);
  //         throw err;
  //       }
  //       // console.log('V', parsed.toString());
  //       node.value = parsed.toString();

  //       if (isVariableDeclaration(node.prop)) {
  //         const name = node.prop.slice(1);

  //         // console.log(parsed.body);
  //         scope.setVariable(name, parsed.body.clone());

  //         node.remove();
  //       } else {
  //         node.prop = reducer.reduce(parser.prop(node)).toString();
  //       }
  //     },

  //     'atRule': function (node: AtRule) {
  //       if (node.name === 'if') {
  //         transformIfRule(node);
  //       }
  //       if (node.name === 'for') {
  //         transformForRule(node, reducer, scope);
  //       }
  //     },
  //   });
  // }
};

// importsPlugin.postcssPlugin = 'modular-css-values-local';

export default valueProcessingPlugin;
