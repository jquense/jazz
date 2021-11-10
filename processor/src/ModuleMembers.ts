import cssesc from 'cssesc';

import * as Ast from './Ast';
import type { Callable } from './Callable';
import type Scope from './Scope';
import type { MixinCallable } from './UserDefinedCallable';
import type { Value } from './Values';
import { Module } from './types';

// export type Content = {
//   type: 'mixin';
//   node: Ast.CallableDeclaration;
// };

export type From = {
  request: string;
  original?: Ast.Node;
  module: Module;
};

export type ValueMember = {
  type: 'value';
  identifier: string;
  source?: string;
  from?: From;
  node: Value;
};

export type VariableMember = {
  type: 'variable';
  identifier: string;
  source?: string;
  from?: From;
  node: Value;
};

export type ClassReferenceMember = {
  type: 'class';
  source?: string;
  from?: From;
  identifier: string;
  selector: Ast.ClassSelector;
  composes: Ast.ClassSelector[];
};

export type FunctionMember = {
  type: 'function';
  identifier: string;
  source?: string;
  from?: From;
  callable: Callable;
  node?: Ast.CallableDeclaration;
  scope?: Scope;
};

export type MixinMember = {
  type: 'mixin';
  source?: string;
  from?: From;
  callable: MixinCallable;
};

export type Member =
  | ValueMember
  | VariableMember
  | ClassReferenceMember
  | FunctionMember
  | MixinMember;

type Identifier = Ast.Ident | Ast.Variable | Ast.ClassReference;

export function deserializeClassMember(
  string: string,
  identifier: string,
): ClassReferenceMember {
  const [selector, ...composes] = string
    .split(' ')
    .map((cls) => new Ast.ClassSelector(new Ast.Ident(cls)));

  return {
    type: 'class',
    identifier,
    selector,
    composes,
  };
}

export const unescape = (str: string) => str.replace(/\\:/g, ':');

export function serializeClassMember(member: ClassReferenceMember): string {
  return [
    cssesc(String(member.selector.name), { isIdentifier: true }),
    ...member.composes.map((c) =>
      cssesc(String(c.name), { isIdentifier: true }),
    ),
  ].join(' ');
}

export default class ModuleMembers extends Map<string, Member> {
  addAll(members: ModuleMembers, from?: From) {
    for (const [key, item] of members)
      this.set(key, { ...item, from: from || item.from });
  }

  *entries() {
    yield* super.entries();
  }

  get(key: string | Identifier) {
    return super.get(`${key}`);
  }

  set(key: string | Identifier, member: Member) {
    return super.set(`${key}`, member);
  }

  toJSON() {
    const json: Record<string, string> = {};

    for (const member of this.values()) {
      if (member.type === 'class')
        json[member.identifier] = unescape(serializeClassMember(member));
      else if (member.type === 'variable') {
        json[`$${member.identifier}`] = member.node.toJSON();
      }
    }

    return json;
  }

  toCSS(indent = '') {
    const css: string[] = [];

    for (const member of this.values()) {
      if (member.type === 'class')
        css.push(
          `${indent}${member.identifier}: ${serializeClassMember(member)};`,
        );
      else if (member.type === 'variable') {
        css.push(`${indent}$${member.identifier}: ${member.node};`);
      }
    }
    return css;
  }
}
