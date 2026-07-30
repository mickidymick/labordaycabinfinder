import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/colors';
import { hoverProps } from '../lib/webHover';

type Item = string | { label: string; value: string };

type Props = {
  label?: string;
  items: readonly Item[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Single-select behaves like a segmented control. */
  single?: boolean;
};

export default function ChipRow({ label, items, selected, onToggle, single }: Props) {
  return (
    <View style={styles.section}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.wrap}>
        {items.map((item) => {
          const value = typeof item === 'string' ? item : item.value;
          const text = typeof item === 'string' ? item : item.label;
          const active = selected.includes(value);
          return (
            <TouchableOpacity
              key={value}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onToggle(value)}
              accessibilityRole={single ? 'radio' : 'checkbox'}
              accessibilityLabel={text}
              accessibilityState={{ selected: active }}
              {...hoverProps('chip')}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 10 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12.5, color: Colors.text, fontWeight: '500' },
  chipTextActive: { color: '#FFF' },
});
