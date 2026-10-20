// Address auth emails and OAuth send people back to. REACT_APP_SITE_URL pins it
// to https://app.trashdrops.com; without it the page's own address is used.
export const getSiteUrl = () =>
  (process.env.REACT_APP_SITE_URL || window.location.origin).replace(/\/+$/, '');
