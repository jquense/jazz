/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable max-classes-per-file */

import * as Convert from 'color-convert';
import type {
  HSL as HslChannels,
  HWB as HwbChannels,
  KEYWORD,
  LAB as LabChannels,
  LCH as LchChannels,
  RGB as RgbChannels,
} from 'color-convert/conversions';
import clamp from 'lodash/clamp';

import {
  MaybeArray,
  OPERATOR_PRECEDENCE,
  Operators,
  SEPARATOR_PRECEDENCE,
  Separator,
  toArray,
} from './Ast';
import colorNames from './utils/color-names';
import conversions from './utils/unit-conversions';

// eslint-disable-next-line @typescript-eslint/naming-convention
type VALUE_TYPE =
  | 'null'
  | 'boolean'
  | 'numeric'
  | 'string'
  | 'color'
  | 'map'
  | 'list'
  | 'arglist'
  | 'function'
  | 'math-function';

export function assertType<T extends VALUE_TYPE, V extends Value = Value>(
  value: V,
  type: T,
  title?: string,
): asserts value is V extends { type: T } ? V : never {
  if (value.type === type) return;
  throw new TypeError(`${title ? `${title}: ` : ''}${value} is not a ${type}`);
}

export abstract class BaseValue {
  abstract type: VALUE_TYPE;

  equalTo(other: any): boolean {
    return this === other;
  }

  isTruthy(): boolean {
    return true;
  }

  toJs() {
    return this as any;
  }

  toJSON(): any {
    return this.toString();
  }

  toArray(): Value[] {
    return [this as any];
  }

  assertType<T extends VALUE_TYPE>(
    type: T,
    title?: string,
  ): Extract<Value, { type: T }> {
    assertType(this as any, type, title);
    return this as any;
  }

  // abstract hashCode(): number;
}

export const isCalcValue = (
  a: Value | MathExpression,
): a is MathFunctionValue => a.type === 'math-function' && a.callee === 'calc';

export type Value =
  | StringValue
  | NumericValue
  | NullValue
  | BooleanValue
  | ColorValues
  | ListValue
  | MapValue
  | ArgumentListValue
  | FunctionValue
  | MathFunctionValue;

export class StringValue<T extends string = string> extends BaseValue {
  type = 'string' as const;

  constructor(public value: T, public quote?: '"' | "'") {
    super();
  }

  get isCustomProperty() {
    return !this.quote && this.value.startsWith('--');
  }

  get isVarCall() {
    return !this.quote && this.value.startsWith('var(--');
  }

  toJs() {
    return this.toJSON();
  }

  toJSON() {
    return this.value;
  }

  toString() {
    return this.quote ? `${this.quote}${this.value}${this.quote}` : this.value;
  }

  equalTo(other: Value): boolean {
    return other.type === this.type && this.value === other.value;
  }
  // hashCode() {}
}

export class NullValue extends BaseValue {
  type = 'null' as const;

  readonly value = null;

  toJs() {
    return this.toJSON();
  }

  toJSON() {
    return null;
  }

  toString() {
    return 'null';
  }

  equalTo(other: Value): boolean {
    return other.type === this.type && this.value === other.value;
  }

  isTruthy() {
    return false;
  }
}

export class BooleanValue extends BaseValue {
  type = 'boolean' as const;

  constructor(public value: boolean) {
    super();
  }

  toJs() {
    return this.toJSON();
  }

  toJSON() {
    return this.value;
  }

  toString() {
    return `${this.value}`;
  }

  negate() {
    this.value = !this.value;
    return this;
  }

  equalTo(other: Value): boolean {
    return other.type === this.type && this.value === other.value;
  }

  isTruthy() {
    return this.value;
  }
}

export class NumericValue extends BaseValue {
  type = 'numeric' as const;

  constructor(public value: number, public unit: string | null = null) {
    super();
    this.unit = unit?.toLowerCase() ?? null;
  }

  static compatible(a: NumericValue, b: NumericValue) {
    if (a.unit && b.unit) {
      if (a.unit === b.unit) return true;
      if (!(b.unit in conversions)) return false;
      if (!(a.unit in conversions[b.unit])) return false;
    }

    return true;
  }

  toJs() {
    return this.toJSON();
  }

  toJSON() {
    return this.value;
  }

  toString() {
    return `${this.value}${this.unit || ''}`;
  }

  equalTo(other: Value) {
    return (
      other.type === this.type && other.convert(this.unit).value === this.value
    );
  }

  isCompatible(other: NumericValue) {
    return NumericValue.compatible(this, other);
  }

  convert(toUnit: string | null, precision = 5) {
    if (!toUnit || this.unit === toUnit)
      return new NumericValue(this.value, this.unit);

    const targetNormal = toUnit.toLowerCase();
    if (!this.unit) {
      return new NumericValue(this.value, targetNormal);
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

    return new NumericValue(converted, toUnit);
  }
}

// -----
// Lists
// ----------------------------------------

const listItemNeedsParens = (item: Value, sep: Separator) => {
  if (item.type === 'list') {
    if (item.length < 2 || item.brackets) return false;
    return (
      SEPARATOR_PRECEDENCE[sep] <= SEPARATOR_PRECEDENCE[item.separator || ' ']
    );
  }
  return false;
};

export function stringifyList(elements: Value[], separator?: Separator) {
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

abstract class BaseList<T extends Value = Value>
  extends Array<T>
  implements BaseValue {
  abstract type: 'list' | 'arglist';

  constructor(
    elements?: T[],
    public readonly separator?: Separator,
    public readonly brackets = false,
  ) {
    super(elements?.length || 0);

    if (elements) {
      for (let i = 0; i < elements.length; i++) this[i] = elements[i];
    }
  }

  get first() {
    return this[0];
  }

  get last() {
    return this[this.length - 1];
  }

  indexOf(value: T) {
    return this.findIndex((i) => i.equalTo(value));
  }

  includes(value: T) {
    const idx = this.indexOf(value);
    return idx !== -1;
  }

  isTruthy() {
    return true;
  }

  equalTo(list: Value): boolean {
    return (
      this.type === list.type &&
      this.separator === list.separator &&
      this.brackets === list.brackets &&
      this.length === list.length &&
      this.every((item, idx) => item.equalTo(list[idx] as any))
    );
  }

  toString(): string {
    return stringifyList(this, this.separator);
  }

  toArray() {
    return this;
  }

  toJs(): any[] {
    return this.map((value) => value.toJs());
  }

  toJSON(): any[] {
    return this.map((value) => value.toJSON());
  }

  assertType<T extends VALUE_TYPE>(
    type: T,
    title?: string,
  ): Extract<Value, { type: T }> {
    assertType(this as Value, type, title);
    return this as any;
  }

  // hashCode() {
  //   // Jenkins's one-at-a-time hash function.
  //   let hash = 0;
  //   for (let i = 0; i < this.length; i++) {
  //     const c = this[i].hashCode();
  //     hash = (hash + c) & 2147483647;
  //     hash = (hash + (hash << 10)) & 2147483647;
  //     hash ^= hash >> 6;
  //   }
  //   hash = (hash + (hash << 3)) & 2147483647;
  //   hash ^= hash >> 11;
  //   hash = (hash + (hash << 15)) & 2147483647;
  //   return hash;
  // }
}

export class ListValue<T extends Value = Value> extends BaseList<T> {
  type = 'list' as const;
}

export class ArgumentListValue<T extends Value = Value> extends BaseList<T> {
  type = 'arglist' as const;

  constructor(
    elements: T[],
    public keywords: Record<string, T> = Object.create(null),
  ) {
    super(elements, ',', false);
  }

  // equalTo(list: Value): boolean {
  //   return (
  //     super.equalTo(list) &&
  //     this.keywords.equalTo((list as ArgumentListValue).keywords)
  //   );
  // }
}

export class MapValue<K extends Value = Value, V extends Value = Value>
  extends Map<K, V>
  implements BaseValue {
  type = 'map' as const;

  toJs() {
    const map = new Map();
    for (const [key, value] of this.entries()) {
      map.set(key.toJs(), value.toJs());
    }
    return map;
  }

  toJSON(): Record<string, unknown> {
    return Object.fromEntries(
      // key is toJSON also so strings don't contain extra quotes
      Array.from(this.entries(), ([k, v]) => [k.toJSON(), v.toJSON()]),
    );
  }

  toArray() {
    let i = 0;
    const list = new Array(this.size) as ListValue<K | V>[];
    for (const entry of this) {
      list[i++] = new ListValue<K | V>(entry);
    }
    return list;
  }

  equalTo(other: Value): boolean {
    const otherArray = other.toArray();
    return (
      this.type === other.type &&
      this.size === other.size &&
      this.toArray().every((item, idx) => item.equalTo(otherArray[idx]))
    );
  }

  set(key: K, value: V) {
    return super.set(this.getKey(key) || key, value);
  }

  get(key: K) {
    const k = this.getKey(key);
    return k && super.get(k);
  }

  has(key: K) {
    return !!this.getKey(key);
  }

  private getKey(key: K) {
    for (const k of this.keys()) {
      if (k.type === key.type && k.equalTo(key)) {
        return k;
      }
    }
    return undefined;
  }

  isTruthy() {
    return true;
  }

  assertType<T extends VALUE_TYPE>(
    type: T,
    title?: string,
  ): Extract<Value, { type: T }> {
    assertType(this as Value, type, title);
    return this as any;
  }

  //   hashCode() {
  //     let t1, hash, key;

  //     for (const [key, value ] of this) {
  //       hash = hash + 3 * key.hashCode() + 7 * J.get$hashCode$(map.$index(0, key)) & 2147483647;
  //     }

  //     hash = hash + (hash << 3 >>> 0) & 2147483647;
  //     hash ^= hash >>> 11;
  //     return hash + (hash << 15 >>> 0) & 2147483647;
  //   }
}

export abstract class CallableValue extends BaseValue {}

export class FunctionValue extends CallableValue {
  type = 'function' as const;

  constructor(
    public callee: string,
    public args: ArgumentListValue = new ArgumentListValue([]),
  ) {
    super();
  }

  get isVar() {
    return (
      this.callee === 'var' &&
      this.args[0]?.type === 'string' &&
      this.args[0]?.isCustomProperty
    );
  }

  toString(): string {
    return `${this.callee}(${this.args})`;
  }
}

export type VarFunctionCall = StringValue & { isVarCall: true };

export type MathValue = NumericValue | MathFunctionValue | VarFunctionCall;

export type MathExpression = MathValue | BinaryMathExpression;

export class BinaryMathExpression {
  type = 'binary-expression' as const;

  constructor(
    public left: MathExpression,
    public operator: Operators,
    public right: MathExpression,
  ) {}

  toString(): string {
    // mostly duplicated from BinaryExpression
    const leftStr = this.left.toString();
    const leftNeedsParens =
      this.left.type === 'binary-expression' &&
      OPERATOR_PRECEDENCE[this.left.operator] <
        OPERATOR_PRECEDENCE[this.operator];

    const left = leftNeedsParens ? `(${leftStr})` : leftStr;

    const rightStr = this.right.toString();
    const rightNeedsParens =
      this.right.type === 'binary-expression' &&
      OPERATOR_PRECEDENCE[this.right.operator] <=
        OPERATOR_PRECEDENCE[this.operator];

    const right = rightNeedsParens ? `(${rightStr})` : rightStr;

    return `${left} ${this.operator.toString()} ${right}`;
  }
}

// const isPlainArray = <T>(value: any | T[]): value is T[] =>
//   !(value instanceof BaseValue) && Array.isArray(value);
let MATH_FUNCTION_CONTEXT = false;

export class MathFunctionValue extends CallableValue {
  type = 'math-function' as const;

  public args: MathExpression[];

  constructor(
    public callee: 'calc' | 'clamp' | 'min' | 'max',
    args: MaybeArray<MathExpression>,
  ) {
    super();

    // unwrap nested calcs
    // removes unneeded parens around calc expressions, should have a better method than this tho
    this.args = toArray(args).map((p) => (isCalcValue(p) ? p.args[0] : p));
  }

  toString(withContext?: boolean): string {
    if (withContext != null) MATH_FUNCTION_CONTEXT = withContext;

    if (MATH_FUNCTION_CONTEXT && this.callee === 'calc') {
      return `(${this.args[0]})`;
    }

    try {
      MATH_FUNCTION_CONTEXT = true;
      return `${this.callee}(${stringifyList(this.args as any, ',')})`;
    } finally {
      MATH_FUNCTION_CONTEXT = false;
    }
  }
}

// ---
// Color
// ------------

type ColorSpace = 'srgb' | 'lab';
type ColorModel = 'rgb' | 'hsl' | 'hwb' | 'lab' | 'lch';

type Convert = typeof Convert;

interface ChannelMap {
  rgb: RgbChannels;
  hsl: HslChannels;
  hwb: HwbChannels;
  lab: LabChannels;
  lch: LchChannels;
}

export type AnyColorValue = ColorValue<any>;

function isSameColorModel<T extends ColorModel>(
  model: T,
  color: ColorValue<any>,
): color is ColorValue<T> {
  return color.model === model;
}

function convertColorModel(
  channels: number[],
  from: ColorModel,
  to: ColorModel,
): number[] {
  const convert = Convert[from] as any;
  if (from === to) return [...channels];
  if (to in convert) {
    return convert[to](channels);
  }
  throw new Error(`Cannot convert from ${from} to ${to}`);
}

abstract class ColorValue<TColorModel extends ColorModel> extends BaseValue {
  type = 'color' as const;

  private _alpha = 1;

  public readonly model: TColorModel;

  abstract readonly space: ColorSpace;

  protected channels: ChannelMap[TColorModel];

  constructor(
    ns: TColorModel,
    channels: ChannelMap[TColorModel] | AnyColorValue,
    alpha?: number,
  ) {
    super();

    this.model = ns;

    if (channels instanceof ColorValue) {
      const other = channels;
      if (isSameColorModel(ns, other)) {
        this.channels = other.toChannels();
      } else {
        const convert = Convert[other.model as ColorModel] as any;

        if (!(ns in convert)) {
          throw new TypeError(`Cannot convert ${other.model} to ${ns}`);
        }
        this.channels = convert[ns](other.toChannels());
      }

      this.alpha = alpha ?? channels.alpha;
    } else {
      this.channels = channels;
      this.alpha = alpha ?? 1;
    }
  }

  get alpha() {
    return this._alpha;
  }

  set alpha(value: number) {
    this._alpha = clamp(value, 0, 1);
  }

  toChannels() {
    return [...this.channels] as ChannelMap[TColorModel];
  }

  equalTo(other: Value) {
    if (other.type !== 'color') return false;

    const otherChannels =
      this.model === other.model
        ? other.toChannels()
        : convertColorModel(other.toChannels(), other.model, this.model);

    return (
      other.alpha === this.alpha &&
      otherChannels.every((c, i) => this.channels[i] === c)
    );
  }

  abstract clone(): ColorValue<any>;
}

const toHex = (value: number) =>
  `${value < 16 ? '0' : ''}${value.toString(16)}`;

const splitAlpha = (hex: string): [string, number] => {
  if (hex.length === 4) {
    return [hex.slice(0, 3), parseInt(hex[4] + hex[4], 16)];
  }
  if (hex.length === 8) {
    return [hex.slice(0, 6), parseInt(hex.slice(-2), 16)];
  }
  return [hex.slice(0, 6), 1];
};

export class RgbValue extends ColorValue<'rgb'> {
  private originalValue?: string;

  space: 'srgb';

  constructor(color: RgbChannels | string | AnyColorValue, alpha?: number) {
    let originalValue: string | undefined;
    if (typeof color === 'string') {
      originalValue = color;
      if (color.startsWith('#')) {
        [color, alpha] = splitAlpha(color);
        color = Convert.hex.rgb(color);
      } else if (color in colorNames) {
        color = Convert.keyword.rgb(color as KEYWORD);
      } else if (color === 'transparent') {
        color = [0, 0, 0];
        alpha = 0;
      } else {
        throw new TypeError(`Invalid string color: ${color}`);
      }
    }

    super('rgb', color, alpha);

    this.space = 'srgb';
    this.originalValue = originalValue;
  }

  get r() {
    return this.channels[0];
  }

  set r(value: number) {
    this.channels[0] = clamp(value, 0, 255);
  }

  get g() {
    return this.channels[1];
  }

  set g(value: number) {
    this.channels[1] = clamp(value, 0, 255);
  }

  get b() {
    return this.channels[2];
  }

  set b(value: number) {
    this.channels[2] = clamp(value, 0, 255);
  }

  clone() {
    return new RgbValue(this);
  }

  toString(format: 'rgb' | 'hex' = 'rgb') {
    if (this.originalValue) return this.originalValue;

    if (format === 'hex') {
      let str = `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`;
      if (this.alpha !== 1) str += toHex(this.alpha * 255).substring(0, 2);
      return str;
    }

    return this.alpha === 1
      ? `rgb(${this.r}, ${this.g}, ${this.b})`
      : `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha})`;
  }
}

export class HslValue extends ColorValue<'hsl'> {
  space: 'srgb' = 'srgb';

  constructor(color: HslChannels | AnyColorValue, alpha?: number) {
    super('hsl', color, alpha);
  }

  get h() {
    return this.channels[0];
  }

  set h(value: number) {
    this.channels[0] = clamp(value, 0, 360);
  }

  get s() {
    return this.channels[1];
  }

  set s(value: number) {
    this.channels[1] = clamp(value, 0, 100);
  }

  get l() {
    return this.channels[2];
  }

  set l(value: number) {
    this.channels[2] = clamp(value, 0, 100);
  }

  toParts() {
    return [this.h, this.s, this.l] as const;
  }

  toString() {
    return this.alpha === 1
      ? `hsl(${this.h}, ${this.s}%, ${this.l}%)`
      : `hsla(${this.h}, ${this.s}%, ${this.l}%, ${this.alpha})`;
  }

  clone() {
    return new HslValue(this);
  }
}

export class HwbValue extends ColorValue<'hwb'> {
  space: 'srgb' = 'srgb';

  constructor(color: HwbChannels | AnyColorValue, alpha?: number) {
    super('hwb', color, alpha);
  }

  get h() {
    return this.channels[0];
  }

  set h(value: number) {
    this.channels[0] = clamp(value, 0, 360);
  }

  get w() {
    return this.channels[1];
  }

  set w(value: number) {
    this.channels[1] = clamp(value, 0, 100);
  }

  get b() {
    return this.channels[2];
  }

  set b(value: number) {
    this.channels[2] = clamp(value, 0, 100);
  }

  toString() {
    return `hwb(${this.h}, ${this.w}%, ${this.b}%, ${this.alpha})`;
  }

  clone() {
    return new HwbValue(this);
  }
}

export class LabValue extends ColorValue<'lab'> {
  space = 'lab' as const;

  constructor(color: LabChannels | AnyColorValue, alpha?: number) {
    super('lab', color, alpha);
  }

  get l() {
    return this.channels[0];
  }

  set l(value: number) {
    this.channels[0] = clamp(value, 0, 360);
  }

  get a() {
    return this.channels[1];
  }

  set a(value: number) {
    this.channels[1] = clamp(value, 0, 100);
  }

  get b() {
    return this.channels[2];
  }

  set b(value: number) {
    this.channels[2] = clamp(value, 0, 100);
  }

  toString() {
    return `lab(${this.l}, ${this.a}, ${this.b}, ${this.alpha})`;
  }

  clone() {
    return new LabValue(this);
  }
}

export class LchValue extends ColorValue<'lch'> {
  space = 'lab' as const;

  constructor(color: LchChannels | AnyColorValue, alpha?: number) {
    super('lch', color, alpha);
  }

  get l() {
    return this.channels[0];
  }

  set l(value: number) {
    this.channels[0] = clamp(value, 0, 360);
  }

  get c() {
    return this.channels[1];
  }

  set c(value: number) {
    this.channels[1] = clamp(value, 0, 100);
  }

  get h() {
    return this.channels[2];
  }

  set h(value: number) {
    this.channels[2] = clamp(value, 0, 100);
  }

  toString() {
    return `lch(${this.l}, ${this.c}, ${this.h}, ${this.alpha})`;
  }

  clone() {
    return new LchValue(this);
  }
}

export type ColorValues = RgbValue | HslValue | HwbValue | LabValue | LchValue;
