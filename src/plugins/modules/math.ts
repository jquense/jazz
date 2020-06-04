import * as Ast from '../../parsers/Ast';

export const PI = new Ast.Numeric(Math.PI);

export const round = (num: Ast.Numeric) => {
  return new Ast.Numeric(Math.round(num.value), num.unit);
};

export const add = (a: Ast.Numeric, b: Ast.Numeric) => {
  return a.add(b);
};

export const subtract = (a: Ast.Numeric, b: Ast.Numeric) => {
  return a.subtract(b);
};

export const multiply = (a: Ast.Numeric, b: Ast.Numeric) => {
  return a.multiply(b);
};

export const divide = (a: Ast.Numeric, b: Ast.Numeric) => {
  return a.divide(b);
};
