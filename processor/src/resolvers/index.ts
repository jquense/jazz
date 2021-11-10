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
  cwd: string,
): AsyncResolver;
function mergeResolvers(resolvers: Resolver[], cwd: string): Resolver;
function mergeResolvers(
  resolvers: Array<Resolver | AsyncResolver>,
  cwd: string,
): Resolver | AsyncResolver {
  const allResolvers = [...resolvers, nodeResolver];

  return ((url: string, { from }: { from: string }) => {
    for (const [idx, resolver] of allResolvers.entries()) {
      const result = resolver(url, { from, cwd });
      if (isPromise(result)) {
        return resolveAsyncResolvers(
          url,
          { from, cwd },
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
