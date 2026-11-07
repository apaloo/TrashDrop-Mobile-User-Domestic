import React from 'react';

/**
 * Page title in the dashboard style: left-aligned, in the page flow (no bar),
 * with an optional one-line explanation underneath.
 *
 * Pass onBack to put a round back button in front of the title, as phone
 * apps do; backLabel is what screen readers announce ("Back to Dashboard").
 */
const PageHeader = ({ title, subtitle, children, onBack, backLabel = 'Back' }) => (
  <header className="pt-4 pb-1">
    <div className="flex items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          title={backLabel}
          className="shrink-0 -ml-1 h-11 w-11 inline-flex items-center justify-center rounded-full bg-white dark:bg-gray-800 border border-td-border dark:border-gray-600 shadow-sm text-td-ink dark:text-gray-100 transition active:scale-95 active:bg-td-cream dark:active:bg-gray-700 hover:bg-td-cream dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-td-forest/50"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
      )}
      <h1 className="text-[26px] leading-tight font-bold text-td-ink dark:text-gray-100">{title}</h1>
    </div>
    {subtitle && <p className="mt-1 text-[15px] text-td-sage dark:text-gray-300">{subtitle}</p>}
    {children}
  </header>
);

export default PageHeader;
