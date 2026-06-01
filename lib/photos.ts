import { supabase } from './supabase';

function fileInfo(uri: string) {
  const ext = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const contentType = safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg';
  return { ext: safeExt, contentType };
}

async function uploadToBucket(bucket: string, userId: string, uri: string) {
  const { ext, contentType } = fileInfo(uri);
  const path = `${userId}/${Date.now()}.${ext}`;
  const response = await fetch(uri);
  const blob = await response.blob();
  const { data, error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: false });
  if (error || !data?.path) return { data: null, error };
  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return { data: publicUrl.publicUrl, error: null };
}

export async function uploadProfilePhoto(userId: string, uri: string) {
  const primary = await uploadToBucket('profile-photos', userId, uri);
  if (!primary.error && primary.data) return primary;

  // Backward-compatible fallback for projects that only created post-media.
  const fallback = await uploadToBucket('post-media', userId, uri);
  if (!fallback.error && fallback.data) return fallback;

  return {
    data: null,
    error: primary.error ?? fallback.error ?? { message: 'Photo upload failed.' },
  };
}
