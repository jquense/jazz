import { Callable } from '../Interop';
import { StringValue, Value } from '../Values';

export const typeOf = Callable.fromFunction('type-of', ($value: Value) => {
  return new StringValue($value.type);
});
