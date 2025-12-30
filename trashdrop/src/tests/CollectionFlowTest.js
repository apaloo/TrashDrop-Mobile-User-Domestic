import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import supabase, { withSchema } from '../utils/supabaseClient.js';
import { QRCodeSVG } from 'qrcode.react';
import { v4 as uuidv4 } from 'uuid';

const CollectionFlowTest = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [collectionId, setCollectionId] = useState('');
  const [status, setStatus] = useState('idle'); // idle, created, scanned, completed
  const [collectionData, setCollectionData] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const addLog = (message) => {
    setLogs(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]}: ${message}`]);
  };

  // Step 1: Create a new collection
  const createCollection = async () => {
    // Reset any previous errors
    setStatus('idle');
    
    // Use a different variable name to avoid shadowing the destructured user
    const currentUser = user;
    
    if (!currentUser) {
      const error = new Error('No authenticated user found');
      console.error('Authentication error:', error);
      addLog('Error: No authenticated user found');
      setStatus('error');
      setLoading(false);
      return null;
    }
    
    try {
      // Log the start of the process
      console.log('Starting collection creation process...');
      console.log('Supabase URL:', process.env.REACT_APP_SUPABASE_URL);
      console.log('Current user:', currentUser.id);
      
      // Test Supabase connection
      console.log('Testing Supabase connection...');
      const { data: testData, error: testError } = await supabase.auth.getSession();
      
      if (testError) {
        console.error('Supabase connection test failed:', testError);
        throw new Error(`Failed to connect to Supabase: ${testError.message}`);
      }
      
      console.log('Supabase connection successful, proceeding with collection creation...');
      console.log('Starting collection creation...');
      setLoading(true);
      
      // Get current user session
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !authUser) {
        const errorMsg = userError?.message || 'No authenticated user found';
        console.error('Authentication error:', errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log('Authenticated user:', authUser.id);
      const newCollectionId = uuidv4();
      
      // Create a test QR code data object
      const qrData = {
        type: 'TRASHDROP_COLLECTION',
        collectionId: newCollectionId,
        userId: user.id,
        timestamp: new Date().toISOString()
      };
      
      console.log('Creating collection with ID:', newCollectionId);
      
      // Create collection with explicit schema
      console.log('Creating collection with explicit schema...');
      const collectionData = { 
        id: newCollectionId,
        user_id: authUser.id,
        status: 'awaiting_scan',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      console.log('Collection data:', JSON.stringify(collectionData, null, 2));
      
      // Try with schema helper
      console.log('Creating collection with schema helper...');
      const { data, error } = await supabase
        .from(withSchema('collections'))
        .insert(collectionData)
        .select()
        .single();
      
      if (error) {
        console.error('Failed to create collection after multiple attempts:', error);
        throw new Error(`Failed to create collection: ${error.message}`);
      }
      
      setCollectionId(newCollectionId);
      setCollectionData(data);
      setStatus('created');
      addLog(`Collection created with ID: ${newCollectionId}`);
      
      // Set up real-time subscription
      const sub = supabase
        .channel(`collection_${newCollectionId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'collections',
          filter: `id=eq.${newCollectionId}`
        }, (payload) => {
          const newStatus = payload.new.status;
          addLog(`Status updated to: ${newStatus}`);
          
          if (newStatus === 'scanned') {
            setStatus('scanned');
            addLog('Collection scanned by collector!');
          } else if (newStatus === 'processing') {
            setStatus('processing');
            addLog('Processing collection... Redirecting to form...');
            // In a real app, this would be handled by the real-time subscription in CollectionQRCode
            setTimeout(() => {
              navigate(`/collection/${newCollectionId}`);
            }, 1500);
          } else if (newStatus === 'completed') {
            setStatus('completed');
            addLog('Collection completed!');
          }
        })
        .subscribe();

      setSubscription(sub);
      setLoading(false);
      return data;
      
    } catch (error) {
      console.error('Error creating collection:', error);
      addLog(`Error: ${error.message}`);
      setStatus('error');
      setLoading(false);
      throw error;
    }
  };

  // Simulate collector scanning the QR code
  const simulateCollectorScan = async () => {
    if (!collectionId) return;
    
    try {
      addLog('Simulating collector scan...');
      
      // Update status to 'scanned'
      const { error } = await supabase
        .from('collections')
        .update({
          status: 'scanned',
          collector_id: user.id, // In a real scenario, this would be the collector's ID
          scanned_at: new Date().toISOString()
        })
        .eq('id', collectionId);

      if (error) throw error;
      
      // After a delay, update to 'processing' to simulate the collector confirming
      setTimeout(async () => {
        addLog('Simulating collector confirmation...');
        const { error: updateError } = await supabase
          .from('collections')
          .update({
            status: 'processing',
            processing_at: new Date().toISOString()
          })
          .eq('id', collectionId);
          
        if (updateError) throw updateError;
      }, 2000);
      
    } catch (error) {
      console.error('Error simulating scan:', error);
      addLog(`Error: ${error.message}`);
    }
  };

  // Clean up subscription on unmount
  useEffect(() => {
    return () => {
      try {
        if (subscription) {
          console.log('Cleaning up subscription...');
          const { error } = supabase.removeChannel(subscription);
          if (error) {
            console.error('Error removing subscription:', error);
          }
        }
      } catch (error) {
        console.error('Error in cleanup:', error);
      }
    };
  }, [subscription]);
  
  // Error boundary effect
  useEffect(() => {
    const errorHandler = (error) => {
      console.error('Uncaught error:', error);
      addLog(`Uncaught error: ${error.message}`);
      setStatus('error');
    };
    
    // Add global error handlers
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason || 'Unknown error';
      errorHandler(error);
    });
    
    return () => {
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', errorHandler);
    };
  }, []);

  const resetTest = () => {
    setStatus('idle');
    setCollectionId('');
    setCollectionData(null);
    setLogs([]);
    if (subscription) {
      supabase.removeChannel(subscription);
      setSubscription(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Collection Flow Test</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Flow */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">User Flow</h2>
          
          {status === 'idle' && (
            <button
              onClick={createCollection}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Generate Collection QR Code
            </button>
          )}
          
          {status === 'created' && (
            <div className="mt-4">
              <p className="mb-4">Show this QR code to the collector:</p>
              <div className="flex justify-center p-4 bg-white rounded border">
                <QRCodeSVG 
                  value={JSON.stringify({
                    type: 'TRASHDROP_COLLECTION',
                    collectionId,
                    userId: user.id,
                    timestamp: new Date().toISOString()
                  })}
                  size={200}
                />
              </div>
              <p className="mt-2 text-sm text-gray-600">Collection ID: {collectionId}</p>
              
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                <p className="text-yellow-800">
                  <span className="font-medium">Waiting for collector to scan...</span>
                </p>
              </div>
            </div>
          )}
          
          {status === 'scanned' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-800">
                <span className="font-medium">QR Code Scanned!</span> The collector is processing your request...
              </p>
            </div>
          )}
          
          {status === 'processing' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800">
                <span className="font-medium">Redirecting to collection form...</span>
              </p>
            </div>
          )}
          
          {status === 'completed' && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800 font-medium">
                Collection completed successfully!
              </p>
              <button
                onClick={resetTest}
                className="mt-2 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
              >
                Start New Test
              </button>
            </div>
          )}
          
          {status === 'error' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-red-800">
                <span className="font-medium">Error occurred:</span> Check the logs for details.
              </p>
              <button
                onClick={resetTest}
                className="mt-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
        
        {/* Collector Flow */}
        <div className="bg-gray-50 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Collector Flow</h2>
          
          {status === 'created' && (
            <div>
              <p className="mb-4">Simulate collector scanning the QR code:</p>
              <button
                onClick={simulateCollectorScan}
                className="w-full py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Simulate Collector Scan
              </button>
              
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-blue-800">
                  After scanning, the collector would see a success message and confirm the collection.
                </p>
              </div>
            </div>
          )}
          
          {status === 'scanned' && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-yellow-800">
                <span className="font-medium">Simulating collector confirmation...</span>
              </p>
            </div>
          )}
          
          {status === 'processing' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-green-800">
                <span className="font-medium">Collection confirmed!</span> The user's device is now showing the collection form.
              </p>
            </div>
          )}
          
          {(status === 'idle' || status === 'completed' || status === 'error') && (
            <div className="p-3 bg-gray-100 rounded text-gray-600">
              <p>Start the user flow to begin the test.</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Logs */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-2">Test Logs</h3>
        <div className="bg-gray-800 text-green-400 p-4 rounded font-mono text-sm h-48 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet. Start the test to see logs.</p>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="border-b border-gray-700 py-1">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
      
      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back to Dashboard
        </button>
        
        <button
          onClick={resetTest}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
        >
          Reset Test
        </button>
      </div>
    </div>
  );
};

export default CollectionFlowTest;
