/* eslint-disable no-nested-ternary */
/* eslint-disable no-loop-func */

import postcss, { AtRule, ChildNode } from 'postcss';

import Parser from '../parsers';
import * as Ast from '../parsers/Ast';
import * as math from '../parsers/math';
import Scope from './Scope';
import unvendor from './unvendor';
import Walker, {
  AnyNode,
  ParsedDeclaration,
  ParsedRule,
  Path,
} from './visitor';

type Selector =
  | Ast.SelectorList
  | Ast.CompoundSelector
  | Ast.SimpleSelector
  | Ast.PseudoSelector
  | Ast.AttributeSelector
  | Ast.ClassSelector
  | Ast.UniversalSelector
  | Ast.ParentSelector
  | Ast.ClassSelector
  | Ast.IdSelector;

type Reduceable =
  | Ast.DeclarationValue
  | Ast.Expression
  | Selector
  | postcss.Node;

type Resolved<T> = T extends Ast.Variable
  ? never
  : T extends Ast.List<infer P>
  ? Ast.List<Resolved<P>>
  : T extends Ast.DeclarationValue<infer P>
  ? Ast.DeclarationValue<Resolved<P>>
  : T;

type ResolvedValue = Resolved<Ast.Value>;

const detach = (node: postcss.Container) =>
  postcss.root({ nodes: node.clone().nodes });

const asComplexNodes = (node: Ast.ComplexSelector | Ast.CompoundSelector) =>
  node.type === 'compound-selector' ? [node] : node.nodes.slice();

function fixElseIfAtRule(rule?: ChildNode) {
  if (rule?.type !== 'atrule') return rule;
  if (rule.name !== 'else') return rule;

  const [ifPart, rest] = rule.params.split(/\s*if\s+/g);
  if (!ifPart.length && rest) {
    rule.name += ' if';
    rule.params = rest;
  }
  return rule;
}

const selectorPsuedoClasses = [
  'not',
  'matches',
  'current',
  'any',
  'has',
  'host',
  'host-context',
];

const selectorPseudoElements = ['slotted'];

export class Reducer {
  private inCalc = 0;

  private walker: Walker<this>;

  private toHoist = new WeakSet<AnyNode>();

  constructor(private currentScope: Scope, public parser: Parser) {
    this.walker = new Walker(this, parser);
  }

  static reduce(node: AnyNode, scope: Scope, parser: Parser) {
    return new Reducer(scope, parser).visit(node);
  }

  scope(fn: (scope: Scope) => void) {
    this.currentScope = this.currentScope.createChildScope();

    try {
      fn(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  private unwrapAtRule(atRule: AtRule, parent: ParsedRule) {
    const next = parent.clone({ nodes: [] });

    atRule.nodes!.forEach((c) => {
      if (c.type === 'atrule') {
        this.unwrapAtRule(c, parent);
      } else if (c.type !== 'rule') {
        next.append(c);
      }
    });

    if (next.nodes!.length) {
      atRule.prepend(next);
    }
    return atRule;
  }

  visit(root: AnyNode) {
    return this.walker.visit(root, {
      rule: this.reduceRule,
      decl: this.reduceDeclaration,
      atrule: this.reduceAtRule,

      range: this.reduceRange,
      'call-expression': this.reduceCallExpression,
      variable(path: Path<Ast.Variable>) {
        const parentType = path.parent?.type;
        if (parentType === 'decl' || parentType === 'each-condition') return;

        const variable = this.currentScope.getVariable(path.node);

        if (!variable) {
          throw new Error(`Variable not defined ${path.node}`);
        }

        path.replaceWith(variable.node.clone());
      },
      'parent-selector-reference': function $(
        path: Path<Ast.ParentSelectorReference>,
      ) {
        const parent = this.currentScope.currentRule?.selectorNodes;

        path.replaceWith(parent ? parent.toList() : new Ast.NullLiteral());
      },

      interpolation(path: Path<Ast.Interpolation>) {
        path.visitChildren();
        return path.node.first;
      },
      calc({ node, visitChildren, replaceWith }: Path<Ast.Calc>) {
        try {
          this.inCalc++;
          visitChildren();

          if (
            this.inCalc > 1 ||
            node.expression.type === 'calc' ||
            node.expression.type === 'numeric'
          ) {
            replaceWith(node.expression);
          }
        } finally {
          this.inCalc--;
        }
      },
      'math-call-expression': (path: Path<Ast.MathCallExpression>) => {
        const { node } = path;

        path.visitChildren();

        path.replaceWith(
          // @ts-ignore
          math[node.callee.value](node.args as math.Term[], !this.inCalc),
        );
      },
      'unary-expression': this.reduceUnaryExpression,
      'binary-expression': this.reduceBinaryExpression,

      'selector-list': this.reduceSelectorList,
      'pseudo-selector': this.reducePseudoSelector,

      'type-selector': (path: Path<Ast.TypeSelector>) => {
        path.visitChildren();

        const inner = path.node.name;

        // this isn't strictly necesary but it makes the AST a bit neater
        if (Ast.isUnquoted(inner)) {
          const { value } = inner;
          const next = new Ast.Ident(inner.value.slice(1));
          if (value.startsWith('.')) return new Ast.ClassSelector(next);
          if (value.startsWith('#')) return new Ast.IdSelector(next);
          if (value === '&') return new Ast.ParentSelector();
          if (value === '*') return new Ast.UniversalSelector();
        }

        return undefined;
      },
    });
  }

  reduceSelectorList(path: Path<Ast.SelectorList>) {
    const { node } = path;
    const parentList = this.currentScope.currentRule?.selectorNodes;
    const implicitParent =
      path.parent?.type !== 'pseudo-selector' && path.node !== parentList;

    path.visitChildren();

    if (!parentList) {
      if (!node.hasParentSelectors()) return node;
      throw node.error(
        'Top-level selectors may not contain a parent selector "&".',
      );
    }

    function resolveCompound(item: Ast.CompoundSelector) {
      const parentSelector = item.first as Ast.ParentSelector;

      // The compound selector is _just_ the &
      if (
        item.nodes.length === 1 &&
        !parentSelector.suffix &&
        !parentSelector.prefix
      ) {
        return parentList!.nodes;
      }

      return parentList!.nodes.map((selector) => {
        let nodes = asComplexNodes(selector.clone());

        // if (last.type !== 'compound-selector') {
        //   throw selector.error('Parent is invalid for nesting');
        // }
        // [span > f.a]
        // [s-&-b.foo]
        // [s-span > .a]
        nodes = Ast.ParentSelector.merge(item, nodes);

        return new Ast.ComplexSelector(nodes);
      });
    }

    return new Ast.SelectorList(
      node.nodes.flatMap((selector) => {
        const complex = asComplexNodes(selector);
        if (!selector.hasParentSelectors()) {
          if (!implicitParent) {
            return [selector];
          }

          return parentList.nodes.map(
            (parentSelector) =>
              new Ast.ComplexSelector([
                ...asComplexNodes(parentSelector),
                ...complex,
              ]),
          );
        }

        let nextSelectors = [[]] as Array<Ast.ComplexSelectorNode>[];

        for (const item of complex) {
          if (
            item.type === 'compound-selector' &&
            item.first.type === 'parent-selector'
          ) {
            const resolved = resolveCompound(item);
            const prev = nextSelectors;

            nextSelectors = [] as Array<Ast.ComplexSelectorNode>[];

            for (const newComplex of prev) {
              for (const resolvedItem of resolved) {
                nextSelectors.push([
                  ...newComplex,
                  ...asComplexNodes(resolvedItem),
                ]);
              }
            }
          } else {
            nextSelectors.forEach((n) => n.push(item));
          }
        }

        return nextSelectors.map((n) => new Ast.ComplexSelector(n));
      }),
    );
  }

  reduceRule({ node, ...api }: Path<ParsedRule>) {
    if (this.toHoist.has(node)) {
      api.skip();
      return;
    }

    api.visit('selectorNodes');

    this.scope((scope) => {
      scope.currentRule = node;

      api.visitChildren();

      let after: postcss.ChildNode = node;
      // path.node.visited = true;
      node.each((child) => {
        if (child.type === 'rule') {
          this.toHoist.add(child as ParsedRule);
          after.after(child);
          after = child;
        }
        if (child.type === 'atrule') {
          if (child.name !== 'keyframes') {
            child = this.unwrapAtRule(child, node).remove();
          }

          this.toHoist.add(child);

          after.after(child);
          after = child;
        }
      });

      if (after !== node && node.nodes!.length === 0) {
        api.remove();
      }
    });
  }

  reduceAtRule(path: Path<AtRule>) {
    const { node } = path;

    if (this.toHoist.has(node)) {
      return path.skip();
    }

    if (node.name === 'if') return this.reduceIfRule(path);
    if (node.name === 'each') return this.reduceEachRule(path);
    if (node.name === 'mixin') return this.reduceMixinDeclaration(path);

    return this.scope(() => path.visitChildren());
  }

  reduceDeclaration(path: Path<ParsedDeclaration>) {
    path.visitChildren();

    const value = path.node.valueNodes.body as Ast.ReducedExpression;

    if (path.node.propNodes.type === 'variable') {
      const { name } = path.node.propNodes;

      this.currentScope.setVariable(name, value.clone());

      path.remove();
      return;
    }

    if (value.type === 'null') {
      path.remove();
    }
  }

  reduceRange(path: Path<Ast.Range>) {
    path.visitChildren();

    path.replaceWith(path.node.toList() as Resolved<Ast.List>);
  }

  reducePseudoSelector(path: Path<Ast.PseudoSelector>) {
    path.visit('name');

    const { node } = path;
    const name = unvendor((node.name as Ast.Ident).value);

    if (
      node.params &&
      !node.selector &&
      ((node.isElement && selectorPseudoElements.includes(name)) ||
        selectorPsuedoClasses.includes(name))
    ) {
      node.selector = this.parser.selector(node.params!.toString() || '');
      node.params = undefined;
    }
  }

  reduceEachRule({ node, ...api }: Path<AtRule>) {
    const condition = this.parser.eachCondition(node);

    this.visit(condition);

    const expr = condition.expr as Ast.ReducedExpression;

    if (expr.type !== 'list' && expr.type !== 'map') {
      throw node.error(`${expr} is not iterable`);
    }

    const nodes = [] as AnyNode[];
    const body = postcss.root({ nodes: node.nodes });

    for (const item of expr) {
      this.scope((scope) => {
        condition.variables.forEach((v, i) => {
          scope.setVariable(
            v.name,
            'nodes' in item
              ? item.nodes?.[i] ?? new Ast.NullLiteral()
              : i === 0
              ? item
              : (new Ast.NullLiteral() as any),
          );
        });

        const iter = this.visit(body.clone()) as any;

        nodes.push(...iter.nodes);
      });
    }

    api.replaceWith(nodes);
    api.skip();
  }

  reduceIfRule({ node }: Path<AtRule>) {
    let current: ChildNode | undefined = node;
    let result = false;

    while (current && current.type === 'atrule') {
      const ifRule = current; // hints to TS who can't tell scope cb executes immediately

      const next = fixElseIfAtRule(current.next());

      if (!result && current.name.endsWith('if')) {
        const condition = this.visit(
          this.parser.expression(current),
        ) as Ast.Value;

        result = Ast.isTruthy(condition);

        if (result) {
          this.scope(() => {
            const { nodes } = this.visit(detach(ifRule)) as any;

            ifRule.replaceWith(nodes);
          });
        }
      } else if (!result && current.name === 'else') {
        this.scope(() => {
          const { nodes } = this.visit(detach(ifRule)) as any;

          ifRule!.replaceWith(nodes);
        });
      }

      ifRule.remove();

      // if we find another @if need to break and let the reducer run it
      if (next?.type === 'atrule' && next.name === 'if') {
        break;
      }

      current = next;
    }
  }

  reduceMixinDeclaration(path: Path<AtRule>) {
    const callable = this.parser.callable(path.node);

    this.currentScope.setMixin(callable.name.value, callable);

    path.remove();
  }

  reduceInclude(path: Path<AtRule>) {
    const callable = this.parser.callable(path.node);

    this.currentScope.setMixin(callable.name.value, callable);

    path.remove();
  }

  reduceCallExpression(path: Path<Ast.CallExpression>) {
    const fn = this.currentScope.getFunction(path.node.callee);

    path.visitChildren();

    // assume a css function grumble
    if (fn) {
      path.replaceWith(fn.fn(...path.node.args));
    }
  }

  reduceUnaryExpression({ node, ...api }: Path<Ast.UnaryExpression>) {
    api.visitChildren();

    const { inCalc } = this;
    let argument = node.argument as Ast.Value;

    if (!math.isMathTerm(argument)) {
      throw new Error(`${argument} is not a number`);
    }

    if (node.operator === 'not') {
      if (inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      api.replaceWith(new Ast.BooleanLiteral(!Ast.isFalsey(argument)));
      return;
    }

    if (node.operator === '-') {
      if (argument.type === 'numeric') argument.value *= -1;
      else if (this.inCalc)
        argument = new Ast.Calc(
          new Ast.BinaryExpression(
            new Ast.Numeric(-1),
            new Ast.Operator('*'),
            argument.type === 'calc' ? argument.expression : argument,
          ),
        );
    }

    api.replaceWith(argument);
  }

  reduceBinaryExpression({ node, ...api }: Path<Ast.BinaryExpression>) {
    const original = node.toString();

    api.visitChildren();

    const { inCalc } = this;

    const left = node.left as ResolvedValue;
    const right = node.right as ResolvedValue;

    const op = node.operator.value;

    const evalError = (reason: string) => {
      const resolved = node.toString();
      return new Error(
        `Cannot evaluate ${original}${
          original !== resolved ? ` (evaluated as: ${resolved})` : ''
        }. ${reason}`,
      );
    };

    if (math.isArithmeticOperator(op)) {
      if (!math.isMathTerm(left) || !math.isMathTerm(right)) {
        throw evalError('Some terms are not numerical.');
      }

      if (op === '+') return math.add(left, right, !inCalc);
      if (op === '-') return math.subtract(left, right, !inCalc);
      if (op === '*') return math.multiply(left, right, !inCalc);
      if (op === '/') return math.divide(left, right, !inCalc);
      if (op === '%') return math.mod(left, right);
      if (op === '**') return math.pow(left, right);
    } else if (inCalc) {
      throw evalError('Only arithmetic is allowed in a CSS calc() function');
    }

    // calc and math functions shouldn't be compared as nodes
    if (
      math.isResolvableToNumeric(left) ||
      math.isResolvableToNumeric(right)
    ) {
      throw evalError(
        'Math functions must be resolvable when combined outside of another math function',
      );
    }

    if (op === 'and') return Ast.isTruthy(left) ? right : left;
    if (op === 'or') return Ast.isTruthy(left) ? left : right;

    if (op === '==') return math.eq(left, right);
    if (op === '!=') return math.neq(left, right);

    if (left.type !== 'numeric' || right.type !== 'numeric') {
      throw evalError('Some terms are not numerical and cannot be compared.');
    }

    if (op === '>') return math.gt(left, right);
    if (op === '>=') return math.gte(left, right);
    if (op === '<') return math.lt(left, right);
    if (op === '<=') return math.lte(left, right);

    throw new Error(`not implemented: ${op}`);
  }
}
