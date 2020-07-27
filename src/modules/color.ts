import { Callable } from '../Interop';
import {
  ArgumentListValue,
  HslValue,
  LchValue,
  NumericValue,
  RgbValue,
  Value,
  assertType,
} from '../Values';
import { keys, remove, toMap } from '../utils/Utils';

export function red($color: Value) {
  assertType($color, 'color');

  return new NumericValue(new RgbValue($color).r);
}

export function green($color: Value) {
  assertType($color, 'color');

  return new NumericValue(new RgbValue($color).g);
}

export function blue($color: Value) {
  assertType($color, 'color');
  return new NumericValue(new RgbValue($color).b);
}

export function alpha($color: Value) {
  assertType($color, 'color');

  return new NumericValue($color.alpha);
}

export function hue($color: Value) {
  assertType($color, 'color');

  return new NumericValue(
    $color.space === 'srgb' ? new HslValue($color).h : new LchValue($color).h,
  );
}

export function saturation($color: Value) {
  assertType($color, 'color');

  return new NumericValue(new HslValue($color).s, '%');
}

export function lightness($color: Value) {
  assertType($color, 'color');
  return new NumericValue(new HslValue($color).l, '%');
}

type AdjustParams = { color: Value; kwargs: ArgumentListValue };

export const adjust = Callable.create(
  'adjust',
  `$color, $kwargs...`,
  ({ color, kwargs }: AdjustParams) => {
    if (kwargs.length)
      throw new TypeError(
        `Only one positional argument, "$color", is allowed. All other arguments must be passed by name.`,
      );

    assertType(color, 'color');

    const keywords = toMap(kwargs.keywords);

    function pluck(arg: string, min: number, max: number) {
      const num = remove(keywords, arg)?.assertType('numeric').value;
      if (num == null) return null;
      if (num < min || num > max) {
        throw new TypeError(
          `Argument ${arg} must between between ${min} and ${max}`,
        );
      }
      return num;
    }

    const opacity = pluck('alpha', -1, 1) || 1;

    const r = pluck('red', -255, 255);
    const g = pluck('green', -255, 255);
    const b = pluck('blue', -255, 255);

    const h = remove(keywords, 'hue')?.assertType('numeric').value;
    const s = pluck('saturation', -100, 100);
    const l = pluck('lightness', -100, 100);

    if (keywords.size)
      throw new TypeError(
        `Unknown keyword argument(s): ${keys(keywords).join(',')}`,
      );

    const hasHsl = h != null || s != null || l != null;

    if (r != null || g != null || b != null) {
      if (hasHsl) throw new TypeError(`Cannot mix arguments for RGB and HSL`);

      const next = new RgbValue(color);

      if (r != null) next.r += r;
      if (g != null) next.g += g;
      if (b != null) next.b += b;
      if (opacity != null) next.alpha += opacity;

      return next;
    }
    if (hasHsl) {
      const next = new HslValue(color);

      if (h != null) next.h += h;
      if (s != null) next.s += s;
      if (l != null) next.l += l;

      if (opacity != null) next.alpha += opacity;

      return next;
    }

    if (opacity != null) {
      const next = color.clone();
      next.alpha += opacity;
      return next;
    }

    return color;
  },
);
