import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../../constants/colors';
import { AMENITIES } from '../../constants/cabins';
import Gate from '../../components/Gate';
import LazyImage from '../../components/LazyImage';
import AvailabilityStrip from '../../components/AvailabilityStrip';
import BanMenu from '../../components/BanMenu';
import { supabase, type Availability, type ListingWithMeta } from '../../lib/supabase';
import { useTripConfig, formatDateRange } from '../../lib/useTripConfig';
import { useKeeps } from '../../lib/useKeeps';
import { useBans } from '../../lib/useBans';
import { hoverProps } from '../../lib/webHover';

// Widened to string: listing.amenities comes back from Postgres as plain
// strings, not the literal union, and may contain keys we've since renamed.
const AMENITY_LABEL = new Map<string, string>(AMENITIES.map((a) => [a.value, a.label]));

export default function ListingScreen() {
  return (
    <Gate>
      <ListingDetail />
    </Gate>
  );
}

function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { config } = useTripConfig();
  const { toggleKeep } = useKeeps();
  const { ban } = useBans(config?.season_year ?? null);

  const [listing, setListing] = useState<ListingWithMeta | null>(null);
  const [days, setDays] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBan, setShowBan] = useState(false);

  useEffect(() => {
    if (!id || !config) return;
    (async () => {
      const { data } = await supabase.from('visible_listings').select('*').eq('id', id).maybeSingle();
      setListing((data as ListingWithMeta) ?? null);

      // Pull a padded window so the strip can show the shoulder days too.
      const { data: avail } = await supabase
        .from('availability')
        .select('*')
        .eq('listing_id', id)
        .order('day');
      setDays((avail ?? []) as Availability[]);
      setLoading(false);
    })();
  }, [id, config]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>;
  }

  if (!listing) {
    return (
      <View style={styles.center}>
        <Ionicons name="eye-off-outline" size={40} color={Colors.textSecondary} />
        <Text style={styles.emptyTitle}>Not available</Text>
        <Text style={styles.emptyBody}>
          This cabin was either banned or removed by the last refresh.
        </Text>
      </View>
    );
  }

  const open = () => {
    if (Platform.OS === 'web') window.open(listing.url, '_blank', 'noopener,noreferrer');
    else Linking.openURL(listing.url);
  };

  const tripDays = config
    ? days.filter((d) => d.day >= config.check_in && d.day < config.check_out)
    : [];

  const gallery = (listing.image_urls ?? []).slice(0, 6);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LazyImage
        source={{ uri: listing.hero_image_url ?? '' }}
        style={styles.hero}
        resizeMode="cover"
      />

      {gallery.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {gallery.map((url) => (
            <LazyImage key={url} source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{listing.name}</Text>
          <Text style={styles.meta}>
            {listing.company_name}
            {listing.town ? ` · ${listing.town}` : ''}
            {listing.drive_minutes != null ? ` · ~${listing.drive_minutes} min from Knoxville` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.statRow}>
        {listing.bedrooms != null && <Stat icon="bed-outline" label={`${listing.bedrooms} bedrooms`} />}
        {listing.bathrooms != null && <Stat icon="water-outline" label={`${listing.bathrooms} baths`} />}
        {listing.sleeps != null && <Stat icon="people-outline" label={`Sleeps ${listing.sleeps}`} />}
        {listing.rating != null && (
          <Stat
            icon="star"
            label={`${Number(listing.rating).toFixed(2)}${listing.review_count ? ` · ${listing.review_count} reviews` : ''}`}
          />
        )}
      </View>

      {/* Availability */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your dates</Text>
        <Text style={styles.cardSub}>{formatDateRange(config)}</Text>

        {listing.available_for_trip === true ? (
          <Verdict tone="good" icon="checkmark-circle" text="Free for the whole stay" />
        ) : listing.available_for_trip === false ? (
          <Verdict tone="bad" icon="close-circle" text="Booked for at least one night" />
        ) : (
          <Verdict
            tone="unknown"
            icon="help-circle"
            text={
              listing.supports_availability
                ? "We haven't pulled this cabin's calendar yet"
                : "This site doesn't publish a calendar we can read — check their page"
            }
          />
        )}

        <View style={{ marginTop: 12 }}>
          <AvailabilityStrip days={tripDays.map((d) => ({ day: d.day, state: d.state }))} />
        </View>

        {listing.trip_total != null && (
          <Text style={styles.total}>
            ${Math.round(Number(listing.trip_total))} total for the stay
          </Text>
        )}
      </View>

      {/* Amenities */}
      {(listing.amenities ?? []).length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Amenities</Text>
          <View style={styles.amenityWrap}>
            {(listing.amenities ?? []).map((a) => (
              <View key={a} style={styles.amenity}>
                <Ionicons name="checkmark" size={13} color={Colors.primary} />
                <Text style={styles.amenityText}>{AMENITY_LABEL.get(a) ?? a}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {listing.description ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Text style={styles.description}>{listing.description}</Text>
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={open} {...hoverProps('btn')}>
          <Text style={styles.primaryBtnText}>Open on {listing.company_name}</Text>
          <Ionicons name="open-outline" size={15} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, listing.is_kept && styles.keptBtn]}
          onPress={async () => {
            await toggleKeep(listing.id, listing.is_kept);
            setListing((l) => (l ? { ...l, is_kept: !l.is_kept } : l));
          }}
        >
          <Ionicons
            name={listing.is_kept ? 'bookmark' : 'bookmark-outline'}
            size={16}
            color={listing.is_kept ? '#fff' : Colors.primary}
          />
          <Text style={[styles.secondaryBtnText, listing.is_kept && styles.keptBtnText]}>
            {listing.is_kept ? 'Kept' : 'Keep'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.banBtn} onPress={() => setShowBan(true)}>
          <Ionicons name="close" size={16} color={Colors.danger} />
          <Text style={styles.banBtnText}>Hide</Text>
        </TouchableOpacity>
      </View>

      <BanMenu
        listing={listing}
        visible={showBan}
        onClose={() => setShowBan(false)}
        onConfirm={async (req) => { await ban(listing, req); }}
      />
    </ScrollView>
  );
}

function Stat({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color={Colors.primary} />
      <Text style={styles.statText}>{label}</Text>
    </View>
  );
}

function Verdict({
  tone,
  icon,
  text,
}: {
  tone: 'good' | 'bad' | 'unknown';
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const color =
    tone === 'good' ? Colors.success : tone === 'bad' ? Colors.danger : Colors.textSecondary;
  return (
    <View style={styles.verdict}>
      <Ionicons name={icon} size={17} color={color} />
      <Text style={[styles.verdictText, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: 860, width: '100%', alignSelf: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.background,
    padding: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptyBody: { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', maxWidth: 340 },

  hero: { width: '100%', height: 320, borderRadius: 14, backgroundColor: Colors.secondary },
  strip: { gap: 8 },
  thumb: { width: 110, height: 74, borderRadius: 8, backgroundColor: Colors.secondary },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  name: { fontSize: 25, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  meta: { fontSize: 13.5, color: Colors.textSecondary, marginTop: 4 },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 14, color: Colors.text, fontWeight: '500' },

  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 15,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 },
  verdictText: { fontSize: 14, fontWeight: '600', flex: 1 },
  total: { fontSize: 15, fontWeight: '700', color: Colors.text, marginTop: 12 },

  amenityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
  },
  amenityText: { fontSize: 12.5, color: Colors.primary, fontWeight: '600' },

  description: { fontSize: 14, color: Colors.text, lineHeight: 21, marginTop: 8 },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  keptBtn: { backgroundColor: Colors.primary },
  keptBtnText: { color: '#fff' },
  banBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 10,
  },
  banBtnText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
});
