/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable max-classes-per-file */

import { isValid } from 'khroma';
import type { Result, SourceMapOptions } from 'postcss';
import CssSyntaxError from 'postcss/lib/css-syntax-error';
import Input from 'postcss/lib/input';

import { Location } from './parsers/location';
import { ContainerBase, NodeBase } from './postcss-types';
import interleave from './utils/interleave';
import unvendor from './utils/unvendor';
import type { ExpressionVisitor, SelectorVisitor } from './visitors';

const tag = `@@typeof/Node`;

const selectorPsuedoClasses = [
  'not',
  'matches',
  'current',
  'any',
  'has',
  'host',
  'host-context',
  // not CSS
  'local',
  'global',
];

const selectorPseudoElements = ['slotted'];

export type MaybeArray<T> = T | T[];

export const toArray = <T>(n?: MaybeArray<T>): T[] =>
  n == null ? [] : ([] as T[]).concat(n);

function cloneNode(obj: Node, parent?: Node) {
  // if (typeof obj.clone === 'function') return obj.clone();
  // @ts-ignore
  const cloned = obj.constructor ? new obj.constructor() : Object.create(null);

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    let value = (obj as any)[key];

    const type = typeof value;

    if (key === 'parent' && type === 'object') {
      if (parent) cloned[key] = parent;
    } else if (key === 'source') {
      cloned[key] = value;
    } else if (Array.isArray(value)) {
      cloned[key] = value.map((j) => cloneNode(j, cloned));
    } else {
      if (type === 'object' && value !== null) {
        value = cloneNode(value);
      }
      cloned[key] = value;
    }
  }
  return cloned;
}

let MATH_FUNCTION_CONTEXT = false;

export abstract class Node<T extends string = any> {
  abstract type: T;

  [Symbol.hasInstance](inst: any) {
    return inst && inst[Symbol.for(tag)] === true;
  }

  source?: {
    input: Input;
    start: Location;
    end: Location;
    // {
    //   offset: number;
    //   line: number;
    //   column: number;
    // };
    // end: {
    //   offset: number;
    //   line: number;
    //   column: number;
    // };
  };

  // toList<T extends Expression = Expression>(sep?: Separator) {
  //   return new List([(this as any) as T], sep);
  // }

  clone(): this {
    const cloned = cloneNode(this);

    return cloned;
  }

  equalTo(node: Node): boolean {
    return this === node;
  }

  error(msg: string) {
    if (this.source) {
      return this.source!.input.error(
        msg,
        this.source.start.line,
        this.source.start.column,
      );
    }

    return new CssSyntaxError(msg);
  }
}

export type Comma = ',';
export type Space = ' ';
export type Slash = '/';

export type Separator = Comma | Space | Slash;

export type Combinators = '>' | '+' | ' ';

export const OPERATOR_PRECEDENCE: Record<Operators, number> = {
  or: 0,
  and: 1,
  not: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};

export const SEPARATOR_PRECEDENCE: Record<Separator, number> = {
  ' ': 0,
  '/': 10,
  ',': 20,
};

// @ts-ignore
Node.prototype[Symbol.for(tag)] = true;

export const isNode = (node: any): node is Node => node instanceof Node;

export const isCalc = (term: Expression): term is MathCallExpression =>
  term.type === 'math-call-expression' && term.callee.value === 'calc';

export const isFalsey = (node: Value): node is BooleanLiteral | NullLiteral =>
  node.type === 'null' || (node.type === 'boolean' && node.value === false);

export const isTruthy = (node: Value): node is Exclude<Value, NullLiteral> =>
  !isFalsey(node);

export const isStringish = (a: Expression): a is StringLiteral | Ident =>
  a.type === 'string' || a.type === 'ident';

export const isUnquoted = (a: Expression): a is StringLiteral | Ident =>
  (a.type === 'string' && !a.quote) || a.type === 'ident';

export const areEquatable = (a: Expression, b: Expression) => {
  if (a.type !== b.type) return isStringish(a) && isStringish(b);
  return 'equalTo' in a;
};

export type Value =
  | Color
  | Numeric
  | NullLiteral
  | BooleanLiteral
  | StringLiteral
  | StringTemplate
  | ParentSelectorReference
  | Url
  | MathCallExpression
  | CallExpression
  | Variable
  // | ClassReference
  | InterpolatedIdent
  | Ident
  | Map
  | List;

export type Expression =
  | Value
  | Interpolation
  | BinaryExpression
  | UnaryExpression
  | Range;

export type Block = EachCondition;

export type Argument = Expression | KeywordArgument | SpreadArgument;

export type Nodes =
  | Expression
  | Block
  | Selector
  | CallableDeclaration
  | Parameter
  | RestParameter
  | ParameterList
  | Argument
  | ArgumentList;

export type ReducedExpression =
  | Exclude<Expression, Range | Variable | StringTemplate | List>
  | List<ReducedExpression>;

function stringifyContainer(container: Container, sep: string): string {
  let result = '';
  for (const [idx, node] of container.nodes.entries()) {
    result += idx === 0 ? node.toString() : `${sep}${node.toString()}`;
  }
  return result;
}

export abstract class Container<T extends Node = Node> extends Node {
  nodes: T[] = [];

  get first() {
    return this.nodes[0];
  }

  get last() {
    return this.nodes[this.nodes.length - 1];
  }

  constructor(nodes?: MaybeArray<T>) {
    super();

    this.nodes = toArray(nodes);
  }

  toString(): string {
    return stringifyContainer(this, '');
  }
}

// -----
// Primitives
// ----------------------------------------

export const SINGLE = "'" as const;
export const DOUBLE = '"' as const;

export class NullLiteral extends Node {
  type = 'null' as const;

  readonly value = null;

  toString() {
    return ``;
  }

  equalTo(other: NullLiteral): boolean {
    return this.value === other.value;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitNullLiteral(this);
  }
}

export class BooleanLiteral extends Node {
  type = 'boolean' as const;

  constructor(public value: boolean) {
    super();
  }

  toString() {
    return `${this.value}`;
  }

  negate() {
    this.value = !this.value;
    return this;
  }

  equalTo(other: BooleanLiteral): boolean {
    return this.value === other.value;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitBooleanLiteral(this);
  }
}

export class Numeric extends Node {
  type = 'numeric' as const;

  constructor(public value: number, public unit: string | null = null) {
    super();

    this.unit = unit?.toLowerCase() ?? null;
  }

  toString() {
    return `${this.value}${this.unit || ''}`;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitNumeric(this);
  }
}

export class Color extends Node {
  type = 'color' as const;

  constructor(public value: string) {
    super();
  }

  static isValidColor(name: string) {
    return isValid(name);
  }

  toString() {
    return `${this.value}`;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitColor(this);
  }
}

export class Url extends Node {
  type = 'url' as const;

  constructor(public value: string, public quoted: boolean) {
    super();
  }

  equalTo(other: Url) {
    return other.value === this.value;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitUrl(this);
  }
}

export class Variable extends Node {
  type = 'variable' as const;

  constructor(public name: string, public namespace?: string) {
    super();
  }

  toString() {
    return `${this.namespace ? `${this.namespace}.` : ''}$${this.name}`;
  }

  withNamespace(namespace: string) {
    return new Variable(this.name, namespace);
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitVariable(this);
  }
}

export class ClassReference extends Node {
  type = 'class-reference' as const;

  constructor(public name: string, public namespace?: string) {
    super();
  }

  toString() {
    return `${this.namespace ? `${this.namespace}.` : ''}%${this.name}`;
  }

  withNamespace(namespace: string) {
    return new Variable(this.name, namespace);
  }

  // accept<T>(visitor: ExpressionVisitor<T>): T {
  //   return visitor.visitClassReference(this);
  // }
}

export class ParentSelectorReference extends Node {
  type = 'parent-selector-reference' as const;

  toString() {
    return '&';
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitParentSelectorReference(this);
  }
}

// export class VariableDeclarator extends Node {
//   type = 'variable-declarator' as const;

//   constructor(public name: string) {
//     super();
//   }

//   toString() {
//     return `${this.name}`;
//   }
// }

export class Ident extends Node {
  type = 'ident' as const;

  constructor(public value: string, public namespace?: string) {
    super();
  }

  get isCustomProperty() {
    return this.value.startsWith('--');
  }

  equalTo(other: StringLiteral | Ident): boolean {
    return this.value === other.value;
  }

  toString() {
    return this.namespace ? `${this.namespace}.${this.value}` : this.value;
  }

  withNamespace(namespace: string) {
    return new Ident(this.value, namespace);
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitIdent(this);
  }
}

export class Interpolation extends Container<Expression> {
  type = 'interpolation' as const;

  get value() {
    return this.first;
  }

  toString() {
    return `#{${super.toString()}}`;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitInterpolation(this);
  }
}

export class InterpolatedIdent extends Container<Expression> {
  type = 'interpolated-ident' as const;

  constructor(public quasis: string[], expressions: Array<Expression> = []) {
    super(expressions);
  }

  static fromTokens(tokens: Array<string | Interpolation>) {
    const strings = [];
    const values = [];
    let current = '';

    for (const item of tokens) {
      if (typeof item === 'string') current += item;
      else {
        strings.push(current);
        values.push(item.value);
        current = '';
      }
    }
    strings.push(current);

    if (
      values.length === 1 &&
      strings.length === 2 &&
      strings[0] === '' &&
      strings[1] === ''
    ) {
      return new Interpolation(values[0]);
    }

    if (!values.length && strings.length === 1) {
      const str = strings[0];
      return Color.isValidColor(str) ? new Color(str) : new Ident(str);
    }

    return !values.length && strings.length === 1
      ? new Ident(strings[0])
      : new InterpolatedIdent(strings, values);
  }

  get expressions() {
    return this.nodes;
  }

  toString(): string {
    return interleave(this.quasis, this.nodes)
      .map((e) => e.toString())
      .join('');
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitInterpolatedIdent(this);
  }
}

export class StringLiteral extends Node {
  type = 'string' as const;

  constructor(public value: string, public quote?: '"' | "'") {
    super();
  }

  equalTo(other: StringLiteral | Ident): boolean {
    return this.value === other.value;
  }

  toString() {
    return this.quote ? `${this.quote}${this.value}${this.quote}` : this.value;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitStringLiteral(this);
  }
}

export class StringTemplate extends Container<Expression> {
  type = 'string-template' as const;

  constructor(
    public quasis: string[],
    expressions: Expression[] = [],
    public quote?: '"' | "'",
  ) {
    super(expressions);
  }

  get expressions() {
    return this.nodes;
  }

  static fromTokens(parts: Array<string | Interpolation>, quote?: '"' | "'") {
    const strings = [];
    const values = [];
    let current = '';

    for (const item of parts) {
      if (typeof item === 'string') current += item;
      else {
        strings.push(current);
        values.push(item.value);
        current = '';
      }
    }
    strings.push(current);

    if (!values.length) {
      return new StringLiteral(strings.join(''), quote);
    }

    return new StringTemplate(strings, values, quote);
  }

  toString(): string {
    const inner = interleave(this.quasis, this.nodes)
      .map((e) => e.toString())
      .join('');

    return this.quote ? `${this.quote}${inner}${this.quote}` : inner;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitStringTemplate(this);
  }
}

// -----
// Lists
// ----------------------------------------

const listItemNeedsParens = (item: Expression, sep: Separator) => {
  if (item.type === 'list') {
    if (item.nodes.length < 2 || item.brackets) return false;
    return (
      SEPARATOR_PRECEDENCE[sep] <= SEPARATOR_PRECEDENCE[item.separator || ' ']
    );
  }
  return false;
};

export function stringifyList(elements: Expression[], separator?: Separator) {
  let result = '';

  let sep: string = separator || ' ';
  if (separator === '/') sep = ' / ';
  if (separator === ',') sep += ' ';

  for (const [idx, node] of elements.entries()) {
    result += listItemNeedsParens(node, separator ?? ' ')
      ? `(${node.toString()})`
      : node.toString();

    if (idx !== elements.length - 1) {
      result += sep;
    }
  }

  return result;
}

export class List<T extends Expression = Expression> extends Container<T> {
  type = 'list' as const;

  *[Symbol.iterator]() {
    for (const child of this.nodes.values()) yield child;
  }

  constructor(
    nodes: T[],
    public separator?: Separator,
    public brackets = false,
  ) {
    super(nodes);
  }

  static wrap(expr: Expression, brackets = false) {
    if (expr.type === 'list') {
      expr.brackets = brackets;
      return expr;
    }
    return new List([expr], undefined, brackets);
  }

  static unwrap(expr: Expression) {
    if (expr.type !== 'list') return expr;

    const { first } = expr;
    if (expr.nodes.length !== 1 || expr.brackets) {
      return expr;
    }

    return first;
  }

  unwrap() {
    return List.unwrap(this);
  }

  toString() {
    let result = stringifyList(this.nodes, this.separator);

    if (this.brackets) result = `[${result}]`;
    return result;
  }

  accept<TValue>(visitor: ExpressionVisitor<TValue>): TValue {
    return visitor.visitList(this);
  }

  toArray() {
    return this.nodes.slice();
  }
}

export class ArgumentList extends Container<Argument> {
  type = 'argument-list' as const;

  static fromTokens(rawArgs: Argument[]) {
    const args = [] as Argument[];
    let spreads = 0;
    let lastWasKwarg = false;

    for (const item of rawArgs) {
      if (spreads === 2) {
        throw new SyntaxError('Expected no more arguments');
      }
      if (item.type === 'keyword-argument') {
        lastWasKwarg = true;
      } else if (item.type === 'spread') {
        spreads++;
      } else if (lastWasKwarg) {
        throw new SyntaxError(
          'Positional arguments cannot follow keyword arguments',
        );
      }

      args.push(item);
    }

    return new ArgumentList(args);
  }

  toString(): string {
    return stringifyList(this.nodes as any[], ',');
  }
}

export class Map<
  K extends Expression = Expression,
  V extends Expression = Expression
> extends Container<List<K | V>> {
  type = 'map' as const;

  constructor(properties: readonly [K, V][]) {
    super(properties?.map((pair) => new List(pair, ' ')));
  }

  entries() {
    return this.nodes.map(([key, value]) => [key, value] as [K, V]);
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitMap(this);
  }

  toString() {
    return `(${this.nodes.map((n) => `${n.first}: ${n.last}`).join(',')})`;
  }
}

// -----
// Functions
// ----------------------------------------

export abstract class BaseCallExpression extends Node {
  args: ArgumentList;

  constructor(callee: Ident, args: MaybeArray<Expression>);

  constructor(callee: Ident, args: ArgumentList);

  constructor(
    public callee: Ident,
    args: MaybeArray<Expression> | ArgumentList,
  ) {
    super();

    if (Array.isArray(args) || args?.type !== 'argument-list') {
      args = new ArgumentList(args);
    }

    this.args = args;
  }

  get isVar() {
    return (
      this.callee.toString() === 'var' &&
      this.args.first?.type === 'ident' &&
      this.args.first?.isCustomProperty
    );
  }

  toString(): string {
    return `${this.callee}(${this.args})`;
  }
}

export class CallExpression extends BaseCallExpression {
  type = 'call-expression' as const;

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitCallExpression(this);
  }
}

export class MathCallExpression extends BaseCallExpression {
  type = 'math-call-expression' as const;

  constructor(
    callee: 'calc' | 'clamp' | 'min' | 'max',
    args: Expression | Expression[],
  ) {
    super(new Ident(callee), args);
  }

  static withContext(fn: () => any) {
    try {
      MATH_FUNCTION_CONTEXT = true;
      return fn();
    } finally {
      MATH_FUNCTION_CONTEXT = false;
    }
  }

  toString(): string {
    if (MATH_FUNCTION_CONTEXT && isCalc(this)) {
      return `(${this.args.first})`;
    }

    return MathCallExpression.withContext(() => super.toString());
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitMathCallExpression(this);
  }
}

// -----
// Expressions
// ----------------------------------------

export type ArthimeticOperators = '+' | '-' | '*' | '/' | '%' | '**';

export type RelationalOperators = '>' | '>=' | '<' | '<=' | '==' | '!=';

export type LogicalOperators = 'not' | 'and' | 'or';

export type UnaryOperators = '+' | '-' | 'not';

export type Operators =
  | ArthimeticOperators
  | RelationalOperators
  | LogicalOperators;

export class Operator extends Node {
  type = 'operator' as const;

  constructor(public value: Operators) {
    super();
  }

  get precedence() {
    return OPERATOR_PRECEDENCE[this.value];
  }

  equalTo(other: StringLiteral | Ident | Operator): boolean {
    return StringLiteral.prototype.equalTo.call(this, other);
  }

  toString() {
    return `${this.value}`;
  }
}

export class UnaryExpression extends Node {
  type = 'unary-expression' as const;

  constructor(public operator: UnaryOperators, public argument: Expression) {
    super();
  }

  toString(): string {
    const { argument, operator: op } = this;
    let str = argument.toString();

    if (argument.type === 'binary-expression') str = `(${str})`;
    if (argument.type === 'numeric' && argument.value < 0) return str;
    return `${op === 'not' ? 'not ' : op}${str}`;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitUnaryExpression(this);
  }
}

export class BinaryExpression extends Node {
  type = 'binary-expression' as const;

  constructor(
    public left: Expression,
    public operator: Operator,
    public right: Expression,
  ) {
    super();
  }

  toString(): string {
    const leftStr = this.left.toString();
    const leftNeedsParens =
      this.left.type === 'binary-expression' &&
      this.left.operator.precedence < this.operator.precedence;

    const left = leftNeedsParens ? `(${leftStr})` : leftStr;

    const rightStr = this.right.toString();
    const rightNeedsParens =
      this.right.type === 'binary-expression' &&
      this.right.operator.precedence <= this.operator.precedence;

    const right = rightNeedsParens ? `(${rightStr})` : rightStr;

    return `${left} ${this.operator.toString()} ${right}`;
  }

  static fromTokens(head: Expression, tail: Array<[Operator, Expression]>) {
    let result = head;

    for (const [op, right] of tail) {
      result =
        op.value === '**'
          ? new BinaryExpression(right, op, result)
          : new BinaryExpression(result, op, right);
    }
    return result;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitBinaryExpression(this);
  }
}

export class Range extends Node {
  type = 'range' as const;

  constructor(
    public from: Expression,
    public to: Expression,
    public exclusive = false,
  ) {
    super();
  }

  toString() {
    const { from, to, exclusive } = this;
    return `${from} ${exclusive ? 'to' : 'through'} ${to}`;
  }

  accept<T>(visitor: ExpressionVisitor<T>): T {
    return visitor.visitRange(this);
  }
}

// -----
// Modules
// ----------------------------------------

export class Composition extends Node {
  type = 'composition' as const;

  constructor(
    public classList: Ident[],
    public isGlobal: boolean,
    public from?: string,
  ) {
    super();
  }
}
// export type ClassName = {
//   type: 'class';
//   name: 'string';
// };

export class ImportNamespaceSpecifier extends Node {
  type = 'namespace' as const;

  constructor(public imported: Ident, public local: Ident = imported) {
    super();
  }
}

export class ImportNamedSpecifier extends Node {
  type = 'named' as const;

  constructor(
    public imported: Variable | ClassReference | Ident,
    public local: Variable | ClassReference | Ident,
  ) {
    super();
  }
}

export class Import extends Container {
  type = 'import' as const;

  constructor(
    public request: string,
    specifiers: Array<ImportNamespaceSpecifier | ImportNamedSpecifier>,
  ) {
    super(specifiers);
  }

  get specifiers() {
    return this.nodes as Array<
      ImportNamespaceSpecifier | ImportNamedSpecifier
    >;
  }
}

export class ExportAllSpecifier extends Node {
  type = 'all' as const;
}

export class ExportSpecifier extends Node {
  type = 'named' as const;

  constructor(
    public exported: Variable | ClassReference | Ident,
    public local: Variable | ClassReference | Ident,
  ) {
    super();
  }
}

export class Export extends Container<ExportSpecifier | ExportAllSpecifier> {
  type = 'export' as const;

  constructor(
    specifiers:
      | ExportSpecifier
      | ExportAllSpecifier
      | Array<ExportSpecifier | ExportAllSpecifier>,
    public request?: string,
  ) {
    super(specifiers);
  }

  get specifiers() {
    return this.nodes;
  }
}

export class ExportNamedDeclaration extends Node {
  type = 'export-named-declaration' as const;

  constructor(public variable: Variable, public init: Expression) {
    super();
  }
}

// -----
// Control Flow
// ----------------------------------------

export class ForCondition extends Container<Expression> {
  type = 'for-condition' as const;

  constructor(
    public variable: Variable,
    from: Expression,
    to: Expression,
    public exclusive = true,
  ) {
    super([from, to]);
  }

  get from() {
    return this.nodes[0];
  }

  get to() {
    return this.nodes[1];
  }

  // toString() {
  //   return `${this.variable} from ${this.from} ${
  //     this.exclusive ? 'to' : 'through'
  //   } ${this.to} `;
  // }
}

export class EachCondition extends Node {
  type = 'each-condition' as const;

  readonly variables: Variable[];

  constructor(variables: Variable | Variable[], public expr: Expression) {
    super();

    this.variables = ([] as Variable[]).concat(variables);
  }

  toString(): string {
    return `${this.variables.join(', ')} in ${this.expr}`;
  }
}

export class DeclarationValue<T extends Node = Expression> extends Container<
  T
> {
  type = 'declaration-value' as const;

  get body() {
    return this.first;
  }
}

// -----
// Selectors
// ----------------------------------------

export abstract class BaseSimpleSelector extends Node {
  constructor(public readonly prefix: string, public name: Ident) {
    super();
  }

  toString() {
    return `${this.prefix}${this.name}`;
  }
}

export class TypeSelector extends BaseSimpleSelector {
  type = 'type-selector' as const;

  constructor(name: Ident) {
    super('', name);
  }
}

export class ClassSelector extends BaseSimpleSelector {
  type = 'class-selector' as const;

  constructor(name: Ident, public readonly original?: ClassSelector) {
    super('.', name);
  }

  rename(namer: (cls: string) => string) {
    return new ClassSelector(new Ident(namer(this.name.toString())), this);
  }

  accept<T>(visitor: SelectorVisitor<T>): T {
    return visitor.visitClassSelector(this);
  }
}

export class IdSelector extends BaseSimpleSelector {
  type = 'id-selector' as const;

  constructor(name: Ident) {
    super('#', name);
  }
}

export class UniversalSelector extends Node {
  type = 'universal-selector' as const;

  toString() {
    return '*';
  }
}

export class PlaceholderSelector extends BaseSimpleSelector {
  type = 'placeholder-selector' as const;

  constructor(name: Ident) {
    super('%', name);
  }

  accept<T>(visitor: SelectorVisitor<T>): T {
    return visitor.visitPlaceholderSelector(this);
  }
}

export class ParentSelector extends Node {
  type = 'parent-selector' as const;

  constructor(public prefix?: Ident, public suffix?: Ident) {
    super();
  }

  static merge(compound: CompoundSelector, nodes: ComplexSelectorNode[]) {
    const [parent, ...rest] = compound.nodes;
    if (parent.type !== 'parent-selector') {
      throw compound.error('oops');
    }

    let nextNodes = nodes;

    if (parent.prefix) {
      nextNodes = [...nodes];

      const first = nextNodes[0];
      if (first.type !== 'compound-selector') {
        throw parent.error(
          `Parent ${first} is incompatible with this selector.`,
        );
      }

      const prefix = parent.prefix as Ident;
      const simple = first.first;

      if (simple.type === 'type-selector') {
        simple.name = new Ident(`${prefix}${simple.name}`);
      } else {
        first.nodes.unshift(new TypeSelector(prefix));
        // throw parent.error('Invalid prefix');
      }
    }

    nextNodes = [...nodes];
    const last = nextNodes.pop()!;

    if (last.type !== 'compound-selector') {
      throw parent.error(`Parent ${last} is incompatible with this selector.`);
    }

    if (parent.suffix) {
      const suffix = parent.suffix as Ident;
      const simple = last.last;

      if (
        simple.type === 'id-selector' ||
        simple.type === 'class-selector' ||
        simple.type === 'type-selector' ||
        (simple.type === 'pseudo-selector' && !simple.params)
      ) {
        simple.name = new Ident(`${simple.name}${suffix}`);
      } else {
        throw parent.error('Invalid suffix');
      }
    }

    nextNodes.push(new CompoundSelector([...last.nodes, ...rest]));

    return nextNodes;
  }

  toString() {
    return `${this.prefix ?? ''}&${this.suffix ?? ''}`;
  }
}

export class AttributeSelector extends Node {
  type = 'attribute-selector' as const;

  constructor(
    public attribute: Ident,
    public operator?: '=' | '~=' | '|=' | '^=' | '$=' | '*=',
    public value?: StringLiteral | Ident,
  ) {
    super();
  }

  toString() {
    return `[${
      this.value
        ? `${this.attribute}${this.operator!}${this.value}`
        : this.attribute.toString()
    }]`;
  }
}

export class PseudoSelector extends Node {
  type = 'pseudo-selector' as const;

  params: StringLiteral | undefined;

  selector?: SelectorList;

  constructor(
    public name: Ident,
    public isElement = false,
    paramsOrSelector?: StringLiteral | SelectorList,
  ) {
    super();

    if (paramsOrSelector?.type === 'selector-list')
      this.selector = paramsOrSelector;
    else {
      this.params = paramsOrSelector as StringLiteral;
    }
  }

  static fromTokens(
    element: ':' | undefined,
    name: Ident,
    params: StringLiteral,
    parse: () => SelectorList,
  ) {
    const unvendored = unvendor(name.value);

    if (
      params &&
      ((element && selectorPseudoElements.includes(unvendored)) ||
        selectorPsuedoClasses.includes(unvendored))
    ) {
      return new PseudoSelector(name, !!element, parse());
    }

    return new PseudoSelector(name, !!element, params);
  }

  get isScope() {
    const name = this.name.toString();

    return name === 'global' || name === 'local';
  }

  asSelector(selector: SelectorList) {
    const next = this.clone();
    selector.source =
      selector.source ?? (this.params || this.selector)!.source;
    next.selector = selector;
    return next;
  }

  toString() {
    const content = this.params || this.selector;
    const name = `${this.isElement ? '::' : ':'}${this.name}`;

    return content ? `${name}(${content})` : name;
  }
}

export type SimpleSelector =
  | ParentSelector
  | UniversalSelector
  | TypeSelector
  | IdSelector
  | ClassSelector
  | PlaceholderSelector
  | AttributeSelector
  | PseudoSelector;

export type Selector =
  | SimpleSelector
  | ComplexSelectorNode
  | ComplexSelector
  | SelectorList;

export class CompoundSelector extends Container<SimpleSelector> {
  type = 'compound-selector' as const;

  hasParentSelectors(): boolean {
    return this.nodes.some(
      (n) =>
        n.type === 'parent-selector' ||
        (n.type === 'pseudo-selector' && n.selector?.hasParentSelectors()),
    );
  }

  // accept<T>(visitor: SelectorVisitor<T>): T {
  //   return visitor.visitCompoundSelector(this);
  // }
}

export class Combinator extends Node {
  type = 'combinator' as const;

  constructor(public value: Combinators) {
    super();
  }

  toString() {
    return this.value;
  }
}

export type ComplexSelectorNode = CompoundSelector | Combinator;

export class ComplexSelector extends Container<ComplexSelectorNode> {
  type = 'complex-selector' as const;

  hasParentSelectors() {
    return this.nodes.some(
      (n) => n.type === 'compound-selector' && n.hasParentSelectors(),
    );
  }

  toString(): string {
    let result = '';

    for (const [idx, item] of this.nodes.entries()) {
      const prev = this.nodes[idx - 1];

      if (item.type === 'combinator') {
        result += item.value === ' ' ? ' ' : ` ${item} `;
      } else if (prev && prev.type !== 'combinator') {
        result += ` ${item.toString()}`;
      } else {
        result += item.toString();
      }
    }
    // console.log(this.nodes, result);
    return result;
  }

  // accept<T>(visitor: SelectorVisitor<T>): T {
  //   return visitor.visitComplexSelector(this);
  // }
}

export class SelectorList extends Container<
  ComplexSelector | CompoundSelector
> {
  type = 'selector-list' as const;

  *[Symbol.iterator]() {
    for (const child of this.nodes.values()) yield child;
  }

  hasParentSelectors() {
    return this.nodes.some((n) => n.hasParentSelectors());
  }

  toString(): string {
    return stringifyContainer(this, ', ');
  }

  toList() {
    return new List(
      this.nodes.map(
        (n) =>
          new List(
            n.type === 'compound-selector'
              ? [new Ident(String(n))]
              : n.nodes.map((nn) => new Ident(String(nn))),
            ' ',
          ),
      ),
      ',',
    );
  }

  accept<T>(visitor: SelectorVisitor<T>) {
    return visitor.visitSelectorList(this);
  }
}

export class UnknownDefaultValue extends Node {
  type = 'unknown-default-value' as const;
}

export class Parameter extends Node {
  type = 'parameter' as const;

  constructor(
    public name: Variable,
    public defaultValue: Expression | UnknownDefaultValue | null = null,
  ) {
    super();
  }
}

export class RestParameter extends Node {
  type = 'rest' as const;

  constructor(public name: Variable) {
    super();
  }

  toString() {
    return `${this.name}...`;
  }
}

export class ParameterList extends Node {
  type = 'parameter-list' as const;

  constructor(
    public parameters: Parameter[] = [],
    public rest?: RestParameter,
  ) {
    super();
  }

  static fromTokens(params: Array<Parameter | RestParameter>) {
    const nodes = [] as Parameter[];
    let rest: RestParameter | undefined;

    for (const param of params) {
      if (param.type === 'parameter') {
        if (rest) {
          throw new SyntaxError('Rest parameters must be the last parameter');
        }
        nodes.push(param);
      } else {
        rest = param;
      }
    }

    return new ParameterList(nodes, rest);
  }

  toString() {
    const nodes = [...this.parameters] as any[];

    if (this.rest) nodes.push(this.rest);

    return stringifyList(nodes, ',');
  }
}

export class SpreadArgument extends Node {
  type = 'spread' as const;

  constructor(public value: Expression) {
    super();
  }

  toString() {
    return `${this.value}...`;
  }
}

export class KeywordArgument extends Node {
  type = 'keyword-argument' as const;

  constructor(public name: Variable, public value: Expression) {
    super();
  }

  toString() {
    return `${this.name}: ${this.value}`;
  }
}

export class CallableDeclaration extends Node {
  type = 'callable-declaration' as const;

  constructor(
    public name: Ident,
    public params: ParameterList = new ParameterList(),
    public body: ChildNode[] = [],
  ) {
    super();
  }
}

export class MixinDeclaration extends Node {
  type = 'mixin-declaration' as const;

  constructor(public name: Ident, public params: Parameter[] = []) {
    super();
  }
}

export type MetaAtRule = DebugAtRule | WarnAtRule | ErrorAtRule;

export type ControlFlowAtRule = IfAtRule | ElseAtRule | EachAtRule;

export type IcssRule = IcssImportAtRule | IcssExportAtRule;

export type StatementNode =
  | Root
  | Rule
  | AtRule
  | MixinAtRule
  | FunctionAtRule
  | ReturnAtRule
  | IncludeAtRule
  | ContentAtRule
  | ComposeAtRule
  | ImportAtRule
  | UseAtRule
  | ExportAtRule
  | CssAtRule
  | MetaAtRule
  | ControlFlowAtRule
  | IcssRule;

export type ChildNode =
  | Rule
  | AtRule
  | MixinAtRule
  | FunctionAtRule
  | ReturnAtRule
  | IncludeAtRule
  | ContentAtRule
  | ComposeAtRule
  | ImportAtRule
  | UseAtRule
  | ExportAtRule
  | CssAtRule
  | Declaration
  | Comment
  | MetaAtRule
  | ControlFlowAtRule
  | IcssRule;

// / Postcss alterations
export type StatementBase = ContainerBase<ChildNode, StatementNode>;

export interface Root extends StatementBase {
  type: 'root';

  parent: void;

  clone(overrides?: object): this;

  toResult(options?: { to?: string; map?: SourceMapOptions }): Result;
}

export interface Comment extends NodeBase<ChildNode, StatementNode> {
  type: 'comment';
  parent: StatementNode;
  text: string;
  clone(overrides?: object): this;
}

export interface Declaration extends StatementBase {
  type: 'decl';

  parent: StatementNode;

  prop: string;

  value: string;

  important: boolean;

  isNested: true;
  ident: Variable | Ident | InterpolatedIdent;
  valueAst: Expression;
  clone(overrides?: object): this;
}

export interface Rule extends StatementBase {
  type: 'rule';
  /**
   * Returns the rule's parent node.
   */
  parent: StatementNode;
  /**
   * The rule's full selector. If there are multiple comma-separated selectors,
   * the entire group will be included.
   */
  selector: string;
  /**
   * An array containing the rule's individual selectors.
   * Groups of selectors are split at commas.
   */
  selectors: string[];
  /**
   * @param overrides New properties to override in the clone.
   * @returns A clone of this node. The node and its (cloned) children will
   * have a clean parent and code style properties.
   */
  clone(overrides?: object): this;

  selectorAst: StringTemplate;
  selectorList: SelectorList;
}

export interface AtRule extends StatementBase {
  type: 'atrule';
  /**
   * Returns the atrule's parent node.
   */
  parent: StatementNode;
  /**
   * The identifier that immediately follows the @.
   */
  name: string;
  /**
   * These are the values that follow the at-rule's name, but precede any {}
   * block. The spec refers to this area as the at-rule's "prelude".
   */
  params: string;
  /**
   * @param overrides New properties to override in the clone.
   * @returns A clone of this node. The node and its (cloned) children will
   * have a clean parent and code style properties.
   */
  clone(overrides?: object): this;
}

export type OtherAtRule = AtRule & {
  type: Exclude<string, 'if' | 'else if'>;
};

export type ImportAtRule = AtRule & {
  name: 'import';
  request: string | null;
};

export type UseAtRule = AtRule & {
  name: 'use';
  request: string;
  specifiers: Array<ImportNamespaceSpecifier | ImportNamedSpecifier>;
};

export type IcssImportAtRule = AtRule & {
  name: 'icss-import';
  // request: string;
  // specifiers: Array<ImportNamedSpecifier>;
};

export type ExportAtRule = AtRule & {
  name: 'export';
  request?: string;
  specifiers?: Array<ExportSpecifier | ExportAllSpecifier>;
  declaration?: ExportNamedDeclaration;
};

export type IcssExportAtRule = AtRule & {
  name: 'icss-export';
  // request?: string;
  // specifiers?: Array<ExportSpecifier | ExportAllSpecifier>;
};

export type EachAtRule = AtRule & {
  name: 'each';
  variables: Variable[];
  expression: Expression;
};

export type IfAtRule = AtRule & {
  name: 'if' | 'else if';
  test: Expression;
};

export type ElseAtRule = AtRule & {
  name: 'else';
};

export type MixinAtRule = AtRule & {
  name: 'mixin';
  mixin: Ident;
  parameterList: ParameterList;
};

export type FunctionAtRule = AtRule & {
  name: 'function';
  functionName: Ident;
  parameterList: ParameterList;
};

export type ReturnAtRule = AtRule & {
  name: 'return';
  returnValue: Expression;
};

export type IncludeAtRule = AtRule & {
  name: 'include';
  callExpressions: CallExpression[];
};

export type ContentAtRule = AtRule & {
  name: 'content';
};

export type ComposeAtRule = AtRule & {
  name: 'compose';
  classList: Ident[];
  request?: string;
  isGlobal: boolean;
};

export type DebugAtRule = AtRule & {
  name: 'debug';
  expression: Expression;
};
export type WarnAtRule = AtRule & {
  name: 'warn';
  expression: Expression;
};

export type ErrorAtRule = AtRule & {
  name: 'error';
  expression: Expression;
};

export type CssAtRule = AtRule & {
  paramValue: StringTemplate;
};
