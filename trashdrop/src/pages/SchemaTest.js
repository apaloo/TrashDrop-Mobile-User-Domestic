/**
 * Schema Test Page - For checking database compatibility
 * This is a temporary utility page for testing database schema
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.js';
import schemaChecker from '../utils/schemaChecker.js';
import LoadingSpinner from '../components/LoadingSpinner.js';

const SchemaTest = () => {
  const { user, isAuthenticated } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Ensure we have a valid authenticated session
  useEffect(() => {
    if (!isAuthenticated) {
      addLog('⚠️ No authenticated session detected');
      return;
    }
    addLog(`✅ Authenticated as ${user?.email}`);
  }, [isAuthenticated, user]);

  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const runSchemaCheck = async () => {
    setLoading(true);
    setReport(null);
    setLogs([]);
    
    addLog('Starting database schema compatibility check...');

    try {
      if (!user?.id) {
        throw new Error('No authenticated user ID available');
      }
      
      addLog(`Using authenticated user ID: ${user.id}`);
      const compatibilityReport = await schemaChecker.generateCompatibilityReport(user.id);
      
      setReport(compatibilityReport);
      addLog('Schema check completed successfully!');
      
      // Also print to browser console for detailed analysis
      schemaChecker.printReport(compatibilityReport);
      
    } catch (error) {
      addLog(`Error during schema check: ${error.message}`);
      console.error('Schema check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const TableStatus = ({ tableName, info }) => {
    const getStatusIcon = () => {
      if (!info.exists) return '❌';
      if (info.userQueries) {
        const hasWorkingQueries = Object.values(info.userQueries).some(q => q.success && q.hasData);
        return hasWorkingQueries ? '✅' : '⚠️';
      }
      return '✅';
    };

    const getStatusColor = () => {
      if (!info.exists) return 'text-red-600';
      if (info.userQueries) {
        const hasWorkingQueries = Object.values(info.userQueries).some(q => q.success && q.hasData);
        return hasWorkingQueries ? 'text-green-600' : 'text-yellow-600';
      }
      return 'text-green-600';
    };

    return (
      <div className="border rounded-lg p-4 mb-4 bg-white shadow-sm">
        <div className="flex items-center mb-2">
          <span className="text-2xl mr-2">{getStatusIcon()}</span>
          <h3 className={`text-lg font-semibold ${getStatusColor()}`}>
            {tableName}
          </h3>
        </div>
        
        {info.exists ? (
          <div className="space-y-2">
            <div>
              <strong>Columns:</strong> 
              <span className="ml-2 text-sm text-gray-600">
                {info.columns?.join(', ') || 'Unknown'}
              </span>
            </div>
            
            {info.userQueries && (
              <div>
                <strong>User Query Results:</strong>
                <div className="ml-4 mt-1 space-y-1">
                  {Object.entries(info.userQueries).map(([column, result]) => (
                    <div key={column} className="text-sm">
                      <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                        result.success ? 'bg-green-400' : 'bg-red-400'
                      }`}></span>
                      <code className="bg-gray-100 px-2 py-1 rounded">{column}</code>
                      {result.success && result.hasData && (
                        <span className="ml-2 text-green-600">({result.recordCount} records)</span>
                      )}
                      {result.error && (
                        <span className="ml-2 text-red-600 text-xs">({result.error})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-red-600">
            <strong>Error:</strong> {info.error}
            {info.code && <span className="ml-2 text-sm">({info.code})</span>}
          </div>
        )}
      </div>
    );
  };

  const RecommendationItem = ({ rec, index }) => {
    const getTypeColor = (type) => {
      switch (type) {
        case 'missing_table': return 'bg-red-100 text-red-800';
        case 'permission_denied': return 'bg-orange-100 text-orange-800';
        case 'working_columns': return 'bg-green-100 text-green-800';
        case 'no_working_columns': return 'bg-yellow-100 text-yellow-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <div className="border-l-4 border-blue-500 pl-4 py-2 mb-3 bg-blue-50">
        <div className="flex items-center mb-2">
          <span className="text-sm font-medium text-blue-900">#{index + 1}</span>
          <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${getTypeColor(rec.type)}`}>
            {rec.type.replace('_', ' ').toUpperCase()}
          </span>
          {rec.table && (
            <span className="ml-2 text-sm text-gray-600">({rec.table})</span>
          )}
        </div>
        <p className="text-sm text-gray-700 mb-1">{rec.message}</p>
        <p className="text-xs text-blue-600 font-medium">Action: {rec.action}</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Database Schema Compatibility Test
          </h1>
          <p className="text-gray-600">
            Check the actual Supabase database structure and identify alignment issues with our services.
          </p>
        </div>

        <div className="mb-6">
          <button
            onClick={runSchemaCheck}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-6 py-3 rounded-lg font-medium"
          >
            {loading ? 'Checking Database...' : 'Run Schema Compatibility Check'}
          </button>
          
          {user && (
            <p className="mt-2 text-sm text-gray-600">
              Testing with user: {user.email} ({user.id})
            </p>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
            <span className="ml-3 text-gray-600">Analyzing database schema...</span>
          </div>
        )}

        {logs.length > 0 && (
          <div className="mb-6 bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-48 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        )}

        {report && (
          <div className="space-y-8">
            {/* Summary */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {Object.values(report.tables).filter(t => t.exists).length}
                  </div>
                  <div className="text-sm text-gray-600">Tables Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {Object.values(report.tables).filter(t => !t.exists).length}
                  </div>
                  <div className="text-sm text-gray-600">Missing Tables</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {report.recommendations.length}
                  </div>
                  <div className="text-sm text-gray-600">Recommendations</div>
                </div>
              </div>
            </div>

            {/* Table Status */}
            <div>
              <h2 className="text-xl font-semibold mb-4">📋 Table Analysis</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Object.entries(report.tables).map(([tableName, info]) => (
                  <TableStatus key={tableName} tableName={tableName} info={info} />
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div>
              <h2 className="text-xl font-semibold mb-4">💡 Recommendations</h2>
              {report.recommendations.length > 0 ? (
                report.recommendations.map((rec, index) => (
                  <RecommendationItem key={index} rec={rec} index={index} />
                ))
              ) : (
                <p className="text-gray-600">No specific recommendations at this time.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaTest;
