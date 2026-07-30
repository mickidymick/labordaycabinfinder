import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';
import type { SearchRunSource } from '../lib/supabase';

/**
 * Per-source status. A source that errored or was skipped says so explicitly —
 * a broken scraper should never be indistinguishable from a site that genuinely
 * had no matching cabins.
 */
export default function SearchProgress({ sources }: { sources: SearchRunSource[] }) {
  if (sources.length === 0) return null;

  const done = sources.filter((s) => s.status !== 'pending' && s.status !== 'running').length;
  const found = sources.reduce((n, s) => n + s.found_count, 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>
          Searching {done}/{sources.length} sources
        </Text>
        {found > 0 && <Text style={styles.count}>{found} cabins so far</Text>}
      </View>

      <View style={styles.list}>
        {sources.map((s) => (
          <View key={s.id} style={styles.row}>
            <StatusIcon status={s.status} />
            <Text style={styles.slug}>{s.company_slug}</Text>
            <Text style={styles.detail} numberOfLines={1}>
              {s.status === 'done'
                ? `${s.found_count} found${s.available_count ? `, ${s.available_count} free` : ''}`
                : s.status === 'error'
                  ? (s.error ?? 'failed')
                  : s.status === 'skipped'
                    ? (s.error ?? 'skipped')
                    : s.status === 'running'
                      ? 'working…'
                      : 'queued'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StatusIcon({ status }: { status: SearchRunSource['status'] }) {
  if (status === 'running') return <ActivityIndicator size="small" color={Colors.primary} />;
  if (status === 'done') return <Ionicons name="checkmark-circle" size={16} color={Colors.success} />;
  if (status === 'error') return <Ionicons name="alert-circle" size={16} color={Colors.danger} />;
  if (status === 'skipped') return <Ionicons name="remove-circle-outline" size={16} color={Colors.textSecondary} />;
  return <Ionicons name="ellipse-outline" size={16} color={Colors.border} />;
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  header: { fontSize: 14, fontWeight: '700', color: Colors.text },
  count: { fontSize: 12.5, color: Colors.textSecondary },
  list: { gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slug: { fontSize: 12.5, fontWeight: '600', color: Colors.text, minWidth: 130 },
  detail: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
});
