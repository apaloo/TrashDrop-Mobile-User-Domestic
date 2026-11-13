/**
 * What a household sees when their pickup location can't be saved for a
 * digital bin. The database refuses a point at 0,0 or outside the countries
 * we serve (reject_location_outside_ghana on bin_locations); those reasons
 * are worth telling. Anything else is most often the connection.
 */
export function locationSaveMessage(reason = '') {
  const text = String(reason || '');
  if (/is 0,0/i.test(text)) {
    return "We couldn't read your pickup point. Pick it on the map and try again.";
  }
  if (/outside Ghana/i.test(text)) {
    return "This pickup point is outside the areas we serve. Check the point on the map and try again.";
  }
  return "We couldn't save your pickup location. Check your connection and try again.";
}
