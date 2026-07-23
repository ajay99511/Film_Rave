import { describe, expect, it } from 'vitest';
import type { OutingDto } from '@filmrave/shared';
import { OutingsService } from './outings.service.js';

/**
 * The leading theater option is decided by vote count, with ties broken by
 * insertion `position` — matching the Flutter client so all clients agree.
 */
function outing(
  options: { option_id: string; position: number; voter_ids: string[] }[],
): OutingDto {
  return {
    outing_id: 'o1',
    group_id: 'c1',
    movie_tmdb_id: 1,
    status: 'planned',
    tickets_on_sale_date: null,
    rsvps: [],
    theater_options: options.map((o) => ({
      outing_id: 'o1',
      name: o.option_id,
      ...o,
    })),
    night_options: [],
    hypes: [],
    group_hype: null,
  };
}

describe('OutingsService.leadingOption', () => {
  it('returns null when there are no options', () => {
    expect(OutingsService.leadingOption(outing([]))).toBeNull();
  });

  it('picks the option with the most votes', () => {
    const o = outing([
      { option_id: 'a', position: 0, voter_ids: ['u1'] },
      { option_id: 'b', position: 1, voter_ids: ['u1', 'u2'] },
    ]);
    expect(OutingsService.leadingOption(o)).toBe('b');
  });

  it('breaks ties by insertion position', () => {
    const o = outing([
      { option_id: 'a', position: 1, voter_ids: ['u1'] },
      { option_id: 'b', position: 0, voter_ids: ['u2'] },
    ]);
    expect(OutingsService.leadingOption(o)).toBe('b');
  });
});
