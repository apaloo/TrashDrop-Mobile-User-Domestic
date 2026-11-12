/**
 * Phone numbers never go to the function logs in full: keeps the first 3 and
 * last 2 digits ("233***00"), enough to tell conversations apart.
 */
function maskPhone(phone) {
  if (phone == null || phone === '') return '(none)';
  const s = String(phone);
  return s.length > 5 ? `${s.slice(0, 3)}***${s.slice(-2)}` : '***';
}

module.exports = { maskPhone };
