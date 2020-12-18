{
  const Ast = require('../Ast');
  const { getPosition } = require('./location')
  const Input = require('postcss/lib/input');

  const source = options.source || new Input(input)

function getSource() {
    let { startPos, endPos } = options;

    if (!options.source || !options.offset) {
      return { input: source, ...location() };
    }

    const{ start, end } = location()

    return {
      input: source,
      start: getPosition(options.offset, start),
      end: getPosition(options.offset, end)
    };
  }

  function init(Node: any, ...args: any[]) {
    const node = 'type' in Node ? Node : new Node(...args)

    if (options.source !== false) {
      node.source = getSource()
    }

    return node
  }

  function buildExponentialExpression(head: any, tail: any) {
    // Exponentiation is right-associative, maybe move this to AST
    tail = [[new Ast.Operator('**'), head], ...tail].reverse();
    [, head] = tail.shift()
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }
}


// --------------
// Tokens
// https://drafts.csswg.org/css-syntax/#token-diagrams
// ---------------

src_char
  = .

eol
  = [\n\r]

eol_sequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"
  / "\f"

comment "comment"
  = "/*" [^*]* "*"+ ([^/*] [^*]* "*"+)* "/"

line_comment "silent comment"
  = "//" [^\n\r]* eol_sequence


_ "whitespace"
  = [ \t]* line_comment
  / [ \t\n\r\f]* comment* [ \t\n\r\f]*

__ "whitespace"
  = [ \t]* line_comment
  / [ \t\r\n\f]* comment+ [ \t\r\n\f]*
  / [ \t\r\n\f]* comment* [ \t\r\n\f]+
  / [ \t\r\n\f]+

string "string"
    = '"' chars:([^\n\r\f\\"] / "\\" eol_sequence { return ""; } / escape)* '"' { return chars.join(""); }
    / "'" chars:([^\n\r\f\\'] / "\\" eol_sequence { return ""; } / escape)* "'" { return chars.join(""); }

unquoted_url
  = chars:([!#$%&*-\[\]-~] / nonascii / escape)* { return chars.join(""); }

hex_digit
  = [0-9a-f]i

nonascii
  = [\x80-\uFFFF]

unicode
  = "\\" digits:$(hex_digit hex_digit? hex_digit? hex_digit? hex_digit? hex_digit?) ("\r\n" / [ \t\r\n\f])? {
      return String.fromCharCode(parseInt(digits, 16));
    }

escape
  = unicode
  / "\\" char:[^\r\n\f0-9a-f]i { return char; }


nmstart
  = [_a-z]i
  / nonascii
  / escape

nmchar
  = [_a-z0-9-]i
  / nonascii
  / escape

name
  = chars:nmchar+ { return chars.join(""); }

integer  = [0-9]+

decimal = [0-9]* "." [0-9]+

colon   = ":"

null    = "null"    !nmchar
false   = "false"   !nmchar
true    = "true"    !nmchar
in      = "in"      !nmchar
not     = "not"     !nmchar
and     = "and"     !nmchar
or      = "or"      !nmchar
from    = "from"    !nmchar
to      = "to"      !nmchar
through = "through" !nmchar

num
  = [+-]? (decimal / integer) ("e"i [+-]? [0-9]+)? {
    return parseFloat(text());
  }

// https://drafts.csswg.org/css-syntax/#typedef-ident-token
ident  "identifier"
  =  '--' chars:nmchar* {
      return `--${chars.join('')}`
    }
  / prefix:$"-"? start:nmstart chars:nmchar* {
      return prefix + start + chars.join("");
    }

// https://github.com/sass/sass/blob/master/spec/modules.md#syntax
namespaced_ident  "namespace identifier"
  = namespace:ident '.' start:([a-z]i / nonascii  / escape) chars:nmchar* {
    return namespace + '.' + start + chars.join("");
  }

function "function"
  = name:(ident / namespaced_ident) "(" { return name; }


almost_any_value
  = chars:(Interpolation / [^;!{}])* {
    return init(Ast.StringTemplate.fromTokens(chars))
  }

combinator
  = "+" _ { return "+"; }
  / ">" _ { return ">"; }


math_callees "calc(), min(), max(), clamp() function names"
  = "calc"i / "min"i / "max"i / "clamp"i


// AST Nodes
// ---------------


Comma
   = "," _  { return "," }

trailing_comma
  = _ Comma { return ',' }


Slash
  = "/" _  { return "/" }

trailing_slash
  = _ Slash { return '/' }

// this isn't ideal since it makes `to` and `through` invalid words in lists
// but they are only invalid in for/each conditions. Properly splitting out
// Expression for these cases involves a bunch of extra rules so meh.
// could avoid some of this by making `4 to 5` an expression producing a filled list, then
// for/each loops would be unifiable e.g. `each $i in 5 to 6`
Space
  = __ !(Comma / Slash / in / ':') { return " " }


Spread
  = '...'

UnaryOperator
  = '+'
  / '-'


RelationalOperator
  = __ ">=" __ { return init(Ast.Operator, ">="); }
  / __ "<=" __ { return init(Ast.Operator, "<="); }
  / __ ">" __  { return init(Ast.Operator, ">"); }
  / __ "<" __  { return init(Ast.Operator, "<"); }


EqualityOperator
  = __ "!=" __ { return init(Ast.Operator, "!="); }
  / __ "==" __ { return init(Ast.Operator, "=="); }


AdditiveOperator
  = __ "+" __  { return init(Ast.Operator, "+"); }
  / __ "-" __  { return init(Ast.Operator, "-"); }

MultiplicativeOperator
  = __ "*" __  { return init(Ast.Operator, "*"); }
  / __ "/" __  { return init(Ast.Operator, "/"); }
  / __ "%" __  { return init(Ast.Operator, "%"); }

MultiplicativeNoDivisionOperator
  = __ "*" __  { return init(Ast.Operator, "*"); }
  / __ "%" __  { return init(Ast.Operator, "%"); }

ExponentialOperator
  =  __ "**" __  { return init(Ast.Operator, "**"); }

NotOperator
  =  _ not _ { return init(Ast.Operator, "not"); }

AndOperator
  =  __ and _ { return init(Ast.Operator, "and"); }

OrOperator
  =  __ or _  { return init(Ast.Operator, "or"); }

Ident
  = name:ident {
    return init(Ast.Ident, name)
  }


NamespacedIdent
  = name:namespaced_ident {
    const [ns, id] = name.split('.')
    return init(Ast.Ident, id, ns)
  }


Variable
  = comment* '$' name:ident { return init(Ast.Variable, name) }


NamespacedVariable
  = comment* namespace:ident '.$' name:ident {
    return init(Ast.Variable, name, namespace)
  }


ClassReference
  = comment* '%' name:ident { return init(Ast.ClassReference, name) }

NamespacedClassReference
  = comment* namespace:ident '.%' name:ident {
    return init(Ast.ClassReference, name, namespace)
  }


SpreadArgument
  = name:ExpressionNoCommaList _ "..." {
    return init(Ast.SpreadArgument, name);
  }

Argument
  = name:Variable _ ":" _ value:ExpressionNoCommaList {
    return init(Ast.KeywordArgument, name, value);
  }
  / SpreadArgument
  / ExpressionNoCommaList


ArgumentList
  = head:Argument _ tail:(Comma arg:Argument { return arg })* {
    return init(Ast.ArgumentList.fromTokens([head, ...tail]))
  }


MathSpreadArgument
  = name:ExpressionWithDivision _ "..." {
    return init(Ast.SpreadArgument, name);
  }

MathArgument
  = name:Variable _ ":" _ value:ExpressionWithDivision {
    return init(Ast.KeywordArgument, name, value)
  }
  / MathSpreadArgument
  / ExpressionWithDivision


MathArgumentList
  = head:MathArgument _ tail:(Comma arg:MathArgument { return arg })* {
    return init(Ast.ArgumentList.fromTokens([head, ...tail]))
  }


ParentSelectorReference
  = comment* '&' { return init(Ast.ParentSelectorReference) }


Color
  = comment* "#" name:name {
    return init(Ast.Color, `#${name}`)
  }


NullLiteral
  = null { return init(Ast.NullLiteral) }


BooleanLiteral
  = true { return init(Ast.BooleanLiteral, true) }
  / false  { return init(Ast.BooleanLiteral, false) }


Numeric
  = comment* value:num unit:('%' / ident { return text() })? {
    return init(Ast.Numeric, value, unit)
  }


double_quote_char
  = (Interpolation / [^\n\r\f\\"] / "\\" nl:eol_sequence { return ""; } / escape)

single_quote_char
  = (Interpolation / [^\n\r\f\\'] / "\\" nl:eol_sequence { return ""; } / escape)

StringTemplate "templated string"
  = comment* literal:'~'? '"' chars:double_quote_char* '"' {
    return init(Ast.StringTemplate.fromTokens(chars, literal ? undefined : '"'))
  }
  / comment* literal:'~'? "'" chars:single_quote_char* "'" {
    return init(Ast.StringTemplate.fromTokens(chars, literal ? undefined : "'"))
  }



// uri "uri"
//   = comment* "url"i "(" _ url:string _ ")" { return url; }
//   / comment* "url"i "(" _ url:unquoted_url _ ")"    { return url; }

Url
  = comment* "url"i "(" _ url:unquoted_url _ ")"    {
    return init(
      Ast.CallExpression,
      init(Ast.Ident, 'url'),
      [init(Ast.StringLiteral, url)]
    );
  }
  / CallExpression


Interpolation "interpolation"
  = '#{' _ list:Expression _ '}' {
    return init(Ast.Interpolation, list)
  }


InterpolatedIdent "interpolated identifier"
  = comment* head:(ident / prefix:$"-"? Interpolation) tail:(name / Interpolation)* {
    return init(Ast.InterpolatedIdent.fromTokens([].concat(head, tail)))
  }

// comma separated lists not allowed in a Map b/c of parsing ambiguity
map_property
  = key:ExpressionNoCommaList _ colon _ value:ExpressionNoCommaList {
    return [key, value]
  }

map_properties
  = head:map_property tail:(_ ',' _ prop:map_property { return prop })* trailing_comma? {
    return [head, ...tail]
  }
Map
  = "(" _ properties:map_properties _ ")" {
    return init(Ast.Map, properties)
  }

// probably should be in with the expressions but meh

CallExpression
  = comment* name:math_callees "(" _ args:MathArgumentList? _ ")"  {
    return init(Ast.MathCallExpression, name.toLowerCase(), args ?? undefined)
  }
  / comment* name:(NamespacedIdent / Ident) "(" _ args:ArgumentList? _ ")"{
    return init(Ast.CallExpression, name, args ?? undefined);
  }

Value
  = Color
  / Numeric
  / NullLiteral
  / BooleanLiteral
  / ParentSelectorReference
  / StringTemplate
  / Url
  / CallExpression
  / NamespacedVariable
  / Variable
  / NamespacedClassReference
  / ClassReference
  / NamespacedIdent
  / InterpolatedIdent
  / Map

PrimaryExpression
  = Value
  / comment* list:BracketedList { return list }
  / comment* "(" _ expr:Expression _ ")" { return expr }
  / comment* "(" _ ")" { return init(Ast.List, []) }
  / comment* "[" _ "]" { return init(Ast.List, [], undefined, true) }

PrimaryExpressionWithDivision
  = Value
  / comment* "(" _ expr:ExpressionWithDivision _ ")" { return expr }


// PostfixExpression
//   = PrimaryExpression
//   / op:(UnaryOperator _) argument:PrimaryExpression  {
//     return init(Ast.UnaryExpression, op[0], argument)
//   }


UnaryExpression
  = PrimaryExpression
  / op:(UnaryOperator _) argument:PrimaryExpression  {
    return init(Ast.UnaryExpression, op[0], argument)
  }

UnaryExpressionWithDivision
  = PrimaryExpressionWithDivision
  / op:(UnaryOperator _) argument:PrimaryExpressionWithDivision  {
    return init(Ast.UnaryExpression, op[0], argument)
  }


ExponentialExpression
   = head:UnaryExpression tail:(ExponentialOperator UnaryExpression)*  {
    return buildExponentialExpression(head, tail)
  }

ExponentialExpressionWithDivision
  = head:UnaryExpressionWithDivision tail:(ExponentialOperator UnaryExpressionWithDivision)*  {
    return buildExponentialExpression(head, tail)
  }


MultiplicativeExpression
   = head:ExponentialExpression tail:(MultiplicativeNoDivisionOperator ExponentialExpression)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

MultiplicativeExpressionWithDivision
   = head:ExponentialExpressionWithDivision tail:(MultiplicativeOperator ExponentialExpressionWithDivision)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


AdditiveExpression
  = head:MultiplicativeExpression  tail:(AdditiveOperator MultiplicativeExpression)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

AdditiveExpressionWithDivision
  = head:MultiplicativeExpressionWithDivision  tail:(AdditiveOperator MultiplicativeExpressionWithDivision)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


RelationalExpression
  = head:AdditiveExpression  tail:(RelationalOperator AdditiveExpression)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

RelationalExpressionWithDivision
  = head:AdditiveExpressionWithDivision tail:(RelationalOperator AdditiveExpressionWithDivision)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


EqualityExpression
  = head:RelationalExpression tail:(EqualityOperator RelationalExpression)* {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

EqualityExpressionWithDivision
  = head:RelationalExpressionWithDivision tail:(EqualityOperator RelationalExpressionWithDivision)*  {
    return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


NotExpression
  = op:(NotOperator _)? argument:EqualityExpression {
    return op ? init(Ast.UnaryExpression, 'not', argument) : argument
  }

NotExpressionWithDivision
  = op:NotOperator? argument:EqualityExpressionWithDivision {
    return op ? init(Ast.UnaryExpression, op.value, argument) : argument
  }

AndExpression
  = head:NotExpression tail:(AndOperator NotExpression)* {
     return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

AndExpressionWithDivision
  = head:NotExpressionWithDivision tail:(AndOperator NotExpressionWithDivision)* _ {
     return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


OrExpression
  = head:AndExpression tail:(OrOperator AndExpression)* {
     return init(Ast.BinaryExpression.fromTokens(head, tail))
  }

OrExpressionWithDivision
  = head:AndExpressionWithDivision tail:(OrOperator AndExpressionWithDivision)* {
     return init(Ast.BinaryExpression.fromTokens(head, tail))
  }


list_range_exclusivity
  = __ op:($to / $through) _ { return op === 'to' }

RangeExpression
  = from:OrExpression tail:(list_range_exclusivity to:OrExpression)? {
    return tail ? init(Ast.Range, from, tail[1], tail[0]) : from
  }

RangeExpressionWithDivision
  = from:OrExpressionWithDivision tail:(list_range_exclusivity to:OrExpressionWithDivision)? {
    return tail ? init(Ast.Range, from, tail[1], tail[0]) : from
  }

// Lists
//
// single item "lists" should be parsed as a value in parens and not lists
// EXCEPT when there is a trailing non-space separator, or the list is brackets
//
// e.g.
//  (1px)  -> Numeric
//  (1px ) -> Numeric
//  (1px,) -> List
//  (1px/) -> List
//  [1px]  -> List

SpaceListExpression
  = head:RangeExpression tail:(_ expr:RangeExpression { return expr })* {
    return tail.length
      ? init(Ast.List, [head, ...tail], ' ')
      : head
  }

// In CSS slash sometimes binds more tightly than space, but mostly it doesn't
// so we go with that, and in practice it prints the same either way.
// https://github.com/sass/sass/issues/2565#issuecomment-423679828
SlashListExpression
  = head:SpaceListExpression _ tail:(Slash expr:SpaceListExpression _ { return expr })* trailing:trailing_slash?  {
    return tail.length || trailing
      ? init(Ast.List, [head, ...tail], '/')
      : head
  }

CommaListExpression
  = head:SlashListExpression _ tail:(Comma expr:SlashListExpression _  { return expr })* trailing:trailing_comma? {
    return tail.length || trailing
      ? init(Ast.List, [head, ...tail], ',')
      : head
  }

ListExpression
  = list:CommaListExpression {
    return list
  }

BracketedList
  = "[" _ list:ListExpression _ "]" {
    return init(Ast.List.wrap(list, true))
  }


Expression
  = ListExpression

ExpressionNoCommaList
  = SlashListExpression

// FIXME: this seems wrong
ExpressionWithDivision
   = OrExpressionWithDivision




variable_or_class
  = Variable
  / Ident


global_keyword "global"
  = "global"


from_source
  = "from" _ source:(global_keyword  / string) {
    return source === 'global' ? { global: true } : { source, global: false }
  }



// Import

uses
  = source:string _ specifiers:(ImportSpecifiers) _ {
    return init(Ast.Import, source, specifiers)
  }
  / source:string _ {
    return init(Ast.Import, source, [])
  }


specifier_alias
  = "as" _ local:(Variable / ClassReference / Ident) {
    return local
  }
// @use './foo' as bar

ImportNamespaceSpecifier
   = "as" _ local:Ident {
    return init(Ast.ImportNamespaceSpecifier, local)
  }

ImportSpecifier
  = imported:(Variable / ClassReference / Ident) _ local:specifier_alias? _ {
    if (imported && local && imported.type !== local.type) {
      error(`Cannot import ${imported.type === 'variable' ? 'a variable as an identifier' : 'an identifier as a variable'}.`)
    }

    return init(Ast.ImportNamedSpecifier, imported, local ?? imported)
  }

ImportSpecifiers
  = "import" _ head:ImportSpecifier tail:(_ "," _ ref:ImportSpecifier { return ref; })* _ {
    return [head].concat(tail);
  }
  / "import" _ "(" _ head:ImportSpecifier tail:(_ "," _ ref:ImportSpecifier { return ref; })* _ ")" _ {
    return [head].concat(tail);
  }
  / specifier:ImportNamespaceSpecifier {
    return [specifier]
  }


// @composes

compose_list '@compose'
  = _ classes:class_list _ request:from_source _ {
    return init(Ast.Composition, classes, request.global, request.source)
  }
  / _ classes:class_list _ {
    return init(Ast.Composition, classes, false)
  }

ws_or_comma "space or comma"
  = _ "," _
  / __

class_char
  = [_a-z0-9-:]i
  / nonascii
  / escape

// slight alteration to the normal Ident, that allows unescaped `:` in a class name
// for use of use in tailwind. Safe enough because this is in the context of an at-rule
ClassIdent "class name"
  =  prefix:$"-"? start:nmstart chars:class_char* {
      return init(Ast.Ident, (prefix + start + chars.join("")).replace(/(?<!\\):/, '\\:'));
  }

class_list
  = head:ClassIdent tail:(ws_or_comma !(from_source) ref:ClassIdent { return ref; })* {
    return [head].concat(tail)
  }


// Exports

exports
  = _ "*" _ "from" _ request:string _ {
    return new Ast.Export(
      [init(Ast.ExportAllSpecifier)],
      request,
    );
  }
  / id:Variable _ ":" _ varInit:Expression _ {
    return init(Ast.ExportNamedDeclaration, id, varInit)
  }
  / specifiers: ExportSpecifiers _ request:from_source? _ {
    return init(Ast.Export,
      specifiers,
      request?.source,
    );
  }


ExportSpecifier
  = local:Variable _ exported:specifier_alias? _ {
    return init( Ast.ExportSpecifier, exported || local, local)
  }

ExportSpecifiers
  = _ head:ExportSpecifier tail:(_ "," _ ref:ExportSpecifier { return ref; })* _ {
    return [head].concat(tail);
  }
  / _ "(" _ head:ExportSpecifier tail:(_ "," _ ref:ExportSpecifier { return ref; })* _ ")" _ {
    return [head].concat(tail);
  }


// CSS Import
imports
  = _ url:string _ {
    return url.endsWith('.css') ||
      url.startsWith('https://') ||
      url.startsWith('http://') ? null : url
  }


// Values

values
  = _ list:Expression _ {
    return list
  }


declaration_prop
  = Variable / InterpolatedIdent


declaration_value_parts
  = (Interpolation / [^:!(){}] / escape)+
  / "(" b:declaration_value_parts* ")" { return ['(', ...b.flat(), ')'] }
  / "{" b:declaration_value_parts* "}" { return ["{" , ...b.flat(),"}"] }

declaration_value
  = chars:declaration_value_parts* {
    return init(Ast.StringTemplate.fromTokens(chars.flat()))
  }


for_condition "for rule"
  = _ variable:Variable __ from _ from:Expression exclusive:(to / through) _ to:Expression _ {
    return init(Ast.ForCondition, variable, from, to, exclusive === 'to')
  }

variables
  = head:Variable tail:(_ Comma _ v:Variable { return v })* {
    return [head, ...tail]
  }

each_condition
  = _ vars:variables __ in _ expr:Expression _ {
    return init(Ast.EachCondition, vars, expr)
  }


// Rules

UniversalSelector
  = comment* '*' { return init(Ast.UniversalSelector) }

ElementSelector
  = comment* name:Ident { return init(Ast.TypeSelector, name) }

ParentSelector
  = comment* prefix:Ident? '&' suffix:Ident? {
    return init(Ast.ParentSelector, prefix ?? undefined, suffix ?? undefined)
  }

TypeSelector "type selector"
  = UniversalSelector
  / ParentSelector
  / ElementSelector


IdSelector "id selector"
  = comment* "#" name:Ident { return init(Ast.IdSelector, name) }


ClassSelector "class selector"
  = comment* "." name:Ident { return init(Ast.ClassSelector, name) }


PlaceholderSelector "placeholder selector"
  = comment* "%" name:Ident { return init(Ast.PlaceholderSelector, name) }


AttributeSelector
  = "[" _ attribute:Ident _ operatorAndValue:(("=" / '~=' / '|=' / '^=' / '$=' / '*=') _ (Ident / StringTemplate) _)? "]" {
    return init(Ast.AttributeSelector, attribute, operatorAndValue?.[0], operatorAndValue?.[2])
  }


PseudoSelector
  = ":" el:":"? name:Ident params:("(" _ v:declaration_value _ ")" { return v })? {
    return init(Ast.PseudoSelector.fromTokens(el, name, params ?? undefined, () => parse(params.value, {
      ...options,
      startRule: 'selector'
    })))
  }

SimpleSelector
  = IdSelector / ClassSelector / PlaceholderSelector / AttributeSelector / PseudoSelector

CompoundSelector
  = type:TypeSelector qualifiers:SimpleSelector* {

    return init(Ast.CompoundSelector, [type, ...qualifiers])
  }
  / qualifiers:SimpleSelector+ {
    return init(Ast.CompoundSelector, qualifiers)
  }


Combinator
  = _ combinator:combinator { return init(Ast.Combinator, combinator) }
  / __ { return null }


ComplexSelector
  = head:CompoundSelector tail:(Combinator CompoundSelector)* {
    return tail.length
      ? init(Ast.ComplexSelector, [head, ...tail.flat().filter(Boolean)])
      : head
  }
  / head:Combinator tail:ComplexSelector? {
    const nodes = [head]

    if (!tail) error('A selector combinator must preceed a selector');

    if (tail.type !=='complex-selector') nodes.push(tail)
    else nodes.push(...tail.nodes)

    return init(Ast.ComplexSelector, nodes)
  }

SelectorList
  = head:ComplexSelector tail:("," _ s:ComplexSelector { return s })* {
    return init(Ast.SelectorList, [head, ...tail])
  }


selector 'selector'
  = _ s:SelectorList _ { return s }


// Declarations
// -----------------------

Parameter
  = name:Variable _ ":" _ defaultValue:ExpressionNoCommaList? {
    return init(Ast.Parameter, name, defaultValue)
  }
  / name:Variable rest:"..."? {
    return rest ? init(Ast.RestParameter, name) : init(Ast.Parameter, name)
  }


ParameterList
  = head:Parameter _ tail:(',' _ param:Parameter { return param })* {
    return init(Ast.ParameterList.fromTokens([head, ...tail]))
  }

callable_declaration
  = comment* name:Ident params:("(" _ p:ParameterList? _ ")"  { return p })? {
    return init(Ast.CallableDeclaration, name, params || undefined)
  }


call_expression
  = CallExpression
  / _ name:(NamespacedIdent /Ident ) _ {
    if (options.allowCallWithoutParens)
      return init(Ast.CallExpression, name);

    throw expected('(')
  }

call_expressions
  = head:call_expression _ tail:(',' _ call:call_expression { return call })* {
    return [head, ...tail]
  }


// mixin_declaration
//   = MixinDeclaration

// function_declaration
//   = comment* name:Ident"(" _ params:Expression _ ")" {
//     return new Ast.CallExpressionDeclaration(name[0], Ast.List.wrap([params));
//   }

