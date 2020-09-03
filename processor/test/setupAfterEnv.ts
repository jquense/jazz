import diff from 'jest-diff';
import prettier from 'prettier';

expect.extend({
  toMatchCss(received, expected) {
    received = prettier.format(received, { parser: 'scss' });
    expected = prettier.format(expected, { parser: 'scss' });

    if (received === expected) {
      return {
        message: () =>
          `${this.utils.matcherHint('toMatchCss', undefined, undefined, {
            isNot: this.isNot,
            promise: this.promise,
          })}\n\n` +
          `Expected: not ${this.utils.printExpected(expected)}\n` +
          `Received: ${this.utils.printReceived(received)}`,
        pass: true,
      };
    }
    return {
      message: () => {
        const diffString = diff(expected, received, { expand: this.expand });

        return `${this.utils.matcherHint('toMatchCss', undefined, undefined, {
          isNot: this.isNot,
          promise: this.promise,
        })}\n\n${
          diffString && diffString.includes('- Expect')
            ? `Difference:\n\n${diffString}`
            : `Expected: ${this.utils.printExpected(expected)}\n` +
              `Received: ${this.utils.printReceived(received)}`
        }`;
      },
      pass: false,
    };
  },
});
