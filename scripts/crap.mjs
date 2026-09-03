#!/usr/bin/env node
/**
 * CRAP gate — Change Risk Anti-Patterns (Alberto Savoia & Bob Evans).
 *
 *   CRAP(m) = comp(m)^2 × (1 − cov(m))^3 + comp(m)
 *
 * comp(m): cyclomatic complexity, measured by running ESLint's core
 * `complexity` rule programmatically with max 0 so EVERY function reports
 * "… has a complexity of N". A self-contained inline flat config is used
 * (overrideConfigFile: true) so the repo's eslint.config.js is never loaded —
 * this script must work regardless of that file's state.
 *
 * cov(m): the function's statement coverage (0..1) from
 * coverage/coverage-final.json (istanbul format, written by
 * `npm run coverage`). Statements starting inside the function's fnMap loc
 * span are counted; a function whose f-count is 0 has cov = 0 regardless.
 *
 * A function is "crappy" when CRAP > 15 (raffaello's bar, ADR-0012; override
 * with CRAP_THRESHOLD=n for local experiments — CI runs the default). Any crappy
 * function fails the gate (exit 1). Every row is also written to
 * reports/crap.json (uploaded as a CI artifact).
 *
 * Scope: exactly the files present in coverage-final.json — the measured set.
 * No dependencies beyond node builtins and the installed eslint +
 * typescript-eslint packages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVERAGE_JSON = path.join(ROOT, 'coverage', 'coverage-final.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const CRAP_THRESHOLD = Number(process.env.CRAP_THRESHOLD ?? 15);
const TOP_N = 15;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Load per-file istanbul coverage. The measured set is exactly its keys.
// ---------------------------------------------------------------------------
if (!existsSync(COVERAGE_JSON)) {
  fail('coverage/coverage-final.json not found — run npm run coverage first');
}
const coverage = JSON.parse(readFileSync(COVERAGE_JSON, 'utf8'));
const files = Object.keys(coverage).filter((f) => existsSync(f));
if (files.length === 0) {
  fail('coverage/coverage-final.json contains no existing files — run npm run coverage first');
}

// ---------------------------------------------------------------------------
// 2. Per-function cyclomatic complexity via ESLint, inline config only.
// ---------------------------------------------------------------------------
const eslint = new ESLint({
  cwd: ROOT,
  // `true` = do not look for or load the repo's eslint.config.js; lint with
  // overrideConfig alone. Keeps this gate independent of the lint gate.
  overrideConfigFile: true,
  // Source comments (eslint-disable) must not be able to hide a function.
  allowInlineConfig: false,
  overrideConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      rules: { complexity: ['error', { max: 0 }] },
    },
  ],
});

/** "Function 'median'" -> median; "Arrow function" -> (arrow function). */
function functionLabel(descriptor) {
  const quoted = descriptor.match(/'(.+)'/);
  if (quoted) return quoted[1];
  return `(${descriptor.toLowerCase()})`;
}

const lintResults = await eslint.lintFiles(files);
const complexityByFile = new Map(); // file -> [{ name, complexity, line, column }]
for (const result of lintResults) {
  const fns = [];
  for (const msg of result.messages) {
    if (msg.ruleId !== 'complexity') continue;
    const m = msg.message.match(/^(.+) has a complexity of (\d+)\./);
    if (!m) continue;
    fns.push({
      name: functionLabel(m[1]),
      complexity: Number(m[2]),
      line: msg.line, // 1-based
      column: msg.column - 1, // ESLint columns are 1-based; istanbul's are 0-based
    });
  }
  complexityByFile.set(result.filePath, fns);
}

// ---------------------------------------------------------------------------
// 3. Per-function statement coverage from fnMap/f + statementMap/s.
// ---------------------------------------------------------------------------

/** (line, column) tuple comparison; a null column means end-of-line (∞). */
function beforeOrAt(aLine, aCol, bLine, bCol) {
  if (aLine !== bLine) return aLine < bLine;
  if (bCol === null || bCol === undefined) return true;
  return aCol <= bCol;
}

/** Statement coverage of the fnMap entry's loc span; f-count 0 forces 0. */
function functionCoverage(fileCov, fnId) {
  if ((fileCov.f[fnId] ?? 0) === 0) return 0;
  const span = fileCov.fnMap[fnId].loc;
  let total = 0;
  let covered = 0;
  for (const [stId, st] of Object.entries(fileCov.statementMap)) {
    const inside =
      beforeOrAt(span.start.line, span.start.column, st.start.line, st.start.column) &&
      beforeOrAt(st.start.line, st.start.column, span.end.line, span.end.column);
    if (!inside) continue;
    total += 1;
    if (fileCov.s[stId] > 0) covered += 1;
  }
  // No statements inside the span (e.g. a one-expression arrow folded into
  // its parent's statement): the function ran (f > 0), so treat as covered.
  return total === 0 ? 1 : covered / total;
}

/**
 * Match an ESLint-reported function to a fnMap entry. ESLint reports the
 * function node's start; istanbul records a `decl` start (at or before it)
 * and a `loc` span. First choice: the innermost entry whose [decl.start,
 * loc.end] span contains the ESLint position — this keeps nested and
 * curried arrows (`(a) => (b) => …`) from stealing each other's entry.
 * Fallback for shapes where decl lands after the node start: nearest decl
 * within ±1 line, ties broken by column. Greedy, each entry used once.
 */
function contains(entry, line, column) {
  return (
    beforeOrAt(entry.line, entry.column, line, column) &&
    beforeOrAt(line, column, entry.end.line, entry.end.column)
  );
}

function innermostContaining(fn, entries, used) {
  let best = null;
  for (const entry of entries) {
    if (used.has(entry.id) || !contains(entry, fn.line, fn.column)) continue;
    if (!best || !beforeOrAt(entry.line, entry.column, best.line, best.column)) best = entry;
  }
  return best;
}

function nearestDecl(fn, entries, used) {
  let best = null;
  let bestScore = Infinity;
  for (const entry of entries) {
    if (used.has(entry.id)) continue;
    const lineDiff = Math.abs(entry.line - fn.line);
    if (lineDiff > 1) continue;
    const score = lineDiff * 10_000 + Math.abs(entry.column - fn.column);
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

function matchFnMapEntry(fn, entries, used) {
  return innermostContaining(fn, entries, used) ?? nearestDecl(fn, entries, used);
}

const rows = [];
for (const file of files) {
  const fileCov = coverage[file];
  const fns = complexityByFile.get(file) ?? [];
  const entries = Object.entries(fileCov.fnMap).map(([id, fn]) => ({
    id,
    line: (fn.decl ?? fn.loc).start.line,
    column: (fn.decl ?? fn.loc).start.column,
    end: fn.loc.end,
  }));
  const used = new Set();
  for (const fn of fns) {
    const entry = matchFnMapEntry(fn, entries, used);
    let cov = 0; // no fnMap match (uninstrumented function): conservative 0
    if (entry) {
      used.add(entry.id);
      cov = functionCoverage(fileCov, entry.id);
    }
    const crap = fn.complexity ** 2 * (1 - cov) ** 3 + fn.complexity;
    rows.push({
      location: `${path.relative(ROOT, file)}:${fn.line}`,
      name: fn.name,
      complexity: fn.complexity,
      cov,
      crap,
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Report and gate.
// ---------------------------------------------------------------------------
rows.sort((a, b) => b.crap - a.crap);

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(
  path.join(REPORT_DIR, 'crap.json'),
  JSON.stringify(
    {
      threshold: CRAP_THRESHOLD,
      generatedAt: new Date().toISOString(),
      rows: rows.map((r) => ({ ...r, crap: Math.round(r.crap * 100) / 100 })),
    },
    null,
    2,
  ),
);

const header = ['FILE:LINE', 'FUNCTION', 'COMPLEXITY', 'COVERAGE', 'CRAP'];
const table = rows
  .slice(0, TOP_N)
  .map((r) => [
    r.location,
    r.name,
    String(r.complexity),
    `${(r.cov * 100).toFixed(1)}%`,
    r.crap.toFixed(1),
  ]);
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const renderRow = (cells) =>
  cells
    .map((c, i) => (i === 0 || i === 1 ? c.padEnd(widths[i]) : c.padStart(widths[i])))
    .join('  ');
console.log(renderRow(header));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const row of table) console.log(renderRow(row));

const worst = rows.length > 0 ? rows[0].crap : 0;
console.log(`\n${rows.length} functions analysed, worst CRAP ${worst.toFixed(1)}`);
console.log('Full report: reports/crap.json');

const offenders = rows.filter((r) => r.crap > CRAP_THRESHOLD);
if (offenders.length > 0) {
  console.error(`\nCRAP gate FAILED — ${offenders.length} function(s) above ${CRAP_THRESHOLD}:`);
  for (const o of offenders) {
    console.error(
      `  ${o.location} ${o.name} — complexity ${o.complexity}, ` +
        `coverage ${(o.cov * 100).toFixed(1)}%, CRAP ${o.crap.toFixed(1)}`,
    );
  }
  process.exit(1);
}
console.log(`CRAP gate passed — no function above ${CRAP_THRESHOLD}.`);
