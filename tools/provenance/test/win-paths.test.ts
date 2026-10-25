/**
 * IMPT-06 / T-1-07 — the Windows-representability gate.
 *
 * Every case asserts the finding `kind` AND that `finding.path` is the input
 * string, so a refactor cannot start reporting a different path than the one
 * that was refused.
 */

import { describe, expect, test } from 'bun:test';

import {
  assertSafeArchiveEntries,
  PathGateError,
  validateTreePaths,
  type Finding,
} from '../paths';

function findingsOfKind(paths: readonly string[], kind: string): Finding[] {
  return validateTreePaths(paths).filter((finding) => finding.kind === kind);
}

/** Assert one finding of `kind` whose path is exactly `input`. */
function expectFinding(input: string, kind: string): Finding {
  const findings = validateTreePaths([input]);
  const match = findings.find((finding) => finding.kind === kind);
  expect(match).toBeDefined();
  expect(match?.path).toBe(input);
  return match as Finding;
}

describe('case collisions', () => {
  test('a case-colliding pair yields one finding per path naming both', () => {
    const paths = ['Docs/Readme.md', 'docs/README.md'];
    const findings = validateTreePaths(paths);
    const collisions = findings.filter((finding) => finding.kind === 'case-collision');

    expect(collisions).toHaveLength(2);
    expect(collisions.map((finding) => finding.path).sort()).toEqual([
      'Docs/Readme.md',
      'docs/README.md',
    ]);
    for (const finding of collisions) {
      expect(finding.detail).toContain('Docs/Readme.md');
      expect(finding.detail).toContain('docs/README.md');
    }
  });
});

describe('reserved device names', () => {
  test('CON, AUX, COM1 and LPT9 are refused as whole segments', () => {
    const cases = ['docs/CON.txt', 'docs/aux', 'docs/COM1.log', 'docs/LPT9'];
    for (const input of cases) {
      const finding = expectFinding(input, 'reserved-name');
      expect(finding.detail).toContain('reserved Windows device name');
    }
  });

  test('an extension chain is still a device name, but CONTRACT.md is not', () => {
    expect(findingsOfKind(['docs/NUL.tar.gz'], 'reserved-name')).toHaveLength(1);
    expect(validateTreePaths(['CONTRACT.md'])).toEqual([]);
  });
});

describe('trailing dot and trailing space', () => {
  test('a component ending in a dot and one ending in a space are both refused', () => {
    const dot = expectFinding('docs/trailing./file.txt', 'trailing-dot-space');
    expect(dot.detail).toContain('a dot');
    const space = expectFinding('docs/trailing /file.txt', 'trailing-dot-space');
    expect(space.detail).toContain('a space');
  });
});

describe('escape classes', () => {
  test('traversal, absolute, drive, UNC and ADS paths are classified', () => {
    const cases: [string, string][] = [
      ['../escape', 'traversal'],
      ['/absolute/path', 'absolute'],
      ['C:/abs', 'absolute'],
      ['//server/share', 'unc'],
      ['docs/file.txt:stream', 'ads'],
    ];
    for (const [input, kind] of cases) {
      expectFinding(input, kind);
    }
  });

  test('backslash and empty segments are classified', () => {
    expectFinding('dir\\file', 'backslash');
    expectFinding('a//b', 'empty-segment');
  });
});

describe('path length', () => {
  test('245 characters is too long and 240 is not', () => {
    const long = 'a'.repeat(245);
    const finding = expectFinding(long, 'too-long');
    expect(finding.detail).toContain('245');
    expect(finding.detail).toContain('240');

    expect(validateTreePaths(['a'.repeat(240)])).toEqual([]);
  });

  test('the vendored prefix counts toward the limit', () => {
    const findings = validateTreePaths(['a'.repeat(230)], {
      prefix: 'vendor/tiny-upstream/',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe('too-long');
    expect(findings[0].detail).toContain('251');
  });
});

describe('clean and representable paths', () => {
  test('a clean tree produces no findings', () => {
    expect(
      validateTreePaths([
        'README.md',
        'scripts/run.sh',
        'assets/link-to-readme',
        'docs/naïve-résumé.ts',
        'dir/',
      ]),
    ).toEqual([]);
  });

  test('a space that is not trailing and a Unicode name both pass', () => {
    expect(validateTreePaths(['docs/with space/file.txt'])).toEqual([]);
    expect(validateTreePaths(['docs/naïve-résumé.ts'])).toEqual([]);
  });
});

describe('the two entry points agree', () => {
  test('every escape that throws also produces a finding with the same path and kind', () => {
    const escapes = [
      '../escape',
      '/absolute/path',
      'C:/abs',
      '//server/share',
      'docs/file.txt:stream',
      'dir\\file',
      'a//b',
    ];
    for (const input of escapes) {
      let caught: PathGateError | null = null;
      try {
        assertSafeArchiveEntries([input]);
      } catch (error) {
        expect(error).toBeInstanceOf(PathGateError);
        caught = error as PathGateError;
      }
      expect(caught).not.toBeNull();
      const match = validateTreePaths([input]).find(
        (finding) => finding.kind === caught?.kind && finding.path === input,
      );
      expect(match).toBeDefined();
    }
  });

  test('all seven representability and escape kinds are reachable', () => {
    const findings = validateTreePaths([
      '../escape',
      '/absolute/path',
      'docs/file.txt:stream',
      'docs/CON.txt',
      'docs/trailing./file.txt',
      'Docs/Readme.md',
      'docs/README.md',
      'a'.repeat(245),
    ]);
    const kinds = new Set(findings.map((finding) => finding.kind));
    for (const kind of [
      'absolute',
      'traversal',
      'ads',
      'reserved-name',
      'trailing-dot-space',
      'case-collision',
      'too-long',
    ]) {
      expect(kinds.has(kind as Finding['kind'])).toBe(true);
    }
  });

  test('every finding reports the exact input path', () => {
    const inputs = ['../escape', 'docs/CON.txt', 'Docs/Readme.md', 'docs/README.md'];
    const findings = validateTreePaths(inputs);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(inputs).toContain(finding.path);
    }
  });
});
