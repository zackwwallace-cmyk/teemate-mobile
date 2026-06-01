import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getProfilesByIds, submitSupportTicket, type Message, type Profile, type Round } from '@/lib/data';
import { canUserAccessRoundChat, getRoundById, getRoundMessages, sendRoundMessage } from '@/lib/roundChat';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

export default function RoundChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [round, setRound] = useState<Round | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [allowed, setAllowed] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  async function load() {
    if (!session?.user.id || !id) return;
    setRefreshing(true);
    const [{ data: canAccess, error: accessError }, { data: roundData }] = await Promise.all([
      canUserAccessRoundChat(id, session.user.id),
      getRoundById(id),
    ]);
    if (accessError) Alert.alert('Round chat error', accessError.message);
    setAllowed(Boolean(canAccess));
    setRound(roundData ?? null);
    if (canAccess) {
      const { data, error } = await getRoundMessages(id);
      if (error) Alert.alert('Messages error', error.message);
      const rows = data ?? [];
      setMessages(rows);
      const ids = [...new Set(rows.map((message) => message.sender_id).filter(Boolean))];
      const { data: people } = await getProfilesByIds(ids);
      const map: Record<string, Profile> = {};
      (people ?? []).forEach((profile) => { map[profile.id] = profile; });
      setProfiles(map);
    }
    setCheckingAccess(false);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [session?.user.id, id]);

  if (loading || checkingAccess) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function submit() {
    if (!session?.user.id || !id || !body.trim()) return;
    setSending(true);
    const { error } = await sendRoundMessage(id, session.user.id, body.trim());
    setSending(false);
    if (error) return Alert.alert('Send error', error.message);
    setBody('');
    await load();
  }

  function openProfile(profileId?: string | null) {
    if (!profileId) return;
    router.push({ pathname: '/golfer/[id]', params: { id: profileId } });
  }

  function openSafetyMenu() {
    if (!session?.user.id) return;
    const uid = session.user.id;
    const label = round?.course_text || 'round chat';
    Alert.alert('Safety & support', `Report an issue with “${label}”`, [
      { text: 'Report this round', style: 'destructive', onPress: () => Alert.prompt?.('Report round', 'Describe the issue. Our safety team will review.', async (reason) => { if (!reason?.trim()) return; const { error } = await submitSupportTicket(uid, 'safety', `Report round chat: ${label}`, `Round ID: ${id}\n\n${reason.trim()}`); if (error) return Alert.alert('Report failed', error.message); Alert.alert('Report sent', 'Thanks — we will review this round.'); }) ?? null },
      { text: 'Contact support', onPress: () => Alert.prompt?.('Contact support', 'What do you need help with?', async (msg) => { if (!msg?.trim()) return; const { error } = await submitSupportTicket(uid, 'help', `Round chat help: ${label}`, `Round ID: ${id}\n\n${msg.trim()}`); if (error) return Alert.alert('Support error', error.message); Alert.alert('Sent', 'Support will reply by email.'); }) ?? null },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/chats')} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{round?.course_text || 'Round chat'}</Text>
            <Text style={styles.subtitle}>{round?.tee_time ? new Date(round.tee_time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Coordinate the round'}</Text>
          </View>
          <TouchableOpacity onPress={openSafetyMenu} style={styles.backButton}><Ionicons name="ellipsis-horizontal" size={20} color={colors.pine} /></TouchableOpacity>
        </View>
        {!allowed ? (
          <View style={styles.empty}>
            <Ionicons name="lock-closed-outline" size={36} color={colors.pine} />
            <Text style={styles.emptyTitle}>Round chat locked</Text>
            <Text style={styles.emptyText}>Only the host and confirmed players can access this conversation.</Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
              <View style={styles.notice}><Text style={styles.noticeText}>Keep this chat focused on tee times, course details, and round coordination.</Text></View>
              {messages.length === 0 ? <View style={styles.emptyInline}><Text style={styles.emptyTitle}>Start the round chat</Text><Text style={styles.emptyText}>Confirm the tee time, arrival plan, and any group details.</Text></View> : null}
              {messages.map((message) => {
                const mine = message.sender_id === session.user.id;
                const profile = profiles[message.sender_id];
                return (
                  <View key={message.id} style={[styles.messageRow, mine && styles.myMessageRow]}>
                    {!mine ? <TouchableOpacity onPress={() => openProfile(message.sender_id)} style={styles.messageAvatar}>{profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{profile?.display_name?.charAt(0)?.toUpperCase() || 'T'}</Text>}</TouchableOpacity> : null}
                    <TouchableOpacity disabled={mine} onPress={() => openProfile(message.sender_id)} style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>
                      {!mine ? <Text style={styles.senderName}>{profile?.display_name || 'TeeMate golfer'}</Text> : null}
                      <Text style={[styles.bubbleText, mine ? styles.myBubbleText : styles.theirBubbleText]}>{message.body}</Text>
                      <Text style={[styles.time, mine ? styles.myTime : styles.theirTime]}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.composer}>
              <TextInput value={body} onChangeText={setBody} placeholder="Message the round group..." placeholderTextColor={colors.muted} style={styles.input} multiline />
              <TouchableOpacity disabled={sending || !body.trim()} onPress={submit} style={styles.sendButton}>{sending ? <ActivityIndicator color={colors.cream} /> : <Ionicons name="send" size={20} color={colors.cream} />}</TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, header: { alignItems: 'center', backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, padding: 16 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, headerText: { flex: 1 }, title: { color: colors.pine, fontSize: 22, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 }, messages: { flex: 1 }, messageContent: { padding: 16, paddingBottom: 24 }, notice: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, marginBottom: 14, padding: 12 }, noticeText: { color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' }, messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, marginBottom: 10 }, myMessageRow: { justifyContent: 'flex-end' }, messageAvatar: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 34, justifyContent: 'center', overflow: 'hidden', width: 34 }, avatarImage: { height: 34, width: 34 }, avatarText: { color: colors.cream, fontSize: 13, fontWeight: '900' }, bubble: { borderRadius: 18, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 }, myBubble: { alignSelf: 'flex-end', backgroundColor: colors.pine }, theirBubble: { alignSelf: 'flex-start', backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, senderName: { color: colors.pine, fontSize: 12, fontWeight: '900', marginBottom: 4 }, bubbleText: { fontSize: 15, lineHeight: 21 }, myBubbleText: { color: colors.cream }, theirBubbleText: { color: colors.ink }, time: { fontSize: 10, fontWeight: '700', marginTop: 4 }, myTime: { color: 'rgba(242,238,225,0.7)' }, theirTime: { color: colors.muted }, composer: { alignItems: 'flex-end', backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12 }, sendButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 46, justifyContent: 'center', width: 46 }, empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 28, borderWidth: 1, margin: 20, padding: 28 }, emptyInline: { alignItems: 'center', padding: 28 }, emptyTitle: { color: colors.pine, fontSize: 20, fontWeight: '900', marginTop: 8, textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' },
});
