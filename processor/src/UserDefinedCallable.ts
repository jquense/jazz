import postcss from 'postcss';
import type { Callable, ResolvedParameters } from './Callable';
import { FunctionAtRule, MixinAtRule, ParameterList } from './Ast';
import Evaluator from './Evaluate';
import type Scope from './Scope';
import breakOnReturn from './utils/breakOnReturn';
import detach from './utils/detach';

export type MixinCallable = ((
  args: ResolvedParameters,
  content: postcss.Root | null,
) => postcss.Root) & { params: ParameterList };

export function mixin(
  node: MixinAtRule,
  localScope: Scope,
  visitor: Evaluator,
): MixinCallable {
  const mixin = (args: ResolvedParameters, content: postcss.Root | null) => {
    return visitor.withScope(localScope, () => {
      return visitor.callWithScopedParameters(node.parameterList, args, () => {
        if (content) visitor.currentScope.contentBlock = content;

        const body = detach(node);

        visitor.visitRoot(body);

        return body;
      });
    });
  };

  mixin.params = node.parameterList;
  return mixin;
}

export function func(
  node: FunctionAtRule,
  localScope: Scope,
  visitor: Evaluator,
) {
  const func = (args: ResolvedParameters) => {
    return visitor.withScope(localScope, () => {
      return visitor.callWithScopedParameters(node.parameterList, args, () => {
        const body = detach(node);

        return breakOnReturn([...body.nodes!], (n) =>
          visitor.visitChildNode(n),
        );
      });
    });
  };
  func.params = node.parameterList;
  return func as Callable;
}
