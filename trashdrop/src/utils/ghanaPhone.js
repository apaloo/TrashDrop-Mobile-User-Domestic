/**
 * Ghana mobile numbers for airtime and data rewards.
 * Accepts 0244123456, 024 412 3456, +233244123456 or 233244123456 and
 * returns the 10-digit local form (0244123456), or null if it is not a
 * Ghana mobile number.
 */
export const normalizeGhanaPhone = (value) => {
  const digits = String(value || '').replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let local = null;
  if (/^233\d{9}$/.test(digits)) local = `0${digits.slice(3)}`;
  else if (/^0\d{9}$/.test(digits)) local = digits;
  else if (/^\d{9}$/.test(digits)) local = `0${digits}`;
  // Mobile numbers start 02x or 05x
  return local && /^0[25]\d{8}$/.test(local) ? local : null;
};

/** 0244123456 → "024 412 3456" */
export const formatGhanaPhone = (local) =>
  local && local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local || '';

export const MOBILE_NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];
