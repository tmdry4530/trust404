// Keep pretty-printed files usable, but reject duplicate member names even when
// one spelling uses a Unicode escape. Native JSON.parse has already checked the grammar.
export function parseEvidenceJSON(text) {
  const value = JSON.parse(text);
  const fields = [];
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:]/g;
  let lastString;
  for (const [token] of text.matchAll(tokens)) {
    if (token === '{' || token === '[') {
      if (fields.length >= 32) throw new Error('JSON nesting is too deep');
      fields.push(token === '{' ? new Set() : null);
    } else if (token === '}' || token === ']') {
      fields.pop();
    } else if (token === ':') {
      const current = fields.at(-1);
      if (current.has(lastString)) throw new Error('Duplicate JSON field: ' + lastString);
      current.add(lastString);
    } else {
      lastString = JSON.parse(token);
      if (!lastString.isWellFormed()) throw new Error('Invalid Unicode string');
    }
  }
  return value;
}
