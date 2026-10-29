import React from 'react';

/**
 * An on/off switch: the whole switch is tappable, the knob slides across,
 * and screen readers hear it as a switch that is on or off.
 * Name it with `label` (read aloud) or `labelledBy` (the id of visible text).
 */
const Switch = ({ checked, onChange, label, labelledBy, disabled = false, id }) => (
  <button
    type="button"
    role="switch"
    id={id}
    aria-checked={checked}
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex flex-shrink-0 h-7 w-12 items-center rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
      checked ? 'bg-td-forest' : 'bg-td-border-strong dark:bg-gray-600'
    }`}
  >
    <span
      aria-hidden="true"
      className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

export default Switch;
