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
    // The form shows its own confirmation - navigation is the user's call,
    // so they actually see that the report went through
  };

  return (
    <DumpingReportForm
      onSuccess={handleSuccess}
      onDone={() => navigate('/dashboard')}
    />
  );
};

export default DumpingReport;
