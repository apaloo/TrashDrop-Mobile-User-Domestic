import React from 'react';
import { primaryButton, secondaryButton } from '../ui/styles.js';

/**
 * Back / Continue at the foot of a Digital Bin step. When Continue is
 * disabled, the "Select ... to continue" note says what is missing.
 */
const StepNav = ({ onBack, onNext, nextLabel = 'Continue', disabled = false, missing = [], missingText, missingId }) => {
  const note = missingText || (missing.length > 0 ? `Select ${missing.join(', ')} to continue.` : '');
  return (
  <div className="mt-5">
    {disabled && note && (
      <p id={missingId} className="mb-3 text-sm text-amber-800 dark:text-amber-200" role="status">
        {note}
      </p>
    )}
    <div className={`grid gap-2.5 ${onBack ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {onBack && (
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        aria-describedby={disabled && note ? missingId : undefined}
        className={primaryButton}
      >
        {nextLabel}
      </button>
    </div>
  </div>
  );
};

export default StepNav;
