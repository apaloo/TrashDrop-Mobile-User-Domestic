import React from 'react';

/**
 * Page title in the dashboard style: left-aligned, in the page flow (no bar),
 * with an optional one-line explanation underneath.
 */
const PageHeader = ({ title, subtitle, children }) => (
  <header className="pt-4 pb-1">
    <h1 className="text-[26px] leading-tight font-bold text-td-ink dark:text-gray-100">{title}</h1>
    {subtitle && <p className="mt-1 text-[15px] text-td-sage dark:text-gray-300">{subtitle}</p>}
    {children}
  </header>
);

export default PageHeader;
