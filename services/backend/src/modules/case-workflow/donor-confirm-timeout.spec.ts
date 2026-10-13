import { DatabaseService, Db } from '../../platform/db/database.service';
import { CaseRow, CaseSupport } from './case.support';
import { CaseService } from './case.service';
import { StatusHistoryService } from '../../platform/status/status-history.service';

const candidate = { id: 'cd1', case_id: 'c1', donor_profile_id: 'dp1' };
const caseRow = { id: 'c1', request_id: 'r1', owner_user_id: 'u1' } as unknown as CaseRow;

function setup(candidates: unknown[], confirmedInTx: unknown[] = []) {
  const dbQuery = jest.fn().mockResolvedValue({ rows: candidates, rowCount: candidates.length });
  const txQuery = jest.fn().mockResolvedValue({ rows: confirmedInTx, rowCount: confirmedInTx.length });
  const tx = { query: txQuery } as unknown as Db;
  const db = {
    query: dbQuery,
    transaction: jest.fn(async (work: (t: Db) => Promise<unknown>) => work(tx)),
  } as unknown as DatabaseService;
  const support = {
    loadCase: jest.fn().mockResolvedValue(caseRow),
    openTask: jest.fn().mockResolvedValue(undefined),
    event: jest.fn().mockResolvedValue(undefined),
  };
  const service = new CaseService(db, support as unknown as CaseSupport, {} as StatusHistoryService);
  return { service, support, db };
}

describe('CaseService.flagUnconfirmedDonors', () => {
  it('creates one callback task and one follow-up event for each unconfirmed donor', async () => {
    const { service, support } = setup([candidate]);
    expect(await service.flagUnconfirmedDonors()).toBe(1);

    expect(support.openTask).toHaveBeenCalledTimes(1);
    expect(support.openTask).toHaveBeenCalledWith(expect.anything(), caseRow, 'TK_CALLBACK', 'donor-confirm-timeout:cd1', 0, 'cd1');
    expect(support.event).toHaveBeenCalledWith(expect.anything(), 'CASE_DONOR', 'cd1', 'DonorConfirmationTimedOut', {
      caseId: 'c1',
      caseDonorId: 'cd1',
      requestId: 'r1',
      donorProfileId: 'dp1',
    });
  });

  it('uses the Critical and default timeouts in the candidate query', async () => {
    const { service, db } = setup([]);
    await service.flagUnconfirmedDonors();
    const [sql, params] = (db.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('make_interval(mins => CASE WHEN c.priority = \'Critical\' THEN $2::int ELSE $3::int END)');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM crd.appointment a WHERE a.case_donor_id = cd.id AND a.confirmed_by_donor_at IS NOT NULL)');
    expect(params).toEqual([expect.any(Array), 15, 60]);
  });

  it('does nothing when the donor confirmed between selection and the transaction', async () => {
    const { service, support } = setup([candidate], [{ '?column?': 1 }]);
    await service.flagUnconfirmedDonors();
    expect(support.openTask).not.toHaveBeenCalled();
    expect(support.event).not.toHaveBeenCalled();
  });
});
