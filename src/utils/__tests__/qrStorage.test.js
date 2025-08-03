import qrStorage from '../qrStorage';
import supabase from '../supabaseClient';

// Mock Supabase client
jest.mock('../supabaseClient', () => ({
  from: jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    single: jest.fn()
  })),
  rpc: jest.fn()
}));

describe('QR Code Storage Tests', () => {
  const mockLocationId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';
  const mockQrCodeUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=test';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeQRCode', () => {
    it('should store a new QR code successfully', async () => {
      const mockResponse = {
        data: {
          id: '1',
          location_id: mockLocationId,
          qr_code_url: mockQrCodeUrl,
          is_active: true
        },
        error: null
      };

      supabase.from().single.mockResolvedValue(mockResponse);

      const result = await qrStorage.storeQRCode({
        userId: mockUserId,
        locationId: mockLocationId,
        qrCodeUrl: mockQrCodeUrl
      });

      expect(result).toEqual(mockResponse.data);
      expect(supabase.from).toHaveBeenCalledWith('digital_bins');
    });

    it('should handle storage errors', async () => {
      const mockError = new Error('Database error');
      supabase.from().single.mockRejectedValue(mockError);

      await expect(qrStorage.storeQRCode({
        userId: mockUserId,
        locationId: mockLocationId,
        qrCodeUrl: mockQrCodeUrl
      })).rejects.toThrow('Database error');
    });
  });

  describe('getQRCode', () => {
    it('should retrieve an active QR code', async () => {
      const mockResponse = {
        data: {
          id: '1',
          location_id: mockLocationId,
          qr_code_url: mockQrCodeUrl,
          is_active: true
        },
        error: null
      };

      supabase.from().maybeSingle.mockResolvedValue(mockResponse);

      const result = await qrStorage.getQRCode(mockLocationId);

      expect(result).toEqual(mockResponse.data);
      expect(supabase.from).toHaveBeenCalledWith('digital_bins');
    });

    it('should return null for expired QR codes', async () => {
      const mockResponse = {
        data: null,
        error: null
      };

      supabase.from().maybeSingle.mockResolvedValue(mockResponse);

      const result = await qrStorage.getQRCode(mockLocationId);

      expect(result).toBeNull();
    });
  });

  describe('invalidateQRCode', () => {
    it('should mark a QR code as inactive', async () => {
      const mockResponse = {
        error: null
      };

      supabase.from().update.mockReturnThis();
      supabase.from().update().eq.mockResolvedValue(mockResponse);

      const result = await qrStorage.invalidateQRCode('1');

      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('digital_bins');
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
