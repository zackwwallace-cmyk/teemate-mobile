import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

export default function DeleteAccountScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function requestDeletion() {
    if (confirmText.trim().toUpperCase() !== 'DELETE') return Alert.alert('Confirm deletion', 'Type DELETE to confirm account deletion.');
    Alert.alert('Delete account?', 'This will remove your profile from TeeMate, cancel your app session, and request deletion/anonymization of your account data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete account', style: 'destructive', onPress: async () => {
        setBusy(true);
        const { error } = await supabase.rpc('request_account_deletion');
        if (error) {
          const fallback = await supabase.from('support_tickets').insert({ user_id: session.user.id, category: 'account', subject: 'Account deletion request', message: 'User requested account deletion from the mobile app. RPC request_account_deletion is not available or failed.' });
          setBusy(false);
          if (fallback.error) return Alert.alert('Deletion request failed', fallback.error.message);
          await supabase.auth.signOut();
          return Alert.alert('Deletion requested', 'Your deletion request was sent to support.');
        }
        await supabase.auth.signOut();
        setBusy(false);
        Alert.alert('Account deletion requested', 'Your account deletion request has been submitted.');
      } },
    ]);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={22} color={colors.pine} /><Text style={styles.backText}>Back</Text></TouchableOpacity>
        <View style={styles.card}>
          <View style={styles.icon}><Ionicons name="trash-outline" size={30} color="#DC2626" /></View>
          <Text style={styles.title}>Delete account</Text>
          <Text style={styles.body}>Deleting your account removes your TeeMate profile from discovery and submits a deletion/anonymization request for account data tied to your user ID. Some records may be retained when required for safety, fraud prevention, billing, or legal obligations.</Text>
          <Text style={styles.warning}>Type DELETE below to confirm.</Text>
          <TextInput value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="DELETE" placeholderTextColor={colors.muted} style={styles.input} />
          <TouchableOpacity disabled={busy} onPress={requestDeletion} style={styles.deleteButton}>{busy ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.deleteText}>Delete my account</Text>}</TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 40 },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 8, marginBottom: 18 },
  backText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 26, borderWidth: 1, gap: 14, padding: 20 },
  icon: { alignItems: 'center', backgroundColor: '#FEE2E2', borderRadius: 999, height: 66, justifyContent: 'center', width: 66 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  warning: { color: '#991B1B', fontSize: 14, fontWeight: '900' },
  input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.ink, fontSize: 16, fontWeight: '900', padding: 14 },
  deleteButton: { alignItems: 'center', backgroundColor: '#DC2626', borderRadius: 18, justifyContent: 'center', minHeight: 54 },
  deleteText: { color: colors.cream, fontSize: 16, fontWeight: '900' },
});
