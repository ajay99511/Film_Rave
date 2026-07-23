import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  it('parses headers and rows into keyed objects', () => {
    const rows = parseCsv('Title,Year\nDune,2021\nHeat,1995');
    expect(rows).toEqual([
      { Title: 'Dune', Year: '2021' },
      { Title: 'Heat', Year: '1995' },
    ]);
  });

  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv(
      'Title,Note\n"Dune, Part Two","She said ""wow"""\n',
    );
    expect(rows[0]).toEqual({
      Title: 'Dune, Part Two',
      Note: 'She said "wow"',
    });
  });

  it('tolerates CRLF and a trailing newline', () => {
    const rows = parseCsv('A,B\r\n1,2\r\n');
    expect(rows).toEqual([{ A: '1', B: '2' }]);
  });

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
