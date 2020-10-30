// import type { StringValue, Value } from 'jazzjs/lib/Values';
// import { cosmiconfigSync } from 'cosmiconfig';
const get = require('lodash/get');

// const explorer = cosmiconfigSync('theme', {
//   searchPlaces: ['theme.config.js'],
//   ignoreEmptySearchPlaces: true,
// });
let config = {
  colors: {
    blue: 'blue',
    red: 'blue',
  },
};
module.exports = {
  config,
  theme(path, defaultValue = undefined) {
    return get(config, path.toJs(), defaultValue);
  },
};
