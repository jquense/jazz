export type ErrorOptions = {
  message: string;
  word?: string;
};

export default class JazzSyntaxError extends SyntaxError {
  word?: string;

  constructor(message: string);

  constructor(options: ErrorOptions);

  constructor(msgOrOptions: string | ErrorOptions) {
    let message, word;
    if (typeof msgOrOptions === 'string') {
      message = msgOrOptions;
    } else {
      ({ message, word } = msgOrOptions);
    }

    super(message);
    this.word = word;
  }
}
