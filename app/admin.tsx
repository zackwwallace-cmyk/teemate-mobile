import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { getAdminOverview, getAdminReports, getAdminSupportTickets, getAdminUsers, replyToSupportTicket, updateSupportTicketStatus, type Profile, type Report, type SupportTicket } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

const ADMIN_EMAIL = 'zackwwallace@gmail.com';

type Tab = 'overview' | 'support' | 'reports' | 'users';

export default function AdminScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL;

  async function load() {
    if (!isAdmin) return;
    setRefreshing(true);
    const [{ data: overviewData, error: overviewError }, { data: ticketData, error: ticketError }, { data: reportData, error: reportError }, { data: userData, error: userError }] = await Promise.all([
      getAdminOverview(),
      getAdminSupportTickets(),
      getAdminReports(),
      getAdminUsers(),
    ]);
    setRefreshing(false);
    if (overviewError) Alert.alert('Admin overview error', overviewError.message);
    if (ticketError) Alert.alert('Support tickets error', ticketError.message);
    if (reportError) Alert.alert('Reports error', reportError.message);
    if (userError) Alert.alert('Users error', userError.message);
    setOverview(overviewData);
    setTickets(ticketData ?? []);
    setReports(reportData ?? []);
    setUsers(userData ?? []);
  }

  useEffect(() => { load(); }, [isAdmin]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;
  if (!isAdmin) return <SafeAreaView style={styles.screen}><View style={styles.locked}><Ionicons name="lock-closed-outline" size={40} color={colors.pine} /><Text style={styles.lockedTitle}>Admin only</Text><Text style={styles.lockedText}>This portal is only available to the TeeMates admin account.</Text><TouchableOpacity onPress={() => router.replace('/profile')} style={styles.primary}><Text style={styles.primaryText}>Back to profile</Text></TouchableOpacity></View></SafeAreaView>;

  async function markStatus(ticket: SupportTicket, status: string) {
    setBusy(ticket.id);
    const { error } = await updateSupportTicketStatus(ticket.id, status);
    setBusy(null);
    if (error) return Alert.alert('Ticket update error', error.message);
    await load();
  }

  async function sendReply(ticket: SupportTicket) {
    const reply = replyText[ticket.id]?.trim();
    if (!reply) return Alert.alert('Reply required', 'Add a reply before sending.');
    setBusy(ticket.id);
    const { error } = await replyToSupportTicket(ticket.id, reply);
    setBusy(null);
    if (error) return Alert.alert('Reply error', error.message);
    setReplyText((current) => ({ ...current, [ticket.id]: '' }));
    await load();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity>
          <View><Text style={styles.title}>Admin Portal</Text><Text style={styles.subtitle}>TeeMates admin dashboard</Text></View>
        </View>
        <View style={styles.tabs}>
          {(['overview', 'support', 'reports', 'users'] as Tab[]).map((item) => <TouchableOpacity key={item} onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.activeTab]}><Text style={[styles.tabText, tab === item && styles.activeTabText]}>{item}</Text></TouchableOpacity>)}
        </View>
        {tab === 'overview' ? <Overview overview={overview} /> : null}
        {tab === 'support' ? <SupportAdmin tickets={tickets} replyText={replyText} setReplyText={setReplyText} busy={busy} onStatus={markStatus} onReply={sendReply} /> : null}
        {tab === 'reports' ? <ReportsAdmin reports={reports} /> : null}
        {tab === 'users' ? <UsersAdmin users={users} /> : null}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function Overview({ overview }: { overview: any }) {
  return <View style={styles.grid}>{[
    ['Users', overview?.users ?? 0],
    ['Rounds', overview?.rounds ?? 0],
    ['Reports', overview?.reports ?? 0],
    ['Codes used', `${overview?.codesUsed ?? 0}/${overview?.codesTotal ?? 0}`],
  ].map(([label, value]) => <View key={label} style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>;
}

function SupportAdmin({ tickets, replyText, setReplyText, busy, onStatus, onReply }: any) {
  return <View>{tickets.length ? tickets.map((ticket: SupportTicket) => <View key={ticket.id} style={styles.card}><View style={styles.ticketHeader}><View style={styles.userRow}>{ticket.user?.avatar_url ? <Image source={{ uri: ticket.user.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{ticket.user?.display_name?.charAt(0)?.toUpperCase() || 'U'}</Text></View>}<View><Text style={styles.cardTitle}>{ticket.subject}</Text><Text style={styles.meta}>{ticket.user?.display_name || ticket.user_id}</Text></View></View><Text style={styles.status}>{ticket.status}</Text></View><Text style={styles.meta}>{ticket.category} • {new Date(ticket.created_at).toLocaleString()}</Text><Text style={styles.body}>{ticket.message}</Text>{ticket.admin_reply ? <View style={styles.replyBox}><Text style={styles.replyLabel}>Reply</Text><Text style={styles.body}>{ticket.admin_reply}</Text></View> : null}<TextInput value={replyText[ticket.id] ?? ''} onChangeText={(value) => setReplyText((current: Record<string, string>) => ({ ...current, [ticket.id]: value }))} placeholder="Reply to user..." placeholderTextColor={colors.muted} multiline style={styles.input} /><View style={styles.actionRow}><TouchableOpacity disabled={busy === ticket.id} onPress={() => onStatus(ticket, 'open')} style={styles.secondary}><Text style={styles.secondaryText}>Open</Text></TouchableOpacity><TouchableOpacity disabled={busy === ticket.id} onPress={() => onStatus(ticket, 'reviewing')} style={styles.secondary}><Text style={styles.secondaryText}>Reviewing</Text></TouchableOpacity><TouchableOpacity disabled={busy === ticket.id} onPress={() => onReply(ticket)} style={styles.primarySmall}>{busy === ticket.id ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Reply</Text>}</TouchableOpacity></View></View>) : <Text style={styles.empty}>No support tickets.</Text>}</View>;
}

function ReportsAdmin({ reports }: { reports: Report[] }) {
  return <View>{reports.length ? reports.map((report) => <View key={report.id} style={styles.card}><Text style={styles.cardTitle}>User report</Text><Text style={styles.meta}>Reporter: {report.reporter_id}</Text><Text style={styles.meta}>Reported: {report.reported_id || 'Unknown'}</Text><Text style={styles.body}>{report.reason}</Text><Text style={styles.meta}>{new Date(report.created_at).toLocaleString()}</Text></View>) : <Text style={styles.empty}>No reports.</Text>}</View>;
}

function UsersAdmin({ users }: { users: Profile[] }) {
  return <View>{users.length ? users.map((user) => <View key={user.id} style={styles.userCard}>{user.avatar_url ? <Image source={{ uri: user.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{user.display_name?.charAt(0)?.toUpperCase() || 'U'}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.cardTitle}>{user.display_name || 'Unnamed golfer'}</Text><Text style={styles.meta}>{user.home_area || 'No location'} • {user.skill || 'No skill'}</Text><Text style={styles.meta}>{user.lifetime_premium || user.founder_badge ? 'Premium / founder' : 'Free account'}</Text></View></View>) : <Text style={styles.empty}>No users found.</Text>}</View>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 118 }, header: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.pine, fontSize: 31, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 13, fontWeight: '800' }, tabs: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, marginBottom: 16, padding: 5 }, tab: { alignItems: 'center', borderRadius: 999, flex: 1, paddingVertical: 9 }, activeTab: { backgroundColor: colors.pine }, tabText: { color: colors.pine, fontSize: 11, fontWeight: '900', textTransform: 'capitalize' }, activeTabText: { color: colors.cream }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, stat: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexBasis: '47%', flexGrow: 1, padding: 16 }, statValue: { color: colors.pine, fontSize: 24, fontWeight: '900', textAlign: 'center' }, statLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', textAlign: 'center' }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 9, marginBottom: 12, padding: 14 }, ticketHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, userRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 9 }, avatar: { borderRadius: 999, height: 38, width: 38 }, avatarFallback: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 38, justifyContent: 'center', width: 38 }, avatarText: { color: colors.cream, fontWeight: '900' }, cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, meta: { color: colors.muted, fontSize: 12, fontWeight: '800' }, status: { backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 999, color: colors.pine, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, textTransform: 'capitalize' }, body: { color: colors.ink, fontSize: 14, lineHeight: 20 }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, minHeight: 86, padding: 12, textAlignVertical: 'top' }, replyBox: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, padding: 10 }, replyLabel: { color: colors.pine, fontSize: 12, fontWeight: '900' }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, secondary: { alignItems: 'center', borderColor: colors.border, borderRadius: 999, borderWidth: 1, minHeight: 38, paddingHorizontal: 12, justifyContent: 'center' }, secondaryText: { color: colors.pine, fontSize: 12, fontWeight: '900' }, primarySmall: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, minHeight: 38, minWidth: 82, paddingHorizontal: 12, justifyContent: 'center' }, primary: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, justifyContent: 'center', minHeight: 50, marginTop: 12 }, primaryText: { color: colors.cream, fontSize: 13, fontWeight: '900' }, empty: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.muted, padding: 16, textAlign: 'center' }, userCard: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 10, padding: 12 }, locked: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 28 }, lockedTitle: { color: colors.pine, fontSize: 26, fontWeight: '900', marginTop: 12 }, lockedText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' } });
