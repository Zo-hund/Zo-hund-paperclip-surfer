# Membership Commerce

AMX AIR Hubs implements the TECH AT NITE product catalog as a commerce layer that is separate from authorization.

- Security roles remain `member`, `trainer`, and `operator`.
- Commercial plans are Explorer, Learner, Builder, Ambassador, Earner, Parent, Community, Volunteer, Sponsor, and Donor.
- A paid plan never grants trainer or operator access.
- Stripe is the source of truth for price, currency, billing interval, and subscription status.

## Stripe setup

1. Create one recurring Stripe Product and Price for each paid plan.
2. Use monthly prices for Learner, Builder, Ambassador, Earner, Parent, Community, and Volunteer.
3. Use annual prices for Sponsor and Donor.
4. Add each `price_...` identifier to the matching `MEMBERSHIP_PRICE_*` Sites environment variable.
5. Set `MEMBERSHIP_PUBLIC_BASE_URL=https://amx-hubs.cc`.
6. Create a Stripe webhook for `https://amx-hubs.cc/api/membership/stripe-webhook`.
7. Subscribe the endpoint to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
8. Store its signing secret in `MEMBERSHIP_STRIPE_WEBHOOK_SECRET` and redeploy.

The existing `STRIPE_SECRET_KEY` is reused. `STRIPE_WEBHOOK_SECRET` remains the fallback webhook secret, but a dedicated membership secret is preferred.

## Member flow

1. A visitor opens `/membership` and sees the complete business-model catalog.
2. The visitor creates or signs into an AMX member account.
3. The member selects a configured plan and completes Stripe-hosted Checkout.
4. Signed Stripe events provision and maintain the subscription record.
5. `/membership` shows the active plan, renewal state, and Stripe billing portal action.
6. `/marketplace/merch` carries the member's plan identity into collective commerce.

Explorer is the free default for every active AMX account. Paid plans only become selectable after their Stripe Price IDs are configured, preventing accidental sales with invented prices.
