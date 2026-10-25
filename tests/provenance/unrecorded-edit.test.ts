/**
 * IMPT-01 / T-1-19 — the unrecorded-edit detector.
 *
 * A vendored byte that differs from `MANIFEST.upstream.tsv` is legal exactly
 * when a patch in `patches/series` names it. This suite proves the detector
 * bites on a direct edit, clears once the documented patch flow has recorded
 * the divergence, and that a deleted ledger file is `MISSING` rather than a
 * silent pass.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { git } from '../../tools/provenance/fetch';
import { ledgerPaths } from '../../tools/provenance/ledger';
import { replayTree } from '../../tools/provenance/replay';
import { restage, SERIES_HEADER } from '../../tools/provenance/stage';
import { main as verifyMain, verifyTree } from '../../tools/provenance/verify';

import { captureStdout, PatchAuthor, scratchImport, TREE } from './fixtures/scratch';

const README_PRISTINE = '# tiny-upstream\n\nA hermetic HALO import fixture.\n';
const README_EDIT = '# tiny-upstream\n\nA hermetic HALO import fixture, maintained by HALO.\n';

const PATCH_NAME = '0001-fixture-readme.patch';

describe('unrecorded edits', () => {
  test('a direct edit is UNRECORDED, and a recorded patch clears it', () => {
    process.stdout.write('CASE unrecorded-edit\n');
    const scratch = scratchImport('halo-unrecorded-');
    try {
      const readme = join(scratch.base, 'vendor', TREE, 'README.md');
      writeFileSync(readme, README_EDIT, 'utf8');

      // (a) An edit nothing explains is drift on both the module and CLI entries.
      const dirty = verifyTree(scratch.base, TREE);
      expect(dirty.exitCode).toBe(1);
      expect(dirty.findings).toContain(`UNRECORDED vendor/${TREE}/README.md`);

      const dirtyCli = captureStdout(() => verifyMain(['--tree', TREE], scratch.base));
      expect(dirtyCli.result).toBe(1);
      expect(dirtyCli.output).toContain(`UNRECORDED vendor/${TREE}/README.md`);

      // (b) The documented flow: revert, author the patch against the pristine
      // tree, list it in `series`, apply it, restage the vendored manifest.
      writeFileSync(readme, README_PRISTINE, 'utf8');
      const author = new PatchAuthor(
        scratch.base,
        TREE,
        scratch.sha,
        join(scratch.root, 'patchrepo'),
        'README.md',
      );
      const patchText = author.commit('fixture: record the HALO readme edit', README_EDIT);

      const ledger = ledgerPaths(scratch.base, TREE);
      mkdirSync(ledger.patchesDir, { recursive: true });
      const patchFile = join(ledger.patchesDir, PATCH_NAME);
      writeFileSync(patchFile, patchText, 'utf8');
      writeFileSync(ledger.series, `${SERIES_HEADER}\n${PATCH_NAME}\n`, 'utf8');
      // Replay applies the series at the reconstructed tree root; `git apply`
      // from a subdirectory resolves paths against the top level, so the
      // vendored subtree prefix goes in explicitly.
      git(
        [
          'apply',
          '--whitespace=nowarn',
          '-p1',
          `--directory=vendor/${TREE}`,
          patchFile,
        ],
        scratch.base,
      );
      captureStdout(() => restage(scratch.base, TREE));

      const clean = verifyTree(scratch.base, TREE);
      expect(clean.findings).toEqual([]);
      expect(clean.exitCode).toBe(0);

      const cleanCli = captureStdout(() => verifyMain(['--all'], scratch.base));
      expect(cleanCli.result).toBe(0);
      expect(cleanCli.output).toContain(`VERIFY OK ${TREE} files=10`);

      // The patch is real: replay reconstructs the same vendored bytes from the
      // cache alone, so `UNRECORDED` clearing is not a skipped check.
      const replayed = captureStdout(() => replayTree(scratch.base, TREE));
      expect(replayed.output).toContain(`REPLAY OK ${TREE} files=10`);
    } finally {
      scratch.dispose();
    }
  });

  test('a deleted ledger file is MISSING and never a skip', () => {
    process.stdout.write('CASE missing-ledger\n');
    const scratch = scratchImport('halo-unrecorded-missing-');
    try {
      rmSync(join(scratch.base, 'vendor', TREE, 'provenance', 'RENAMES.json'), { force: true });

      const result = verifyTree(scratch.base, TREE);
      expect(result.exitCode).toBe(1);
      expect(result.findings).toContain(`MISSING vendor/${TREE}/provenance/RENAMES.json`);

      const cli = captureStdout(() => verifyMain(['--tree', TREE], scratch.base));
      expect(cli.result).toBe(1);
      expect(cli.output).toContain(`MISSING vendor/${TREE}/provenance/RENAMES.json`);
    } finally {
      scratch.dispose();
    }
  });
});
