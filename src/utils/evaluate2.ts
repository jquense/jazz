/* eslint-disable no-nested-ternary */
/* eslint-disable no-loop-func */
import postcss, { AtRule, ChildNode, Declaration, Rule } from 'postcss';

import Parser from '../parsers';
import * as Ast from '../parsers/Ast';
import * as math from '../parsers/math';
import Scope from './Scope';
import { isVariableDeclaration } from './Variables';
import unvendor from './unvendor';

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

  constructor(private currentScope: Scope, public parser: Parser) {}

  static reduce(
    node: Reduceable,
    scope: Scope,
    parser: Parser,
  ): Resolved<Reduceable> {
    return new Reducer(scope, parser).reduce(node);
  }

  scope(fn: (scope: Scope) => void) {
    this.currentScope = this.currentScope.createChildScope();

    try {
      fn(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  reduce(node: Reduceable): Resolved<Reduceable> {
    switch (node.type) {
      case 'root':
        this.reducePostCssNodes(node);
        return node;
      case 'rule':
        this.reduceRule(node);
        break;
      case 'selector-list':
        return this.reduceSelectorList(node);

      case 'pseudo-selector': {
        this.reducePseudoSelector(node);
        break;
      }
      // deal with this one directly b/c free interpolations
      // are parsed as TypeSelectors
      case 'type-selector': {
        this.reduceChildren(node);
        const inner = node.first;

        // this isn't strictly necesary but it makes the AST a bit neater
        if (Ast.isUnquoted(inner)) {
          const { value } = inner;
          const next = new Ast.Ident(inner.value.slice(1));
          if (value.startsWith('.')) return new Ast.ClassSelector(next);
          if (value.startsWith('#')) return new Ast.IdSelector(next);
          if (value === '&') return new Ast.ParentSelector();
          if (value === '*') return new Ast.UniversalSelector();
        }
        break;
      }
      case 'decl':
        this.reduceDeclaration(node);

        break;
      case 'atrule': {
        if (node.name === 'if') this.reduceIfRule(node);
        else if (node.name === 'each') this.reduceEachRule(node);
        break;
      }
      case 'variable': {
        const variable = this.currentScope.get(node);

        if (!variable) {
          throw new Error(`Variable not defined ${node.toString()}`);
        }
        return variable.node.clone();
      }
      case 'range':
        return this.reduceRange(node);

      case 'list':
      case 'map':
      case 'declaration-value':
        this.reduceChildren(node);
        break;
      case 'interpolation':
        node = this.reduceChildren(node).first;
        // console.log('I', node.first.remove());

        break;

      case 'unary-expression':
        return this.reduceUnaryExpression(node);
      case 'binary-expression':
        return this.reduceBinaryExpression(node);

      case 'calc': {
        try {
          this.inCalc++;

          return this.reduce(this.inCalc > 1 ? node.expression : node);
        } finally {
          this.inCalc--;
        }
      }
      case 'math-function':
        this.reduceChildren(node);
        // @ts-ignore
        return math[node.name.value](node.nodes as math.Term[], !this.inCalc);
      case 'function':
        return this.reduceFunction(node);

      case 'interpolated-ident': {
        this.reduceChildren(node);

        return new Ast.Ident(node.toString());
      }
      case 'string-template': {
        this.reduceChildren(node);

        return node;
      }
      case 'numeric':
      case 'string':
      case 'color':
      case 'url':
      case 'boolean':
      case 'null':
      case 'ident':
      case 'comment':
      case 'parent-selector':
      case 'universal-selector':
        break;
      default:
        if ('nodes' in node) {
          this.reduceChildren(node);
        }
        break;
    }

    return node as any;
  }

  reduceSelectorList(node: Ast.SelectorList) {
    const parentList = this.currentScope.currentRule;
    const implicitParent = node.parent?.type !== 'pseudo-selector';

    node = this.reduceChildren(node);

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

  reduceRule(node: Rule) {
    const parsed = this.reduce(
      this.parser.selector(node.selector),
    ) as Ast.SelectorList;

    node.selector = parsed.toString();

    this.scope((scope) => {
      scope.currentRule = parsed;
      this.reducePostCssNodes(node);
    });
  }

  reduceDeclaration(node: Declaration) {
    const parsed = this.reduce(this.parser.value(node)) as any;
    // TODO: handle null
    node.value = parsed.toString();

    if (isVariableDeclaration(node.prop)) {
      const name = node.prop.slice(1);

      // console.log(parsed.body);
      this.currentScope.setVariable(name, parsed.body.clone());

      node.remove();
      return null;
    }

    const value = this.reduce(this.parser.prop(node));

    if (value.type === 'null') {
      node.remove();
      return null;
    }

    node.prop = value.toString();

    return node;
  }

  reduceRange(node: Ast.Range) {
    return this.reduceChildren(node).toList() as Resolved<Ast.List>;
  }

  reducePseudoSelector(node: Ast.PseudoSelector) {
    node = this.reduceChildren(node);

    const name = unvendor((node.name as Ast.Ident).value);

    if (
      node.params &&
      !node.selector &&
      ((node.isElement && selectorPseudoElements.includes(name)) ||
        selectorPsuedoClasses.includes(name))
    ) {
      node = node.asSelector(
        this.reduce(
          this.parser.selector(node.params!.toString() || ''),
        ) as Ast.SelectorList,
      );
    }
    return node;
  }

  reduceEachRule(node: AtRule) {
    const parsed = this.reduceChildren(this.parser.eachCondition(node));
    const first = parsed.first as Ast.ReducedExpression;

    if (first.type !== 'list' && first.type !== 'map') {
      throw node.error(`${first} is not iterable`);
    }

    const nodes = [] as ChildNode[];
    for (const item of first) {
      this.scope((scope) => {
        parsed.variables.forEach((v, i) => {
          scope.set(
            v.clone(),
            'nodes' in item
              ? item.nodes?.[i] ?? new Ast.NullLiteral()
              : i === 0
              ? item
              : (new Ast.NullLiteral() as any),
          );
        });

        const iter = node.clone({ parent: node.parent });

        nodes.push(...iter.nodes!.map((t) => this.reduce(t) as ChildNode));
      });
    }

    node.replaceWith(...nodes);
  }

  reduceIfRule(node: AtRule) {
    let current: ChildNode | undefined = node;
    let result = false;

    while (current && current.type === 'atrule') {
      const ifRule = current; // hints to TS who can't tell scope cb execute immediately
      const next = fixElseIfAtRule(current.next());

      if (!result && current.name.endsWith('if')) {
        const condition = this.reduce(
          this.parser.expression(current),
        ) as Ast.Value;

        result = Ast.isTruthy(condition);

        if (result) {
          this.scope(() => {
            this.reducePostCssNodes(ifRule);

            ifRule.replaceWith(...ifRule.nodes!);
          });
        }
      } else if (!result && current.name === 'else') {
        this.scope(() => {
          ifRule!.replaceWith(...ifRule.nodes!.map((t) => this.reduce(t)));
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

  reduceFunction(node: Ast.Function) {
    const fn = this.currentScope.get(node.name);

    // assume a css function grumble
    if (!fn) {
      return node;
    }

    return fn.fn(...this.reduceChildren(node).nodes);
  }

  reducePostCssNodes(node: postcss.Container) {
    node.each((child) => {
      this.reduce(child as any);
    });
  }

  reduceChildren<T extends Ast.Container>(node: T): T {
    const result = [] as any[];

    for (const child of node.nodes!) {
      const next = this.reduce(child as any);
      if (next) result.push(next);
    }

    node.nodes = result;
    return node;
  }

  reduceUnaryExpression(node: Ast.UnaryExpression) {
    const { inCalc } = this;
    let argument = this.reduce(node.argument) as Ast.Value;

    if (!math.isMathTerm(argument)) {
      throw new Error(`${argument} is not a number`);
    }

    if (node.operator === 'not') {
      if (inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      return new Ast.BooleanLiteral(!Ast.isFalsey(argument));
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

    return argument;
  }

  reduceBinaryExpression(node: Ast.BinaryExpression) {
    const { inCalc } = this;

    const left = this.reduce(node.left) as ResolvedValue;
    const right = this.reduce(node.right) as ResolvedValue;
    const op = node.operator.value;

    const evalError = (reason: string) => {
      const original = node.toString();
      const resolved = new Ast.BinaryExpression(
        left,
        node.operator.clone(),
        right,
      ).toString();
      return new Error(
        `Cannot evaluate ${node}${
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
