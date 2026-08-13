import os
import io
import re
import json
import uuid
import base64
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Any

import bcrypt
import jwt
import requests
import fitz  # PyMuPDF
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfgen import canvas

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
LLM_MODEL = os.environ.get("LLM_MODEL", "gpt-5.4")
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "owner@example.com")
ADMIN_PIN = os.environ.get("ADMIN_PIN", "112233")
APP_NAME = os.environ.get("APP_NAME", "steelbiz")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("steelbiz")

app = FastAPI()
api = APIRouter(prefix="/api")

UNITS = ["KG", "MT", "PCS", "FEET", "SQ FT", "COIL"]

# ---------------------------------------------------------------------------
# Object storage
# ---------------------------------------------------------------------------
storage_key = None


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def today_str():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def new_id():
    return str(uuid.uuid4())


def clean(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pin.encode(), hashed.encode())
    except Exception:
        return False


def make_token():
    payload = {"sub": ADMIN_EMAIL, "exp": datetime.now(timezone.utc) + timedelta(days=30), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"email": payload["sub"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def parse_date_range(range_key: str, start: Optional[str], end: Optional[str]):
    """Return (start_str, end_str) inclusive YYYY-MM-DD, or (None, None) for all-time."""
    today = datetime.now(timezone.utc).date()
    if range_key == "today":
        return today.isoformat(), today.isoformat()
    if range_key == "week":
        s = today - timedelta(days=today.weekday())
        return s.isoformat(), today.isoformat()
    if range_key == "month":
        return today.replace(day=1).isoformat(), today.isoformat()
    if range_key == "year":
        return today.replace(month=1, day=1).isoformat(), today.isoformat()
    if range_key == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1).isoformat(), last_prev.isoformat()
    if range_key == "last_year":
        y = today.year - 1
        return date(y, 1, 1).isoformat(), date(y, 12, 31).isoformat()
    if range_key == "custom" and start and end:
        return start, end
    return None, None


def in_range(d: str, start: Optional[str], end: Optional[str]) -> bool:
    if not d:
        return False
    dd = d[:10]
    if start and dd < start:
        return False
    if end and dd > end:
        return False
    return True


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    pin: str


class Customer(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    mobile: str = ""
    address: str = ""
    gstin: str = ""
    credit_limit: float = 0
    credit_days: int = 30
    created_at: str = Field(default_factory=now_iso)


class Supplier(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    mobile: str = ""
    address: str = ""
    gstin: str = ""
    created_at: str = Field(default_factory=now_iso)


class Product(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    category: str = ""
    specification: str = ""
    thickness: str = ""
    unit: str = "PCS"
    quantity: float = 0
    avg_cost: float = 0
    location: str = ""
    reorder_level: float = 0
    last_movement: str = Field(default_factory=now_iso)
    created_at: str = Field(default_factory=now_iso)


class Coil(BaseModel):
    id: str = Field(default_factory=new_id)
    coil_number: str
    supplier: str = ""
    thickness: str = ""
    width: str = ""
    colour: str = ""
    original_weight: float = 0
    remaining_weight: float = 0
    purchase_rate: float = 0
    purchase_date: str = Field(default_factory=today_str)
    location: str = ""
    created_at: str = Field(default_factory=now_iso)


class LineItem(BaseModel):
    product: str
    specification: str = ""
    thickness: str = ""
    quantity: float = 0
    unit: str = "PCS"
    rate: float = 0
    discount: float = 0
    gst: float = 0
    freight: float = 0
    total: float = 0
    needs_review: List[str] = []


class Purchase(BaseModel):
    id: str = Field(default_factory=new_id)
    supplier_id: str = ""
    supplier_name: str = ""
    invoice_number: str = ""
    date: str = Field(default_factory=today_str)
    items: List[LineItem] = []
    freight: float = 0
    total: float = 0
    amount_paid: float = 0
    source: str = "manual"
    created_at: str = Field(default_factory=now_iso)


class Sale(BaseModel):
    id: str = Field(default_factory=new_id)
    customer_id: str = ""
    customer_name: str = ""
    invoice_number: str = ""
    date: str = Field(default_factory=today_str)
    items: List[LineItem] = []
    total: float = 0
    cost: float = 0
    profit: float = 0
    amount_paid: float = 0
    source: str = "manual"
    created_at: str = Field(default_factory=now_iso)


class Payment(BaseModel):
    id: str = Field(default_factory=new_id)
    type: str  # "customer" or "supplier"
    party_id: str = ""
    party_name: str = ""
    date: str = Field(default_factory=today_str)
    amount: float = 0
    mode: str = "Cash"
    reference: str = ""
    created_at: str = Field(default_factory=now_iso)


class AskBody(BaseModel):
    question: str
    session_id: Optional[str] = None
    range: str = "all"
    start: Optional[str] = None
    end: Optional[str] = None


# ---------------------------------------------------------------------------
# Inventory logic
# ---------------------------------------------------------------------------
async def find_product(name: str, specification: str = "", thickness: str = ""):
    q = {"name": {"$regex": f"^{name.strip()}$", "$options": "i"}}
    docs = await db.products.find(q, {"_id": 0}).to_list(1000)
    if specification:
        for d in docs:
            if (d.get("specification") or "").strip().lower() == specification.strip().lower():
                return d
    return docs[0] if docs else None


async def apply_purchase_to_inventory(items: List[dict]):
    for it in items:
        prod = await find_product(it["product"], it.get("specification", ""))
        qty = float(it.get("quantity") or 0)
        rate = float(it.get("rate") or 0)
        if prod:
            old_qty = float(prod.get("quantity") or 0)
            old_cost = float(prod.get("avg_cost") or 0)
            new_qty = old_qty + qty
            new_cost = ((old_qty * old_cost) + (qty * rate)) / new_qty if new_qty > 0 else rate
            await db.products.update_one({"id": prod["id"]}, {"$set": {
                "quantity": new_qty, "avg_cost": round(new_cost, 2), "last_movement": now_iso()}})
        else:
            p = Product(name=it["product"], specification=it.get("specification", ""),
                        thickness=it.get("thickness", ""), unit=it.get("unit", "PCS"),
                        quantity=qty, avg_cost=rate)
            await db.products.insert_one(p.model_dump())


async def apply_sale_to_inventory(items: List[dict]):
    total_cost = 0.0
    for it in items:
        prod = await find_product(it["product"], it.get("specification", ""))
        qty = float(it.get("quantity") or 0)
        cost = 0.0
        if prod:
            cost = float(prod.get("avg_cost") or 0) * qty
            total_cost += cost
            new_qty = float(prod.get("quantity") or 0) - qty
            await db.products.update_one({"id": prod["id"]}, {"$set": {
                "quantity": new_qty, "last_movement": now_iso()}})
        it["_cost"] = cost
    return total_cost


async def reverse_sale_inventory(items: List[dict]):
    for it in items:
        prod = await find_product(it["product"], it.get("specification", ""))
        if prod:
            await db.products.update_one({"id": prod["id"]}, {"$set": {
                "quantity": float(prod.get("quantity") or 0) + float(it.get("quantity") or 0),
                "last_movement": now_iso()}})


async def reverse_purchase_inventory(items: List[dict]):
    for it in items:
        prod = await find_product(it["product"], it.get("specification", ""))
        if prod:
            await db.products.update_one({"id": prod["id"]}, {"$set": {
                "quantity": float(prod.get("quantity") or 0) - float(it.get("quantity") or 0),
                "last_movement": now_iso()}})


async def ensure_customer(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    existing = await db.customers.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return existing["id"]
    c = Customer(name=name)
    await db.customers.insert_one(c.model_dump())
    return c.id


async def ensure_supplier(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return ""
    existing = await db.suppliers.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
    if existing:
        return existing["id"]
    s = Supplier(name=name)
    await db.suppliers.insert_one(s.model_dump())
    return s.id


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/login")
async def login(body: LoginBody):
    owner = await db.owner.find_one({"email": ADMIN_EMAIL})
    if not owner or not verify_pin(body.pin, owner["pin_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    return {"token": make_token(), "email": ADMIN_EMAIL}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return {"email": user["email"]}


@api.post("/auth/change-pin")
async def change_pin(body: dict, user=Depends(get_current_user)):
    owner = await db.owner.find_one({"email": ADMIN_EMAIL})
    if not verify_pin(body.get("old_pin", ""), owner["pin_hash"]):
        raise HTTPException(status_code=400, detail="Old PIN incorrect")
    new_pin = body.get("new_pin", "")
    if len(new_pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    await db.owner.update_one({"email": ADMIN_EMAIL}, {"$set": {"pin_hash": hash_pin(new_pin)}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Generic CRUD helpers
# ---------------------------------------------------------------------------
async def customer_outstanding(cid: str, name: str = None):
    if name is None:
        c = await db.customers.find_one({"id": cid})
        name = c.get("name") if c else None
    sq = {"$or": [{"customer_id": cid}, {"customer_name": name}]} if name else {"customer_id": cid}
    pq = {"type": "customer", "$or": [{"party_id": cid}, {"party_name": name}]} if name else {"type": "customer", "party_id": cid}
    sales = await db.sales.find(sq, {"_id": 0}).to_list(10000)
    pays = await db.payments.find(pq, {"_id": 0}).to_list(10000)
    billed = sum(float(s.get("total") or 0) for s in sales)
    paid_in_sale = sum(float(s.get("amount_paid") or 0) for s in sales)
    paid = sum(float(p.get("amount") or 0) for p in pays) + paid_in_sale
    return round(billed - paid, 2), sales


async def supplier_outstanding(sid: str, name: str = None):
    if name is None:
        s = await db.suppliers.find_one({"id": sid})
        name = s.get("name") if s else None
    pq = {"$or": [{"supplier_id": sid}, {"supplier_name": name}]} if name else {"supplier_id": sid}
    payq = {"type": "supplier", "$or": [{"party_id": sid}, {"party_name": name}]} if name else {"type": "supplier", "party_id": sid}
    purch = await db.purchases.find(pq, {"_id": 0}).to_list(10000)
    pays = await db.payments.find(payq, {"_id": 0}).to_list(10000)
    billed = sum(float(p.get("total") or 0) for p in purch)
    paid_in = sum(float(p.get("amount_paid") or 0) for p in purch)
    paid = sum(float(p.get("amount") or 0) for p in pays) + paid_in
    return round(billed - paid, 2), purch


# Customers
@api.get("/customers")
async def list_customers(user=Depends(get_current_user)):
    docs = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    for d in docs:
        out, _ = await customer_outstanding(d["id"])
        d["outstanding"] = out
    return docs


@api.get("/customers/{cid}")
async def get_customer(cid: str, user=Depends(get_current_user)):
    d = clean(await db.customers.find_one({"id": cid}))
    if not d:
        raise HTTPException(404, "Not found")
    out, sales = await customer_outstanding(cid)
    d["outstanding"] = out
    d["sales"] = sorted(sales, key=lambda s: s.get("date", ""), reverse=True)
    d["total_purchases"] = round(sum(float(s.get("total") or 0) for s in sales), 2)
    d["num_purchases"] = len(sales)
    d["last_purchase"] = max([s.get("date", "") for s in sales], default="")
    d["payments"] = await db.payments.find({"type": "customer", "party_id": cid}, {"_id": 0}).to_list(10000)
    return d


@api.post("/customers")
async def create_customer(c: Customer, user=Depends(get_current_user)):
    await db.customers.insert_one(c.model_dump())
    return c


@api.put("/customers/{cid}")
async def update_customer(cid: str, body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    await db.customers.update_one({"id": cid}, {"$set": body})
    return clean(await db.customers.find_one({"id": cid}))


@api.delete("/customers/{cid}")
async def delete_customer(cid: str, user=Depends(get_current_user)):
    await db.customers.delete_one({"id": cid})
    return {"ok": True}


# Suppliers
@api.get("/suppliers")
async def list_suppliers(user=Depends(get_current_user)):
    docs = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    for d in docs:
        out, _ = await supplier_outstanding(d["id"])
        d["outstanding"] = out
    return docs


@api.get("/suppliers/{sid}")
async def get_supplier(sid: str, user=Depends(get_current_user)):
    d = clean(await db.suppliers.find_one({"id": sid}))
    if not d:
        raise HTTPException(404, "Not found")
    out, purch = await supplier_outstanding(sid)
    d["outstanding"] = out
    d["purchases"] = sorted(purch, key=lambda s: s.get("date", ""), reverse=True)
    d["total_purchases"] = round(sum(float(p.get("total") or 0) for p in purch), 2)
    d["num_purchases"] = len(purch)
    d["last_purchase"] = max([p.get("date", "") for p in purch], default="")
    d["payments"] = await db.payments.find({"type": "supplier", "party_id": sid}, {"_id": 0}).to_list(10000)
    return d


@api.post("/suppliers")
async def create_supplier(s: Supplier, user=Depends(get_current_user)):
    await db.suppliers.insert_one(s.model_dump())
    return s


@api.put("/suppliers/{sid}")
async def update_supplier(sid: str, body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    await db.suppliers.update_one({"id": sid}, {"$set": body})
    return clean(await db.suppliers.find_one({"id": sid}))


@api.delete("/suppliers/{sid}")
async def delete_supplier(sid: str, user=Depends(get_current_user)):
    await db.suppliers.delete_one({"id": sid})
    return {"ok": True}


# Products / Inventory
@api.get("/products")
async def list_products(user=Depends(get_current_user)):
    docs = await db.products.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    for d in docs:
        d["stock_value"] = round(float(d.get("quantity") or 0) * float(d.get("avg_cost") or 0), 2)
    return docs


@api.post("/products")
async def create_product(p: Product, user=Depends(get_current_user)):
    await db.products.insert_one(p.model_dump())
    return p


@api.put("/products/{pid}")
async def update_product(pid: str, body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    await db.products.update_one({"id": pid}, {"$set": body})
    return clean(await db.products.find_one({"id": pid}))


@api.delete("/products/{pid}")
async def delete_product(pid: str, user=Depends(get_current_user)):
    await db.products.delete_one({"id": pid})
    return {"ok": True}


@api.post("/products/{pid}/adjust")
async def adjust_product(pid: str, body: dict, user=Depends(get_current_user)):
    prod = clean(await db.products.find_one({"id": pid}))
    if not prod:
        raise HTTPException(404, "Not found")
    delta = float(body.get("delta") or 0)
    new_qty = float(prod.get("quantity") or 0) + delta
    await db.products.update_one({"id": pid}, {"$set": {"quantity": new_qty, "last_movement": now_iso()}})
    await db.adjustments.insert_one({"id": new_id(), "product_id": pid, "delta": delta,
                                     "reason": body.get("reason", ""), "date": today_str(), "created_at": now_iso()})
    return {"ok": True, "quantity": new_qty}


# Coils
@api.get("/coils")
async def list_coils(user=Depends(get_current_user)):
    return await db.coils.find({}, {"_id": 0}).sort("purchase_date", -1).to_list(10000)


@api.post("/coils")
async def create_coil(c: Coil, user=Depends(get_current_user)):
    if not c.remaining_weight:
        c.remaining_weight = c.original_weight
    await db.coils.insert_one(c.model_dump())
    return c


@api.put("/coils/{cid}")
async def update_coil(cid: str, body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    await db.coils.update_one({"id": cid}, {"$set": body})
    return clean(await db.coils.find_one({"id": cid}))


@api.delete("/coils/{cid}")
async def delete_coil(cid: str, user=Depends(get_current_user)):
    await db.coils.delete_one({"id": cid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Purchases
# ---------------------------------------------------------------------------
def compute_line_total(it: dict) -> float:
    base = float(it.get("quantity") or 0) * float(it.get("rate") or 0)
    base -= float(it.get("discount") or 0)
    base += base * float(it.get("gst") or 0) / 100.0
    base += float(it.get("freight") or 0)
    return round(base, 2)


@api.get("/purchases")
async def list_purchases(user=Depends(get_current_user)):
    return await db.purchases.find({}, {"_id": 0}).sort("date", -1).to_list(10000)


@api.post("/purchases")
async def create_purchase(p: Purchase, user=Depends(get_current_user)):
    d = p.model_dump()
    items = d["items"]
    for it in items:
        if not it.get("total"):
            it["total"] = compute_line_total(it)
    d["total"] = round(sum(float(it.get("total") or 0) for it in items) + float(d.get("freight") or 0), 2)
    d["supplier_id"] = await ensure_supplier(d.get("supplier_name", "")) or d.get("supplier_id", "")
    await apply_purchase_to_inventory(items)
    await db.purchases.insert_one(d)
    return clean(d)


@api.put("/purchases/{pid}")
async def update_purchase(pid: str, p: Purchase, user=Depends(get_current_user)):
    old = clean(await db.purchases.find_one({"id": pid}))
    if not old:
        raise HTTPException(404, "Not found")
    await reverse_purchase_inventory(old.get("items", []))
    d = p.model_dump()
    d["id"] = pid
    d["created_at"] = old.get("created_at", now_iso())
    items = d["items"]
    for it in items:
        if not it.get("total"):
            it["total"] = compute_line_total(it)
    d["total"] = round(sum(float(it.get("total") or 0) for it in items) + float(d.get("freight") or 0), 2)
    d["supplier_id"] = await ensure_supplier(d.get("supplier_name", "")) or d.get("supplier_id", "")
    await apply_purchase_to_inventory(items)
    await db.purchases.update_one({"id": pid}, {"$set": d})
    return clean(d)


@api.delete("/purchases/{pid}")
async def delete_purchase(pid: str, user=Depends(get_current_user)):
    old = clean(await db.purchases.find_one({"id": pid}))
    if not old:
        raise HTTPException(404, "Not found")
    await reverse_purchase_inventory(old.get("items", []))
    await db.purchases.delete_one({"id": pid})
    return {"ok": True}


# Sales
@api.get("/sales")
async def list_sales(user=Depends(get_current_user)):
    return await db.sales.find({}, {"_id": 0}).sort("date", -1).to_list(10000)


@api.post("/sales")
async def create_sale(s: Sale, user=Depends(get_current_user)):
    d = s.model_dump()
    items = d["items"]
    for it in items:
        if not it.get("total"):
            it["total"] = compute_line_total(it)
    d["total"] = round(sum(float(it.get("total") or 0) for it in items), 2)
    d["customer_id"] = await ensure_customer(d.get("customer_name", "")) or d.get("customer_id", "")
    cost = await apply_sale_to_inventory(items)
    for it in items:
        it.pop("_cost", None)
    d["cost"] = round(cost, 2)
    d["profit"] = round(d["total"] - cost, 2)
    if not d.get("invoice_number"):
        cnt = await db.sales.count_documents({})
        d["invoice_number"] = f"INV-{1001 + cnt}"
    await db.sales.insert_one(d)
    return clean(d)


@api.put("/sales/{sid}")
async def update_sale(sid: str, s: Sale, user=Depends(get_current_user)):
    old = clean(await db.sales.find_one({"id": sid}))
    if not old:
        raise HTTPException(404, "Not found")
    await reverse_sale_inventory(old.get("items", []))
    d = s.model_dump()
    d["id"] = sid
    d["created_at"] = old.get("created_at", now_iso())
    items = d["items"]
    for it in items:
        if not it.get("total"):
            it["total"] = compute_line_total(it)
    d["total"] = round(sum(float(it.get("total") or 0) for it in items), 2)
    d["customer_id"] = await ensure_customer(d.get("customer_name", "")) or d.get("customer_id", "")
    cost = await apply_sale_to_inventory(items)
    for it in items:
        it.pop("_cost", None)
    d["cost"] = round(cost, 2)
    d["profit"] = round(d["total"] - cost, 2)
    if not d.get("invoice_number"):
        d["invoice_number"] = old.get("invoice_number", "")
    await db.sales.update_one({"id": sid}, {"$set": d})
    return clean(d)


@api.delete("/sales/{sid}")
async def delete_sale(sid: str, user=Depends(get_current_user)):
    old = clean(await db.sales.find_one({"id": sid}))
    if not old:
        raise HTTPException(404, "Not found")
    await reverse_sale_inventory(old.get("items", []))
    await db.sales.delete_one({"id": sid})
    return {"ok": True}


@api.get("/sales/{sid}/invoice")
async def sale_invoice(sid: str, user=Depends(get_current_user)):
    s = clean(await db.sales.find_one({"id": sid}))
    if not s:
        raise HTTPException(404, "Not found")
    settings = await db.settings.find_one({"id": "app"}) or {}
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    orange = colors.HexColor("#F97316")
    y = h - 25 * mm
    c.setFillColor(orange)
    c.rect(0, h - 18 * mm, w, 18 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(18 * mm, h - 12 * mm, settings.get("business_name", "Vandana Steel & Roofing"))
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(18 * mm, y, "TAX INVOICE")
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 18 * mm, y, f"Invoice: {s.get('invoice_number', '')}")
    c.drawRightString(w - 18 * mm, y - 6 * mm, f"Date: {s.get('date', '')}")
    y -= 14 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(18 * mm, y, "Bill To:")
    c.setFont("Helvetica", 10)
    c.drawString(18 * mm, y - 5 * mm, s.get("customer_name", ""))
    y -= 16 * mm
    c.setFillColor(colors.HexColor("#16191E"))
    c.rect(18 * mm, y, w - 36 * mm, 8 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    cols = [20, 90, 115, 135, 160]
    c.drawString(cols[0] * mm, y + 2.5 * mm, "Product")
    c.drawString(cols[1] * mm, y + 2.5 * mm, "Qty")
    c.drawString(cols[2] * mm, y + 2.5 * mm, "Unit")
    c.drawString(cols[3] * mm, y + 2.5 * mm, "Rate")
    c.drawRightString((cols[4] + 20) * mm, y + 2.5 * mm, "Total")
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    y -= 7 * mm
    for it in s.get("items", []):
        c.drawString(cols[0] * mm, y, str(it.get("product", ""))[:32])
        c.drawString(cols[1] * mm, y, f"{it.get('quantity', '')}")
        c.drawString(cols[2] * mm, y, str(it.get("unit", "")))
        c.drawString(cols[3] * mm, y, f"{it.get('rate', '')}")
        c.drawRightString((cols[4] + 20) * mm, y, f"{it.get('total', '')}")
        y -= 6 * mm
    y -= 4 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString((cols[4] + 20) * mm, y, f"TOTAL: Rs. {s.get('total', 0):,.2f}")
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(colors.grey)
    c.drawString(18 * mm, 15 * mm, "Generated by Vandana")
    c.showPage()
    c.save()
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=invoice_{s.get('invoice_number', sid)}.pdf"})


# Payments
@api.get("/payments")
async def list_payments(user=Depends(get_current_user)):
    return await db.payments.find({}, {"_id": 0}).sort("date", -1).to_list(10000)


@api.post("/payments")
async def create_payment(p: Payment, user=Depends(get_current_user)):
    await db.payments.insert_one(p.model_dump())
    return p


@api.put("/payments/{pid}")
async def update_payment(pid: str, body: dict, user=Depends(get_current_user)):
    body.pop("id", None)
    if "amount" in body:
        body["amount"] = float(body.get("amount") or 0)
    await db.payments.update_one({"id": pid}, {"$set": body})
    return clean(await db.payments.find_one({"id": pid}))


@api.delete("/payments/{pid}")
async def delete_payment(pid: str, user=Depends(get_current_user)):
    await db.payments.delete_one({"id": pid})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api.get("/dashboard")
async def dashboard(range: str = "month", start: Optional[str] = None, end: Optional[str] = None,
                    user=Depends(get_current_user)):
    s, e = parse_date_range(range, start, end)
    sales = await db.sales.find({}, {"_id": 0}).to_list(100000)
    products = await db.products.find({}, {"_id": 0}).to_list(100000)
    customers = await db.customers.find({}, {"_id": 0}).to_list(100000)
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100000)

    today = today_str()
    month_start = datetime.now(timezone.utc).date().replace(day=1).isoformat()

    def sum_sales(pred):
        return round(sum(float(x.get("total") or 0) for x in sales if pred(x)), 2)

    def sum_profit(pred):
        return round(sum(float(x.get("profit") or 0) for x in sales if pred(x)), 2)

    ranged = [x for x in sales if in_range(x.get("date", ""), s, e)]
    ranged_sales = round(sum(float(x.get("total") or 0) for x in ranged), 2)
    ranged_profit = round(sum(float(x.get("profit") or 0) for x in ranged), 2)

    # growth: compare with previous equal-length period (month by default)
    prev_start, prev_end = parse_date_range("last_month", None, None)
    this_month_sales = sum_sales(lambda x: in_range(x.get("date", ""), month_start, today))
    last_month_sales = sum_sales(lambda x: in_range(x.get("date", ""), prev_start, prev_end))
    growth = round(((this_month_sales - last_month_sales) / last_month_sales * 100), 1) if last_month_sales else 0

    total_stock_value = round(sum(float(p.get("quantity") or 0) * float(p.get("avg_cost") or 0) for p in products), 2)
    total_stock_qty = round(sum(float(p.get("quantity") or 0) for p in products), 2)
    low_stock = [p for p in products if float(p.get("quantity") or 0) <= float(p.get("reorder_level") or 0) and float(p.get("reorder_level") or 0) > 0]

    cust_out = []
    overdue_total = 0.0
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=30)).isoformat()
    for c in customers:
        out, csales = await customer_outstanding(c["id"])
        if out > 0:
            overdue_amt = out if (min([cs.get("date", today) for cs in csales], default=today) < cutoff) else 0
            cust_out.append({"id": c["id"], "name": c["name"], "outstanding": out, "overdue": overdue_amt})
            overdue_total += overdue_amt
    total_cust_out = round(sum(c["outstanding"] for c in cust_out), 2)

    supp_out = []
    for sp in suppliers:
        out, _ = await supplier_outstanding(sp["id"])
        if out > 0:
            supp_out.append({"id": sp["id"], "name": sp["name"], "outstanding": out})
    total_supp_out = round(sum(x["outstanding"] for x in supp_out), 2)

    gross_margin = round((ranged_profit / ranged_sales * 100), 2) if ranged_sales else 0

    alerts = []
    for p in low_stock:
        alerts.append({"type": "low_stock", "text": f"Low stock: {p['name']} ({p.get('quantity',0)} {p.get('unit','')})"})
    for c in sorted(cust_out, key=lambda x: -x["overdue"])[:5]:
        if c["overdue"] > 0:
            alerts.append({"type": "overdue", "text": f"Overdue: {c['name']} owes Rs.{c['overdue']:,.0f}"})

    return {
        "range": {"start": s, "end": e, "key": range},
        "sales": {
            "today": sum_sales(lambda x: x.get("date", "")[:10] == today),
            "month": this_month_sales,
            "total": sum_sales(lambda x: True),
            "range": ranged_sales,
            "growth": growth,
        },
        "profit": {
            "today": sum_profit(lambda x: x.get("date", "")[:10] == today),
            "month": sum_profit(lambda x: in_range(x.get("date", ""), month_start, today)),
            "range": ranged_profit,
            "margin": gross_margin,
        },
        "inventory": {"stock_value": total_stock_value, "stock_qty": total_stock_qty,
                      "low_stock_count": len(low_stock), "low_stock": low_stock[:10]},
        "money": {"customer_outstanding": total_cust_out, "overdue": round(overdue_total, 2),
                  "supplier_outstanding": total_supp_out},
        "alerts": alerts,
        "top_customers_outstanding": sorted(cust_out, key=lambda x: -x["outstanding"])[:5],
    }


# ---------------------------------------------------------------------------
# AI Scanning
# ---------------------------------------------------------------------------
def resize_b64_png(img_bytes: bytes, max_dim=1600) -> str:
    img = Image.open(io.BytesIO(img_bytes))
    img = img.convert("RGB")
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return base64.b64encode(out.getvalue()).decode()


def pdf_to_images_b64(pdf_bytes: bytes, max_pages=3) -> List[str]:
    imgs = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        imgs.append(resize_b64_png(pix.tobytes("png")))
    doc.close()
    return imgs


def parse_llm_json(text: str) -> dict:
    text = text.strip()
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


SALE_EXTRACT_PROMPT = """You are an expert at reading handwritten steel/roofing sales bills from India.
Extract the following into strict JSON. Currency is Indian Rupees. Do NOT guess unclear values.
If a number or word is unclear (e.g. could be 500 or 5000), still give your best value but add that field name to "needs_review".

Return ONLY this JSON:
{
 "customer_name": "", "date": "YYYY-MM-DD",
 "items": [{"product":"","specification":"","thickness":"","quantity":0,"unit":"KG|MT|PCS|FEET|SQ FT|COIL","rate":0,"discount":0,"gst":0,"total":0,"needs_review":[]}],
 "total": 0,
 "needs_review": []
}
Products are things like PPGI coil, PPGL roofing sheet, GI sheet, MS pipe, GI pipe, steel tube, roofing accessories."""

PURCHASE_EXTRACT_PROMPT = """You are an expert at reading printed purchase/tax invoices for a steel & roofing business in India.
Extract into strict JSON. Currency is Indian Rupees. Do NOT invent values. If unclear, add field name to "needs_review".

Return ONLY this JSON:
{
 "supplier_name": "", "invoice_number": "", "date": "YYYY-MM-DD",
 "items": [{"product":"","specification":"","thickness":"","quantity":0,"unit":"KG|MT|PCS|FEET|SQ FT|COIL","rate":0,"gst":0,"freight":0,"total":0,"needs_review":[]}],
 "freight": 0, "total": 0,
 "needs_review": []
}"""


async def run_extraction(system_prompt: str, images_b64: List[str]) -> dict:
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"extract-{new_id()}",
                   system_message=system_prompt).with_model("openai", LLM_MODEL)
    contents = [ImageContent(image_base64=b) for b in images_b64]
    resp = await chat.send_message(UserMessage(text="Extract the data as strict JSON only.",
                                               file_contents=contents))
    text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    try:
        return parse_llm_json(text)
    except Exception as e:
        logger.error(f"JSON parse failed: {e} :: {text[:500]}")
        return {"error": "Could not read document clearly", "raw": text[:1000], "needs_review": ["all"]}


@api.post("/sales/scan")
async def scan_sale(file: UploadFile = File(...), user=Depends(get_current_user)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file. Please retake the photo.")
    try:
        b64 = resize_b64_png(data)
    except Exception as e:
        logger.warning(f"sale image decode failed: {e}")
        raise HTTPException(status_code=422, detail="Could not read that image. Please retake a clear, well-lit photo (JPG/PNG/HEIC).")
    result = await run_extraction(SALE_EXTRACT_PROMPT, [b64])
    try:
        path = f"{APP_NAME}/scans/sales/{new_id()}.png"
        put_object(path, base64.b64decode(b64), "image/png")
        result["scan_path"] = path
    except Exception as e:
        logger.warning(f"scan upload failed: {e}")
    return result


@api.post("/purchases/scan")
async def scan_purchase(file: UploadFile = File(...), user=Depends(get_current_user)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file. Please choose a file again.")
    fname = (file.filename or "").lower()
    ctype = (file.content_type or "").lower()
    try:
        if fname.endswith(".pdf") or "pdf" in ctype:
            images = pdf_to_images_b64(data)
        else:
            images = [resize_b64_png(data)]
    except Exception as e:
        logger.warning(f"purchase file decode failed: {e}")
        raise HTTPException(status_code=422, detail="Could not read that file. Please upload a clear PDF or image invoice.")
    if not images:
        raise HTTPException(status_code=422, detail="No readable pages found in the document.")
    result = await run_extraction(PURCHASE_EXTRACT_PROMPT, images)
    return result


# ---------------------------------------------------------------------------
# Business snapshot for analytics
# ---------------------------------------------------------------------------
async def build_snapshot(s: Optional[str], e: Optional[str]) -> dict:
    sales = await db.sales.find({}, {"_id": 0}).to_list(100000)
    purchases = await db.purchases.find({}, {"_id": 0}).to_list(100000)
    products = await db.products.find({}, {"_id": 0}).to_list(100000)
    customers = await db.customers.find({}, {"_id": 0}).to_list(100000)
    suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100000)

    ranged_sales = [x for x in sales if in_range(x.get("date", ""), s, e)]

    # per-product profitability
    prod_stats = {}
    for sale in ranged_sales:
        for it in sale.get("items", []):
            key = it.get("product", "Unknown")
            st = prod_stats.setdefault(key, {"product": key, "sales": 0, "qty": 0, "num_sales": 0})
            st["sales"] += float(it.get("total") or 0)
            st["qty"] += float(it.get("quantity") or 0)
            st["num_sales"] += 1
        # distribute cost by proportion of total (approx)
    for sale in ranged_sales:
        tot = float(sale.get("total") or 0) or 1
        cost = float(sale.get("cost") or 0)
        for it in sale.get("items", []):
            key = it.get("product", "Unknown")
            share = float(it.get("total") or 0) / tot
            prod_stats.setdefault(key, {"product": key, "sales": 0, "qty": 0, "num_sales": 0}).setdefault("cost", 0)
            prod_stats[key]["cost"] = prod_stats[key].get("cost", 0) + cost * share
    prod_list = []
    for st in prod_stats.values():
        st["cost"] = round(st.get("cost", 0), 2)
        st["sales"] = round(st["sales"], 2)
        st["profit"] = round(st["sales"] - st["cost"], 2)
        st["margin_pct"] = round((st["profit"] / st["sales"] * 100), 2) if st["sales"] else 0
        prod_list.append(st)
    prod_list.sort(key=lambda x: -x["profit"])

    # per-customer
    cust_stats = []
    for c in customers:
        csales = [x for x in ranged_sales if x.get("customer_id") == c["id"] or x.get("customer_name") == c["name"]]
        out, allsales = await customer_outstanding(c["id"])
        cust_stats.append({
            "customer": c["name"], "num_purchases": len(csales),
            "sales": round(sum(float(x.get("total") or 0) for x in csales), 2),
            "profit": round(sum(float(x.get("profit") or 0) for x in csales), 2),
            "outstanding": out,
            "last_purchase": max([x.get("date", "") for x in allsales], default=""),
        })
    cust_stats.sort(key=lambda x: -x["sales"])

    # per-supplier
    supp_stats = []
    for sp in suppliers:
        spur = [x for x in purchases if x.get("supplier_id") == sp["id"] or x.get("supplier_name") == sp["name"]]
        out, _ = await supplier_outstanding(sp["id"])
        supp_stats.append({
            "supplier": sp["name"], "num_purchases": len(spur),
            "purchase_value": round(sum(float(x.get("total") or 0) for x in spur), 2),
            "outstanding": out,
        })
    supp_stats.sort(key=lambda x: -x["purchase_value"])

    inv = [{"product": p["name"], "specification": p.get("specification", ""), "quantity": p.get("quantity", 0),
            "unit": p.get("unit", ""), "avg_cost": p.get("avg_cost", 0),
            "stock_value": round(float(p.get("quantity") or 0) * float(p.get("avg_cost") or 0), 2),
            "last_movement": p.get("last_movement", "")[:10]} for p in products]

    return {
        "date_range": {"start": s or "all-time", "end": e or "today"},
        "totals": {
            "total_sales": round(sum(float(x.get("total") or 0) for x in ranged_sales), 2),
            "total_profit": round(sum(float(x.get("profit") or 0) for x in ranged_sales), 2),
            "num_sales": len(ranged_sales),
            "total_stock_value": round(sum(i["stock_value"] for i in inv), 2),
        },
        "product_profitability": prod_list,
        "customers": cust_stats,
        "suppliers": supp_stats,
        "inventory": inv,
        "recent_sales": sorted(ranged_sales, key=lambda x: x.get("date", ""), reverse=True)[:20],
    }


@api.post("/analytics/ask")
async def analytics_ask(body: AskBody, user=Depends(get_current_user)):
    s, e = parse_date_range(body.range, body.start, body.end) if body.range != "all" else (None, None)
    snapshot = await build_snapshot(s, e)

    session_id = body.session_id or new_id()
    history = await db.analytics_chats.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(20)
    hist_text = ""
    for h in history[-6:]:
        hist_text += f"\nPrevious Q: {h['question']}\nPrevious A: {h['answer']}\n"

    system = """You are the business analyst for a private Steel & Roofing trading business in India (currency Rupees, symbol Rs.).
You answer ONLY using the real DATA provided. NEVER invent numbers. If the data does not contain the answer, say so plainly.
Rules:
- Be concise and direct. Answer the actual question first, then show the supporting calculation/figures.
- Format money as Rs. with Indian style where natural (e.g. Rs. 8,50,000).
- When useful, show the key numbers used (Sales, Cost, Gross Profit, Margin %, count).
- Understand follow-up questions using the prior conversation context.
- Handle both plain lookups ("Find customer Ravi") and analytical questions ("Which product gives most profit?").
- Keep answers short and scannable. Use short lines, not long paragraphs."""

    prompt = f"""DATA (JSON, respect the date range {snapshot['date_range']}):
{json.dumps(snapshot, default=str)}

{hist_text}
CURRENT QUESTION: {body.question}

Answer using only the DATA above."""

    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system).with_model("openai", LLM_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    answer = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))

    await db.analytics_chats.insert_one({"id": new_id(), "session_id": session_id,
                                         "question": body.question, "answer": answer, "created_at": now_iso()})
    return {"answer": answer, "session_id": session_id}


# ---------------------------------------------------------------------------
# Reports & Export
# ---------------------------------------------------------------------------
@api.get("/reports/{kind}")
async def reports(kind: str, range: str = "month", start: Optional[str] = None, end: Optional[str] = None,
                  user=Depends(get_current_user)):
    s, e = parse_date_range(range, start, end)
    if kind == "sales":
        sales = await db.sales.find({}, {"_id": 0}).to_list(100000)
        rows = []
        for x in sales:
            if not in_range(x.get("date", ""), s, e):
                continue
            for it in x.get("items", []):
                rows.append({"date": x.get("date"), "customer": x.get("customer_name"),
                             "product": it.get("product"), "quantity": it.get("quantity"),
                             "unit": it.get("unit"), "sales": it.get("total")})
        return {"rows": rows, "totals": {"sales": round(sum(r["sales"] or 0 for r in rows), 2)}}
    if kind == "purchase":
        purch = await db.purchases.find({}, {"_id": 0}).to_list(100000)
        rows = []
        for x in purch:
            if not in_range(x.get("date", ""), s, e):
                continue
            for it in x.get("items", []):
                rows.append({"date": x.get("date"), "supplier": x.get("supplier_name"),
                             "product": it.get("product"), "quantity": it.get("quantity"),
                             "unit": it.get("unit"), "value": it.get("total")})
        return {"rows": rows, "totals": {"value": round(sum(r["value"] or 0 for r in rows), 2)}}
    if kind == "inventory":
        products = await db.products.find({}, {"_id": 0}).to_list(100000)
        rows = [{"product": p["name"], "quantity": p.get("quantity"), "unit": p.get("unit"),
                 "avg_cost": p.get("avg_cost"),
                 "stock_value": round(float(p.get("quantity") or 0) * float(p.get("avg_cost") or 0), 2)} for p in products]
        return {"rows": rows, "totals": {"stock_value": round(sum(r["stock_value"] for r in rows), 2)}}
    if kind == "customer_outstanding":
        customers = await db.customers.find({}, {"_id": 0}).to_list(100000)
        rows = []
        for c in customers:
            out, csales = await customer_outstanding(c["id"])
            billed = round(sum(float(x.get("total") or 0) for x in csales), 2)
            rows.append({"customer": c["name"], "sales": billed, "balance": out})
        return {"rows": rows, "totals": {"balance": round(sum(r["balance"] for r in rows), 2)}}
    if kind == "supplier_outstanding":
        suppliers = await db.suppliers.find({}, {"_id": 0}).to_list(100000)
        rows = []
        for sp in suppliers:
            out, spur = await supplier_outstanding(sp["id"])
            billed = round(sum(float(x.get("total") or 0) for x in spur), 2)
            rows.append({"supplier": sp["name"], "purchases": billed, "balance": out})
        return {"rows": rows, "totals": {"balance": round(sum(r["balance"] for r in rows), 2)}}
    if kind == "profit":
        sales = await db.sales.find({}, {"_id": 0}).to_list(100000)
        ranged = [x for x in sales if in_range(x.get("date", ""), s, e)]
        total = round(sum(float(x.get("total") or 0) for x in ranged), 2)
        cost = round(sum(float(x.get("cost") or 0) for x in ranged), 2)
        profit = round(total - cost, 2)
        rows = [{"date": x.get("date"), "customer": x.get("customer_name"), "sales": x.get("total"),
                 "cost": x.get("cost"), "profit": x.get("profit")} for x in ranged]
        return {"rows": rows, "totals": {"sales": total, "cost": cost, "profit": profit,
                                         "margin": round((profit / total * 100), 2) if total else 0}}
    raise HTTPException(404, "Unknown report")


@api.get("/export/{entity}")
async def export_csv(entity: str, user=Depends(get_current_user)):
    import csv
    buf = io.StringIO()
    writer = csv.writer(buf)
    if entity == "sales":
        docs = await db.sales.find({}, {"_id": 0}).to_list(100000)
        writer.writerow(["Date", "Invoice", "Customer", "Total", "Cost", "Profit"])
        for d in docs:
            writer.writerow([d.get("date"), d.get("invoice_number"), d.get("customer_name"),
                             d.get("total"), d.get("cost"), d.get("profit")])
    elif entity == "purchases":
        docs = await db.purchases.find({}, {"_id": 0}).to_list(100000)
        writer.writerow(["Date", "Invoice", "Supplier", "Total"])
        for d in docs:
            writer.writerow([d.get("date"), d.get("invoice_number"), d.get("supplier_name"), d.get("total")])
    elif entity == "inventory":
        docs = await db.products.find({}, {"_id": 0}).to_list(100000)
        writer.writerow(["Product", "Specification", "Quantity", "Unit", "Avg Cost", "Stock Value"])
        for d in docs:
            writer.writerow([d.get("name"), d.get("specification"), d.get("quantity"), d.get("unit"),
                             d.get("avg_cost"), round(float(d.get("quantity") or 0) * float(d.get("avg_cost") or 0), 2)])
    elif entity == "customers":
        docs = await db.customers.find({}, {"_id": 0}).to_list(100000)
        writer.writerow(["Name", "Mobile", "GSTIN", "Credit Limit"])
        for d in docs:
            writer.writerow([d.get("name"), d.get("mobile"), d.get("gstin"), d.get("credit_limit")])
    elif entity == "all":
        # full JSON backup
        out = {}
        for col in ["sales", "purchases", "products", "customers", "suppliers", "payments", "coils"]:
            out[col] = await db[col].find({}, {"_id": 0}).to_list(100000)
        return Response(content=json.dumps(out, default=str, indent=2), media_type="application/json",
                        headers={"Content-Disposition": "attachment; filename=steelbiz_backup.json"})
    else:
        raise HTTPException(404, "Unknown entity")
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename={entity}.csv"})


# Settings
@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    return clean(await db.settings.find_one({"id": "app"})) or {"id": "app", "business_name": "Vandana Steel & Roofing",
                                                                "gstin": "", "address": "", "phone": ""}


@api.put("/settings")
async def put_settings(body: dict, user=Depends(get_current_user)):
    body["id"] = "app"
    await db.settings.update_one({"id": "app"}, {"$set": body}, upsert=True)
    return clean(await db.settings.find_one({"id": "app"}))


@api.get("/health")
async def health():
    return {"status": "ok", "time": now_iso()}


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    owner = await db.owner.find_one({"email": ADMIN_EMAIL})
    if not owner:
        await db.owner.insert_one({"email": ADMIN_EMAIL, "pin_hash": hash_pin(ADMIN_PIN), "created_at": now_iso()})
        logger.info("Owner seeded")
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as ex:
        logger.warning(f"Storage init failed: {ex}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
