import { BinaryExpression, Calc, Numeric, Operator } from '../Ast';
import { calc } from '../helpers';
import { add } from '../math';

describe('math', () => {
  it('helper should work', () => {
    expect(calc`1em + ${calc`3px - 1px`}`).toEqual(
      new Calc(
        new BinaryExpression(
          new Numeric(1, 'em'),
          new Operator('+'),
          new BinaryExpression(
            new Numeric(3, 'px'),
            new Operator('-'),
            new Numeric(1, 'px'),
          ),
        ),
      ),
    );
  });

  describe('add()', () => {
    it('should add numerics', () => {
      expect(add(new Numeric(1, 'px'), new Numeric(3, 'px'))).toEqual(
        new Numeric(4, 'px'),
      );
    });

    it('should produce a calc if needed', () => {
      expect(add(new Numeric(1, 'em'), new Numeric(3, 'px'))).toEqual(
        calc`1em + 3px`,
      );
    });

    it('should produce a calc from input calc', () => {
      console.log(calc`1em + 3px + 3px`.nodes);
      expect(add(calc`1em + 3px`, new Numeric(3, 'px'))).toEqual(
        calc`1em + 3px + 3px`,
      );
    });

    it('should throw a calc is produced with mustReduce', () => {
      expect(() =>
        add(new Numeric(1, 'em'), new Numeric(3, 'px'), true),
      ).toThrowError('Cannot convert from px to em');
    });
  });
});
