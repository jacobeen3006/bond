/**
 * IMPT-03 / T-1-18 — the drift classes on the surface `replay` actually reads.
 *
 * Replay reconstructs from `(repo, SHA) + patches/series + RENAMES.json` and
 * never touches the checkout, so no case here may mutate the worktree or the
 * index: a working-tree mutation would prove nothing about replay. Each case
 * edits one committed ledger file (or the series) in its own fresh scratch
 * copy, re-runs replay, and asserts the literal `TAMPERED <ledger-path>` line
 * with the path of the file it mutated — the digest gate must name the cause,
 * not the per-file differences it would otherwise mask.
 */

import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ledgerPaths, readUpstreamLedger } from '../../tools/provenance/ledger';
import { hashFile, manifestFileDigest } from '../../tools/provenance/manifest';
import { ProvenanceError } from '../../tools/provenance/paths';
import { replayTree } from '../../tools/provenance/replay';
import { SERIES_HEADER } from '../../tools/provenance/stage';
import { isFindingLine } from '../../tools/provenance/verify';

import { captureStdout, PatchAuthor, scratchImport, TREE } from './fixtures/scratch';

const MANIFEST_VENDORED = `vendor/${TREE}/provenance/MANIFEST.vendored.tsv`;
const RENAMES = `vendor/${TREE}/provenance/RENAMES.json`;

const README_V1 = '# tiny-upstream\n\nA hermetic HALO import fixture. v1\n';
const README_V2 = '# tiny-upstream\n\nA hermetic HALO import fixture. v2\n';

/** Run replay, returning the exit code its error carried and everything it printed. */
function runReplay(base: string): { code: number; output: string } {
  let code = 0;
  const { output } = captureStdout(() => {
    try {
      replayTree(base, TREE);
      code = 0;
    } catch (error) {
      if (!(error instanceof ProvenanceError)) throw error;
      code = error.code;
    }
  });
  return { code, output };
}

function findingLines(output: string): string[] {
  return output.split('\n').filter((line) => isFindingLine(line));
}

/** Replace the manifest body with `mutate` and assert the recorded digest no longer holds. */
function tamperVendoredManifest(base: string, mutate: (lines: string[]) => void): string {
  const ledger = ledgerPaths(base, TREE);
  const lines = readFileSync(ledger.manifestVendored, 'utf8').split('\n');
  mutate(lines);
  writeFileSync(ledger.manifestVendored, lines.join('\n'), 'utf8');

  const recorded = readUpstreamLedger(base, TREE).manifests.vendored_sha256;
  expect(manifestFileDigest(ledger.manifestVendored)).not.toBe(recorded);
  return ledger.manifestVendored;
}

describe('replay drift classes (committed ledger surface)', () => {
  test('manifest-byte', () => {
    process.stdout.write('CASE manifest-byte\n');
    const scratch = scratchImport('halo-replay-tamper-byte-');
    try {
      tamperVendoredManifest(scratch.base, (lines) => {
        const fields = lines[1].split('\t');
        fields[2] = '0'.repeat(64);
        lines[1] = fields.join('\t');
      });

      const { code, output } = runReplay(scratch.base);
      expect(code).toBe(1);
      expect(findingLines(output)).toEqual([`TAMPERED ${MANIFEST_VENDORED}`]);
      expect(output).not.toContain('REPLAY OK');
    } finally {
      scratch.dispose();
    }
  });

  test('manifest-row', () => {
    process.stdout.write('CASE manifest-row\n');
    const removed = scratchImport('halo-replay-tamper-drop-');
    try {
      tamperVendoredManifest(removed.base, (lines) => {
        lines.splice(1, 1);
      });
      const { code, output } = runReplay(removed.base);
      expect(code).toBe(1);
      expect(findingLines(output)).toEqual([`TAMPERED ${MANIFEST_VENDORED}`]);
    } finally {
      removed.dispose();
    }

    const appended = scratchImport('halo-replay-tamper-append-');
    try {
      tamperVendoredManifest(appended.base, (lines) => {
        // A row that sorts last keeps the manifest canonical, so the digest gate
        // — not the parser — is what has to catch it.
        lines.splice(lines.length - 1, 0, `100644\t${'a'.repeat(40)}\t${'b'.repeat(64)}\tzzz-added.txt`);
      });
      const { code, output } = runReplay(appended.base);
      expect(code).toBe(1);
      expect(findingLines(output)).toEqual([`TAMPERED ${MANIFEST_VENDORED}`]);
    } finally {
      appended.dispose();
    }
  });

  test('renames-digest', () => {
    process.stdout.write('CASE renames-digest\n');
    const scratch = scratchImport('halo-replay-tamper-renames-');
    try {
      const ledger = ledgerPaths(scratch.base, TREE);
      const document = JSON.parse(readFileSync(ledger.renames, 'utf8')) as {
        rules: unknown[];
      };
      document.rules = [
        { id: 'R-TEST-0001', kind: 'path', from: 'README.md', to: 'README2.md' },
      ];
      writeFileSync(ledger.renames, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
      expect(readFileSync(ledger.renames, 'utf8')).toContain('R-TEST-0001');
      expect(hashFile(ledger.renames)).not.toBe(
        readUpstreamLedger(scratch.base, TREE).renames_sha256,
      );

      const { code, output } = runReplay(scratch.base);
      expect(code).toBe(1);
      expect(findingLines(output)).toEqual([`TAMPERED ${RENAMES}`]);
    } finally {
      scratch.dispose();
    }
  });

  test('order', () => {
    process.stdout.write('CASE order\n');
    const scratch = scratchImport('halo-replay-order-');
    try {
      // Two patches, the second authored against the post-first content. The
      // fixture records which patch the series order broke.
      const author = new PatchAuthor(
        scratch.base,
        TREE,
        scratch.sha,
        join(scratch.root, 'patchrepo'),
        'README.md',
      );
      const first = author.commit('0001: v1', README_V1);
      const second = author.commit('0002: v2', README_V2);

      const ledger = ledgerPaths(scratch.base, TREE);
      mkdirSync(ledger.patchesDir, { recursive: true });
      writeFileSync(join(ledger.patchesDir, '0001-first.patch'), first, 'utf8');
      writeFileSync(join(ledger.patchesDir, '0002-second.patch'), second, 'utf8');
      writeFileSync(
        ledger.series,
        `${SERIES_HEADER}\n0002-second.patch\n0001-first.patch\n`,
        'utf8',
      );

      const { code, output } = runReplay(scratch.base);
      expect(code).toBe(1);
      expect(output).toContain(
        'PATCH FAILED index=1 path=0002-second.patch file=README.md',
      );
      expect(output).not.toContain('REPLAY OK');
      expect(output).not.toContain('index=2');
      expect(findingLines(output)).toEqual([]);
    } finally {
      scratch.dispose();
    }
  });
});
