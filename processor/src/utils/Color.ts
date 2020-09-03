/* eslint-disable no-bitwise */
/* eslint-disable no-cond-assign */
/* eslint-disable no-nested-ternary */
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

import { Keys } from '../types';
import colorNames from './color-names';

type Values<T> = T[keyof T];
type ColorFormat = 'rgb' | 'hsl' | 'hwb' | 'lab' | 'lch';

type Convert = typeof Convert;

type Conversions<T extends Values<Convert>> = {
  [P in Keys<T, Function>]: () => ReturnType<T[P]>;
};

interface ChannelMap {
  rgb: RgbChannels;
  hsl: HslChannels;
  hwb: HwbChannels;
  lab: LabChannels;
  lch: LchChannels;
}
type AnyColor = Color<any>;

function isSameColorSpace<T extends ColorFormat>(
  space: T,
  color: Color<any>,
): color is Color<T> {
  return color.space === space;
}

abstract class Color<TFormat extends ColorFormat> {
  private _alpha = 1;

  public readonly space: TFormat;

  protected channels: ChannelMap[TFormat];

  public to: Conversions<Convert[TFormat]>;

  constructor(
    ns: TFormat,
    channels: ChannelMap[TFormat] | AnyColor,
    alpha?: number,
  ) {
    const to: any = {};
    Object.entries(ns).forEach(([key, value]) => {
      if (typeof value === 'function') {
        to[key] = () => value(this.toArray());
      }
    });

    this.to = to;
    this.space = ns;

    if (channels instanceof Color) {
      const other = channels;
      if (isSameColorSpace(ns, other)) {
        this.channels = other.toArray();
      } else {
        if (!(ns in other.to)) {
          throw new TypeError('Cannot convert colors');
        }
        this.channels = other.to[ns]();
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

  toArray() {
    return [...this.channels] as ChannelMap[TFormat];
  }
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

export class Rgb extends Color<'rgb'> {
  constructor(color: RgbChannels | string | AnyColor, alpha?: number) {
    if (typeof color === 'string') {
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

  toString(format: 'rgb' | 'hex' = 'rgb') {
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

export class Hsl extends Color<'hsl'> {
  constructor(color: HslChannels | AnyColor, alpha?: number) {
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
      ? `hsl(${this.h}, ${this.s}, ${this.l})`
      : `hsla(${this.h}, ${this.s}, ${this.l}, ${this.alpha})`;
  }
}

export class Hwb extends Color<'hwb'> {
  constructor(color: HwbChannels | AnyColor, alpha?: number) {
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
    return `hwb(${this.h}, ${this.w}, ${this.b}, ${this.alpha})`;
  }
}

export class Lab extends Color<'lab'> {
  constructor(color: LabChannels | AnyColor, alpha?: number) {
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
}

export class Lch extends Color<'lch'> {
  constructor(color: LchChannels | AnyColor, alpha?: number) {
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
}

export type ColorSpaces = Rgb | Hsl | Hwb | Lab | Lch;
