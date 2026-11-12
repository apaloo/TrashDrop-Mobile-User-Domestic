-- TD58 follow-up: accounts whose email is on a TrashDrop domain we don't own
-- can be taken over by whoever owns that domain (a sign-in link or password
-- reset is emailed there). Found by the security watch's owned-domains check
-- on 2026-11-12: five test accounts on trashdrop.org, all created 2025-08-08,
-- no password, never confirmed, never signed in, no profile and no bookings.
-- Sign-in is banned; nothing is deleted.
UPDATE auth.users
   SET banned_until = 'infinity', updated_at = now()
 WHERE email ~* '@([a-z0-9-]+\.)*trashdrops?\.[a-z]{2,}$'
   AND email !~* '@([a-z0-9-]+\.)*trashdrops\.com$'
   AND banned_until IS DISTINCT FROM 'infinity';
