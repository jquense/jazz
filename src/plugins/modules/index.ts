/* eslint-disable @typescript-eslint/no-var-requires */

import * as Interop from '../../utils/Interop';
import Scope from '../../utils/Scope';

export const isBuiltin = (source: string) =>
  source === 'color' || source === 'math';

export const moduleToScope = (mod: Record<string, any>) => {
  const scope = new Scope();

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('_')) continue;

    if (typeof value === 'function') {
      scope.setFunction(name, value);
    } else {
      scope.setVariable(name, Interop.fromJs(value));
    }
  }

  return scope;
};

export const loadBuiltIn = (file: string) => {
  const module = require(`./${file}`);

  return moduleToScope(module);
};
