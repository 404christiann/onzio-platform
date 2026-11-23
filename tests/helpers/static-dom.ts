/**
 * A small, strict DOM over React's static markup, for contract tests that must run real selectors against real public
 * markup in the node test project (which has no DOM library). It parses renderToStaticMarkup output and implements the
 * CSS selector subset used by the admin preview stamps: type, .class, [attr], [attr=value], [attr="value"], :not(),
 * :scope, descendant and child combinators, and comma lists. Anything else throws, so a selector change is never
 * silently misread.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) =>
  code[0] === "#" ? String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)) : ENTITIES[code] ?? whole);

export class StaticText {
  parentElement: StaticElement | null = null;
  constructor(readonly text: string) {}
}

export class StaticElement {
  readonly attributes = new Map<string, string>();
  readonly childNodes: (StaticElement | StaticText)[] = [];
  parentElement: StaticElement | null = null;
  constructor(readonly tagName: string) {}

  get children() { return this.childNodes.filter((node): node is StaticElement => node instanceof StaticElement); }
  get textContent(): string { return this.childNodes.map(node => node instanceof StaticText ? node.text : node.textContent).join(""); }
  get classList() { return (this.attributes.get("class") ?? "").split(/\s+/).filter(Boolean); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  *descendants(): Generator<StaticElement> { for (const child of this.children) { yield child; yield* child.descendants(); } }
  matches(selector: string, scope: StaticElement = this) { return parseSelector(selector).some(chain => matchChain(this, chain, chain.length - 1, scope)); }
  querySelectorAll(selector: string) {
    const chains = parseSelector(selector);
    return [...this.descendants()].filter(element => chains.some(chain => matchChain(element, chain, chain.length - 1, this)));
  }
  closest(selector: string): StaticElement | null {
    for (let node: StaticElement | null = this; node; node = node.parentElement) if (node.matches(selector)) return node;
    return null;
  }
}

/** Parses React static markup into a root element whose children are the top-level nodes. */
export function parseStaticMarkup(html: string): StaticElement {
  const root = new StaticElement("#root");
  const stack: StaticElement[] = [root];
  const token = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s/>=]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const match of html.matchAll(token)) {
    const [, close, open, attrs, selfClose, text] = match;
    const top = stack[stack.length - 1];
    if (text !== undefined) { const node = new StaticText(decode(text)); node.parentElement = top; top.childNodes.push(node); continue; }
    if (close) {
      const index = stack.map(element => element.tagName).lastIndexOf(close.toLowerCase());
      if (index <= 0) throw new Error(`static-dom: unmatched </${close}>`);
      stack.length = index;
      continue;
    }
    if (!open) continue; // comment
    const element = new StaticElement(open.toLowerCase());
    for (const attr of (attrs ?? "").matchAll(/([^\s/>=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      element.attributes.set(attr[1].toLowerCase(), decode(attr[2] ?? attr[3] ?? attr[4] ?? ""));
    }
    element.parentElement = top;
    top.childNodes.push(element);
    if (!selfClose && !VOID.has(element.tagName)) stack.push(element);
  }
  if (stack.length !== 1) throw new Error(`static-dom: unclosed <${stack[stack.length - 1].tagName}>`);
  return root;
}

type Compound = { scope: boolean; tag?: string; classes: string[]; attrs: { name: string; value?: string }[]; nots: Compound[] };
type Step = { compound: Compound; combinator: " " | ">" | null };

function parseCompound(source: string): Compound {
  const compound: Compound = { scope: false, classes: [], attrs: [], nots: [] };
  let rest = source;
  const take = (pattern: RegExp) => { const match = rest.match(pattern); if (match) rest = rest.slice(match[0].length); return match; };
  const tag = take(/^[a-zA-Z][\w-]*/);
  if (tag) compound.tag = tag[0].toLowerCase();
  while (rest.length) {
    let match: RegExpMatchArray | null;
    if ((match = take(/^\.([\w-]+)/))) compound.classes.push(match[1]);
    else if ((match = take(/^\[([\w-]+)(?:=(?:"([^"]*)"|([\w.-]+)))?\]/))) compound.attrs.push({ name: match[1], value: match[2] ?? match[3] });
    else if ((match = take(/^:not\(([^()]+)\)/))) compound.nots.push(parseCompound(match[1].trim()));
    else if ((match = take(/^:scope/))) compound.scope = true;
    else throw new Error(`static-dom: unsupported selector part "${rest}" in "${source}"`);
  }
  return compound;
}

function parseSelector(selector: string): Step[][] {
  return selector.split(",").map(part => {
    const tokens = part.trim().replace(/\s*>\s*/g, " > ").split(/\s+/).filter(Boolean);
    const chain: Step[] = [];
    let combinator: Step["combinator"] = null;
    for (const token of tokens) {
      if (token === ">") { combinator = ">"; continue; }
      chain.push({ compound: parseCompound(token), combinator: chain.length ? combinator ?? " " : null });
      combinator = null;
    }
    if (!chain.length) throw new Error(`static-dom: empty selector "${selector}"`);
    return chain;
  });
}

function matchCompound(element: StaticElement, compound: Compound, scope: StaticElement): boolean {
  if (compound.scope && element !== scope) return false;
  if (compound.tag && element.tagName !== compound.tag) return false;
  if (!compound.classes.every(name => element.classList.includes(name))) return false;
  if (!compound.attrs.every(({ name, value }) => element.hasAttribute(name) && (value === undefined || element.getAttribute(name) === value))) return false;
  return !compound.nots.some(not => matchCompound(element, not, scope));
}

function matchChain(element: StaticElement, chain: Step[], index: number, scope: StaticElement): boolean {
  if (!matchCompound(element, chain[index].compound, scope)) return false;
  if (index === 0) return true;
  if (chain[index].combinator === ">") return !!element.parentElement && matchChain(element.parentElement, chain, index - 1, scope);
  for (let node = element.parentElement; node; node = node.parentElement) if (matchChain(node, chain, index - 1, scope)) return true;
  return false;
}
