# PayPal Sandbox spike findings (P1-T02)
STATUS: PARTIAL (hold + capture proven live; void and no-redirect vault reuse not yet proven)
Date: 2026-10-18   SDK: paypal-server-sdk 2.4.0 (paypalserversdk)
Chosen path: popup approval for the first order (the vault approve page and card vaulting both failed in this sandbox)

## Prerequisites
- A US Business + US Personal sandbox pair is required (non-US accounts raised a currency error first; Vault v3 is US-only).
- Sandbox REST app linked to the US Business with Vault and Advanced Credit and Debit Card Payments ticked.
- .env: PAYPAL_ENV=sandbox, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_SANDBOX_BUYER_EMAIL (the Personal buyer), PUBLIC_BASE_URL
- Observed: the approved order's payee was still the earlier business account (`sb-uipxj...@business`), so the app in .env may still be linked to the old Business account rather than the new US one. Check this first when retrying vault/card.

## 1. Setup token  POST /v3/vault/setup-tokens   (vault.create_setup_token)
Request: payment_source.paypal {description, usage_pattern IMMEDIATE, permit_multiple_payment_tokens false, usage_type MERCHANT, customer_type CONSUMER, experience_context {brand_name, locale, shipping_preference NO_SHIPPING, return_url, cancel_url}}
Response: 201, status PAYER_ACTION_REQUIRED, links self + approve (https://www.sandbox.paypal.com/agreements/approve?approval_session_id=<setup id>)
Result: created fine with http://localhost and https://example.com return URLs and for three different apps/accounts. The hosted approve page ALWAYS showed "Things don't appear to be working at the moment" (sandbox side). No redirect was ever seen, so the appended return-URL params are unknown.

## 2. Payment token  POST /v3/vault/payment-tokens   (vault.create_payment_token)
Not reached (needs an approved setup token).
Card variant: POST /v3/vault/setup-tokens with payment_source.card (number, expiry, name, billing_address, verification_method SCA_WHEN_REQUIRED) is rejected with NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE on every app tried.

## 3. Create order AUTHORIZE  POST /v2/checkout/orders   (orders.create_order)
Popup path (no vault_id), used for this proof: payment_source.paypal.experience_context {return_url, cancel_url, user_action CONTINUE, shipping_preference NO_SHIPPING}, itemised purchase_units[0].items, custom_id = order id, header PayPal-Request-Id = order id, Prefer return=representation.
Response: 201 status PAYER_ACTION_REQUIRED, link rel "payer-action" -> https://www.sandbox.paypal.com/checkoutnow?token=<order id>.
Create-with-vault returned COMPLETED + authorization directly: not tested (no vault id).
stored_credential accepted: not tested.

## 4. Authorize, capture, void (live, popup order)
- Order 4C8533406L285154N: human approved in browser -> status APPROVED.
- POST /v2/checkout/orders/{id}/authorize -> 201, order status COMPLETED, purchases_units[0].payments.authorizations[0] id 43570920NW3860032 status CREATED.
  (Note: for this two-step path, authorize_order is required; create returned PAYER_ACTION_REQUIRED.)
- POST /v2/payments/authorizations/43570920NW3860032/capture (final_capture true) -> 201, capture id 9Y405821PG264964G, status COMPLETED.
- GET /v2/payments/authorizations/{id} -> status CAPTURED.
- Void: second order 52S55557GL842502N was created but the human had not approved it (PAYER_ACTION_REQUIRED), so the void path is not yet proven live.

## 6. Error codes observed
| case | http | issue |
| capture same request id again | 201 | same capture id 9Y405821PG264964G (idempotent) |
| capture again, new request id | 4xx | AUTHORIZATION_ALREADY_CAPTURED -> service recovers the same capture id via get_authorization + get_order |
| void after capture | 4xx | PREVIOUSLY_CAPTURED (not AUTHORIZATION_ALREADY_CAPTURED; mock raises the latter) |
| void twice / capture after void | not observed |
| vault card setup | 4xx | NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE |
| get_order fake id | 404 | INVALID_RESOURCE_ID |

## 7. Idempotency
Capture with the same PayPal-Request-Id returns the same capture id: yes. Create-order idempotency: not observed live.

## 8. Summary table from `paypal_spike.py all`
Not run (needs a vault id).
