/**
 * Status Bar Component - Visual progress indicator for pickup status
 * Uses unified status service to show progress flow
 */

import React from 'react';
import { statusService } from '../services/statusService.js';

const StatusBar = ({ 
  currentStatus, 
  showLabels = true, 
  compact = false,
  className = '' 
}) => {
  const progressFlow = statusService.getProgressFlow(currentStatus);
  const progressPercentage = statusService.getProgressPercentage(currentStatus);

  return (
    <div className={`status-bar ${className}`}>
      {/* Progress Overview */}
      {!compact && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Progress
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {progressPercentage}%
            </span>
          </div>
          
          {/* Overall Progress Bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Status Steps */}
      <div className="flex items-center justify-between relative">
        {/* Progress Line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600 -translate-y-1/2 z-0" />
        
        {/* Active Progress Line */}
        <div 
          className="absolute top-1/2 left-0 h-0.5 bg-green-500 -translate-y-1/2 z-0 transition-all duration-500 ease-out"
          style={{ 
            width: `${progressPercentage}%`,
            maxWidth: '100%'
          }}
        />

        {/* Status Steps */}
        {progressFlow.map((step, index) => {
          const isCompleted = step.completed;
          const isCurrent = step.current;
          const isUpcoming = step.upcoming;
          
          return (
            <div 
              key={step.status}
              className={`relative z-10 flex flex-col items-center ${
                compact ? 'w-8' : 'w-12'
              }`}
            >
              {/* Status Circle */}
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300
                  ${isCompleted ? 'bg-green-500 text-white' : ''}
                  ${isCurrent ? 'bg-blue-500 text-white ring-4 ring-blue-200 dark:ring-blue-800' : ''}
                  ${isUpcoming ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400' : ''}
                `}
              >
                {isCompleted ? '✓' : step.icon}
              </div>

              {/* Status Label */}
              {showLabels && !compact && (
                <div className="mt-2 text-center">
                  <div className={`text-xs font-medium whitespace-nowrap ${
                    isCompleted ? 'text-green-600 dark:text-green-400' :
                    isCurrent ? 'text-blue-600 dark:text-blue-400' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {step.display}
                  </div>
                  
                  {/* Status Description for current step */}
                  {isCurrent && (
                    <div className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-[100px]">
                      {step.description}
                    </div>
                  )}
                </div>
              )}

              {/* Compact Labels */}
              {showLabels && compact && (
                <div className={`mt-1 text-xs font-medium ${
                  isCompleted ? 'text-green-600 dark:text-green-400' :
                  isCurrent ? 'text-blue-600 dark:text-blue-400' :
                  'text-gray-500 dark:text-gray-400'
                }`}>
                  {step.display.split(' ')[0]}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current Status Details */}
      {!compact && (
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex items-center mb-2">
            <span className="text-2xl mr-3">
              {statusService.getStatusIcon(currentStatus)}
            </span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {statusService.getStatusDisplay(currentStatus)}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {statusService.getStatusDescription(currentStatus)}
              </p>
            </div>
          </div>
          
          {/* Available Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            {statusService.getAvailableActions(currentStatus).map(action => (
              <span
                key={action}
                className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 text-xs rounded-full"
              >
                {action}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusBar;
