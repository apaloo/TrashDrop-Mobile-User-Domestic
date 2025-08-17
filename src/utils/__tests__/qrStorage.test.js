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
  const mockLocationId = '123e4567-e89b-12d3-a456-426614174000';
  const mockQrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=test';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeQRCode', () => {
    it('should store a new QR code locally and return stored object', async () => {
      const setSpy = jest.spyOn(Storage.prototype, 'setItem');

      const result = await qrStorage.storeQRCode(mockLocationId, mockQrCodeUrl);

      expect(result).toBeTruthy();
      expect(result.locationId).toBe(mockLocationId);
      expect(result.qrCodeUrl).toBe(mockQrCodeUrl);
      expect(result.storedAt).toBeDefined();
      expect(setSpy).toHaveBeenCalledWith(
        `qr_${mockLocationId}`,
        expect.any(String)
      );

      setSpy.mockRestore();
    });
  });

  describe('getQRCode', () => {
    it('should retrieve an active QR code from localStorage', async () => {
      const validData = {
        locationId: mockLocationId,
        qrCodeUrl: mockQrCodeUrl,
        expires: Date.now() + 60_000,
        storedAt: Date.now()
      };
      localStorage.setItem(`qr_${mockLocationId}`, JSON.stringify(validData));

      const result = await qrStorage.getQRCode(mockLocationId);

      expect(result).toEqual(validData);
    });

    it('should return null for expired QR codes in localStorage', async () => {
      const expiredData = {
        locationId: mockLocationId,
        qrCodeUrl: mockQrCodeUrl,
        expires: Date.now() - 60_000,
        storedAt: Date.now() - 120_000
      };
      localStorage.setItem(`qr_${mockLocationId}`, JSON.stringify(expiredData));

      const result = await qrStorage.getQRCode(mockLocationId);

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
