/**
 * Halstead difficulty gate (ADR-0012, raffaello's ADR-0028):
 *
 *   D = (n1 / 2) * (N2 / n2)
 *
 * where n1 is distinct operators, n2 distinct operands and N2 total operands
 * of a function. High difficulty means dense, hard-to-read expressions.
 * Tokens are classified with the TypeScript scanner: identifiers, literals,
 * `this`, `true`, `false` and `null` are operands; every other keyword,
 * operator and punctuation token is an operator. Comments and JSX text are
 * ignored. The convention matters less than its consistency: the gate is a
 * ratchet against the codebase's own level.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const THRESHOLD = Number(process.env.HALSTEAD_THRESHOLD ?? 50);
const REPORT_DIR = path.resolve('reports');

const OPERAND_KINDS = new Set([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.PrivateIdentifier,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ThisKeyword,
]);

const IGNORED_KINDS = new Set([
  ts.SyntaxKind.EndOfFileToken,
  ts.SyntaxKind.SingleLineCommentTrivia,
  ts.SyntaxKind.MultiLineCommentTrivia,
  ts.SyntaxKind.NewLineTrivia,
  ts.SyntaxKind.WhitespaceTrivia,
  ts.SyntaxKind.JsxText,
]);

function difficultyOf(text) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  const operators = new Map();
  const operands = new Map();
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (IGNORED_KINDS.has(kind)) continue;
    const bucket = OPERAND_KINDS.has(kind) ? operands : operators;
    const key = OPERAND_KINDS.has(kind) ? scanner.getTokenValue() : String(kind);
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  const n1 = operators.size;
  const n2 = operands.size;
  const N2 = [...operands.values()].reduce((sum, count) => sum + count, 0);
  return n2 === 0 ? 0 : (n1 / 2) * (N2 / n2);
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  );
}

function functionName(node, sourceFile) {
  if (node.name) return node.name.getText(sourceFile);
  const parent = node.parent;
  if (parent && (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))) {
    return parent.name.getText(sourceFile);
  }
  return '(anonymous)';
}

function* sourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

const SOURCE_DIRS = ['src', 'shared', 'worker', 'agent'];

const rows = [];
for (const file of SOURCE_DIRS.flatMap((dir) => [...sourceFiles(path.resolve(dir))])) {
  if (/\/test\//.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (isFunctionLike(node) && node.body) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      rows.push({
        file: path.relative(process.cwd(), file),
        name: functionName(node, sourceFile),
        line: line + 1,
        difficulty: Math.round(difficultyOf(node.getText(sourceFile)) * 100) / 100,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

rows.sort((a, b) => b.difficulty - a.difficulty);
fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(REPORT_DIR, 'halstead.json'),
  JSON.stringify({ threshold: THRESHOLD, generatedAt: new Date().toISOString(), rows }, null, 2),
);

console.log(`Halstead report — ${rows.length} functions, difficulty threshold ${THRESHOLD}`);
console.log('Top functions by difficulty:');
for (const row of rows.slice(0, 10)) {
  console.log(`  ${String(row.difficulty).padStart(7)}  ${row.file}:${row.line}  ${row.name}`);
}
console.log('Full report: reports/halstead.json');

const offenders = rows.filter((row) => row.difficulty > THRESHOLD);
if (offenders.length > 0) {
  console.error(`\n✖ ${offenders.length} function(s) exceed Halstead difficulty ${THRESHOLD}:`);
  for (const row of offenders) {
    console.error(`  ${row.difficulty}  ${row.file}:${row.line}  ${row.name}`);
  }
  process.exit(1);
}
console.log(`\n✓ No function exceeds Halstead difficulty ${THRESHOLD}.`);
