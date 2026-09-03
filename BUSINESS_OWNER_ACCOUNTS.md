# SLOTS Business Owner Accounts

This document contains the 8 business owner accounts created for the SLOTS parking system. The old `owner1@gmail.com` account has been replaced with these business-specific accounts.

---

## Account Credentials

| # | Business Name | Email Address | Password | Phone |
|---|---------------|---------------|----------|-------|
| 1 | Spencer Plaza Parking | spencerplaza@slots.dev | Spencerplaza@Slots | +919876543213 |
| 2 | Phoenix Marketcity Parking | phoenixmarketcity@slots.dev | Phoenixmarketcity@Slots | +919876543214 |
| 3 | Marina Beach Parking | marinabeach@slots.dev | Marinabeach@Slots | +919876543215 |
| 4 | Chennai Central Railway Station | chennaicentral@slots.dev | Chennaicentral@Slots | +919876543216 |
| 5 | Express Avenue Mall Parking | expressavenue@slots.dev | Expressavenue@Slots | +919876543217 |
| 6 | Chennai Citi Center Mall | citicentermall@slots.dev | Citicentermall@Slots | +919876543218 |
| 7 | Anna Nagar Tower Parking | annanagartower@slots.dev | Annanagartower@Slots | +919876543219 |
| 8 | T Nagar Central Parking | tnagarcentral@slots.dev | Tnagarcentral@Slots | +919876543220 |

---

## Parking Lot Mapping

Each business owner is mapped to their corresponding parking lot:

| Email | Parking Lot ID | Parking Lot Name | Total Slots | Price/hr |
|-------|---------------|-----------------|-------------|---------|
| spencerplaza@slots.dev | SPENCER_PLAZA | Spencer Plaza Parking | 90 | ₹35 |
| phoenixmarketcity@slots.dev | PHOENIX_MARKETCITY | Phoenix Marketcity Parking | 250 | ₹55 |
| marinabeach@slots.dev | MARINA_BEACH | Marina Beach Parking | 100 | ₹25 |
| chennaicentral@slots.dev | CHENNAI_CENTRAL | Chennai Central Railway Station | 300 | ₹30 |
| expressavenue@slots.dev | EXPRESS_AVENUE | Express Avenue Mall Parking | 150 | ₹45 |
| citicentermall@slots.dev | CITI_CENTER | Chennai Citi Center Mall | 200 | ₹50 |
| annanagartower@slots.dev | ANNA_NAGAR | Anna Nagar Tower Parking | 80 | ₹35 |
| tnagarcentral@slots.dev | T_NAGAR | T Nagar Central Parking | 120 | ₹40 |

---

## Changes Made

### Files Modified

1. **prisma/seed.ts**
   - Removed `owner1@gmail.com` and `owner2@gmail.com`
   - Added 8 new business owner accounts with hashed passwords
   - Passwords are hashed using bcrypt (12 rounds)

2. **prisma/seed-parking.ts**
   - Removed single owner creation logic
   - Updated to create 8 separate business owner profiles
   - Each parking lot is now mapped to its corresponding business owner
   - Owner status set to "APPROVED"

3. **lib/owner-mapping.ts**
   - Replaced old owner email mappings
   - Updated with 8 new business email mappings
   - Updated parking lot details to match actual business names

4. **app/api/owner/bookings/route.ts**
   - Removed hardcoded owner mapping
   - Now imports from centralized `lib/owner-mapping.ts`

---

## How to Use

### To Seed the Database

Run the seed scripts to create the accounts in your database:

```bash
# Seed user accounts
npx prisma db seed

# Seed parking data with business owners
npx ts-node prisma/seed-parking.ts
```

### To Login

1. Navigate to the login page
2. Use any of the email addresses from the table above
3. Use the corresponding password
4. Select "Owner" role if prompted

### Account Role

All 8 accounts have the `OWNER` role, which grants access to:
- Owner dashboard
- Parking lot management
- Booking management
- Revenue tracking
- Staff management

---

## Security Notes

- All passwords are hashed using bcrypt with 12 salt rounds
- Passwords follow the pattern: `[BusinessName]@Slots`
- Email addresses follow the pattern: `[businessname]@slots.dev`
- Phone numbers are for demonstration purposes only
- In production, these credentials should be changed immediately after first login

---

## Parking Lot Details

### Spencer Plaza Parking
- **Location**: Anna Salai, Chennai
- **Total Slots**: 90
- **Price**: ₹35/hour
- **Owner**: spencerplaza@slots.dev

### Phoenix Marketcity Parking
- **Location**: Velachery Main Road, Chennai
- **Total Slots**: 250
- **Price**: ₹55/hour
- **Owner**: phoenixmarketcity@slots.dev

### Marina Beach Parking
- **Location**: Kamarajar Salai, Chennai
- **Total Slots**: 100
- **Price**: ₹25/hour
- **Owner**: marinabeach@slots.dev

### Chennai Central Railway Station
- **Location**: Poonamallee High Road, Chennai
- **Total Slots**: 300
- **Price**: ₹30/hour
- **Owner**: chennaicentral@slots.dev

### Express Avenue Mall Parking
- **Location**: Whites Road, Chennai
- **Total Slots**: 150
- **Price**: ₹45/hour
- **Owner**: expressavenue@slots.dev

### Chennai Citi Center Mall
- **Location**: Rajiv Gandhi Salai, Chennai
- **Total Slots**: 200
- **Price**: ₹50/hour
- **Owner**: citicentermall@slots.dev

### Anna Nagar Tower Parking
- **Location**: Anna Nagar Main Road, Chennai
- **Total Slots**: 80
- **Price**: ₹35/hour
- **Owner**: annanagartower@slots.dev

### T Nagar Central Parking
- **Location**: Usman Road, T Nagar, Chennai
- **Total Slots**: 120
- **Price**: ₹40/hour
- **Owner**: tnagarcentral@slots.dev

---

## Summary

✅ **Removed**: `owner1@gmail.com` and `owner2@gmail.com`
✅ **Added**: 8 business-specific owner accounts
✅ **Updated**: All mapping files to use new accounts
✅ **Configured**: Each parking lot mapped to its correct owner
✅ **Documented**: All credentials and mappings provided

The system is now ready with realistic business owner accounts that correspond to actual Chennai parking locations.