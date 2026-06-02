import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim()) return Alert.alert('Email', 'Enter your email.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'teemate://reset-password',
    });
    setBusy(false);
    if (error) return Alert.alert('Reset password', error.message);
    setSent(true);
    Alert.alert('Reset password', 'If that email exists, a reset link is on its way.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <TouchableOpacity onPress={() => router.replace({ pathname: '/auth', params: { mode: 'signin' } } as any)} style={styles.backButton}>
          <Text style={styles.backText}>← Back to sign in</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>We'll email you a link to set a new password.</Text>
        </View>

        {sent ? (
          <View style={styles.sentCard}>
            <Text style={styles.sentText}>Check <Text style={styles.sentEmail}>{email}</Text> for a reset link. It expires in an hour.</Text>
            <TouchableOpacity onPress={() => router.replace({ pathname: '/auth', params: { mode: 'signin' } } as any)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} style={styles.input} value={email} />
            <TouchableOpacity disabled={busy} onPress={submit} style={styles.primaryButton}>
              {busy ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryButtonText}>Send reset link</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.replace({ pathname: '/auth', params: { mode: 'signin' } } as any)} style={styles.inlineSwitch}>
              <Text style={styles.switchText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  backButton: { marginBottom: 28 },
  backText: { color: colors.pine, fontSize: 15, fontWeight: '900' },
  hero: { marginBottom: 28 },
  title: { color: colors.pine, fontSize: 34, fontWeight: '900', letterSpacing: -0.6 },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 24, marginTop: 8 },
  form: { gap: 12 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 16, padding: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 18, minHeight: 54, justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: colors.cream, fontSize: 16, fontWeight: '900' },
  inlineSwitch: { marginTop: 6 },
  switchText: { color: colors.pine, fontSize: 15, fontWeight: '900', textAlign: 'center', textDecorationLine: 'underline' },
  sentCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: 20 },
  sentText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  sentEmail: { fontWeight: '900' },
});
