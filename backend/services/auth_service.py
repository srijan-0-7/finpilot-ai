"""
Real authentication: email/password accounts with bcrypt-hashed passwords,
plus a "demo access key" flow so people who just want to try the app (e.g.
someone clicking a LinkedIn link) don't need to go through full signup.

Note on scope: this gives every logged-in user their own account and
session, but all accounts still share one underlying business database
(the same tables, dashboard config, etc.). This is real authentication,
not full multi-tenant data isolation — that would mean separate databases
or row-level ownership per user, which is a larger architectural change.
"""
import re
import bcrypt
from fastapi import HTTPException
from backend.services import metadata_store

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def hash_password(password: str) -> str:
    # bcrypt has a hard 72-byte limit on the input; truncate defensively
    # rather than raising, since a long passphrase is still a fine password.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], password_hash.encode("utf-8"))
    except Exception:
        return False


def signup(email: str, password: str) -> dict:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="That doesn't look like a valid email address.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    if metadata_store.get_user_by_email(email):
        raise HTTPException(status_code=409, detail="An account with this email already exists. Try logging in instead.")

    user_id = metadata_store.create_user(email, hash_password(password))
    token = metadata_store.create_session(user_id)
    return {"token": token, "email": email}


def login(email: str, password: str) -> dict:
    email = email.strip().lower()
    user = metadata_store.get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    token = metadata_store.create_session(user["id"])
    return {"token": token, "email": user["email"]}


DEMO_EMAIL = "demo@finpilot.local"
DEMO_PASSWORD_PLACEHOLDER = "not-a-real-password-demo-account"


def demo_login(access_key: str) -> dict:
    if not metadata_store.validate_and_use_demo_key(access_key):
        raise HTTPException(status_code=401, detail="Invalid or expired demo access key.")

    user = metadata_store.get_user_by_email(DEMO_EMAIL)
    if not user:
        user_id = metadata_store.create_user(DEMO_EMAIL, hash_password(DEMO_PASSWORD_PLACEHOLDER), is_demo=True)
    else:
        user_id = user["id"]

    token = metadata_store.create_session(user_id)
    return {"token": token, "email": DEMO_EMAIL, "is_demo": True}


def change_password(user_id: str, current_password: str, new_password: str):
    user = metadata_store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")
    if user["is_demo"]:
        raise HTTPException(status_code=403, detail="The shared demo account's password can't be changed.")
    if not verify_password(current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect.")
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    metadata_store.update_user_password(user_id, hash_password(new_password))
