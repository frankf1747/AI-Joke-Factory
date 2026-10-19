import { describe, expect, it } from 'vitest';
import { arrivalBoxText, arrivalMinutesOf } from './feeConfig';

describe('the arrival minutes box', () => {
  it('shows the stored window in minutes: 900 s reads 15, 90 s reads 1.5', () => {
    expect(arrivalMinutesOf(900)).toBe(15);
    expect(arrivalMinutesOf(90)).toBe(1.5);
  });

  it('keeps what the instructor typed while the box is focused, so 1.24 is not rewritten to 1.23', () => {
    // 1.24 min is 74.4 s, sent as 74 s, which reads back as 1.23.
    expect(arrivalBoxText('1.24', 74)).toBe('1.24');
    expect(arrivalBoxText('', 0)).toBe('');
  });

  it('shows the rounded window once the box is left', () => {
    expect(arrivalBoxText(null, 74)).toBe('1.23');
  });
});
