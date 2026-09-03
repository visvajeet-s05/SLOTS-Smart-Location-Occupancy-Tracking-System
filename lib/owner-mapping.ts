// Central mapping of Owner Email -> Parking Lot ID
// This ensures consistency across middleware, layouts, and pages

export const OWNER_PARKING_MAPPING: Record<string, string> = {
    "spencerplaza@slots.dev": "SPENCER_PLAZA",
    "phoenixmarketcity@slots.dev": "PHOENIX_MARKETCITY",
    "marinabeach@slots.dev": "MARINA_BEACH",
    "chennaicentral@slots.dev": "CHENNAI_CENTRAL",
    "expressavenue@slots.dev": "EXPRESS_AVENUE",
    "citicentermall@slots.dev": "CITI_CENTER",
    "annanagartower@slots.dev": "ANNA_NAGAR",
    "tnagarcentral@slots.dev": "T_NAGAR"
};

export const PARKING_LOT_DETAILS: Record<string, { name: string; totalSlots: number; location?: string; price?: number }> = {
    "SPENCER_PLAZA": {
        name: "Spencer Plaza Parking",
        totalSlots: 90,
        location: "Anna Salai, Chennai",
        price: 35
    },
    "PHOENIX_MARKETCITY": {
        name: "Phoenix Marketcity Parking",
        totalSlots: 250,
        location: "Velachery Main Road, Chennai",
        price: 55
    },
    "MARINA_BEACH": {
        name: "Marina Beach Parking",
        totalSlots: 100,
        location: "Kamarajar Salai, Chennai",
        price: 25
    },
    "CHENNAI_CENTRAL": {
        name: "Chennai Central Railway Station",
        totalSlots: 300,
        location: "Poonamallee High Road, Chennai",
        price: 30
    },
    "EXPRESS_AVENUE": {
        name: "Express Avenue Mall Parking",
        totalSlots: 150,
        location: "Whites Road, Chennai",
        price: 45
    },
    "CITI_CENTER": {
        name: "Chennai Citi Center Mall",
        totalSlots: 200,
        location: "Rajiv Gandhi Salai, Chennai",
        price: 50
    },
    "ANNA_NAGAR": {
        name: "Anna Nagar Tower Parking",
        totalSlots: 80,
        location: "Anna Nagar Main Road, Chennai",
        price: 35
    },
    "T_NAGAR": {
        name: "T Nagar Central Parking",
        totalSlots: 120,
        location: "Usman Road, T Nagar, Chennai",
        price: 40
    }
};

export function getLotIdForOwner(email: string | null | undefined): string | null {
    if (!email) return null;
    return OWNER_PARKING_MAPPING[email.toLowerCase()] || null;
}
