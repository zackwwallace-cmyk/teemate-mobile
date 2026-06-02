import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getMessages, getMyMatches, getProfilesByIds, sendMessage, submitSupportTicket, type Match, type Message, type Profile } from '@/lib/data';
import { sendPushNotification } from '@/lib/notifications';
import { blockGolfer, reportGolfer } from '@/lib/safety';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [match, setMatch] = useState<Match | null>(null);
  const [other, setOther] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!session?.user.id || !id) return;
    setRefreshing(true);
    const { data: allMatches, error: matchError } = await getMyMatches(session.user.id);
    if (matchError) Alert.alert('Chat error', matchError.message);
    const found = (allMatches ?? []).find((item) => item.id === id) ?? null;
    setMatch(found);
    if (found) {
      const otherId = found.golfer_a === session.user.id ? found.golfer_b : found.golfer_a;
      const { data: people } = await getProfilesByIds([otherId]);
      setOther(people?.[0] ?? null);
      const { data, error } = await getMessages(found.id);
      if (error) Alert.alert('Messages error', error.message);
      setMessages(data ?? []);
    }
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [session?.user.id, id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function submit() {
    if (!session?.user.id || !match || !body.trim()) return;
    const text = body.trim();
    const recipientId = match.golfer_a === session.user.id ? match.golfer_b : match.golfer_a;
    setSending(true);
    const { error } = await sendMessage(match.id, session.user.id, text);
    setSending(false);
    if (error) return Alert.alert('Send error', error.message);
    setBody('');
    await sendPushNotification({
      recipientIds: [recipientId],
      actorId: session.user.id,
      title: 'New TeeMate message',
      body: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      type: 'message',
      data: { matchId: match.id, route: `/chat/${match.id}` },
    });
    await load();
  }

  function promptReason(title: string, onSubmit: (reason: string) => void) {
    Alert.prompt?.(title, 'Briefly describe what happened. Our safety team reviews every report.', (reason) => { if (reason && reason.trim()) onSubmit(reason.trim()); }) ?? onSubmit('Reported from chat');
  }

  function openSafetyMenu() {
    if (!session?.user.id || !other?.id) return;
    const otherId = other.id;
    const otherName = other.display_name || 'this golfer';
    Alert.alert('Safety & support', `Manage your chat with ${otherName}`, [
      { text: 'Report user', style: 'destructive', onPress: () => promptReason(`Report ${otherName}`, async (reason) => { const { error } = await reportGolfer(session.user.id, otherId, reason); if (error) return Alert.alert('Report failed', error.message); Alert.alert('Report sent', 'Thanks — our safety team will review this.'); }) },
      { text: 'Block user', style: 'destructive', onPress: () => Alert.alert('Block user?', `${otherName} will no longer be able to message or match with you.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: async () => { const { error } = await blockGolfer(session.user.id, otherId); if (error) return Alert.alert('Block failed', error.message); Alert.alert('Blocked', `${otherName} has been blocked.`); router.replace('/chats'); } }]) },
      { text: 'Contact support', onPress: () => promptReason('Contact support', async (msg) => { const { error } = await submitSupportTicket(session.user.id, 'help', `Chat issue with ${otherName}`, msg); if (error) return Alert.alert('Support error', error.message); Alert.alert('Sent', 'Support will reply by email.'); }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const canChat = match?.status === 'matched';

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/chats')} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity>
          <TouchableOpacity disabled={!other?.id} onPress={() => other?.id && router.push({ pathname: '/golfer/[id]', params: { id: other.id } })} style={styles.profileHeader}>
            <View style={styles.avatar}>{other?.avatar_url ? <Image source={{ uri: other.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{other?.display_name?.charAt(0)?.toUpperCase() || 'P'}</Text>}</View>
            <View style={styles.headerText}>
              <Text style={styles.title}>{other?.display_name || 'Playing partner'}</Text>
              <Text style={styles.subtitle}>Tap name/photo to view profile</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openSafetyMenu()} style={styles.backButton}><Ionicons name="ellipsis-horizontal" size={20} color={colors.pine} /></TouchableOpacity>
        </View>

        {!canChat ? (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={36} color={colors.pine} />
            <Text style={styles.emptyTitle}>Connection not confirmed</Text>
            <Text style={styles.emptyText}>Chat opens after both golfers are connected.</Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
              {messages.length === 0 ? <View style={styles.emptyInline}><Text style={styles.emptyTitle}>Start the round conversation</Text><Text style={styles.emptyText}>Ask about availability, courses, tee times, or pace of play.</Text></View> : null}
              {messages.map((message) => {
                const mine = message.sender_id === session.user.id;
                return <View key={message.id} style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}><Text style={[styles.bubbleText, mine ? styles.myBubbleText : styles.theirBubbleText]}>{message.body}</Text><Text style={[styles.time, mine ? styles.myTime : styles.theirTime]}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View>;
              })}
            </ScrollView>
            <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder="Message about a round..." placeholderTextColor={colors.muted} style={styles.input} multiline /><TouchableOpacity disabled={sending || !body.trim()} onPress={submit} style={styles.sendButton}>{sending ? <ActivityIndicator color={colors.cream} /> : <Ionicons name="send" size={20} color={colors.cream} />}</TouchableOpacity></View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, header: { alignItems: 'center', backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, padding: 16 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, profileHeader: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10 }, avatar: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 44, justifyContent: 'center', overflow: 'hidden', width: 44 }, avatarImage: { height: 44, width: 44 }, avatarText: { color: colors.cream, fontSize: 16, fontWeight: '900' }, headerText: { flex: 1 }, title: { color: colors.pine, fontSize: 22, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 }, messages: { flex: 1 }, messageContent: { padding: 16, paddingBottom: 24 }, bubble: { borderRadius: 18, marginBottom: 10, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 }, myBubble: { alignSelf: 'flex-end', backgroundColor: colors.pine }, theirBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, bubbleText: { fontSize: 15, lineHeight: 21 }, myBubbleText: { color: colors.cream }, theirBubbleText: { color: colors.ink }, time: { fontSize: 10, fontWeight: '700', marginTop: 4 }, myTime: { color: 'rgba(242,238,225,0.7)' }, theirTime: { color: colors.muted }, composer: { alignItems: 'flex-end', backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12 }, sendButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 46, justifyContent: 'center', width: 46 }, empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, margin: 20, padding: 28 }, emptyInline: { alignItems: 'center', padding: 28 }, emptyTitle: { color: colors.pine, fontSize: 20, fontWeight: '900', marginTop: 8, textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
});