/**
 * How this person signs in, in words for the sign-out sheet, so people who
 * forget whether they used Google or a password are reminded before they go.
 * Returns null when it isn't known.
 */
export const describeSignIn = (user) => {
  if (!user) return null;
  const provider = user.app_metadata?.provider
    || user.identities?.[0]?.provider
    || null;
  const email = user.email || null;

  if (provider === 'google') return email ? `Google (${email})` : 'Google';
  if (provider === 'apple') return email ? `Apple (${email})` : 'Apple';
  if (provider === 'phone') return user.phone ? `your phone number (${user.phone})` : 'your phone number';
  if (provider === 'email') return email ? `your email and password (${email})` : 'your email and password';
  return email ? email : null;
};

export default describeSignIn;
