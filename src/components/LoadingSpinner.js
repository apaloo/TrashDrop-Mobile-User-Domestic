import React from 'react';

/**
 * Loading spinner component for displaying loading states
 * @param {Object} props
 * @param {string} props.size - Size of the spinner (sm, md, lg)
 * @param {string} props.color - Color of the spinner
 */
const LoadingSpinner = ({ size = 'md', color = 'primary' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  const colorClasses = {
    primary: 'border-primary-light',
    secondary: 'border-secondary-light',
    white: 'border-white',
  };

  return (
    <div className="flex justify-center items-center p-4">
      <div
        className={`
          ${sizeClasses[size] || sizeClasses.md} 
          ${colorClasses[color] || colorClasses.primary}
          rounded-full border-t-transparent animate-spin
        `}
        role="status"
        aria-label="loading"
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default LoadingSpinner;
