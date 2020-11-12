/* eslint-disable @typescript-eslint/no-var-requires */

import * as Ast from '../Ast';
import * as Callable from '../Callable';
import { fromJs } from '../Interop';
import ModuleMembers from '../ModuleMembers';
import Scope from '../Scope';
import * as globals from '../builtins';

export function createRootScope() {
  const scope = new Scope({ closure: true });
  scope.setFunction('min', globals.min);
  scope.setFunction('max', globals.max);
  scope.setFunction('clamp', globals.clamp);

  scope.setFunction('rgb', globals.rgb);
  scope.setFunction('rgba', globals.rgba);

  scope.setFunction('hsl', globals.hsl);
  scope.setFunction('hsla', globals.hsla);
  return scope;
}

export const isBuiltin = (source: string) =>
  source === 'color' ||
  source === 'math' ||
  source === 'string' ||
  source === 'list' ||
  source === 'meta';

export const getMembers = (mod: Record<string, unknown>) => {
  const members = new ModuleMembers();

  for (const [name, value] of Object.entries(mod)) {
    if (name.startsWith('_')) continue;

    if (typeof value === 'function') {
      members.set(value.name, {
        type: 'function',
        identifier: value.name,
        callable: Callable.create(value as any),
      });
    } else {
      members.set(new Ast.Variable(name), {
        type: 'variable',
        identifier: name,
        node: fromJs(value),
      });
    }
  }

  return members;
};

export const loadBuiltIn = (file: string) => {
  const module = require(`./${file}`);

  return { exports: getMembers(module), type: 'jazzscript' as const };
};
