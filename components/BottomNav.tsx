import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getTabBadges, type TabBadges } from '@/lib/badges';
import { getMyProfile, type Profile } from '@/lib/data';
import { isTeeMatePlus } from '@/lib/premium';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

const tabs = [
  { href: '/rounds', label: 'Rounds', icon: 'calendar-outline', badgeKey: 'rounds' },
  { href: '/discover', label: 'Partners', icon: 'golf-outline' },
  { href: '/chats', label: 'Messages', icon: 'chatbubbles-outline', badgeKey: 'connections' },
  { href: '/feed', label: 'Board', icon: 'newspaper-outline' },
  { href: '/profile', label: 'Profile', icon: 'person-outline' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const [badges, setBadges] = useState<TabBadges>({ rounds: 0, connections: 0 });
  const [profile, setProfile] = useState<Profile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function loadBadges() {
        if (!session?.user.id) { setBadges({ rounds: 0, connections: 0 }); setProfile(null); return; }
        const [next, profileResult] = await Promise.all([getTabBadges(session.user.id), getMyProfile(session.user.id)]);
        if (active) {
          setBadges(next);
          setProfile(profileResult.data ?? null);
        }
      }
      loadBadges();
      return () => { active = false; };
    }, [session?.user.id])
  );

  const showJoinPlus = pathname === '/profile' && !isTeeMatePlus(profile as any);

  return (
    <View style={styles.shell}>
      {showJoinPlus ? <Pressable onPress={() => router.push('/upgrade' as any)} style={({ pressed }) => [styles.joinPlus, pressed && styles.pressedTab]}><Ionicons name="flash" size={16} color={colors.pine} /><Text style={styles.joinPlusText}>Join TeeMate+</Text></Pressable> : null}
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const active = pathname === tab.href || (tab.href === '/chats' && pathname === '/matches');
          const badgeKey = 'badgeKey' in tab ? tab.badgeKey : undefined;
          const count = badgeKey ? badges[badgeKey] : 0;
          return (
            <Pressable key={tab.href} onPress={() => { if (!active) router.replace(tab.href as any); }} style={({ pressed }) => [styles.tab, active && styles.activeTab, pressed && styles.pressedTab]}>
              <View style={styles.tabInner}>
                <View style={styles.iconWrap}>
                  <Ionicons name={tab.icon as any} size={19} color={active ? colors.ink : colors.muted} />
                  {count > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text></View> : null}
                </View>
                <Text style={[styles.label, active && styles.activeLabel]}>{tab.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { bottom: 0, left: 0, paddingBottom: 14, paddingHorizontal: 8, position: 'absolute', right: 0 },
  joinPlus: { alignItems: 'center', alignSelf: 'center', backgroundColor: colors.lime, borderColor: colors.pine, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginBottom: 8, minHeight: 42, paddingHorizontal: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 6 },
  joinPlusText: { color: colors.pine, fontSize: 14, fontWeight: '900' },
  bar: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 1, justifyContent: 'space-between', padding: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 8 },
  tab: { borderRadius: 999, flex: 1, overflow: 'hidden', paddingVertical: 7 },
  activeTab: { backgroundColor: colors.lime },
  pressedTab: { opacity: 0.72 },
  tabInner: { alignItems: 'center', gap: 1 },
  iconWrap: { position: 'relative' },
  badge: { alignItems: 'center', backgroundColor: colors.danger, borderColor: colors.card, borderRadius: 999, borderWidth: 1.5, height: 17, justifyContent: 'center', minWidth: 17, paddingHorizontal: 4, position: 'absolute', right: -10, top: -8 },
  badgeText: { color: 'white', fontSize: 9, fontWeight: '900' },
  label: { color: colors.muted, fontSize: 8, fontWeight: '800' },
  activeLabel: { color: colors.ink },
});