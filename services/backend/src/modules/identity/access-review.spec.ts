import { monthWindow } from './access-review.service';

describe('monthWindow', () => {
  it('uses the Asia/Dhaka calendar month', () => {
    const w = monthWindow('2026-11');
    expect(w.from.toISOString()).toBe('2026-10-31T18:00:00.000Z');
    expect(w.to.toISOString()).toBe('2026-11-30T18:00:00.000Z');
  });

  it('defaults to the current Dhaka month, which can differ from the UTC month', () => {
    expect(monthWindow(undefined, new Date('2026-11-30T19:00:00Z')).month).toBe('2026-12');
    expect(monthWindow(undefined, new Date('2026-11-30T17:00:00Z')).month).toBe('2026-11');
  });

  it('rolls over the year', () => {
    expect(monthWindow('2026-12').to.toISOString()).toBe('2026-12-31T18:00:00.000Z');
  });
});
