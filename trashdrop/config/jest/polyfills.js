// Browser globals that Jest 27's jsdom lacks but browsers have. React Router 7
// uses TextEncoder; the real app runs in browsers, which all provide it.
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;
