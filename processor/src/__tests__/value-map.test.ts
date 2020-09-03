import { MapValue, NumericValue, StringValue } from '../Values';

describe('values: Map', () => {
  it('should act like a Map', () => {
    const map = new MapValue([
      [new StringValue('a'), new NumericValue(1)],
      [new StringValue('b'), new NumericValue(2)],
      [new StringValue('c'), new NumericValue(3)],
    ]);

    const value = new StringValue('b');

    expect(map.size).toEqual(3);
    expect(map.has(value)).toEqual(true);
    expect(map.get(value)!.value).toEqual(2);

    map.set(value, new NumericValue(4));

    expect(map.size).toEqual(3);
    expect(map.get(value)!.value).toEqual(4);
  });
});
