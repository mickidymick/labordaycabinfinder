import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { DayAvailability } from './types.ts';
import {
  addDays,
  daysBetween,
  decodeCalendarRange,
  decodeCalendarString,
  isStayAvailable,
  nightsOf,
  stayTotal,
} from './calendar.ts';

// Captured verbatim from https://www.elkspringsresort.com/wp-json/elk/v1/cabins/284
// ("Blueberry Hill") on 2026-07-30. Their own `earliest_stay` field reported
// check_in 08/01/2026, check_out 08/03/2026, pattern "IAA", position 2 — which
// is what pins the legend and the index-to-date mapping below.
const START = '2026-07-30 00:00:00.000';
const CAL =
  'UUIAAAAOUUIAAOUUUIAOUUUUIAAAAAOUUUUUUIOUUUUUIOUUUUUUUUUUUUUUUIAAAOUUUUUU' +
  'IAAAAAAOUUUIOUUUIAAAOUUUIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

test('date helpers agree on the calendar epoch', () => {
  assert.equal(daysBetween('2026-07-30', '2026-09-04'), 36);
  assert.equal(addDays('2026-07-30', 36), '2026-09-04');
  // Crosses a month boundary and a 31-day month.
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
});

test('nightsOf excludes the checkout day', () => {
  assert.deepEqual(nightsOf('2026-09-04', '2026-09-07'), [
    '2026-09-04',
    '2026-09-05',
    '2026-09-06',
  ]);
  assert.deepEqual(nightsOf('2026-09-04', '2026-09-04'), []);
});

test('decodes the real Elk Springs calendar at the right offsets', () => {
  const days = decodeCalendarString(START, CAL);
  const at = (day: string) => days.find((d) => d.day === day)?.state;

  assert.equal(days[0].day, '2026-07-30');
  assert.equal(at('2026-07-30'), 'U');
  // Index 2 is Aug 1 — the check-in of the site's own reported earliest stay.
  assert.equal(at('2026-08-01'), 'I');
  assert.equal(at('2026-08-02'), 'A');
  // Labor Day weekend 2026 sits at indexes 36-39.
  assert.equal(at('2026-09-04'), 'U');
  assert.equal(at('2026-09-05'), 'I');
  assert.equal(at('2026-09-06'), 'O');
});

test('the site-reported earliest stay reads as available', () => {
  const days = decodeCalendarString(START, CAL);
  assert.equal(isStayAvailable(days, '2026-08-01', '2026-08-03'), true);
});

test('Blueberry Hill is booked for Labor Day weekend', () => {
  const days = decodeCalendarString(START, CAL);
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-07'), false);
});

test("a checkout day is not a bookable night", () => {
  // I A O: two bookable nights, then a departure day.
  const days = decodeCalendarString('2026-09-04', 'IAO');
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-06'), true);
  // Asking for the O day as a third night must fail — this is the regression
  // that a naive "anything but U" check gets wrong.
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-07'), false);
});

test('missing coverage is unknown, not unavailable', () => {
  const days = decodeCalendarString('2026-09-04', 'AA'); // only 2 days known
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-07'), null);
  assert.equal(isStayAvailable([], '2026-09-04', '2026-09-07'), null);
  // A zero-length stay is nonsense, not a yes.
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-04'), null);
});

test('unknown characters are treated as unavailable rather than guessed', () => {
  const days = decodeCalendarString('2026-09-04', 'AXA');
  assert.equal(days[1].state, 'U');
  assert.equal(isStayAvailable(days, '2026-09-04', '2026-09-07'), false);
});

test('decodeCalendarRange slices without shifting dates', () => {
  const full = decodeCalendarString(START, CAL);
  const slice = decodeCalendarRange(START, CAL, '2026-09-04', '2026-09-07');

  assert.deepEqual(slice.map((d) => d.day), nightsOf('2026-09-04', '2026-09-07'));
  for (const d of slice) {
    assert.equal(d.state, full.find((f) => f.day === d.day)?.state, `mismatch on ${d.day}`);
  }
});

test('dates before the calendar starts or past its end are unavailable', () => {
  const before = decodeCalendarRange(START, CAL, '2026-07-01', '2026-07-03');
  assert.deepEqual(before.map((d) => d.state), ['U', 'U']);
  const after = decodeCalendarRange(START, CAL, '2030-01-01', '2030-01-03');
  assert.deepEqual(after.map((d) => d.state), ['U', 'U']);
});

test('stayTotal sums nights and refuses partial pricing', () => {
  const priced = [
    { day: '2026-09-04', state: 'A' as const, nightlyRate: 300 },
    { day: '2026-09-05', state: 'A' as const, nightlyRate: 350 },
    { day: '2026-09-06', state: 'A' as const, nightlyRate: 400 },
    // The checkout day must not be added to the total.
    { day: '2026-09-07', state: 'O' as const, nightlyRate: 999 },
  ];
  assert.equal(stayTotal(priced, '2026-09-04', '2026-09-07'), 1050);

  const partial: DayAvailability[] = [...priced];
  partial[1] = { ...partial[1], nightlyRate: null };
  assert.equal(stayTotal(partial, '2026-09-04', '2026-09-07'), null);
});
