import { create } from '../Callable';
import { StringValue, Value } from '../Values';

export const typeOf = create('type-of', ($value: Value) => {
  return new StringValue($value.type);
});
