import { SynchronousPromise } from 'synchronous-promise';

const RealPromise = Promise;

export const isPromiseLike = <T = any>(obj: any): obj is PromiseLike<T> =>
  typeof obj?.then === 'function';

export const isPromise = <T = any>(obj: any): obj is Promise<T> =>
  isPromiseLike(obj) && !(obj instanceof SynchronousPromise);

export const hasPromises = (arr: any[]) => arr.some((item) => isPromise(item));

export default class LazyPromise {
  static all<T>(values: (T | PromiseLike<T>)[]): PromiseLike<T[]> {
    return hasPromises(values)
      ? RealPromise.all(values)
      : SynchronousPromise.all(values);
  }

  static resolve<T>(value: T | PromiseLike<T>): PromiseLike<T> {
    return isPromise(value)
      ? RealPromise.resolve(value)
      : SynchronousPromise.resolve(value);
  }

  static reject(value: any | PromiseLike<any>): PromiseLike<any> {
    return isPromise(value)
      ? RealPromise.reject(value)
      : SynchronousPromise.reject(value);
  }
}
