import { create } from './Callable';
import {
  AnyColorValue,
  ArgumentListValue,
  HslValue,
  MathValue,
  RgbValue,
  StringValue,
  Value,
  assertType,
} from './Values';
import { isVarCall } from './utils/Check';
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

interface ColorCtor<T> {
  new (c: Channels | AnyColorValue, a: number | undefined): T;
}

function color<T extends AnyColorValue>(
  name: string,
  pattern: string[],
  args: ArgumentListValue,
  fn: (v: Value) => number,
  Ctor: ColorCtor<T>,
): T | StringValue {
  args = normalizeSlashList(args);
  let result: Channels | AnyColorValue;
  const orderArgs: Value[] = Array(pattern.length);
  const alphaValue = args[pattern.length] || args.keywords.alpha;

  // Check if any of the arguments are var(--custom), if so bail
  //   and return a string of the function call since we can't process it
  let hasVar = !!alphaValue && isVarCall(alphaValue);

  for (let i = 0; i < pattern.length; i++) {
    const value = args[i] || args.keywords[pattern[i]];
    orderArgs[i] = value;

    if (value && !hasVar) {
      hasVar = isVarCall(value);
    }
  }

  if (hasVar) {
    if (alphaValue) orderArgs.push(alphaValue);
    return new StringValue(`${name}(${orderArgs.filter(Boolean).join(', ')})`);
  }

  if (args.length === 1) {
    assertType(args[0], 'color');
    result = args[0];
  } else {
    result = orderArgs.map((arg, i) => {
      assertArg(arg!, pattern[i]);
      return fn(arg);
    }) as Channels;
  }

  return new Ctor(result, toAlphaValue(alphaValue));
}

type Args = { args: ArgumentListValue };

function toRGBValue(value: Value) {
  assertType(value, 'numeric');

  let num = value.value;
  if (value.unit === '%') num = Math.round((num / 100) * 255);
  return num;
}

const rgbArgs = ['red', 'green', 'blue'];

export const rgb = create('rgb', '$args...', ({ args }: Args) =>
  color('rgb', rgbArgs, args, toRGBValue, RgbValue),
);
export const rgba = create('rgba', '$args...', ({ args }: Args) =>
  color('rgba', rgbArgs, args, toRGBValue, RgbValue),
);

function toHSLValue(value: Value) {
  return value.assertType('numeric').value;
}

const hslArgs = ['hue', 'saturation', 'lightness'];

export const hsl = create('hsl', '$args...', ({ args }: Args) =>
  color('hsl', hslArgs, args, toHSLValue, HslValue),
);

export const hsla = create('hsla', '$args...', ({ args }: Args) =>
  color('hsla', hslArgs, args, toHSLValue, HslValue),
);
