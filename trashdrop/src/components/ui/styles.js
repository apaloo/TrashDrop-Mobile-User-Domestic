/**
 * Shared class names for the dashboard look (Concept A), so every page uses
 * the same cards, buttons and notes as the dashboard.
 *
 * Colours: forest #1b6e35 (actions), tonal #e6f2e9 (soft green), lime
 * #b6ee69 (highlight), ink and sage text, td-border lines; DM Sans.
 */

/** White card with a hairline border, as on the dashboard */
export const card = 'bg-white dark:bg-gray-800 border border-td-border dark:border-gray-700 rounded-2xl';

/** Section heading inside a page or card */
export const sectionTitle = 'text-[17px] font-bold text-td-ink dark:text-gray-100';

const pill = 'inline-flex items-center justify-center gap-2 rounded-full transition-colors disabled:cursor-not-allowed';

/** Main action: solid forest pill */
export const primaryButton = `${pill} h-12 px-6 bg-td-forest hover:bg-td-forest-dk text-white text-[16px] font-bold disabled:bg-gray-300 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-300`;

/** Second action: outlined pill */
export const secondaryButton = `${pill} h-12 px-6 border-[1.5px] border-td-border-strong dark:border-gray-500 text-td-ink dark:text-gray-100 text-[15px] font-semibold hover:bg-td-cream dark:hover:bg-gray-700 disabled:opacity-60`;

/** Small tonal pill, like "See All" */
export const tonalButton = `${pill} h-9 px-4 bg-td-tonal hover:bg-[#d5eadb] text-td-forest-dk text-sm font-semibold dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/60`;

/** Stop / cancel an action in progress: outlined in red */
export const dangerButton = `${pill} h-12 px-6 border-[1.5px] border-red-700 text-red-700 dark:border-red-400 dark:text-red-300 text-[15px] font-semibold hover:bg-red-50 dark:hover:bg-red-950/40`;

/** Soft green note (tips, information) */
export const infoNote = 'rounded-2xl bg-td-tonal dark:bg-green-900/30 text-td-forest-dk dark:text-green-200';

/** Something went wrong */
export const errorNote = 'rounded-2xl border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200';

/** Needs the user's attention (missing fields, no bags) */
export const warningNote = 'rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
