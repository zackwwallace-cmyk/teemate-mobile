import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { Logo } from '@/components/Logo';
import { createCourse, createFeedPost, createOpenRound, getAllCourses, getOpenRounds, joinRound, type Course, type Round } from '@/lib/data';
import { approveRoundRequest, completeRoundByHost, declineRoundPlayer, deleteRoundByHost, getRoundPlayers, getRoundPlayersForUser, getRoundRequestsForHost, leaveRound, type RoundPlayerRequest } from '@/lib/roundRequests';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

const TIMES = ['6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const tomorrowKey = () => keyOf(new Date(Date.now() + 86400000));

function timeParts(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
  if (!match) return { hour: 9, minute: 0 };
  let hour = Number(match[1]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return { hour, minute: Number(match[2]) };
}

function toIso(dateKey: string, time: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const parts = timeParts(time);
  return new Date(year, month - 1, day, parts.hour, parts.minute).toISOString();
}

function prettyDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function prettyRound(round: Round) {
  const start = new Date(round.tee_time);
  const end = round.tee_time_end ? new Date(round.tee_time_end) : null;
  const date = start.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const startTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const endTime = end ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return `${date} • ${endTime ? `${startTime} - ${endTime}` : startTime}`;
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: last }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
}

export default function RoundsScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ courseId?: string; courseName?: string }>();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [requests, setRequests] = useState<RoundPlayerRequest[]>([]);
  const [players, setPlayers] = useState<Record<string, RoundPlayerRequest[]>>({});
  const [myRows, setMyRows] = useState<RoundPlayerRequest[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [month, setMonth] = useState(new Date());
  const [scoreRound, setScoreRound] = useState<Round | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    courseId: 'any',
    courseText: '',
    town: '',
    dateKey: tomorrowKey(),
    startTime: '9:00 AM',
    endTime: '11:00 AM',
    holes: '18',
    openSlots: '1',
    format: 'casual',
    notes: '',
  });
  const calendarDays = useMemo(() => monthDays(month), [month]);
  const filteredCourses = useMemo(() => {
    const term = form.courseText.trim().toLowerCase();
    if (!term) return courses.slice(0, 40);
    return courses.filter((course) => course.name.toLowerCase().includes(term)).slice(0, 40);
  }, [courses, form.courseText]);

  async function load() {
    setRefreshing(true);
    const [{ data, error }, { data: courseRows }] = await Promise.all([getOpenRounds(), getAllCourses()]);
    if (error) Alert.alert('Rounds error', error.message);
    const rows = data ?? [];
    setRounds(rows);
    setCourses(courseRows ?? []);
    if (session?.user.id) {
      const [{ data: hostRequests }, { data: mine }] = await Promise.all([
        getRoundRequestsForHost(session.user.id),
        getRoundPlayersForUser(session.user.id),
      ]);
      setRequests(hostRequests ?? []);
      setMyRows(mine ?? []);
      const map: Record<string, RoundPlayerRequest[]> = {};
      await Promise.all(rows.map(async (round) => {
        const { data: roundPlayers } = await getRoundPlayers(round.id);
        map[round.id] = roundPlayers ?? [];
      }));
      setPlayers(map);
    }
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [session?.user.id]);

  useEffect(() => {
    if (!params.courseId && !params.courseName) return;
    const selected = courses.find((course) => course.id === params.courseId || course.name === params.courseName);
    setForm((current) => ({
      ...current,
      courseId: selected?.id || params.courseId || 'any',
      courseText: selected?.name || params.courseName || current.courseText,
      town: selected?.town || current.town,
    }));
    setModalOpen(true);
  }, [params.courseId, params.courseName, courses.length]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function addCourseFromSearch() {
    const name = form.courseText.trim();
    if (!name) return;
    setAddingCourse(true);
    const { data, error } = await createCourse(name);
    setAddingCourse(false);
    if (error) return Alert.alert('Add course error', error.message);
    setCourses((current) => [...current, data]);
    setForm((current) => ({ ...current, courseId: data.id, courseText: data.name, town: data.town || current.town }));
  }

  async function postRound() {
    if (!session.user.id) return;
    const selectedCourse = courses.find((course) => course.id === form.courseId);
    const courseText = selectedCourse?.name || form.courseText.trim();
    if (!courseText) return Alert.alert('Course required', 'Select a course or add one.');
    const start = toIso(form.dateKey, form.startTime);
    const end = toIso(form.dateKey, form.endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) return Alert.alert('Time range issue', 'Latest time must be later than earliest time.');
    setPosting(true);
    const { error } = await createOpenRound({
      hostId: session.user.id,
      courseText,
      town: form.town.trim() || selectedCourse?.town || null,
      teeTime: start,
      teeTimeEnd: end,
      holes: Number(form.holes),
      openSlots: Number(form.openSlots),
      format: form.format,
      notes: form.notes.trim() || null,
    });
    setPosting(false);
    if (error) return Alert.alert('Post round error', error.message);
    setModalOpen(false);
    setForm({ courseId: 'any', courseText: '', town: '', dateKey: tomorrowKey(), startTime: '9:00 AM', endTime: '11:00 AM', holes: '18', openSlots: '1', format: 'casual', notes: '' });
    await load();
  }

  async function requestJoin(round: Round) {
    if (!session.user.id) return;
    if ((round.open_slots ?? 0) <= 0) return Alert.alert('No open slots', 'There are no open slots left for this round.');
    setJoining(round.id);
    const { error } = await joinRound(round.id, session.user.id);
    setJoining(null);
    if (error) return Alert.alert('Join round', error.message);
    await load();
    Alert.alert('Request sent', 'The host can accept or decline your request.');
  }

  async function approve(request: RoundPlayerRequest) {
    const round = rounds.find((item) => item.id === request.round_id);
    if (round && (round.open_slots ?? 0) <= 0) return Alert.alert('No open slots', 'This round is already full.');
    const key = `${request.round_id}-${request.player_id}`;
    setBusy(key);
    const { error } = await approveRoundRequest(request.round_id, request.player_id);
    setBusy(null);
    if (error) return Alert.alert('Approve request', error.message);
    await load();
  }

  async function decline(request: RoundPlayerRequest) {
    const key = `${request.round_id}-${request.player_id}`;
    setBusy(key);
    const { error } = await declineRoundPlayer(request.round_id, request.player_id);
    setBusy(null);
    if (error) return Alert.alert('Decline request', error.message);
    await load();
  }

  function cancelRound(round: Round) {
    Alert.alert('Cancel round?', 'This will cancel the round and notify players.', [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel round', style: 'destructive', onPress: async () => {
        const { error } = await deleteRoundByHost(round.id, session.user.id);
        if (error) return Alert.alert('Cancel round', error.message);
        await load();
      } },
    ]);
  }

  function leave(round: Round) {
    Alert.alert('Leave round?', 'Your spot will open back up and you will lose round chat access.', [
      { text: 'No', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        const { error } = await leaveRound(round.id, session.user.id);
        if (error) return Alert.alert('Leave round', error.message);
        await load();
      } },
    ]);
  }

  async function complete(round: Round) {
    const { error } = await completeRoundByHost(round.id, session.user.id);
    if (error) return Alert.alert('Complete round', error.message);
    setScoreRound(round);
    await load();
  }

  async function postScore() {
    if (!scoreRound) return;
    const confirmed = (players[scoreRound.id] ?? []).filter((player) => player.confirmed);
    const scoreText = Object.entries(scores).filter(([, score]) => score.trim()).map(([name, score]) => `${name}: ${score}`).join(' • ');
    const body = `Completed round at ${scoreRound.course_text || 'the course'}${scoreText ? ` • Scores: ${scoreText}` : ''}`;
    const { error } = await createFeedPost(session.user.id, { body, courseText: scoreRound.course_text, teeTime: scoreRound.tee_time, taggedUserIds: confirmed.map((player) => player.player_id) });
    if (error) return Alert.alert('Post score', error.message);
    setScoreRound(null);
    setScores({});
    Alert.alert('Posted', 'Round score was posted to the Board.');
  }

  const myRoundRow = (roundId: string) => myRows.find((row) => row.round_id === roundId);
  const pendingRequests = (roundId: string) => requests.filter((row) => row.round_id === roundId && !row.confirmed);
  const courseForRound = (round: Round) => courses.find((course) => course.name === round.course_text || (round.course_text && course.name.toLowerCase() === round.course_text.toLowerCase()));

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.topbar}>
          <Logo />
          <TouchableOpacity onPress={() => setModalOpen(true)} style={styles.postSmall}>
            <Ionicons name="add" size={20} color={colors.cream} />
            <Text style={styles.postSmallText}>Post</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>Open Rounds</Text>
        <Text style={styles.subtitle}>Post a tee time window, request to join, and coordinate in round group chat after approval.</Text>
        <TouchableOpacity onPress={() => setModalOpen(true)} style={styles.hero}>
          <Ionicons name="calendar-outline" size={26} color={colors.pine} />
          <View style={styles.flex}>
            <Text style={styles.heroTitle}>Open to a tee time?</Text>
            <Text style={styles.heroText}>Post date, time window, and up to 3 open slots.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.pine} />
        </TouchableOpacity>
        {rounds.map((round) => {
          const isHost = round.host_id === session.user.id;
          const myRow = myRoundRow(round.id);
          const approved = isHost || Boolean(myRow?.confirmed);
          const pending = Boolean(myRow && !myRow.confirmed);
          const full = (round.open_slots ?? 0) <= 0;
          const confirmedPlayers = (players[round.id] ?? []).filter((player) => player.confirmed && player.player_id !== round.host_id);
          return (
            <RoundCard
              key={round.id}
              round={round}
              course={courseForRound(round)}
              isHost={isHost}
              approved={approved}
              pending={pending}
              full={full}
              confirmedPlayers={confirmedPlayers}
              pendingRequests={pendingRequests(round.id)}
              joining={joining}
              busy={busy}
              onOpenCourse={(course: Course) => router.push({ pathname: '/course/[id]', params: { id: course.id } })}
              onOpenChat={() => router.push({ pathname: '/round-chat/[id]', params: { id: round.id } })}
              onRequestJoin={() => requestJoin(round)}
              onLeave={() => leave(round)}
              onApprove={approve}
              onDecline={decline}
              onComplete={() => complete(round)}
              onCancel={() => cancelRound(round)}
            />
          );
        })}
      </ScrollView>
      <PostRoundModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        form={form}
        setForm={setForm}
        month={month}
        setMonth={setMonth}
        calendarDays={calendarDays}
        courses={courses}
        filteredCourses={filteredCourses}
        addingCourse={addingCourse}
        onAddCourse={addCourseFromSearch}
        posting={posting}
        onPost={postRound}
      />
      <ScoreModal round={scoreRound} players={scoreRound ? players[scoreRound.id] ?? [] : []} scores={scores} setScores={setScores} onClose={() => setScoreRound(null)} onPost={postScore} />
      <BottomNav />
    </SafeAreaView>
  );
}

function RoundCard(props: any) {
  const { round, course, isHost, approved, pending, full, confirmedPlayers, pendingRequests, joining, busy, onOpenCourse, onOpenChat, onRequestJoin, onLeave, onApprove, onDecline, onComplete, onCancel } = props;
  const openSlots = Math.max(0, round.open_slots ?? 0);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="flag-outline" size={20} color={colors.pine} />
        <View style={styles.flex}>
          {course ? <TouchableOpacity onPress={() => onOpenCourse(course)}><Text style={[styles.course, styles.courseLink]}>{round.course_text || 'Golf round'}</Text></TouchableOpacity> : <Text style={styles.course}>{round.course_text || 'Golf round'}</Text>}
          <Text style={styles.meta}>{round.town || 'Local course'} • {prettyRound(round)}</Text>
        </View>
        {approved ? <TouchableOpacity onPress={onOpenChat}><Ionicons name="chatbubbles-outline" size={20} color={colors.pine} /></TouchableOpacity> : null}
      </View>
      <View style={styles.pills}>
        <Text style={styles.pill}>{round.holes} holes</Text>
        <Text style={styles.pill}>{openSlots} open {openSlots === 1 ? 'slot' : 'slots'}</Text>
        <Text style={styles.pill}>{full ? 'full' : round.status}</Text>
      </View>
      {round.notes ? <Text style={styles.note}>{round.notes}</Text> : null}
      {approved ? <TouchableOpacity onPress={onOpenChat} style={styles.chatBtn}><Text style={styles.chatText}>Round chat</Text></TouchableOpacity> : null}
      {isHost ? <HostControls pending={pendingRequests} confirmed={confirmedPlayers} busy={busy} full={full} onApprove={onApprove} onDecline={onDecline} onComplete={onComplete} onCancel={onCancel} /> : pending ? <Text style={styles.pending}>Request pending approval</Text> : approved ? <TouchableOpacity onPress={onLeave} style={styles.leave}><Text style={styles.leaveText}>Leave round</Text></TouchableOpacity> : full ? <Text style={styles.noSlots}>No open slots</Text> : <TouchableOpacity disabled={joining === round.id} onPress={onRequestJoin} style={styles.button}>{joining === round.id ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.buttonText}>Request to join</Text>}</TouchableOpacity>}
    </View>
  );
}

function HostControls({ pending, confirmed, busy, full, onApprove, onDecline, onComplete, onCancel }: any) {
  return (
    <View style={styles.hostBox}>
      <Text style={styles.hostTitle}>Host controls</Text>
      {pending.length && full ? <Text style={styles.hostHelp}>This round has no open slots. Decline a request or wait for someone to leave before accepting another golfer.</Text> : null}
      {pending.map((request: RoundPlayerRequest) => (
        <View key={request.player_id} style={styles.reqRow}>
          <View style={styles.reqAvatar}><Text style={styles.reqAvatarText}>{request.profile?.display_name?.[0]?.toUpperCase() || 'G'}</Text></View>
          <Text style={styles.reqName}>{request.profile?.display_name || 'Golfer'}</Text>
          <TouchableOpacity disabled={busy === `${request.round_id}-${request.player_id}`} onPress={() => onDecline(request)} style={styles.deny}><Ionicons name="close" size={18} color={colors.pine} /></TouchableOpacity>
          <TouchableOpacity disabled={busy === `${request.round_id}-${request.player_id}` || full} onPress={() => onApprove(request)} style={[styles.accept, full && styles.disabled]}><Ionicons name="checkmark" size={18} color={colors.cream} /></TouchableOpacity>
        </View>
      ))}
      {confirmed.map((player: RoundPlayerRequest) => (
        <View key={player.player_id} style={styles.confirmed}>
          <Ionicons name="checkmark-circle" size={18} color={colors.pine} />
          <Text style={styles.reqName}>{player.profile?.display_name || 'Golfer'}</Text>
        </View>
      ))}
      <View style={styles.hostActions}>
        <TouchableOpacity onPress={onComplete} style={styles.complete}><Text style={styles.completeText}>Complete</Text></TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function PostRoundModal({ visible, onClose, form, setForm, month, setMonth, calendarDays, courses, filteredCourses, addingCourse, onAddCourse, posting, onPost }: any) {
  const exactCourse = courses.some((course: Course) => course.name.toLowerCase() === form.courseText.trim().toLowerCase());
  const canAdd = Boolean(form.courseText.trim()) && !exactCourse;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}><TouchableOpacity onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity><Text style={styles.modalTitle}>Post Open Round</Text></View>
          <View style={styles.field}>
            <Text style={styles.label}>Select course</Text>
            <TextInput value={form.courseText} onChangeText={(value) => setForm({ ...form, courseId: 'any', courseText: value })} placeholder="Search course..." placeholderTextColor={colors.muted} style={styles.input} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {filteredCourses.map((course: Course) => <TouchableOpacity key={course.id} onPress={() => setForm({ ...form, courseId: course.id, courseText: course.name, town: course.town || form.town })} style={[styles.choice, form.courseId === course.id && styles.choiceActive]}><Text style={[styles.choiceText, form.courseId === course.id && styles.choiceTextActive]}>{course.name}</Text></TouchableOpacity>)}
              {canAdd ? <TouchableOpacity disabled={addingCourse} onPress={onAddCourse} style={styles.choice}><Text style={styles.choiceText}>{addingCourse ? 'Adding...' : `Add "${form.courseText.trim()}"`}</Text></TouchableOpacity> : null}
            </ScrollView>
          </View>
          <Input label="Town / area" value={form.town} onChangeText={(value: string) => setForm({ ...form, town: value })} />
          <Text style={styles.label}>Date</Text>
          <Text style={styles.selectedDate}>{prettyDate(form.dateKey)}</Text>
          <Calendar month={month} setMonth={setMonth} days={calendarDays} selected={form.dateKey} onSelect={(dateKey: string) => setForm((current: any) => ({ ...current, dateKey }))} />
          <Choice label="Earliest tee time" value={form.startTime} options={TIMES} onChange={(value) => setForm({ ...form, startTime: value })} />
          <Choice label="Latest tee time" value={form.endTime} options={TIMES} onChange={(value) => setForm({ ...form, endTime: value })} />
          <Choice label="Open slots" value={form.openSlots} options={['1', '2', '3']} onChange={(value) => setForm({ ...form, openSlots: value })} />
          <Choice label="Holes" value={form.holes} options={['9', '18']} onChange={(value) => setForm({ ...form, holes: value })} />
          <Choice label="Round type" value={form.format} options={['casual', 'competitive', 'practice']} onChange={(value) => setForm({ ...form, format: value })} />
          <Input label="Notes" value={form.notes} multiline onChangeText={(value: string) => setForm({ ...form, notes: value })} />
          <TouchableOpacity disabled={posting} onPress={onPost} style={styles.primary}>{posting ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.primaryText}>Post round</Text>}</TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ScoreModal({ round, players, scores, setScores, onClose, onPost }: any) {
  return (
    <Modal visible={Boolean(round)} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <TouchableOpacity onPress={onClose} style={styles.close}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity>
          <Text style={styles.modalTitle}>Finish round</Text>
          {players.filter((player: RoundPlayerRequest) => player.confirmed).map((player: RoundPlayerRequest) => <Input key={player.player_id} label={player.profile?.display_name || 'Golfer score'} value={scores[player.profile?.display_name || player.player_id] ?? ''} keyboardType="number-pad" onChangeText={(value: string) => setScores({ ...scores, [player.profile?.display_name || player.player_id]: value })} />)}
          <TouchableOpacity onPress={onPost} style={styles.primary}><Text style={styles.primaryText}>Post round and scores</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Calendar({ month, setMonth, days, selected, onSelect }: { month: Date; setMonth: (date: Date) => void; days: (Date | null)[]; selected: string; onSelect: (key: string) => void }) {
  return (
    <View style={styles.calendar}>
      <View style={styles.calHeader}>
        <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.calArrow}><Ionicons name="chevron-back" size={20} color={colors.pine} /></TouchableOpacity>
        <Text style={styles.calTitle}>{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</Text>
        <TouchableOpacity onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.calArrow}><Ionicons name="chevron-forward" size={20} color={colors.pine} /></TouchableOpacity>
      </View>
      <View style={styles.weekRow}>{WEEKDAYS.map((day) => <Text key={day} style={styles.week}>{day}</Text>)}</View>
      <View style={styles.grid}>{days.map((day, index) => { const dateKey = day ? keyOf(day) : `blank-${index}`; const active = day && dateKey === selected; return <TouchableOpacity key={dateKey} disabled={!day} onPress={() => day && onSelect(dateKey)} style={[styles.day, active && styles.dayActive]}><Text style={[styles.dayText, active && styles.dayTextActive]}>{day ? day.getDate() : ''}</Text></TouchableOpacity>; })}</View>
    </View>
  );
}

function Input(props: any) { const { label, ...rest } = props; return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} style={[styles.input, rest.multiline && styles.multiline]} {...rest} /></View>; }
function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><View style={styles.choiceRow}>{options.map((option) => <TouchableOpacity key={option} onPress={() => onChange(option)} style={[styles.choice, value === option && styles.choiceActive]}><Text style={[styles.choiceText, value === option && styles.choiceTextActive]}>{option}</Text></TouchableOpacity>)}</View></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: 20, paddingBottom: 118 }, flex: { flex: 1 }, topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }, postSmall: { backgroundColor: colors.pine, borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 13, paddingVertical: 9 }, postSmallText: { color: colors.cream, fontWeight: '900' }, title: { color: colors.pine, fontSize: 34, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 16 }, hero: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 14 }, heroTitle: { color: colors.ink, fontWeight: '900', fontSize: 17 }, heroText: { color: colors.muted, fontSize: 13, marginTop: 3 }, card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 22, padding: 16, marginBottom: 12 }, cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 }, course: { color: colors.ink, fontSize: 19, fontWeight: '900' }, courseLink: { color: colors.pine, textDecorationLine: 'underline' }, meta: { color: colors.pine, fontWeight: '800', fontSize: 13, marginTop: 3 }, pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 12 }, pill: { backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 999, color: colors.pine, fontWeight: '900', fontSize: 12, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' }, note: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 10 }, button: { backgroundColor: colors.pine, borderRadius: 15, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 14 }, buttonText: { color: colors.cream, fontWeight: '900' }, noSlots: { backgroundColor: 'rgba(220,38,38,0.08)', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 15, color: '#DC2626', fontWeight: '900', padding: 12, textAlign: 'center', marginTop: 12 }, chatBtn: { backgroundColor: colors.pine, borderRadius: 15, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, chatText: { color: colors.cream, fontWeight: '900' }, pending: { backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 15, color: colors.pine, fontWeight: '900', padding: 12, textAlign: 'center', marginTop: 12 }, leave: { borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 15, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, leaveText: { color: '#DC2626', fontWeight: '900' }, hostBox: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 12, marginTop: 12 }, hostTitle: { color: colors.ink, fontWeight: '900' }, hostHelp: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 }, reqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }, reqAvatar: { backgroundColor: colors.lime, borderRadius: 999, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, reqAvatarText: { color: colors.ink, fontWeight: '900' }, reqName: { color: colors.ink, fontWeight: '900', flex: 1 }, deny: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, accept: { backgroundColor: colors.pine, borderRadius: 999, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.35 }, confirmed: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 }, hostActions: { flexDirection: 'row', gap: 8, marginTop: 12 }, complete: { backgroundColor: colors.pine, borderRadius: 14, flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, completeText: { color: colors.cream, fontWeight: '900' }, cancel: { borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 14, flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: '#DC2626', fontWeight: '900' }, modal: { flex: 1, backgroundColor: colors.background }, modalContent: { padding: 20, paddingBottom: 34, gap: 13 }, modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, close: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 999, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, modalTitle: { color: colors.pine, fontSize: 27, fontWeight: '900' }, field: { gap: 6 }, label: { color: colors.ink, fontWeight: '800', fontSize: 13 }, input: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, color: colors.ink, fontSize: 16, padding: 13 }, multiline: { minHeight: 90, textAlignVertical: 'top' }, selectedDate: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 13, color: colors.ink, fontWeight: '900' }, choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { borderColor: colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, choiceActive: { backgroundColor: colors.pine, borderColor: colors.pine }, choiceText: { color: colors.pine, fontWeight: '900', fontSize: 12 }, choiceTextActive: { color: colors.cream }, primary: { backgroundColor: colors.pine, borderRadius: 17, minHeight: 52, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: colors.cream, fontWeight: '900', fontSize: 16 }, calendar: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 12 }, calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }, calArrow: { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 999, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, calTitle: { color: colors.pine, fontWeight: '900', fontSize: 16 }, weekRow: { flexDirection: 'row' }, week: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11, fontWeight: '900', marginBottom: 6 }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, day: { width: '14.285%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 999, marginVertical: 2 }, dayActive: { backgroundColor: colors.pine }, dayText: { color: colors.ink, fontWeight: '800' }, dayTextActive: { color: colors.cream } });
