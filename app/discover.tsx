import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { Logo } from '@/components/Logo';
import { createOrUpdateMatch, getDiscoverProfiles, getMyProfile, getMyProfileCourses, upsertMyProfile, type Course, type GenderFilter, type Profile } from '@/lib/data';
import { canSendPartnerRequest, FREE_MONTHLY_PARTNER_REQUEST_LIMIT, isTeeMatePlus, recordPartnerRequestUsage } from '@/lib/premium';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

const GENDER_FILTERS: GenderFilter[] = ['any', 'male', 'female', 'nonbinary', 'prefer_not_to_say', 'other'];
const SKILL_FILTERS = ['any', 'beginner', 'casual', 'solid', 'strong', 'low_handicap'];
const DISTANCE_FILTERS = ['any', '50', '250', '500'];

function labelText(value?: string | null) { return value ? value.replace(/_/g, ' ') : 'Not listed'; }
function distanceMiles(me?: Profile | null, other?: Profile | null) {
  if (!me?.approx_lat || !me?.approx_lng || !other?.approx_lat || !other?.approx_lng) return null;
  const r = 3958.8;
  const dLat = ((other.approx_lat - me.approx_lat) * Math.PI) / 180;
  const dLng = ((other.approx_lng - me.approx_lng) * Math.PI) / 180;
  const lat1 = (me.approx_lat * Math.PI) / 180;
  const lat2 = (other.approx_lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DiscoverScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [myCourses, setMyCourses] = useState<Course[]>([]);
  const [detail, setDetail] = useState<Profile | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('any');
  const [skillFilter, setSkillFilter] = useState('any');
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('99');
  const [includeUnsetAge, setIncludeUnsetAge] = useState(true);
  const [distanceFilter, setDistanceFilter] = useState('any');
  const [courseFilter, setCourseFilter] = useState('any');
  const [zipCode, setZipCode] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [freeRequestsRemaining, setFreeRequestsRemaining] = useState<number | null>(null);

  const premium = isTeeMatePlus(myProfile as any);
  const activeFilterCount = [genderFilter, skillFilter, courseFilter].filter((value) => value !== 'any').length + (distanceFilter !== 'any' ? 1 : 0) + (ageMin !== '18' || ageMax !== '99' || !includeUnsetAge ? 1 : 0);

  const filteredProfiles = useMemo(() => profiles.filter((profile) => {
    if (genderFilter !== 'any' && profile.gender !== genderFilter) return false;
    if (skillFilter !== 'any' && profile.skill !== skillFilter) return false;
    if (courseFilter !== 'any' && !(profile.course_ids ?? []).includes(courseFilter)) return false;
    const min = Number(ageMin || 18);
    const max = Number(ageMax || 99);
    if (profile.age == null && !includeUnsetAge) return false;
    if (profile.age != null && (profile.age < min || profile.age > max)) return false;
    if (distanceFilter !== 'any') {
      const miles = distanceMiles(myProfile, profile);
      if (miles == null) return true;
      if (miles > Number(distanceFilter)) return false;
    }
    return true;
  }), [profiles, myProfile, genderFilter, skillFilter, courseFilter, distanceFilter, ageMin, ageMax, includeUnsetAge]);

  async function refreshUsage(profile: Profile | null) {
    if (!session?.user.id || isTeeMatePlus(profile as any)) { setFreeRequestsRemaining(null); return; }
    const status = await canSendPartnerRequest(profile as any, session.user.id);
    if (!status.error) setFreeRequestsRemaining(status.remaining);
  }

  async function load() {
    if (!session?.user.id) return;
    setRefreshing(true);
    const [{ data: me }, { data, error }, { data: courses, error: courseError }] = await Promise.all([
      getMyProfile(session.user.id),
      getDiscoverProfiles(session.user.id),
      getMyProfileCourses(session.user.id),
    ]);
    setMyProfile(me ?? null);
    setZipCode(me?.home_area ?? '');
    if (error) Alert.alert('Find partners error', error.message);
    if (courseError) Alert.alert('Course filter error', courseError.message);
    setProfiles(data ?? []);
    setMyCourses(courses ?? []);
    setRefreshing(false);
    await refreshUsage(me ?? null);
  }

  useEffect(() => { load(); }, [session?.user.id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;
  if (myProfile && !myProfile.onboarding_complete) return <Redirect href="/profile" />;

  async function act(profile: Profile, status: 'pending' | 'declined' | 'matched') {
    if (!session?.user.id) return;
    if (status === 'pending') {
      const permission = await canSendPartnerRequest(myProfile as any, session.user.id);
      if (permission.error) return Alert.alert('Request limit error', permission.error.message);
      if (!permission.allowed) { setPremiumOpen(true); return; }
    }
    setBusyId(profile.id);
    const { error } = await createOrUpdateMatch(session.user.id, profile.id, status, profile.score ?? null);
    if (!error && status === 'pending') await recordPartnerRequestUsage(session.user.id, profile.id);
    setBusyId(null);
    if (error) return Alert.alert('Connection request error', error.message);
    setDetail(null);
    setProfiles((current) => current.filter((item) => item.id !== profile.id));
    await refreshUsage(myProfile);
  }

  async function updateZip() {
    if (!session?.user.id) return;
    const { data, error } = await upsertMyProfile(session.user.id, { home_area: zipCode.trim() || null });
    if (error) return Alert.alert('Location error', error.message);
    setMyProfile(data);
    Alert.alert('Location updated', 'Your location text has been updated. Use GPS for distance-based matching.');
  }

  async function useGps() {
    if (!session?.user.id) return;
    setGpsBusy(true);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') { setGpsBusy(false); return Alert.alert('GPS permission needed', 'Allow location access to update your TeeMate location.'); }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let area = zipCode;
    try {
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places?.[0];
      area = [place?.city, place?.region].filter(Boolean).join(', ') || place?.postalCode || area;
    } catch {}
    const { data, error } = await upsertMyProfile(session.user.id, { approx_lat: position.coords.latitude, approx_lng: position.coords.longitude, home_area: area || null });
    setGpsBusy(false);
    if (error) return Alert.alert('GPS error', error.message);
    setMyProfile(data);
    setZipCode(area || '');
    Alert.alert('GPS updated', 'Your location was updated for partner distance filters.');
  }

  function resetFilters() { setGenderFilter('any'); setSkillFilter('any'); setAgeMin('18'); setAgeMax('99'); setIncludeUnsetAge(true); setDistanceFilter('any'); setCourseFilter('any'); }
  async function signOut() { await supabase.auth.signOut(); }
  function openUpgrade() { setPremiumOpen(false); router.push('/upgrade' as any); }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.topbar}><Logo /><TouchableOpacity onPress={signOut} style={styles.iconButton}><Ionicons name="log-out-outline" size={20} color={colors.pine} /></TouchableOpacity></View>
        <View style={styles.titleRow}><View style={styles.titleCopy}><Text style={styles.pageTitle}>Find Playing Partners</Text><Text style={styles.pageSubtitle}>Find compatible golfers. Distance filtering is optional.</Text></View><TouchableOpacity onPress={() => setFiltersOpen(true)} style={styles.filterButton}><Ionicons name="options-outline" size={18} color={colors.ink} /><Text style={styles.filterButtonText}>Filters</Text>{activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}</TouchableOpacity></View>
        <View style={styles.usageRow}><Text style={styles.nearby}>{filteredProfiles.length} nearby</Text>{premium ? <Text style={styles.plusPill}>TeeMate+</Text> : <Text style={styles.usageText}>{freeRequestsRemaining ?? FREE_MONTHLY_PARTNER_REQUEST_LIMIT} of {FREE_MONTHLY_PARTNER_REQUEST_LIMIT} free requests left this month</Text>}</View>
        {!refreshing && filteredProfiles.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="flag-outline" size={34} color={colors.pine} /></View><Text style={styles.emptyTitle}>No partners showing</Text><Text style={styles.emptyText}>No new playing partners match the current filters. Tap Filters, reset them, or make sure other users completed onboarding.</Text></View> : null}
        {filteredProfiles.slice(0, 1).map((profile) => <View key={profile.id}><TouchableOpacity activeOpacity={0.92} onPress={() => setDetail(profile)}><ProfilePreview profile={profile} /></TouchableOpacity><View style={styles.actionRow}><TouchableOpacity disabled={busyId === profile.id} onPress={() => act(profile, 'declined')} style={styles.smallCircle}><Ionicons name="close" size={30} color={colors.muted} /></TouchableOpacity><TouchableOpacity disabled={busyId === profile.id} onPress={() => act(profile, 'pending')} style={styles.inviteButton}>{busyId === profile.id ? <ActivityIndicator color={colors.pine} /> : <><Ionicons name="golf-outline" size={25} color={colors.pine} /><Text style={styles.inviteText}>Invite</Text></>}</TouchableOpacity><TouchableOpacity style={styles.smallCircle} onPress={() => premium ? Alert.alert('Boost', 'Boosted! You will show higher in partner discovery soon.') : setPremiumOpen(true)}><Ionicons name="flash" size={28} color="#D97706" /></TouchableOpacity></View></View>)}
      </ScrollView>

      <Modal visible={filtersOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFiltersOpen(false)}><SafeAreaView style={styles.modalScreen}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.modalHeader}><Text style={styles.modalTitle}>Partner filters</Text><TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity></View><View style={styles.filterGroup}><Text style={styles.filterLabel}>Your location</Text><Text style={styles.locationText}><Ionicons name="location-outline" size={12} color={colors.muted} /> {myProfile?.home_area || 'Not set'}</Text><TouchableOpacity disabled={gpsBusy} onPress={useGps} style={styles.gpsButton}>{gpsBusy ? <ActivityIndicator color={colors.cream} /> : <><Ionicons name="locate-outline" size={16} color={colors.cream} /><Text style={styles.gpsText}>Use my GPS</Text></>}</TouchableOpacity><View style={styles.zipRow}><TextInput value={zipCode} onChangeText={setZipCode} placeholder="ZIP code" placeholderTextColor={colors.muted} style={styles.zipInput} keyboardType="numbers-and-punctuation" /><TouchableOpacity onPress={updateZip} style={styles.setButton}><Text style={styles.setText}>Set</Text></TouchableOpacity></View></View><View style={styles.filterGroup}><View style={styles.filterLabelRow}><Text style={styles.filterLabel}>Max distance</Text><Text style={styles.filterHelper}>Within {distanceFilter === 'any' ? 'any distance' : `${distanceFilter} mi`}</Text></View><View style={styles.distanceBar}>{DISTANCE_FILTERS.map((option) => <TouchableOpacity key={option} onPress={() => setDistanceFilter(option)} style={[styles.distanceDot, distanceFilter === option && styles.distanceDotActive]} />)}</View><View style={styles.distanceLabels}><Text style={styles.distanceLabel}>Any</Text><Text style={styles.distanceLabel}>50 mi</Text><Text style={styles.distanceLabel}>250 mi</Text><Text style={styles.distanceLabel}>500 mi</Text></View></View><FilterGroup label="Skill level" value={skillFilter} options={SKILL_FILTERS} onChange={setSkillFilter} /><View style={styles.filterGroup}><View style={styles.filterLabelRow}><Text style={styles.filterLabel}>Age range</Text><Text style={styles.filterHelper}>{ageMin}–{ageMax}+</Text></View><View style={styles.ageRow}><View style={styles.ageBox}><Text style={styles.ageLabel}>MIN</Text><TextInput value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad" style={styles.ageInput} /></View><View style={styles.ageBox}><Text style={styles.ageLabel}>MAX</Text><TextInput value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad" style={styles.ageInput} /></View></View><TouchableOpacity onPress={() => setIncludeUnsetAge(!includeUnsetAge)} style={styles.checkRow}><Ionicons name={includeUnsetAge ? 'checkbox' : 'square-outline'} size={18} color={colors.pine} /><Text style={styles.filterHelper}>Include golfers who haven’t set their age</Text></TouchableOpacity></View><FilterGroup label="Gender" helper="Filter partner suggestions by gender. This is a golf preference, not a dating preference." value={genderFilter} options={GENDER_FILTERS} onChange={(value) => setGenderFilter(value as GenderFilter)} /><View style={styles.filterGroup}><Text style={styles.filterLabel}>Filter by your courses</Text><Text style={styles.filterHelper}>Only show golfers who play at least one of these courses.</Text>{myCourses.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}><TouchableOpacity onPress={() => setCourseFilter('any')} style={[styles.filterChip, courseFilter === 'any' && styles.filterChipActive]}><Text style={[styles.filterText, courseFilter === 'any' && styles.filterTextActive]}>Any</Text></TouchableOpacity>{myCourses.map((course) => <TouchableOpacity key={course.id} onPress={() => setCourseFilter(course.id)} style={[styles.filterChip, courseFilter === course.id && styles.filterChipActive]}><Text style={[styles.filterText, courseFilter === course.id && styles.filterTextActive]}>{course.name}</Text></TouchableOpacity>)}</ScrollView> : <Text style={styles.noCourses}>Save courses on your profile to use this filter.</Text>}</View><View style={styles.modalActions}><TouchableOpacity onPress={resetFilters} style={styles.resetButton}><Text style={styles.resetButtonText}>Reset</Text></TouchableOpacity><TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.applyButton}><Text style={styles.applyButtonText}>Apply</Text></TouchableOpacity></View></ScrollView></SafeAreaView></Modal>
      <PremiumPrompt visible={premiumOpen} onClose={() => setPremiumOpen(false)} onUpgrade={openUpgrade} />
      <ProfileDetailModal profile={detail} onClose={() => setDetail(null)} onPass={(profile) => act(profile, 'declined')} onInvite={(profile) => act(profile, 'pending')} busy={busyId} />
      <BottomNav />
    </SafeAreaView>
  );
}

function FilterGroup({ label, helper, value, options, onChange }: { label: string; helper?: string; value: string; options: readonly string[]; onChange: (value: string) => void }) { return <View style={styles.filterGroup}><Text style={styles.filterLabel}>{label}</Text>{helper ? <Text style={styles.filterHelper}>{helper}</Text> : null}<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{options.map((option) => <TouchableOpacity key={option} onPress={() => onChange(option)} style={[styles.filterChip, value === option && styles.filterChipActive]}><Text style={[styles.filterText, value === option && styles.filterTextActive]}>{option === 'any' ? 'Any' : labelText(option)}</Text></TouchableOpacity>)}</ScrollView></View>; }
function ProfilePreview({ profile }: { profile: Profile }) { const badge = profile.founder_badge || profile.founding_member || profile.lifetime_premium; const meta = [profile.skill, profile.home_area].filter(Boolean).join(' • '); const score = profile.score ?? 87; return <View style={styles.profileCard}><View style={styles.hero}><Text style={styles.tap}>Tap for details</Text><View style={styles.scoreBadge}><Ionicons name="sparkles" size={14} color={colors.ink} /><Text style={styles.scoreText}>{score}% golf fit</Text></View>{badge ? <Text style={styles.founderBadge}>Founder</Text> : null}<Text style={styles.heroInitial}>{profile.display_name?.charAt(0)?.toUpperCase() || '?'}</Text><View style={styles.heroFooter}><Text style={styles.name}>{profile.display_name || 'TeeMate golfer'}</Text><Text style={styles.heroMeta}>{meta || 'Local golfer'} • {labelText(profile.gender)}</Text></View></View><View style={styles.cardBody}>{profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.bio}>Open to connecting with golfers and organizing rounds.</Text>}<View style={styles.chips}>{profile.handicap_index != null ? <Text style={styles.chip}>HCP {profile.handicap_index}</Text> : null}<Text style={styles.chip}>{profile.pace || 'any'} pace</Text><Text style={styles.chip}>{profile.travel || 'walk/ride'}</Text></View></View></View>; }
function ProfileDetailModal({ profile, onClose, onPass, onInvite, busy }: { profile: Profile | null; onClose: () => void; onPass: (profile: Profile) => void; onInvite: (profile: Profile) => void; busy: string | null }) { if (!profile) return null; const badge = profile.founder_badge || profile.founding_member || profile.lifetime_premium; const score = profile.score ?? 87; return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.detailScreen}><ScrollView contentContainerStyle={styles.detailContent}><TouchableOpacity onPress={onClose} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.cream} /></TouchableOpacity><View style={styles.detailHero}><View style={styles.scoreBadge}><Ionicons name="sparkles" size={14} color={colors.ink} /><Text style={styles.scoreText}>{score}% golf fit</Text></View>{badge ? <Text style={styles.founderBadge}>Founder</Text> : null}<Text style={styles.detailInitial}>{profile.display_name?.charAt(0)?.toUpperCase() || '?'}</Text></View><View style={styles.detailBody}><Text style={styles.detailName}>{profile.display_name || 'TeeMate golfer'}</Text><Text style={styles.detailMeta}>{[profile.home_area, profile.skill, labelText(profile.gender)].filter(Boolean).join(' • ') || 'Local golfer'}</Text>{profile.bio ? <Text style={styles.detailBio}>{profile.bio}</Text> : null}<View style={styles.statsGrid}><DetailStat label="Rounds" value={String(profile.rounds_played ?? 0)} /><DetailStat label="Completed" value={String(profile.rounds_completed ?? 0)} /><DetailStat label="Rating" value={profile.avg_rating ? Number(profile.avg_rating).toFixed(1) : '—'} /></View><View style={styles.infoGrid}>{profile.handicap_index != null ? <InfoChip icon="flag-outline" label={`HCP ${profile.handicap_index}`} /> : null}{profile.holes_pref ? <InfoChip icon="golf-outline" label={`${profile.holes_pref} holes`} /> : null}{profile.pace ? <InfoChip icon="time-outline" label={`${profile.pace} pace`} /> : null}{profile.travel ? <InfoChip icon="walk-outline" label={profile.travel} /> : null}</View>{profile.looking_for?.length ? <View style={styles.sectionBlock}><Text style={styles.sectionTitle}>Golf goals</Text><View style={styles.chips}>{profile.looking_for.map((item) => <Text key={item} style={styles.chip}>{item}</Text>)}</View></View> : null}<View style={styles.detailActions}><TouchableOpacity disabled={busy === profile.id} onPress={() => onPass(profile)} style={styles.detailPass}><Ionicons name="close" size={28} color={colors.muted} /></TouchableOpacity><TouchableOpacity disabled={busy === profile.id} onPress={() => onInvite(profile)} style={styles.detailInvite}>{busy === profile.id ? <ActivityIndicator color={colors.pine} /> : <><Ionicons name="golf-outline" size={28} color={colors.pine} /><Text style={styles.inviteText}>Invite to Play</Text></>}</TouchableOpacity></View></View></ScrollView></SafeAreaView></Modal>; }
function PremiumPrompt({ visible, onClose, onUpgrade }: { visible: boolean; onClose: () => void; onUpgrade: () => void }) { return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.promptOverlay}><View style={styles.promptCard}><View style={styles.promptIcon}><Ionicons name="flash" size={28} color={colors.pine} /></View><Text style={styles.promptTitle}>Unlock unlimited requests</Text><Text style={styles.promptBody}>Free members get {FREE_MONTHLY_PARTNER_REQUEST_LIMIT} partner requests per month. Upgrade to TeeMate+ to send unlimited requests, use advanced filters, boost your profile, and see who wants to play.</Text><TouchableOpacity onPress={onUpgrade} style={styles.promptPrimary}><Text style={styles.promptPrimaryText}>Upgrade to TeeMate+</Text></TouchableOpacity><TouchableOpacity onPress={onClose} style={styles.promptSecondary}><Text style={styles.promptSecondaryText}>Maybe later</Text></TouchableOpacity></View></View></Modal>; }
function DetailStat({ label, value }: { label: string; value: string }) { return <View style={styles.detailStat}><Text style={styles.detailStatValue}>{value}</Text><Text style={styles.detailStatLabel}>{label}</Text></View>; }
function InfoChip({ icon, label }: { icon: any; label: string }) { return <View style={styles.infoChip}><Ionicons name={icon} size={16} color={colors.pine} /><Text style={styles.infoChipText}>{label}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 116 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingTop: 4 },
  iconButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  titleCopy: { flex: 1 },
  pageTitle: { color: colors.pine, flexShrink: 1, fontSize: 30, fontWeight: '900', letterSpacing: -0.5 },
  pageSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  usageRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginBottom: 14, marginTop: 8 },
  nearby: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  usageText: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  plusPill: { backgroundColor: colors.lime, borderRadius: 999, color: colors.ink, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  filterButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, paddingHorizontal: 13, paddingVertical: 10, position: 'relative' },
  filterButtonText: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  filterBadge: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, minWidth: 18, paddingHorizontal: 5, paddingVertical: 2 },
  filterBadgeText: { color: colors.ink, fontSize: 10, fontWeight: '900' },
  empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, marginTop: 22, padding: 28 },
  emptyIcon: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, height: 70, justifyContent: 'center', marginBottom: 14, width: 70 },
  emptyTitle: { color: colors.pine, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  actionRow: { alignItems: 'center', flexDirection: 'row', gap: 14, justifyContent: 'center', marginTop: 16 },
  smallCircle: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  inviteButton: { alignItems: 'center', backgroundColor: colors.lime, borderColor: colors.pine, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 58, paddingHorizontal: 28 },
  inviteText: { color: colors.pine, fontSize: 16, fontWeight: '900' },
  modalScreen: { flex: 1, backgroundColor: colors.background },
  modalContent: { gap: 18, padding: 20, paddingBottom: 34 },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  modalTitle: { color: colors.pine, fontSize: 26, fontWeight: '900' },
  closeButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  filterGroup: { gap: 6 },
  filterLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  filterLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  filterHelper: { color: colors.muted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  locationText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  gpsButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.pine, borderRadius: 999, flexDirection: 'row', gap: 6, minHeight: 40, paddingHorizontal: 14 },
  gpsText: { color: colors.cream, fontSize: 13, fontWeight: '900' },
  zipRow: { flexDirection: 'row', gap: 8 },
  zipInput: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 15, padding: 12 },
  setButton: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 18 },
  setText: { color: colors.pine, fontWeight: '900' },
  distanceBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 },
  distanceDot: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 22, width: 22 },
  distanceDotActive: { backgroundColor: colors.lime, borderColor: colors.pine },
  distanceLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  distanceLabel: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  filterRow: { gap: 8, paddingVertical: 4 },
  filterChip: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  filterChipActive: { backgroundColor: colors.pine, borderColor: colors.pine },
  filterText: { color: colors.pine, fontSize: 12, fontWeight: '900' },
  filterTextActive: { color: colors.cream },
  ageRow: { flexDirection: 'row', gap: 10 },
  ageBox: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flex: 1, padding: 10 },
  ageLabel: { color: colors.muted, fontSize: 10, fontWeight: '900' },
  ageInput: { color: colors.ink, fontSize: 18, fontWeight: '900', paddingVertical: 4 },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 6 },
  noCourses: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  resetButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, minHeight: 50, justifyContent: 'center' },
  resetButtonText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  applyButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flex: 1, minHeight: 50, justifyContent: 'center' },
  applyButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  profileCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  hero: { alignItems: 'center', backgroundColor: colors.pine, minHeight: 330, justifyContent: 'center', padding: 20, position: 'relative' },
  tap: { color: 'rgba(242,238,225,0.75)', fontSize: 12, fontWeight: '800', left: 18, position: 'absolute', top: 16 },
  scoreBadge: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6, position: 'absolute', right: 16, top: 16 },
  scoreText: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  founderBadge: { backgroundColor: 'rgba(215,255,69,0.2)', borderColor: colors.lime, borderRadius: 999, borderWidth: 1, color: colors.lime, fontSize: 12, fontWeight: '900', left: 16, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, position: 'absolute', top: 44 },
  heroInitial: { color: colors.cream, fontSize: 120, fontWeight: '900' },
  heroFooter: { bottom: 18, left: 18, position: 'absolute', right: 18 },
  name: { color: colors.cream, fontSize: 28, fontWeight: '900' },
  heroMeta: { color: 'rgba(242,238,225,0.76)', fontSize: 13, fontWeight: '800', marginTop: 4 },
  cardBody: { padding: 16 },
  bio: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 999, borderWidth: 1, color: colors.pine, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  detailScreen: { flex: 1, backgroundColor: colors.background },
  detailContent: { paddingBottom: 34 },
  backButton: { alignItems: 'center', backgroundColor: 'rgba(21,64,44,0.7)', borderRadius: 999, height: 42, justifyContent: 'center', left: 16, position: 'absolute', top: 16, width: 42, zIndex: 2 },
  detailHero: { alignItems: 'center', backgroundColor: colors.pine, minHeight: 320, justifyContent: 'center' },
  detailInitial: { color: colors.cream, fontSize: 120, fontWeight: '900' },
  detailBody: { backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: -24, padding: 20 },
  detailName: { color: colors.pine, fontSize: 30, fontWeight: '900' },
  detailMeta: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 4 },
  detailBio: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 14 },
  statsGrid: { flexDirection: 'row', gap: 10, marginTop: 16 },
  detailStat: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, padding: 12 },
  detailStatValue: { color: colors.pine, fontSize: 18, fontWeight: '900' },
  detailStatLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 3 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  infoChip: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  infoChipText: { color: colors.ink, fontSize: 12, fontWeight: '800' },
  sectionBlock: { marginTop: 18 },
  sectionTitle: { color: colors.pine, fontSize: 18, fontWeight: '900' },
  detailActions: { flexDirection: 'row', gap: 12, marginTop: 22 },
  detailPass: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 0.35, minHeight: 58, justifyContent: 'center' },
  detailInvite: { alignItems: 'center', backgroundColor: colors.lime, borderColor: colors.pine, borderRadius: 18, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, minHeight: 58, justifyContent: 'center' },
  promptOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.42)', flex: 1, justifyContent: 'center', padding: 20 },
  promptCard: { backgroundColor: colors.card, borderRadius: 24, padding: 22, width: '100%' },
  promptIcon: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, height: 58, justifyContent: 'center', marginBottom: 12, width: 58 },
  promptTitle: { color: colors.pine, fontSize: 22, fontWeight: '900' },
  promptBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  promptPrimary: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, minHeight: 52, justifyContent: 'center', marginTop: 16 },
  promptPrimaryText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  promptSecondary: { alignItems: 'center', minHeight: 44, justifyContent: 'center', marginTop: 6 },
  promptSecondaryText: { color: colors.muted, fontSize: 14, fontWeight: '900' },
});
