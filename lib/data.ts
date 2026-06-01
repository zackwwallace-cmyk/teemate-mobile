import { supabase } from './supabase';

export type Gender = 'male' | 'female' | 'nonbinary' | 'prefer_not_to_say' | 'other';
export type GenderFilter = 'any' | Gender;

export type Profile = {
  id: string;
  display_name: string;
  age: number | null;
  date_of_birth?: string | null;
  gender?: Gender | null;
  avatar_url: string | null;
  bio: string | null;
  handicap_index: number | null;
  home_area: string | null;
  approx_lat?: number | null;
  approx_lng?: number | null;
  skill: string | null;
  pace: string | null;
  travel: string | null;
  holes_pref: string | null;
  looking_for: string[] | null;
  founder_badge: boolean | null;
  founding_member: boolean | null;
  lifetime_premium: boolean | null;
  verified_plus?: boolean | null;
  onboarding_complete: boolean | null;
  rounds_played: number | null;
  rounds_completed?: number | null;
  avg_rating: number | null;
  course_ids?: string[];
  score?: number;
};

export type Course = { id: string; name: string; town: string | null; state: string | null; type: string | null };
export type Match = { id: string; golfer_a: string; golfer_b: string; initiated_by: string; status: string; created_at: string; updated_at: string; match_score: number | null };
export type Message = { id: string; match_id: string | null; round_id: string | null; sender_id: string; body: string; created_at: string; read_at: string | null };
export type Round = { id: string; course_text: string | null; town: string | null; tee_time: string; tee_time_end?: string | null; holes: number; open_slots: number; status: string; notes: string | null; host_id: string; format?: string; is_open_board?: boolean };
export type CreateRoundInput = { hostId: string; courseText: string; town?: string | null; teeTime: string; teeTimeEnd?: string | null; holes: number; openSlots: number; format: string; notes?: string | null };
export type FeedPost = { id: string; body: string; media_url: string | null; media_type: string | null; created_at: string; author_id: string; course_id?: string | null; course_text?: string | null; tee_time?: string | null; tagged_user_ids?: string[] | null };
export type CreateFeedPostInput = { body: string; mediaUrl?: string | null; mediaType?: string | null; courseId?: string | null; courseText?: string | null; teeTime?: string | null; taggedUserIds?: string[] };
export type PostLike = { post_id: string; user_id: string; created_at: string };
export type PostComment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
export type SupportTicket = { id: string; user_id: string; category: string; subject: string; message: string; status: string; admin_reply?: string | null; created_at: string; user?: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null };
export type Report = { id: string; reporter_id: string; reported_id: string | null; reason: string; created_at: string };

const PUBLIC_PROFILE_COLUMNS = 'id,display_name,age,gender,avatar_url,bio,handicap_index,home_area,approx_lat,approx_lng,skill,pace,travel,holes_pref,looking_for,founder_badge,founding_member,lifetime_premium,verified_plus,onboarding_complete,rounds_played,rounds_completed,avg_rating';
const ADMIN_PROFILE_COLUMNS = 'id,display_name,avatar_url,home_area,skill,rounds_completed,lifetime_premium,founder_badge,created_at';

function isMissingGenderColumn(error: any) { const message = String(error?.message ?? '').toLowerCase(); return message.includes('gender') && (message.includes('column') || message.includes('schema cache')); }
function isMissingColumn(error: any, column: string) { const message = String(error?.message ?? '').toLowerCase(); return message.includes(column.toLowerCase()) && (message.includes('column') || message.includes('schema cache')); }
function cutoff30DaysIso() { return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); }

function extractPostMedia(stored?: string | null) {
  if (!stored) return null;
  const clean = stored.split('?')[0];
  const markers = [
    { bucket: 'posts', marker: '/object/public/posts/' },
    { bucket: 'posts', marker: '/object/sign/posts/' },
    { bucket: 'post-media', marker: '/object/public/post-media/' },
    { bucket: 'post-media', marker: '/object/sign/post-media/' },
    { bucket: 'posts', marker: '/storage/v1/object/public/posts/' },
    { bucket: 'posts', marker: '/storage/v1/object/sign/posts/' },
    { bucket: 'post-media', marker: '/storage/v1/object/public/post-media/' },
    { bucket: 'post-media', marker: '/storage/v1/object/sign/post-media/' },
  ];
  for (const item of markers) {
    const idx = clean.indexOf(item.marker);
    if (idx >= 0) return { bucket: item.bucket, path: decodeURIComponent(clean.slice(idx + item.marker.length)) };
  }
  if (!stored.startsWith('http')) return { bucket: 'posts', path: stored.replace(/^posts\//, '').replace(/^post-media\//, '') };
  return { bucket: 'posts', path: stored };
}

async function signedPostMediaUrl(value?: string | null) {
  const media = extractPostMedia(value);
  if (!media) return null;
  const primary = await supabase.storage.from(media.bucket).createSignedUrl(media.path, 60 * 60 * 24 * 7);
  if (!primary.error && primary.data?.signedUrl) return primary.data.signedUrl;
  if (media.bucket === 'posts') {
    const fallback = await supabase.storage.from('post-media').createSignedUrl(media.path, 60 * 60 * 24 * 7);
    if (!fallback.error && fallback.data?.signedUrl) return fallback.data.signedUrl;
  }
  return value?.startsWith('http') ? value : null;
}
async function withSignedPostMedia(posts: FeedPost[]) { return Promise.all(posts.map(async (post) => ({ ...post, media_url: await signedPostMediaUrl(post.media_url) }))); }

export async function getMyProfile(userId: string) { return supabase.from('profiles').select('*').eq('id', userId).maybeSingle(); }
export async function upsertMyProfile(userId: string, values: Partial<Profile>) { const payload = { id: userId, ...values, updated_at: new Date().toISOString() } as any; let result = await supabase.from('profiles').upsert(payload).select('*').single(); if (result.error && isMissingGenderColumn(result.error)) { const { gender, ...safePayload } = payload; result = await supabase.from('profiles').upsert(safePayload).select('*').single(); } if (result.error && isMissingColumn(result.error, 'date_of_birth')) { const { date_of_birth, ...safePayload } = payload; result = await supabase.from('profiles').upsert(safePayload).select('*').single(); } return result; }
function scoreProfile(me: Profile | null, other: Profile & { course_ids?: string[] }, myCourseIds: string[]) { let score = 60; if (me?.skill && other.skill && me.skill === other.skill) score += 12; if (me?.pace && other.pace && me.pace === other.pace) score += 8; if (me?.travel && other.travel && me.travel === other.travel) score += 6; if (me?.holes_pref && other.holes_pref === me.holes_pref) score += 6; if (other.founder_badge || other.verified_plus) score += 4; if (myCourseIds.length && other.course_ids?.some((id) => myCourseIds.includes(id))) score += 14; return Math.max(1, Math.min(99, score)); }
async function fetchCandidateProfiles() { const first = await supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('onboarding_complete', true).limit(200).returns<Profile[]>(); if (first.error && isMissingGenderColumn(first.error)) return supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS.replace(',gender', '')).eq('onboarding_complete', true).limit(200).returns<Profile[]>(); return first; }
export async function getDiscoverStack(userId: string) { const { data: myProfile } = await getMyProfile(userId); const { data: existing, error: matchError } = await supabase.from('matches').select('golfer_a,golfer_b,status').or(`golfer_a.eq.${userId},golfer_b.eq.${userId}`); if (matchError) return { data: null, error: matchError }; const exclude = new Set<string>([userId]); existing?.forEach((match: any) => { exclude.add(match.golfer_a); exclude.add(match.golfer_b); }); const { data: blocks } = await supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId); blocks?.forEach((block: any) => exclude.add(block.blocked_id)); const { data: myCourses } = await supabase.from('profile_courses').select('course_id').eq('profile_id', userId); const myCourseIds = myCourses?.map((row: any) => row.course_id) ?? []; const { data: others, error } = await fetchCandidateProfiles(); if (error) return { data: null, error }; const candidates = (others ?? []).filter((profile) => !exclude.has(profile.id)); const ids = candidates.map((profile) => profile.id); const { data: profileCourses } = ids.length ? await supabase.from('profile_courses').select('profile_id,course_id').in('profile_id', ids) : { data: [] as any[] }; const courseMap = new Map<string, string[]>(); profileCourses?.forEach((row: any) => { const existingCourses = courseMap.get(row.profile_id) ?? []; existingCourses.push(row.course_id); courseMap.set(row.profile_id, existingCourses); }); const stack = candidates.map((profile) => { const withCourses = { ...profile, course_ids: courseMap.get(profile.id) ?? [] }; return { ...withCourses, score: scoreProfile(myProfile as Profile | null, withCourses, myCourseIds) }; }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)); return { data: stack, error: null }; }
export async function getDiscoverProfiles(userId: string) { return getDiscoverStack(userId); }
export async function createOrUpdateMatch(currentUserId: string, otherUserId: string, status: 'pending' | 'declined' | 'matched', matchScore?: number | null) { const existing = await supabase.from('matches').select('*').or(`and(golfer_a.eq.${currentUserId},golfer_b.eq.${otherUserId}),and(golfer_a.eq.${otherUserId},golfer_b.eq.${currentUserId})`).maybeSingle<Match>(); if (existing.error) return { data: null, error: existing.error }; if (existing.data) { return supabase.from('matches').update({ status, initiated_by: currentUserId, match_score: matchScore ?? existing.data.match_score ?? null, updated_at: new Date().toISOString() }).eq('id', existing.data.id).select('*').single(); } return supabase.from('matches').insert({ golfer_a: currentUserId, golfer_b: otherUserId, initiated_by: currentUserId, status, match_score: matchScore ?? null }).select('*').single(); }
export async function getMyMatches(userId: string) { return supabase.from('matches').select('*').or(`golfer_a.eq.${userId},golfer_b.eq.${userId}`).order('updated_at', { ascending: false }).returns<Match[]>(); }
export async function updateMatchStatus(matchId: string, status: 'matched' | 'declined' | 'canceled') { return supabase.from('matches').update({ status, updated_at: new Date().toISOString() }).eq('id', matchId).select('*').single(); }
export async function getProfilesByIds(ids: string[]) { if (!ids.length) return { data: [] as Profile[], error: null }; return supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).in('id', ids).returns<Profile[]>(); }
export async function getAllProfiles() { return supabase.from('profiles').select(PUBLIC_PROFILE_COLUMNS).eq('onboarding_complete', true).order('display_name', { ascending: true }).limit(200).returns<Profile[]>(); }
export async function getAllCourses() { return supabase.from('courses').select('id,name,town,state,type').order('name', { ascending: true }).limit(300).returns<Course[]>(); }
export async function createCourse(name: string) { return supabase.from('courses').insert({ name, state: 'CT', type: 'public' }).select('id,name,town,state,type').single<Course>(); }
export async function getMyProfileCourses(userId: string) { const { data: rows, error } = await supabase.from('profile_courses').select('course_id').eq('profile_id', userId); if (error) return { data: [] as Course[], error }; const ids = [...new Set((rows ?? []).map((row: any) => row.course_id).filter(Boolean))]; if (!ids.length) return { data: [] as Course[], error: null }; return supabase.from('courses').select('id,name,town,state,type').in('id', ids).order('name', { ascending: true }).returns<Course[]>(); }
export async function getMessages(matchId: string) { return supabase.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).returns<Message[]>(); }
export async function sendMessage(matchId: string, userId: string, body: string) { return supabase.from('messages').insert({ match_id: matchId, sender_id: userId, body }).select('*').single(); }
export async function getOpenRounds() { return supabase.from('rounds').select('*').eq('is_open_board', true).order('tee_time', { ascending: true }).limit(50).returns<Round[]>(); }
export async function createOpenRound(input: CreateRoundInput) { const payload = { host_id: input.hostId, course_text: input.courseText, town: input.town || null, tee_time: input.teeTime, tee_time_end: input.teeTimeEnd || null, holes: input.holes, open_slots: input.openSlots, format: input.format as any, notes: input.notes || null, is_open_board: true, status: 'proposed' }; let result = await supabase.from('rounds').insert(payload).select('*').single(); if (result.error && isMissingColumn(result.error, 'tee_time_end')) { const { tee_time_end, ...safePayload } = payload; result = await supabase.from('rounds').insert(safePayload).select('*').single(); } const { data, error } = result; if (error || !data) return { data, error }; await supabase.from('round_players').upsert({ round_id: data.id, player_id: input.hostId, confirmed: true }); return { data, error: null }; }
export async function joinRound(roundId: string, userId: string) { return supabase.from('round_players').upsert({ round_id: roundId, player_id: userId, confirmed: false }); }
export async function deleteOldFeedPosts() { return supabase.from('posts').delete().lt('created_at', cutoff30DaysIso()); }
export async function getFeedPosts() { const result = await supabase.from('posts').select('*').gte('created_at', cutoff30DaysIso()).order('created_at', { ascending: false }).limit(50).returns<FeedPost[]>(); if (result.error || !result.data) return result; return { data: await withSignedPostMedia(result.data), error: null }; }
export async function createFeedPost(userId: string, bodyOrInput: string | CreateFeedPostInput, mediaUrl?: string | null, mediaType?: string | null) { const input: CreateFeedPostInput = typeof bodyOrInput === 'string' ? { body: bodyOrInput, mediaUrl, mediaType } : bodyOrInput; const payload: any = { author_id: userId, body: input.body, media_url: input.mediaUrl || null, media_type: input.mediaType || null, course_id: input.courseId || null, course_text: input.courseText || null, tee_time: input.teeTime || null, tagged_user_ids: input.taggedUserIds?.length ? input.taggedUserIds : null }; let result = await supabase.from('posts').insert(payload).select('*').single(); const optionalColumns = ['media_url', 'media_type', 'course_id', 'course_text', 'tee_time', 'tagged_user_ids']; for (const column of optionalColumns) { if (result.error && isMissingColumn(result.error, column)) { delete payload[column]; result = await supabase.from('posts').insert(payload).select('*').single(); } } if (!result.error && result.data?.media_url) result.data.media_url = await signedPostMediaUrl(result.data.media_url); return result; }
export async function updateFeedPost(postId: string, userId: string, body: string) { return supabase.from('posts').update({ body }).eq('id', postId).eq('author_id', userId).select('*').single(); }
export async function deleteFeedPost(postId: string, userId: string) { return supabase.from('posts').delete().eq('id', postId).eq('author_id', userId); }
export async function uploadPostPhoto(userId: string, uri: string) { const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg'; const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg'; const contentType = safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg'; const path = `${userId}/${Date.now()}.${safeExt}`; const response = await fetch(uri); const blob = await response.blob(); const primary = await supabase.storage.from('posts').upload(path, blob, { cacheControl: '3600', contentType, upsert: false }); if (!primary.error && primary.data?.path) return { data: primary.data.path, error: null }; const fallback = await supabase.storage.from('post-media').upload(path, blob, { cacheControl: '3600', contentType, upsert: false }); if (!fallback.error && fallback.data?.path) return { data: fallback.data.path, error: null }; return { data: null, error: primary.error ?? fallback.error }; }
export async function getPostLikes(postIds: string[]) { if (!postIds.length) return { data: [] as PostLike[], error: null }; return supabase.from('post_likes').select('*').in('post_id', postIds).returns<PostLike[]>(); }
export async function getPostCommentCounts(postIds: string[]) { if (!postIds.length) return { data: [] as { post_id: string; id: string }[], error: null }; return supabase.from('post_comments').select('post_id,id').in('post_id', postIds); }
export async function getPostComments(postId: string) { return supabase.from('post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true }).returns<PostComment[]>(); }
export async function likePost(postId: string, userId: string) { return supabase.from('post_likes').upsert({ post_id: postId, user_id: userId }); }
export async function unlikePost(postId: string, userId: string) { return supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId); }
export async function addPostComment(postId: string, userId: string, body: string) { return supabase.from('post_comments').insert({ post_id: postId, author_id: userId, body }).select('*').single(); }
export async function submitSupportTicket(userId: string, category: string, subject: string, message: string) { return supabase.from('support_tickets').insert({ user_id: userId, category, subject, message }); }
export async function getMySupportTickets(userId: string) { return supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false }).returns<SupportTicket[]>(); }
export async function getAdminSupportTickets(status: string = 'all') { let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false }); if (status !== 'all') query = query.eq('status', status as any); const { data, error } = await query.returns<SupportTicket[]>(); if (error || !data) return { data, error }; const ids = [...new Set(data.map((ticket) => ticket.user_id).filter(Boolean))]; const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,display_name,avatar_url').in('id', ids) : { data: [] as any[] }; const map = new Map((profiles ?? []).map((profile: any) => [profile.id, profile])); return { data: data.map((ticket) => ({ ...ticket, user: map.get(ticket.user_id) ?? null })), error: null }; }
export async function updateSupportTicketStatus(id: string, status: string) { return supabase.from('support_tickets').update({ status }).eq('id', id); }
export async function replyToSupportTicket(id: string, reply: string) { return supabase.from('support_tickets').update({ admin_reply: reply, status: 'resolved' }).eq('id', id); }
export async function getAdminReports() { return supabase.from('reports').select('*').order('created_at', { ascending: false }).returns<Report[]>(); }
export async function getAdminOverview() { const [codesAll, codesUsed, users, rounds, reports] = await Promise.all([supabase.from('founder_codes').select('code', { count: 'exact', head: true }), supabase.from('founder_codes').select('code', { count: 'exact', head: true }).eq('status', 'used'), supabase.from('profiles').select('id', { count: 'exact', head: true }), supabase.from('rounds').select('id', { count: 'exact', head: true }), supabase.from('reports').select('id', { count: 'exact', head: true })]); return { data: { codesTotal: codesAll.count ?? 0, codesUsed: codesUsed.count ?? 0, users: users.count ?? 0, rounds: rounds.count ?? 0, reports: reports.count ?? 0 }, error: codesAll.error || codesUsed.error || users.error || rounds.error || reports.error }; }
export async function getAdminUsers() { return supabase.from('profiles').select(ADMIN_PROFILE_COLUMNS).order('created_at', { ascending: false }).limit(500).returns<Profile[]>(); }
export async function redeemFounderCode(code: string) { return supabase.rpc('redeem_founder_code', { _code: code }); }
