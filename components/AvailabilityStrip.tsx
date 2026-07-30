import { View, Text, StyleSheet } from 'react-native';
import { Colors, DayStateColors } from '../constants/colors';
import type { DayState } from '../lib/supabase';

type Props = {
  /** One entry per night of the stay, in order. */
  days: { day: string; state: DayState }[];
  compact?: boolean;
};

const LABEL: Record<DayState, string> = {
  A: 'Free',
  I: 'Check-in',
  O: 'Check-out only',
  U: 'Booked',
};

/**
 * A night is bookable only in state A or I. O means an existing guest departs
 * that morning, so you can't sleep there — the strip shows it as unavailable
 * even though it isn't literally 'U'. Mirrors BOOKABLE_NIGHT in scrapers/calendar.ts.
 */
const BOOKABLE = new Set<DayState>(['A', 'I']);

export default function AvailabilityStrip({ days, compact }: Props) {
  if (days.length === 0) {
    return <Text style={styles.unknown}>No calendar from this site</Text>;
  }

  return (
    <View style={styles.row}>
      {days.map(({ day, state }) => {
        const ok = BOOKABLE.has(state);
        const dayNum = Number(day.slice(8, 10));
        return (
          <View
            key={day}
            style={[
              styles.cell,
              compact && styles.cellCompact,
              { backgroundColor: ok ? DayStateColors[state] : Colors.border },
            ]}
            accessibilityLabel={`${day}: ${LABEL[state]}`}
          >
            {!compact && (
              <Text style={[styles.cellText, { color: ok ? '#fff' : Colors.textSecondary }]}>
                {dayNum}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  cell: {
    width: 26,
    height: 26,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellCompact: { width: 12, height: 6, borderRadius: 3 },
  cellText: { fontSize: 11, fontWeight: '700' },
  unknown: { fontSize: 12, color: Colors.textSecondary, fontStyle: 'italic' },
});
