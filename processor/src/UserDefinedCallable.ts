import { FunctionAtRule, MixinAtRule, ParameterList, Root } from './Ast';
import type { Callable, ResolvedParameters } from './Callable';
import type Evaluator from './Evaluate';
import type Scope from './Scope';
import breakOnReturn from './utils/breakOnReturn';
import detach from './utils/detach';

export type MixinCallable = ((
  args: ResolvedParameters,
  content: Root | null,
) => Root) & { params: ParameterList };

export function mixin(
  node: MixinAtRule,
  localScope: Scope,
  visitor: Evaluator,
): MixinCallable {
  const userMixin = (args: ResolvedParameters, content: Root | null) => {
    return visitor.withScope(localScope, () => {
      return visitor.callWithScopedParameters(node.parameterList, args, () => {
        if (content) visitor.currentScope.contentBlock = content;

        const body = detach(node);

        visitor.visitRoot(body);

        return body;
      });
    });
  };

  userMixin.params = node.parameterList;
  return userMixin;
}

export function func(
  node: FunctionAtRule,
  localScope: Scope,
  visitor: Evaluator,
) {
  const userFunc = (args: ResolvedParameters) => {
    return visitor.withScope(localScope, () => {
      return visitor.callWithScopedParameters(node.parameterList, args, () => {
        const body = detach(node);

        return breakOnReturn([...body.nodes!], (n) =>
          visitor.visitChildNode(n),
        );
      });
    });
  };
  userFunc.params = node.parameterList;
  return userFunc as Callable;
}
