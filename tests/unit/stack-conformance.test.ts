import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface AuditResult {
  dimensions: { results: { id: string; status: string; evidence: string }[] }[];
  ciRed: string[];
}

describe('production architecture', () => {
  it('constructs dependencies only in approved wiring files, with no RED audit findings', () => {
    const report = JSON.parse(
      execFileSync('bun', ['scripts/stack-conformance/stack-audit.ts', '.', '--json'], {
        cwd: new URL('../..', import.meta.url),
        encoding: 'utf8',
      }),
    ) as AuditResult;
    const results = report.dimensions.flatMap((dimension) => dimension.results);

    expect(results.find(({ id }) => id === 'blueprint-construction')).toMatchObject({
      status: 'green',
    });
    expect(results.filter(({ status }) => status === 'red')).toEqual([]);
    expect(report.ciRed).toEqual([]);
  });
});
