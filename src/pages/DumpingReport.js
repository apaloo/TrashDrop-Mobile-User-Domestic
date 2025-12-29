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
    <DumpingReportForm onSuccess={handleSuccess} />
  );
};

export default DumpingReport;
