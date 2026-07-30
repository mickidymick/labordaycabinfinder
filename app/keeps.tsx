import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import Gate from '../components/Gate';
import ListingCard from '../components/ListingCard';
import BanMenu from '../components/BanMenu';
import { useTripConfig } from '../lib/useTripConfig';
import { useListings } from '../lib/useListings';
import { useKeeps } from '../lib/useKeeps';
import { useBans } from '../lib/useBans';
import type { ListingWithMeta } from '../lib/supabase';

export default function KeepsScreen() {
  return (
    <Gate>
      <Keeps />
    </Gate>
  );
}

function Keeps() {
  const { config } = useTripConfig();
  const { rows, loading } = useListings(config);
  const { toggleKeep } = useKeeps();
  const { ban } = useBans(config?.season_year ?? null);
  const [banTarget, setBanTarget] = useState<ListingWithMeta | null>(null);

  // Keeps ignore the trip filters entirely — the whole point is that they stick
  // around even when this year's criteria would exclude them.
  const kept = rows.filter((r) => r.is_kept);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Keeps</Text>
      <Text style={styles.subtitle}>
        The shortlist. These survive the nightly refresh and ignore your filters, so a
        favorite from this year is still here next Labor Day.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : kept.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bookmark-outline" size={40} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nothing kept yet</Text>
          <Text style={styles.emptyBody}>
            Tap the bookmark on any cabin to pin it here for the group.
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {kept.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onToggleKeep={() => toggleKeep(listing.id, true)}
              onBan={() => setBanTarget(listing)}
            />
          ))}
        </View>
      )}

      {banTarget && (
        <BanMenu
          listing={banTarget}
          visible
          onClose={() => setBanTarget(null)}
          onConfirm={async (req) => { await ban(banTarget, req); }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: Layout.maxWidth, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20, marginTop: -8, maxWidth: 560 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptyBody: { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', maxWidth: 360 },
});
