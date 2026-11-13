// A digital bin's pickup location that the database won't save
import { locationSaveMessage } from '../locationSaveMessage.js';

test('the database\'s reasons that matter to the household are told plainly', () => {
  expect(locationSaveMessage('Failed to create location: Location is 0,0. Pick the pickup point on the map.')).toMatch(/Pick it on the map/);
  expect(locationSaveMessage('Location (6.1, 1.2) is outside Ghana and Liberia.')).toMatch(/outside the areas we serve/);
});

test('anything else asks to check the connection, never a raw database error', () => {
  for (const reason of ['Location insert timed out after 10 seconds', 'Failed to fetch', '', undefined, null]) {
    const m = locationSaveMessage(reason);
    expect(m).toBe("We couldn't save your pickup location. Check your connection and try again.");
    expect(m).not.toMatch(/uuid|syntax|insert/i);
  }
});
