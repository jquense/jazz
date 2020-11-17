import type * as Ast from './Ast';
import ModuleMembers from './ModuleMembers';

export interface StatementVisitor<T> {
  visitRoot(node: Ast.Root): T;
  visitRule(node: Ast.Rule): T;
  visitDeclaration(node: Ast.Declaration): T;

  visitIfRule(node: Ast.IfAtRule): T;
  visitUseRule(node: Ast.UseAtRule): T;
  visitEachRule(node: Ast.EachAtRule): T;
  visitFunctionRule(node: Ast.FunctionAtRule): T;
  visitMixinRule(node: Ast.MixinAtRule): T;
  visitIncludeRule(node: Ast.IncludeAtRule): T;
  visitComposeRule(node: Ast.ComposeAtRule): T;
  visitExportRule(node: Ast.ExportAtRule, exports: ModuleMembers): T;
  visitReturnRule(node: Ast.ReturnAtRule): T;
  visitContentRule(node: Ast.ContentAtRule): T;

  visitMetaRule(node: Ast.MetaAtRule): T;
}

export interface IcssStatementVisitor<T> {
  visitIcssExportRule(node: Ast.IcssExportAtRule): T;
  visitIcssImportRule(node: Ast.IcssImportAtRule): T;
}

export interface ExpressionVisitor<T> {
  visitVariable(node: Ast.Variable): T;
  // visitClassReference(node: Ast.ClassReference): T;
  visitParentSelectorReference(node: Ast.ParentSelectorReference): T;
  visitBooleanLiteral(node: Ast.BooleanLiteral): T;
  visitStringLiteral(node: Ast.StringLiteral): T;
  visitNullLiteral(node: Ast.NullLiteral): T;
  visitNumeric(node: Ast.Numeric): T;
  visitUrl(node: Ast.Url): T;
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
