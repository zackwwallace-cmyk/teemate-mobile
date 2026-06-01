import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomNav } from '@/components/BottomNav';
import { Logo } from '@/components/Logo';
import { addPostComment, createCourse, createFeedPost, deleteFeedPost, deleteOldFeedPosts, getAllCourses, getAllProfiles, getFeedPosts, getMyProfile, getPostCommentCounts, getPostComments, getPostLikes, getProfilesByIds, likePost, unlikePost, updateFeedPost, uploadPostPhoto, type Course, type FeedPost, type PostComment, type Profile } from '@/lib/data';
import { colors } from '@/lib/theme';
import { useSession } from '@/lib/useSession';

type CommentWithProfile = PostComment & { profile?: Profile | null };
type DistanceFilter = 'any' | '25' | '50' | '100';
type DateFilter = 'any' | 'today' | 'week' | 'month';
type TimeFilter = 'any' | 'morning' | 'midday' | 'afternoon' | 'evening';

function distanceMiles(a?: Profile | null, b?: Profile | null) {
  if (!a?.approx_lat || !a?.approx_lng || !b?.approx_lat || !b?.approx_lng) return null;
  const r = 3958.8;
  const dLat = ((b.approx_lat - a.approx_lat) * Math.PI) / 180;
  const dLng = ((b.approx_lng - a.approx_lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.approx_lat * Math.PI) / 180) * Math.cos((b.approx_lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDateTime(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function dateMatches(value: string | null | undefined, filter: DateFilter) {
  if (filter === 'any') return true;
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (filter === 'today') return d.toDateString() === now.toDateString();
  if (filter === 'week') return diff >= -86400000 && diff <= 7 * 86400000;
  return diff >= -86400000 && diff <= 30 * 86400000;
}

function timeMatches(value: string | null | undefined, filter: TimeFilter) {
  if (filter === 'any') return true;
  if (!value) return false;
  const h = new Date(value).getHours();
  if (filter === 'morning') return h >= 5 && h < 12;
  if (filter === 'midday') return h >= 12 && h < 15;
  if (filter === 'afternoon') return h >= 15 && h < 18;
  return h >= 18 && h < 23;
}

function activeMentionQuery(text: string) {
  const match = text.match(/(^|\s)@([^@\n]*)$/);
  if (!match) return null;
  return match[2].toLowerCase();
}

function mentionedIds(text: string, profiles: Profile[]) {
  const lower = text.toLowerCase();
  return profiles.filter((profile) => profile.display_name && lower.includes(`@${profile.display_name.toLowerCase()}`)).map((profile) => profile.id);
}

function insertMention(text: string, displayName: string) {
  return text.replace(/(^|\s)@([^@\n]*)$/, `$1@${displayName} `);
}

function Avatar({ profile, size = 44 }: { profile?: Profile | null; size?: number }) {
  const initial = profile?.display_name?.charAt(0)?.toUpperCase() || 'T';
  return (
    <View style={[styles.avatarBase, { height: size, width: size, borderRadius: size / 2 }]}>
      {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={{ height: size, width: size }} resizeMode="cover" /> : <Text style={styles.authorInitial}>{initial}</Text>}
    </View>
  );
}

function MentionText({ text, profiles, onPressProfile, style }: { text: string; profiles: Record<string, Profile>; onPressProfile: (id: string) => void; style: any }) {
  const profileList = Object.values(profiles).filter((profile) => profile.display_name);
  const matches = profileList
    .map((profile) => ({ profile, index: text.toLowerCase().indexOf(`@${profile.display_name.toLowerCase()}`) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  if (!matches.length) return <Text style={style}>{text}</Text>;

  const pieces: any[] = [];
  let cursor = 0;
  matches.forEach(({ profile, index }) => {
    const mention = `@${profile.display_name}`;
    if (index < cursor) return;
    if (index > cursor) pieces.push(<Text key={`text-${cursor}`}>{text.slice(cursor, index)}</Text>);
    pieces.push(<Text key={`mention-${profile.id}-${index}`} style={styles.mentionText} onPress={() => onPressProfile(profile.id)}>{mention}</Text>);
    cursor = index + mention.length;
  });
  if (cursor < text.length) pieces.push(<Text key="tail">{text.slice(cursor)}</Text>);
  return <Text style={style}>{pieces}</Text>;
}

export default function FeedScreen() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [likedByMe, setLikedByMe] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [editingPost, setEditingPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [editBody, setEditBody] = useState('');
  const [body, setBody] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('any');
  const [courseSearch, setCourseSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('any');
  const [courseFilter, setCourseFilter] = useState('any');
  const [dateFilter, setDateFilter] = useState<DateFilter>('any');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('any');
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const mentionQuery = activeMentionQuery(body);
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return allProfiles
      .filter((profile) => profile.id !== session?.user.id)
      .filter((profile) => profile.display_name?.toLowerCase().includes(mentionQuery))
      .slice(0, 8);
  }, [allProfiles, mentionQuery, session?.user.id]);

  const filteredCourseOptions = useMemo(() => {
    const term = courseSearch.trim().toLowerCase();
    if (!term) return courses.slice(0, 30);
    return courses.filter((course) => course.name.toLowerCase().includes(term)).slice(0, 30);
  }, [courses, courseSearch]);

  const activeFilterCount = [distanceFilter, courseFilter, dateFilter, timeFilter].filter((value) => value !== 'any').length;
  const filteredPosts = useMemo(() => posts.filter((post) => {
    const author = profiles[post.author_id];
    if (distanceFilter !== 'any') {
      const d = distanceMiles(myProfile, author);
      if (d == null || d > Number(distanceFilter)) return false;
    }
    if (courseFilter !== 'any' && post.course_id !== courseFilter) return false;
    if (!dateMatches(post.tee_time ?? post.created_at, dateFilter)) return false;
    if (!timeMatches(post.tee_time, timeFilter)) return false;
    return true;
  }), [posts, profiles, myProfile, distanceFilter, courseFilter, dateFilter, timeFilter]);

  function openProfile(profileId?: string | null) {
    if (profileId) router.push({ pathname: '/golfer/[id]', params: { id: profileId } });
  }

  async function load() {
    if (!session?.user.id) return;
    setRefreshing(true);
    await deleteOldFeedPosts();
    const [{ data: postRows, error }, { data: me }, { data: courseRows }, { data: peopleRows }] = await Promise.all([
      getFeedPosts(),
      getMyProfile(session.user.id),
      getAllCourses(),
      getAllProfiles(),
    ]);
    if (error) Alert.alert('Board error', error.message);
    const rows = postRows ?? [];
    const people = peopleRows ?? [];
    setPosts(rows);
    setMyProfile(me ?? null);
    setCourses(courseRows ?? []);
    setAllProfiles(people);
    const postIds = rows.map((post) => post.id);
    const taggedIds = rows.flatMap((post) => post.tagged_user_ids ?? []);
    const ids = [...new Set([...rows.map((post) => post.author_id), ...taggedIds, ...people.map((profile) => profile.id)])];
    const [{ data: loadedProfiles }, { data: likes }, { data: commentRows }] = await Promise.all([
      getProfilesByIds(ids),
      getPostLikes(postIds),
      getPostCommentCounts(postIds),
    ]);
    const profileMap: Record<string, Profile> = {};
    (loadedProfiles ?? []).forEach((profile) => { profileMap[profile.id] = profile; });
    setProfiles(profileMap);
    const nextLikeCounts: Record<string, number> = {};
    const nextLikedByMe: Record<string, boolean> = {};
    (likes ?? []).forEach((like) => {
      nextLikeCounts[like.post_id] = (nextLikeCounts[like.post_id] ?? 0) + 1;
      if (like.user_id === session.user.id) nextLikedByMe[like.post_id] = true;
    });
    setLikeCounts(nextLikeCounts);
    setLikedByMe(nextLikedByMe);
    const nextCommentCounts: Record<string, number> = {};
    (commentRows ?? []).forEach((row) => { nextCommentCounts[row.post_id] = (nextCommentCounts[row.post_id] ?? 0) + 1; });
    setCommentCounts(nextCommentCounts);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, [session?.user.id]);

  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.pine} /></SafeAreaView>;
  if (!session) return <Redirect href="/" />;

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo permission needed', 'Allow photo access to upload a picture to the Board.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets?.[0]?.uri) setSelectedPhoto(result.assets[0].uri);
  }

  async function addCourseFromSearch() {
    const name = courseSearch.trim();
    if (!name) return;
    const { data, error } = await createCourse(name);
    if (error) return Alert.alert('Add course error', error.message);
    setCourses((current) => [...current, data]);
    setSelectedCourseId(data.id);
    setCourseSearch(data.name);
  }

  async function post() {
    if (!session?.user.id || (!body.trim() && !selectedPhoto)) return;
    setPosting(true);
    let photoUrl: string | null = null;
    if (selectedPhoto) {
      const upload = await uploadPostPhoto(session.user.id, selectedPhoto);
      if (upload.error) {
        setPosting(false);
        return Alert.alert('Photo upload error', upload.error.message);
      }
      photoUrl = upload.data;
    }
    const selectedCourse = courses.find((course) => course.id === selectedCourseId);
    const typedCourse = selectedCourse ? selectedCourse.name : courseSearch.trim() || null;
    const { error } = await createFeedPost(session.user.id, {
      body: body.trim(),
      mediaUrl: photoUrl,
      mediaType: photoUrl ? 'image' : null,
      courseId: selectedCourseId === 'any' ? null : selectedCourseId,
      courseText: typedCourse,
      teeTime: null,
      taggedUserIds: mentionedIds(body, allProfiles),
    });
    setPosting(false);
    if (error) return Alert.alert('Post error', error.message);
    setBody('');
    setSelectedPhoto(null);
    setSelectedCourseId('any');
    setCourseSearch('');
    await load();
  }

  async function toggleLike(id: string) {
    if (!session?.user.id) return;
    const liked = Boolean(likedByMe[id]);
    setLikedByMe((current) => ({ ...current, [id]: !liked }));
    setLikeCounts((current) => ({ ...current, [id]: Math.max(0, (current[id] ?? 0) + (liked ? -1 : 1)) }));
    const { error } = liked ? await unlikePost(id, session.user.id) : await likePost(id, session.user.id);
    if (error) {
      Alert.alert('Like error', error.message);
      await load();
    }
  }

  async function openComments(postRow: FeedPost) {
    setSelectedPost(postRow);
    setCommentBody('');
    const { data } = await getPostComments(postRow.id);
    const rows = data ?? [];
    const { data: people } = await getProfilesByIds([...new Set(rows.map((comment) => comment.author_id))]);
    const map = new Map((people ?? []).map((profile) => [profile.id, profile]));
    setComments(rows.map((comment) => ({ ...comment, profile: map.get(comment.author_id) ?? null })));
  }

  async function submitComment() {
    if (!session?.user.id || !selectedPost || !commentBody.trim()) return;
    setCommenting(true);
    const { error } = await addPostComment(selectedPost.id, session.user.id, commentBody.trim());
    setCommenting(false);
    if (error) return Alert.alert('Comment error', error.message);
    setCommentBody('');
    await openComments(selectedPost);
    await load();
  }

  function startEdit(postRow: FeedPost) {
    setEditingPost(postRow);
    setEditBody(postRow.body ?? '');
  }

  async function saveEdit() {
    if (!session?.user.id || !editingPost || !editBody.trim()) return;
    setSavingEdit(true);
    const { error } = await updateFeedPost(editingPost.id, session.user.id, editBody.trim());
    setSavingEdit(false);
    if (error) return Alert.alert('Edit post error', error.message);
    setEditingPost(null);
    setEditBody('');
    await load();
  }

  function confirmDelete(postRow: FeedPost) {
    Alert.alert('Delete post?', 'This will permanently remove your post from the Board.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (!session?.user.id) return;
        const { error } = await deleteFeedPost(postRow.id, session.user.id);
        if (error) return Alert.alert('Delete post error', error.message);
        await load();
      } },
    ]);
  }

  function resetFilters() {
    setDistanceFilter('any');
    setCourseFilter('any');
    setDateFilter('any');
    setTimeFilter('any');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}>
        <View style={styles.topbar}><Logo /></View>
        <View style={styles.titleRow}>
          <View><Text style={styles.title}>Board</Text><Text style={styles.subtitle}>Post golf updates, photos, course plans, and local golf talk.</Text></View>
          <TouchableOpacity onPress={() => setFiltersOpen(true)} style={styles.filterButton}>
            <Ionicons name="options-outline" size={18} color={colors.ink} />
            <Text style={styles.filterButtonText}>Filters</Text>
            {activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.composer}>
          <Text style={styles.sectionTitle}>Post to the golf board</Text>
          <TextInput value={body} onChangeText={setBody} placeholder="Type @ to tag a golfer..." placeholderTextColor={colors.muted} multiline style={styles.input} />
          {mentionSuggestions.length ? (
            <View style={styles.suggestionBox}>
              {mentionSuggestions.map((profile) => <TouchableOpacity key={profile.id} onPress={() => setBody((current) => insertMention(current, profile.display_name))} style={styles.suggestionRow}><Avatar profile={profile} size={34} /><View><Text style={styles.suggestionName}>{profile.display_name}</Text><Text style={styles.suggestionMeta}>{profile.home_area || 'TeeMate golfer'}</Text></View></TouchableOpacity>)}
            </View>
          ) : null}
          <Text style={styles.optionalLabel}>Select course (optional)</Text>
          <TextInput value={courseSearch} onChangeText={(text) => { setCourseSearch(text); setSelectedCourseId('any'); }} placeholder="Search course..." placeholderTextColor={colors.muted} style={styles.smallInput} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            <Chip label="None" active={selectedCourseId === 'any' && !courseSearch.trim()} onPress={() => { setSelectedCourseId('any'); setCourseSearch(''); }} />
            {filteredCourseOptions.map((course) => <Chip key={course.id} label={course.name} active={selectedCourseId === course.id} onPress={() => { setSelectedCourseId(course.id); setCourseSearch(course.name); }} />)}
            {courseSearch.trim() && filteredCourseOptions.length === 0 ? <Chip label={`Add "${courseSearch.trim()}"`} active={false} onPress={addCourseFromSearch} /> : null}
          </ScrollView>
          {selectedPhoto ? <View style={styles.previewWrap}><Image source={{ uri: selectedPhoto }} style={styles.previewImage} resizeMode="cover" /><TouchableOpacity onPress={() => setSelectedPhoto(null)} style={styles.removePhoto}><Ionicons name="close" size={18} color={colors.cream} /></TouchableOpacity></View> : null}
          <View style={styles.composerActions}>
            <TouchableOpacity onPress={pickPhoto} style={styles.photoButton}><Ionicons name="image-outline" size={18} color={colors.pine} /><Text style={styles.photoButtonText}>{selectedPhoto ? 'Change photo' : 'Add photo'}</Text></TouchableOpacity>
            <TouchableOpacity disabled={posting || (!body.trim() && !selectedPhoto)} onPress={post} style={styles.button}>{posting ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.buttonText}>Post</Text>}</TouchableOpacity>
          </View>
        </View>

        {filteredPosts.length === 0 ? <View style={styles.empty}><Ionicons name="newspaper-outline" size={36} color={colors.pine} /><Text style={styles.emptyTitle}>No posts here</Text><Text style={styles.emptyText}>Try another filter or create a Board post.</Text></View> : null}

        {filteredPosts.map((postRow) => {
          const author = profiles[postRow.author_id];
          const tagged = (postRow.tagged_user_ids ?? []).map((id) => profiles[id]?.display_name).filter(Boolean);
          const liked = Boolean(likedByMe[postRow.id]);
          const isMine = postRow.author_id === session.user.id;
          return (
            <View key={postRow.id} style={styles.card}>
              <View style={styles.postHeader}>
                <TouchableOpacity activeOpacity={0.75} onPress={() => openProfile(postRow.author_id)} style={styles.authorRow}>
                  <Avatar profile={author} size={44} />
                  <View><Text style={styles.author}>{author?.display_name || 'TeeMate golfer'}</Text><Text style={styles.date}>Tap to view profile • {new Date(postRow.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View>
                </TouchableOpacity>
                {isMine ? <View style={styles.ownerActions}><TouchableOpacity onPress={() => startEdit(postRow)} style={styles.ownerButton}><Ionicons name="create-outline" size={17} color={colors.pine} /></TouchableOpacity><TouchableOpacity onPress={() => confirmDelete(postRow)} style={styles.ownerButton}><Ionicons name="trash-outline" size={17} color="#DC2626" /></TouchableOpacity></View> : null}
              </View>
              {postRow.body ? <MentionText text={postRow.body} profiles={profiles} onPressProfile={openProfile} style={styles.body} /> : null}
              {postRow.media_url ? <Image source={{ uri: postRow.media_url }} style={styles.postImage} resizeMode="cover" /> : null}
              <View style={styles.metaWrap}>{postRow.course_text ? <Text style={styles.metaPill}>⛳ {postRow.course_text}</Text> : null}{postRow.tee_time ? <Text style={styles.metaPill}>📅 {formatDateTime(postRow.tee_time)}</Text> : null}{tagged.length ? <Text style={styles.metaPill}>Tagged: {tagged.map((name) => `@${name}`).join(', ')}</Text> : null}</View>
              <View style={styles.actionRow}><TouchableOpacity onPress={() => toggleLike(postRow.id)} style={[styles.actionButton, liked && styles.actionButtonActive]}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.cream : colors.pine} /><Text style={[styles.actionText, liked && styles.actionTextActive]}>{likeCounts[postRow.id] ?? 0}</Text></TouchableOpacity><TouchableOpacity onPress={() => openComments(postRow)} style={styles.actionButton}><Ionicons name="chatbubble-outline" size={18} color={colors.pine} /><Text style={styles.actionText}>{commentCounts[postRow.id] ?? 0}</Text></TouchableOpacity></View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={filtersOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFiltersOpen(false)}><SafeAreaView style={styles.modalScreen}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity><Text style={styles.modalTitle}>Board filters</Text></View><FilterGroup label="Distance" value={distanceFilter} options={[["any", "Any"], ["25", "Within 25 mi"], ["50", "Within 50 mi"], ["100", "Within 100 mi"]]} onChange={(value) => setDistanceFilter(value as DistanceFilter)} /><FilterGroup label="Course" value={courseFilter} options={[["any", "Any course"], ...courses.map((course) => [course.id, course.name] as [string, string])]} onChange={setCourseFilter} /><FilterGroup label="Date" value={dateFilter} options={[["any", "Any date"], ["today", "Today"], ["week", "This week"], ["month", "Next 30 days"]]} onChange={(value) => setDateFilter(value as DateFilter)} /><FilterGroup label="Time" value={timeFilter} options={[["any", "Any time"], ["morning", "Morning"], ["midday", "Midday"], ["afternoon", "Afternoon"], ["evening", "Evening"]]} onChange={(value) => setTimeFilter(value as TimeFilter)} /><View style={styles.modalActions}><TouchableOpacity onPress={resetFilters} style={styles.resetButton}><Text style={styles.resetButtonText}>Reset</Text></TouchableOpacity><TouchableOpacity onPress={() => setFiltersOpen(false)} style={styles.applyButton}><Text style={styles.applyButtonText}>Apply</Text></TouchableOpacity></View></ScrollView></SafeAreaView></Modal>

      <Modal visible={Boolean(selectedPost)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedPost(null)}><SafeAreaView style={styles.modalScreen}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setSelectedPost(null)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity><Text style={styles.modalTitle}>Comments</Text></View>{comments.map((comment) => <View key={comment.id} style={styles.commentCard}><TouchableOpacity activeOpacity={0.75} onPress={() => { setSelectedPost(null); openProfile(comment.author_id); }} style={styles.authorRow}><Avatar profile={comment.profile} size={34} /><View><Text style={styles.commentAuthor}>{comment.profile?.display_name || 'TeeMate golfer'}</Text><Text style={styles.commentDate}>Tap to view profile • {new Date(comment.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View></TouchableOpacity><Text style={styles.commentBody}>{comment.body}</Text></View>)}<View style={styles.commentComposer}><TextInput value={commentBody} onChangeText={setCommentBody} placeholder="Write a comment..." placeholderTextColor={colors.muted} multiline style={styles.commentInput} /><TouchableOpacity disabled={commenting || !commentBody.trim()} onPress={submitComment} style={styles.button}>{commenting ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.buttonText}>Comment</Text>}</TouchableOpacity></View></ScrollView></SafeAreaView></Modal>

      <Modal visible={Boolean(editingPost)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingPost(null)}><SafeAreaView style={styles.modalScreen}><ScrollView contentContainerStyle={styles.modalContent}><View style={styles.modalHeader}><TouchableOpacity onPress={() => setEditingPost(null)} style={styles.closeButton}><Ionicons name="close" size={22} color={colors.pine} /></TouchableOpacity><Text style={styles.modalTitle}>Edit post</Text></View><TextInput value={editBody} onChangeText={setEditBody} placeholder="Update your post..." placeholderTextColor={colors.muted} multiline style={styles.input} /><TouchableOpacity disabled={savingEdit || !editBody.trim()} onPress={saveEdit} style={styles.button}>{savingEdit ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.buttonText}>Save changes</Text>}</TouchableOpacity></ScrollView></SafeAreaView></Modal>
      <BottomNav />
    </SafeAreaView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text></TouchableOpacity>; }
function FilterGroup({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) { return <View style={styles.filterGroup}><Text style={styles.filterTitle}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{options.map(([id, text]) => <Chip key={id} label={text} active={value === id} onPress={() => onChange(id)} />)}</ScrollView></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }, content: { padding: 20, paddingBottom: 118 }, topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, paddingTop: 4 }, titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 14 }, title: { color: colors.pine, fontSize: 34, fontWeight: '900' }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 }, filterButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, paddingHorizontal: 13, paddingVertical: 10 }, filterButtonText: { color: colors.ink, fontSize: 13, fontWeight: '900' }, filterBadge: { alignItems: 'center', backgroundColor: colors.lime, borderRadius: 999, minWidth: 18, paddingHorizontal: 5, paddingVertical: 2 }, filterBadgeText: { color: colors.ink, fontSize: 10, fontWeight: '900' }, filterGroup: { gap: 8 }, filterTitle: { color: colors.ink, fontSize: 15, fontWeight: '900' }, filterRow: { gap: 8, paddingRight: 4 }, choiceRow: { gap: 8, paddingRight: 4 }, filterChip: { borderColor: colors.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 }, filterChipActive: { backgroundColor: colors.pine, borderColor: colors.pine }, filterText: { color: colors.pine, fontSize: 12, fontWeight: '900' }, filterTextActive: { color: colors.cream }, composer: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, gap: 12, marginBottom: 14, padding: 16 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, optionalLabel: { color: colors.muted, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 16, borderWidth: 1, color: colors.ink, minHeight: 92, padding: 14, textAlignVertical: 'top' }, smallInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, padding: 12 }, suggestionBox: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 18, borderWidth: 1, overflow: 'hidden' }, suggestionRow: { alignItems: 'center', flexDirection: 'row', gap: 10, padding: 10 }, suggestionName: { color: colors.ink, fontSize: 14, fontWeight: '900' }, suggestionMeta: { color: colors.muted, fontSize: 12, marginTop: 2 }, mentionText: { color: colors.pine, fontWeight: '900' }, composerActions: { alignItems: 'center', flexDirection: 'row', gap: 10 }, photoButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 }, photoButtonText: { color: colors.pine, fontSize: 14, fontWeight: '900' }, button: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 48 }, buttonText: { color: colors.cream, fontSize: 15, fontWeight: '900' }, previewWrap: { borderRadius: 18, overflow: 'hidden', position: 'relative' }, previewImage: { height: 180, width: '100%' }, removePhoto: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, height: 34, justifyContent: 'center', position: 'absolute', right: 10, top: 10, width: 34 }, empty: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 24, borderWidth: 1, padding: 24 }, emptyTitle: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 10 }, emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' }, card: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, marginBottom: 12, padding: 16 }, postHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, authorRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, avatarBase: { alignItems: 'center', backgroundColor: colors.pine, justifyContent: 'center', overflow: 'hidden' }, authorInitial: { color: colors.cream, fontSize: 16, fontWeight: '900' }, author: { color: colors.ink, fontSize: 16, fontWeight: '900' }, date: { color: colors.muted, fontSize: 11, marginTop: 2 }, ownerActions: { flexDirection: 'row', gap: 7 }, ownerButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 }, body: { color: colors.ink, fontSize: 15, lineHeight: 22, marginTop: 12 }, postImage: { borderRadius: 18, height: 220, marginTop: 12, width: '100%', backgroundColor: colors.background }, metaWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }, metaPill: { backgroundColor: 'rgba(21,64,44,0.1)', borderRadius: 999, color: colors.pine, fontSize: 12, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 }, actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 }, actionButton: { alignItems: 'center', borderColor: colors.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 13 }, actionButtonActive: { backgroundColor: colors.pine, borderColor: colors.pine }, actionText: { color: colors.pine, fontSize: 13, fontWeight: '900' }, actionTextActive: { color: colors.cream }, modalScreen: { flex: 1, backgroundColor: colors.background }, modalContent: { gap: 16, padding: 20, paddingBottom: 34 }, modalHeader: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 4 }, closeButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 999, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 }, modalTitle: { color: colors.pine, fontSize: 28, fontWeight: '900' }, modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 }, resetButton: { alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border, borderRadius: 16, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 }, resetButtonText: { color: colors.pine, fontSize: 15, fontWeight: '900' }, applyButton: { alignItems: 'center', backgroundColor: colors.pine, borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 50 }, applyButtonText: { color: colors.cream, fontSize: 15, fontWeight: '900' }, commentCard: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 18, borderWidth: 1, padding: 14 }, commentAuthor: { color: colors.ink, fontSize: 15, fontWeight: '900' }, commentDate: { color: colors.muted, fontSize: 11, marginTop: 2 }, commentBody: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 8 }, commentComposer: { backgroundColor: colors.card, borderColor: colors.border, borderRadius: 22, borderWidth: 1, gap: 10, marginTop: 8, padding: 12 }, commentInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 14, borderWidth: 1, color: colors.ink, minHeight: 76, padding: 12, textAlignVertical: 'top' } });
