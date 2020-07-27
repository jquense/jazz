/* eslint-disable @typescript-eslint/no-var-requires */

import * as Ast from '../Ast';
import * as Interop from '../Interop';
import ModuleMembers from '../ModuleMembers';

export const isBuiltin = (source: string) =>
  source === 'color' ||
  source === 'math' ||
  source === 'string' ||
  source === 'meta';

export const getMembers = (mod: Record<string, any>) => {
  const members = new ModuleMembers();

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('_')) continue;

    if (value instanceof Interop.Callable) {
      members.set(name, { type: 'function', callable: value });
    } else if (typeof value === 'function') {
      members.set(value.name, {
        type: 'function',
        callable: Interop.Callable.fromFunction(value.name, value),
      });
    } else {
      members.set(new Ast.Variable(name), {
        type: 'variable',
        node: Interop.fromJs(value),
      });
    }
  }

  return members;
};

export const loadBuiltIn = (file: string) => {
  const module = require(`./${file}`);

  return getMembers(module);
};
