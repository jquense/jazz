import { AtRule, Declaration, Root, Rule } from 'postcss';

import type * as Ast from './Ast';

export interface StatementVisitor<T> {
  visitRoot(node: Root): T;
  visitAtRule(node: AtRule): T;
  visitRule(node: Rule): T;
  visitDeclaration(node: Declaration): T;
}

export interface ExpressionVisitor<T> {
  visitVariable(node: Ast.Variable): T;
  // visitClassReference(node: Ast.ClassReference): T;
  visitParentSelectorReference(node: Ast.ParentSelectorReference): T;
  visitBooleanLiteral(node: Ast.BooleanLiteral): T;
  visitStringLiteral(node: Ast.StringLiteral): T;
  visitNullLiteral(node: Ast.NullLiteral): T;
  visitNumeric(node: Ast.Numeric): T;
  visitList(node: Ast.List): T;
  visitMap(node: Ast.Map): T;
  visitColor(node: Ast.Color): T;
  visitStringTemplate(node: Ast.StringTemplate): T;
  visitIdent(node: Ast.Ident): T;
  visitInterpolatedIdent(node: Ast.InterpolatedIdent): T;
  visitInterpolation(node: Ast.Interpolation): T;
  visitBinaryExpression(node: Ast.BinaryExpression): T;
  visitUnaryExpression(node: Ast.UnaryExpression): T;
  visitRange(node: Ast.Range): T;
  visitCallExpression(node: Ast.CallExpression): T;
  visitMathCallExpression(node: Ast.MathCallExpression): T;
  // visitArgumentList(node: Ast.ArgumentList): T;
}

export interface SelectorVisitor<T> {
  // visitAttributeSelector(node: Ast.AttributeSelector): T;
  visitClassSelector(node: Ast.ClassSelector): T;
  visitPlaceholderSelector(node: Ast.PlaceholderSelector): T;
  // visitComplexSelector(node: Ast.ComplexSelector): T;
  // visitCompoundSelector(node: Ast.CompoundSelector): T;
  // visitIDSelector(node: Ast.IdSelector): T;
  // visitParentSelector(node: Ast.ParentSelector): T;
  // visitPseudoSelector(node: Ast.PseudoSelector): T;
  visitSelectorList(node: Ast.SelectorList): T;
  // visitTypeSelector(node: Ast.TypeSelector): T;
  // visitUniversalSelector(node: Ast.UniversalSelector): T;
}
