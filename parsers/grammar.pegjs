{
  const Ast = require('./Ast');
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

__ "required whitespace"
  = [ \t]* line_comment
  / [ \t\r\n\f]* comment* [ \t\r\n\f]*
  / [ \t\r\n\f]* comment+ [ \t\r\n\f]+
  / [ \t\r\n\f]+

string "string"
    = '"' chars:([^\n\r\f\\"] / "\\" nl:eol_sequence { return ""; } / escape)* '"' { return chars.join(""); }
    / "'" chars:([^\n\r\f\\'] / "\\" nl:eol_sequence { return ""; } / escape)* "'" { return chars.join(""); }


unquoted_url
  = chars:([!#$%&*-\[\]-~] / nonascii / escape)* { return chars.join(""); }

uri "uri"
  = comment* "url"i "(" _ url:string _ ")" { return url; }
  / comment* "url"i "(" _ url:unquoted_url _ ")"    { return url; }

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


null    = "null"    !nmchar
false   = "false"   !nmchar
true    = "true"    !nmchar
in      = "in"      !nmchar


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



// AST Nodes
// ---------------


Comma
   = "," _  { return "," }

Slash
  = "/" _  { return "/" }

Space
  = __  { return " " }


UnaryOperator
  = 'not'i { return new Ast.Operator('not') }


RelationalOperator
  = __ ">=" __ { return new Ast.Operator(">="); }
  / __ "<=" __ { return new Ast.Operator("<="); }
  / __ ">" __  { return new Ast.Operator(">"); }
  / __ "<" __  { return new Ast.Operator("<"); }


EqualityOperator
  = __ "!=" __ { return new Ast.Operator("!="); }
  / __ "==" __ { return new Ast.Operator("=="); }


AdditiveOperator
  = __ "+" __  { return new Ast.Operator("+"); }
  /  __ "-" __ { return new Ast.Operator("-"); }

MultiplicativeOperator
  = __ "*" __  { return new Ast.Operator("*"); }
  / __ "/" __  { return new Ast.Operator("/"); }
  / __ "%" __  { return new Ast.Operator("%"); }

ExponetialOperator
  =  __ "**" __  { return new Ast.Operator("**"); }

NotOperator
  =  __ "not"i __  { return new Ast.Operator("not"); }


AndOperator
  =  __ "and"i __  { return new Ast.Operator("and"); }

OrOperator
  =  __ "or"i __  { return new Ast.Operator("or"); }


OperatorNoDivision
  = __ "+" __  { return new Ast.Operator("+"); }
  / __ "-" __ { return new Ast.Operator("-"); }
  / __ "*" __  { return new Ast.Operator("*"); }
  / __ ">" __  { return new Ast.Operator(">"); }
  / __ ">=" __ { return new Ast.Operator(">="); }
  / __ "<" __  { return new Ast.Operator("<"); }
  / __ "<=" __ { return new Ast.Operator("<="); }
  / __ "==" __ { return new Ast.Operator("=="); }
  / __ "!=" __ { return new Ast.Operator("!="); }


Ident
  = name:ident {
    return new Ast.Ident(name)
  }


NamespacedIdent
  = name:namespaced_ident {
    const [ns, id] = name.split('.')
    return new Ast.Ident(id, ns)
  }


Variable
  = comment* '$' name:ident { return new Ast.Variable(name) }


NamespacedVariable
  = comment* namespace:ident '.$' name:ident {
    return new Ast.Variable(name, namespace)
  }


Color
  = comment* "#" name:name {
    return new Ast.Color(`#${name}`)
  }


NullLiteral
  = null { return new Ast.NullLiteral() }


BooleanLiteral
  = true { return new Ast.BooleanLiteral(true) }
  / false  { return new Ast.BooleanLiteral(false) }


Numeric
  = comment* value:num unit:('%' / ident { return text() })? {
    return new Ast.Numeric(value, unit)
  }


StringTemplate "templated string"
  = comment* '"' chars:(Interpolation / [^\n\r\f\\"] / "\\" nl:eol_sequence { return ""; } / escape)* '"' {
    return Ast.StringTemplate.fromTokens(chars, '"')
  }
  / comment* "'" chars:(Interpolation / [^\n\r\f\\'] /  "\\" nl:eol_sequence { return ""; } / escape)* "'" {
    return Ast.StringTemplate.fromTokens(chars, "'")
  }


Url
  = comment* uri  { return new Ast.Url(value) }


Function  "function"
  = comment* name:((NamespacedIdent / Ident) !math_function_names) "(" _ params:List _ ")" {
    // we need to re-wrap the expression if it was reduced to it's lone item
    return new Ast.Function(name[0], params.type !== 'list'
      ? new Ast.List([params])
      : params
    );
  }

Interpolation "interpolation"
  = '#{' _ list:List _'}' {
    return new Ast.Interpolation(list.nodes.length <= 1 ? list.nodes[0].remove() : list)
  }


InterpolatedIdent "interpolated identifier"
  = comment* head:(ident / prefix:$"-"? Interpolation) tail:(name / Interpolation)* {
    return Ast.InterpolatedIdent.fromTokens([].concat(head, tail))
  }


math_function_names
  = "calc"i / "min"i / "max"i / "clamp"i

math_params "list of math expressions"
  = head:(Expression) _ tail:(Comma expr:Expression _ { return expr })* { return [head, ...tail] }

MathFunction "calc, min, max, or clamp function"
  = comment* name:math_function_names "(" _ params:(math_params) _ ")"  {
    return name.toLowerCase() === 'calc'
      ? new Ast.Calc(params[0])
      : new Ast.MathFunction(name.toLowerCase(), params)
  }


Value
  = Color
  / Numeric
  / NullLiteral
  / BooleanLiteral
  / StringTemplate
  / Url
  / MathFunction
  / Function
  / NamespacedVariable
  / Variable
  / NamespacedIdent
  / InterpolatedIdent


PrimaryExpression
  = Value
  / comment* "(" _ expr:Expression _ ")" { return expr }


UnaryExpression
  = op:('+' / '-')? _ argument:PrimaryExpression _ {
    return op ? new Ast.UnaryExpression(op, argument) : argument
  }


ExponentialExpression
   = head:UnaryExpression tail:(ExponetialOperator UnaryExpression)* _ {
    // Exponentiation is right-associative, maybe move this to AST
    tail = [[new Ast.Operator('**'), head], ...tail].reverse();
    [, head] = tail.shift()
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


MultiplicativeExpression
   = head:ExponentialExpression tail:(MultiplicativeOperator ExponentialExpression)* _ {
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


AdditiveExpression
  = head:MultiplicativeExpression  tail:(AdditiveOperator MultiplicativeExpression)* _ {
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


RelationalExpression
  = head:AdditiveExpression  tail:(RelationalOperator AdditiveExpression)* _ {
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


EqualityExpression
  = head:RelationalExpression  tail:(EqualityOperator RelationalExpression)* _ {
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


NotExpression
  = op:NotOperator? argument:EqualityExpression _ {
    return op ? new Ast.UnaryExpression(op.value, argument) : argument
  }


AndExpression
  = head:NotExpression  tail:(AndOperator NotExpression)* _ {
     return Ast.BinaryExpression.fromTokens(head, tail)
  }


OrExpression
  = head:AndExpression  tail:(OrOperator AndExpression)* {
     return Ast.BinaryExpression.fromTokens(head, tail)
  }


BinaryExpression
   = OrExpression


Expression
  = OrExpression


ListItem
  = Value
  / OperatorNoDivision
  / ParenthesizedList


List
  = head:(ListItem) _ tail:(sep:(Comma / Slash / Space) expr:ListItem _ { return [sep, expr]})* {
    return Ast.List.fromTokens(head, tail)
  }


ParenthesizedList
  = "(" _ list:List _ ")" { return list }



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

imports
  = source:string _ "import" _ specifiers:(ImportSpecifiers) _ {
    return new Ast.Import(source, specifiers)
  }
  / source:string _ {
    return new Ast.Import(source, [])
  }


specifier_alias
  = "as" _ local:(Variable / Ident) {
    return local
  }

ImportNamespaceSpecifier
   = "*" _ "as" _ local:Ident {
    return new Ast.ImportNamespaceSpecifier(local);
  }

ImportSpecifier
  = imported:(Variable / Ident) _ local:specifier_alias? _ {
    if (imported && local && imported.type !== local.type) {
      error(`Cannot import ${imported.type === 'variable' ? 'a variable as an identifier' : 'an identifier as a variable'}.`)
    }

    return new Ast.ImportNamedSpecifier(imported, local ?? imported)
  }

ImportSpecifiers
  = _ head:ImportSpecifier tail:(_ "," _ ref:ImportSpecifier { return ref; })* _ {
    return [head].concat(tail);
  }
  / _ "(" _ head:ImportSpecifier tail:(_ "," _ ref:ImportSpecifier { return ref; })* _ ")" _ {
    return [head].concat(tail);
  }
  / specifier:ImportNamespaceSpecifier {
    return [specifier]
  }


// @composes

at_composes '@composes'
  = _ classes:class_list _ source:from_source _ {
    return {
      classes,
      source: source.source,
      type: source.global ? 'global' : 'import',
    }
  }
  / _ classes:class_list _ {
    return {
      type: 'local',
      classes,
    };
  }

class_list
  = head:Ident tail:(_ "," _ ref:Ident { return ref; })* {
    return [head].concat(tail)
  }


// Exports

exports
  = _ "*" _ "from" _ source:string _ {
    return new Ast.Export(
      [new Ast.ExportAllSpecifier()],
      source,
    );
  }
  / specifiers: ExportSpecifiers _ source:from_source? _ {
    return new Ast.Export(
      specifiers,
      source?.source,
    );
  }


ExportSpecifier
  = local:Variable _ exported:specifier_alias? _ {
    return new Ast.ExportSpecifier(exported || local, local)
  }

ExportSpecifiers
  = _ head:ExportSpecifier tail:(_ "," _ ref:ExportSpecifier { return ref; })* _ {
    return [head].concat(tail);
  }
  / _ "(" _ head:ExportSpecifier tail:(_ "," _ ref:ExportSpecifier { return ref; })* _ ")" _ {
    return [head].concat(tail);
  }


// Values

values
  = _ list:(List / ParenthesizedList) _ {
    return list.nodes.length <= 1 ? list.nodes[0].remove() : list
  }

declaration
  = InterpolatedIdent


for_condition
  = _ variable:Variable __ "from" __ from:Expression _ exclusive:("to" / "through") _ to:Expression _ {
    return  new Ast.ForCondition(variable, from, to, exclusive === 'to')
  }
