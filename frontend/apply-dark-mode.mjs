/**
 * Script to apply dark mode Tailwind CSS classes to all feature and shared component files.
 * Run with: node apply-dark-mode.mjs
 *
 * Safe to run multiple times — uses negative lookahead to avoid double-applying.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const BASE_DIR = join(import.meta.dirname, 'src');

// Collect all .tsx files under a directory recursively
function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, files);
    } else if (extname(full) === '.tsx') {
      files.push(full);
    }
  }
  return files;
}

const featureFiles = collectFiles(join(BASE_DIR, 'features'));
const sharedFiles = [
  join(BASE_DIR, 'components', 'shared', 'ErrorBoundary.tsx'),
  join(BASE_DIR, 'components', 'shared', 'SortableHeader.tsx'),
  join(BASE_DIR, 'components', 'shared', 'Pagination.tsx'),
];

const allFiles = [...featureFiles, ...sharedFiles].filter(f => {
  try { readFileSync(f, 'utf8'); return true; } catch { return false; }
});

console.log(`Processing ${allFiles.length} files...\n`);

/**
 * Replacements are applied in order. We use negative lookahead (?!\s+dark:...)
 * to avoid double-applying on files that already have some dark: classes.
 *
 * IMPORTANT: Order matters — more specific patterns first, then general patterns.
 */
function applyDarkMode(content) {
  let c = content;

  // =========================================================================
  // BACKGROUNDS
  // =========================================================================

  // bg-white → dark:bg-gray-800
  c = c.replace(/\bbg-white\b(?!\s+dark:bg-)/g, 'bg-white dark:bg-gray-800');

  // bg-gray-50 used in table <thead> — special handling
  // We match bg-gray-50 that appear in a className with "border-b" nearby (table headers)
  // Actually we can't do context-dependent regex easily, so we do the generic version
  // and the table header specific one is covered by the generic bg-gray-50 → dark:bg-gray-900.
  // For table headers specifically, we use dark:bg-gray-700/50 which is better.
  // Since we can't contextually distinguish, we'll use the generic version.
  // Files that have already been manually processed with dark:bg-gray-700/50 will be skipped.
  c = c.replace(/\bbg-gray-50\b(?!\s+dark:bg-)/g, 'bg-gray-50 dark:bg-gray-900');

  // bg-gray-100 (buttons, controls, progress bars)
  c = c.replace(/\bbg-gray-100\b(?!\s+dark:bg-)/g, 'bg-gray-100 dark:bg-gray-700');

  // =========================================================================
  // TEXT COLORS
  // =========================================================================

  // text-gray-900 → dark:text-gray-100
  c = c.replace(/\btext-gray-900\b(?!\s+dark:text-)/g, 'text-gray-900 dark:text-gray-100');

  // text-gray-800 → dark:text-gray-200
  c = c.replace(/\btext-gray-800\b(?!\s+dark:text-)/g, 'text-gray-800 dark:text-gray-200');

  // text-gray-700 → dark:text-gray-300
  c = c.replace(/\btext-gray-700\b(?!\s+dark:text-)/g, 'text-gray-700 dark:text-gray-300');

  // text-gray-600 → dark:text-gray-400
  c = c.replace(/\btext-gray-600\b(?!\s+dark:text-)/g, 'text-gray-600 dark:text-gray-400');

  // text-gray-500 → dark:text-gray-400
  c = c.replace(/\btext-gray-500\b(?!\s+dark:text-)/g, 'text-gray-500 dark:text-gray-400');

  // text-gray-400 → dark:text-gray-500 (for subtle icon colors)
  c = c.replace(/\btext-gray-400\b(?!\s+dark:text-)/g, 'text-gray-400 dark:text-gray-500');

  // text-gray-300 → dark:text-gray-600 (very faint text/dividers)
  c = c.replace(/\btext-gray-300\b(?!\s+dark:text-)/g, 'text-gray-300 dark:text-gray-600');

  // =========================================================================
  // BORDERS
  // =========================================================================

  // border-gray-300 → dark:border-gray-600
  c = c.replace(/\bborder-gray-300\b(?!\s+dark:border-)/g, 'border-gray-300 dark:border-gray-600');

  // border-gray-200 → dark:border-gray-700
  c = c.replace(/\bborder-gray-200\b(?!\s+dark:border-)/g, 'border-gray-200 dark:border-gray-700');

  // border-gray-100 → dark:border-gray-700
  c = c.replace(/\bborder-gray-100\b(?!\s+dark:border-)/g, 'border-gray-100 dark:border-gray-700');

  // border-gray-50 → dark:border-gray-700
  c = c.replace(/\bborder-gray-50\b(?!\s+dark:border-)/g, 'border-gray-50 dark:border-gray-700');

  // =========================================================================
  // HOVER STATES
  // =========================================================================

  // hover:bg-gray-50 → dark:hover:bg-gray-700/50
  c = c.replace(/\bhover:bg-gray-50\b(?!\s+dark:hover:bg-)/g, 'hover:bg-gray-50 dark:hover:bg-gray-700/50');

  // hover:bg-gray-100 → dark:hover:bg-gray-700
  c = c.replace(/\bhover:bg-gray-100\b(?!\s+dark:hover:bg-)/g, 'hover:bg-gray-100 dark:hover:bg-gray-700');

  // hover:bg-gray-200 → dark:hover:bg-gray-600
  c = c.replace(/\bhover:bg-gray-200\b(?!\s+dark:hover:bg-)/g, 'hover:bg-gray-200 dark:hover:bg-gray-600');

  // hover:text-gray-800 → dark:hover:text-gray-200
  c = c.replace(/\bhover:text-gray-800\b(?!\s+dark:hover:text-)/g, 'hover:text-gray-800 dark:hover:text-gray-200');

  // hover:text-gray-700 → dark:hover:text-gray-300
  c = c.replace(/\bhover:text-gray-700\b(?!\s+dark:hover:text-)/g, 'hover:text-gray-700 dark:hover:text-gray-300');

  return c;
}

let changed = 0;
for (const file of allFiles) {
  const original = readFileSync(file, 'utf8');
  const updated = applyDarkMode(original);
  if (updated !== original) {
    writeFileSync(file, updated, 'utf8');
    const shortPath = file.replace(BASE_DIR, 'src');
    console.log(`  Updated: ${shortPath}`);
    changed++;
  }
}

console.log(`\nDone! ${changed} of ${allFiles.length} files updated.`);
