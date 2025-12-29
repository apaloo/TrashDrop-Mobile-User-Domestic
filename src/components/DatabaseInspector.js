/**
 * Database Inspector Component for debugging batch scanning issues
 * Shows table contents and allows creating sample data
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import batchDiagnostics from '../utils/batchDiagnostics.js';
import sampleDataGenerator from '../utils/sampleDataGenerator.js';

const DatabaseInspector = () => {
  const { user } = useAuth();
  const [inspection, setInspection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sampleResult, setSampleResult] = useState(null);

  const runInspection = async () => {
    setLoading(true);
    try {
      const results = await batchDiagnostics.inspectBatchTables();
      setInspection(results);
    } catch (error) {
      console.error('Inspection failed:', error);
      setInspection({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const createSampleData = async () => {
    if (!user?.id) return;
    
    setCreating(true);
    setSampleResult(null);
    
    try {
      const result = await sampleDataGenerator.createSampleBatches(user.id, 3);
      setSampleResult(result);
      
      // Re-run inspection to show new data
      if (result.success) {
        setTimeout(runInspection, 1000);
      }
    } catch (error) {
      setSampleResult({
        success: false,
        errors: [error.message]
      });
    } finally {
      setCreating(false);
    }
  };

  const clearSampleData = async () => {
    if (!user?.id) return;
    
    setCreating(true);
    try {
      const result = await sampleDataGenerator.clearSampleData(user.id);
      setSampleResult(result);
      setTimeout(runInspection, 1000);
    } catch (error) {
      setSampleResult({
        success: false,
        errors: [error.message]
      });
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    runInspection();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white">
      <h2 className="text-2xl font-bold mb-6">Database Inspector</h2>
      
      {/* Inspection Results */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Table Inspection</h3>
          <button
            onClick={runInspection}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {inspection && (
          <div className="space-y-4">
            {inspection.error ? (
              <div className="p-4 bg-red-900 border border-red-700 rounded-lg">
                <p className="text-red-200">Error: {inspection.error}</p>
              </div>
            ) : (
              Object.entries(inspection).map(([tableName, data]) => (
                <div key={tableName} className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
                  <h4 className="font-semibold text-lg mb-2">{tableName}</h4>
                  
                  {data.exists ? (
                    <div>
                      <p className="text-green-400 mb-2">✅ Table exists</p>
                      <p className="text-gray-300 mb-2">Sample data count: {data.sampleData?.length || 0}</p>
                      
                      {data.sampleData && data.sampleData.length > 0 ? (
                        <div className="mt-2">
                          <p className="text-sm text-gray-400 mb-2">Sample records:</p>
                          <pre className="text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                            {JSON.stringify(data.sampleData, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <p className="text-yellow-400">⚠️ Table is empty</p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-red-400">❌ Table does not exist</p>
                      {data.error && (
                        <p className="text-sm text-gray-400">Error: {data.error}</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Sample Data Controls */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Sample Data Management</h3>
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={createSampleData}
            disabled={creating || !user?.id}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg"
          >
            {creating ? 'Creating...' : 'Create Sample Batches'}
          </button>
          
          <button
            onClick={clearSampleData}
            disabled={creating || !user?.id}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg"
          >
            {creating ? 'Clearing...' : 'Clear Sample Data'}
          </button>
        </div>

        {!user?.id && (
          <p className="text-yellow-400 text-sm">⚠️ Please sign in to create sample data</p>
        )}

        {sampleResult && (
          <div className={`p-4 rounded-lg border ${
            sampleResult.success 
              ? 'bg-green-900 border-green-700' 
              : 'bg-red-900 border-red-700'
          }`}>
            {sampleResult.success ? (
              <div>
                <p className="text-green-200 font-semibold">✅ Success!</p>
                {sampleResult.batches && (
                  <p className="text-green-300">Created {sampleResult.batches.length} sample batches</p>
                )}
                {sampleResult.tablesUsed && (
                  <p className="text-sm text-green-400">Tables used: {sampleResult.tablesUsed.join(', ')}</p>
                )}
                {sampleResult.deleted && (
                  <p className="text-green-300">Deleted records: {JSON.stringify(sampleResult.deleted)}</p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-red-200 font-semibold">❌ Failed</p>
                {sampleResult.errors?.map((error, i) => (
                  <p key={i} className="text-red-300 text-sm">{error}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Test QR Codes */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Test QR Code Values</h3>
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <p className="text-gray-300 mb-2">You can manually test these values in the QR scanner:</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sampleDataGenerator.generateTestQRCodes().map((code, i) => (
              <div key={i} className="p-2 bg-gray-900 rounded text-sm font-mono">
                {code}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseInspector;
