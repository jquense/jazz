import { NumericValue } from '../Values';
import * as math from '../utils/Math';

export const PI = new NumericValue(Math.PI);

export const round = ($number: NumericValue) => {
  return new NumericValue(Math.round($number.value), $number.unit);
};

export const add = ($a: NumericValue, $b: NumericValue) => {
  return math.add($a, $b, true);
};

export const subtract = ($a: NumericValue, $b: NumericValue) => {
  return math.subtract($a, $b, true);
};

export const multiply = ($a: NumericValue, $b: NumericValue) => {
  return math.multiply($a, $b, true);
};

export const divide = ($a: NumericValue, $b: NumericValue) => {
  return math.divide($a, $b, true);
};

export const min = (...$numbers: NumericValue[]) => {
  return math.min($numbers, true);
};

export const max = (...$numbers: NumericValue[]) => {
  return math.max($numbers, true);
};
