expect.extend({
  toMatchCss(received, argument) {
    if (received.replace(/\s/g, '') === argument.replace(/\s/g, '')) {
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
