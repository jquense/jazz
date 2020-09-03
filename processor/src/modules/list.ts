import { Value, StringValue, ListValue } from '../Values';
import { List } from '../Ast';

const AUTO = new StringValue<'auto'>('auto');

export type ListSeparatorValue =
  | StringValue<' '>
  | StringValue<','>
  | StringValue<'/'>;

export function length(list: Value, item: Value) {
  return list.assertType('list').includes(item);
}

export function nth(list: Value, index: Value) {
  return list.assertType('list')[index.assertType('numeric').value];
}

export function index(list: Value, item: Value) {
  return list.assertType('list').indexOf(item);
}

export function contains(list: Value, item: Value) {
  return list.assertType('list').includes(item);
}

export function separator(list: ListValue) {
  return list.assertType('list').separator || ' ';
}

export function append(
  list: ListValue,
  item: Value,
  $separator: StringValue<'auto'> | ListSeparatorValue = AUTO,
) {
  const sep = $separator.value === 'auto' ? separator(list) : $separator.value;

  return new ListValue([...list.assertType('list'), item], sep);
}
