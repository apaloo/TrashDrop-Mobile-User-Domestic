import React from 'react';
import { useNavigate } from 'react-router-dom';
import DumpingReportForm from '../components/DumpingReportForm.js';

/**
 * Illegal dumping report page
 * Uses our new DumpingReportForm component with Supabase integration
 */
const DumpingReport = () => {
  const navigate = useNavigate();

  const handleSuccess = (reportData) => {
    console.log('Report submitted successfully:', reportData);
    // Navigate to success page or dashboard
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#374151' }}>
      <div className="container mx-auto px-4">
        <div className="max-w-md mx-auto">
          <DumpingReportForm onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
};

export default DumpingReport;
