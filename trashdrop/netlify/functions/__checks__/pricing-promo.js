// node netlify/functions/__checks__/pricing-promo.js
// WhatsApp quotes follow the database's td_price_digital_bin(): promotional
// rate × bags, never for urgent bookings.
const assert = require('assert');
const { quoteBooking } = require('../utils/pricing.js');

const fakeSupabase = ({ usage }) => ({
  rpc: async () => ({ data: [{ suburb: 'Testville', price_240l: 40 }], error: null }),
  from: (t) => {
    const q = { select: () => q, eq: () => q,
      single: async () => (t === 'promotional_usage'
        ? (usage ? { data: usage, error: null } : { data: null, error: { message: 'none' } })
        : { data: { client_fee: '22', collector_payout: '40', platform_subsidy: '18' }, error: null }) };
    return q;
  },
});

let passed = 0;
const check = async (label, fn) => {
  try { await fn(); console.log('  ok   ' + label); passed++; }
  catch (e) { console.log('  FAIL ' + label + '\n       ' + e.message); process.exitCode = 1; }
};

(async () => {
  const eligible = fakeSupabase({ usage: { is_eligible: true, used_count: 1, max_requests: 5 } });
  const base = { bin_size_liters: 240, bag_count: 2, latitude: 5.6, longitude: -0.2, user_id: 'u1' };

  await check('promotional rate × bags', async () => {
    const q = await quoteBooking(eligible, base);
    assert.strictEqual(q.is_promotional, true);
    assert.strictEqual(q.total, 44);
    assert.strictEqual(q.collector_total_payout, 80);
    assert.strictEqual(q.promo_request_number, 2);
  });
  await check('urgent booking pays the standard price', async () => {
    const q = await quoteBooking(eligible, { ...base, is_urgent: true });
    assert.strictEqual(q.is_promotional, false);
    assert.strictEqual(q.total, 105); // 80 + 30% + 1
  });
  await check('no promotions left: standard price', async () => {
    const q = await quoteBooking(fakeSupabase({ usage: { is_eligible: false, used_count: 5, max_requests: 5 } }), base);
    assert.strictEqual(q.is_promotional, false);
    assert.strictEqual(q.total, 81);
  });
  console.log(`${passed} passed`);
})();
