/**
 * IMPT-03 / T-1-03 — the four worktree/index drift classes, on the surface that
 * can actually produce them.
 *
 * `verify` reads the index (`git ls-files -s`) and the working tree, so every
 * mutation below is applied to one of those. Each case asserts the literal
 * finding token and path — never merely a non-zero exit — so a checker that
 * fails for an unrelated reason cannot pass the suite. `replay` reconstructs
 * from the cache and is proved separately in `replay-drift.test.ts`.
 */

import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git } from '../../tools/provenance/fetch';
import { main as verifyMain, verifyTree } from '../../tools/provenance/verify';

import { captureStdout, scratchImport, TREE } from './fixtures/scratch';

const README_PRISTINE = '# tiny-upstream\n\nA hermetic HALO import fixture.\n';

/** Assert the finding through both the module return and the CLI entry. */
function expectFinding(base: string, finding: string): string {
  const result = verifyTree(base, TREE);
  expect(result.exitCode).toBe(1);
  expect(result.findings).toContain(finding);

  const cli = captureStdout(() => verifyMain(['--tree', TREE], base));
  expect(cli.result).toBe(1);
  expect(cli.output).toContain(finding);
  return cli.output;
}

describe('verify drift classes (worktree and index)', () => {
  test('modified', () => {
    process.stdout.write('CASE modified\n');
    const scratch = scratchImport('halo-verify-modified-');
    try {
      writeFileSync(
        join(scratch.base, 'vendor', TREE, 'README.md'),
        `${README_PRISTINE}\nlocal edit\n`,
        'utf8',
      );
      expectFinding(scratch.base, `MODIFIED vendor/${TREE}/README.md`);
    } finally {
      scratch.dispose();
    }
  });

  test('added', () => {
    process.stdout.write('CASE added\n');
    const scratch = scratchImport('halo-verify-added-');
    try {
      // `git ls-files -s` reads the index, so an untracked file is invisible:
      // staging it is what makes this case test the check rather than git.
      const added = join(scratch.base, 'vendor', TREE, 'docs', 'extra.txt');
      writeFileSync(added, 'extra\n', 'utf8');
      git(['add', '-f', '--', `vendor/${TREE}/docs/extra.txt`], scratch.base);

      const output = expectFinding(scratch.base, `ADDED vendor/${TREE}/docs/extra.txt`);
      expect(output).not.toContain(`MODIFIED vendor/${TREE}/README.md`);
    } finally {
      scratch.dispose();
    }
  });

  test('removed', () => {
    process.stdout.write('CASE removed\n');
    const scratch = scratchImport('halo-verify-removed-');
    try {
      // The path leaves the index while the manifest still lists it. Deleting
      // the worktree file alone changes nothing `verify` compares by oid.
      git(['rm', '--cached', '--quiet', '--', `vendor/${TREE}/README.md`], scratch.base);
      expectFinding(scratch.base, `REMOVED vendor/${TREE}/README.md`);
    } finally {
      scratch.dispose();
    }
  });

  test('mode', () => {
    process.stdout.write('CASE mode\n');
    const scratch = scratchImport('halo-verify-mode-');
    try {
      // The fixture records two 100755 scripts and eight 100644 files; flip one
      // of each so both directions of the mode class are exercised.
      git(['update-index', '--chmod=-x', '--', `vendor/${TREE}/scripts/build.sh`], scratch.base);
      git(['update-index', '--chmod=+x', '--', `vendor/${TREE}/LICENSE`], scratch.base);

      const output = expectFinding(
        scratch.base,
        `MODE vendor/${TREE}/scripts/build.sh 100755 -> 100644`,
      );
      expect(output).toContain(`MODE vendor/${TREE}/LICENSE 100644 -> 100755`);
    } finally {
      scratch.dispose();
    }
  });
});
