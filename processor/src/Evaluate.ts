import escape from 'escape-string-regexp';
import { uniqBy } from 'lodash';
import postcss, { AtRule, ChildNode, Declaration, Root, Rule } from 'postcss';

import * as Ast from './Ast';
import { ResolvedArguments } from './Interop';
import ModuleMembers from './ModuleMembers';
import Scope, { MixinMember } from './Scope';
import {
  ArgumentListValue,
  BinaryMathExpression,
  BooleanValue,
  ListValue,
  MapValue,
  MathFunctionValue,
  NullValue,
  NumericValue,
  RgbValue,
  StringValue,
  Value,
  isCalcValue,
  stringifyList,
} from './Values';
import * as globals from './builtins';
import { isBuiltin, loadBuiltIn } from './modules';
import Parser from './parsers';
import * as math from './utils/Math';
import { IdentifierScope } from './utils/Scoping';
import { closest } from './utils/closest';
import interleave from './utils/interleave';
import {
  ExpressionVisitor,
  SelectorVisitor,
  StatementVisitor,
} from './visitors';

type AnyNode = postcss.Node | Ast.Node;

const rawOrProp = (node: postcss.Node, prop: string): string => {
  // @ts-ignore
  return node.raws[prop]?.raw ?? node[prop];
};

const detach = (node: postcss.Container) => {
  const { nodes } = node.clone();
  const container = postcss.root();
  container.append(...nodes!);
  return container;
};

const asComplexNodes = (node: Ast.ComplexSelector | Ast.CompoundSelector) =>
  node.type === 'compound-selector' ? [node] : node.nodes.slice();

const isIfRule = (n: Ast.StatementNode): n is Ast.IfAtRule =>
  n.type === 'atrule' && (n.name === 'if' || n.name === 'else if');

const isEachRule = (n: Ast.StatementNode): n is Ast.EachAtRule =>
  n.type === 'atrule' && n.name === 'each';

const isUseRule = (n: Ast.StatementNode): n is Ast.UseAtRule =>
  n.type === 'atrule' && n.name === 'use';

const isExportRule = (n: Ast.StatementNode): n is Ast.ExportAtRule =>
  n.type === 'atrule' && n.name === 'export';

const isComposeRule = (n: Ast.StatementNode): n is Ast.ComposeAtRule =>
  n.type === 'atrule' && n.name === 'compose';

const isMixinRule = (n: Ast.StatementNode): n is Ast.MixinAtRule =>
  n.type === 'atrule' && n.name === 'mixin';

const isIncludeRule = (n: Ast.StatementNode): n is Ast.IncludeAtRule =>
  n.type === 'atrule' && n.name === 'include';

const contentNodes = (node: ChildNode) =>
  node.type !== 'comment' || node.text.startsWith('!');

// We need a dummy value here so css-loader doesn't remove it
// need to pick something that is not likely to match a word in the css tho
export const DUMMY_LOCAL_NAME = '____a';

export type Options = {
  filename?: string;
  initialScope?: Scope;
  parser?: Parser;
  outputIcss?: boolean;
  loadModuleMembers: (request: string) => ModuleMembers | undefined;
  identifierScope: IdentifierScope;
  namer: (selector: string) => string;
};

export default class Evaluator
  implements
    StatementVisitor<void>,
    ExpressionVisitor<Value>,
    SelectorVisitor<Ast.Selector> {
  private inCalc = 0;

  private toHoist = new WeakSet<AnyNode>();

  private inKeyframes = false;

  private readonly parser: Parser;

  private currentScope: Scope;

  // keyed by the class identifier, no %
  private classes = new Map<string, Ast.ClassSelector[]>();

  private keyframes = new Map<string, string>();

  private importUrls = new Set<string>();

  private exportNodes = new Set<Ast.ExportAtRule>();

  private namer: (selector: string) => string;

  private identifierScope: IdentifierScope;

  private keyframesRegex?: RegExp;

  private loadModuleMembers: (request: string) => ModuleMembers | undefined;

  private outputIcss: boolean | undefined;

  static evaluate(node: Root, options: Options) {
    return new Evaluator(options).visitStyleSheet(node);
  }

  constructor({
    initialScope,
    parser,
    identifierScope,
    namer,
    outputIcss,
    loadModuleMembers,
  }: Options) {
    this.namer = namer;
    this.outputIcss = outputIcss;
    this.identifierScope = identifierScope;
    this.loadModuleMembers = loadModuleMembers;
    this.parser = parser || new Parser();
    const scope = new Scope({ closure: true });

    if (initialScope) {
      this.currentScope = initialScope;
      this.currentScope.parent = scope;
    } else {
      this.currentScope = scope;
    }

    scope.setFunction('min', globals.min);
    scope.setFunction('max', globals.max);
    scope.setFunction('clamp', globals.clamp);

    scope.setFunction('rgb', globals.rgb);
    scope.setFunction('rgba', globals.rgba);

    scope.setFunction('hsl', globals.hsl);
    scope.setFunction('hsla', globals.hsla);
  }

  private withClosure(fn: (scope: Scope) => void): void;

  private withClosure(parentScope: Scope, fn: (scope: Scope) => void): void;

  private withClosure(
    parentOrfn: Scope | ((scope: Scope) => void),
    fn?: (scope: Scope) => void,
  ) {
    let scope = parentOrfn as Scope;

    if (typeof parentOrfn === 'function' && !fn) {
      scope = this.currentScope;
      fn = parentOrfn;
    }

    this.currentScope = scope.createChildScope(true);

    try {
      fn!(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  private withScope(fn: (scope: Scope) => void) {
    this.currentScope = this.currentScope.createChildScope(false);

    try {
      fn!(this.currentScope);
    } finally {
      this.currentScope = this.currentScope.close()!;
    }
  }

  visitChildNode(node: postcss.ChildNode) {
    switch (node.type) {
      case 'atrule':
        this.visitAtRule(node);
        break;
      case 'decl':
        this.visitDeclaration(node as Ast.Declaration);
        break;
      case 'rule':
        this.visitRule(node as Ast.Rule);
        break;
      case 'comment':
        // @ts-expect-error
        if (node.raws.inline) node.remove();
        break;
      default:
    }
  }

  visitStyleSheet(node: Root): ModuleMembers {
    this.visitRoot(node);

    const exports = new ModuleMembers();
    this.exportNodes.forEach((n) => {
      this.visitExportRule(n, exports);
    });

    this.classes.forEach((clses, key) => {
      const [primary, ...composes] = uniqBy(clses, (c) => c.toString());
      exports.set(`%${key}`, {
        type: 'class',
        identifier: key,
        selector: primary,
        composes: uniqBy(composes, (c) => `${c}`),
      });
    });

    if (this.outputIcss) {
      node.append(
        postcss.rule({
          selector: ':export',
          nodes: Object.entries(exports.toJSON()).map(([prop, value]) =>
            postcss.decl({ prop, value }),
          ),
        }),
      );
    }

    return exports;
  }

  visitRoot(node: Root): void {
    node.each((c) => {
      this.visitChildNode(c);
    });
  }

  visitAtRule(node: AtRule): void {
    if (this.toHoist.has(node)) {
      return undefined;
    }

    if (isUseRule(node)) return this.visitUseRule(node);

    if (isIfRule(node)) return this.visitIfRule(node);
    if (isEachRule(node)) return this.visitEachRule(node);
    if (isMixinRule(node)) return this.visitMixinRule(node);
    if (isIncludeRule(node)) return this.visitIncludeRule(node);
    if (isComposeRule(node)) return this.visitComposeRule(node);
    if (isExportRule(node)) {
      this.exportNodes.add(node.remove());
      return undefined;
    }
    if (node.name === 'content') {
      return this.visitContentRule(node);
    }

    const isKeyFrames = node.name === 'keyframes';
    const paramValue = (node as Ast.CssAtRule).paramValue.accept(this);

    node.params = paramValue.toString();

    if (isKeyFrames) {
      this.parseKeyframesParams(node as Ast.CssAtRule);
    }

    return this.withClosure(() => {
      if (isKeyFrames) this.inKeyframes = true;

      node.each((n) => this.visitChildNode(n));

      if (isKeyFrames) this.inKeyframes = false;
    });
  }

  visitUseRule(node: Ast.UseAtRule) {
    if (node.parent?.type !== 'root') {
      node.error('@use rules must be in the root scope of the stylesheet');
    }
    const prev = node.prev();
    if (
      prev?.type === 'rule' ||
      (prev?.type === 'atrule' && prev.name !== 'use')
    ) {
      node.error('@use rules must come before any other rules');
    }

    const { request, specifiers } = node;

    let exports: ModuleMembers;
    const isBuiltinModule = isBuiltin(request);

    if (isBuiltinModule) {
      exports = loadBuiltIn(request);
    } else {
      exports = this.loadModuleMembers(request);
      if (!exports) {
        throw node.error(`Could not resolve module ${node.request}`, {
          word: node.request,
        });
      }
    }

    for (const specifier of specifiers) {
      if (specifier.type === 'namespace') {
        this.currentScope.addAll(exports, specifier.local.value);
      }
      if (specifier.type === 'named') {
        const other = exports.get(specifier.imported);

        if (!other) {
          throw node.error(
            `"${request}" does not export ${specifier.imported}`,
            {
              word: `${specifier.imported}`,
            },
          );
        }

        this.importUrls.add(request);
        this.currentScope.set(specifier.local, { ...other });
      }
    }

    if (this.outputIcss && !isBuiltinModule) {
      node.before(
        postcss.rule({
          selector: `:import("${request}")`,
          nodes: [postcss.decl({ prop: DUMMY_LOCAL_NAME, value: 'a' })],
        }),
      );
    }

    node.remove();
  }

  visitContentRule(node: AtRule) {
    const content = this.currentScope.contentBlock;

    if (content) node.replaceWith(content.clone());
    else node.remove();
  }

  visitEachRule(node: Ast.EachAtRule) {
    const { variables, expression } = node;

    const iterable = expression.accept(this).toArray();

    const nodes = [] as AnyNode[];
    const body = postcss.root({ nodes: node.nodes });

    for (const item of iterable) {
      this.withScope((scope) => {
        const childItems = item.toArray();

        variables.forEach((v, idx) => {
          scope.setVariable(
            v.name,
            childItems[idx] || new Ast.NullLiteral(),
            true,
          );
        });

        const iter = body.clone();
        this.visitRoot(iter);

        nodes.push(...iter.nodes!);
      });
    }

    node.replaceWith(...nodes);
  }

  visitIfRule(node: Ast.IfAtRule) {
    let current: Ast.StatementNode | undefined = node;
    let result = false;

    while (current && current.type === 'atrule') {
      const ifRule = current; // hints to TS who can't tell scope cb executes immediately

      const next: postcss.ChildNode = current.next()!;

      if (!result && isIfRule(current)) {
        const condition = current.test.accept(this);

        result = condition.isTruthy();

        if (result) {
          this.withScope(() => {
            const body = detach(ifRule);

            this.visitRoot(body);

            ifRule.replaceWith(body.nodes!);
          });
        }
      } else if (!result && current.name === 'else') {
        this.withScope(() => {
          const body = detach(ifRule);

          this.visitRoot(body);

          ifRule.replaceWith(body.nodes!);
        });
      }

      ifRule.remove();

      // if we find another @if need to break and let the reducer run it
      if (next?.type === 'atrule' && next.name === 'if') {
        break;
      }

      current = next as Ast.StatementNode;
    }
  }

  visitMixinRule(node: Ast.MixinAtRule) {
    const callable = node.clone({
      parameterList: node.parameterList,
      mixin: node.mixin,
    });

    this.currentScope.setMixin(callable.mixin.value, callable);

    node.remove();
  }

  visitIncludeRule(node: Ast.IncludeAtRule) {
    const expressions = node.callExpressions;

    expressions.forEach(({ callee, args }) => {
      // FIXME: this scope API
      const [mixin, mixinScope] = this.currentScope.getWithScope(callee) as [
        MixinMember,
        Scope,
      ];

      if (!mixin) {
        throw node.error(`Undefined mixin: "${callee}"`, {
          word: String(callee),
        });
      }

      const resolvedArgs = this.evaluateArguments(args);

      let content: postcss.Root | null = null;
      // first, evaluate the content of this includes
      this.withClosure(() => {
        node.each((n) => this.visitChildNode(n));

        if (node.nodes?.length) {
          content = detach(node);
        }
      });

      // second, evaluate the parameters in the mixin scope
      this.withClosure(mixinScope!, (scope) => {
        const callable = mixin.node;

        if (content) {
          scope.contentBlock = content;
        }

        const params = this.resolveParameters(
          callable.parameterList,
          resolvedArgs,
        );

        for (const [variable, value] of params)
          scope.setVariable(variable, value!);

        const body = postcss.root({
          nodes: callable.nodes!.map((n) => n.clone()),
        });

        this.visitRoot(body);

        node.before(body);
      });
    });
    node.remove();
  }

  visitComposeRule(node: Ast.ComposeAtRule) {
    const selectors = this.currentScope.currentRule?.selectorList;
    if (!selectors) {
      throw node.error(`@compose can only be used in class rules`);
    }
    const parents = selectors.nodes.map((selector) => {
      let item = selector.first;
      if (item.type === 'compound-selector') item = item.first;
      if (selector.nodes.length !== 1 || item.type !== 'class-selector') {
        throw node.error(
          `@compose can only be with simple selectors not: ${selector}`,
        );
      }

      return `${
        this.identifierScope === 'local' ? item.original!.name : item.name
      }`;
    });

    const other = node.request ? this.loadModuleMembers(node.request) : null;
    if (node.request && !other) {
      throw node.error(`Could not resolve "${node.request}"`);
    }

    for (const className of node.classList) {
      if (node.request) {
        const cls = other!.get(className) || other!.get(`%${className}`);

        if (!cls || cls.type !== 'class')
          throw node.error(
            `"${node.request}" has no exported class "${className}"`,
            { word: String(className) },
          );
        parents.forEach((parent) => {
          this.classes.get(parent)!.push(cls.selector, ...cls.composes);
        });
      } else if (node.isGlobal) {
        parents.forEach((parent) => {
          this.classes.get(parent)!.push(new Ast.ClassSelector(className));
        });
      } else {
        const clses = this.classes.get(`${className}`);

        if (!clses)
          throw node.error(`CSS class "${className}" is not declared`);

        parents.forEach((parent) => {
          this.classes.get(parent)!.push(...clses);
        });
      }
    }

    node.remove();
  }

  visitExportRule(node: Ast.ExportAtRule, exports: ModuleMembers) {
    if (!node.request) {
      for (const {
        exported,
        local,
      } of node.specifiers as Ast.ExportSpecifier[]) {
        const value = this.currentScope.get(local);

        if (!value) {
          throw node.error(`There is no local ${local.toString()} declared.`);
        }

        exports.set(exported, { ...value });
      }
      node.remove();
      return;
    }

    const otherExports = this.loadModuleMembers(node.request);
    if (!otherExports) {
      throw node.error(`Could not resolve module ${node.request}`, {
        word: node.request,
      });
    }

    for (const specifier of node.specifiers) {
      // if (!otherExports || !Object.keys(otherExports).length) {
      //   throw node.error(`"${node.request}" does not export anything`);
      // }

      if (specifier.type === 'all') {
        exports.addAll(otherExports);
      }

      if (specifier.type === 'named') {
        const other = otherExports.get(`${specifier.local}`);

        if (!other) {
          throw node.error(
            `"${node.request}" does not export ${specifier.local}`,
          );
        }

        exports.set(specifier.exported, {
          ...other,
          source: node.request,
        });
      }
    }
  }

  visitRule(node: Ast.Rule): void {
    if (this.toHoist.has(node)) {
      return;
    }

    node.selector = node.selectorAst.accept(this).toString();

    if (this.inKeyframes) {
      this.withClosure(() => {
        node.each((n) => this.visitChildNode(n));
      });
      return;
    }

    node.selectorList = this.parser
      .selector(rawOrProp(node, 'selector'), { offset: node.source?.start })
      .accept(this) as Ast.SelectorList;

    node.selector = node.selectorList.toString();

    this.withClosure((scope) => {
      scope.currentRule = node;

      let after: postcss.ChildNode = node;

      node.each((child) => {
        this.visitChildNode(child);

        // if this child was removed while visiting return
        if (!child.parent) return;

        if (child.type === 'rule') {
          this.toHoist.add(child);
          after.after(child);
          after = child;
        }
        if (child.type === 'atrule' && child.nodes) {
          if (child.name !== 'keyframes') {
            child = this.unwrapAtRule(child, node).remove();
          }
          this.toHoist.add(child);

          after.after(child);
          after = child;
        }
      });

      // remove empty ndoes
      if (node.nodes?.filter(contentNodes).length === 0) {
        node.remove();
      }
    });
  }

  visitDeclaration(node: Ast.Declaration): void {
    const value = node.valueAst.accept(this);

    if (node.ident.type === 'variable') {
      const { name } = node.ident;

      this.currentScope.setVariable(name, value);

      node.remove();
      return;
    }

    if (value.type === 'null') {
      node.remove();
      return;
    }

    node.prop = node.ident.accept(this).toString();
    node.value = value.toString();

    if (
      this.keyframesRegex &&
      this.identifierScope === 'local' &&
      node.prop.match(/animation$|animation-name$/g)
    ) {
      node.value = node.value.replace(
        this.keyframesRegex,
        (match: string) => this.keyframes.get(match)!,
      );
    }
  }

  visitClassSelector(node: Ast.ClassSelector): Ast.Selector {
    if (this.identifierScope === 'global') {
      return node;
    }
    const ident = node.name.toString();

    const hashed = this.classes.get(ident) || [node.rename(this.namer)];
    this.classes.set(`${ident}`, hashed);
    return hashed[0];
  }

  visitPseudoSelector(
    node: Ast.PseudoSelector,
  ): Ast.PseudoSelector | Ast.ClassSelector {
    if (node.isScope) {
      if (node.selector?.nodes.length !== 1) {
        throw node.error(`Scope psuedo selectors must contain one selector`);
      }
      const compound = node.selector.first;

      if (
        compound.type !== 'compound-selector' ||
        compound.first.type !== 'class-selector'
      ) {
        throw node.error(
          `Scope psuedo selectors must contain a single class selector`,
        );
      }
      const cls = compound.first;

      return node.name.toString() === 'global'
        ? cls
        : (cls.accept(this) as Ast.ClassSelector);
    }

    if (node.selector) {
      return node.asSelector(this.visitSelectorList(node.selector!, false));
    }

    return node;
  }

  visitPlaceholderSelector(node: Ast.PlaceholderSelector): Ast.ClassSelector {
    const member = this.currentScope.getClassReference(node.toString());

    if (!member) {
      throw new Error(`Referenced external class is not defined ${node}`);
    }

    return member.selector;
  }

  visitSelectorList(
    node: Ast.SelectorList,
    implicit = true,
  ): Ast.SelectorList {
    const parentList = this.currentScope.currentRule?.selectorList;
    const implicitParent = implicit ?? node !== parentList;

    const resolveSimple = (item: Ast.CompoundSelector) => {
      item.nodes = item.nodes.map((simple) => {
        if (simple.type === 'pseudo-selector') {
          return this.visitPseudoSelector(simple);
        }
        if (
          simple.type === 'class-selector' ||
          simple.type === 'placeholder-selector'
        ) {
          return simple.accept(this) as Ast.SimpleSelector;
        }

        return simple;
      });
    };

    const resolveCompound = (item: Ast.CompoundSelector) => {
      // resolveSimple(item);

      const parentSelector = item.first;

      if (parentSelector.type !== 'parent-selector') {
        return [item];
      }
      if (!parentList) {
        throw node.error(
          'Top-level selectors may not contain a parent selector "&".',
        );
      }

      // The compound selector is _just_ the '&'
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
    };

    return new Ast.SelectorList(
      node.nodes.flatMap((selector) => {
        // check here since we traverse and process simple selectors below
        const hasParent = selector.hasParentSelectors();

        const complex = asComplexNodes(selector).map((n) => {
          if (n.type === 'compound-selector') {
            resolveSimple(n);
          }
          return n;
        });

        if (!hasParent) {
          // in a psuedo or a root selector
          if (!implicitParent || !parentList) {
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
          if (item.type === 'compound-selector' && item.hasParentSelectors()) {
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

  visitVariable(node: Ast.Variable): Value {
    const variable = this.currentScope.getVariable(node);

    if (!variable) {
      throw new Error(`Variable not defined ${node}`);
    }

    return variable.node;
  }

  visitParentSelectorReference(
    _: Ast.ParentSelectorReference,
  ): ListValue | NullValue {
    const parent = this.currentScope.currentRule?.selectorList;

    if (!parent) {
      return new NullValue();
    }

    return new ListValue(
      parent.nodes.map(
        (n) =>
          new ListValue(
            n.type === 'compound-selector'
              ? [new StringValue(String(n))]
              : n.nodes.map((nn) => new StringValue(String(nn))),
            ' ',
          ),
      ),
      ',',
    );
  }

  visitBooleanLiteral(node: Ast.BooleanLiteral): Value {
    return new BooleanValue(node.value);
  }

  visitStringLiteral(node: Ast.StringLiteral): Value {
    return new StringValue(node.value, node.quote);
  }

  visitNullLiteral(_: Ast.NullLiteral): NullValue {
    return new NullValue();
  }

  visitNumeric(node: Ast.Numeric): NumericValue {
    return new NumericValue(node.value, node.unit);
  }

  visitUrl(node: Ast.Url): StringValue {
    throw new Error('nope');
    return new StringValue(`url(${node.value})`);
  }

  visitList(node: Ast.List<Ast.Expression>): ListValue {
    return new ListValue(
      node.nodes.map((n) => n.accept(this)),
      node.separator,
      node.brackets,
    );
  }

  visitMap(node: Ast.Map<Ast.Expression, Ast.Expression>): Value {
    return new MapValue(
      node
        .entries()
        .map(([key, value]) => [key.accept(this), value.accept(this)]),
    );
  }

  visitColor(node: Ast.Color): RgbValue {
    return new RgbValue(node.value)!;
  }

  visitStringTemplate(node: Ast.StringTemplate): StringValue {
    const hasQuote = node.quote;

    return new StringValue(
      interleave(
        node.quasis,
        node.expressions.map((e) => {
          const value = e.accept(this);
          // inner strings need their quotes dropped
          return hasQuote && value.type === 'string' ? value.value : value;
        }),
      ).join(''),
      node.quote,
    );
  }

  visitIdent(node: Ast.Ident): StringValue {
    return new StringValue(node.value);
  }

  visitInterpolatedIdent(node: Ast.InterpolatedIdent): StringValue {
    return new StringValue(
      interleave(
        node.quasis,
        node.expressions.map((e) => e.accept(this)),
      ).join(''),
    );
  }

  visitInterpolation(node: Ast.Interpolation): Value {
    return node.first.accept(this);
  }

  visitBinaryExpression(node: Ast.BinaryExpression): Value {
    const original = node.toString();

    const { inCalc } = this;

    const left = node.left.accept(this);

    const op = node.operator.value;

    const toString = () =>
      new BinaryMathExpression(
        left as any,
        op,
        node.right.accept(this) as any,
      ).toString();

    const evalError = (reason: string) => {
      const resolved = toString();

      return node.error(
        `Cannot evaluate ${original}${
          original !== resolved ? ` (resolved to: ${resolved})` : ''
        }. ${reason}`,
      );
    };

    if (math.isArithmeticOperator(op)) {
      const right = node.right.accept(this);

      // console.log(left, right);
      if (!math.isMathValue(left) || !math.isMathValue(right)) {
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

    if (op === 'and') return left.isTruthy() ? node.right.accept(this) : left;
    if (op === 'or') return left.isTruthy() ? left : node.right.accept(this);

    const right = node.right.accept(this);

    // calc and math functions shouldn't be compared as nodes
    if (
      math.isResolvableToNumeric(left) ||
      math.isResolvableToNumeric(right)
    ) {
      throw node.error(
        `The expression ${toString()} contains unresolvable math expressions making numeric comparison impossible.`,
      );
    }

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

  visitUnaryExpression(node: Ast.UnaryExpression): Value {
    let argument = node.argument.accept(this);

    if (node.operator === 'not') {
      if (this.inCalc)
        throw new Error(
          `Only arithmetic is allowed in a CSS calc() function not \`${node}\` which would produce a Boolean, not a number`,
        );

      return new BooleanValue(!argument.isTruthy());
    }

    if (!math.isMathValue(argument)) {
      throw new Error(
        `"${node.operator}" only operates on numbers and ${argument} is not a number`,
      );
    }

    if (node.operator === '-') {
      if (argument.type === 'numeric') argument.value *= -1;
      else if (this.inCalc) {
        argument = new MathFunctionValue(
          'calc',
          new BinaryMathExpression(
            new NumericValue(-1),
            '*',
            isCalcValue(argument) ? argument.args[0] : argument,
          ),
        );
      }
    }

    return argument;
  }

  visitRange(node: Ast.Range): ListValue {
    const from = node.from.accept(this);
    const to = node.to.accept(this);

    if (from.type !== 'numeric') throw new Error(`${from} is not numeric`);
    if (to.type !== 'numeric') throw new Error(`${to} is not numeric`);

    if (!NumericValue.compatible(from, to)) {
      throw new Error(`${from.unit} is not compatible with ${to.unit}`);
    }

    const end = node.exclusive ? to.value : to.value + 1;
    const start = from.value;
    const mult = end < start ? -1 : 1;

    const list = new ListValue(
      Array.from(
        { length: Math.abs(end - start) },
        (_, i) => new NumericValue(start + i * mult),
      ),
      ',',
    );

    return list;
  }

  visitCallExpression(node: Ast.CallExpression): Value {
    // if this is a plain function call then evaluate it in place
    // otherwise let the parent rule handle the mixin
    const args = this.evaluateArguments(node.args);
    const member = this.currentScope.getFunction(node.callee);

    const suggestFunction = () => {
      const fns = this.currentScope
        .getAll('function')
        .map((f) => f.identifier);

      return closest(`${node.callee}`, fns, 1);
    };
    // assume a css function grumble
    if (member) {
      if (member.callable) {
        const params: Record<string, Value | undefined> = {};
        for (const [key, value] of this.resolveParameters(
          member.callable.params,
          args,
        )) {
          params[key.name] = value;
        }

        // console.log(member.callable);
        const result = member.callable.call(params);

        return result;
      }
    } else if (node.callee.namespace) {
      const bestGuess = suggestFunction();
      throw node.error(
        `Undefined function ${node.callee}.${
          bestGuess ? ` Did you mean to call ${bestGuess} instead` : ''
        }`,
      );
    }

    if (Object.keys(args.keywords).length) {
      const bestGuess = suggestFunction();

      throw node.error(
        bestGuess
          ? `Unexpected keyword argument, did you mean to call ${bestGuess} instead?`
          : `Plain CSS functions specify arguments by keyword`,
      );
    }

    return new StringValue(
      `${node.callee}(${stringifyList(args.positionals, ',')})`,
    );
  }

  visitMathCallExpression(node: Ast.MathCallExpression): Value {
    try {
      this.inCalc++;

      const name = node.callee.accept(this) as StringValue;
      const args = this.evaluateArguments(node.args);

      // We don't call calc functions since they function only as
      // syntatic fences for allowing math expressions, which are evaluated above.
      //
      // The first argument will always evaluate to a resolved expression or
      // another calc call if it cannot be resolved
      if (name.value === 'calc') {
        return args.positionals[0];
      }

      const member = this.currentScope.getFunction(name.value)!;

      const params: Record<string, Value | undefined> = {};
      for (const [key, value] of this.resolveParameters(
        member.callable.params,
        args,
      )) {
        params[key.name] = value;
      }

      return member.callable.call(params);
    } finally {
      this.inCalc--;
    }
  }

  private *resolveParameters(
    paramList: Ast.ParameterList,
    args: ResolvedArguments,
  ): Generator<[Ast.Variable, Value | undefined]> {
    const { positionals, keywords } = args!;

    const kwargs = new Set(Object.keys(keywords));
    const params = paramList.parameters;
    const numPositionals = positionals.length;

    for (const [idx, param] of params.entries()) {
      // name without $
      const paramName = param.name.name;

      // let expr;
      if (idx < numPositionals) {
        if (kwargs.has(paramName)) {
          throw new SyntaxError(
            `Argument ${param.name} was passed both by position and by name.`,
          );
        }

        yield [param.name, positionals[idx]];
      } else if (kwargs.has(paramName)) {
        kwargs.delete(paramName);
        yield [param.name, keywords[paramName]!];
      } else if (param.defaultValue) {
        if (param.defaultValue.type === 'unknown-default-value') {
          yield [param.name, undefined];
        } else {
          yield [param.name, param.defaultValue.accept(this)];
        }
      } else {
        throw SyntaxError(`Missing argument ${paramName}.`);
      }
    }

    if (paramList.rest) {
      yield [
        paramList.rest.name,
        new ArgumentListValue(positionals.slice(params.length), keywords),
      ];
    } else if (kwargs.size) {
      throw new SyntaxError(
        `No argument(s) named ${Array.from(kwargs).join(', ')}`,
      );
    }
  }

  private evaluateArguments(node: Ast.ArgumentList): ResolvedArguments {
    const spreads = [] as Value[];
    const positionals = [] as Value[];
    const keywords = Object.create(null) as Record<string, Value>;

    node.nodes.forEach((arg) => {
      if (arg.type === 'keyword-argument') {
        keywords[arg.name.name] = arg.value.accept(this);
      } else if (arg.type === 'spread') {
        spreads.push(arg.value.accept(this));
      } else {
        positionals.push(arg.accept(this));
      }
    });

    function addKeywords(spread: MapValue) {
      for (const [key, value] of spread) {
        if (key.type !== 'string')
          throw node.error(
            'Variable keyword argument map must have string keys',
          );
        keywords[key.value] = value;
      }
    }

    if (spreads.length) {
      const [spreadA, spreadB] = spreads;

      if (spreadB) {
        if (spreadB.type !== 'map') {
          throw node.error('Variable keyword arguments must be a map');
        }
        addKeywords(spreadB);
      }

      if (spreadA.type === 'map') {
        addKeywords(spreadA);
      } else {
        positionals.push(...spreadA.toArray());
      }
    }

    return { positionals, keywords };
  }

  private unwrapAtRule(atRule: AtRule, parent: Ast.Rule) {
    const next = parent.clone({ nodes: [] });

    atRule.nodes?.forEach((c) => {
      if (c.type === 'atrule' && c.nodes?.length) {
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

  private parseKeyframesParams(node: Ast.CssAtRule): void {
    if (this.identifierScope === 'global') {
      return;
    }

    const selector = this.parser.selector(rawOrProp(node, 'params'), {
      offset: node.source?.start,
    });

    let name = selector.first.first;
    let isGlobal = false;

    if (name.type === 'pseudo-selector' && name.isScope) {
      isGlobal = name.name.toString() === 'global';

      name = name.selector!.first.first;
    }

    if (name.type === 'type-selector') {
      const original = name.name.toString();

      node.params = isGlobal ? original : this.namer(original);
      if (!isGlobal) {
        this.keyframes.set(original, node.params);
        this.keyframesRegex = new RegExp(
          Array.from(
            this.keyframes.keys(),
            (ref) => `(\\b${escape(ref)}\\b)`,
          ).join('|'),
          'g',
        );
      }
    } else {
      throw node.error('Invalid @keyframes name');
    }
  }
}

export type Param = { name: string | null; defaulted: boolean };

export type ParamsList = [Param[], string | null];
