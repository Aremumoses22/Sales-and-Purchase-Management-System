import { Prisma } from '../generated/prisma/client.js';
import { diffRecords } from './diff.js';

describe('diffRecords', () => {
  it('returns only changed fields', () => {
    expect(diffRecords({ name: 'A', email: 'a@x.com' }, { name: 'B', email: 'a@x.com' })).toEqual({
      name: { from: 'A', to: 'B' },
    });
  });

  it('returns null when nothing changed', () => {
    expect(diffRecords({ name: 'A' }, { name: 'A' })).toBeNull();
  });

  it('compares decimals by value and dates by instant', () => {
    const before = { rate: new Prisma.Decimal('7.50'), when: new Date('2026-01-01T00:00:00Z') };
    const after = { rate: new Prisma.Decimal('7.5'), when: new Date('2026-01-01T00:00:00Z') };
    expect(diffRecords(before, after)).toBeNull();
    expect(diffRecords(before, { ...after, rate: new Prisma.Decimal('10') })).toEqual({
      rate: { from: '7.5', to: '10' },
    });
  });

  it('treats undefined and null as equal and ignores timestamps', () => {
    expect(diffRecords({ a: null, updatedAt: 1 }, { a: undefined, updatedAt: 2 })).toBeNull();
  });

  it('compares arrays by content', () => {
    expect(diffRecords({ p: ['a', 'b'] }, { p: ['a', 'b'] })).toBeNull();
    expect(diffRecords({ p: ['a'] }, { p: ['a', 'b'] })).toEqual({ p: { from: ['a'], to: ['a', 'b'] } });
  });
});
