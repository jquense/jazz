import { ListValue, NumericValue, StringValue, Value } from '../Values';

const AUTO = new StringValue<'auto'>('auto');

export type ListSeparatorValue =
  | StringValue<' '>
  | StringValue<','>
  | StringValue<'/'>;

export function entries(list: Value) {
  return new ListValue(
    list
      .assertType('list')
      .map((value, idx) => new ListValue([new NumericValue(idx), value])),
  );
}

export function length(list: Value, item: Value) {
  return list.assertType('list').includes(item);
}

// eslint-disable-next-line @typescript-eslint/no-shadow
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
