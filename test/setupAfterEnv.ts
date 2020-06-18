import prettier from 'prettier';

expect.extend({
  toMatchCss(received, argument) {
    if (
      prettier.format(received, { parser: 'scss' }) ===
      prettier.format(argument, { parser: 'scss' })
    ) {
      return {
        message: () => `expected ${received} not to match CSS ${argument}`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to match CSS ${argument}`,
      pass: false,
    };
  },
});
