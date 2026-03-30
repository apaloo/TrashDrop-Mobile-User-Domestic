# TrashDrop FAQ - How It Works

## 🗑️ What is TrashDrop?

TrashDrop is a comprehensive waste management platform that connects users with waste collectors through a mobile-first Progressive Web App (PWA). The system uses a dual approach: QR-coded bags for prepaid collections and digital bins for instant paid pickups, all managed through a unified dashboard with real-time tracking.

---

## 🚀 How Does TrashDrop Work? (Complete End-to-End Process Flow)

### **System Architecture Overview**

```
User Registration → Onboarding Engine → Service Selection → Database Storage
      ↓                    ↓                ↓                ↓
  Location Setup    →   State Machine   →   Payment Flow   →   Real-time Updates
      ↓                    ↓                ↓                ↓
  Pickup Request   →   Collector Match →   Status Tracking →   Points System
      ↓                    ↓                ↓                ↓
  Route Optimization → Waste Collection → Data Analytics → Rewards Redemption
```

### **Step 1: User Onboarding & State Management**

#### **Automated Onboarding Flow**
- **Entry Detection**: System checks `user_stats` table for `available_bags = 0 AND total_bags_scanned = 0`
- **State Engine**: Uses `get_user_onboarding_state()` RPC function to determine user state:
  - `NEW_USER`: No activity, starts at welcome step
  - `LOCATION_SET`: Has location data, proceeds to service selection
  - `READY_FOR_PICKUP`: Has bags and locations, ready for pickup requests

#### **Progressive Onboarding Steps**
1. **Welcome Step**: User selects bag ownership ("Yes, I have bags" or "No, I don't have bags")
2. **Location Capture**: GPS-based location with manual fallback using `locationService.js`
3. **Service Branching**:
   - **Has Bags**: QR code scanning → Bag inventory management
   - **No Bags**: Digital bin creation → Payment processing

### **Step 2: Service Type Selection & Setup**

#### **Option A: QR Bag System (Prepaid Collections)**
```
Purchase Bags → Scan QR Code → Update Inventory → Request Pickup
      ↓                ↓                ↓                ↓
  Batch Activation   →   Bag Count   →   User Stats   →   Queue System
      ↓                ↓                ↓                ↓
  Database Update   →   RPC Call    →   Available Bags →  Collector Dispatch
```

**Technical Implementation:**
- **Batch Service**: `batchService.js` manages QR code verification and inventory
- **Database Tables**: `batches`, `bags`, `user_stats`, `bag_inventory`
- **RPC Functions**: `process_qr_scan()`, `get_user_onboarding_state()`
- **Inventory Tracking**: Real-time bag count updates in `user_stats.available_bags`

#### **Option B: Digital Bin System (Instant Paid Collections)**
```
Bin Configuration → Cost Calculation → Payment Processing → Bin Creation
      ↓                ↓                ↓                ↓
  Location Setup   →   GPS Pricing  →   Payment Method →   Database Entry
      ↓                ↓                ↓                ↓
  Waste Details    →   Quote API    →   Transaction   →   Collector Assignment
```

**Technical Implementation:**
- **Cost Calculator**: `costCalculator.js` with GPS-based pricing zones
- **Database Tables**: `digital_bins`, `bin_locations`, `payment_methods`
- **Pricing Logic**: Base cost → GPS zone → Distance → Urgency → Taxes
- **Payment Service**: `paymentService.js` handles multiple payment methods

#### **Option C: Illegal Dumping Reports**
```
Report Creation → Photo Upload → Location Capture → Points Award
      ↓                ↓                ↓                ↓
  Form Validation →   Cloud Storage →   Reverse Geocode →   User Stats
      ↓                ↓                ↓                ↓
  Database Entry   →   Image URLs   →   Address Data   →   Community Impact
```

**Technical Implementation:**
- **Dumping Service**: `dumpingService.js` manages report lifecycle
- **Photo Upload**: `photoUploadService.js` handles image storage
- **Geocoding**: OpenStreetMap API for address resolution
- **Points System**: Automatic reward calculation based on severity

### **Step 3: Pickup Request & Collection Process**

#### **Request Flow Architecture**
```
User Request → Validation → Database Insert → Collector Assignment → Real-time Tracking
      ↓              ↓              ↓                    ↓                    ↓
  Form Data     →   Bag Count   →   pickup_requests   →   Notification   →   WebSocket Updates
      ↓              ↓              ↓                    ↓                    ↓
  Location      →   Available   →   Status Engine     →   Route Optimize  →   GPS Tracking
```

**Technical Components:**
- **Pickup Service**: `pickupService.js` manages all pickup operations
- **Status Engine**: `statusService.js` with 7-state flow management
- **Real-time Updates**: WebSocket subscriptions via `realtime.js`
- **Location Tracking**: GPS coordinates with PostGIS geometry

#### **Status Flow Management**
```javascript
// Unified status states with transitions
PENDING → ACCEPTED → EN_ROUTE → ARRIVED → COLLECTING → COMPLETED
   ↓         ↓          ↓          ↓           ↓           ↓
 Cancel   Cancel    Cancel    Cancel      Cancel     Terminal
```

**Status Implementation:**
- **Database**: `pickup_requests` and `digital_bins` tables with unified status enum
- **Validation**: `validate_status_transition()` function prevents invalid state changes
- **Notifications**: Context-aware alerts via `smartNotificationService.js`
- **UI Updates**: Real-time status indicators with progress bars

### **Step 4: Real-time Tracking & Collection**

#### **GPS Tracking System**
```
Collector Location → WebSocket Broadcast → Client Updates → Map Display
      ↓                    ↓                    ↓                ↓
  GPS Coordinates   →   Real-time Data   →   UI Rendering   →   ETA Calculation
      ↓                    ↓                    ↓                ↓
  Route Optimization →   Distance Calc   →   Status Update  →   User Notifications
```

**Technical Implementation:**
- **Collector Tracking**: `CollectorTracking.js` with real-time GPS updates
- **Map Integration**: Leaflet.js with custom markers and route visualization
- **ETA Calculation**: Distance-based time estimates with traffic considerations
- **Throttling**: 15-second update intervals to prevent bouncing

#### **Collection Completion Flow**
```
Waste Collected → Status Update → Points Award → Rating System → Data Analytics
      ↓                ↓                ↓                ↓                ↓
  Collector Scan   →   Database    →   User Stats   →   Feedback Form   →   Performance Metrics
      ↓                ↓                ↓                ↓                ↓
  Verification     →   Notification →   Rewards     →   Quality Control →   Route Optimization
```

---

## 💳 Payment & Pricing System

### **Dynamic Pricing Architecture**

#### **GPS-Based Pricing (v4.5.7)**
```
Location Detection → Zone Lookup → Base Rate → Distance Calculation → Final Price
      ↓                ↓              ↓              ↓                    ↓
  Coordinates       →   Pricing     →   Size Cost   →   Distance Fee     →   Total + Tax
      ↓                ↓              ↓              ↓                    ↓
  GPS Service       →   Database    →   Calculator  →   Rate Multiplier  →   Payment Processing
```

**Pricing Formula:**
```
Base Cost (GPS Zone) 
→ Frequency Discount (optional) 
→ Waste Type Adjustment (optional) 
→ Urgent Surcharge (30% of Base) 
→ Distance Fee (>5km for urgent only) 
→ Request Fee (₵1) 
→ Taxes (VAT)
```

#### **Payment Processing Flow**
```
Payment Method Selection → Validation → Transaction → Confirmation → Database Update
      ↓                        ↓              ↓              ↓                    ↓
  Payment Service           →   Security    →   Gateway     →   Receipt         →   Order Status
      ↓                        ↓              ↓              ↓                    ↓
  Encryption                 →   3D Secure   →   Processing  →   Email/SMS       →   Real-time Update
```

**Payment Methods:**
- Mobile money integration
- Credit/debit cards with 3D Secure
- Wallet system for rewards points
- Corporate billing for business accounts

---

## 📱 App Architecture & Features

### **Core Technical Stack**
- **Frontend**: React.js PWA with service workers
- **Backend**: Supabase (PostgreSQL + Real-time)
- **Maps**: Leaflet.js with OpenStreetMap
- **Payments**: Stripe + Mobile money APIs
- **Notifications**: Push notifications with toast service

### **Smart Features Implementation**

#### **Offline Mode**
```
Online Detection → Data Caching → Offline Queue → Sync on Reconnect
      ↓                ↓              ↓                    ↓
  Network Service   →   Local Storage →   Action Queue   →   Batch Processing
      ↓                ↓              ↓                    ↓
  Status Updates     →   User Data   →   Deferred Actions →   Conflict Resolution
```

#### **Progressive Location Service**
```
GPS Attempt → Network Fallback → Manual Input → Confidence Indicator
      ↓              ↓                ↓                    ↓
  High Accuracy   →   Cell Tower   →   Pin Placement   →   Visual Feedback
      ↓              ↓                ↓                    ↓
  Coordinates      →   Approx Area  →   User Adjusted   →   Quality Score
```

#### **Adaptive Update System**
```
Connection Quality → Update Frequency → Battery Optimization → Data Usage
      ↓                    ↓                    ↓                    ↓
  Network Monitor   →   Smart Throttle →   Power Management  →   Data Compression
      ↓                    ↓                    ↓                    ↓
  Real-time Mode    →   Batch Updates  →   Background Sync   →   Cost Optimization
```

---

## 🗄️ Database Architecture

### **Core Tables & Relationships**

```
auth.users (Authentication)
    ↓
user_stats (User State & Inventory)
    ↓
├── locations (Pickup Locations)
├── pickup_requests (One-time Pickups)
├── digital_bins (Recurring Service)
├── batches (QR Code Management)
├── bag_inventory (Bag Tracking)
└── dumping_reports (Community Reports)
```

### **Key Database Functions**

#### **RPC Functions**
- `get_user_onboarding_state()`: Determines user progress
- `process_qr_scan()`: Validates and activates bag batches
- `create_digital_bin()`: Creates recurring service
- `get_request_coordinates_wkt()`: Fetches location data
- `validate_status_transition()`: Ensures proper state flow

#### **Real-time Subscriptions**
- Pickup status updates
- Collector location tracking
- User statistics changes
- Notification delivery

---

## 🎯 User State Management

### **State Machine Implementation**
```javascript
// User progression states with database triggers
NEW_USER → LOCATION_SET → BAGS_READY → QR_SCANNED → READY_FOR_PICKUP → ACTIVE_USER
```

**State Transitions:**
- **NEW_USER**: Just registered, no activity
- **LOCATION_SET**: Added pickup location via `bin_locations` table
- **BAGS_READY**: Purchased and scanned QR codes
- **QR_SCANNED**: Bag inventory updated in `user_stats`
- **READY_FOR_PICKUP**: Has both location and bags
- **ACTIVE_USER**: Regular pickup requests and activity

### **Progress Tracking**
- **Milestone System**: Tracks completion of each onboarding step
- **Progress Persistence**: Database ensures state survives app restarts
- **Resume Capability**: Users can continue from any completed step
- **Force Override**: Testing parameter `?force=true` for debugging

---

## 🏆 Rewards & Gamification

### **Points System Architecture**
```
Action Completion → Points Calculation → Database Update → Leaderboard → Redemption
      ↓                    ↓                    ↓                    ↓            ↓
  Event Trigger     →   Point Rules   →   User Stats     →   Ranking    →   Reward Store
```

**Point Earning Mechanics:**
- **Successful Pickup**: Base points + distance bonus
- **Reporting Dumping**: Severity-based points (small/medium/large)
- **Referrals**: Bonus points for new user acquisition
- **Consistency**: Multiplier for regular users
- **Quality**: Extra points for proper waste segregation

### **Redemption System**
- **Discount Vouchers**: Percentage off future pickups
- **Free Pickups**: Points converted to service credits
- **Partner Rewards**: Local business offers
- **Charity Donations**: Points converted to community projects

---

## 🛠️ Technical Troubleshooting

### **Common Technical Issues**

#### **Location Service Problems**
```
GPS Permission Denied → Manual Location Entry → Address Validation → Database Update
      ↓                        ↓                    ↓                    ↓
  Permission Check   →   Fallback UI    →   Geocoding API   →   Location Storage
```

**Solutions:**
- Enable location permissions in browser settings
- Use manual pin placement on map
- Verify address with geocoding service
- Check network connectivity for API calls

#### **QR Code Scanning Issues**
```
Camera Access → QR Detection → Validation → Database Update → Inventory Refresh
      ↓              ↓              ↓                    ↓                    ↓
  Permission     →   Scanner API   →   Batch Service   →   User Stats     →   UI Update
```

**Solutions:**
- Check camera permissions in browser
- Ensure good lighting conditions
- Verify QR code is from authorized vendor
- Clear browser cache and restart app

#### **Payment Processing Errors**
```
Payment Init → Validation → Gateway → Confirmation → Database Update
      ↓              ↓              ↓              ↓                    ↓
  Form Data     →   Security    →   Transaction  →   Receipt         →   Order Status
```

**Solutions:**
- Verify payment method details
- Check network connectivity
- Ensure sufficient funds
- Contact support for gateway issues

---

## 🌍 Environmental Impact & Analytics

### **Data Collection System**
```
Waste Collection → Sorting Data → Recycling Metrics → Environmental Impact → Reports
      ↓                ↓                    ↓                    ↓                    ↓
  Collection Data  →   Facility Scan →   Material Tracking →   Carbon Calculation  →   Analytics
```

**Environmental Metrics:**
- **Waste Diversion**: Tons diverted from landfills
- **Recycling Rates**: Percentage recycled vs. landfill
- **Carbon Footprint**: Emissions reduction calculations
- **Community Impact**: Illegal dumping reduction metrics

### **Analytics Dashboard**
- **User Behavior**: Service usage patterns
- **Operational Efficiency**: Route optimization metrics
- **Environmental Impact**: Sustainability KPIs
- **Financial Performance**: Revenue and cost analysis

---

## 🔮 Advanced Features & Future Roadmap

### **AI & Machine Learning Integration**
```
Historical Data → Pattern Recognition → Predictive Analytics → Route Optimization → Smart Dispatch
      ↓                    ↓                    ↓                    ↓                    ↓
  Big Data Store   →   ML Models     →   Demand Forecast  →   Efficiency Gain  →   Cost Reduction
```

**Planned Features:**
- **Predictive Demand**: Forecast pickup needs by area
- **Smart Routing**: AI-optimized collector routes
- **Waste Analytics**: Automated sorting recommendations
- **Dynamic Pricing**: Real-time price adjustments

### **IoT Integration Roadmap**
```
Smart Bins → Sensors → Real-time Data → Predictive Maintenance → Automated Collection
      ↓          ↓              ↓                    ↓                    ↓
  Hardware   →   IoT Network  →   Data Lake     →   Maintenance     →   Autonomous System
```

---

## 💡 System Optimization & Best Practices

### **Performance Optimization**
```
Code Splitting → Lazy Loading → Caching Strategy → Background Sync → Battery Optimization
      ↓              ↓              ↓                    ↓                    ↓
  Bundle Size   →   Component    →   Service Worker  →   Queue Manager   →   Power Management
```

### **Security Implementation**
```
Authentication → Authorization → Data Encryption → API Security → Privacy Protection
      ↓                ↓                    ↓                    ↓                    ↓
  JWT Tokens     →   RLS Policies  →   End-to-End     →   Rate Limiting  →   GDPR Compliance
```

### **Quality Assurance**
```
Unit Tests → Integration Tests → E2E Testing → Performance Tests → Security Tests
      ↓              ↓                    ↓                    ↓                    ↓
  Jest/React     →   API Testing   →   Cypress         →   Lighthouse     →   Pen Testing
```

---

*This comprehensive FAQ covers the complete end-to-end TrashDrop process flow, from user registration through waste collection to rewards redemption, with detailed technical implementation details for each system component.*
