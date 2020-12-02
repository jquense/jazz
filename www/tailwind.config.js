const colors = require('tailwindcss/colors');

module.exports = {
  purge: [],
  darkMode: false,
  theme: {
    colors: {
      black: colors.black,
      white: colors.white,
      gray: colors.gray,
      blue: colors.blue,
    },
    extend: {},
  },
  variants: {},
  plugins: [require('@tailwindcss/typography')],
};
