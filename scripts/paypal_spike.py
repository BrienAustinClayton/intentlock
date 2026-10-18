#!/usr/bin/env python3
"""PayPal Sandbox spike (P1-T02). Run from services/intentlock:
   uv run python ../../scripts/paypal_spike.py <cmd>
Never prints client id, secret or access token."""
import argparse
import json
import os
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "services" / "intentlock"
sys.path.insert(0, str(SERVICE))
os.environ["PAYPAL_MODE"] = "sandbox"

from app.config import settings  # noqa: E402  (loads services/intentlock/.env)
from app.ids import new_id  # noqa: E402
from app.paypal import sandbox  # noqa: E402
from app.paypal.service import PayPalError  # noqa: E402

SEED = ROOT / "data" / "seed"
SETUP_FILE = SEED / ".spike_setup"
POPUP_FILE = SEED / ".spike_popup"
TOKEN_FILE = sandbox.SPIKE_TOKEN_PATH
PREFER = "return=representation"


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    os.chmod(path, 0o600)


def _creds_banner() -> None:
    ok = lambda v: "set" if v and v != "__FILL_ME__" else "missing"  # noqa: E731
    print(f"PAYPAL_CLIENT_ID: {ok(settings.PAYPAL_CLIENT_ID)}")
    print(f"PAYPAL_CLIENT_SECRET: {ok(settings.PAYPAL_CLIENT_SECRET)}")
    print(f"PAYPAL_ENV: {settings.PAYPAL_ENV}")
    if ok(settings.PAYPAL_CLIENT_ID) == "missing" or ok(settings.PAYPAL_CLIENT_SECRET) == "missing":
        sys.exit(2)


def _order(amount, title="Spike test item"):
    amt = Decimal(amount).quantize(Decimal("0.01"))
    return SimpleNamespace(
        id=new_id("ord"),
        cart_json=[{"product_id": "spike_item", "title": title, "qty": 1,
                    "unit_price": f"{amt:.2f}", "currency": "USD"}],
        total=amt, currency="USD", user=None,
    )


def _return_url(args) -> str:
    if getattr(args, "return_url", None):
        return args.return_url
    base = (settings.PUBLIC_BASE_URL or "").rstrip("/")
    if not base:
        print("PUBLIC_BASE_URL not set; pass --return-url")
        sys.exit(2)
    return f"{base}/vault/return"


def _load_setup() -> dict:
    try:
        return json.loads(SETUP_FILE.read_text())
    except (OSError, ValueError):
        return {}


def _print_raw() -> None:
    for op, status, text in sandbox.RAW_LOG:
        print(f"--- {op} HTTP {status}")
        try:
            print(json.dumps(json.loads(text), indent=2))
        except ValueError:
            print(text)
    sandbox.RAW_LOG.clear()


def _save_token(vault_id: str, source: str, user_id: str | None) -> None:
    _write(TOKEN_FILE, json.dumps({"vault_id": vault_id, "source": source}))
    print(f"PAYMENT TOKEN: {vault_id} (saved to data/seed/.spike_token)")
    if user_id:
        from app.db import new_session
        from app.models import User

        with new_session() as db:
            u = db.get(User, user_id)
            if u is None:
                print("user not found")
                sys.exit(1)
            u.paypal_payment_token = vault_id if source == "paypal" else f"card:{vault_id}"
            db.commit()
        print(f"stored on {user_id}")


# ---------------------------------------------------------------- commands

def cmd_setup(args):
    return_url = _return_url(args)
    cancel_url = args.cancel_url or (return_url + "?cancelled=1")
    if not args.card:
        sid, href = sandbox.create_setup_token(return_url, cancel_url, f"spike-setup-{uuid.uuid4().hex}")
        _write(SETUP_FILE, json.dumps({"setup_token_id": sid, "source": "paypal"}))
        print(f"SETUP TOKEN: {sid}")
        print(f"APPROVE URL: {href}")
        buyer = settings.PAYPAL_SANDBOX_BUYER_EMAIL or "(PAYPAL_SANDBOX_BUYER_EMAIL not set)"
        print(f"Log in as sandbox buyer: {buyer}")
        print("Then run: uv run python ../../scripts/paypal_spike.py token")
        return
    from paypalserversdk.models.address import Address
    from paypalserversdk.models.setup_token_request import SetupTokenRequest
    from paypalserversdk.models.setup_token_request_card import SetupTokenRequestCard
    from paypalserversdk.models.setup_token_request_payment_source import SetupTokenRequestPaymentSource
    from paypalserversdk.models.vault_card_experience_context import VaultCardExperienceContext
    from paypalserversdk.models.vault_card_verification_method import VaultCardVerificationMethod

    body = SetupTokenRequest(payment_source=SetupTokenRequestPaymentSource(card=SetupTokenRequestCard(
        number="4111111111111111", expiry="2030-12", name="IntentLock Test",
        billing_address=Address(address_line_1="2211 N First St", admin_area_2="San Jose",
                                admin_area_1="CA", postal_code="95131", country_code="US"),
        verification_method=VaultCardVerificationMethod.SCA_WHEN_REQUIRED,
        experience_context=VaultCardExperienceContext(return_url=return_url, cancel_url=cancel_url))))
    r = sandbox._call("setup_token_card", lambda c: c.vault.create_setup_token(
        {"body": body, "paypal_request_id": f"spike-card-{uuid.uuid4().hex}"})).body
    _write(SETUP_FILE, json.dumps({"setup_token_id": r.id, "source": "card"}))
    print(f"SETUP TOKEN: {r.id} status={r.status}")
    if str(r.status).upper() == "APPROVED":
        vid = sandbox.exchange_payment_token(r.id)
        _save_token(vid, "card", None)
        return
    href = next((lk.href for lk in (r.links or []) if lk.rel in ("approve", "up") and lk.href), None)
    print(f"APPROVE URL: {href}")
    print("Then run: uv run python ../../scripts/paypal_spike.py token")


def cmd_token(args):
    st = _load_setup()
    sid = args.setup_token_id or st.get("setup_token_id")
    if not sid:
        print("no setup token; run setup first")
        sys.exit(1)
    pt = sandbox.exchange_payment_token(sid)
    _save_token(pt, st.get("source", "paypal"), args.user)


def cmd_hold(args):
    if args.no_stored_credential:
        sandbox.SEND_STORED_CREDENTIAL = False
    o = _order(args.amount, args.title)
    r = sandbox.authorize_detailed(o)
    print(f"ORDER {r.paypal_order_id} create_status={r.create_status} authorize_called={r.authorize_called}")
    print(f"AUTHORIZATION {r.authorization_id} status={r.authorization_status}")


def cmd_capture(args):
    cid = sandbox.capture(args.authorization_id, request_id=args.request_id)
    print(f"CAPTURE {cid}")
    print(f"AUTH STATUS {sandbox.get_authorization_status(args.authorization_id)}")


def cmd_void(args):
    sandbox.void(args.authorization_id, request_id=args.request_id)
    print("VOIDED")
    print(f"AUTH STATUS {sandbox.get_authorization_status(args.authorization_id)}")


def cmd_all(args):
    o1 = _order("1.00")
    r1 = sandbox.authorize_detailed(o1)
    sandbox.capture(r1.authorization_id, request_id=f"{o1.id}-capture")
    o2 = _order("2.00")
    r2 = sandbox.authorize_detailed(o2)
    sandbox.void(r2.authorization_id, request_id=f"{o2.id}-void")
    s1 = sandbox.get_authorization_status(r1.authorization_id)
    s2 = sandbox.get_authorization_status(r2.authorization_id)
    print(f"{'action':8} {'paypal_order':17} {'authorization':17} {'create_status':14} {'authorize_called':17} final_status")
    for act, r, s in (("capture", r1, s1), ("void", r2, s2)):
        print(f"{act:8} {r.paypal_order_id:17} {r.authorization_id:17} {r.create_status:14} {str(r.authorize_called):17} {s}")
    if s1 == "CAPTURED" and s2 == "VOIDED":
        print("SPIKE OK: 1 CAPTURED, 1 VOIDED, no redirect")
        return
    print("SPIKE FAILED")
    sys.exit(1)


def _try(label, fn):
    try:
        out = fn()
        print(f"{label} | ok | {out}")
        return out
    except PayPalError as e:
        print(f"{label} | error | {e.code}")
        return None


def _raw_issue(label, op, fn):
    """Direct SDK call so the raw PayPal issue name is shown (bypasses already-done handling)."""
    try:
        sandbox._call(op, fn)
        print(f"{label} | ok | -")
    except PayPalError as e:
        print(f"{label} | error | {e.code}")


def cmd_edge(args):
    o = _order("1.00")
    r = sandbox.authorize_detailed(o)
    aid = r.authorization_id
    rid = f"{o.id}-capture"
    c1 = _try("1a capture rid X", lambda: sandbox.capture(aid, request_id=rid))
    c2 = _try("1b capture rid X again", lambda: sandbox.capture(aid, request_id=rid))
    print(f"1 same capture ids | {c1 == c2 and c1 is not None} | {c1}")
    _raw_issue("2 capture new rid (raw)", "capture_raw", lambda c: c.payments.capture_authorized_payment(
        {"authorization_id": aid, "paypal_request_id": f"new-{uuid.uuid4().hex}", "prefer": PREFER}))
    _try("2b capture new rid (recovered)", lambda: sandbox.capture(aid, request_id=f"new-{uuid.uuid4().hex}"))
    _try("3 void captured auth", lambda: sandbox.void(aid, request_id=f"v-{uuid.uuid4().hex}"))
    o2 = _order("1.00")
    r2 = sandbox.authorize_detailed(o2)
    a2 = r2.authorization_id
    _try("4a void", lambda: sandbox.void(a2, request_id=f"{o2.id}-void"))
    _raw_issue("4b void again new rid (raw)", "void_raw", lambda c: c.payments.void_payment(
        {"authorization_id": a2, "paypal_request_id": f"v2-{uuid.uuid4().hex}", "prefer": PREFER}))
    _try("5 capture voided auth", lambda: sandbox.capture(a2, request_id=f"c-{uuid.uuid4().hex}"))
    o3 = _order("1.00")
    ra = _try("6a authorize order twice (first)", lambda: sandbox.authorize(o3))
    rb = _try("6b authorize order twice (second)", lambda: sandbox.authorize(o3))
    print(f"6 idempotent | {ra == rb and ra is not None} | {ra}")
    if ra:
        _try("6c cleanup void", lambda: sandbox.void(ra[1]))


def _load_popup() -> dict:
    try:
        d = json.loads(POPUP_FILE.read_text())
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def _save_popup(label: str, order_id: str) -> None:
    d = _load_popup()
    d[label] = order_id
    _write(POPUP_FILE, json.dumps(d))


def cmd_popup(args):
    from paypalserversdk.models.experience_context_shipping_preference import ExperienceContextShippingPreference
    from paypalserversdk.models.paypal_experience_user_action import PaypalExperienceUserAction
    from paypalserversdk.models.paypal_payment_token_customer_type import PaypalPaymentTokenCustomerType
    from paypalserversdk.models.paypal_payment_token_usage_type import PaypalPaymentTokenUsageType
    from paypalserversdk.models.paypal_wallet import PaypalWallet
    from paypalserversdk.models.paypal_wallet_attributes import PaypalWalletAttributes
    from paypalserversdk.models.paypal_wallet_experience_context import PaypalWalletExperienceContext
    from paypalserversdk.models.paypal_wallet_vault_instruction import PaypalWalletVaultInstruction
    from paypalserversdk.models.payment_source import PaymentSource
    from paypalserversdk.models.store_in_vault_instruction import StoreInVaultInstruction

    o = _order(args.amount)
    body = sandbox.build_order_request(o, sandbox.VaultRef("paypal", "x"))
    ru = _return_url(args)
    ctx = dict(
        return_url=ru, cancel_url=args.cancel_url or (ru + "?cancelled=1"),
        user_action=PaypalExperienceUserAction.CONTINUE,
        shipping_preference=ExperienceContextShippingPreference.NO_SHIPPING)
    wallet = dict(experience_context=PaypalWalletExperienceContext(**ctx))
    if not args.no_vault:
        wallet["attributes"] = PaypalWalletAttributes(vault=PaypalWalletVaultInstruction(
            store_in_vault=StoreInVaultInstruction.ON_SUCCESS,
            usage_type=PaypalPaymentTokenUsageType.MERCHANT,
            customer_type=PaypalPaymentTokenCustomerType.CONSUMER))
    body.payment_source = PaymentSource(paypal=PaypalWallet(**wallet))
    r = sandbox._call("create_order_popup", lambda c: c.orders.create_order(
        {"body": body, "paypal_request_id": o.id, "prefer": PREFER})).body
    href = next((lk.href for lk in (r.links or []) if lk.rel == "payer-action"), None)
    _save_popup(args.label, r.id)
    print(f"[{args.label}] PAYER ACTION URL: {href}")
    print("Then run: uv run python ../../scripts/paypal_spike.py finish")


def cmd_finish(args):
    oid = args.paypal_order_id or _load_popup().get(args.label)
    if not oid:
        print("no popup order; run popup first")
        sys.exit(1)
    r = sandbox._call("authorize_order_popup", lambda c: c.orders.authorize_order(
        {"id": oid, "paypal_request_id": f"{oid}-auth", "prefer": PREFER})).body
    auth = sandbox._first_auth(r)
    print(f"[{args.label}] ORDER {oid} AUTHORIZATION {getattr(auth, 'id', None)} status={getattr(auth, 'status', None)}")
    if auth is not None:
        d = _load_popup()
        d[f"{args.label}_auth"] = auth.id
        _write(POPUP_FILE, json.dumps(d))
    vault = None
    try:
        vault = r.payment_source.paypal.attributes.vault
    except AttributeError:
        pass
    vid = getattr(vault, "id", None)
    print(f"VAULT ID {vid} status={getattr(vault, 'status', None)}")
    if vid:
        _save_token(vid, "paypal", None)
        print("Now run: uv run python ../../scripts/paypal_spike.py all")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw", action="store_true", help="print raw PayPal response JSON")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("setup"); p.add_argument("--card", action="store_true"); p.add_argument("--return-url"); p.add_argument("--cancel-url"); p.set_defaults(fn=cmd_setup)
    p = sub.add_parser("token"); p.add_argument("setup_token_id", nargs="?"); p.add_argument("--user"); p.set_defaults(fn=cmd_token)
    p = sub.add_parser("hold"); p.add_argument("amount"); p.add_argument("--no-stored-credential", action="store_true"); p.add_argument("--title", default="Spike test item"); p.set_defaults(fn=cmd_hold)
    p = sub.add_parser("capture"); p.add_argument("authorization_id"); p.add_argument("--request-id"); p.set_defaults(fn=cmd_capture)
    p = sub.add_parser("void"); p.add_argument("authorization_id"); p.add_argument("--request-id"); p.set_defaults(fn=cmd_void)
    p = sub.add_parser("all"); p.set_defaults(fn=cmd_all)
    p = sub.add_parser("edge"); p.set_defaults(fn=cmd_edge)
    p = sub.add_parser("popup"); p.add_argument("amount"); p.add_argument("--return-url"); p.add_argument("--cancel-url"); p.add_argument("--no-vault", action="store_true"); p.add_argument("--label", default="capture"); p.set_defaults(fn=cmd_popup)
    p = sub.add_parser("finish"); p.add_argument("paypal_order_id", nargs="?"); p.add_argument("--label", default="capture"); p.set_defaults(fn=cmd_finish)
    args = ap.parse_args()
    if args.raw:
        sandbox.CAPTURE_RAW = True
    _creds_banner()
    code = 0
    try:
        args.fn(args)
    except PayPalError as e:
        print(f"ERROR code={e.code} debug_id={e.debug_id} retryable={e.retryable}")
        code = 1
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 1
    if args.raw:
        _print_raw()
    sys.exit(code)


if __name__ == "__main__":
    main()
