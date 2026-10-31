import React from 'react';

const SELECTED_TONES = {
  green: 'border-td-forest bg-td-tonal dark:border-green-400 dark:bg-green-900/40',
  amber: 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-900/30',
  red: 'border-red-600 bg-red-50 dark:border-red-400 dark:bg-red-900/30',
};

/** One choice tile: icon, label, optional hint; selected tiles get a coloured border and tint */
const OptionTile = ({ selected, onClick, icon, label, hint, tone = 'green' }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`min-w-0 rounded-2xl border-2 px-1.5 py-2.5 flex flex-col items-center text-center transition-colors ${
      selected
        ? SELECTED_TONES[tone]
        : 'border-td-border bg-white hover:border-td-border-strong dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-400'
    }`}
  >
    <span className="text-2xl leading-none mb-1.5" aria-hidden="true">{icon}</span>
    <span className={`text-[13px] leading-tight text-td-ink dark:text-gray-100 ${selected ? 'font-bold' : 'font-semibold'}`}>{label}</span>
    {hint && <span className="text-xs leading-tight text-td-sage dark:text-gray-300 mt-0.5">{hint}</span>}
  </button>
);

export default OptionTile;
