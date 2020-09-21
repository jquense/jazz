import { create } from './Callable';
import {
  AnyColorValue,
  ArgumentListValue,
  HslValue,
  MathValue,
  RgbValue,
  Value,
  assertType,
} from './Values';
import * as math from './utils/Math';

// -- Math
// -----------

export const min = create('min', (...$numbers: MathValue[]) =>
  math.min($numbers, false),
);

export const max = create('max', (...$numbers: MathValue[]) =>
  math.max($numbers, false),
);

export const clamp = create(
  'clamp',
  ($min: MathValue, $number: MathValue, $max: MathValue) =>
    math.clamp([$min, $number, $max], false),
);

// -- Colors
// -----------

const assertArg = <T extends Value>(value: T | undefined, name: string) => {
  if (value == null) throw new SyntaxError(`Missing argument $${name}.`);
};

function normalizeSlashList(rest: ArgumentListValue) {
  const { first } = rest;
  if (!first || first.type !== 'list') return rest;

  if (first.separator === '/' && first[0].type === 'list') {
    return new ArgumentListValue([...first[0]], { alpha: first[1] });
  }

  return new ArgumentListValue([...first]);
}

function toAlphaValue(value?: Value) {
  if (!value) return undefined;

  assertType(value, 'numeric');

  let num = value.value;
  if (value.unit) {
    if (value.unit !== '%')
      throw new Error(
        `Invalid opacity value ${value}. Expected a decimal between 0 and 1 or a percent`,
      );
    num /= 100;
  } else if (num < 0 || num > 1) {
    throw new Error(
      `Invalid opacity value ${value}. Expected a decimal between 0 and 1 or a percent`,
    );
  }

  return num;
}

type Channels = [number, number, number];

function validateArgs(
  pattern: string[],
  args: ArgumentListValue,
  fn: (v: Value) => number,
): [Channels | AnyColorValue, number | undefined] {
  args = normalizeSlashList(args);
  let result: Channels | AnyColorValue;

  if (args.length === 1) {
    assertType(args[0], 'color');
    result = args[0];
  } else {
    result = new Array<number>(pattern.length) as Channels;

    for (let i = 0; i < pattern.length; i++) {
      const value = args[i] || args.keywords[pattern[i]];
      assertArg(value!, pattern[i]);
      result[i] = fn(value);
    }
  }
  return [result, toAlphaValue(args[pattern.length] || args.keywords.alpha)];
}

function toRGBValue(value: Value) {
  assertType(value, 'numeric');

  let num = value.value;
  if (value.unit === '%') num = Math.round((num / 100) * 255);
  return num;
}

const rgbArgs = ['red', 'green', 'blue'];

function rgbaImpl({ args }: { args: ArgumentListValue }) {
  const [channels, alpha] = validateArgs(rgbArgs, args, toRGBValue);

  return new RgbValue(channels, alpha);
}

export const rgb = create('rgb', '$args...', rgbaImpl);
export const rgba = create('rgba', '$args...', rgbaImpl);

function toHSLValue(value: Value) {
  return value.assertType('numeric').value;
}

const hslArgs = ['hue', 'saturation', 'lightness'];

function hslaImpl({ args }: { args: ArgumentListValue }) {
  const [channels, alpha] = validateArgs(hslArgs, args, toHSLValue);

  return new HslValue(channels, alpha);
}

export const hsl = create('hsl', '$args...', hslaImpl);
export const hsla = create('hsla', '$args...', hslaImpl);
