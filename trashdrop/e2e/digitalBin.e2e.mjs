// Booking a digital bin, in a real browser, through all five steps: where
// the bin is (phone GPS), when, what, a photo, then the price and the request.
// The prices checked are the accepted TrashDrop Digital Bin Pricing
// (docs/DIGITAL_BIN_PRICING.md), worked out from the production pricing zone
// and promotional schedule copied below; the database prices the bin again
// when it is saved, so these check what the household is shown and sent.
import { test, expect } from '@playwright/test';
import { fakeSupabase, household, collectPageErrors } from './fakeSupabase.mjs';

// The spot: Asylum Down, Accra, and what production answered for it on 2026-11-14
const SPOT = { latitude: 5.556, longitude: -0.1969, accuracy: 6 };
const COVERED = [{ is_covered: true, zone_id: 'zone-asylum-down', region: 'Greater Accra', district: 'Accra Metro', community: 'Korle-Klottey', suburb: 'Asylum Down', distance_km: 1, service_radius_km: 5 }];
const NOT_COVERED = [{ is_covered: false, zone_id: 'zone-asylum-down', suburb: 'Asylum Down', distance_km: 12, service_radius_km: 5 }];
const ZONE = [{ id: 'zone-asylum-down', suburb: 'Asylum Down', is_active: true, price_120l: 35, price_240l: 45, service_radius_km: 5 }];
const PROMO_SCHEDULE = [
  { bin_size_liters: 120, client_fee: 18, collector_payout: 30, platform_subsidy: 12, is_active: true },
  { bin_size_liters: 240, client_fee: 22, collector_payout: 40, platform_subsidy: 18, is_active: true },
];

test.use({
  geolocation: SPOT,
  permissions: ['geolocation', 'camera'],
  // A camera that shows a test pattern, and no permission dialog
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

const account = household();

async function signedIn(page, setup) {
  await page.addInitScript(() => localStorage.setItem('trashdrop_app_installed', 'true'));
  const calls = await fakeSupabase(page, { account, ...setup });
  await page.goto('/login');
  await page.getByLabel('Email Address').fill('household@example.test');
  await page.getByLabel('Password', { exact: true }).fill('correct-horse');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/digital-bin');
  await page.getByRole('button', { name: 'New Digital Bin' }).click();
  return calls;
}

const step = (page, n, name) => expect(page.getByText(`Step ${n} of 5 · ${name}`)).toBeVisible();
const next = (page) => page.getByRole('button', { name: 'Continue' }).click();
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// Steps 1 to 4 for a covered spot: GPS, a date two days ahead, the bin, one photo
async function upToReview(page, { size = '120L - Standard (Recommended)', urgent = false } = {}) {
  await step(page, 1, 'Bin Location');
  await expect(page.getByRole('button', { name: 'Location captured' })).toBeVisible();
  await expect(page.getByText('GPS Accuracy: 6.0m')).toBeVisible();
  await next(page);

  await step(page, 2, 'Schedule Details');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByLabel('Pickup Date').fill(inDays(2));
  await next(page);

  await step(page, 3, 'Waste Details');
  await page.getByLabel('Bin Size (Liters)').selectOption({ label: size });
  if (urgent) await page.getByRole('checkbox', { name: /Mark as Urgent/ }).check();
  await next(page);

  await step(page, 4, 'Additional Info');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled(); // a photo is required
  await page.getByRole('button', { name: /Take Photos/ }).click();
  // The shutter is ready before the camera's first frame: tap until a photo is kept
  await expect(async () => {
    await page.getByRole('button', { name: 'Capture photo' }).click();
    await expect(page.getByTestId('photo-count')).toHaveText('1/3', { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Close camera' }).click();
  await expect(page.getByRole('button', { name: /1\/3 photos taken/ })).toBeVisible();
  await next(page);

  await step(page, 5, 'Review & Submit');
}

// The estimate's TOTAL row (label and amount are separate elements)
const total = (page) => page.getByText('TOTAL', { exact: true }).filter({ visible: true }).locator('..');
const booked = (calls) => calls.filter((c) => c.method === 'POST' && c.path === '/rest/v1/digital_bins').map((c) => c.body);

test('standard price: 120 L in Asylum Down is GHS 35 + GHS 1 request fee = GHS 36, and the bin is booked with its QR code', async ({ page }) => {
  const errors = collectPageErrors(page);
  const calls = await signedIn(page, { tables: { promotional_fee_schedule: PROMO_SCHEDULE }, rpc: { check_service_coverage: COVERED, get_covering_pricing_zone: ZONE } });
  await upToReview(page);

  await expect(page.getByText('Location-based pricing for Asylum Down')).toBeVisible();
  await expect(total(page)).toHaveText(/TOTAL\s*GH₵\s*36\.00/);

  await page.getByRole('button', { name: 'Request Bin Pickup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request submitted' })).toContainText('1 120L bin for General waste');
  await expect(page.getByRole('button', { name: 'Active 1' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Digital Bin QR Code' })).toBeVisible();
  await expect(page.getByText('GHS 36.00').first()).toBeVisible(); // on the bin's card

  const [bin] = booked(calls);
  expect(bin).toMatchObject({ user_id: account.user.id, bin_size_liters: 120, bag_count: 1, waste_type: 'general', is_urgent: false, is_promotional: false, fee: '36.00', collector_core_payout: '35.00' });
  // the photo is stored and linked to the bin afterwards, without holding up the booking
  await expect.poll(() => calls.uploads.length).toBe(1);
  await expect.poll(() => calls.db.digital_bins?.[0]?.photo_urls?.length).toBe(1);
  expect(errors).toEqual([]);
});

test('urgent adds 30% of the base: GHS 35 + 10.50 + 1 = GHS 46.50, and never a promotion', async ({ page }) => {
  const calls = await signedIn(page, {
    tables: { promotional_fee_schedule: PROMO_SCHEDULE, promotional_usage: [{ user_id: account.user.id, is_eligible: true, used_count: 0, max_requests: 5 }] },
    rpc: { check_service_coverage: COVERED, get_covering_pricing_zone: ZONE },
  });
  await upToReview(page, { urgent: true });
  await expect(page.getByText("Promotional pricing doesn't apply to urgent pickups", { exact: false })).toBeVisible();
  await expect(total(page)).toHaveText(/TOTAL\s*GH₵\s*46\.50/);

  await page.getByRole('button', { name: 'Request Bin Pickup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request submitted' })).toBeVisible();
  expect(booked(calls)[0]).toMatchObject({ is_urgent: true, is_promotional: false, fee: '46.50' });
});

test('with promotions left, 120 L is the promotional GHS 18 (no request fee), and the collector is still paid GHS 30', async ({ page }) => {
  const calls = await signedIn(page, {
    tables: { promotional_fee_schedule: PROMO_SCHEDULE, promotional_usage: [{ user_id: account.user.id, is_eligible: true, used_count: 2, max_requests: 5 }] },
    rpc: { check_service_coverage: COVERED, get_covering_pricing_zone: ZONE },
  });
  await upToReview(page);
  await expect(total(page)).toHaveText(/TOTAL\s*GH₵\s*18\.00/);

  await page.getByRole('button', { name: 'Request Bin Pickup' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Request submitted' })).toBeVisible();
  expect(booked(calls)[0]).toMatchObject({ is_promotional: true, fee: '18.00', collector_core_payout: '30.00' });
});

test('outside the service area the booking stops at step 1 and offers the waitlist', async ({ page }) => {
  const errors = collectPageErrors(page);
  const calls = await signedIn(page, { rpc: { check_service_coverage: NOT_COVERED, get_covering_pricing_zone: [] } });
  await step(page, 1, 'Bin Location');
  await expect(page.getByText("We haven't started operating here yet")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notify me when you arrive' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(calls.find((c) => c.path === '/rest/v1/rpc/check_service_coverage')?.body).toEqual({ p_latitude: SPOT.latitude, p_longitude: SPOT.longitude });
  expect(booked(calls)).toEqual([]);
  expect(errors).toEqual([]);
});
