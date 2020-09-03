import {
  BinaryMathExpression,
  MathFunctionValue,
  NumericValue,
} from '../../Values';
import { add } from '../../utils/Math';
import { calc } from '../helpers';

xdescribe('math', () => {
  it('helper should work', () => {
    expect(calc`1em + ${calc`3px - 1px`}`).toEqual(
      new MathFunctionValue(
        'calc',
        new BinaryMathExpression(
          new NumericValue(1, 'em'),
          '+',
          new BinaryMathExpression(
            new NumericValue(3, 'px'),
            '-',
            new NumericValue(1, 'px'),
          ),
        ),
      ),
    );
  });

  describe('add()', () => {
    it('should add numerics', () => {
      expect(
        add(new NumericValue(1, 'px'), new NumericValue(3, 'px')),
      ).toEqual(new NumericValue(4, 'px'));
    });

    it('should produce a calc if needed', () => {
      expect(
        add(new NumericValue(1, 'em'), new NumericValue(3, 'px')),
      ).toEqual(calc`1em + 3px`);
    });

    xit('should produce a calc from input calc', () => {
      expect(add(calc`1em + 3px`, new NumericValue(3, 'px'))).toEqual(
        calc`1em + 3px + 3px`,
      );
    });

    it('should throw a calc is produced with mustReduce', () => {
      expect(() =>
        add(new NumericValue(1, 'em'), new NumericValue(3, 'px'), true),
      ).toThrowError('Cannot convert from px to em');
    });
  });
});
