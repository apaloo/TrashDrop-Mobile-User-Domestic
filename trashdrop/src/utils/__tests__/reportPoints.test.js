import { reportPoints, reportPointsPending, severityPoints } from '../reportPoints';

const report = (status, severity, created_at) => ({ status, severity, created_at });

describe('points for an illegal dumping report', () => {
  it('pays by severity: high 20, medium 15, low 10', () => {
    expect([severityPoints('high'), severityPoints('medium'), severityPoints('low'), severityPoints(undefined)]).toEqual([20, 15, 10, 15]);
  });

  it('a new report earns its points once verified', () => {
    expect(reportPoints(report('pending', 'high', '2026-11-02T10:00:00Z'))).toBe(0);
    expect(reportPointsPending(report('pending', 'high', '2026-11-02T10:00:00Z'))).toBe(true);
    ['verified', 'in_progress', 'completed', 'disposed'].forEach(s =>
      expect(reportPoints(report(s, 'high', '2026-11-02T10:00:00Z'))).toBe(20));
  });

  it('a cancelled new report earns nothing and is not waiting', () => {
    expect(reportPoints(report('cancelled', 'low', '2026-11-03T10:00:00Z'))).toBe(0);
    expect(reportPointsPending(report('cancelled', 'low', '2026-11-03T10:00:00Z'))).toBe(false);
  });

  it('reports sent before 31 October 2026 keep their points', () => {
    expect(reportPoints(report('pending', 'high', '2026-10-20T10:00:00Z'))).toBe(20);
    expect(reportPointsPending(report('pending', 'high', '2026-10-20T10:00:00Z'))).toBe(false);
  });

  it('matches the database view on the same four reports (30 points)', () => {
    const reports = [report('pending', 'high', '2026-10-20'), report('pending', 'high', '2026-11-02'),
      report('verified', 'low', '2026-11-02'), report('cancelled', 'medium', '2026-11-03')];
    expect(reports.reduce((sum, r) => sum + reportPoints(r), 0)).toBe(30);
  });
});
