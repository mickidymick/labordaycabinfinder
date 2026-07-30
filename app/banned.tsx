import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import Gate from '../components/Gate';
import { useTripConfig } from '../lib/useTripConfig';
import { useBans } from '../lib/useBans';
import type { Ban, BanScope } from '../lib/supabase';
import { hoverProps } from '../lib/webHover';

export default function BannedScreen() {
  return (
    <Gate>
      <Banned />
    </Gate>
  );
}

const SCOPE_LABEL: Record<BanScope, string> = {
  listing: 'Listing',
  property: 'Cabin (all sites)',
  company: 'Whole company',
};

const SCOPE_ICON: Record<BanScope, keyof typeof Ionicons.glyphMap> = {
  listing: 'document-outline',
  property: 'home-outline',
  company: 'business-outline',
};

function Banned() {
  const { config } = useTripConfig();
  const { bans, loading, unban } = useBans(config?.season_year ?? null);
  const seasonYear = config?.season_year ?? null;

  // A "season" ban from a previous year is expired — it's already not filtering
  // anything, so show it separately rather than implying it's still in force.
  const active = bans.filter(
    (b) => b.duration === 'forever' || b.season_year === seasonYear,
  );
  const expired = bans.filter(
    (b) => b.duration === 'season' && b.season_year !== seasonYear,
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Banned</Text>
      <Text style={styles.subtitle}>
        Anyone can veto and anyone can lift a veto. "This year only" bans expire when the
        season year changes on the Trip page.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : bans.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="thumbs-up-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nothing banned</Text>
          <Text style={styles.emptyBody}>Everything's still in the running.</Text>
        </View>
      ) : (
        <>
          <BanList
            heading={`Active (${active.length})`}
            bans={active}
            seasonYear={seasonYear}
            onUnban={unban}
          />
          {expired.length > 0 && (
            <BanList
              heading={`Expired (${expired.length})`}
              bans={expired}
              seasonYear={seasonYear}
              onUnban={unban}
              muted
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

function BanList({
  heading,
  bans,
  seasonYear,
  onUnban,
  muted,
}: {
  heading: string;
  bans: Ban[];
  seasonYear: number | null;
  onUnban: (id: string) => void;
  muted?: boolean;
}) {
  if (bans.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupHeading}>{heading}</Text>
      {bans.map((ban) => (
        <View key={ban.id} style={[styles.row, muted && styles.rowMuted]}>
          <Ionicons name={SCOPE_ICON[ban.scope]} size={18} color={Colors.textSecondary} />
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {ban.target_label ?? ban.target_id}
            </Text>
            <Text style={styles.rowMeta}>
              {SCOPE_LABEL[ban.scope]} ·{' '}
              {ban.duration === 'forever'
                ? 'forever'
                : ban.season_year === seasonYear
                  ? `${ban.season_year} only`
                  : `${ban.season_year} only (expired)`}
              {ban.reason ? ` · ${ban.reason}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.unban}
            onPress={() => onUnban(ban.id)}
            accessibilityRole="button"
            accessibilityLabel={`Unban ${ban.target_label ?? 'listing'}`}
            {...hoverProps('btn')}
          >
            <Text style={styles.unbanText}>Unban</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: 800, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginTop: -8, maxWidth: 560 },

  group: { gap: 8 },
  groupHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  rowMuted: { opacity: 0.6 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '600', color: Colors.text },
  rowMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  unban: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  unbanText: { color: Colors.primary, fontWeight: '700', fontSize: 12.5 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptyBody: { fontSize: 13.5, color: Colors.textSecondary },
});
