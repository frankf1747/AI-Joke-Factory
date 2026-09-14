import { describe, it, expect } from 'vitest';
import { toRole } from './context';
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
