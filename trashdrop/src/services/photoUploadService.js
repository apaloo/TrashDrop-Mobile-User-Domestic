/**
 * Service for uploading photos to Supabase Storage
 */

import supabase from '../utils/supabaseClient.js';

const STORAGE_BUCKET = 'dumping-photos'; // Supabase storage bucket name
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max file size
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

/**
 * Convert blob URL to File object
 * @param {string} blobUrl - The blob URL
 * @param {string} filename - The desired filename
 * @returns {Promise<File>} File object
 */
const blobUrlToFile = async (blobUrl, filename) => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  } catch (error) {
    console.error('[PhotoUpload] Error converting blob URL to file:', error);
    throw new Error('Failed to process photo');
  }
};

/**
 * Validate photo file
 * @param {File} file - File to validate
 * @returns {Object} Validation result {valid: boolean, error?: string}
 */
const validatePhoto = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
  }

  return { valid: true };
};

/**
 * Generate unique filename for photo
 * @param {string} userId - User ID
 * @param {string} originalName - Original filename
 * @returns {string} Unique filename
 */
const generateFilename = (userId, originalName) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split('.').pop() || 'jpg';
  return `${userId}/${timestamp}_${random}.${extension}`;
};

/**
 * Upload a single photo to Supabase Storage
 * @param {string} blobUrl - Blob URL from camera capture
 * @param {string} userId - User ID
 * @param {string} originalFilename - Original filename (optional)
 * @returns {Promise<Object>} Upload result with public URL
 */
export const uploadPhoto = async (blobUrl, userId, originalFilename = 'photo.jpg') => {
  try {
    console.log('[PhotoUpload] Starting photo upload for user:', userId);

    // Convert blob URL to File object
    const file = await blobUrlToFile(blobUrl, originalFilename);
    console.log('[PhotoUpload] Converted blob to file:', file.name, file.size, 'bytes');

    // Validate the photo
    const validation = validatePhoto(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique filename
    const filename = generateFilename(userId, originalFilename);
    console.log('[PhotoUpload] Generated filename:', filename);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      console.error('[PhotoUpload] Upload error:', error);
      throw new Error(`Failed to upload photo: ${error.message}`);
    }

    console.log('[PhotoUpload] Upload successful:', data.path);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path);

    console.log('[PhotoUpload] Public URL:', publicUrl);

    return {
      success: true,
      path: data.path,
      publicUrl: publicUrl,
      filename: filename
    };

  } catch (error) {
    console.error('[PhotoUpload] Error uploading photo:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload photo'
    };
  }
};

/**
 * Upload multiple photos to Supabase Storage
 * @param {string[]} blobUrls - Array of blob URLs
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Upload results with public URLs
 */
export const uploadPhotos = async (blobUrls, userId) => {
  try {
    console.log(`[PhotoUpload] Starting batch upload of ${blobUrls.length} photos`);

    if (!Array.isArray(blobUrls) || blobUrls.length === 0) {
      return {
        success: false,
        error: 'No photos to upload'
      };
    }

    // Upload all photos in parallel
    const uploadPromises = blobUrls.map((blobUrl, index) =>
      uploadPhoto(blobUrl, userId, `photo_${index + 1}.jpg`)
    );

    const results = await Promise.all(uploadPromises);

    // Check for any failures
    const failures = results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn('[PhotoUpload] Some uploads failed:', failures);
    }

    // Extract successful public URLs
    const successfulUploads = results.filter(r => r.success);
    const publicUrls = successfulUploads.map(r => r.publicUrl);

    console.log(`[PhotoUpload] Batch upload complete: ${successfulUploads.length}/${blobUrls.length} successful`);

    return {
      success: successfulUploads.length > 0,
      publicUrls: publicUrls,
      totalUploaded: successfulUploads.length,
      totalFailed: failures.length,
      results: results
    };

  } catch (error) {
    console.error('[PhotoUpload] Error in batch upload:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload photos',
      publicUrls: []
    };
  }
};

/**
 * Delete a photo from Supabase Storage
 * @param {string} filePath - Path to file in storage
 * @returns {Promise<boolean>} Success status
 */
export const deletePhoto = async (filePath) => {
  try {
    console.log('[PhotoUpload] Deleting photo:', filePath);

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (error) {
      console.error('[PhotoUpload] Delete error:', error);
      return false;
    }

    console.log('[PhotoUpload] Photo deleted successfully');
    return true;

  } catch (error) {
    console.error('[PhotoUpload] Error deleting photo:', error);
    return false;
  }
};

export default {
  uploadPhoto,
  uploadPhotos,
  deletePhoto
};
