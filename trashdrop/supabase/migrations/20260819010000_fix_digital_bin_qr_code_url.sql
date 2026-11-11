-- Derive digital_bins.qr_code_url from the row's own id
-- ----------------------------------------------------------------------------
-- What the collector actually scans (TrashDrop_Mobile_Collector_Driver):
--   NavigationQRModal.jsx  extractId() pulls the uuid out of ".../bin/<uuid>"
--                          and compares it to expectedQRValue
--   Request.jsx:3119       expectedQRValue={navigationRequestId}
--   Request.jsx:3008       navigationRequestId is used as .eq('id', …) against
--                          digital_bins
-- So the QR must carry the DIGITAL BIN id. The collector never reads
-- qr_code_url at all.
--
-- The app was writing the LOCATION id into this column
-- (src/pages/DigitalBin.js:794). A location is reused across bookings at one
-- address, so that value cannot identify a pickup: two bins at the same address
-- produced identical QR codes and the second would fail the collector's check
-- with "Wrong bin! Try again."
--
-- Deriving it in the database makes every writer correct by construction -- the
-- app, the WhatsApp booking RPC, and anything added later. Values supplied by a
-- caller are intentionally overridden; create_whatsapp_digital_bin still passes
-- one, which is now vestigial.

CREATE OR REPLACE FUNCTION public.set_digital_bin_qr_code_url()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.qr_code_url := 'https://trashdrop.app/bin/' || NEW.id::text;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_digital_bin_qr_code_url ON public.digital_bins;
CREATE TRIGGER trg_digital_bin_qr_code_url
  BEFORE INSERT OR UPDATE OF id ON public.digital_bins
  FOR EACH ROW
  EXECUTE FUNCTION public.set_digital_bin_qr_code_url();

-- Backfill existing rows, which currently point at their location id.
-- Any bin already printed/saved by a customer changes value here: the old code
-- resolved to a location, not a pickup, so it could not have scanned correctly
-- against anything but the first bin at that address.
UPDATE public.digital_bins
SET qr_code_url = 'https://trashdrop.app/bin/' || id::text
WHERE qr_code_url IS DISTINCT FROM 'https://trashdrop.app/bin/' || id::text;
