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

ws "whitespace"
  = [ \t\r\n\f]+

_ "whitespace"
  = [ \t]* line_comment
  / [ \t\n\r]* comment* [ \t\n\r]*

__ "whitespace"
  = [ \t,]* line_comment
  / [ \t\n\r,]* comment* [ \t\n\r,]*


string "string"
    = '"' chars:([^\n\r\f\\"] / "\\" nl:eol_sequence { return ""; } / escape)* '"' { return chars.join(""); }
    / "'" chars:([^\n\r\f\\'] / "\\" nl:eol_sequence { return ""; } / escape)* "'" { return chars.join(""); }


unquoted_url
  = chars:([!#$%&*-\[\]-~] / nonascii / escape)* { return chars.join(""); }

uri "uri"
  = comment* "url"i "(" ws url:string ws ")" { return url; }
  / comment* "url"i "(" ws url:unquoted_url ws ")"    { return url; }

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

integer
  = [0-9]+

decimal
  = [0-9]* "." [0-9]+

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


CommaSep
   = "," _  { return new Ast.Separator(",") }

SlashSep
  = "/" _  { return new Ast.Separator("/") }

SpaceSep
  = " " _  { return new Ast.Separator(" ") }

Separator
  = "," _  { return new Ast.Separator(",") }
  / "/" _  { return new Ast.Separator(",") }


MinusOp "minus"
  = "-"       { return new Ast.Operator("-"); }
  / ws+ "-" ws+ { return new Ast.Operator("-"); }


Operator
  = _ "/" _  { return new Ast.Operator("/"); }
  / _ "+" _  { return new Ast.Operator("+"); }
  / MinusOp
  / _ "*" _  { return new Ast.Operator("*"); }
  / _ ">" _  { return new Ast.Operator(">"); }
  / _ ">=" _ { return new Ast.Operator(">="); }
  / _ "<" _  { return new Ast.Operator("<"); }
  / _ "<=" _ { return new Ast.Operator("<="); }
  / _ "==" _ { return new Ast.Operator("=="); }
  / _ "!=" _ { return new Ast.Operator("!="); }


OperatorNoDivision
  = "+" _  { return new Ast.Operator("+"); }
  / MinusOp
  / "*" _  { return new Ast.Operator("*"); }
  / ">" _  { return new Ast.Operator(">"); }
  / ">=" _ { return new Ast.Operator(">="); }
  / "<" _  { return new Ast.Operator("<"); }
  / "<=" _ { return new Ast.Operator("<="); }
  / "==" _ { return new Ast.Operator("=="); }
  / "!=" _ { return new Ast.Operator("!="); }


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


// Block
//   = comment* "{" _ expr:Expression _ "}"  { return new Ast.Block(expr, ['{','}']) }
//   / comment* "[" _ expr:Expression _ "]" { return new Ast.Block(expr, ['[',']']) }
//   / comment* "(" _ expr:Expression _ ")" { return new Ast.Block(expr, ['(',')']) }


Function  "function"
  = comment* name:(NamespacedIdent/ Ident) "(" _ params:List _ ")" {
    // we need to re-wrap the expression if it was reduced to it's lone item
    return new Ast.Function(name, params.type !== 'list'
      ? new Ast.List([params])
      : params
    );
  }

Interpolation "interpolation"
  = '#{' _ expr:List _'}' { return new Ast.Interpolation(expr) }


InterpolatedIdent "interpolated identifier"
  = comment* head:(ident / prefix:$"-"? Interpolation) tail:(name / Interpolation)* {
    return Ast.InterpolatedIdent.fromTokens([].concat(head, tail))
  }


Calc "calc()"
  = comment* "calc("i _ value:MathExpression _ ")"  { return new Ast.Calc(value) }


// ExpressionTerm
//   = Value



// Expression
//   = head:ExpressionTerm tail:(Separator? ExpressionTerm)* {
//     let result = [head]
//     for (let [operator, term] of tail) {
//       if (operator) result.push(operator)

//       // flatten bare interpolations
//       term.type === 'interpolation'
//         ? result.push(...term.value.nodes)
//         : result.push(term)
//     }

//     return result.length === 1 ? result[0] : new Ast.Expression(result)
//   }

Value
  = Color
  / Numeric
  / StringTemplate
  / Url
  / Calc
  / Function
  / NamespacedVariable
  / Variable
  / NamespacedIdent
  / InterpolatedIdent


BinaryExpressionTerm
  = Value
  / comment* "(" _ expr:BinaryExpression _ ")" _ { return expr }


BinaryExpression
   = head:BinaryExpressionTerm tail:(OperatorNoDivision BinaryExpressionTerm _)+ _ {
    return Ast.BinaryExpression.fromTokens(head, tail)
  }


MathExpressionTerm
  = Numeric
  / Calc
  / Function
  / NamespacedVariable
  / Variable
  / comment* "(" _ expr:MathExpression _ ")" {
    return expr
  }


MathExpression
   = head:MathExpressionTerm _ tail:(Operator MathExpressionTerm _)* _ {
    return Ast.MathExpression.fromTokens(head, tail)
  }

ListExpression
  = BinaryExpression / Value

List
  = CommaSeparatedList
  / SpaceSeparatedList
  / ListExpression
  //

  // = head:ListExpression tail:(Separator? ListExpression)* {
  //   return tail.length
  //     ? new Ast.List([head].concat(
  //         ...tail.map(([sep, expr]) =>[sep ?? new Ast.Separator(' '), expr])
  //       ))
  //     : head
  // }


SpaceSeparatedList
  = head:ListExpression tail:(ws expr:ListExpression { return expr })+ {
    return new Ast.List([head].concat(tail), new Ast.Separator(' '))
  }

CommaSeparatedList
  = head:ListExpression _ tail:(CommaSep expr:ListExpression _ { return expr })+ {
     return new Ast.List([head].concat(tail), new Ast.Separator(','))
  }

// SlashSeparatedList
//   = head:ListExpression tail:("/" _ ListExpression)* {
//     return [head, ...tail]
//   }

// expression_list
//   = head:expression tail:(',' _ expr:expression? { return expr })* {
//     if (tail[tail.length - 1] === null) {
//       throw error('Unexpected trailing comma ","')
//     }

//     return tail.length ? new Ast.List([head, ...tail], ',') : head
//   }


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
  = __ expr:(List ) __ { return expr }

declaration
  = InterpolatedIdent

