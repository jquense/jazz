import { Root } from 'postcss';

import * as Ast from './Ast';
import type { Callable } from './Interop';
import ModuleMembers, { Member } from './ModuleMembers';
import type { Value } from './Values';

export {
  VariableMember,
  ClassReferenceMember,
  FunctionMember,
  MixinMember,
  Content,
  Member,
} from './ModuleMembers';

type Identifier = Ast.Ident | Ast.Variable | Ast.ClassReference;

export default class Scope {
  readonly members = new ModuleMembers();

  parent: Scope | null = null;

  private _rule: Ast.Rule | null = null;

  private _content: Root | null = null;

  readonly closure: boolean;

  constructor(opts: { members?: ModuleMembers; closure?: boolean } = {}) {
    this.closure = opts.closure ?? true;

    if (opts) {
      this.members = opts.members ?? new ModuleMembers();
    }
  }

  get contentBlock() {
    return this._content || this.parent?._content || null;
  }

  set contentBlock(content: Root | null) {
    this._content = content;
  }

  get currentRule() {
    return this._rule || this.parent?.currentRule || null;
  }

  set currentRule(rule: Ast.Rule | null) {
    this._rule = rule;
  }

  createChildScope(closure = true) {
    const inner = new Scope({ closure });
    inner.parent = this;
    return inner;
  }

  close() {
    const { parent } = this;
    this.parent = null;
    return parent;
  }

  addAll(members: ModuleMembers, namespace?: string) {
    for (const [key, value] of members) {
      this.set(namespace ? `${namespace}.${key}` : key, { ...value });
    }

    return this;
  }

  getAll<T extends Member['type']>(type: T): Array<Member & { type: T }> {
    const result = this.parent?.getAll<T>(type) || [];

    for (const item of this.members.values()) {
      if (item.type === type) result.push(item as any);
    }

    return result;
  }

  getWithScope(ident: Identifier): [Member, Scope] | [null, null] {
    const member = this.members.get(ident.toString());

    return (
      (member ? [member, this] : this.parent?.getWithScope(ident)) || [
        null,
        null,
      ]
    );
  }

  get(ident: Identifier | string): Member | undefined {
    return this.members.get(ident) ?? this.parent?.get(ident);
  }

  getVariable(ident: Ast.Variable | string) {
    const member = this.get(ident);
    return member?.type === 'variable' ? member : undefined;
  }

  getClassReference(ident: Ast.ClassReference | string) {
    const member = this.get(ident);
    return member?.type === 'class' ? member : undefined;
  }

  getFunction(ident: Ast.Ident | string) {
    const member = this.get(ident);
    return member?.type === 'function' ? member : undefined;
  }

  getMixin(ident: Ast.Ident | string) {
    const member = this.get(ident);
    return member?.type === 'mixin' ? member : undefined;
  }

  set(ident: Identifier | string, member: Member, _force = false) {
    const name = String(ident);

    if (this.closure || _force) {
      this.members.set(name, member);
      return;
    }

    if (this.parent) {
      this.parent.set(ident, member);
      return;
    }

    throw new Error('No appropriate environment found');
  }

  setVariable(name: Ast.Variable | string, node: Value, _force?: boolean) {
    const ident = typeof name === 'string' ? new Ast.Variable(name) : name;
    return this.set(
      ident,
      {
        type: 'variable',
        identifier: `${ident.name}`,
        node,
      },
      _force,
    );
  }

  // setClassReference(
  //   name: Ast.ClassReference,
  //   node: StringValue,
  //   _force?: boolean,
  // ) {
  //   return this.set(name, { type: 'class', node }, _force);
  // }

  setFunction(name: string, callable: Callable) {
    return this.set(new Ast.Ident(name), {
      type: 'function',
      identifier: name,
      callable,
    });
  }

  setMixin(name: string, node: Ast.MixinAtRule) {
    return this.set(new Ast.Ident(name), { type: 'mixin', node });
  }
}
