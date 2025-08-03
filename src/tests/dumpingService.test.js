import { dumpingService } from '../services/dumpingService';
import supabase from '../utils/supabaseClient';

describe('DumpingService Mobile Tests', () => {
  // Create test user before running tests
  beforeAll(async () => {
    const { error } = await supabase.auth.signUp({
      email: 'test@example.com',
      password: 'testpassword123',
      data: {
        id: testUserId
      }
    });
    if (error) throw error;
  });

  // Clean up test user after tests
  afterAll(async () => {
    await supabase.from('auth.users').delete().eq('id', testUserId);
  });

  describe('Error Handling', () => {
    test('should reject missing user ID', async () => {
      const result = await dumpingService.createReport(null, testReport);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toBe('User ID is required');
    });

    test('should reject missing coordinates', async () => {
      const invalidReport = { ...testReport };
      delete invalidReport.coordinates;
      const result = await dumpingService.createReport(testUserId, invalidReport);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toBe('Coordinates are required');
    });

    test('should reject invalid coordinates format', async () => {
      const invalidReport = {
        ...testReport,
        coordinates: { x: 123, y: 456 } // Wrong format
      };
      const result = await dumpingService.createReport(testUserId, invalidReport);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('Coordinates (latitude and longitude) are required');
    });

    test('should reject invalid severity value', async () => {
      const invalidReport = {
        ...testReport,
        severity: 'INVALID'
      };
      const result = await dumpingService.createReport(testUserId, invalidReport);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('invalid input value for enum');
    });

    test('should reject invalid size value', async () => {
      const invalidReport = {
        ...testReport,
        size: 'INVALID'
      };
      const result = await dumpingService.createReport(testUserId, invalidReport);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toBe('Invalid size value. Must be one of: small, medium, large');
    });

    test('should handle non-existent report ID for status update', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const result = await dumpingService.updateReportStatus(fakeId, 'verified', testUserId);
      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('multiple (or no) rows returned');
    });

    test('should reject invalid status value', async () => {
      // First create a valid report
      const createResult = await dumpingService.createReport(testUserId, testReport);
      createdReportId = createResult.data.id;

      const result = await dumpingService.updateReportStatus(
        createdReportId,
        'INVALID_STATUS',
        testUserId
      );
      expect(result.error).toBeTruthy();
      expect(result.error.message).toBe('Invalid status value. Must be one of: pending, verified, in_progress, completed');
    });

    test('should handle invalid photo URLs', async () => {
      // First create a valid report
      const createResult = await dumpingService.createReport(testUserId, testReport);
      createdReportId = createResult.data.id;

      const result = await dumpingService.addPhotosToReport(
        createdReportId,
        ['not-a-valid-url'],
        testUserId
      );
      expect(result.error).toBeTruthy();
      expect(result.error.message).toBe('Invalid photo URL format. All photos must be valid URLs');
    });

    test('should handle missing required fields in dumping_reports_mobile', async () => {
      const invalidReport = {
        ...testReport,
        estimated_volume: null,
        hazardous_materials: null,
        accessibility_notes: null
      };
      const result = await dumpingService.createReport(testUserId, invalidReport);
      // Should still succeed with defaults
      expect(result.error).toBeNull();
      expect(result.data).toBeTruthy();
      createdReportId = result.data.id;

      // Verify defaults were applied
      const { data: details } = await supabase
        .from('dumping_reports_mobile')
        .select('*')
        .eq('dumping_id', createdReportId)
        .single();

      expect(details.estimated_volume).toBe('unknown');
      expect(details.hazardous_materials).toBe(false);
      expect(details.accessibility_notes).toBe('No additional details provided');
    });
  });


  const testUserId = '12345678-1234-1234-1234-123456789012'; // Replace with a real test user ID
  const testReport = {
    location: 'Test Location',
    coordinates: {
      latitude: 40.7128,
      longitude: -74.0060
    },
    waste_type: 'household',
    severity: 'high',
    size: 'large',
    photos: ['https://example.com/photo1.jpg'],
    estimated_volume: 'large bag',
    hazardous_materials: true,
    accessibility_notes: 'Behind the building'
  };

  let createdReportId;

  // Clean up test data after each test
  afterEach(async () => {
    if (createdReportId) {
      await supabase.from('illegal_dumping_history_mobile').delete().eq('dumping_id', createdReportId);
      await supabase.from('dumping_reports_mobile').delete().eq('dumping_id', createdReportId);
      await supabase.from('illegal_dumping_mobile').delete().eq('id', createdReportId);
      createdReportId = null;
    }
  });

  test('should create a new dumping report with all fields', async () => {
    const result = await dumpingService.createReport(testUserId, testReport);
    
    expect(result.error).toBeNull();
    expect(result.data).toBeTruthy();
    
    const report = result.data;
    createdReportId = report.id;
    
    // Verify main report fields
    expect(report.reported_by).toBe(testUserId);
    expect(report.location).toBe(testReport.location);
    expect(report.waste_type).toBe(testReport.waste_type);
    expect(report.severity).toBe(testReport.severity);
    expect(report.size).toBe(testReport.size);
    expect(report.photos).toEqual(testReport.photos);
    expect(report.status).toBe('pending');
    
    // Verify coordinates
    expect(report.coordinates).toBeTruthy();
    const coords = report.coordinates;
    expect(coords.type).toBe('Point');
    expect(coords.coordinates).toEqual([testReport.coordinates.longitude, testReport.coordinates.latitude]);
    
    // Verify dumping_reports_mobile entry
    const { data: details } = await supabase
      .from('dumping_reports_mobile')
      .select('*')
      .eq('dumping_id', report.id)
      .single();
      
    expect(details).toBeTruthy();
    expect(details.estimated_volume).toBe(testReport.estimated_volume);
    expect(details.hazardous_materials).toBe(testReport.hazardous_materials);
    expect(details.accessibility_notes).toBe(testReport.accessibility_notes);
    
    // Verify history entry
    const { data: history } = await supabase
      .from('illegal_dumping_history_mobile')
      .select('*')
      .eq('dumping_id', report.id)
      .single();
      
    expect(history).toBeTruthy();
    expect(history.status).toBe('reported');
  });

  test('should update report status', async () => {
    // First create a report
    const createResult = await dumpingService.createReport(testUserId, testReport);
    createdReportId = createResult.data.id;
    
    // Update status
    const newStatus = 'verified';
    const updateResult = await dumpingService.updateReportStatus(
      createdReportId,
      newStatus,
      testUserId,
      'Verification complete'
    );
    
    expect(updateResult.error).toBeNull();
    expect(updateResult.data.status).toBe(newStatus);
    
    // Verify history entry
    const { data: history } = await supabase
      .from('illegal_dumping_history_mobile')
      .select('*')
      .eq('dumping_id', createdReportId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    expect(history.status).toBe(newStatus);
  });

  test('should add photos to report', async () => {
    // First create a report
    const createResult = await dumpingService.createReport(testUserId, testReport);
    createdReportId = createResult.data.id;
    
    // Add new photos
    const newPhotos = ['https://example.com/photo2.jpg', 'https://example.com/photo3.jpg'];
    const updateResult = await dumpingService.addPhotosToReport(
      createdReportId,
      newPhotos,
      testUserId
    );
    
    expect(updateResult.error).toBeNull();
    expect(updateResult.data.photos).toEqual([...testReport.photos, ...newPhotos]);
  });

  test('should get report details', async () => {
    // First create a report
    const createResult = await dumpingService.createReport(testUserId, testReport);
    createdReportId = createResult.data.id;
    
    // Get details
    const detailsResult = await dumpingService.getReportDetails(createdReportId);
    
    expect(detailsResult.error).toBeNull();
    expect(detailsResult.data).toBeTruthy();
    expect(detailsResult.data.id).toBe(createdReportId);
    expect(detailsResult.data.dumping_reports).toBeTruthy();
    expect(detailsResult.data.illegal_dumping_history).toBeTruthy();
  });
});
