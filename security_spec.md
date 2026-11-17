# Security Specification — PROJECTILE LAB Firestore Rules

## 1. Data Invariants
1. A `UserProfile` at `/users/{userId}` can only be read, created, or updated by `request.auth.uid == userId` with a verified email (`request.auth.token.email_verified == true`). Blanket `list` on `/users` is strictly denied.
2. A `SimulationRecord` at `/users/{userId}/simulations/{simId}` must belong to `request.auth.uid == userId`, must carry `data.uid == request.auth.uid`, and must enforce immutable `createdAt == request.time` on creation.
3. A `SimulationStepBatch` at `/users/{userId}/simulations/{simId}/stepBatches/{batchId}` must verify that the parent simulation document exists (`exists(...)`) and matches `request.auth.uid == userId`, with bounded batch size (`data.steps.size() <= 500`).
4. Cross-user reads, queries, updates, and deletes are strictly rejected.

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. Unauthenticated read of `/users/alice/simulations/sim1` -> DENIED
2. Authenticated `bob` reading `/users/alice/simulations/sim1` -> DENIED
3. Authenticated `bob` listing `/users/alice/simulations` -> DENIED
4. Authenticated `alice` with `email_verified: false` creating `/users/alice` -> DENIED
5. Authenticated `alice` creating `/users/alice/simulations/sim1` with `uid: "bob"` (identity spoofing) -> DENIED
6. Authenticated `alice` creating `/users/alice/simulations/sim1` with shadow field `isAdmin: true` -> DENIED
7. Authenticated `alice` creating `/users/alice/simulations/sim1` with spoofed past `createdAt` timestamp -> DENIED
8. Authenticated `alice` updating `/users/alice/simulations/sim1` to mutate `createdAt` or `uid` -> DENIED
9. Authenticated `alice` injecting 2KB document ID `simId` -> DENIED (`isValidId`)
10. Authenticated `alice` injecting `simulationName` > 200 chars -> DENIED
11. Authenticated `alice` writing `stepBatches/b0` for non-existent parent `sim999` -> DENIED (`exists` Master Gate)
12. Authenticated `alice` writing `stepBatches/b0` with `steps.size() > 500` or non-map first element -> DENIED
