import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabaseClient';
import { v4 as uuidv4 } from 'uuid';
import { QRCodeSVG } from 'qrcode.react';
import LoadingSpinner from '../components/LoadingSpinner';

const CollectionQRCode = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrData, setQrData] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [status, setStatus] = useState('waiting'); // waiting, scanned, processing, completed, error
  const [collectorInfo, setCollectorInfo] = useState(null);

  // Generate a unique collection ID and QR code when component mounts
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        setLoading(true);
        
        // Generate a unique collection ID
        const collectionId = `col_${uuidv4().substring(0, 8)}`;
        setCollectionId(collectionId);
        
        // Create a new collection record in the database
        const { data, error: insertError } = await supabase
          .from('collections')
          .insert([{
            id: collectionId,
            user_id: user.id,
            status: 'awaiting_scan',
            created_at: new Date().toISOString()
          }])
          .select()
          .single();
          
        if (insertError) throw insertError;
        
        // Create QR code data with collection ID and user ID
        const qrData = JSON.stringify({
          type: 'TRASHDROP_COLLECTION',
          collectionId,
          userId: user.id,
          timestamp: Date.now()
        });
        
        setQrData(qrData);
        setLoading(false);
        
        // Set up real-time subscription for collection updates
        const subscription = supabase
          .channel(`collection_${collectionId}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'collections',
            filter: `id=eq.${collectionId}`
          }, (payload) => {
            const newStatus = payload.new.status;
            setStatus(newStatus);
            
            if (newStatus === 'scanned' && payload.new.collector_id) {
              // Get collector info
              supabase
                .from('profiles')
                .select('*')
                .eq('id', payload.new.collector_id)
                .single()
                .then(({ data }) => {
                  setCollectorInfo(data);
                });
            }
            
            if (newStatus === 'processing') {
              // Redirect to collection form
              navigate(`/collection/${collectionId}`);
            }
          })
          .subscribe();
          
        // Clean up subscription on unmount
        return () => {
          supabase.removeChannel(subscription);
        };
        
      } catch (err) {
        console.error('Error generating QR code:', err);
        setError('Failed to generate QR code. Please try again.');
        setLoading(false);
      }
    };
    
    generateQRCode();
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">Preparing your collection QR code...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden md:max-w-2xl p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Collection Request</h2>
          <p className="text-gray-600">
            {status === 'waiting' && 'Show this QR code to the collector to start the collection process.'}
            {status === 'scanned' && 'QR code scanned! Preparing collection form...'}
            {status === 'processing' && 'Redirecting to collection form...'}
          </p>
        </div>
        
        <div className="flex justify-center mb-8">
          <div className="p-4 bg-white rounded-lg border-2 border-blue-200">
            <QRCodeSVG 
              value={qrData} 
              size={256} 
              level="H" 
              includeMargin={true}
              className="mx-auto"
            />
            <p className="text-center mt-2 text-sm text-gray-500">Collection ID: {collectionId}</p>
          </div>
        </div>
        
        {collectorInfo && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-medium text-blue-800 mb-2">Collector Information:</h3>
            <p className="text-blue-700">
              {collectorInfo.full_name && `${collectorInfo.full_name} • `}
              {collectorInfo.phone_number || 'Collector'}
            </p>
          </div>
        )}
        
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                Please keep this screen open until the collector has completed the collection process.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollectionQRCode;
