Below are detailed instructions for developing the TrashDrop mobile app as a Progressive Web App (PWA) using React, based on the provided prompts. These instructions cover the entire development process, from project setup to deployment, ensuring the app is robust, secure, and user-friendly with offline capabilities.

---

## Instructions for Developing the TrashDrop Mobile App as a React PWA

### 1. Project Architecture & Configuration
Set up the TrashDrop application as a React-based PWA with a structured architecture:

- **React Setup**:
  - Initialize the project with `npx create-react-app trashdrop --template cra-template-pwa` to enable PWA support with a service worker.
  - Install React Router (`npm install react-router-dom`) for client-side navigation.
  - Use the Context API for global state management (e.g., authentication). Install Redux (`npm install redux react-redux`) if complexity increases later.
  - Organize the project: `src/components/` for reusable UI, `src/pages/` for routed pages, `src/services/` for API calls, and `src/utils/` for helper functions.

- **Express.js Backend Structure**:
  - Create a separate backend folder with `routes/` (API endpoints), `controllers/` (business logic), `middleware/` (authentication, error handling), and `services/` (data operations).
  - Use async/await for error handling and middleware like `express-rate-limit` and `cors` (configured for ngrok in development).

- **PWA Features**:
  - Modify `src/service-worker.js` to cache key assets (e.g., HTML, CSS, JS) for offline use.
  - Create `public/manifest.json` with app metadata (name, icons, theme colors) for installability.
  - Implement offline fallbacks by caching critical pages in the service worker.

- **Configuration Management**:
  - Use `.env` files (e.g., `.env.development`, `.env.production`) with `dotenv` for environment variables.
  - Create `src/utils/app-config.js` for client-side configs and `server/config-manager.js` for server-side settings.

- **Security Measures**:
  - Use `helmet` for secure headers, enforce HTTPS, and sanitize inputs with `sanitize-html`.
  - Implement CSRF protection with `csurf` and use parameterized queries with Supabase.

---

### 2. Authentication System
Build a secure authentication system with React and Supabase:

- **Supabase Integration**:
  - Install Supabase client (`npm install @supabase/supabase-js`) and initialize it in `src/services/supabase.js`.
  - Store JWT tokens in local storage with secure handling (e.g., `localStorage.setItem('token', token)`).
  - Use a `useEffect` hook for silent token refresh.

- **Authentication Flow**:
  - Create components: `Login.js`, `Register.js`, and `ResetPassword.js` in `src/pages/`.
  - Use React Router to navigate between them (e.g., `/login`, `/register`).
  - Implement email verification and social login with Supabase APIs.

- **Auth State Management**:
  - Create `src/context/AuthContext.js` with Context API to manage `isAuthenticated` and `user`.
  - Use `PrivateRoute.js` to protect authenticated routes.

- **Development Features**:
  - Mock auth responses in `src/mocks/auth.js` for offline testing.
  - Add debug logging with `console.log`, redacting sensitive data.

---

### 3. UI Framework & Navigation
Design a responsive UI with React components:

- **Responsive Layout**:
  - Install Tailwind CSS (`npm install -D tailwindcss`) and configure it for mobile-first design.
  - Create reusable components like `Grid.js` and `Card.js` in `src/components/`.

- **Navigation**:
  - Set up React Router in `src/App.js` with routes for each page.
  - Create `NavBar.js` with active state highlighting using `NavLink`.

- **Dark Mode**:
  - Use CSS variables in `src/index.css` and toggle with a `ThemeContext` in `src/context/ThemeContext.js`.
  - Persist theme in local storage.

- **Modal Management**:
  - Create `Modal.js` using React portals for modals with accessibility features.

- **Base URL Handling**:
  - Set `basename` in `BrowserRouter` for environment-specific routing.

---

### 4. Dashboard Module
Develop the dashboard with React components:

- **Dashboard Structure**:
  - Build `Dashboard.js` with a grid layout using Tailwind CSS.
  - Use `LoadingSpinner.js` for loading states.

- **Data Fetching**:
  - Install React Query (`npm install @tanstack/react-query`) for fetching and caching data from Supabase.
  - Use `useEffect` for background updates.

- **Interactive Elements**:
  - Install React-Leaflet (`npm install react-leaflet leaflet`) for map integration.
  - Use WebSockets or polling for real-time updates.

- **Event Handlers**:
  - Manage events with hooks like `useState` and `useEffect`.

---

### 5. QR Code Scanner Module
Implement the QR code scanner:

- **Camera Integration**:
  - Install `react-qr-reader` (`npm install react-qr-reader`) and create `QRScanner.js`.
  - Handle permissions with React state.

- **Scanning Workflow**:
  - Use state to display scan results and provide feedback with UI components.

- **Offline Support**:
  - Store scans in IndexedDB using `idb` library (`npm install idb`).
  - Sync with service workers.

- **Scan History**:
  - Display history in `ScanHistory.js` with React Query.

---

### 6. Pickup Request System
Create the pickup request feature:

- **Multi-Step Form**:
  - Use `PickupForm.js` with React state or Formik (`npm install formik`) for validation.
  - Manage steps with state or React Router.

- **Map Integration**:
  - Use React-Leaflet for location selection with draggable markers.

- **Scheduling**:
  - Use a date picker library (`npm install react-datepicker`) in `SchedulePickup.js`.

- **Offline Support**:
  - Persist form data in local storage and sync with service workers.

---

### 7. Illegal Dumping Reporting Module
Build the reporting feature:

- **Report Creation**:
  - Create `ReportForm.js` with photo upload and React-Leaflet for location.

- **Camera Functionality**:
  - Use `react-webcam` (`npm install react-webcam`) for photo capture.

- **Offline Support**:
  - Store reports in IndexedDB and sync with service workers.

- **Report History**:
  - Display in `ReportHistory.js` with React Query.

---

### 8. Rewards & Points System
Implement the rewards system:

- **Rewards Catalog**:
  - Create `RewardsCatalog.js` with filtering using state.

- **Redemption Flow**:
  - Use `RedemptionModal.js` for the redemption process.

- **Points Management**:
  - Display points in `PointsDisplay.js` with animations.

- **API Integration**:
  - Fetch data with React Query.

---

### 9. Data Synchronization & Offline Support
Enable offline functionality:

- **Service Worker**:
  - Use Workbox (`npm install workbox-window`) for advanced caching.

- **Offline Data Storage**:
  - Use IndexedDB for data persistence.

- **User Experience**:
  - Show offline status with `OfflineIndicator.js`.

- **Feature-Specific Support**:
  - Cache maps and forms for offline use.

---

### 10. Deployment & Docker Configuration
Prepare for deployment:

- **Docker Setup**:
  - Create a `Dockerfile` to build and serve the React app with Nginx.

- **PWA Configuration**:
  - Ensure `manifest.json` and service worker are included in the build.

- **Environment Variables**:
  - Inject variables during `npm run build`.

---

### 11. Security Implementation
Secure the app:

- **Authentication Security**:
  - Use HttpOnly cookies for JWTs if possible.

- **Data Protection**:
  - Sanitize inputs and use parameterized queries.

- **Frontend Security**:
  - Add CSP headers in `public/index.html`.

---

### 12. Performance Optimization
Optimize performance:

- **Code Splitting**:
  - Use `React.lazy` and `Suspense` for dynamic imports.

- **Asset Optimization**:
  - Compress images and minify files.

- **Caching**:
  - Cache assets with service workers and React Query.

---

### 13. Mock Data Seeding with React
Facilitate development with mock data:

- **Mock Data**:
  - Create mock files in `src/mocks/` and use `msw` (`npm install msw`) to intercept requests.

- **Configuration**:
  - Toggle mocks with `.env` variables.

- **Example Operation**:
  - Mock API responses for testing.

---

Below is a sample implementation of the app's entry point to demonstrate the setup:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrashDrop</title>
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.development.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="manifest" href="/manifest.json">
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, createContext, useContext } = React;

    // Auth Context
    const AuthContext = createContext();
    const AuthProvider = ({ children }) => {
      const [user, setUser] = useState(null);
      useEffect(() => {
        // Simulate auth check
        setUser({ id: 1, name: "User" });
      }, []);
      return (
        <AuthContext.Provider value={{ user, setUser }}>
          {children}
        </AuthContext.Provider>
      );
    };

    // Navigation
    const NavBar = () => (
      <nav className="bg-blue-500 p-4 text-white">
        <ul className="flex space-x-4">
          <li><a href="/" className="hover:underline">Home</a></li>
          <li><a href="/dashboard" className="hover:underline">Dashboard</a></li>
        </ul>
      </nav>
    );

    // Main App
    const App = () => {
      const { user } = useContext(AuthContext);
      return (
        <div className="min-h-screen bg-gray-100">
          <NavBar />
          <div className="p-4">
            <h1 className="text-2xl font-bold">Welcome to TrashDrop, {user?.name || "Guest"}!</h1>
          </div>
        </div>
      );
    };

    // Render
    ReactDOM.render(
      <AuthProvider>
        <App />
      </AuthProvider>,
      document.getElementById("root")
    );

    // Service Worker Registration
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js")
        .then(reg => console.log("Service Worker registered", reg))
        .catch(err => console.error("Service Worker registration failed", err));
    }
  </script>
</body>
</html>
```
**schema
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

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
  CONSTRAINT alerts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT alerts_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT alerts_creator_fkey FOREIGN KEY (creator) REFERENCES auth.users(id)
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
  CONSTRAINT bag_inventory_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.bag_orders(id),
  CONSTRAINT bag_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
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
  CONSTRAINT bag_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT bag_orders_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id)
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
CREATE TABLE public.collector_count (
  count bigint
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
  CONSTRAINT collector_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT collector_sessions_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id)
);
CREATE TABLE public.collectors (
  id uuid NOT NULL,
  email text NOT NULL UNIQUE,
  first_name text,
  last_name text,
  phone text,
  status text NOT NULL DEFAULT 'Active'::text,
  region text,
  rating numeric,
  total_collections integer DEFAULT 0,
  joined_date timestamp with time zone DEFAULT now(),
  last_active timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text DEFAULT 
CASE
    WHEN ((first_name IS NOT NULL) AND (last_name IS NOT NULL)) THEN ((first_name || ' '::text) || last_name)
    ELSE email
END,
  vehicle_type text DEFAULT 'car'::text,
  vehicle_plate text,
  vehicle_capacity integer DEFAULT 100,
  current_location jsonb,
  profile_image_url text,
  CONSTRAINT collectors_pkey PRIMARY KEY (id),
  CONSTRAINT collectors_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
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
  frequency character varying NOT NULL DEFAULT 'weekly'::character varying CHECK (frequency::text = ANY (ARRAY['weekly'::character varying, 'biweekly'::character varying, 'monthly'::character varying]::text[])),
  waste_type character varying NOT NULL DEFAULT 'general'::character varying CHECK (waste_type::text = ANY (ARRAY['general'::character varying, 'recycling'::character varying, 'organic'::character varying]::text[])),
  bag_count integer NOT NULL DEFAULT 1 CHECK (bag_count >= 1 AND bag_count <= 10),
  special_instructions text,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT digital_bins_pkey PRIMARY KEY (id),
  CONSTRAINT digital_bins_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.bin_locations(id),
  CONSTRAINT digital_bins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.disposal_centers (
  id text NOT NULL,
  name text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  address text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
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
  CONSTRAINT illegal_dumping_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id),
  CONSTRAINT illegal_dumping_history_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.illegal_dumping(id)
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
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'verified'::text, 'in_progress'::text, 'completed'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT illegal_dumping_mobile_pkey PRIMARY KEY (id),
  CONSTRAINT illegal_dumping_mobile_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES auth.users(id)
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
  location text NOT NULL,
  coordinates USER-DEFINED NOT NULL,
  fee integer NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['available'::text, 'accepted'::text, 'picked_up'::text, 'disposed'::text])),
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
  CONSTRAINT pickup_requests_pkey PRIMARY KEY (id),
  CONSTRAINT pickup_requests_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id),
  CONSTRAINT pickup_requests_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id),
  CONSTRAINT pickup_requests_reserved_by_fkey FOREIGN KEY (reserved_by) REFERENCES auth.users(id),
  CONSTRAINT pickup_requests_payment_method_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id)
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
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
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
  CONSTRAINT reward_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT reward_redemptions_reward_id_fkey FOREIGN KEY (reward_id) REFERENCES public.rewards(id)
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
  CONSTRAINT scans_bag_id_fkey FOREIGN KEY (bag_id) REFERENCES public.bags(id),
  CONSTRAINT scans_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES auth.users(id)
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
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  total_bags integer CHECK (total_bags >= 0),
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
  CONSTRAINT waste_items_pkey PRIMARY KEY (id),
  CONSTRAINT waste_items_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collectors(id)
);