import ModuleMembers from './ModuleMembers';
import Scope, { Member } from './Scope';
import type { ModuleType } from './types';

export default class Module {
  readonly imports = new ModuleMembers();

  readonly exports = new ModuleMembers();

  private used = new WeakMap<Member, number>();

  constructor(
    public readonly type: ModuleType,
    public readonly scope: Scope,
  ) {}

  refCount(member: Member) {
    this.used.set(member, (this.used.get(member) ?? 0) + 1);
  }
}
