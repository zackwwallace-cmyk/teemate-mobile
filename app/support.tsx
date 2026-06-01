import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { getMySupportTickets, submitSupportTicket, type SupportTicket } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

const CATEGORIES = ['Need help', 'Bug report', 'Safety concern', 'Billing / membership', 'Feature request', 'Other'];

export default function SupportScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState('Need help');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!session?.user.id) return;
    setRefreshing(true);
    const { data, error } = await getMySupportTickets(session.user.id);
    setRefreshing(false);
    if (error) Alert.alert('Support error', error.message);
    setTickets(data ?? []);
  }

  useEffect(() => { load(); }, [session?.user.id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function submit() {
    if (!session?.user.id) return;
    if (!subject.trim()) return Alert.alert('Subject required', 'Add a short summary.');
    if (!message.trim()) return Alert.alert('Message required', 'Tell us what is going on. Include steps to reproduce it if it is a bug.');
    setSaving(true);
    const { error } = await submitSupportTicket(session.user.id, category, subject.trim(), message.trim());
    setSaving(false);
    if (error) return Alert.alert('Support error', error.message);
    setCategory('Need help');
    setSubject('');
    setMessage('');
    await load();
    Alert.alert('Support request sent', 'We will reply by email.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity>
          <View><Text style={styles.title}>Support</Text><Text style={styles.subtitle}>Report an issue or request help. We’ll reply by email.</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Send a support request</Text>
          <Choice label="Category" value={category} options={CATEGORIES} onChange={setCategory} />
          <Input label="Subject" value={subject} placeholder="Short summary" onChangeText={setSubject} />
          <View style={styles.field}>
            <Text style={styles.label}>Message</Text>
            <TextInput value={message} onChangeText={setMessage} placeholder="What’s going on? Include steps to reproduce if it’s a bug." placeholderTextColor={colors.muted} multiline maxLength={4000} style={[styles.input, styles.messageInput]} />
            <Text style={styles.counter}>{message.length}/4000</Text>
          </View>
          <TouchableOpacity disabled={saving} onPress={submit} style={styles.primaryButton}>{saving ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Send to support</Text>}</TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Your tickets</Text>
        {tickets.length ? tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />) : <Text style={styles.emptyText}>No support tickets yet.</Text>}
      </ScrollView>
      <BottomNav />
    </SafeAreaView>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  return <View style={styles.ticketCard}><View style={styles.ticketHeader}><Text style={styles.ticketSubject}>{ticket.subject}</Text><Text style={styles.status}>{ticket.status}</Text></View><Text style={styles.ticketMeta}>{ticket.category} • {new Date(ticket.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text><Text style={styles.ticketMessage}>{ticket.message}</Text>{ticket.admin_reply ? <View style={styles.replyBox}><Text style={styles.replyLabel}>Support reply</Text><Text style={styles.replyText}>{ticket.admin_reply}</Text></View> : null}</View>;
}
function Input(props: any) { const { label, ...rest } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} style={styles.input} {...rest} /></View>; }
function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{options.map((option) => <TouchableOpacity key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceActive]}><Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text></TouchableOpacity>)}</ScrollView></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 118 }, header: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, title: { color: colors.pine, fontSize: 32, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: 12, marginBottom: 18, padding: 16 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, field: { gap: 6 }, label: { color: colors.ink, fontSize: 13, fontWeight: '900' }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, fontSize: 15, padding: 13 }, messageInput: { minHeight: 130, textAlignVertical: 'top' }, counter: { color: colors.muted, fontSize: 11, textAlign: 'right' }, choiceRow: { gap: 8 }, choice: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, choiceActive: { backgroundColor: colors.pine, borderColor: colors.pine }, choiceText: { color: colors.pine, fontSize: 12, fontWeight: '900' }, choiceTextActive: { color: colors.cream }, primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, justifyContent: 'center', minHeight: 50 }, primaryText: { color: colors.cream, fontSize: 15, fontWeight: '900' }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900', marginBottom: 10 }, emptyText: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.muted, padding: 16, textAlign: 'center' }, ticketCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 8, marginBottom: 10, padding: 14 }, ticketHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, ticketSubject: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '900' }, status: { backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 999, color: colors.pine, fontSize: 11, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, textTransform: 'capitalize' }, ticketMeta: { color: colors.muted, fontSize: 12, fontWeight: '800' }, ticketMessage: { color: colors.ink, fontSize: 14, lineHeight: 20 }, replyBox: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 4, padding: 10 }, replyLabel: { color: colors.pine, fontSize: 12, fontWeight: '900' }, replyText: { color: colors.ink, fontSize: 14, lineHeight: 20 } });
