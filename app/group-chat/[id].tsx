import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getGroupChat, sendGroupMessage } from '@/lib/chats';
import { submitSupportTicket } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';
import type { Message, Profile } from '@/lib/data';

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, loading } = useSession();
  const [group, setGroup] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  async function load() {
    if (!session?.user.id || !id) return;
    setRefreshing(true);
    const { data, error } = await getGroupChat(id, session.user.id);
    setRefreshing(false);
    if (error) return Alert.alert('Group chat', error.message);
    setGroup(data?.group ?? null);
    setProfiles(data?.profiles ?? []);
    setMessages(data?.messages ?? []);
  }

  useEffect(() => { load(); }, [session?.user.id, id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function submit() {
    if (!session?.user.id || !id || !body.trim()) return;
    setSending(true);
    const { error } = await sendGroupMessage(id, session.user.id, body.trim());
    setSending(false);
    if (error) return Alert.alert('Send error', error.message);
    setBody('');
    await load();
  }

  function openSafetyMenu() {
    if (!session?.user.id) return;
    const uid = session.user.id;
    const title = group?.title || 'group chat';
    Alert.alert('Safety & support', `Report an issue with “${title}”`, [
      { text: 'Report this group', style: 'destructive', onPress: () => Alert.prompt?.('Report group', 'Describe the issue. Our safety team will review.', async (reason) => { if (!reason?.trim()) return; const { error } = await submitSupportTicket(uid, 'safety', `Report group chat: ${title}`, `Group ID: ${id}\n\n${reason.trim()}`); if (error) return Alert.alert('Report failed', error.message); Alert.alert('Report sent', 'Thanks — we will review this group.'); }) ?? null },
      { text: 'Contact support', onPress: () => Alert.prompt?.('Contact support', 'What do you need help with?', async (msg) => { if (!msg?.trim()) return; const { error } = await submitSupportTicket(uid, 'help', `Group chat help: ${title}`, `Group ID: ${id}\n\n${msg.trim()}`); if (error) return Alert.alert('Support error', error.message); Alert.alert('Sent', 'Support will reply by email.'); }) ?? null },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/chats')} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /></TouchableOpacity>
          <View style={styles.headerText}><Text style={styles.title}>{group?.title || 'Group chat'}</Text><Text style={styles.subtitle}>{profiles.map((profile) => profile.display_name).filter(Boolean).join(', ')}</Text></View>
          <TouchableOpacity onPress={openSafetyMenu} style={styles.backButton}><Ionicons name="ellipsis-horizontal" size={20} color={colors.pine} /></TouchableOpacity>
        </View>
        <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
          {messages.length === 0 ? <View style={styles.emptyInline}><Text style={styles.emptyTitle}>Start the group chat</Text><Text style={styles.emptyText}>Coordinate a round, talk courses, or make plans.</Text></View> : null}
          {messages.map((message) => {
            const mine = message.sender_id === session.user.id;
            const sender = profileMap.get(message.sender_id);
            return <View key={message.id} style={[styles.messageRow, mine && styles.myRow]}>{!mine ? <TouchableOpacity disabled={!sender?.id} onPress={() => sender?.id && router.push({ pathname: '/golfer/[id]', params: { id: sender.id } })} style={styles.avatar}>{sender?.avatar_url ? <Image source={{ uri: sender.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{sender?.display_name?.charAt(0)?.toUpperCase() || 'G'}</Text>}</TouchableOpacity> : null}<View style={[styles.bubble, mine ? styles.myBubble : styles.theirBubble]}>{!mine ? <Text style={styles.senderName}>{sender?.display_name || 'Golfer'}</Text> : null}<Text style={[styles.bubbleText, mine ? styles.myBubbleText : styles.theirBubbleText]}>{message.body}</Text><Text style={[styles.time, mine ? styles.myTime : styles.theirTime]}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View></View>;
          })}
        </ScrollView>
        <View style={styles.composer}><TextInput value={body} onChangeText={setBody} placeholder="Message the group..." placeholderTextColor={colors.muted} style={styles.input} multiline /><TouchableOpacity disabled={sending || !body.trim()} onPress={submit} style={styles.sendButton}>{sending ? <ActivityIndicator color={colors.cream} /> : <Ionicons name="send" size={20} color={colors.cream} />}</TouchableOpacity></View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, header: { alignItems: 'center', backgroundColor: colors.background, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', gap: 12, padding: 16 }, backButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, headerText: { flex: 1 }, title: { color: colors.pine, fontSize: 21, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 11, fontWeight: '700', marginTop: 2 }, messages: { flex: 1 }, messageContent: { padding: 16, paddingBottom: 24 }, messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, marginBottom: 10 }, myRow: { justifyContent: 'flex-end' }, avatar: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 34, justifyContent: 'center', overflow: 'hidden', width: 34 }, avatarImage: { height: 34, width: 34 }, avatarText: { color: colors.cream, fontSize: 13, fontWeight: '900' }, bubble: { borderRadius: 18, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 }, myBubble: { backgroundColor: colors.pine }, theirBubble: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }, senderName: { color: colors.pine, fontSize: 11, fontWeight: '900', marginBottom: 3 }, bubbleText: { fontSize: 15, lineHeight: 21 }, myBubbleText: { color: colors.cream }, theirBubbleText: { color: colors.ink }, time: { fontSize: 10, fontWeight: '700', marginTop: 4 }, myTime: { color: 'rgba(242,238,225,0.7)' }, theirTime: { color: colors.muted }, composer: { alignItems: 'flex-end', backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, padding: 12 }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12 }, sendButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 999, height: 46, justifyContent: 'center', width: 46 }, emptyInline: { alignItems: 'center', padding: 28 }, emptyTitle: { color: colors.pine, fontSize: 20, fontWeight: '900', marginTop: 8, textAlign: 'center' }, emptyText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center' } });
