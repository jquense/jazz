import type { ListValue, Value } from 'jazzjs/lib/Values';

// import { cosmiconfigSync } from 'cosmiconfig';
const get = require('lodash/get');

// const explorer = cosmiconfigSync('theme', {
//   searchPlaces: ['theme.config.js'],
//   ignoreEmptySearchPlaces: true,
// });
export const config = {
  colors: {
    blue: 'blue',
    red: 'blue',
  },
};

export function theme(path: Value, defaultValue = undefined) {
  const list = path.assertType('list');

  return get(config, path.toJs(), defaultValue);
}

export const $pi = Math.PI;

export function join(separator: Value, ...strings: Value[]) {
  return strings.join(separator.toJs());
}
