# SLOTS Dashboard - Phase 0 Analysis Report

## Tech Stack Analysis

### Framework & Core Technologies
- **Framework**: Next.js 15.5.12 (App Router)
- **Language**: TypeScript 5.9.3
- **Styling**: Tailwind CSS 3.4.17 with custom CSS variables
- **State Management**: React hooks (useState, useEffect) + WebSocket for real-time updates
- **Animation**: Framer Motion 11.0.0 (already installed)
- **Map Library**: @react-google-maps/api 2.20.8
- **UI Components**: Radix UI primitives (shadcn/ui)
- **Database**: Prisma ORM with MySQL/better-sqlite3
- **Authentication**: NextAuth.js 4.24.13

### Styling Approach
- **Method**: Tailwind CSS with custom CSS variables for theming
- **Theme**: Dark theme with CSS custom properties in `globals.css`
- **Design System**: Already has basic color tokens defined as CSS variables
- **Component Library**: Uses shadcn/ui components as base

### Current Color System (from globals.css)
```css
--bg-void: #05060A;        /* Main background */
--bg-surface: #0D0F14;     /* Elevated surfaces */
--bg-card: #13131C;        /* Card surfaces */
--accent: #6C6CF4;         /* Primary indigo accent */
--status-available: #34D399;  /* Green */
--status-cancelled: #E5484D;  /* Red */
--status-completed: #C7C7DA;  /* Gray */
--status-upcoming: #6C6CF4;   /* Indigo */
--text-primary: #F7F8FA;   /* Main text */
--text-secondary: #9198A6; /* Secondary text */
--text-muted: #5C626E;     /* Muted text */
```

## Data Source Map (Value → Source)

### Dashboard Screen (/dashboard)

| Displayed Value | Source | Bug Status |
|----------------|--------|------------|
| **Total Parking** stat | `parkingAreas.length` (from API) | ✅ Correct |
| **Available** stat | `parkingAreas.filter(a => a.status === "available").length` | ❌ BUG: Uses status field, may not match actual available slots |
| **Total Spaces** stat | `parkingAreas.reduce((sum, a) => sum + a.totalSlots, 0)` | ✅ Correct |
| **Avg Rating** stat | `(parkingAreas.reduce((sum, a) => sum + a.rating, 0) / parkingAreas.length).toFixed(1)` | ❌ BUG: All ratings are hardcoded 4.5 |
| **Individual lot ratings** | `parkingArea.rating` from API | ❌ BUG: Hardcoded 4.5 in API route |
| **Available slots per lot** | `area.availableSlots` from API | ✅ Correct |
| **Total slots per lot** | `area.totalSlots` from API | ✅ Correct |
| **Price per lot** | `area.price` from API (calculated avg) | ✅ Correct |

### Find Parking Screen (/dashboard/find)

| Displayed Value | Source | Bug Status |
|----------------|--------|------------|
| **Total Parking** stat | `allAreas.length` (from API) | ✅ Correct |
| **Available** stat | `allAreas.filter(a => a.status === "available").length` | ❌ BUG: Same as dashboard |
| **Total Spaces** stat | `allAreas.reduce((sum, a) => sum + a.availableSlots, 0)` | ❌ BUG: Should be totalSlots, not availableSlots |
| **Avg Rating** stat | Calculated from `area.rating` | ❌ BUG: All ratings are 4.5 |
| **Individual lot ratings** | `parkingArea.rating` from API | ❌ BUG: Hardcoded 4.5 |

### My Bookings Screen (/dashboard/bookings)

| Displayed Value | Source | Bug Status |
|----------------|--------|------------|
| **Total Bookings** stat | `bookings.length` (from API) | ✅ Correct |
| **Active Now** stat | `bookings.filter(b => b.status === "ACTIVE").length` | ✅ Correct |
| **Upcoming** stat | `bookings.filter(b => b.status === "UPCOMING").length` | ✅ Correct |
| **Cancelled** stat | `bookings.filter(b => b.status === "CANCELLED").length` | ✅ Correct |
| **Booking amounts** | `booking.amount` from API | ✅ Correct |
| **Booking statuses** | `booking.status` from API | ✅ Correct |

### Profile Screen (/dashboard/profile)

| Displayed Value | Source | Bug Status |
|----------------|--------|------------|
| **Wallet Balance** | Hardcoded state: `profile.walletBalance = 2450.00` | ❌ BUG: Not from API |
| **Total Bookings** | Fetched from `/api/bookings` | ✅ Correct |
| **User info** | NextAuth session + hardcoded fallbacks | ⚠️ Mixed sources |
| **Vehicles** | Hardcoded state array | ❌ BUG: Not from API |
| **Payment methods** | Hardcoded state array | ❌ BUG: Not from API |

## Critical Issues Found (Phase 1)

### 1. Google Maps Watermark Issue
**Root Cause**: 
- API key is loaded from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY`
- In `.env.example` it's set to `"your_google_maps_api_key"` (placeholder)
- No actual API key configured, causing "For development purposes only" watermark
- Map component has fallback simulation mode when API fails

**Location**: 
- `lib/google-maps-config.ts` line 8
- `.env.example` line 8
- `components/map/parking-map.tsx` handles auth failures

### 2. Stat/Listing Mismatch on Dashboard
**Root Cause**:
- Dashboard "Available" stat: `parkingAreas.filter(a => a.status === "available").length`
- This counts lots with status="available", not actual available slots
- The listings grid shows individual lots with their actual `availableSlots` counts
- These are different metrics - one counts lots, the other counts slots

**Location**: `app/dashboard/page.tsx` lines 236-243

### 3. Static/Identical Ratings (4.5★ everywhere)
**Root Cause**:
- API route `/api/parking/route.ts` hardcodes `rating: 4.5` for all lots (line 109)
- Database has `review` model with rating field, but it's not used
- No aggregation function exists to calculate real ratings from reviews
- All components display this hardcoded value

**Location**: 
- `app/api/parking/route.ts` line 109
- Database model exists: `prisma/schema.prisma` lines 385-393

### 4. Booking Flow Completeness
**Status**: NEEDS INVESTIGATION
- Booking creation flow exists: `/dashboard/booking/[id]`
- Payment integration: Stripe configured
- Confirmation flow: `/dashboard/confirmation/[id]`
- Cancellation: `/api/bookings/[id]/cancel/route.ts`
- **Need to test end-to-end flow**

### 5. EN Language Switcher
**Root Cause**:
- Footer has language selector with EN and TA options
- Only EN is implemented - no actual i18n system
- TA option does nothing but change state variable
- No translation files or i18n library (next-i18next, etc.)

**Location**: `components/layout/footer.tsx` lines 6, 25-33

## Design System Gaps (Phase 2)

### Missing Semantic Status Colors
- No amber/warning color for medium occupancy
- Current system only has green (available) and red (cancelled)
- Need amber for "limited" status (20-50% availability)

### Typography Issues
- No established type scale
- Missing distinct fonts for headings vs body
- Numeric legibility not optimized

### Component Library Gaps
- No standardized Button component with all variants
- No Stat widget with count-up animation
- No semantic Badge component
- No proper Empty state components
- No Skeleton loaders
- No Toast/notification system (sonner installed but not standardized)

### Spacing & Elevation
- No consistent 8px grid system
- Cards lack proper shadows and borders
- No hover lift effects standardized

## Animation Status (Phase 3)
- ✅ Framer Motion already installed
- ✅ Some animations exist (hero, cards)
- ❌ No consistent animation timing system
- ❌ No reduced motion fallbacks everywhere
- ❌ Missing skeleton loaders

## Accessibility Issues (Phase 5)
- ⚠️ Contrast ratios need verification
- ⚠️ Focus states not consistent
- ⚠️ Aria-labels missing on icon-only buttons
- ❌ Mobile responsiveness not verified

## Next Steps

### Phase 1: Fix Correctness Bugs
1. Configure Google Maps API key or improve fallback
2. Fix dashboard stat calculation logic
3. Implement real rating calculation or show "Not rated"
4. Test booking flow end-to-end
5. Remove or implement language switcher

### Phase 2: Design System Foundation
1. Refine color tokens with semantic status colors
2. Establish typography scale
3. Implement 8px spacing grid
4. Build component library (Button, Card, Badge, Stat, etc.)

### Phase 3: Screen-by-Screen Redesign
1. Dashboard: Hero animations, stat count-up, interactive filters
2. Find Parking: Map-first view, slide-out panel, detail expansion
3. My Bookings: Custom empty state, tabbed list, cancel flow
4. Profile: Avatar upload, wallet animation, verification checklist

### Phase 4: Motion & Animation
1. Implement consistent animation timing (150-400ms)
2. Add skeleton loaders everywhere
3. Respect prefers-reduced-motion

### Phase 5: Accessibility & Responsiveness
1. Contrast audit and fixes
2. Focus states for all interactive elements
3. Aria-labels for icon buttons
4. Mobile breakpoint testing (375px)

## Conclusion

The codebase has a solid foundation with Next.js, TypeScript, Tailwind, and Framer Motion already in place. The main issues are:

1. **Data correctness**: Hardcoded values and calculation bugs
2. **Missing real features**: Ratings, i18n, profile data
3. **Design system**: Inconsistent implementation of basic design principles
4. **Accessibility**: Not systematically addressed

The project is well-structured for systematic improvement through the phased approach outlined.