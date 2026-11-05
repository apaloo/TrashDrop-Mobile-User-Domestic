/**
 * Turn a failed location request into a problem the user can fix.
 *
 * A browser reports a phone with its location switched off much like a
 * blocked site, so the site permission is read as well: if the site is
 * allowed but no position came back, the phone's location is off.
 */

/** Current site permission for location: 'granted' | 'denied' | 'prompt' | 'unknown' */
export const readLocationPermission = async () => {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'unknown';
  } catch (err) {
    return 'unknown';
  }
};

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;
const TIMEOUT = 3;

/**
 * @param {{code?: number}|null} error  GeolocationPositionError (or null if unsupported)
 * @param {string} permission  result of readLocationPermission()
 * @returns {{kind: string, title: string, steps: string[]}}
 */
export const describeLocationProblem = (error, permission = 'unknown') => {
  if (!error) {
    return {
      kind: 'unsupported',
      title: "This browser can't share your location",
      steps: ['Tap the map where the dumping is to set the location.'],
    };
  }

  if (error.code === PERMISSION_DENIED && permission === 'denied') {
    return {
      kind: 'blocked',
      title: 'TrashDrop is not allowed to use your location',
      steps: [
        'Tap the lock or settings icon next to the web address at the top of your browser.',
        'Open Permissions (or Site settings), then set Location to Allow.',
        'Come back here and tap Try again.',
      ],
    };
  }

  if (error.code === PERMISSION_DENIED || error.code === POSITION_UNAVAILABLE) {
    return {
      kind: 'device-off',
      title: "Your phone's location is turned off",
      steps: [
        'Swipe down from the top of the screen and tap Location to turn it on.',
        'Come back here and tap Try again.',
      ],
    };
  }

  if (error.code === TIMEOUT) {
    return {
      kind: 'weak-signal',
      title: "We couldn't find your position yet",
      steps: [
        'Make sure Location is on, and move outdoors or near a window.',
        'Tap Try again, or tap the map where the dumping is.',
      ],
    };
  }

  return {
    kind: 'unknown',
    title: "We couldn't get your location",
    steps: ['Check that Location is on, then tap Try again, or tap the map where the dumping is.'],
  };
};
