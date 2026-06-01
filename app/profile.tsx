import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { getMyProfile, redeemFounderCode, submitSupportTicket, uploadPostPhoto, upsertMyProfile, type Profile } from '@/lib/data';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

const SUPPORT_CATEGORIES = [
  { value: 'help', label: 'Need help' },
  { value: 'bug', label: 'Report a bug' },
  { value: 'safety', label: 'Safety concern' },
  { value: 'billing', label: 'Billing' },
  { value: 'account', label: 'Account issue' },
  { value: 'other', label: 'Other' },
];

function labelText(value?: string | null) { return value ? value.replace(/_/g, ' ') : 'Not set'; }
function formatDobInput(value: string) { const digits = value.replace(/\D/g, '').slice(0, 8); if (digits.length <= 2) return digits; if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`; return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`; }
function calculateAge(value?: string | null) { if (!value) return null; const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!match) return null; const month = Number(match[1]); const day = Number(match[2]); const year = Number(match[3]); const birth = new Date(year, month - 1, day); const today = new Date(); let age = today.getFullYear() - year; const md = today.getMonth() - birth.getMonth(); if (md < 0 || (md === 0 && today.getDate() < day)) age--; return age >= 0 ? age : null; }

export default function ProfileScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [supportSaving, setSupportSaving] = useState(false);
  const [code, setCode] = useState('');
  const [supportCategory, setSupportCategory] = useState('help');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [form, setForm] = useState({ display_name: '', date_of_birth: '', gender: 'prefer_not_to_say', home_area: '', handicap_index: '', bio: '', skill: 'casual', pace: 'any', travel: 'any', holes_pref: '18' });

  async function load() {
    if (!session?.user.id) return;
    const { data, error } = await getMyProfile(session.user.id);
    if (error) Alert.alert('Profile error', error.message);
    if (data) {
      setProfile(data);
      setForm({
        display_name: data.display_name ?? '',
        date_of_birth: (data.date_of_birth as any) ?? '',
        gender: (data as any).gender ?? 'prefer_not_to_say',
        home_area: data.home_area ?? '',
        handicap_index: data.handicap_index != null ? String(data.handicap_index) : '',
        bio: data.bio ?? '',
        skill: data.skill ?? 'casual',
        pace: data.pace ?? 'any',
        travel: data.travel ?? 'any',
        holes_pref: data.holes_pref ?? '18',
      });
    }
  }

  useEffect(() => { load(); }, [session?.user.id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function save() {
    if (!session?.user.id) return;
    if (!form.display_name.trim()) return Alert.alert('Name required', 'Add a display name for your TeeMate profile.');
    const dob = formatDobInput(form.date_of_birth);
    const age = calculateAge(dob);
    setSaving(true);
    const { data, error } = await upsertMyProfile(session.user.id, {
      display_name: form.display_name.trim(),
      date_of_birth: dob || null,
      age,
      gender: form.gender as any,
      home_area: form.home_area.trim() || null,
      handicap_index: form.handicap_index ? Number(form.handicap_index) : null,
      bio: form.bio.trim() || null,
      skill: form.skill as any,
      pace: form.pace as any,
      travel: form.travel as any,
      holes_pref: form.holes_pref || '18',
      looking_for: ['golf partners'],
      onboarding_complete: true,
    });
    setSaving(false);
    if (error) return Alert.alert('Save error', error.message);
    setProfile(data);
    Alert.alert('Saved', 'Your TeeMate profile is updated.');
  }

  async function uploadProfilePhoto() {
    if (!session?.user.id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to upload your profile picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingPhoto(true);
    const upload = await uploadPostPhoto(session.user.id, result.assets[0].uri);
    if (upload.error || !upload.data) { setUploadingPhoto(false); return Alert.alert('Photo upload error', upload.error?.message ?? 'Could not upload your profile photo.'); }
    const saved = await upsertMyProfile(session.user.id, { avatar_url: upload.data });
    setUploadingPhoto(false);
    if (saved.error) return Alert.alert('Photo save error', saved.error.message);
    setProfile(saved.data);
  }

  async function redeem() { if (!code.trim()) return; const { error } = await redeemFounderCode(code.trim().toUpperCase()); if (error) return Alert.alert('Promotional code', error.message); setCode(''); await load(); Alert.alert('Promotional code', 'Code applied. Your account has been updated.'); }
  async function submitSupport() {
    if (!session?.user.id) return;
    if (supportSubject.trim().length < 3) return Alert.alert('Subject required', 'Add a short subject.');
    if (supportMessage.trim().length < 10) return Alert.alert('Message required', 'Tell us a bit more.');
    setSupportSaving(true);
    const { error } = await submitSupportTicket(session.user.id, supportCategory, supportSubject.trim(), supportMessage.trim());
    setSupportSaving(false);
    if (error) return Alert.alert('Support error', error.message);
    setSupportSubject(''); setSupportMessage(''); setSupportCategory('help');
    Alert.alert('Sent', 'Support will reply by email.');
  }
  async function signOut() { await supabase.auth.signOut(); }

  const premium = profile?.founder_badge || profile?.founding_member || profile?.lifetime_premium;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topbar}><View style={styles.brandDot}><Text style={styles.brandT}>T</Text></View><Text style={styles.brand}>TeeMate</Text><TouchableOpacity onPress={signOut} style={styles.iconButton}><Ionicons name="log-out-outline" size={20} color={colors.pine} /></TouchableOpacity></View>
        <View style={styles.heroCard}><View style={styles.avatarWrap}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <Text style={styles.avatarInitial}>{profile?.display_name?.charAt(0)?.toUpperCase() || 'T'}</Text>}</View><View style={styles.heroInfo}><Text style={styles.heroName}>{profile?.display_name || 'TeeMate golfer'}</Text><Text style={styles.heroMeta}>{profile?.home_area || 'No location set'} • {labelText(profile?.skill)}</Text>{premium ? <Text style={styles.premiumBadge}>TeeMate+</Text> : null}</View></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Profile photo</Text><View style={styles.photoRow}><View style={styles.photoPreview}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.photoImage} /> : <Text style={styles.photoInitial}>{profile?.display_name?.charAt(0)?.toUpperCase() || 'T'}</Text>}</View><TouchableOpacity disabled={uploadingPhoto} onPress={uploadProfilePhoto} style={styles.primaryButton}>{uploadingPhoto ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Upload photo</Text>}</TouchableOpacity></View></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Edit profile</Text><Input label="Display name" value={form.display_name} onChangeText={(v: string) => setForm({ ...form, display_name: v })} /><Input label="Date of birth" value={form.date_of_birth} placeholder="MM/DD/YYYY" keyboardType="number-pad" maxLength={10} onChangeText={(v: string) => setForm({ ...form, date_of_birth: formatDobInput(v) })} /><Text style={styles.helpText}>Your birthday is private. Other golfers only see your age.</Text><Input label="Home area / ZIP" value={form.home_area} onChangeText={(v: string) => setForm({ ...form, home_area: v })} /><Input label="Bio" value={form.bio} multiline onChangeText={(v: string) => setForm({ ...form, bio: v })} /><Choice label="Skill" value={form.skill} options={['beginner', 'casual', 'solid', 'strong', 'low_handicap']} onChange={(v) => setForm({ ...form, skill: v })} /><Input label="Handicap index" value={form.handicap_index} keyboardType="decimal-pad" onChangeText={(v: string) => setForm({ ...form, handicap_index: v })} /><TouchableOpacity disabled={saving} onPress={save} style={styles.primaryButton}>{saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Save profile</Text>}</TouchableOpacity></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Notifications</Text><View style={styles.toggleRow}><View><Text style={styles.rowTitle}>Email notifications</Text><Text style={styles.helpText}>Matches, rounds, support, and account updates.</Text></View><Switch value={emailNotifications} onValueChange={setEmailNotifications} /></View></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Help & support</Text><Choice label="Category" value={supportCategory} options={SUPPORT_CATEGORIES} onChange={setSupportCategory} /><Input label="Subject" value={supportSubject} onChangeText={setSupportSubject} /><Input label="Message" value={supportMessage} multiline onChangeText={setSupportMessage} /><TouchableOpacity disabled={supportSaving} onPress={submitSupport} style={styles.primaryButton}>{supportSaving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Send to support</Text>}</TouchableOpacity></View>
        <View style={styles.card}><Text style={styles.cardTitle}>Promotional code</Text><Input label="Code" value={code} autoCapitalize="characters" onChangeText={setCode} /><TouchableOpacity onPress={redeem} style={styles.secondaryButton}><Text style={styles.secondaryText}>Apply code</Text></TouchableOpacity></View>
        <TouchableOpacity onPress={() => router.push('/upgrade' as any)} style={styles.signOutRow}><Ionicons name="flash-outline" size={18} color={colors.pine} /><Text style={styles.signOutText}>TeeMate+</Text><Text style={styles.signOutArrow}>→</Text></TouchableOpacity>
        <TouchableOpacity onPress={signOut} style={styles.signOutRow}><Ionicons name="log-out-outline" size={18} color={colors.pine} /><Text style={styles.signOutText}>Sign out</Text><Text style={styles.signOutArrow}>→</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/delete-account' as any)} style={styles.deleteRow}><Ionicons name="trash-outline" size={18} color="#DC2626" /><Text style={styles.deleteText}>Delete account</Text><Text style={styles.deleteArrow}>→</Text></TouchableOpacity>
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function Input(props: any) { const { label, ...rest } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} style={[styles.input, rest.multiline && styles.multiline]} {...rest} /></View>; }
function Choice({ label, value, options, onChange }: { label: string; value: string; options: any[]; onChange: (v: string) => void }) { const normalized = options.map((option) => typeof option === 'string' ? { value: option, label: option.replace(/_/g, ' ') } : option); return <View style={styles.field}><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{normalized.map((option) => <TouchableOpacity key={option.value} onPress={() => onChange(option.value)} style={[styles.choice, value === option.value && styles.choiceActive]}><Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text></TouchableOpacity>)}</ScrollView></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 118 }, topbar: { alignItems: 'center', flexDirection: 'row', marginBottom: 14 }, brandDot: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 26, justifyContent: 'center', width: 26 }, brandT: { color: colors.lime, fontSize: 15, fontWeight: '900' }, brand: { color: colors.pine, fontSize: 18, fontWeight: '900', marginLeft: 8 }, iconButton: { marginLeft: 'auto' }, heroCard: { backgroundColor: colors.pine, borderRadius: 24, flexDirection: 'row', gap: 14, marginBottom: 14, padding: 18 }, avatarWrap: { alignItems: 'center', backgroundColor: colors.card, borderRadius: 999, height: 70, justifyContent: 'center', overflow: 'hidden', width: 70 }, avatar: { height: 70, width: 70 }, avatarInitial: { color: colors.pine, fontSize: 28, fontWeight: '900' }, heroInfo: { flex: 1, justifyContent: 'center' }, heroName: { color: colors.cream, fontSize: 22, fontWeight: '900' }, heroMeta: { color: colors.cream, fontSize: 13, marginTop: 2 }, premiumBadge: { alignSelf: 'flex-start', backgroundColor: colors.lime, borderRadius: 999, color: colors.ink, fontSize: 11, fontWeight: '900', marginTop: 8, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 20, borderWidth: 1, gap: 12, marginBottom: 14, padding: 16 }, cardTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' }, photoRow: { alignItems: 'center', flexDirection: 'row', gap: 14 }, photoPreview: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 999, height: 70, justifyContent: 'center', overflow: 'hidden', width: 70 }, photoImage: { height: 70, width: 70 }, photoInitial: { color: colors.pine, fontSize: 28, fontWeight: '900' }, helpText: { color: colors.muted, fontSize: 13, lineHeight: 19 }, field: { gap: 6 }, label: { color: colors.ink, fontSize: 13, fontWeight: '800' }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.ink, fontSize: 15, padding: 13 }, multiline: { minHeight: 95, textAlignVertical: 'top' }, choiceRow: { gap: 8, paddingVertical: 2 }, choice: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, choiceActive: { backgroundColor: colors.pine, borderColor: colors.pine }, choiceText: { color: colors.pine, fontSize: 12, fontWeight: '900', textTransform: 'capitalize' }, choiceTextActive: { color: colors.cream }, primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 }, primaryText: { color: colors.cream, fontSize: 15, fontWeight: '900' }, secondaryButton: { alignItems: 'center', borderColor: colors.pine, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 48 }, secondaryText: { color: colors.pine, fontSize: 15, fontWeight: '900' }, toggleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, rowTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, signOutRow: { alignItems: 'center', borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 12, minHeight: 54, paddingHorizontal: 14 }, signOutText: { color: colors.pine, flex: 1, fontSize: 15, fontWeight: '900' }, signOutArrow: { color: colors.pine, fontWeight: '900' }, deleteRow: { alignItems: 'center', borderColor: '#FCA5A5', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 18, minHeight: 54, paddingHorizontal: 14 }, deleteText: { color: '#DC2626', flex: 1, fontSize: 15, fontWeight: '900' }, deleteArrow: { color: '#DC2626', fontWeight: '900' },
});
