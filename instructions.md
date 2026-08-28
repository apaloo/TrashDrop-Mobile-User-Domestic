# TrashDrop Mobile User App — Technical Reference

> **Last updated:** May 2026
> This document reflects the **current implemented state** of the TrashDrop mobile PWA for domestic users.

---

## 1. Project Overview

TrashDrop is a Progressive Web App (PWA) for domestic waste management. Users can request waste pickups, register digital bins, report illegal dumping, scan QR codes on waste bags, track collectors in real time, and earn rewards. The app is mobile-first, installable, and works offline.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React 18 (Create React App + CRACO override) |
| **Routing** | React Router DOM v6 |
| **Styling** | Tailwind CSS 3 + Material UI 5 (`@mui/material`, `@mui/x-date-pickers`) |
| **State** | React Context API (`AuthContext`, `ThemeContext`, `OfflineQueueContext`) |
| **Backend / DB** | Supabase (auth, Postgres, storage, realtime, RPC functions) |
| **Maps** | React-Leaflet + Leaflet Routing Machine |
| **QR** | qr-scanner, qrcode.react |
| **Forms** | Formik + Yup validation |
| **Offline** | IndexedDB via `idb`, Workbox service worker, custom sync services |
| **PWA** | Custom service worker, manifest.json, install prompts |
| **Build** | CRACO (wraps react-scripts 5) |
| **Deployment** | Netlify (auto-deploy from `trashdrop/` subfolder) |
| **CI/CD** | GitHub Actions (`.github/workflows/ci-cd.yml`) |
| **Testing** | Jest + React Testing Library, Cypress for E2E |

---

## 3. Project Structure

**Important:** The app source lives in `/trashdrop/src/`. There is a legacy `/src/` folder at the repo root — **do not edit it**.

```
trashdrop/
├── public/              # Static assets, manifest.json, PWA icons
├── netlify.toml         # Netlify build & redirect config
├── craco.config.js      # CRACO overrides for CRA
├── package.json         # Dependencies & scripts
└── src/
    ├── App.js           # Root component, routing, provider tree
    ├── index.js         # Entry point, service worker registration
    ├── components/      # Reusable UI components
    │   ├── digitalBin/  # Digital bin wizard steps
    │   ├── profile/     # Profile sub-pages
    │   └── collection/  # Collection components
    ├── pages/           # Route-level page components
    ├── services/        # Supabase API & business logic services
    ├── context/         # React Context providers (Auth, Theme, OfflineQueue)
    ├── hooks/           # Custom hooks (useGpsRefinement, useOptimizedData, useTheme)
    ├── utils/           # Helpers, clients, offline storage, realtime, etc.
    ├── styles/          # Additional CSS
    ├── theme/           # MUI theme configuration
    └── service-worker.js # Workbox-based service worker
```

---

## 4. Authentication

- **Provider:** Supabase Auth (email/password, social login, email verification)
- **Context:** `src/context/AuthContext.js` — manages `isAuthenticated`, `user`, silent token refresh, session persistence via `localStorage`
- **Route protection:** `src/components/PrivateRoute.js` wraps all authenticated routes
- **Error handling:** `AuthErrorBoundary.js`, `AuthFallback.js` for graceful auth failure recovery
- **Pages:** `Login.js`, `Register.js`, `ResetPassword.js`, `ResetPasswordConfirm.js`, `AuthCallback.js`

---

## 5. Routing (App.js)

### Public Routes
| Path | Component |
|---|---|
| `/login` | Login |
| `/register` | Register |
| `/reset-password` | ResetPassword |
| `/reset-password-confirm` | ResetPasswordConfirm |
| `/auth/callback` | AuthCallback |

### Protected Routes (wrapped in `<PrivateRoute>` + `<Layout>`)
| Path | Component | Description |
|---|---|---|
| `/dashboard` | Dashboard | Main hub with stats, active pickups, onboarding |
| `/qr-scanner` | QRScanner | Scan waste bag QR codes |
| `/pickup-request` | PickupRequest | Request a new waste pickup |
| `/digital-bin` | DigitalBin | Multi-step bin registration wizard |
| `/report` | DumpingReport | Report illegal dumping |
| `/rewards` | Rewards | View/redeem reward points |
| `/activity` | Activity | Activity & transaction history |
| `/profile` | Profile | User profile with sub-tabs |
| `/payment-methods` | PaymentMethods | Manage payment methods |
| `/notifications` | Notifications | Notification center |
| `/collector-tracking` | CollectorTracking | Real-time Uber-style collector tracking |
| `/collection/:collectionId` | CollectionForm | Active collection details |
| `/collection-qr` | CollectionQRCode | QR code for collection |
| `/store` | → redirects to `/rewards` | Legacy redirect |

---

## 6. Core Features (Implemented)

### 6.1 Dashboard
- Grid layout with Tailwind CSS, skeleton loaders, real-time data
- Recent Activity shows skeleton rows until the first fetch settles (`activitiesLoaded`), so the empty state never flashes on a slow connection
- Initial load (`loadDashboardDataSeamless`) settles stats/activities/pickups independently and paints each as it lands, retries the failed ones on an exponential backoff (`LOAD_RETRY_DELAYS`, skipped while offline), and only then shows a plain-language banner with a "Try again" button - never a raw error overlay
- One initial load, not two: the progressive loader now only drives the 30s auto-refresh, and the duplicate unread-notification and online-listener fetches are gone (~49 → ~19 API calls in the first 10s)
- `mountedRef` is set on mount as well as cleared on unmount, so StrictMode's remount doesn't discard every guarded fetch result
- **Onboarding system** (`OnboardingFlow.js` + `onboardingService.js`): guided walkthrough for new users with smart step detection based on progress (bags, locations, QR scans), force parameter (`?force=true`) for re-triggering
- Active pickup cards (`ActivePickupCard.js`) with live status
- Seamless dashboard service for cached data and smooth UX

### 6.2 Digital Bin Registration
Multi-step wizard in `src/components/digitalBin/`:
- **LocationStep** — select/set bin location via Leaflet map
- **WasteDetailsStep** — choose waste type, bin size (60L–1100L), bag count
- **ScheduleDetailsStep** — pickup frequency (one-time, weekly, biweekly, monthly)
- **AdditionalInfoStep** — bin photos via `CameraModal.js` (portrait-optimized, back camera, max 3 photos). The limit lives in one `MAX_BIN_PHOTOS` constant and is passed to `CameraModal` as `maxPhotos`, so the camera screen's counter can't disagree with the form's labels
- **ReviewStep** — confirm & submit; generates QR code. Submit stays disabled until location, schedule and bin details are complete, and lists what is still missing inline; steps 2–3 do the same for their Continue buttons
- After a successful submit the list view shows a dismissible confirmation summarising the request (bins, waste type, start date, time window) alongside the toast
- The new bin is added to the list optimistically before the view switches, then reconciled by a background (silent-on-failure) server refresh, so the row backing "your QR code is ready below" is always there; `ScheduledQRTab` also switches to the tab holding the new bin, overriding the remembered tab
- `transformBin` (exported from `digitalBinService.js`) is the single mapping from a `digital_bins` row to the list's status vocabulary. The database's own `status` starts at `'pending'`, which matches none of the tabs, so every source must go through it - the joined fetch, the optimistic row, and raw realtime payloads alike. The realtime handler used to merge payloads unmapped, so the background `photo_urls` write fired seconds after a create knocked the new bin out of all three tabs. Covered by `src/services/__tests__/digitalBinService.transformBin.test.js`
- **QRCodeList / ScheduledQRTab** — view active digital bins and their QR codes
- The WhatsApp booking layer mirrors this flow step for step, photos included. Photos may only be taken live: the Flow's `PhotoPicker` is pinned to `photo-source: "camera"` (Meta's default, `camera_gallery`, would permit gallery picks) and chat attachments are refused outright, since WhatsApp offers no camera-only mode for them. They are downloaded from the WhatsApp CDN by `whatsapp-api.downloadMedia`, put in the same `dumping-photos` bucket, and written to `digital_bins.photo_urls` after the row exists — the order `DigitalBin.js` uses. Attaching runs last in the webhook, behind the confirmation and QR, so a slow upload cannot cost the customer their receipt

### 6.3 Pickup Requests
- `PickupRequest.js` — full pickup request flow with location, waste type, scheduling, payment
- GPS-based pricing via `gpsPricingService.js` and `costCalculator.js`
- Map integration for location selection
- Real-time status tracking

### 6.4 QR Code System
- **Scanning:** `QRScanner.js` page + `QRReader.js` component (uses `qr-scanner` library with environment-facing camera)
- **Batch scanning:** `BatchQRScanner.js` for scanning multiple bags
- **Generation:** `qrcode.react` for generating QR codes on digital bins
- **Storage:** Offline QR scan storage via IndexedDB (`qrStorage.js`)

### 6.5 Illegal Dumping Reports
- `DumpingReportForm.js` — comprehensive form with:
  - Photo capture via `CameraModal.js` (up to 6 photos)
  - Location via Leaflet map with auto-detect
  - Waste type, severity, size classification
  - Anonymous reporting option
  - Photo upload to Supabase storage (`photoUploadService.js`)
  - Coordinates read-out shows "Detecting your location..." while the first GPS fix is in flight instead of `N/A`
  - Submit stays disabled until location, waste type, size and at least one photo are present, and lists what is still missing inline
  - On success the form shows a confirmation with the report reference and summary; the page no longer auto-navigates - "Back to Dashboard" and "Report another site" are the user's call
- Deduplication via `requestDeduplication.js` (location hash, idempotency tokens, submission fingerprints)

### 6.6 Rewards & Points
- `Rewards.js` — catalog with categories, point costs, redemption flow
- Points earned from pickups, QR scans, dumping reports
- User levels (Eco Starter, etc.) tracked in `profiles` table
- Services: `rewardsService.js`

### 6.7 Real-Time Collector Tracking
- `UberStyleTrackingMap.js` — Uber-style live map showing collector location, route, ETA
- `CollectorTracking.js` — full tracking page
- `CollectorMap.js` — collector location display
- Supabase Realtime subscriptions for live updates (`realtime.js`, `realtimeOptimized.js`)

### 6.8 Camera System
- `CameraModal.js` — standalone fullscreen camera modal with:
  - Portrait-optimized constraints (`720×1280`)
  - Back camera (`facingMode: 'environment'`)
  - Flash effect on capture
  - Memory management (garbage collection, URL cleanup)
  - Crash-proof capture with canvas-based JPEG compression (0.82 quality)
  - Photo count limits per context (3 for bins, 6 for dumping reports)

### 6.9 Notifications
- `NotificationList.js` — in-app notification display
- `smartNotificationService.js` — intelligent notification management
- `notificationService.js` — Supabase-backed notification CRUD
- `toastService.js` + `ToastProvider.js` — toast notification system

### 6.10 Profile Management
Sub-pages in `src/components/profile/`:
- **PersonalInfo** — name, email, phone, avatar
- **Locations** — saved bin locations (CRUD with map)
- **Notifications** — notification preferences
- **Preferences** — dark mode, language
- **Security** — password change

---

## 7. Services Layer (`src/services/`)

| Service | Purpose |
|---|---|
| `activityService.js` | User activity/history tracking |
| `adaptiveUpdateService.js` | Smart data refresh based on context |
| `batchService.js` | Bag batch management |
| `collectorService.js` | Collector data and status |
| `digitalBinService.js` | Digital bin CRUD |
| `dumpingService.js` | Illegal dumping report submission |
| `gpsPricingService.js` | GPS-based pickup pricing |
| `locationService.js` | Location management |
| `notificationService.js` | Notification CRUD |
| `onboardingService.js` | Onboarding state detection & management |
| `paymentService.js` | Payment method operations |
| `photoUploadService.js` | Photo upload to Supabase storage |
| `pickupService.js` | Pickup request operations |
| `rewardsService.js` | Rewards catalog & redemption |
| `seamlessDashboardService.js` | Cached dashboard data loading |
| `smartNotificationService.js` | Intelligent notification batching |
| `statusService.js` | Pickup status management |
| `syncService.js` | Offline data synchronization |
| `toastService.js` | Toast notification management |
| `userService.js` | User profile operations |

---

## 8. Offline & PWA Support

- **Service Worker:** Workbox-based (`src/service-worker.js`) with asset precaching and runtime caching
- **IndexedDB:** `src/utils/indexedDB.js` + `offlineStorage.js` for offline data persistence
- **Offline Queue:** `src/context/OfflineQueueContext.js` queues mutations when offline
- **Sync Services:** `syncService.js`, `pickupSyncService.js`, `binSyncService.js` for background sync
- **Network Monitoring:** `networkMonitor.js`, `NetworkStatusRibbon.js`, `OfflineIndicator.js`
- **Install Prompts:** `InstallPrompt.js`, `ForceInstallPrompt.js`, `PwaInitializer.js`, `PwaRecovery.js`
- **Manifest:** `public/manifest.json` — standalone display, portrait orientation, PWA shortcuts for Report, Pickup, Locations

---

## 9. Performance

- **Code splitting:** `React.lazy` + `Suspense` for debug/dev components
- **Optimized data hooks:** `useOptimizedData.js` for efficient data fetching
- **Performance monitoring:** `AppPerformanceProvider.js`, `AppPerformanceOptimizer.js`, `PerformanceMonitor.js`
- **Image optimization:** `OptimizedImage.js` component
- **Caching:** `seamlessCache.js` for in-memory dashboard caches
- **Request deduplication:** `requestDeduplication.js` prevents duplicate submissions

---

## 10. Deployment

- **Platform:** Netlify
- **Build command:** `CI=false npm run build` (via CRACO)
- **Publish directory:** `trashdrop/build`
- **SPA routing:** Netlify `_redirects` / `netlify.toml` catches all routes → `index.html`
- **CI/CD:** GitHub Actions (`.github/workflows/ci-cd.yml`)
- **Environment variables:** Set in Netlify dashboard (Supabase URL, anon key, etc.)

### Development
```bash
cd trashdrop
npm install
npm start          # Starts CRACO dev server (port 3003 or default)
```

### Production Build
```bash
cd trashdrop
CI=false npm run build
```

---

## 11. Key Configuration Files

| File | Purpose |
|---|---|
| `trashdrop/package.json` | Dependencies, scripts |
| `trashdrop/craco.config.js` | CRA overrides |
| `trashdrop/netlify.toml` | Netlify build, redirects, headers, dev config |
| `trashdrop/tailwind.config.js` | Tailwind CSS configuration |
| `trashdrop/public/manifest.json` | PWA manifest |
| `trashdrop/src/utils/supabaseClient.js` | Supabase client initialization |
| `trashdrop/src/utils/app-config.js` | App-level config values |
| `.github/workflows/ci-cd.yml` | CI/CD pipeline |

---

## 12. Database Schema (Supabase / Postgres)

> WARNING: This schema is for context only and is not meant to be run.
> Table order and constraints may not be valid for execution.

CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text DEFAULT 'info'::text,
  severity text DEFAULT 'medium'::text,
  entity_type text,
  entity_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  creator uuid,
  CONSTRAINT alerts_pkey PRIMARY KEY (id),
  CONSTRAINT alerts_creator_fkey FOREIGN KEY (creator) REFERENCES auth.users(id),
  CONSTRAINT alerts_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT alerts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.assignment_photos (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  assignment_id text,
  photo_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT assignment_photos_pkey PRIMARY KEY (id),
  CONSTRAINT assignment_photos_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.authority_assignments(id)
);
CREATE TABLE public.authority_assignments (
  id text NOT NULL,
  location text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  type text NOT NULL,
  priority text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  payment text NOT NULL,
  estimated_time text,
  distance text,
  authority text,
  status text NOT NULL CHECK (status = ANY (ARRAY['available'::text, 'accepted'::text, 'completed'::text])),
  collector_id uuid,
  accepted_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  cleanup_notes text,
  CONSTRAINT authority_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT authority_assignments_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id)
);
CREATE TABLE public.bag_count (
  count bigint
);
CREATE TABLE public.bag_inventory (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  batch_code text NOT NULL,
  bag_type text NOT NULL,
  status text NOT NULL DEFAULT 'available'::text,
  scan_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  batch_id uuid,
  CONSTRAINT bag_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT bag_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT bag_inventory_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.bag_orders(id)
);
CREATE TABLE public.bag_orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  location_id uuid NOT NULL,
  bag_type text NOT NULL,
  quantity integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  delivery_date timestamp with time zone,
  points_used integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  batch_qr_code text NOT NULL UNIQUE,
  CONSTRAINT bag_orders_pkey PRIMARY KEY (id),
  CONSTRAINT bag_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),
  CONSTRAINT bag_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.bag_types (
  plastic bigint,
  paper bigint,
  metal bigint,
  glass bigint,
  organic bigint,
  general bigint,
  recycling bigint
);
CREATE TABLE public.bags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_id uuid,
  qr_code text NOT NULL,
  status text DEFAULT 'active'::text,
  scanned boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  collector_id uuid,
  unit_price numeric,
  scanned_at timestamp with time zone,
  disposed_at timestamp with time zone,
  is_verified boolean DEFAULT false,
  collector_credited_at timestamp with time zone,
  collector_unlocked_at timestamp with time zone,
  deadhead_km numeric,
  collector_base_earnings numeric,
  is_recyclable boolean DEFAULT false,
  recycler_gross numeric,
  recycler_collector_share numeric,
  recycler_user_share numeric,
  recycler_platform_share numeric,
  collector_total_earnings numeric,
  user_total_earnings numeric,
  platform_total_earnings numeric,
  CONSTRAINT bags_pkey PRIMARY KEY (id),
  CONSTRAINT bags_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id)
);
CREATE TABLE public.bags_mobile (
  bag_id uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text,
  picked_up_at timestamp without time zone,
  picked_up_by uuid,
  CONSTRAINT bags_mobile_pkey PRIMARY KEY (bag_id)
);
CREATE TABLE public.batch_count (
  count bigint
);
CREATE TABLE public.batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  batch_number text,
  bag_count integer NOT NULL DEFAULT 0,
  status text DEFAULT 'active'::text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  batch_name text,
  total_batch_price numeric,
  unit_price numeric,
  is_locked boolean DEFAULT false,
  CONSTRAINT batches_pkey PRIMARY KEY (id),
  CONSTRAINT batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.bin_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_name text NOT NULL,
  address text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bin_locations_pkey PRIMARY KEY (id),
  CONSTRAINT bin_locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.bin_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  digital_bin_id uuid NOT NULL,
  collector_id uuid NOT NULL,
  bags_collected integer NOT NULL CHECK (bags_collected >= 0),
  total_bill numeric NOT NULL CHECK (total_bill >= 0::numeric),
  payment_mode text NOT NULL CHECK (payment_mode = ANY (ARRAY['momo'::text, 'e_cash'::text, 'cash'::text])),
  client_momo text,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'initiated'::text, 'success'::text, 'failed'::text])),
  gateway_reference text UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  type text NOT NULL DEFAULT 'collection'::text CHECK (type = ANY (ARRAY['collection'::text, 'disbursement'::text])),
  collector_share numeric CHECK (collector_share >= 0::numeric),
  platform_share numeric CHECK (platform_share >= 0::numeric),
  client_rswitch text,
  currency text DEFAULT 'GHS'::text,
  collector_account_number text,
  collector_account_name text,
  sender_name text DEFAULT 'TrashDrop'::text,
  raw_gateway_response jsonb,
  retry_count integer DEFAULT 0,
  scanned_bag_ids ARRAY DEFAULT '{}'::text[],
  gateway_transaction_id text,
  gateway_error text,
  platform_subsidy numeric NOT NULL DEFAULT 0,
  is_promotional boolean NOT NULL DEFAULT false,
  CONSTRAINT bin_payments_pkey PRIMARY KEY (id),
  CONSTRAINT bin_payments_digital_bin_id_fkey FOREIGN KEY (digital_bin_id) REFERENCES public.digital_bins(id),
  CONSTRAINT bin_payments_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collector_profiles(id)
);
CREATE TABLE public.collector_loyalty_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL,
  month date NOT NULL,
  tier character varying NOT NULL DEFAULT 'Silver'::character varying,
  cashback_rate numeric NOT NULL DEFAULT 0.01,
  monthly_cap numeric NOT NULL DEFAULT 100,
  cashback_earned numeric NOT NULL DEFAULT 0,
  total_jobs_this_month integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT collector_loyalty_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT collector_loyalty_tiers_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id)
);
CREATE TABLE public.collector_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  status text NOT NULL DEFAULT 'inactive'::text CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'on_break'::text])),
  vehicle_type text CHECK (vehicle_type = ANY (ARRAY['motorcycle'::text, 'tricycle'::text, 'truck'::text, 'van'::text, 'bicycle'::text, 'cart'::text, 'other'::text])),
  vehicle_plate text,
  vehicle_capacity integer,
  current_latitude numeric,
  current_longitude numeric,
  assigned_region text,
  service_area_id uuid,
  rating numeric DEFAULT 0.00 CHECK (rating >= 0::numeric AND rating <= 5::numeric),
  total_collections integer DEFAULT 0,
  completed_today integer DEFAULT 0,
  active_requests integer DEFAULT 0,
  is_online boolean DEFAULT false,
  last_active_at timestamp with time zone,
  session_start_at timestamp with time zone,
  profile_image_url text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  company_name character varying,
  company_id character varying,
  id_back_photo_url character varying,
  id_front_photo_url character varying,
  id_type text,
  license_plate character varying,
  region text,
  role text,
  vehicle_color text,
  vehicle_photo_url character varying,
  email character varying,
  current_location USER-DEFINED,
  location_updated_at timestamp with time zone,
  last_active timestamp with time zone DEFAULT now(),
  pending_balance numeric DEFAULT 0,
  withdrawable_balance numeric DEFAULT 0,
  preferred_language character varying DEFAULT 'tw'::character varying,
  CONSTRAINT collector_profiles_pkey PRIMARY KEY (id),
  CONSTRAINT collector_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT collector_profiles_service_area_id_fkey FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id)
);
CREATE TABLE public.collector_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL,
  filter_criteria jsonb,
  reserved_requests ARRAY DEFAULT ARRAY[]::uuid[],
  session_start timestamp with time zone DEFAULT now(),
  last_activity timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval),
  status text DEFAULT 'offline'::text,
  status_reason text,
  last_status_change timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT collector_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT collector_sessions_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collector_profiles(id)
);
CREATE TABLE public.collector_tips (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL,
  request_id uuid,
  request_type character varying DEFAULT 'pickup_request'::character varying,
  amount numeric NOT NULL DEFAULT 0,
  user_id uuid,
  message text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT collector_tips_pkey PRIMARY KEY (id),
  CONSTRAINT collector_tips_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id),
  CONSTRAINT collector_tips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  contact_type text DEFAULT 'personal'::text,
  relationship text,
  primary_contact boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT contacts_pkey PRIMARY KEY (id),
  CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.digital_bins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  location_id uuid NOT NULL,
  qr_code_url text NOT NULL,
  frequency character varying NOT NULL DEFAULT 'weekly'::character varying CHECK (frequency::text = ANY (ARRAY['one-time'::character varying, 'weekly'::character varying, 'biweekly'::character varying, 'monthly'::character varying]::text[])),
  waste_type character varying NOT NULL DEFAULT 'general'::character varying CHECK (waste_type::text = ANY (ARRAY['general'::character varying, 'recycling'::character varying, 'organic'::character varying]::text[])),
  bag_count integer NOT NULL DEFAULT 1 CHECK (bag_count >= 1 AND bag_count <= 10),
  details text,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  collected_at timestamp with time zone,
  collector_id uuid,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'available'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'collecting'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text, 'canceled'::text, 'expired'::text])),
  bin_size_liters integer NOT NULL DEFAULT 120 CHECK (bin_size_liters = ANY (ARRAY[60, 80, 90, 100, 120, 240, 340, 360, 660, 1100])),
  is_urgent boolean NOT NULL DEFAULT false,
  fee numeric DEFAULT 0,
  collector_core_payout numeric DEFAULT 0,
  collector_urgent_payout numeric DEFAULT 0,
  collector_distance_payout numeric DEFAULT 0,
  collector_surge_payout numeric DEFAULT 0,
  collector_tips numeric DEFAULT 0,
  collector_recyclables_payout numeric DEFAULT 0,
  collector_loyalty_cashback numeric DEFAULT 0,
  collector_total_payout numeric DEFAULT 0,
  surge_multiplier numeric DEFAULT 1.0,
  deadhead_km numeric DEFAULT 0,
  disposed_at timestamp with time zone,
  disposal_site_id text,
  accepted_at timestamp with time zone,
  photo_urls ARRAY,
  is_promotional boolean NOT NULL DEFAULT false,
  promo_request_number integer,
  CONSTRAINT digital_bins_pkey PRIMARY KEY (id),
  CONSTRAINT digital_bins_disposal_site_id_fkey FOREIGN KEY (disposal_site_id) REFERENCES public.disposal_centers(id),
  CONSTRAINT digital_bins_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id),
  CONSTRAINT digital_bins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT digital_bins_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.bin_locations(id)
);
CREATE TABLE public.disposal_centers (
  id text NOT NULL,
  name text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  waste_type text,
  latitude USER-DEFINED,
  longitude USER-DEFINED,
  center_type text,
  region character varying,
  district character varying,
  operating_hours character varying,
  phone character varying,
  rating numeric DEFAULT 4.0,
  capacity_notes text,
  status character varying DEFAULT 'active'::character varying,
  CONSTRAINT disposal_centers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.dumping_count (
  count bigint
);
CREATE TABLE public.dumping_reports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  address text,
  waste_type text NOT NULL CHECK (waste_type = ANY (ARRAY['plastic'::text, 'paper'::text, 'metal'::text, 'glass'::text, 'organic'::text, 'general'::text, 'recycling'::text])),
  approximate_size text NOT NULL,
  images ARRAY,
  status text NOT NULL DEFAULT 'reported'::text,
  is_anonymous boolean DEFAULT false,
  points_earned integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  location_address text,
  CONSTRAINT dumping_reports_pkey PRIMARY KEY (id),
  CONSTRAINT dumping_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.dumping_reports_mobile (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  dumping_id uuid NOT NULL,
  estimated_volume text,
  hazardous_materials boolean DEFAULT false,
  accessibility_notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT dumping_reports_mobile_pkey PRIMARY KEY (id),
  CONSTRAINT dumping_reports_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES public.illegal_dumping_mobile(id)
);
CREATE TABLE public.fee_points (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  points integer NOT NULL,
  request_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fee_points_pkey PRIMARY KEY (id),
  CONSTRAINT fee_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.illegal_dumping (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reported_by uuid,
  assigned_to uuid,
  location USER-DEFINED,
  address text,
  description text,
  waste_type text,
  severity text DEFAULT 'medium'::text,
  status text DEFAULT 'Reported'::text,
  images ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  estimated_volume numeric,
  latitude numeric,
  longitude numeric,
  location_address text,
  CONSTRAINT illegal_dumping_pkey PRIMARY KEY (id),
  CONSTRAINT illegal_dumping_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id),
  CONSTRAINT illegal_dumping_reported_by_profiles_fkey FOREIGN KEY (reported_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.illegal_dumping_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  report_id uuid,
  previous_status text,
  new_status text,
  changed_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT illegal_dumping_history_pkey PRIMARY KEY (id),
  CONSTRAINT illegal_dumping_history_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.illegal_dumping(id),
  CONSTRAINT illegal_dumping_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.illegal_dumping_history_mobile (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  dumping_id uuid NOT NULL,
  status text NOT NULL,
  notes text,
  updated_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT illegal_dumping_history_mobile_pkey PRIMARY KEY (id),
  CONSTRAINT illegal_dumping_history_mobile_dumping_id_fkey FOREIGN KEY (dumping_id) REFERENCES public.illegal_dumping_mobile(id),
  CONSTRAINT illegal_dumping_history_mobile_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);
CREATE TABLE public.illegal_dumping_mobile (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  reported_by uuid NOT NULL,
  location text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  waste_type text NOT NULL DEFAULT 'mixed'::text,
  severity text NOT NULL DEFAULT 'medium'::text CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  size text NOT NULL DEFAULT 'medium'::text CHECK (size = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text])),
  photos ARRAY DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'in_progress'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  latitude numeric,
  longitude numeric,
  assigned_to uuid,
  location_hash text,
  idempotency_token text,
  submission_fingerprint text,
  disposed_at timestamp with time zone,
  disposal_site_id text,
  disposal_site_name text,
  cleanup_fee numeric,
  CONSTRAINT illegal_dumping_mobile_pkey PRIMARY KEY (id),
  CONSTRAINT illegal_dumping_mobile_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.collector_profiles(id),
  CONSTRAINT illegal_dumping_mobile_disposal_site_id_fkey FOREIGN KEY (disposal_site_id) REFERENCES public.disposal_centers(id)
);
CREATE TABLE public.locations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  location_name text NOT NULL,
  address text NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  is_default boolean DEFAULT false,
  location_type text DEFAULT 'home'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT locations_pkey PRIMARY KEY (id),
  CONSTRAINT locations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.log_count (
  count bigint
);
CREATE TABLE public.logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  level character varying NOT NULL DEFAULT 'info'::character varying CHECK (level::text = ANY (ARRAY['debug'::character varying, 'info'::character varying, 'warn'::character varying, 'error'::character varying, 'critical'::character varying]::text[])),
  source character varying,
  message text NOT NULL,
  data jsonb,
  user_id uuid,
  session_id character varying,
  ip_address inet,
  user_agent text,
  request_id character varying,
  module character varying,
  function_name character varying,
  line_number integer,
  stack_trace text,
  execution_time numeric,
  memory_usage bigint,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT logs_pkey PRIMARY KEY (id),
  CONSTRAINT logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.message_count (
  count bigint
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid,
  recipient_id uuid,
  subject text,
  content text NOT NULL,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id),
  CONSTRAINT messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id)
);
CREATE TABLE public.notification_count (
  count bigint
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  message text,
  type text DEFAULT 'info'::text,
  read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.payment_methods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['credit_card'::text, 'bank_account'::text, 'mobile_money'::text])),
  provider text NOT NULL,
  is_default boolean DEFAULT false,
  details jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id),
  CONSTRAINT payment_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.pickup_requests (
  id text NOT NULL,
  location text NOT NULL CHECK (location IS NULL OR location ~ '^POINT\(\-?\d+(\.\d+)? \-?\d+(\.\d+)?\)$'::text),
  coordinates USER-DEFINED NOT NULL,
  fee integer NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['pending'::text, 'available'::text, 'accepted'::text, 'en_route'::text, 'arrived'::text, 'collecting'::text, 'completed'::text, 'disposed'::text, 'cancelled'::text, 'canceled'::text, 'expired'::text])),
  collector_id uuid,
  accepted_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  disposed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  waste_type text,
  bag_count bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  special_instructions text,
  scheduled_date timestamp with time zone,
  preferred_time text,
  points_earned integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  payment_method_id uuid,
  payment_type text CHECK (payment_type = ANY (ARRAY['prepaid'::text, 'postpaid'::text])),
  priority text,
  reserved_by uuid,
  reserved_at timestamp with time zone,
  reserved_until timestamp with time zone,
  exclusion_until timestamp with time zone,
  assignment_expires_at timestamp with time zone,
  filter_criteria jsonb,
  last_pool_entry timestamp with time zone DEFAULT now(),
  reservation_expires_at timestamp with time zone,
  estimated_volume numeric,
  assigned_to uuid,
  service_area_id uuid,
  user_id uuid,
  address text,
  bag_id uuid,
  batch_id uuid,
  collector_core_payout numeric DEFAULT NULL::numeric,
  collector_urgent_payout numeric DEFAULT NULL::numeric,
  collector_distance_payout numeric DEFAULT NULL::numeric,
  collector_surge_payout numeric DEFAULT NULL::numeric,
  collector_tips numeric DEFAULT NULL::numeric,
  collector_recyclables_payout numeric DEFAULT NULL::numeric,
  collector_loyalty_cashback numeric DEFAULT NULL::numeric,
  collector_total_payout numeric DEFAULT NULL::numeric,
  platform_share numeric DEFAULT NULL::numeric,
  payout_breakdown jsonb,
  CONSTRAINT pickup_requests_pkey PRIMARY KEY (id),
  CONSTRAINT pickup_requests_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.collector_profiles(id),
  CONSTRAINT pickup_requests_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.batches(id),
  CONSTRAINT pickup_requests_payment_method_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id),
  CONSTRAINT pickup_requests_reserved_by_fkey FOREIGN KEY (reserved_by) REFERENCES auth.users(id),
  CONSTRAINT pickup_requests_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id),
  CONSTRAINT pickup_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT pickup_requests_bag_id_fkey FOREIGN KEY (bag_id) REFERENCES public.bags(id)
);
CREATE TABLE public.pricing_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  country character varying NOT NULL DEFAULT 'Ghana'::character varying,
  region character varying NOT NULL,
  district character varying NOT NULL,
  community character varying NOT NULL,
  suburb character varying NOT NULL,
  latitude numeric,
  longitude numeric,
  price_50l numeric NOT NULL,
  price_60l numeric NOT NULL,
  price_80l numeric NOT NULL,
  price_90l numeric NOT NULL,
  price_100l numeric NOT NULL,
  price_120l numeric NOT NULL,
  price_240l numeric NOT NULL,
  price_260l numeric NOT NULL,
  price_320l numeric NOT NULL,
  price_340l numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  price_360l numeric,
  price_660l numeric,
  price_1100l numeric,
  CONSTRAINT pricing_zones_pkey PRIMARY KEY (id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  address text,
  avatar_url text,
  dark_mode boolean DEFAULT false,
  language text DEFAULT 'en'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  points integer DEFAULT 0,
  level text DEFAULT 'Eco Starter'::text,
  phone_verified boolean DEFAULT false,
  notification_preferences jsonb DEFAULT '{"push": true, "email": true}'::jsonb,
  role text DEFAULT 'user'::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.promotional_fee_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bin_size_liters integer NOT NULL,
  client_fee numeric NOT NULL,
  collector_payout numeric NOT NULL,
  platform_subsidy numeric DEFAULT (collector_payout - client_fee),
  max_requests integer NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promotional_fee_schedule_pkey PRIMARY KEY (id)
);
CREATE TABLE public.promotional_pricing (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  digital_bin_id uuid,
  bin_size_liters integer NOT NULL,
  client_fee numeric NOT NULL,
  collector_payout numeric NOT NULL,
  platform_subsidy numeric NOT NULL,
  request_number integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promotional_pricing_pkey PRIMARY KEY (id),
  CONSTRAINT promotional_pricing_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT promotional_pricing_digital_bin_id_fkey FOREIGN KEY (digital_bin_id) REFERENCES public.digital_bins(id)
);
CREATE TABLE public.promotional_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  max_requests integer NOT NULL DEFAULT 5,
  used_count integer NOT NULL DEFAULT 0,
  is_eligible boolean DEFAULT (used_count < max_requests),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT promotional_usage_pkey PRIMARY KEY (id),
  CONSTRAINT promotional_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.reward_redemptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  points_used integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  redemption_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reward_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT reward_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id),
  CONSTRAINT reward_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.rewards (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text NOT NULL,
  points_cost integer NOT NULL,
  category text NOT NULL,
  image_url text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rewards_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rewards_redemption (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  reward_id uuid NOT NULL,
  points_spent integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  fulfilled_at timestamp with time zone,
  CONSTRAINT rewards_redemption_pkey PRIMARY KEY (id),
  CONSTRAINT rewards_redemption_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id),
  CONSTRAINT rewards_redemption_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.scan_count (
  count bigint
);
CREATE TABLE public.scans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bag_id uuid,
  collector_id uuid,
  location USER-DEFINED,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT scans_pkey PRIMARY KEY (id),
  CONSTRAINT scans_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collector_profiles(id),
  CONSTRAINT scans_bag_id_fkey FOREIGN KEY (bag_id) REFERENCES public.bags(id)
);
CREATE TABLE public.scheduled_pickups (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  location_id uuid NOT NULL,
  schedule_type text NOT NULL,
  waste_type text NOT NULL,
  bag_count integer NOT NULL,
  pickup_date timestamp with time zone NOT NULL,
  preferred_time text NOT NULL,
  special_instructions text,
  status text NOT NULL DEFAULT 'scheduled'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  frequency text NOT NULL DEFAULT 'weekly'::text CHECK (frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])),
  address text,
  CONSTRAINT scheduled_pickups_pkey PRIMARY KEY (id),
  CONSTRAINT scheduled_pickups_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id),
  CONSTRAINT scheduled_pickups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.service_area_count (
  count bigint
);
CREATE TABLE public.service_areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  color character varying DEFAULT '#3B82F6'::character varying,
  coordinates jsonb,
  bounds jsonb,
  active_collectors integer DEFAULT 0,
  total_collectors integer DEFAULT 0,
  total_requests integer DEFAULT 0,
  pending_requests integer DEFAULT 0,
  completion_rate numeric DEFAULT 0.00,
  coverage_area numeric,
  population integer,
  region character varying,
  district character varying,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT service_areas_pkey PRIMARY KEY (id)
);
CREATE TABLE public.spatial_ref_sys (
  srid integer NOT NULL CHECK (srid > 0 AND srid <= 998999),
  auth_name character varying,
  auth_srid integer,
  srtext character varying,
  proj4text character varying,
  CONSTRAINT spatial_ref_sys_pkey PRIMARY KEY (srid)
);
CREATE TABLE public.user_activity (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,
  description text NOT NULL,
  related_id uuid,
  points_impact integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_activity_pkey PRIMARY KEY (id),
  CONSTRAINT user_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_levels (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL,
  points_threshold integer NOT NULL,
  benefits ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_levels_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_stats (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  total_bags integer CHECK (total_bags >= 0),
  total_bags_scanned integer DEFAULT 0,
  available_bags integer DEFAULT 0,
  total_batches integer,
  completed_requests_count integer NOT NULL DEFAULT 0 CHECK (completed_requests_count >= 0),
  CONSTRAINT user_stats_pkey PRIMARY KEY (id),
  CONSTRAINT user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.waste_item_count (
  count bigint
);
CREATE TABLE public.waste_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['plastic'::character varying, 'paper'::character varying, 'glass'::character varying, 'metal'::character varying, 'organic'::character varying, 'electronic'::character varying, 'hazardous'::character varying, 'mixed'::character varying, 'recyclable'::character varying, 'general'::character varying]::text[])),
  weight numeric,
  volume numeric,
  unit character varying DEFAULT 'kg'::character varying CHECK (unit::text = ANY (ARRAY['kg'::character varying, 'lbs'::character varying, 'tons'::character varying, 'liters'::character varying, 'm3'::character varying]::text[])),
  pickup_request_id text,
  batch_id uuid,
  collector_id uuid,
  location text,
  coordinates jsonb,
  status character varying DEFAULT 'collected'::character varying CHECK (status::text = ANY (ARRAY['collected'::character varying, 'sorted'::character varying, 'disposed'::character varying, 'recycled'::character varying, 'processed'::character varying]::text[])),
  notes text,
  photos jsonb,
  environmental_impact_score integer CHECK (environmental_impact_score >= 0 AND environmental_impact_score <= 100),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT waste_items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.withdrawal_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  withdrawal_id uuid NOT NULL,
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['digital_bin'::text, 'pickup_request'::text])),
  item_id text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0::numeric),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT withdrawal_items_pkey PRIMARY KEY (id),
  CONSTRAINT withdrawal_items_withdrawal_fkey FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id)
);
CREATE TABLE public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  collector_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'cancelled'::character varying]::text[])),
  payment_method character varying NOT NULL DEFAULT 'mobile_money'::character varying CHECK (payment_method::text = ANY (ARRAY['mobile_money'::character varying, 'bank_transfer'::character varying]::text[])),
  payment_details jsonb DEFAULT '{}'::jsonb,
  phone_number character varying,
  network character varying CHECK (network::text = ANY (ARRAY['MTN'::character varying, 'VODAFONE'::character varying, 'AIRTELTIGO'::character varying, NULL::character varying]::text[])),
  gateway_transaction_id text,
  gateway_response jsonb,
  gateway_error text,
  requested_at timestamp with time zone DEFAULT now(),
  processed_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT withdrawals_pkey PRIMARY KEY (id),
  CONSTRAINT withdrawals_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id)
);