import * as Ast from './Ast';
import type { Callable } from './Callable';
import type Scope from './Scope';
import type { MixinCallable } from './UserDefinedCallable';
import type { Value } from './Values';

export type VariableMember = {
  type: 'variable';
  identifier: string;
  source?: string;
  node: Value;
};

export type ClassReferenceMember = {
  type: 'class';
  source?: string;
  identifier: string;
  selector: Ast.ClassSelector;
  composes: Ast.ClassSelector[];
};

export type FunctionMember = {
  type: 'function';
  identifier: string;
  source?: string;
  callable: Callable;
  node?: Ast.CallableDeclaration;
  scope?: Scope;
};

export type MixinMember = {
  type: 'mixin';
  source?: string;
  callable: MixinCallable;
};

export type Content = {
  type: 'mixin';
  source?: string;
  node: Ast.CallableDeclaration;
};

export type Member =
  | VariableMember
  | ClassReferenceMember
  | FunctionMember
  | MixinMember;

type Identifier = Ast.Ident | Ast.Variable | Ast.ClassReference;

export function serializeClassMember(member: ClassReferenceMember): string {
  return [
    String(member.selector.name),
    ...member.composes.map((c) => String(c.name)),
  ].join(' ');
}

export default class ModuleMembers extends Map<string, Member> {
  addAll(members: ModuleMembers, source?: string) {
    for (const [key, item] of members) this.set(key, { ...item, source });
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
        json[member.identifier] = serializeClassMember(member);
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
          `${indent}${member.identifier}: ${serializeClassMember(member)}`,
        );
      else if (member.type === 'variable') {
        css.push(`${indent}$${member.identifier}: ${member.node};`);
      }
    }
    return css;
  }
}
