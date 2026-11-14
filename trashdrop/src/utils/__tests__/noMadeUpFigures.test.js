// Households act on what this app shows, so it never shows made-up figures: a
// random number may make an id, a retry delay or a speed test, never a
// count, an amount or points someone reads. Found 2026-11-14 in the
// collector app (random "points" on job cards, an unpaid "completion
// bonus"); the same guard runs in all three apps. Math.random() may appear
// only in the places listed here, for the reason given.
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');

// file -> patterns each Math.random line there must match
const ALLOWED = {
  'components/AppPerformanceProvider.js': [/sum \+= Math\.random\(\);/], // device speed test
  'components/CameraModal.js': [/const photoId = Date\.now\(\) \+ Math\.random\(\);/], // photo id
  'components/profile/Locations.js': [/const newLocationId = `local_\$\{Date\.now\(\)\}_\$\{Math\.random\(\)/], // local id
  'services/photoUploadService.js': [/const random = Math\.random\(\)\.toString\(36\)/], // file name
  'utils/retryUtils.js': [/const jitterAmount = cappedDelay \* jitter \* Math\.random\(\);/], // retry delay
  'utils/offlineStorage.js': [/offline_id: `offline_/, /device_id: localStorage\.getItem\('device_id'\)/], // offline ids
  'utils/realtime.js': [/const channelName = `collector_location_/], // channel name
  'pages/Dashboard.js': [/const wait = retryDelay \+ Math\.floor\(Math\.random\(\) \* 250\);/], // retry delay
};

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) && entry.name !== 'setupTests.js') out.push(full);
  }
  return out;
};

describe('no made-up figures', () => {
  const files = walk(SRC).map((f) => ({ rel: path.relative(SRC, f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') }));

  it('Math.random() is used only for ids, retry delays and speed tests, where listed', () => {
    const unexpected = [];
    for (const { rel, text } of files) {
      text.split('\n').forEach((line, i) => {
        if (!line.includes('Math.random')) return;
        if (!(ALLOWED[rel] || []).some((pattern) => pattern.test(line))) unexpected.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(unexpected).toEqual([]);
  });

  it('every allowed place still exists (the list only shrinks)', () => {
    for (const [rel, patterns] of Object.entries(ALLOWED)) {
      const file = files.find((f) => f.rel === rel);
      expect(file).toBeDefined();
      for (const pattern of patterns) expect(file.text).toMatch(pattern);
    }
  });
});
