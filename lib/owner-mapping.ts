// Central mapping of Owner Email -> Parking Lot ID
// This ensures consistency across middleware, layouts, and pages

export const OWNER_PARKING_MAPPING: Record<string, string> = {
    "spencerplaza@slots.dev": "lot-1790949037080-vipyzbwz6",
    "phoenixmarketcity@slots.dev": "lot-1790949049585-nhexa8rmy",
    "marinabeach@slots.dev": "lot-1790949064951-r7c6ryq47",
    "chennaicentral@slots.dev": "lot-1790949074316-zdw75kcqa",
    "expressavenue@slots.dev": "lot-1790949092243-f03qvdtor",
    "citicentermall@slots.dev": "lot-1790949105753-bc2hlzhc1",
    "annanagartower@slots.dev": "lot-1790949118417-4q6b6056i",
    "tnagarcentral@slots.dev": "lot-1790949129906-96fbgaufk"
};

export const PARKING_LOT_DETAILS: Record<string, { name: string; totalSlots: number; location?: string; price?: number }> = {
    "lot-1790949037080-vipyzbwz6": {
        name: "Spencer Plaza Parking",
        totalSlots: 80,
        location: "Anna Salai, Chennai",
        price: 60
    },
    "lot-1790949049585-nhexa8rmy": {
        name: "Phoenix Marketcity Parking",
        totalSlots: 100,
        location: "Velachery Main Road, Chennai",
        price: 70
    },
    "lot-1790949064951-r7c6ryq47": {
        name: "Marina Beach Parking",
        totalSlots: 60,
        location: "Kamarajar Salai, Chennai",
        price: 50
    },
    "lot-1790949074316-zdw75kcqa": {
        name: "Chennai Central Parking",
        totalSlots: 120,
        location: "Poonamallee High Road, Chennai",
        price: 55
    },
    "lot-1790949092243-f03qvdtor": {
        name: "Express Avenue Mall Parking",
        totalSlots: 90,
        location: "Whites Road, Chennai",
        price: 65
    },
    "lot-1790949105753-bc2hlzhc1": {
        name: "Citi Center Mall Parking",
        totalSlots: 85,
        location: "Rajiv Gandhi Salai, Chennai",
        price: 58
    },
    "lot-1790949118417-4q6b6056i": {
        name: "Anna Nagar Tower Parking",
        totalSlots: 75,
        location: "Anna Nagar Main Road, Chennai",
        price: 52
    },
    "lot-1790949129906-96fbgaufk": {
        name: "T Nagar Central Parking",
        totalSlots: 95,
        location: "Usman Road, T Nagar, Chennai",
        price: 62
    }
};

export function getLotIdForOwner(email: string | null | undefined): string | null {
    if (!email) return null;
    return OWNER_PARKING_MAPPING[email.toLowerCase()] || null;
}
