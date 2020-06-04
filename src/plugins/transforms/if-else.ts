import type { AtRule } from 'postcss';
import { list } from 'postcss';

export default function transformmAtIf(rule: AtRule) {
  const [left, opertator, rule] = list.space(rule.params);
}
