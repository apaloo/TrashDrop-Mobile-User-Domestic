import { prepareDigitalBinData } from '../digitalBinService.js';

// The promotional path never reaches GPS pricing; the standard path does
jest.mock('../gpsPricingService.js', () => ({ __esModule: true, default: {} }));
jest.mock('../../utils/costCalculator.js', () => ({
  getCostBreakdownWithGPS: async ({ bag_count, is_urgent }) => {
    const base = 40 * bag_count;
    const urgent = is_urgent ? base * 0.3 : 0;
    return { base, core: base, urgent_charge: urgent, distance_charge: 0, total: base + urgent + 1, pricing_source: 'gps', pricing_zone: null };
  },
}));

const booking = (over = {}) => ({
  id: 'bin-1', user_id: 'u1', location_id: 'loc-1', bin_size_liters: 240, bag_count: 2, is_urgent: false,
  is_promotional: true, promo_request_number: 2,
  promotional_client_fee: 22, promotional_collector_payout: 40, promotional_platform_subsidy: 18,
  ...over,
});

// Same rules as the database's td_price_digital_bin(), which sets the stored price
describe('digital bin promotional price', () => {
  it('charges the promotional rate per bag and pays the collector per bag', async () => {
    const d = await prepareDigitalBinData(booking());
    expect(d).toMatchObject({ fee: '44.00', is_promotional: true, collector_core_payout: '80.00', collector_total_payout: '80.00' });
  });

  it('prices an urgent booking normally, without a promotion', async () => {
    const d = await prepareDigitalBinData(booking({ is_urgent: true }));
    expect(d).toMatchObject({ fee: '105.00', is_promotional: false });
  });

  it('prices a booking without a promotional fee normally', async () => {
    const d = await prepareDigitalBinData(booking({ promotional_client_fee: null }));
    expect(d).toMatchObject({ fee: '81.00', is_promotional: false });
  });
});
