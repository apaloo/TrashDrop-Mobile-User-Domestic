import qrStorage from '../qrStorage';
import supabase from '../supabaseClient';

// Mock Supabase client (only methods actually used in current implementation)
jest.mock('../supabaseClient', () => ({
  from: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    eq: jest.fn()
  })),
  rpc: jest.fn()
}));

describe('QR Code Storage Tests', () => {
  // QR codes are keyed by DIGITAL BIN id: the collector decodes ".../bin/<uuid>"
  // and matches it against digital_bins.id. A location is reused across bookings
  // at one address, so keying by location made two bins share one QR.
  const mockBinId = '123e4567-e89b-12d3-a456-426614174000';
  const mockLocationId = '99999999-9999-9999-9999-999999999999';
  const mockQrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=test';

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  // Restore spies even when an expectation throws first, so a failure here
  // cannot silently disable localStorage for the tests that follow
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('storeQRCode', () => {
    it('should store a new QR code locally, keyed by bin id', async () => {
      const setSpy = jest.spyOn(Storage.prototype, 'setItem');

      const result = await qrStorage.storeQRCode(mockBinId, mockQrCodeUrl, {
        locationId: mockLocationId
      });

      expect(result).toBeTruthy();
      expect(result.binId).toBe(mockBinId);
      expect(result.locationId).toBe(mockLocationId);
      expect(result.qrCodeUrl).toBe(mockQrCodeUrl);
      expect(result.storedAt).toBeDefined();
      expect(setSpy).toHaveBeenCalledWith(
        `qr_${mockBinId}`,
        expect.any(String)
      );
    });

    it('should encode the bin id, not the location id, in the QR url', async () => {
      const result = await qrStorage.storeQRCode(mockBinId, mockQrCodeUrl, {
        locationId: mockLocationId
      });

      expect(result.url).toBe(`https://trashdrop.app/bin/${mockBinId}`);
      expect(result.url).not.toContain(mockLocationId);
    });

    it('should give two bins at the same location distinct storage keys', async () => {
      const setSpy = jest.spyOn(Storage.prototype, 'setItem');
      const otherBinId = '44444444-4444-4444-4444-444444444444';

      await qrStorage.storeQRCode(mockBinId, mockQrCodeUrl, { locationId: mockLocationId });
      await qrStorage.storeQRCode(otherBinId, mockQrCodeUrl, { locationId: mockLocationId });

      const keys = setSpy.mock.calls.map(([key]) => key);
      expect(keys).toContain(`qr_${mockBinId}`);
      expect(keys).toContain(`qr_${otherBinId}`);
      expect(new Set(keys).size).toBe(2);
    });
  });

  describe('getQRCode', () => {
    it('should retrieve an active QR code from localStorage', async () => {
      const validData = {
        binId: mockBinId,
        qrCodeUrl: mockQrCodeUrl,
        expires: Date.now() + 60_000,
        storedAt: Date.now()
      };
      localStorage.setItem(`qr_${mockBinId}`, JSON.stringify(validData));

      const result = await qrStorage.getQRCode(mockBinId);

      expect(result).toEqual(validData);
    });

    it('should return null for expired QR codes in localStorage', async () => {
      const expiredData = {
        binId: mockBinId,
        qrCodeUrl: mockQrCodeUrl,
        expires: Date.now() - 60_000,
        storedAt: Date.now() - 120_000
      };
      localStorage.setItem(`qr_${mockBinId}`, JSON.stringify(expiredData));

      const result = await qrStorage.getQRCode(mockBinId);

      expect(result).toBeNull();
    });

    it('should not return another bin\'s QR from the same location', async () => {
      const otherBinId = '44444444-4444-4444-4444-444444444444';
      localStorage.setItem(`qr_${otherBinId}`, JSON.stringify({
        binId: otherBinId,
        qrCodeUrl: mockQrCodeUrl,
        expires: Date.now() + 60_000,
        storedAt: Date.now()
      }));

      // Nothing stored for mockBinId, so it must miss rather than borrow
      const result = await qrStorage.getQRCode(mockBinId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateQRCode', () => {
    it('should mark a QR code as inactive', async () => {
      const mockResponse = { error: null };
      const eqMock = jest.fn().mockResolvedValue(mockResponse);
      const updateMock = jest.fn(() => ({ eq: eqMock }));
      supabase.from.mockReturnValue({ update: updateMock });

      const result = await qrStorage.invalidateQRCode('1');

      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('digital_bins');
      expect(updateMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', '1');
    });
  });

  describe('cleanupExpiredQRCodes', () => {
    it('should clean up expired QR codes', async () => {
      const mockResponse = {
        data: 5,
        error: null
      };

      supabase.rpc.mockResolvedValue(mockResponse);

      const result = await qrStorage.cleanupExpiredQRCodes();

      expect(result).toBe(5);
      expect(supabase.rpc).toHaveBeenCalledWith('cleanup_expired_digital_bins');
    });
  });
});
