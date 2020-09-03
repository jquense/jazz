import type { CssSyntaxError } from 'unnamed-css-preprocessor';

class McssSyntaxError extends Error {
  constructor(error: CssSyntaxError) {
    super();

    const { line, column, reason } = error;

    this.name = 'SyntaxError';

    this.message = `${this.name}\n\n`;

    if (typeof line !== 'undefined') {
      this.message += `(${line}:${column}) `;
    }

    this.message += `${reason}`;

    const code = error.showSourceCode();

    if (code) {
      this.message += `\n\n${code}\n`;
    }
    // @ts-ignore
    this.stack = false;
  }
}

export default McssSyntaxError;
