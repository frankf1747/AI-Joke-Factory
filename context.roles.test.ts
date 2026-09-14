import { describe, it, expect } from 'vitest';
import { toApiRole, toRole } from './context';
import { Role } from './types';

/* The backend's domain.Role is INSTRUCTOR | JM | MARKETING (core/domain/enums.go:6-14),
   and the Postgres user_role enum carries exactly those three. There is no QC and no
   CUSTOMER — human customers were replaced by simulated ones. A value this function does
   not recognise becomes UNASSIGNED, which App.tsx routes to the Waiting Room, so an
   unmapped role is indistinguishable from "not assigned yet". */
describe('toRole', () => {
  it('maps every role the backend can actually send', () => {
    expect(toRole('INSTRUCTOR')).toBe(Role.INSTRUCTOR);
    expect(toRole('JM')).toBe(Role.JOKE_MAKER);
    expect(toRole('MARKETING')).toBe(Role.QUALITY_CONTROL);
  });

  it('still accepts QC, which older sessions may hold in localStorage', () => {
    expect(toRole('QC')).toBe(Role.QUALITY_CONTROL);
  });

  it('treats null and unknown values as unassigned', () => {
    expect(toRole(null)).toBe(Role.UNASSIGNED);
    expect(toRole('NONSENSE')).toBe(Role.UNASSIGNED);
  });
});

/* The write path. usecase/instructor.go:207-218 switches on INSTRUCTOR | JM | MARKETING and
   returns 400 VALIDATION_ERROR "unsupported role" for anything else, so unlike the read path
   there is exactly one correct value per role and no tolerance for legacy spellings.
   Verified against the running backend:
     PATCH /v1/instructor/rounds/1/users/15 {"status":"ASSIGNED","role":"QC","team_id":1}
       -> 400 {"code":"VALIDATION_ERROR","message":"unsupported role","field":"role"} */
describe('toApiRole', () => {
  it('sends MARKETING for a Marketing seat, never the legacy QC', () => {
    expect(toApiRole(Role.QUALITY_CONTROL)).toBe('MARKETING');
  });

  it('maps the other roles the backend will accept', () => {
    expect(toApiRole(Role.JOKE_MAKER)).toBe('JM');
    expect(toApiRole(Role.INSTRUCTOR)).toBe('INSTRUCTOR');
  });

  it('emits no wire value for roles the backend has no seat for', () => {
    // The backend has no CUSTOMER role at all - customers are simulated now - and WAITING is
    // expressed by status, not role. Both must yield undefined rather than a doomed request.
    expect(toApiRole(Role.CUSTOMER)).toBeUndefined();
    expect(toApiRole(Role.UNASSIGNED)).toBeUndefined();
  });

  it('never emits a value the backend would reject', () => {
    const accepted = ['INSTRUCTOR', 'JM', 'MARKETING'];
    for (const role of Object.values(Role)) {
      const wire = toApiRole(role);
      if (wire !== undefined) expect(accepted).toContain(wire);
    }
  });

  it('round-trips through toRole for every assignable role', () => {
    for (const role of [Role.INSTRUCTOR, Role.JOKE_MAKER, Role.QUALITY_CONTROL]) {
      expect(toRole(toApiRole(role)!)).toBe(role);
    }
  });
});
