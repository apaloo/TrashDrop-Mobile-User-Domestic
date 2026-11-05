/**
 * Profile photo upload: shrink on the phone, store in the `avatars` bucket,
 * and save only the short public URL on the profile.
 */
import supabase from '../utils/supabaseClient.js';

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_SIZE = 400; // px, longest side
const MAX_SOURCE_BYTES = 25 * 1024 * 1024; // any normal phone photo

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a photo we can read. Try a JPG or PNG.")); };
  img.src = url;
});

/** Square-crop to the centre and scale to AVATAR_SIZE, as a JPEG blob (~30–80 KB). */
export const shrinkAvatar = async (file) => {
  if (!file || !/^image\//.test(file.type || 'image/')) {
    throw new Error('Please choose a photo.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That photo is too large. Please choose a smaller one.');
  }
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = ((img.naturalWidth || img.width) - side) / 2;
  const sy = ((img.naturalHeight || img.height) - side) / 2;
  const out = Math.min(AVATAR_SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error("We couldn't prepare that photo. Please try another.");
  return blob;
};

/**
 * Upload the photo and save its URL on the profile.
 * Only avatar_url is written, so the rest of the profile is never touched.
 * @returns {Promise<string>} public URL of the new photo
 */
export const uploadAvatar = async (userId, file) => {
  if (!userId) throw new Error('You must be signed in to change your photo.');
  const blob = await shrinkAvatar(file);
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (uploadError) {
    console.error('[Avatar] Upload failed:', uploadError);
    throw new Error("Your photo didn't upload. Please try again in a moment.");
  }

  const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error: saveError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (saveError) {
    console.error('[Avatar] Saving the photo on the profile failed:', saveError);
    throw new Error("Your photo uploaded but wasn't saved to your profile. Please try again.");
  }

  // Tidy up older photos in this user's folder; failure here doesn't matter
  supabase.storage.from(AVATAR_BUCKET).list(userId)
    .then(({ data }) => {
      const old = (data || []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
      if (old.length) supabase.storage.from(AVATAR_BUCKET).remove(old);
    })
    .catch(() => {});

  return publicUrl;
};
