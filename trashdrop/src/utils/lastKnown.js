/**
 * The last good copy of something the app loaded, kept on this phone per
 * person, so a screen can show it instead of an error when there's no signal.
 */
const keyFor = (name, userId) => `trashdrop_last_${name}_${userId}`;

export const saveLastKnown = (name, userId, value) => {
  try {
    localStorage.setItem(keyFor(name, userId), JSON.stringify(value));
  } catch (e) { /* storage full or blocked: it's only a convenience */ }
};

export const readLastKnown = (name, userId) => {
  try {
    const raw = localStorage.getItem(keyFor(name, userId));
    return raw === null ? null : JSON.parse(raw);
  } catch (e) {
    return null;
  }
};
