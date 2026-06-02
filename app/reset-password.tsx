import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit() {
    if (pw.length < 8) return Alert.alert('Password', 'Password must be at least 8 characters');
    if (pw !== pw2) return Alert.alert('Password', "Passwords don't match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return Alert.alert('Reset password', error.message);
    Alert.alert('Password updated', "Password updated — you're signed in.");
    router.replace('/discover' as any);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>{ready ? 'Choose a new password for your account.' : 'Verifying your reset link…'}</Text>
        {ready ? <View style={styles.form}>
          <TextInput autoCapitalize="none" onChangeText={setPw} placeholder="New password" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} value={pw} />
          <TextInput autoCapitalize="none" onChangeText={setPw2} placeholder="Confirm password" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} value={pw2} />
          <TouchableOpacity disabled={busy} onPress={submit} style={styles.primaryButton}>{busy ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryButtonText}>Update password</Text>}</TouchableOpacity>
        </View> : <ActivityIndicator color={colors.pine} />}
        <TouchableOpacity onPress={() => router.replace({ pathname: '/auth', params: { mode: 'signin' } } as any)} style={styles.backButton}><Text style={styles.backText}>Back to sign in</Text></TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: colors.pine, fontSize: 34, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 24, marginTop: 8, marginBottom: 28 },
  form: { gap: 12 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, color: colors.ink, fontSize: 16, padding: 16 },
  primaryButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 18, minHeight: 54, justifyContent: 'center', marginTop: 4 },
  primaryButtonText: { color: colors.cream, fontSize: 16, fontWeight: '900' },
  backButton: { marginTop: 22 },
  backText: { color: colors.pine, fontSize: 15, fontWeight: '900', textAlign: 'center', textDecorationLine: 'underline' },
});
