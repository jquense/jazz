import {
  AsyncResolver,
  ResolvedResource,
  Resolver,
  ResolverOptions,
} from '../types';
import nodeResolver from './node';

export const isPromise = <T>(value: any | Promise<T>): value is Promise<T> =>
  typeof value === 'object' && value && 'then' in value;

async function resolveAsyncResolvers(
  url: string,
  opts: ResolverOptions,
  initial: Promise<ResolvedResource | false>,
  resolvers: Array<Resolver | AsyncResolver>,
) {
  let result = await initial;
  if (result) return result;

  for (const resolver of resolvers) {
    // eslint-disable-next-line no-await-in-loop
    result = await resolver(url, opts);
    if (result) return result;
  }
  return false;
}

function mergeResolvers(
  resolvers: Array<Resolver | AsyncResolver>,
): AsyncResolver;
function mergeResolvers(resolvers: Resolver[]): Resolver;
function mergeResolvers(
  resolvers: Array<Resolver | AsyncResolver>,
): Resolver | AsyncResolver {
  const allResolvers = [...resolvers, nodeResolver];

  return ((url: string, opts: ResolverOptions) => {
    for (const [idx, resolver] of allResolvers.entries()) {
      const result = resolver(url, opts);
      if (isPromise(result)) {
        return resolveAsyncResolvers(
          url,
          opts,
          result,
          allResolvers.slice(idx),
        );
      }
      if (result !== false) return result;
    }

    return false;
  }) as any;
}

export default mergeResolvers;
