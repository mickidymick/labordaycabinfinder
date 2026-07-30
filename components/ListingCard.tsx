import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import { AMENITIES } from '../constants/cabins';
import LazyImage from './LazyImage';
import type { ListingWithMeta } from '../lib/supabase';
import { hoverProps } from '../lib/webHover';

// Widened to string: listing.amenities comes back from Postgres as plain
// strings, not the literal union, and may contain keys we've since renamed.
const AMENITY_LABEL = new Map<string, string>(AMENITIES.map((a) => [a.value, a.label]));

const AMENITY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  hot_tub: 'water-outline',
  pool_private: 'water',
  pool_shared: 'water-outline',
  pool_table: 'grid-outline',
  arcade: 'game-controller-outline',
  theater: 'film-outline',
  fireplace: 'flame-outline',
  mountain_view: 'triangle-outline',
  pet_friendly: 'paw-outline',
  firepit: 'bonfire-outline',
};

/** Amenities worth surfacing on a card, in the order the group cares about them. */
const HIGHLIGHT_ORDER = ['hot_tub', 'pool_private', 'arcade', 'pool_table', 'theater', 'mountain_view', 'pet_friendly'];

type Props = {
  listing: ListingWithMeta;
  onToggleKeep: () => void;
  onBan: () => void;
};

export default function ListingCard({ listing, onToggleKeep, onBan }: Props) {
  const router = useRouter();

  const openListing = () => {
    if (Platform.OS === 'web') window.open(listing.url, '_blank', 'noopener,noreferrer');
    else Linking.openURL(listing.url);
  };

  const highlights = HIGHLIGHT_ORDER.filter((a) => listing.amenities?.includes(a)).slice(0, 4);

  return (
    <View style={styles.card} {...hoverProps('card')}>
      <TouchableOpacity
        onPress={() => router.push(`/listing/${listing.id}` as any)}
        accessibilityRole="link"
        accessibilityLabel={`${listing.name} details`}
      >
        <View>
          <LazyImage
            source={{ uri: listing.hero_image_url ?? '' }}
            style={styles.hero}
            resizeMode="cover"
          />
          <AvailabilityBadge value={listing.available_for_trip} />
          {listing.is_kept && (
            <View style={styles.keptFlag}>
              <Ionicons name="bookmark" size={12} color="#fff" />
              <Text style={styles.keptFlagText}>Kept</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.body}>
        <TouchableOpacity onPress={() => router.push(`/listing/${listing.id}` as any)}>
          <Text style={styles.name} numberOfLines={1}>{listing.name}</Text>
        </TouchableOpacity>

        <View style={styles.metaRow}>
          <Text style={styles.meta}>{listing.company_name}</Text>
          {listing.town ? <Text style={styles.metaDot}>·</Text> : null}
          {listing.town ? <Text style={styles.meta}>{listing.town}</Text> : null}
          {listing.drive_minutes != null ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.meta}>{listing.drive_minutes}m from KNX</Text>
            </>
          ) : null}
        </View>

        <View style={styles.statRow}>
          {listing.bedrooms != null && <Stat icon="bed-outline" text={`${listing.bedrooms} bd`} />}
          {listing.bathrooms != null && <Stat icon="water-outline" text={`${listing.bathrooms} ba`} />}
          {listing.sleeps != null && <Stat icon="people-outline" text={`sleeps ${listing.sleeps}`} />}
          {listing.rating != null && (
            <Stat icon="star" text={`${Number(listing.rating).toFixed(2)}${listing.review_count ? ` (${listing.review_count})` : ''}`} />
          )}
        </View>

        {highlights.length > 0 && (
          <View style={styles.amenityRow}>
            {highlights.map((a) => (
              <View key={a} style={styles.amenity}>
                <Ionicons
                  name={AMENITY_ICON[a] ?? 'checkmark-circle-outline'}
                  size={12}
                  color={Colors.primary}
                />
                <Text style={styles.amenityText}>{AMENITY_LABEL.get(a) ?? a}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <View>
            {listing.trip_total != null ? (
              <>
                <Text style={styles.price}>${Math.round(Number(listing.trip_total))}</Text>
                <Text style={styles.priceUnit}>total for the trip</Text>
              </>
            ) : listing.nightly_rate_from != null ? (
              <>
                <Text style={styles.price}>${Math.round(Number(listing.nightly_rate_from))}</Text>
                <Text style={styles.priceUnit}>per night, from</Text>
              </>
            ) : (
              <Text style={styles.priceUnit}>Price not listed</Text>
            )}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              onPress={onToggleKeep}
              style={[styles.iconBtn, listing.is_kept && styles.iconBtnActive]}
              accessibilityRole="button"
              accessibilityLabel={listing.is_kept ? 'Remove from keeps' : 'Keep this cabin'}
              {...hoverProps('icon')}
            >
              <Ionicons
                name={listing.is_kept ? 'bookmark' : 'bookmark-outline'}
                size={17}
                color={listing.is_kept ? '#fff' : Colors.primary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onBan}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Hide this cabin"
              {...hoverProps('icon')}
            >
              <Ionicons name="close" size={17} color={Colors.danger} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openListing}
              style={styles.viewBtn}
              accessibilityRole="link"
              accessibilityLabel={`Open ${listing.name} on ${listing.company_name}`}
              {...hoverProps('btn')}
            >
              <Text style={styles.viewBtnText}>View</Text>
              <Ionicons name="open-outline" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

function Stat({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={13} color={Colors.textSecondary} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

/**
 * Three states, not two. `null` means the source has no queryable calendar —
 * that's genuinely different from "booked" and must not look like a rejection.
 */
function AvailabilityBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <View style={[styles.badge, { backgroundColor: Colors.success }]}>
        <Ionicons name="checkmark-circle" size={12} color="#fff" />
        <Text style={styles.badgeText}>Free your dates</Text>
      </View>
    );
  }
  if (value === false) {
    return (
      <View style={[styles.badge, { backgroundColor: Colors.danger }]}>
        <Text style={styles.badgeText}>Booked</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: 'rgba(31,42,39,0.75)' }]}>
      <Ionicons name="help-circle-outline" size={12} color="#fff" />
      <Text style={styles.badgeText}>Check dates</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    flexGrow: 1,
    flexBasis: Layout.cardMinWidth,
    maxWidth: 420,
  },
  hero: { width: '100%', height: 190, backgroundColor: Colors.secondary },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  keptFlag: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  keptFlagText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  body: { padding: 13, gap: 7 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  meta: { fontSize: 12, color: Colors.textSecondary },
  metaDot: { fontSize: 12, color: Colors.border },

  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 12.5, color: Colors.text, fontWeight: '500' },

  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  amenity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  amenityText: { fontSize: 11, color: Colors.primary, fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: 8,
  },
  price: { fontSize: 19, fontWeight: '800', color: Colors.text },
  priceUnit: { fontSize: 11, color: Colors.textSecondary },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
