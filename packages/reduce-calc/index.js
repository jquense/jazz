import Expression from 'jazzcss/lib/Expression';
import Scope from 'jazzcss/lib/Scope';
import * as globals from 'jazzcss/lib/builtins';
import Parser from 'jazzcss/lib/parsers';

export default function reduceCalc(calc) {
  const scope = new Scope();
  scope.setFunction('min', globals.min);
  scope.setFunction('max', globals.max);
  scope.setFunction('clamp', globals.clamp);

  const expr = new Expression({ scope });
  const parser = new Parser();

  const ast = parser.expression(calc);

  const value = ast.accept(expr);

  return value.toString();
}
