-- Remove the 4 disposal sites that were saved twice, and stop it happening again.
--
-- On 2026-02-03 the same import ran twice (10:18 and 10:20 UTC), so the
-- collector app's "Nearest Dumping Sites" listed ZoomPak Transfer Station and
-- the Zoomlion Ashaiman, Mallam and Pantang transfer stations twice (53 sites
-- instead of 49). Each pair is identical apart from id and created_at. This
-- keeps the first row of each pair and deletes the 10:20 copy.
--
-- Checked before writing: no digital_bins, illegal_dumping_mobile or
-- pickup_requests row points at any of the 4 copies. The delete names the
-- exact ids, and only runs while the original row still exists.
-- Pricing rules (CLAUDE.md) are untouched.

DELETE FROM public.disposal_centers AS copy
 WHERE copy.id IN (
         '16621135-eed3-4438-8713-8568668c79c7', -- Zoomlion Transfer Station Ashaiman
         'f3b304cc-e2c6-42a3-a66a-a604697a7b30', -- Zoomlion Transfer Station Mallam
         '72e41b23-7a6b-4271-b52b-ca504bde1a85', -- Zoomlion Transfer Station Pantang
         '2722b74d-6689-4078-b0f9-8a38ddc238b3'  -- ZoomPak Transfer Station
       )
   AND EXISTS (
         SELECT 1 FROM public.disposal_centers keep
          WHERE keep.id <> copy.id
            AND lower(btrim(keep.name)) = lower(btrim(copy.name))
            AND keep.created_at < copy.created_at
       );

-- The same site (name and address) can't be saved twice again
CREATE UNIQUE INDEX IF NOT EXISTS disposal_centers_unique_name_address
  ON public.disposal_centers (lower(btrim(name)), lower(btrim(coalesce(address, ''))));
