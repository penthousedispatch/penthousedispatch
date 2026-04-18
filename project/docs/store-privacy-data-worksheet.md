# Penthouse Dispatch Store Privacy & Data Worksheet

Use this as a preparation worksheet before answering Apple privacy labels and Google Play Data Safety.

Important:
- Do not copy these answers blindly.
- Confirm the live production behavior first.
- If a feature exists in code but is not active in production, answer based on what users actually experience in production.

## Likely data categories used by Penthouse Dispatch

### Contact Info

Possible:
- name
- email address
- phone number

Why:
- admin/company/driver accounts
- onboarding
- rider/driver contact context

### Location

Possible:
- precise location
- approximate location

Why:
- driver live location
- map display
- rider tracking
- dispatch visibility

### User Content

Possible:
- uploaded driver photos
- company documents later
- notes/messages

Why:
- driver profile photo
- operational workflows

### Identifiers

Possible:
- user id
- company id
- driver id
- device/session identifiers

Why:
- authentication
- routing
- profile/session management

### Financial Info

Possible:
- payout destination label
- bank last 4
- driver payout details

Why:
- driver pay workflows

### Diagnostics

Possible:
- error logs
- runtime diagnostics

Why:
- app stability
- troubleshooting

## Apple privacy label prep questions

You will need to decide:
- what data is collected
- whether it is linked to the user
- whether it is used for tracking

### Likely answers

#### Tracking

Likely:
- `No`, unless you add advertising or cross-app tracking

#### Data linked to user

Likely yes for:
- contact info
- location
- identifiers
- uploaded content

#### Sensitive data

Review carefully if you enable:
- financial payout details
- identity/compliance document workflows later

## Google Play Data Safety prep questions

You will need to answer:
- what data is collected
- whether data is shared
- whether collection is required or optional
- why it is collected
- whether data is encrypted in transit
- whether users can request deletion

### Likely purposes

- app functionality
- account management
- fraud/security
- analytics
- developer communications

## Current safe assumptions

### Likely yes

- encrypted in transit
- account-based data collection
- location use for functionality
- contact info for account/profile

### Likely no

- selling data
- advertising tracking
- cross-app tracking

## Areas to confirm before final answers

1. Do you store or expose full SSNs anywhere in production?
   - should be `no`

2. Are driver payout bank credentials stored directly?
   - should be limited to secure provider / last 4 style handling

3. Are analytics tools collecting device-level tracking identifiers?
   - confirm before answering

4. Are company-uploaded docs already live in production?
   - answer based on actual rollout

## Recommendation

Before final submission, do one short audit:
- auth data used
- location use
- image upload use
- payout/banking fields
- diagnostics/logging tools

Then fill Apple and Google from that verified production state.
