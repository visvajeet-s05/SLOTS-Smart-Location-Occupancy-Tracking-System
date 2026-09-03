# DATABASE WIPO DOCUMENTATION

## What was lost

On 2026-08-24, `prisma db push --force-reset` was run against the `smart_parking` database at `mysql://root:1324@localhost:3306/smart_parking`. This command drops and recreates the entire database — it does NOT selectively touch tables. The following data/schema was wiped:

### Tables
- All 8 parking lots (Spencer Plaza, Anna Nagar, T Nagar, Marina Beach, Express Avenue, Citi Center, Phoenix MC, Chennai Central)
- All owner accounts and their profiles
- All booking records
- All slot records
- All camera, ANPR, and edge device data
- All Blueprint, BlueprintZone, BlueprintCamera, BlueprintSlotCamera tables (from the paused blueprint system work)
- All analytics, reports, and demand prediction data
- All user session tokens and verification codes

### Why this happened
Docker was not available on this system, so the MySQL instance at localhost:3306 was the only database available. This same database was used for Phase 1 concurrency testing, and `prisma db push --force-reset` was used to ensure a clean schema state. The force-reset was applied to the shared database, not a disposable test database.

### Going forward
- No further destructive operations will be performed against `smart_parking` without a separate, disposable test database
- A second database schema (e.g., `smart_parking_test`) should be created for all future concurrency testing
- This document should be referenced before any future schema push operations