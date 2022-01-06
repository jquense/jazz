const Expression = require('jazzcss/lib/Expression').default;
const Scope = require('jazzcss/lib/Scope').default;
const globals = require('jazzcss/lib/builtins');
const Parser = require('jazzcss/lib/parsers').default;

const parser = new Parser();

module.exports = function reduceCalc(calc) {
  const scope = new Scope();
  scope.setFunction('min', globals.min);
  scope.setFunction('max', globals.max);
  scope.setFunction('clamp', globals.clamp);

  const expr = new Expression({ scope });
  const ast = parser.expression(calc);

  const value = ast.accept(expr);

  return value.toString();
};
