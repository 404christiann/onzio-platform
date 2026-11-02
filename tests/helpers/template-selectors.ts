import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import ts from "typescript";

export type SelectorCounts = Record<string, number>;
export type SelectorTable = Record<string, SelectorCounts>;

export const TEMPLATE_IDS = ["cinematic", "heritage", "clubhouse", "academy", "editorial"];
const TEMPLATE_KEY_LITERAL = new RegExp(`^(?:${TEMPLATE_IDS.join("|")})@\\d+$`);
const TEMPLATE_READ_NAMES = new Set([
  "presentationTemplateKey",
  "templateKey",
  "visibleForTemplates",
  "hiddenForTemplates",
]);
const TEMPLATE_MARKERS = ["data-site-template", "data-font-pack"];
const RETIRED_PRESENTATION_SYMBOLS = new Set([
  "switchPresentationTemplate",
  "evaluatePresentationReadiness",
  "recordTemplateOverride",
  "CompatibilityReport",
  "ReadinessRecommendation",
  "ReadinessPhoto",
  "PlaceholderSuggestion",
  "defaultFontPack",
  "compatibleFontPacks",
  "defaultSections",
  "supportedSections",
]);
const TEMPLATE_FLAG_NAME = new RegExp(
  `^is(?:${TEMPLATE_IDS.map((id) => id[0].toUpperCase() + id.slice(1)).join("|")})(?:Template)?$`,
);

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const UNSCANNED_PREFIXES = ["tests/", "lib/__tests__/"];
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

const EQUALITY = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);
const LOGICAL = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const MEMBERSHIP_METHODS = new Set(["includes", "has"]);

export function isScannedPath(path: string): boolean {
  return (
    CODE_EXTENSIONS.has(extname(path)) &&
    !TEST_FILE.test(path) &&
    !UNSCANNED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

function scriptKind(path: string): ts.ScriptKind {
  switch (extname(path)) {
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

function unwrap(node: ts.Node): ts.Node {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken)
  ) {
    node = ts.isPrefixUnaryExpression(node) ? node.operand : node.expression;
  }
  return node;
}

type TemplateBindings = { checker: ts.TypeChecker; derived: Set<ts.Symbol> };

function isDerivedReference(node: ts.Identifier, bindings: TemplateBindings): boolean {
  const symbol = ts.isShorthandPropertyAssignment(node.parent)
    ? bindings.checker.getShorthandAssignmentValueSymbol(node.parent)
    : bindings.checker.getSymbolAtLocation(node);
  return symbol !== undefined && bindings.derived.has(symbol);
}

function isTemplateValue(node: ts.Node, bindings: TemplateBindings): boolean {
  if (ts.isIdentifier(node)) {
    return (
      TEMPLATE_READ_NAMES.has(node.text) ||
      TEMPLATE_FLAG_NAME.test(node.text) ||
      isDerivedReference(node, bindings)
    );
  }
  if (ts.isPropertyAccessExpression(node)) {
    return TEMPLATE_READ_NAMES.has(node.name.text) || TEMPLATE_FLAG_NAME.test(node.name.text);
  }
  if (ts.isElementAccessExpression(node)) {
    const key = node.argumentExpression;
    return ts.isStringLiteralLike(key) && TEMPLATE_READ_NAMES.has(key.text);
  }
  return isBareTemplateId(node) || (ts.isStringLiteralLike(node) && TEMPLATE_KEY_LITERAL.test(node.text));
}

// A derived value is a pure function of the template: a comparison against it,
// a method call on it, a lookup keyed by it, or a logical combination in which
// every operand is one. Mixed expressions such as `isAcademy && menuOpen` are
// counted where they mention the template and do not make their own name a
// selector, which keeps layout booleans out of the list.
function derivesFromTemplate(node: ts.Node, bindings: TemplateBindings): boolean {
  const inner = unwrap(node);
  if (ts.isBinaryExpression(inner)) {
    const operator = inner.operatorToken.kind;
    if (EQUALITY.has(operator)) {
      return derivesFromTemplate(inner.left, bindings) || derivesFromTemplate(inner.right, bindings);
    }
    if (LOGICAL.has(operator)) {
      return derivesFromTemplate(inner.left, bindings) && derivesFromTemplate(inner.right, bindings);
    }
    return false;
  }
  if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression)) {
    const method = inner.expression;
    return (
      derivesFromTemplate(method.expression, bindings) ||
      (MEMBERSHIP_METHODS.has(method.name.text) &&
        inner.arguments.some((argument) => derivesFromTemplate(argument, bindings)))
    );
  }
  if (ts.isElementAccessExpression(inner) && derivesFromTemplate(inner.argumentExpression, bindings)) {
    return true;
  }
  return isTemplateValue(inner, bindings);
}

function templateBindings(file: ts.SourceFile): TemplateBindings {
  const host: ts.CompilerHost = {
    getSourceFile: (name) => name === file.fileName ? file : undefined,
    getDefaultLibFileName: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => name === file.fileName,
    readFile: (name) => name === file.fileName ? file.text : undefined,
  };
  const checker = ts.createProgram([file.fileName], {
    noLib: true,
    noResolve: true,
    types: [],
    allowJs: true,
    jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.Latest,
  }, host).getTypeChecker();
  const bindings: TemplateBindings = { checker, derived: new Set() };
  const initializers = new Map<ts.Symbol, ts.Expression[]>();
  const assignedSymbol = (name: ts.Identifier) =>
    checker.resolveName(name.text, name, ts.SymbolFlags.Value, false);
  const addInitializer = (symbol: ts.Symbol | undefined, initializer: ts.Expression | undefined) => {
    if (!symbol || !initializer) return;
    const values = initializers.get(symbol) ?? [];
    values.push(initializer);
    initializers.set(symbol, values);
  };
  const bindPattern = (name: ts.BindingName, initializer: ts.Expression | undefined, assignment: boolean) => {
    if (ts.isIdentifier(name)) {
      addInitializer(assignment ? assignedSymbol(name) : checker.getSymbolAtLocation(name), initializer);
      return;
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      bindPattern(element.name, element.initializer, assignment);
      if (ts.isObjectBindingPattern(name) && ts.isIdentifier(element.name) && !element.dotDotDotToken) {
        const property = element.propertyName ?? element.name;
        const key = ts.isComputedPropertyName(property) ? unwrap(property.expression) : property;
        if (
          (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) &&
          (TEMPLATE_READ_NAMES.has(key.text) || TEMPLATE_FLAG_NAME.test(key.text))
        ) {
          const symbol = assignment ? assignedSymbol(element.name) : checker.getSymbolAtLocation(element.name);
          if (symbol) bindings.derived.add(symbol);
        }
      }
    }
  };
  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
      // A var declaration in a catch creates an outer symbol, but its initializer writes the catch binding.
      bindPattern(node.name, node.initializer, ts.isVariableDeclaration(node));
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = unwrap(node.left);
      if (ts.isIdentifier(target)) addInitializer(assignedSymbol(target), node.right);
    }
    ts.forEachChild(node, collect);
  };
  collect(file);

  let grew = true;
  while (grew) {
    grew = false;
    for (const [symbol, values] of initializers) {
      if (!bindings.derived.has(symbol) && values.some((node) => derivesFromTemplate(node, bindings))) {
        bindings.derived.add(symbol);
        grew = true;
      }
    }
  }
  return bindings;
}

function isBareTemplateId(node: ts.Node): node is ts.StringLiteralLike {
  return ts.isStringLiteralLike(node) && TEMPLATE_IDS.includes(node.text);
}

function isPropertyNamePosition(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    ((ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isJsxAttribute(parent)) &&
      parent.name === node)
  );
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isVariableDeclaration(parent)) &&
    parent.name === node
  );
}

export function findTemplateSelectors(path: string, source: string): SelectorCounts {
  const file = ts.createSourceFile(resolve("/", path), source, ts.ScriptTarget.Latest, true, scriptKind(path));
  const bindings = templateBindings(file);
  const counts: SelectorCounts = {};
  const count = (signature: string) => {
    counts[signature] = (counts[signature] ?? 0) + 1;
  };

  const visit = (node: ts.Node) => {
    if (
      (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
      RETIRED_PRESENTATION_SYMBOLS.has(node.text)
    ) {
      count(`retired:${node.text}`);
    }
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      if (TEMPLATE_KEY_LITERAL.test(node.text)) count(`literal:${node.text}`);
      else if (TEMPLATE_READ_NAMES.has(node.text)) count(`read:${node.text}`);
      for (const marker of TEMPLATE_MARKERS) if (node.text.includes(marker)) count(`read:${marker}`);
    } else if (ts.isIdentifier(node)) {
      const name = node.text;
      if (TEMPLATE_READ_NAMES.has(name) || TEMPLATE_MARKERS.includes(name)) count(`read:${name}`);
      else if (TEMPLATE_FLAG_NAME.test(name)) {
        const declaresDerived =
          ts.isVariableDeclaration(node.parent) && node.parent.name === node && isDerivedReference(node, bindings);
        if (!declaresDerived) count(`flag:${name}`);
      } else if (!isDeclarationName(node) && !isPropertyNamePosition(node) && isDerivedReference(node, bindings)) {
        count(`flag:${name}`);
      }
    } else if (ts.isBinaryExpression(node) && EQUALITY.has(node.operatorToken.kind)) {
      const id = [node.left, node.right].find(isBareTemplateId);
      if (id) count(`id:${id.text}`);
    } else if (ts.isCaseClause(node) && isBareTemplateId(node.expression)) {
      count(`id:${node.expression.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return counts;
}

export type SelectorDrift = { path: string; signature: string; allowed: number; found: number };

export function diffSelectorTables(found: SelectorTable, allowed: SelectorTable) {
  const added: SelectorDrift[] = [];
  const stale: SelectorDrift[] = [];
  for (const path of new Set([...Object.keys(found), ...Object.keys(allowed)])) {
    const foundHere = found[path] ?? {};
    const allowedHere = allowed[path] ?? {};
    for (const signature of new Set([...Object.keys(foundHere), ...Object.keys(allowedHere)])) {
      const drift = {
        path,
        signature,
        allowed: allowedHere[signature] ?? 0,
        found: foundHere[signature] ?? 0,
      };
      if (drift.found > drift.allowed) added.push(drift);
      if (drift.found < drift.allowed) stale.push(drift);
    }
  }
  return { added, stale };
}

export function formatSelectorDrift(drift: SelectorDrift[]): string {
  return drift
    .map((d) => `  ${d.path}  ${d.signature}  allowlist ${d.allowed}, code ${d.found}`)
    .join("\n");
}

export function canonicalSelectorJson(table: SelectorTable): string {
  const sorted: SelectorTable = {};
  for (const path of Object.keys(table).sort()) {
    sorted[path] = {};
    for (const signature of Object.keys(table[path]).sort()) {
      sorted[path][signature] = table[path][signature];
    }
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function scanRepositoryTemplateSelectors(root: string): SelectorTable {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const table: SelectorTable = {};
  for (const path of new Set(listed.split("\0"))) {
    if (!path || !isScannedPath(path) || !existsSync(resolve(root, path))) continue;
    const counts = findTemplateSelectors(path, readFileSync(resolve(root, path), "utf8"));
    if (Object.keys(counts).length > 0) table[path] = counts;
  }
  return table;
}

export function readBaselineSelectorAllowlist(root: string, path: string): SelectorTable | null {
  const existing = execFileSync("git", ["ls-tree", "--name-only", "origin/main", "--", path], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!existing) return null;
  return JSON.parse(
    execFileSync("git", ["show", `origin/main:${path}`], { cwd: root, encoding: "utf8" }),
  ) as SelectorTable;
}
