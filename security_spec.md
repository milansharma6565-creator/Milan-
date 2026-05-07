# Security Specification for Rajhans steel and Water

## Data Invariants
1. Only authenticated users can access the database.
2. Every Bill must be linked to a valid Customer.
3. Ledger entries must accurately reflect bill payments or tractor expenses.
4. Customer pending amounts must only be updated via settlements or payment entries.
5. Critical fields like `grandTotal` in Bills should be immutable once settled.

## The "Dirty Dozen" Payloads (Red Team Audit)

1. **Unauthenticated Read**: Attempt to read `customers` without an auth token.
2. **Unauthenticated Write**: Attempt to create a `bill` without an auth token.
3. **Identity Spoofing**: User A attempts to update User B's driver profile (though currently single-business, we must prevent unauthorized writes).
4. **Invalid ID**: Creating a customer with a 2KB long string as ID.
5. **Type Poisoning**: Sending a string instead of a number for `pendingAmount`.
6. **Negative Amount**: Creating a bill/ledger entry with negative `amount`.
7. **Bypassing Settlement**: Directly updating `pendingAmount` on a customer without a corresponding bill settlement or ledger entry.
8. **Shadow Field**: Adding `isVerified: true` to a Bill via client update.
9. **Status Shortcut**: Changing bill status from 'Pending' to 'Delivered' without proper payment info (if logic was client-side only).
10. **Resource Exhaustion**: Sending a massive string (1MB) in `notes` field.
11. **Future Date Injection**: Setting `createdAt` to a future date instead of `serverTimestamp()`.
12. **PII Leak**: Authenticated user trying to list ALL customers' personal info (emails/phones) if they aren't authorized staff.

## Test Runner Plan
We will use a hardened ruleset that defaults to deny and explicitly allow only verified authenticated users for this business.
