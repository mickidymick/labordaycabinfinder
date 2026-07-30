import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Layout } from '../constants/colors';
import { AMENITIES, SORT_OPTIONS, TOWNS } from '../constants/cabins';
import Gate from '../components/Gate';
import ChipRow from '../components/ChipRow';
import ListingCard from '../components/ListingCard';
import SearchProgress from '../components/SearchProgress';
import BanMenu from '../components/BanMenu';
import { useTripConfig, formatDateRange, nightCount } from '../lib/useTripConfig';
import { useListings, useFilteredListings, DEFAULT_FILTERS, type ListingFilters } from '../lib/useListings';
import { useSearchRun } from '../lib/useSearchRun';
import { useKeeps } from '../lib/useKeeps';
import { useBans } from '../lib/useBans';
import type { ListingWithMeta } from '../lib/supabase';
import { hoverProps } from '../lib/webHover';

export default function ResultsScreen() {
  return (
    <Gate>
      <Results />
    </Gate>
  );
}

function Results() {
  const router = useRouter();
  const { config } = useTripConfig();
  const { rows, loading } = useListings(config);
  const { sources, start, isRunning, error: searchError } = useSearchRun();
  const { toggleKeep } = useKeeps();
  const { ban } = useBans(config?.season_year ?? null);

  const [filters, setFilters] = useState<ListingFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [banTarget, setBanTarget] = useState<ListingWithMeta | null>(null);

  const listings = useFilteredListings(rows, filters, config);
  const nights = nightCount(config);

  const toggleIn = (key: 'amenities' | 'towns') => (value: string) =>
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
    }));

  const confirmedFree = listings.filter((l) => l.available_for_trip === true).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Trip summary + the search button */}
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Labor Day {config?.season_year ?? ''}</Text>
          <TouchableOpacity onPress={() => router.push('/trip')}>
            <Text style={styles.heroSub}>
              {formatDateRange(config)} · {nights} night{nights === 1 ? '' : 's'} ·{' '}
              {config?.guests ?? 0} people
              {config?.min_bedrooms ? ` · ${config.min_bedrooms}+ bedrooms` : ''}
              {'  '}
              <Text style={styles.heroEdit}>Edit</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.searchBtn, isRunning && styles.searchBtnBusy]}
          onPress={start}
          disabled={isRunning}
          accessibilityRole="button"
          accessibilityLabel="Search all sources"
          {...hoverProps('btn')}
        >
          {isRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="search" size={17} color="#fff" />
          )}
          <Text style={styles.searchBtnText}>{isRunning ? 'Searching…' : 'Search cabins'}</Text>
        </TouchableOpacity>
      </View>

      {searchError ? <Text style={styles.error}>{searchError}</Text> : null}
      {sources.length > 0 && <SearchProgress sources={sources} />}

      {/* Result count + filter toggle */}
      <View style={styles.toolbar}>
        <Text style={styles.resultCount}>
          {loading ? 'Loading…' : `${listings.length} cabin${listings.length === 1 ? '' : 's'}`}
          {confirmedFree > 0 ? ` · ${confirmedFree} confirmed free` : ''}
        </Text>
        <TouchableOpacity
          style={styles.filterToggle}
          onPress={() => setShowFilters((s) => !s)}
          {...hoverProps('btn')}
        >
          <Ionicons name="options-outline" size={15} color={Colors.primary} />
          <Text style={styles.filterToggleText}>{showFilters ? 'Hide filters' : 'Filters'}</Text>
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filters}>
          <ChipRow
            label="Must have"
            items={AMENITIES}
            selected={filters.amenities}
            onToggle={toggleIn('amenities')}
          />
          <ChipRow
            label="Towns"
            items={TOWNS}
            selected={filters.towns}
            onToggle={toggleIn('towns')}
          />
          <ChipRow
            label="Sort by"
            items={SORT_OPTIONS}
            selected={[filters.sort]}
            single
            onToggle={(v) => setFilters((f) => ({ ...f, sort: v as ListingFilters['sort'] }))}
          />
          <View style={styles.switchRow}>
            <Toggle
              label="Only cabins confirmed free"
              value={filters.onlyAvailable}
              onPress={() => setFilters((f) => ({ ...f, onlyAvailable: !f.onlyAvailable }))}
            />
            <Toggle
              label="Only keeps"
              value={filters.onlyKept}
              onPress={() => setFilters((f) => ({ ...f, onlyKept: !f.onlyKept }))}
            />
            <TouchableOpacity onPress={() => setFilters(DEFAULT_FILTERS)}>
              <Text style={styles.reset}>Reset</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* The grid */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : listings.length === 0 ? (
        <EmptyState hasAnyRows={rows.length > 0} onSearch={start} />
      ) : (
        <View style={styles.grid}>
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onToggleKeep={() => toggleKeep(listing.id, listing.is_kept)}
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

function Toggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.toggle}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={17}
        color={value ? Colors.primary : Colors.textSecondary}
      />
      <Text style={styles.toggleText}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ hasAnyRows, onSearch }: { hasAnyRows: boolean; onSearch: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="telescope-outline" size={40} color={Colors.textSecondary} />
      <Text style={styles.emptyTitle}>
        {hasAnyRows ? 'Nothing matches those filters' : 'No cabins yet'}
      </Text>
      <Text style={styles.emptyBody}>
        {hasAnyRows
          ? 'Loosen the filters, or check the trip settings — the shared config filters everything too.'
          : 'Hit Search to pull listings from every source.'}
      </Text>
      {!hasAnyRows && (
        <TouchableOpacity style={styles.emptyBtn} onPress={onSearch}>
          <Text style={styles.emptyBtnText}>Search cabins</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 14, maxWidth: Layout.maxWidth, width: '100%', alignSelf: 'center' },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
  },
  heroText: { flex: 1, minWidth: 220 },
  heroTitle: { fontSize: 21, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  heroSub: { fontSize: 13.5, color: Colors.textSecondary, marginTop: 3, lineHeight: 19 },
  heroEdit: { color: Colors.primary, fontWeight: '700' },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.ember,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  searchBtnBusy: { opacity: 0.75 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },

  error: {
    color: Colors.danger,
    fontSize: 13,
    backgroundColor: '#fdecea',
    padding: 10,
    borderRadius: 8,
  },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCount: { fontSize: 13.5, color: Colors.textSecondary, fontWeight: '600' },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  filterToggleText: { color: Colors.primary, fontWeight: '700', fontSize: 13.5 },

  filters: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16, flexWrap: 'wrap' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleText: { fontSize: 13, color: Colors.text },
  reset: { fontSize: 13, color: Colors.ember, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },

  empty: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  emptyBody: {
    fontSize: 13.5,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 380,
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 9,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
});
