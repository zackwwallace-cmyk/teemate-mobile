import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { createOrUpdateMatch, getMyMatches, getProfilesByIds, updateMatchStatus, type Course, type Match, type Profile } from '@/lib/data';
import { blockGolfer, isGolferBlocked, reportGolfer, unblockGolfer } from '@/lib/safety';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

function label(value?: string | null) {
  if (!value) return 'Any';
  return value.replace(/_/g, ' ');
}

function lookingFor(profile: Profile) {
  return profile.looking_for?.length ? profile.looking_for : ['Casual', 'Competitive', 'Foursome', 'Practice'];
}

function availabilityRows(profile: Profile) {
  const availability = (profile as any).availability;
  if (availability && typeof availability === 'object') return Object.entries(availability).slice(0, 8) as [string, any][];
  return [];
}

function availabilityLabel(value: any) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function GolferProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [relationship, setRelationship] = useState<Match | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  async function loadCourses(profileId: string) {
    const { data: rows } = await supabase.from('profile_courses').select('course_id').eq('profile_id', profileId);
    const ids = [...new Set((rows ?? []).map((row: any) => row.course_id).filter(Boolean))];
    if (!ids.length) {
      setCourses([]);
      return;
    }
    const { data } = await supabase.from('courses').select('id,name,town,state,type').in('id', ids).returns<Course[]>();
    setCourses(data ?? []);
  }

  async function load() {
    if (!id) return;
    setLoadingProfile(true);
    const { data, error } = await getProfilesByIds([id]);
    if (error) Alert.alert('Profile error', error.message);
    const nextProfile = data?.[0] ?? null;
    setProfile(nextProfile);
    if (nextProfile) await loadCourses(nextProfile.id);
    if (session?.user.id && id !== session.user.id) {
      const [{ data: isBlocked }, { data: matches }] = await Promise.all([
        isGolferBlocked(session.user.id, id),
        getMyMatches(session.user.id),
      ]);
      setBlocked(Boolean(isBlocked));
      const existing = (matches ?? []).find((match) => match.golfer_a === id || match.golfer_b === id) ?? null;
      setRelationship(existing);
    }
    setLoadingProfile(false);
  }

  useEffect(() => { load(); }, [id, session?.user.id]);

  if (loading || loadingProfile) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  const isMe = id === session.user.id;
  const matchedChat = relationship?.status === 'matched' ? relationship : null;
  const pending = relationship?.status === 'pending';

  async function requestToPlay() {
    if (!session?.user.id || !id || isMe) return;
    setRequestBusy(true);
    const { data, error } = await createOrUpdateMatch(session.user.id, id, 'pending');
    setRequestBusy(false);
    if (error) return Alert.alert('Request error', error.message);
    setRelationship(data as Match);
    Alert.alert('Request sent', `Your request to play was sent to ${profile?.display_name || 'this golfer'}.`);
  }

  async function confirmUnmatch() {
    if (!relationship?.id || !matchedChat) return;
    Alert.alert('Unmatch golfer?', `This will remove ${profile?.display_name || 'this golfer'} as a match. You can request to play again later.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unmatch',
        style: 'destructive',
        onPress: async () => {
          setRequestBusy(true);
          const { data, error } = await updateMatchStatus(relationship.id, 'canceled');
          setRequestBusy(false);
          if (error) return Alert.alert('Unmatch error', error.message);
          setRelationship(data as Match);
          Alert.alert('Unmatched', `${profile?.display_name || 'This golfer'} has been removed from your matches.`);
        },
      },
    ]);
  }

  async function toggleBlock() {
    if (!session?.user.id || !id || isMe) return;
    const action = blocked ? unblockGolfer : blockGolfer;
    setSafetyBusy(true);
    const { error } = await action(session.user.id, id);
    setSafetyBusy(false);
    if (error) return Alert.alert(blocked ? 'Unblock error' : 'Block error', error.message);
    setBlocked(!blocked);
    Alert.alert(blocked ? 'Golfer unblocked' : 'Golfer blocked', blocked ? 'You can now see this golfer again.' : 'This golfer will no longer appear in partner discovery.');
  }

  async function submitReport() {
    if (!session?.user.id || !id || isMe) return;
    const reason = reportReason.trim();
    if (!reason) return Alert.alert('Report reason required', 'Add a short note about what happened.');
    setSafetyBusy(true);
    const { error } = await reportGolfer(session.user.id, id, reason);
    setSafetyBusy(false);
    if (error) return Alert.alert('Report error', error.message);
    setReportOpen(false);
    setReportReason('');
    Alert.alert('Report submitted', 'Thank you. Your report was sent for review.');
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity></View>
        <View style={styles.empty}><Ionicons name="person-outline" size={38} color={colors.pine} /><Text style={styles.emptyTitle}>Golfer not found</Text><Text style={styles.emptyText}>This profile may no longer be available.</Text></View>
      </SafeAreaView>
    );
  }

  const premium = profile.founder_badge || profile.founding_member || profile.lifetime_premium;
  const availability = availabilityRows(profile);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.floatingBack}><Ionicons name="arrow-back" size={20} color={colors.cream} /></TouchableOpacity>
        <Text style={styles.screenTitle}>Connections</Text>

        <View style={styles.cover}>
          {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.coverAvatar} /> : <Text style={styles.coverInitial}>{profile.display_name?.charAt(0)?.toUpperCase() || 'G'}</Text>}
        </View>

        <View style={styles.identityCard}>
          <View style={styles.nameRow}>{premium ? <Ionicons name="trophy" size={16} color={colors.lime} /> : null}<Text style={styles.name}>{profile.display_name || 'TeeMate golfer'}</Text></View>
          <Text style={styles.location}><Ionicons name="location-outline" size={13} color={colors.muted} /> {profile.home_area || 'Local golfer'}</Text>
          {!isMe && matchedChat ? <TouchableOpacity onPress={() => router.push({ pathname: '/chat/[id]', params: { id: matchedChat.id } })} style={styles.chatButton}><Ionicons name="chatbubble-outline" size={18} color={colors.cream} /><Text style={styles.chatButtonText}>Message</Text></TouchableOpacity> : null}
          {!isMe && matchedChat ? <TouchableOpacity disabled={requestBusy} onPress={confirmUnmatch} style={styles.unmatchButton}>{requestBusy ? <ActivityIndicator color={colors.pine} /> : <><Ionicons name="person-remove-outline" size={18} color={colors.pine} /><Text style={styles.unmatchButtonText}>Unmatch</Text></>}</TouchableOpacity> : null}
          {!isMe && !matchedChat && pending ? <TouchableOpacity disabled style={styles.pendingButton}><Ionicons name="time-outline" size={18} color={colors.pine} /><Text style={styles.pendingButtonText}>Pending</Text></TouchableOpacity> : null}
          {!isMe && !matchedChat && !pending ? <TouchableOpacity disabled={requestBusy} onPress={requestToPlay} style={styles.requestButton}>{requestBusy ? <ActivityIndicator color={colors.cream} /> : <><Ionicons name="golf-outline" size={18} color={colors.cream} /><Text style={styles.requestButtonText}>Request to play</Text></>}</TouchableOpacity> : null}
        </View>

        <Text style={styles.bio}>{profile.bio || 'No bio added yet.'}</Text>

        <View style={styles.statsGrid}>
          <Stat label="Rounds played" value={String(profile.rounds_played ?? 0)} />
          <Stat label="Reviews" value={String(profile.rounds_completed ?? 0)} />
          <Stat label="Rating" value={profile.avg_rating ? Number(profile.avg_rating).toFixed(1) : '—'} />
        </View>

        <View style={styles.infoGrid}>
          <Info icon="flag-outline" text={label(profile.skill)} />
          <Info icon="walk-outline" text={label(profile.travel)} />
          <Info icon="time-outline" text={`${label(profile.pace)} pace`} />
          {profile.handicap_index != null ? <Info icon="analytics-outline" text={`HCP ${profile.handicap_index}`} /> : null}
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Looking for</Text>
          <View style={styles.tagRow}>{lookingFor(profile).map((item) => <Text key={item} style={styles.tag}>{item}</Text>)}</View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Plays at</Text>
          <View style={styles.tagRow}>{courses.length ? courses.map((course) => <Text key={course.id} style={styles.courseTag}>{course.name}</Text>) : <Text style={styles.emptySmall}>No courses listed.</Text>}</View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>Availability</Text>
          {availability.length ? availability.map(([day, value]) => <View key={day} style={styles.availabilityRow}><Text style={styles.availabilityDay}>{day}</Text><Text style={styles.availabilityValue}>{availabilityLabel(value)}</Text></View>) : <><View style={styles.availabilityRow}><Text style={styles.availabilityDay}>Sat</Text><Text style={styles.availabilityValue}>Morning</Text></View><View style={styles.availabilityRow}><Text style={styles.availabilityDay}>Sun</Text><Text style={styles.availabilityValue}>Morning</Text></View></>}
        </View>

        <View style={styles.noteBox}><Ionicons name="shield-checkmark-outline" size={20} color={colors.pine} /><Text style={styles.noteText}>TeeMate is for finding golf partners and organizing rounds. Keep messages respectful and golf-related.</Text></View>

        {!isMe ? <View style={styles.safetyBox}><Text style={styles.safetyTitle}>Safety controls</Text><Text style={styles.safetyText}>Use these if someone is inappropriate, unsafe, or not using TeeMate for golf.</Text><TouchableOpacity onPress={() => setReportOpen(true)} style={styles.reportButton}><Ionicons name="flag-outline" size={18} color={colors.cream} /><Text style={styles.reportButtonText}>Report golfer</Text></TouchableOpacity><TouchableOpacity disabled={safetyBusy} onPress={toggleBlock} style={styles.blockButton}><Ionicons name={blocked ? 'eye-outline' : 'ban-outline'} size={18} color={colors.pine} /><Text style={styles.blockButtonText}>{blocked ? 'Unblock golfer' : 'Block golfer'}</Text></TouchableOpacity></View> : null}
      </ScrollView>

      <Modal visible={reportOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReportOpen(false)}>
        <SafeAreaView style={styles.modalScreen}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.header}><TouchableOpacity onPress={() => setReportOpen(false)} style={styles.backButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity><Text style={styles.headerTitle}>Report golfer</Text></View><Text style={styles.bodyText}>Tell us what happened. This goes to support for review.</Text><TextInput value={reportReason} onChangeText={setReportReason} placeholder="Example: inappropriate messages, harassment, not golf-related, unsafe behavior..." placeholderTextColor={colors.muted} style={styles.reportInput} multiline /><TouchableOpacity disabled={safetyBusy} onPress={submitReport} style={styles.reportButton}>{safetyBusy ? <ActivityIndicator color={colors.cream} /> : <><Ionicons name="send" size={18} color={colors.cream} /><Text style={styles.reportButtonText}>Submit report</Text></>}</TouchableOpacity></ScrollView></SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function Info({ icon, text }: { icon: any; text: string }) { return <View style={styles.infoPill}><Ionicons name={icon} size={15} color={colors.pine} /><Text style={styles.infoText}>{text}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingBottom: 36 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 },
  backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  headerTitle: { color: colors.pine, fontSize: 18, fontWeight: '900' },
  floatingBack: { alignItems: 'center', backgroundColor: 'rgba(17,39,27,0.78)', borderRadius: 999, height: 42, justifyContent: 'center', left: 16, position: 'absolute', top: 18, width: 42, zIndex: 8 },
  screenTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginLeft: 16, marginTop: 20, position: 'absolute', top: 0, zIndex: 4 },
  cover: { alignItems: 'center', backgroundColor: '#062A19', height: 260, justifyContent: 'center', overflow: 'hidden' },
  coverAvatar: { height: 124, width: 124, borderRadius: 999 },
  coverInitial: { color: 'rgba(242,238,225,0.18)', fontSize: 120, fontWeight: '900' },
  identityCard: { backgroundColor: colors.background, padding: 16 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  name: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  location: { color: colors.muted, fontSize: 13, fontWeight: '800', marginTop: 4 },
  chatButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16, minHeight: 48 },
  chatButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  unmatchButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  unmatchButtonText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  requestButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16, minHeight: 48 },
  requestButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  pendingButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 16, minHeight: 48 },
  pendingButtonText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  bio: { color: colors.ink, fontSize: 15, lineHeight: 22, paddingHorizontal: 16, paddingVertical: 8 },
  statsGrid: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  stat: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, padding: 14 },
  statValue: { color: colors.pine, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  statLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 4, textAlign: 'center', textTransform: 'uppercase' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  infoPill: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexGrow: 1, gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  infoText: { color: colors.ink, fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  sectionBlock: { paddingHorizontal: 16, paddingTop: 18 },
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: 'rgba(21,64,44,0.12)', borderRadius: 999, color: colors.pine, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, textTransform: 'capitalize' },
  courseTag: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, color: colors.pine, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  emptySmall: { color: colors.muted, fontSize: 13 },
  availabilityRow: { flexDirection: 'row', gap: 22, marginBottom: 6 },
  availabilityDay: { color: colors.ink, fontSize: 13, fontWeight: '900', width: 34 },
  availabilityValue: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  noteBox: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 18, padding: 14 },
  noteText: { color: colors.muted, flex: 1, fontSize: 13, lineHeight: 18 },
  safetyBox: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, gap: 10, marginHorizontal: 16, marginTop: 16, padding: 18 },
  safetyTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  safetyText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  reportButton: { alignItems: 'center', backgroundColor: colors.danger, borderRadius: 16, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  reportButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' },
  blockButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  blockButtonText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  modalScreen: { flex: 1, backgroundColor: colors.background },
  modalContent: { gap: 14, padding: 20, paddingBottom: 40 },
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  reportInput: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 15, minHeight: 160, padding: 14, textAlignVertical: 'top' },
  empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, margin: 20, padding: 28 },
  emptyTitle: { color: colors.pine, fontSize: 22, fontWeight: '900', marginTop: 8 },
  emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
});