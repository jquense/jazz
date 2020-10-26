import escape from 'escape-string-regexp';
import { uniqBy } from 'lodash';
import postcss, { AtRule, ChildNode, Root } from 'postcss';

import * as Ast from './Ast';
import ModuleMembers from './ModuleMembers';
import Scope from './Scope';

import { createRootScope, isBuiltin, loadBuiltIn } from './modules';
import * as UserDefinedCallable from './UserDefinedCallable';
import Parser from './parsers';
import { IdentifierScope } from './utils/Scoping';
import { SelectorVisitor, StatementVisitor } from './visitors';
import EvaluateExpression from './Expression';
import { Value } from './Values';
import breakOnReturn from './utils/breakOnReturn';
import detach from './utils/detach';

type AnyNode = postcss.Node | Ast.Node;

const rawOrProp = (node: postcss.Node, prop: string): string => {
  // @ts-ignore
  return node.raws[prop]?.raw ?? node[prop];
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

const isFunctionRule = (n: Ast.StatementNode): n is Ast.FunctionAtRule =>
  n.type === 'atrule' && n.name === 'function';

const isMixinRule = (n: Ast.StatementNode): n is Ast.MixinAtRule =>
  n.type === 'atrule' && n.name === 'mixin';

const isIncludeRule = (n: Ast.StatementNode): n is Ast.IncludeAtRule =>
  n.type === 'atrule' && n.name === 'include';

const contentNodes = (node: ChildNode) =>
  node.type !== 'comment' || node.text.startsWith('!');

// We need a dummy value here so css-loader doesn't remove it
// need to pick something that is not likely to match a word in the css tho
export const DUMMY_LOCAL_NAME = '____a';

function getScope(initialScope?: Scope) {
  let scope = createRootScope();

  if (initialScope) {
    initialScope.parent = scope;
    scope = initialScope;
  }
  return scope;
}

export type Options = {
  filename?: string;
  initialScope?: Scope;
  parser?: Parser;
  outputIcss?: boolean;
  loadModuleMembers: (request: string) => ModuleMembers | undefined;
  identifierScope: IdentifierScope;
  namer: (selector: string) => string;
};

export default class Evaluator extends EvaluateExpression
  implements StatementVisitor<void | Value>, SelectorVisitor<Ast.Selector> {
  private toHoist = new WeakSet<AnyNode>();

  private inKeyframes = false;

  private readonly parser: Parser;

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
    super({ scope: getScope(initialScope) });

    this.namer = namer;
    this.outputIcss = outputIcss;
    this.identifierScope = identifierScope;
    this.loadModuleMembers = loadModuleMembers;
    this.parser = parser || new Parser();
  }

  visitChildNode(node: postcss.ChildNode) {
    switch (node.type) {
      case 'atrule':
        return this.visitAtRule(node);
      case 'decl':
        return this.visitDeclaration(node as Ast.Declaration);
      case 'rule':
        return this.visitRule(node as Ast.Rule);
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

  visitAtRule(node: AtRule): void | Value {
    if (this.toHoist.has(node)) {
      return undefined;
    }

    if (isUseRule(node)) return this.visitUseRule(node);

    if (isIfRule(node)) return this.visitIfRule(node);
    if (isEachRule(node)) return this.visitEachRule(node);
    if (isFunctionRule(node)) return this.visitFunctionRule(node);
    if (isMixinRule(node)) return this.visitMixinRule(node);
    if (isIncludeRule(node)) return this.visitIncludeRule(node);
    if (isComposeRule(node)) return this.visitComposeRule(node);
    if (isExportRule(node)) {
      this.exportNodes.add(node.remove());
      return undefined;
    }
    if (node.name === 'return') {
      return this.visitReturnRule(node as Ast.ReturnAtRule);
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

  visitReturnRule(node: Ast.ReturnAtRule) {
    const returnValue = node.returnValue.accept(this);
    node.remove();
    return returnValue;
  }

  visitEachRule(node: Ast.EachAtRule) {
    const { variables, expression } = node;

    const iterable = expression.accept(this).toArray();

    const nodes = [] as AnyNode[];
    const body = detach(node);
    let returnValue;
    for (const item of iterable) {
      returnValue = this.withChildScope((scope) => {
        const childItems = item.toArray();

        variables.forEach((v, idx) => {
          scope.setVariable(
            v.name,
            childItems[idx] || new Ast.NullLiteral(),
            true,
          );
        });

        const iter = body.clone();
        const result = breakOnReturn([...iter.nodes!], (n) =>
          this.visitChildNode(n),
        );

        nodes.push(...iter.nodes!);
        return result;
      });

      if (returnValue != null) break;
    }

    node.replaceWith(...nodes);
    return returnValue;
  }

  visitIfRule(node: Ast.IfAtRule) {
    let current: Ast.StatementNode | undefined = node;
    let conditionResult = false;
    let retValue: void | Value;

    while (current && current.type === 'atrule') {
      const ifRule = current; // hints to TS who can't tell scope cb executes immediately

      const next: postcss.ChildNode = ifRule.next()!;

      if (!conditionResult && isIfRule(ifRule)) {
        const condition = ifRule.test.accept(this);

        conditionResult = condition.isTruthy();

        if (conditionResult) {
          retValue = this.withChildScope(() => {
            const body = detach(ifRule);

            // clone to avoid postcss mutating the array
            const result = breakOnReturn([...body.nodes!], (n) =>
              this.visitChildNode(n),
            );

            ifRule.replaceWith(body.nodes!);
            return result;
          });
        }
      } else if (!conditionResult && ifRule.name === 'else') {
        retValue = this.withChildScope(() => {
          const body = detach(ifRule);

          // clone to avoid postcss mutating the array
          const result = breakOnReturn([...body.nodes!], (n) =>
            this.visitChildNode(n),
          );

          ifRule.replaceWith(body.nodes!);
          return result;
        });
      }

      ifRule.remove();

      // if we find another @if need to break and let the reducer run it
      if (next?.type === 'atrule' && next.name === 'if') {
        break;
      }

      current = next as Ast.StatementNode;
    }
    return retValue;
  }

  visitFunctionRule(node: Ast.FunctionAtRule) {
    const callable = UserDefinedCallable.func(
      node.clone({
        parameterList: node.parameterList,
        functionName: node.functionName,
      }),
      this.currentScope,
      this,
    );

    this.currentScope.setFunction(node.functionName.value, callable);

    node.remove();
  }

  visitMixinRule(node: Ast.MixinAtRule) {
    const callable = UserDefinedCallable.mixin(
      node.clone({
        parameterList: node.parameterList,
        mixin: node.mixin,
      }),
      this.currentScope,
      this,
    );

    this.currentScope.setMixin(node.mixin.value, callable);

    node.remove();
  }

  visitIncludeRule(node: Ast.IncludeAtRule) {
    const expressions = node.callExpressions;

    expressions.forEach(({ callee, args }) => {
      // FIXME: this scope API
      const mixin = this.currentScope.getMixin(callee);

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

      const params = this.resolveParameters(
        mixin.callable.params,
        resolvedArgs,
      );

      // second, evaluate the parameters in the mixin scope
      const body = mixin.callable(params, content);

      node.before(body);
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