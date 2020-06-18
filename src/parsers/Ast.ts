/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable max-classes-per-file */

import { channel, isValid } from 'khroma';

import interleave from '../utils/interleave';
import conversions from '../utils/unit-conversions';
import { IFileRange } from './parser';

const tag = `@@typeof/Node`;
const SOURCE = Symbol.for('node source');

function cloneNode(obj: Node, parent?: Node) {
  // @ts-ignore
  const cloned = obj.constructor ? new obj.constructor() : Object.create(null);

  for (let [key, value] of Object.entries(obj)) {
    const type = typeof value;

    if (key === 'parent' && type === 'object') {
      if (parent) cloned[key] = parent;
    } else if (Array.isArray(value)) {
      cloned[key] = value.map((j) => cloneNode(j, cloned));
    } else {
      if (type === 'object' && value !== null) {
        value = cloneNode(value);
      }
      cloned[key] = value;
    }
  }
  // console.log(cloned, parent);
  return cloned;
}

let MATH_FUNCTION_CONTEXT = false;

export abstract class Node<T extends string = any> {
  abstract type: T;

  parent: Container | null = null;

  [Symbol.hasInstance](inst: any) {
    return inst && inst[Symbol.for(tag)] === true;
  }

  [SOURCE]?: IFileRange & {
    input: string;
  };

  replaceWith(nodes: Node | Node[]) {
    if (this.parent) {
      this.parent?.insertAfter(this, nodes);
      this.parent?.removeChild(this);
    }

    return this;
  }

  remove() {
    this.parent?.removeChild(this);
    return this;
  }

  clone(): this {
    const cloned = cloneNode(this);

    return cloned;
  }

  equalTo(node: Node): boolean {
    return this === node;
  }

  error(msg: string) {
    const error = new Error(msg);
    const { start, end } = this[SOURCE] || {};
    // @ts-ignore
    error.location = { start, end };
    return error;
  }
}

export type Comma = ',';
export type Space = ' ';
export type Slash = '/';

export type Separator = Comma | Space | Slash;

export type Combinators = '>' | '+' | ' ';

export const OPERATOR_PRECEDENCE: Record<Operators, number> = {
  'or': 0,
  'and': 1,
  'not': 2,
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
  | ParentSelector
  | Url
  | Calc
  | MathFunction
  | Function
  | Variable
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

export type ReducedExpression =
  | Exclude<Expression, Range | Variable | StringTemplate | List>
  | List<ReducedExpression>;

type WalkerIterable = Iterable<[Expression, { index: number; skip(): void }]>;

function stringifyContainer(container: Container, sep: string): string {
  let result = '';
  for (const [idx, node] of container.nodes.entries()) {
    result += idx === 0 ? node.toString() : `${sep}${node.toString()}`;
  }
  return result;
}

export abstract class Container<T extends Node = Node> extends Node {
  protected _nodes: T[] = [];

  private currentIndices: Record<number, number> = Object.create(null);

  private id = 0;

  get nodes(): readonly T[] {
    return this._nodes;
  }

  set nodes(nodes: readonly T[]) {
    this._nodes = this.normalize(nodes as T[]);
  }

  get first() {
    return this.nodes[0];
  }

  get last() {
    return this.nodes[this.nodes.length - 1];
  }

  constructor(nodes?: T | readonly T[]) {
    super();

    if (nodes) this.push(...([] as T[]).concat(nodes));
  }

  push(...children: T[]) {
    for (const child of children) {
      if (child == null) continue;
      child.parent = this;

      this._nodes.push(child);
    }

    return this;
  }

  *children(): Iterable<[T, number]> {
    if (!this.nodes) {
      return;
    }

    const id = ++this.id;

    this.currentIndices[id] = 0;

    let index: number;

    try {
      while (this.currentIndices[id] < this.nodes.length) {
        index = this.currentIndices[id];

        yield [this.nodes[index], index];

        this.currentIndices[id]++;
      }
    } finally {
      delete this.currentIndices[id];
    }
  }

  *ancestors(): WalkerIterable {
    for (const [child, index] of this.children()) {
      let skipped = false;
      yield [
        child as any,
        {
          index,
          skip() {
            skipped = true;
          },
        },
      ];
      const next = !skipped && (child as any).ancestors?.();
      // console.log('i:', next);
      if (next) yield* next;
    }
  }

  append(...children: T[]) {
    for (const child of children) {
      const nodes = this.normalize(child);
      for (const node of nodes) this._nodes.push(node);
    }
    return this;
  }

  insertAfter(node: T, itemsToAdd: T | T[]) {
    const current = this.nodes.indexOf(node);

    const nodes = this.normalize(itemsToAdd).reverse();
    for (const next of nodes) {
      this._nodes.splice(current + 1, 0, next);
    }

    for (const [id, index] of Object.entries(this.currentIndices)) {
      if (current < index) {
        this.currentIndices[id as any] = index + nodes.length;
      }
    }

    return this;
  }

  removeChild(child: T) {
    const idx = this.nodes.indexOf(child);
    child.parent = null;
    this._nodes.splice(idx, 1);

    for (const [id, index] of Object.entries(this.currentIndices)) {
      if (index >= idx) {
        this.currentIndices[id as any] = index - 1;
      }
    }

    return this;
  }

  private normalize(nodes: T | T[]) {
    if (!Array.isArray(nodes)) nodes = [nodes];
    for (const node of nodes) {
      if (node == null) continue;
      if (node.parent) node.parent.removeChild(node);
      node.parent = this;
    }
    return nodes;
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
}

export class Numeric extends Node {
  type = 'numeric' as const;

  constructor(public value: number, public unit: string | null = null) {
    super();

    this.unit = unit?.toLowerCase() ?? null;
  }

  static compatible(a: Numeric, b: Numeric) {
    if (a.unit && b.unit) {
      if (a.unit === b.unit) return true;
      if (!(b.unit in conversions)) return false;
      if (!(a.unit in conversions[b.unit])) return false;
    }

    return true;
  }

  toString() {
    return `${this.value}${this.unit || ''}`;
  }

  equalTo(other: Numeric) {
    return other.convert(this.unit).value === this.value;
  }

  convert(toUnit: string | null, precision = 5) {
    if (!toUnit || this.unit === toUnit) return this;

    const targetNormal = toUnit.toLowerCase();
    if (!this.unit) {
      this.unit = targetNormal;
      return this;
    }

    if (
      !(targetNormal in conversions) ||
      !(this.unit in conversions[targetNormal])
    ) {
      throw new Error(`Cannot convert from ${this.unit} to ${toUnit}`);
    }

    let converted = conversions[targetNormal][this.unit] * this.value;

    if (precision != null) {
      // eslint-disable-next-line no-bitwise
      precision = 10 ** (precision >>> 0);
      converted = Math.round(converted * precision) / precision;
    }

    return new Numeric(converted, toUnit);
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

  equalTo(other: Color) {
    return (
      channel(this.value, 'r') === channel(other.value, 'r') &&
      channel(this.value, 'g') === channel(other.value, 'g') &&
      channel(this.value, 'b') === channel(other.value, 'b') &&
      channel(this.value, 'a') === channel(other.value, 'a')
    );
  }

  toString() {
    return `${this.value}`;
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
}

export class Variable extends Node {
  type = 'variable' as const;

  constructor(public name: string, public namespace?: string) {
    super();
  }

  toString() {
    return `${this.namespace ? `${this.namespace}.` : ''}$${this.name}`;
  }
}

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
}

export class Interpolation extends Container<Expression> {
  type = 'interpolation' as const;

  get value() {
    return this.first;
  }

  toString() {
    return `#{${super.toString()}}`;
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

export function stringifyList(
  container: Container<Expression>,
  separator?: Separator,
) {
  let result = '';

  let sep: string = separator || ' ';
  if (separator === '/') sep = ' / ';
  if (separator === ',') sep += ' ';

  for (const [idx, node] of container.nodes.entries()) {
    result += listItemNeedsParens(node, separator ?? ' ')
      ? `(${node.toString()})`
      : node.toString();

    if (idx !== container.nodes.length - 1) {
      result += sep;
    }
  }

  return result;
}

export class List<T extends Expression = Expression> extends Container<T> {
  type = 'list' as const;

  *[Symbol.iterator]() {
    for (const [child] of this.children()) yield child;
  }

  constructor(
    nodes: readonly T[],
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

    expr.replaceWith(first.remove());
    return first;
  }

  equalTo(list: List): boolean {
    return (
      this.separator === list.separator &&
      this.brackets === list.brackets &&
      this.nodes.length === list.nodes.length &&
      this.nodes.every(
        (item, idx) =>
          areEquatable(item, list.nodes[idx]) &&
          item.equalTo(list.nodes[idx] as any),
      )
    );
  }

  unwrap() {
    return List.unwrap(this);
  }

  toString() {
    let result = stringifyList(this, this.separator);

    if (this.brackets) result = `[${result}]`;
    return result;
  }
}

export class Map<
  K extends Expression = Expression,
  V extends Expression = Expression
> extends Container<List<K | V>> {
  type = 'map' as const;

  *[Symbol.iterator]() {
    for (const [child] of this.children()) yield child;
  }

  constructor(properties: readonly [K, V][]) {
    super(properties.map((pair) => new List(pair, ' ')));
  }

  toString() {
    return `(${this.nodes.map((n) => `${n.first}: ${n.last}`).join(',')})`;
  }

  equalTo(other: Map): boolean {
    return (
      this.nodes.length === other.nodes.length &&
      this.nodes.every((item, idx) => item.equalTo(other.nodes[idx] as any))
    );
  }
}

// -----
// Functions
// ----------------------------------------

export abstract class BaseFunction extends Container<Expression> {
  constructor(public name: Ident, args: Expression | Expression[]) {
    super(args);
  }

  get isVar() {
    return (
      this.name.toString() === 'var' &&
      this.nodes[0].type === 'ident' &&
      this.nodes[0].isCustomProperty
    );
  }

  toString(): string {
    return `${this.name}(${stringifyList(this, ',')})`;
  }
}

export class Function extends BaseFunction {
  type = 'function' as const;

  constructor(public name: Ident, args: Expression) {
    // unwrap nested calcs
    // ??? needed
    super(
      name,
      args.type === 'list' && (args.separator === ',' || !args.separator)
        ? (args.nodes as any)
        : args,
    );
  }
}

export class MathFunction extends BaseFunction {
  type = 'math-function' as const;

  constructor(name: 'clamp' | 'min' | 'max', params: Expression[]) {
    // unwrap nested calcs
    // ??? needed
    super(
      new Ident(name),
      params?.map((p) => (p.type === 'calc' ? p.expression : p)),
    );
  }

  static withContext(fn: () => any) {
    try {
      MATH_FUNCTION_CONTEXT = true;
      return fn();
    } finally {
      MATH_FUNCTION_CONTEXT = false;
    }
  }
}

export class Calc extends Container<Expression> {
  type = 'calc' as const;

  get expression() {
    return this.nodes[0];
  }

  set expression(expr: Expression) {
    this.nodes[0].replaceWith(expr);
  }

  toString(): string {
    if (MATH_FUNCTION_CONTEXT) {
      return `(${this.expression.toString()})`;
    }

    return MathFunction.withContext(
      () => `calc(${this.expression.toString()})`,
    );
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

export class UnaryExpression extends Container<Expression> {
  type = 'unary-expression' as const;

  constructor(public operator: UnaryOperators, argument: Expression) {
    super([argument]);
  }

  get argument() {
    return this.nodes[0];
  }

  set argument(argument: Expression) {
    this.nodes[0].replaceWith(argument);
  }

  toString(): string {
    const { argument, operator: op } = this;
    let str = argument.toString();

    if (argument.type === 'binary-expression') str = `(${str})`;
    if (argument.type === 'numeric' && argument.value < 0) return str;
    return `${op === 'not' ? 'not ' : op}${str}`;
  }
}

export class BinaryExpression extends Container {
  type = 'binary-expression' as const;

  readonly nodes!: [Expression, Operator, Expression];

  constructor(left: Expression, operator: Operator, right: Expression) {
    super([left, operator, right]);
  }

  get left(): Expression {
    return this.nodes[0] as any;
  }

  set left(left: Expression) {
    this.nodes[0].replaceWith(left);
  }

  get operator(): Operator {
    return this.nodes[1] as any;
  }

  set operator(op: Operator) {
    this.nodes[1].replaceWith(op);
  }

  get right(): Expression {
    return this.nodes[2] as any;
  }

  set right(right: Expression) {
    this.nodes[2].replaceWith(right);
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
}

export class Range extends Container<Expression> {
  type = 'range' as const;

  constructor(from: Expression, to: Expression, public exclusive = false) {
    super([from, to]);
  }

  get from() {
    return this.first;
  }

  set from(expr: Expression) {
    this.nodes[0].replaceWith(expr);
  }

  get to() {
    return this.last;
  }

  set to(expr: Expression) {
    this.nodes[1].replaceWith(expr);
  }

  toList(): List {
    const { from, to, exclusive } = this;
    if (from.type !== 'numeric') throw new Error(`${from} is not numeric`);
    if (to.type !== 'numeric') throw new Error(`${to} is not numeric`);

    if (!Numeric.compatible(from, to)) {
      throw new Error(`${from.unit} is not compatible with ${to.unit}`);
    }

    const end = exclusive ? to.value : to.value + 1;
    const start = from.value;
    const mult = end < start ? -1 : 1;
    return new List(
      Array.from(
        { length: Math.abs(end - start) },
        (_, i) => new Numeric(start + i * mult),
      ),
      ' ',
    );
  }

  toString() {
    const { from, to, exclusive } = this;
    return `${from} ${exclusive ? 'to' : 'through'} ${to}`;
  }
}

// -----
// Modules
// ----------------------------------------

export type ClassName = {
  type: 'class';
  name: 'string';
};

export class ImportNamespaceSpecifier extends Node {
  type = 'namespace' as const;

  constructor(public imported: Ident, public local: Ident = imported) {
    super();
  }
}

export class ImportNamedSpecifier extends Node {
  type = 'named' as const;

  constructor(
    public imported: Variable | Ident,
    public local: Variable | Ident,
  ) {
    super();
  }
}

export class Import extends Container {
  type = 'import' as const;

  constructor(
    public source: string,
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

  constructor(public exported: Variable, public local: Variable) {
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
    public source?: string,
  ) {
    super(specifiers);
  }

  get specifiers() {
    return this.nodes;
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

export class EachCondition extends Container<Expression> {
  type = 'each-condition' as const;

  readonly variables: Variable[];

  constructor(variables: Variable | Variable[], expr: Expression) {
    super(expr);

    this.variables = ([] as Variable[]).concat(variables);
  }

  toString(): string {
    return `${this.variables.join(', ')} in ${this.first}`;
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

type AnyIdent = InterpolatedIdent | Ident | Interpolation;
type AnyString = StringLiteral | StringTemplate;

export abstract class BaseSimpleSelector<
  T extends AnyIdent = AnyIdent
> extends Container<T> {
  constructor(public readonly prefix: string, name: AnyIdent) {
    super(name as T);
  }

  get name() {
    return this.first;
  }

  set name(name: AnyIdent) {
    this.first.replaceWith(name);
  }

  toString() {
    return `${this.prefix}${this.name}`;
  }
}

export class TypeSelector extends BaseSimpleSelector {
  type = 'type-selector' as const;

  constructor(name: AnyIdent) {
    super('', name);
  }
}

export class ClassSelector extends BaseSimpleSelector {
  type = 'class-selector' as const;

  constructor(name: AnyIdent) {
    super('.', name);
  }
}

export class IdSelector extends BaseSimpleSelector {
  type = 'id-selector' as const;

  constructor(name: AnyIdent) {
    super('#', name);
  }
}

export class UniversalSelector extends Node {
  type = 'universal-selector' as const;

  toString() {
    return '*';
  }
}

export class ParentSelector extends Container<AnyIdent> {
  type = 'parent-selector' as const;

  constructor(prefix?: AnyIdent, suffix?: AnyIdent) {
    super([prefix, suffix].filter(Boolean) as any);
  }

  get prefix() {
    return this.first;
  }

  get suffix() {
    return this.last;
  }

  static merge(compound: CompoundSelector, nodes: ComplexSelectorNode[]) {
    const [parent, ...rest] = compound.nodes;
    if (parent.type !== 'parent-selector') {
      throw compound.error('oops');
    }

    let nextNodes = nodes;

    if (parent.suffix) {
      nextNodes = [...nodes];
      const last = nextNodes.pop()!;

      if (last.type !== 'compound-selector') {
        throw parent.error(
          `Parent ${last.parent} is incompatible with this selector.`,
        );
      }

      const suffix = parent.suffix as Ident;
      const simple = last.last;

      if (
        simple.type === 'id-selector' ||
        simple.type === 'class-selector' ||
        simple.type === 'type-selector' ||
        (simple.type === 'pseudo-selector' && !simple.params)
      ) {
        simple.first.replaceWith(new Ident(`${simple.name}${suffix}`));

        nextNodes.push(new CompoundSelector([...last.nodes, ...rest]));
      } else {
        throw parent.error('Invalid suffix');
      }
    }

    if (parent.prefix) {
      nextNodes = [...nodes];

      const first = nextNodes[0];
      if (first.type !== 'compound-selector') {
        throw parent.error(
          `Parent ${first.parent} is incompatible with this selector.`,
        );
      }

      const prefix = parent.prefix as Ident;
      const simple = first.first;

      if (simple.type === 'type-selector') {
        simple.first.replaceWith(new Ident(`${prefix}${simple.name}`));
      } else {
        throw parent.error('Invalid prefix');
      }
    }

    return nextNodes;
  }

  toString() {
    return `${this.prefix ?? ''}&${this.suffix ?? ''}`;
  }
}

export class AttributeSelector extends Container<AnyString | AnyIdent> {
  type = 'attribute-selector' as const;

  constructor(
    attribute: AnyIdent,
    public operator?: '=' | '~=' | '|=' | '^=' | '$=' | '*=',
    value?: AnyString | AnyIdent,
  ) {
    super(value ? [attribute, value] : attribute);
  }

  get attribute() {
    return this.first;
  }

  get value() {
    return this.nodes.length === 2 ? this.last : undefined;
  }

  toString() {
    return `[${
      this.value
        ? `${this.attribute}${this.operator!}${this.value}`
        : this.attribute.toString()
    }]`;
  }
}

export class PseudoSelector extends Container<
  InterpolatedIdent | Ident | AnyString | SelectorList
> {
  type = 'pseudo-selector' as const;

  constructor(
    name: InterpolatedIdent | Ident,
    public isElement = false,
    params?: AnyString | SelectorList,
  ) {
    super(params ? [name, params] : [name]);
  }

  get name(): InterpolatedIdent | Ident {
    return this.first as any;
  }

  get params(): AnyString | SelectorList | undefined {
    return this.nodes.length > 1 ? (this.last as any) : undefined;
  }

  set params(params: AnyString | SelectorList | undefined) {
    if (this.nodes.length === 1) {
      if (!params) this.last.remove();
      else this.last.replaceWith(params);
    } else if (params) this.push(params);
  }

  get selector() {
    return this.params?.type === 'selector-list' ? this.params : null;
  }

  asSelector(selector: SelectorList) {
    const next = this.clone();
    selector[SOURCE] = selector[SOURCE] ?? this.params![SOURCE];
    next.params = selector;
    return next;
  }

  toString() {
    const name = `${this.isElement ? '::' : ':'}${this.name}`;

    return this.params ? `${name}(${this.params})` : name;
  }
}

export type SimpleSelector =
  | ParentSelector
  | UniversalSelector
  | TypeSelector
  | IdSelector
  | ClassSelector
  | AttributeSelector
  | PseudoSelector;

export class CompoundSelector extends Container<SimpleSelector> {
  type = 'compound-selector' as const;

  hasParentSelectors(): boolean {
    return this.nodes.some(
      (n) =>
        n.type === 'parent-selector' ||
        (n.type === 'pseudo-selector' && n.selector?.hasParentSelectors()),
    );
  }
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
}

export class SelectorList extends Container<
  ComplexSelector | CompoundSelector
> {
  type = 'selector-list' as const;

  *[Symbol.iterator]() {
    for (const [child] of this.children()) yield child;
  }

  hasParentSelectors() {
    return this.nodes.some((n) => n.hasParentSelectors());
  }

  // private resolveCompoundParentSelectors(compound: CompoundSelector, parentList: SelectorList) {
  //   // if (!compound.hasParentSelectors()) return false

  //   const next = compound.nodes.map(simple => {
  //     if (simple.type ===)
  //   })
  // }

  toString(): string {
    return stringifyContainer(this, ', ');
  }
}

// export class FunctionDeclaration extends Base<T> {
//   type = 'function-declaration' as const;

//   get body() {
//     return this.first;
//   }
// }
