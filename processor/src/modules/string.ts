import {
  NumericValue,
  StringValue,
  Value,
  assertType,
  ListValue,
} from '../Values';
import { namedFunction } from '../utils/named-function';

export function quote(string: Value) {
  assertType(string, 'string');

  return new StringValue(string.value, "'");
}

export function unquote(string: Value) {
  assertType(string, 'string');

  return new StringValue(string.value);
}

export function index(string: Value, substring: Value) {
  assertType(string, 'string');
  assertType(substring, 'string');

  return new NumericValue(string.value.indexOf(substring.value));
}

// eslint-disable-next-line no-shadow
export function insert(string: Value, insert: Value, idx: Value) {
  assertType(string, 'string');
  const i = idx.assertType('numeric').value;

  const str = string.value;

  return new StringValue(
    str.slice(0, i) + insert.assertType('string').value + str.slice(i),
    string.quote,
  );
}

export function slice(
  string: Value,
  start: Value,
  end: Value | undefined = undefined,
) {
  assertType(string, 'string');

  return new StringValue(
    string.value.slice(
      start.assertType('numeric').value,
      end?.assertType('numeric').value,
    ),
    string.quote,
  );
}

export const toUpperCase = namedFunction('to-upper-case', (string: Value) => {
  assertType(string, 'string');
  return new StringValue(string.value.toUpperCase(), string.quote);
});

export const toLowerCase = namedFunction('to-lower-case', (string: Value) => {
  assertType(string, 'string');
  return new StringValue(string.value.toLowerCase(), string.quote);
});

export function length(string: Value) {
  return new NumericValue(string.assertType('string').value.length);
}

export function split(string: Value, separator: Value) {
  assertType(string, 'string', 'string');

  return new ListValue(
    string.value
      .split(separator.assertType('string').value)
      .map((str) => new StringValue(str, string.quote)),
  );
}
