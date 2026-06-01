import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';
import type { Profile } from '@/lib/data';

export function ProfileCard({ profile }: { profile: Profile }) {
  const badge = profile.founder_badge || profile.founding_member || profile.lifetime_premium;

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{profile.display_name?.charAt(0)?.toUpperCase() || 'T'}</Text>
      </View>
      <Text style={styles.name}>{profile.display_name || 'TeeMate golfer'}</Text>
      {badge ? <Text style={styles.badge}>Founder Member</Text> : null}
      <Text style={styles.meta}>{[profile.home_area, profile.skill, profile.handicap_index != null ? `${profile.handicap_index} HCP` : null].filter(Boolean).join(' • ') || 'Golfer profile'}</Text>
      {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
      <View style={styles.stats}>
        <Stat label="Pace" value={profile.pace || 'any'} />
        <Stat label="Travel" value={profile.travel || 'any'} />
        <Stat label="Rounds" value={String(profile.rounds_played ?? 0)} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 28, padding: 22, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  avatar: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.lime, borderRadius: 56, height: 112, justifyContent: 'center', marginBottom: 18, width: 112 },
  avatarText: { color: colors.ink, fontSize: 48, fontWeight: '900' },
  name: { color: colors.ink, fontSize: 28, fontWeight: '900', textAlign: 'center' },
  badge: { alignSelf: 'center', backgroundColor: colors.pine, borderRadius: 999, color: 'white', fontSize: 12, fontWeight: '800', marginTop: 8, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 6 },
  meta: { color: colors.pine, fontSize: 15, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  bio: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 14, textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 10, marginTop: 20 },
  stat: { backgroundColor: colors.background, borderRadius: 16, flex: 1, padding: 12 },
  statValue: { color: colors.ink, fontSize: 14, fontWeight: '900', textAlign: 'center', textTransform: 'capitalize' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: 'center' },
});
