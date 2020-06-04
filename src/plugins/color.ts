import {
  alpha,
  blue,
  channel,
  complement,
  darken,
  desaturate,
  grayscale,
  green,
  hue,
  lighten,
  lightness,
  opacify,
  red,
  saturate,
  saturation,
  transparentize,
} from 'khroma';

import functions from './functions';

export default function color() {
  return functions({
    functions: {
      channel,
      complement,

      red,
      green,
      blue,
      alpha,

      grayscale,

      hue,
      saturation,
      lightness,

      lighten,
      darken,

      transparentize,
      opacify,

      saturate,
      desaturate,
    },
  });
}
