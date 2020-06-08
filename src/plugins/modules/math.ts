import * as Ast from '../../parsers/Ast';
import * as math from '../../parsers/math';

export const PI = new Ast.Numeric(Math.PI);

export const round = (num: Ast.Numeric) => {
  return new Ast.Numeric(Math.round(num.value), num.unit);
};

export const add = (a: Ast.Numeric, b: Ast.Numeric) => {
  return math.add(a, b, true);
};

export const subtract = (a: Ast.Numeric, b: Ast.Numeric) => {
  return math.subtract(a, b, true);
};

export const multiply = (a: Ast.Numeric, b: Ast.Numeric) => {
  return math.multiply(a, b, true);
};

export const divide = (a: Ast.Numeric, b: Ast.Numeric) => {
  return math.divide(a, b, true);
};
