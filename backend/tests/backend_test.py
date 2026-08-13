"""SteelBiz backend API tests"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
PIN = "112233"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"pin": PIN}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------------- Auth ----------------
def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_wrong_pin():
    r = requests.post(f"{API}/auth/login", json={"pin": "000000"}, timeout=15)
    assert r.status_code == 401


def test_login_ok(token):
    assert len(token) > 20


def test_me(client):
    r = client.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert "email" in r.json()


def test_auth_required():
    r = requests.get(f"{API}/customers")
    assert r.status_code == 401


# ---------------- Dashboard ----------------
@pytest.mark.parametrize("rng", ["today", "week", "month", "year", "all"])
def test_dashboard_ranges(client, rng):
    r = client.get(f"{API}/dashboard?range={rng}")
    assert r.status_code == 200
    d = r.json()
    for k in ["sales", "profit", "inventory", "money", "alerts"]:
        assert k in d


# ---------------- Customers ----------------
def test_customer_crud(client):
    payload = {"name": "TEST_Cust", "mobile": "9999", "credit_limit": 1000}
    r = client.post(f"{API}/customers", json=payload)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    # list
    r = client.get(f"{API}/customers")
    assert r.status_code == 200
    assert any(c["id"] == cid for c in r.json())
    # detail
    r = client.get(f"{API}/customers/{cid}")
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Cust"
    assert "outstanding" in r.json()
    # cleanup
    client.delete(f"{API}/customers/{cid}")


# ---------------- Suppliers ----------------
def test_supplier_crud(client):
    r = client.post(f"{API}/suppliers", json={"name": "TEST_Supp"})
    assert r.status_code == 200
    sid = r.json()["id"]
    r = client.get(f"{API}/suppliers/{sid}")
    assert r.status_code == 200
    assert r.json()["name"] == "TEST_Supp"
    client.delete(f"{API}/suppliers/{sid}")


# ---------------- Products & Inventory ----------------
def test_product_crud_and_adjust(client):
    r = client.post(f"{API}/products", json={"name": "TEST_Prod", "unit": "KG",
                                             "quantity": 10, "avg_cost": 50})
    assert r.status_code == 200
    pid = r.json()["id"]
    # adjust +5
    r = client.post(f"{API}/products/{pid}/adjust", json={"delta": 5, "reason": "test"})
    assert r.status_code == 200
    assert r.json()["quantity"] == 15
    client.delete(f"{API}/products/{pid}")


def test_coil_crud(client):
    r = client.post(f"{API}/coils", json={"coil_number": "TEST_C1", "original_weight": 500})
    assert r.status_code == 200
    cid = r.json()["id"]
    assert r.json()["remaining_weight"] == 500
    r = client.get(f"{API}/coils")
    assert any(c["id"] == cid for c in r.json())
    client.delete(f"{API}/coils/{cid}")


# ---------------- Purchase & Sale flow with inventory change ----------------
def test_purchase_and_sale_flow(client):
    # create product
    pr = client.post(f"{API}/products", json={"name": "TEST_Flow", "unit": "KG",
                                              "quantity": 0, "avg_cost": 0}).json()
    pid = pr["id"]
    # supplier & customer
    sup = client.post(f"{API}/suppliers", json={"name": "TEST_SupplierFlow"}).json()
    cus = client.post(f"{API}/customers", json={"name": "TEST_CustFlow"}).json()

    # purchase 100 @ 100
    purchase = {
        "supplier_id": sup["id"], "supplier_name": sup["name"],
        "items": [{"product": "TEST_Flow", "quantity": 100, "unit": "KG", "rate": 100}],
    }
    r = client.post(f"{API}/purchases", json=purchase)
    assert r.status_code == 200, r.text
    ptotal = r.json()["total"]
    assert ptotal == 10000

    # inventory should now be 100 with avg_cost 100
    prods = client.get(f"{API}/products").json()
    p = next(x for x in prods if x["id"] == pid)
    assert p["quantity"] == 100
    assert p["avg_cost"] == 100

    # sale 10 @ 150
    sale = {
        "customer_id": cus["id"], "customer_name": cus["name"],
        "items": [{"product": "TEST_Flow", "quantity": 10, "unit": "KG", "rate": 150}],
    }
    r = client.post(f"{API}/sales", json=sale)
    assert r.status_code == 200, r.text
    sd = r.json()
    assert sd["total"] == 1500
    assert sd["cost"] == 1000
    assert sd["profit"] == 500
    assert sd["invoice_number"].startswith("INV-")
    sid = sd["id"]

    # inventory decreased
    prods = client.get(f"{API}/products").json()
    p = next(x for x in prods if x["id"] == pid)
    assert p["quantity"] == 90

    # invoice PDF
    r = client.get(f"{API}/sales/{sid}/invoice")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.content[:4] == b"%PDF"

    # payment reduces customer outstanding
    out_before = client.get(f"{API}/customers/{cus['id']}").json()["outstanding"]
    assert out_before == 1500
    r = client.post(f"{API}/payments", json={"type": "customer", "party_id": cus["id"],
                                             "party_name": cus["name"], "amount": 500, "mode": "Cash"})
    assert r.status_code == 200
    out_after = client.get(f"{API}/customers/{cus['id']}").json()["outstanding"]
    assert out_after == 1000

    # cleanup
    client.delete(f"{API}/products/{pid}")
    client.delete(f"{API}/suppliers/{sup['id']}")
    client.delete(f"{API}/customers/{cus['id']}")


# ---------------- Reports ----------------
@pytest.mark.parametrize("kind", ["sales", "purchase", "inventory",
                                  "customer_outstanding", "supplier_outstanding", "profit"])
def test_reports(client, kind):
    r = client.get(f"{API}/reports/{kind}?range=year")
    assert r.status_code == 200
    j = r.json()
    assert "rows" in j and "totals" in j


# ---------------- Export ----------------
@pytest.mark.parametrize("entity", ["sales", "purchases", "inventory", "customers", "all"])
def test_export(client, entity):
    r = client.get(f"{API}/export/{entity}")
    assert r.status_code == 200
    assert len(r.content) > 0


# ---------------- Analytics ----------------
def test_analytics_ask(client):
    r = client.post(f"{API}/analytics/ask", json={"question": "Which product gives me the most profit?",
                                                  "range": "all"}, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "answer" in j and isinstance(j["answer"], str) and len(j["answer"]) > 5
    assert "session_id" in j
    # follow-up
    sid = j["session_id"]
    r2 = client.post(f"{API}/analytics/ask", json={"question": "Which customers bought it?",
                                                    "range": "all", "session_id": sid}, timeout=90)
    assert r2.status_code == 200
    assert len(r2.json()["answer"]) > 5


# ---------------- Settings ----------------
def test_settings(client):
    r = client.get(f"{API}/settings")
    assert r.status_code == 200



# ---------------- Scan endpoints (bug fix verify) ----------------
def _make_jpg_bytes():
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (800, 600), "white")
    d = ImageDraw.Draw(img)
    d.text((30, 30), "Customer: Ravi Traders\nGI Pipe 10 KG @ 100\nTotal 1000", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_sales_scan_valid_image_returns_200(token):
    jpg = _make_jpg_bytes()
    r = requests.post(f"{API}/sales/scan",
                      headers=_auth_headers(token),
                      files={"file": ("bill.jpg", jpg, "image/jpeg")},
                      timeout=180)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
    j = r.json()
    # tolerate LLM parse fallback shape too
    assert isinstance(j, dict)
    assert ("items" in j) or ("error" in j) or ("needs_review" in j)


def test_sales_scan_garbage_returns_422(token):
    r = requests.post(f"{API}/sales/scan",
                      headers=_auth_headers(token),
                      files={"file": ("junk.txt", b"this is not an image at all", "text/plain")},
                      timeout=60)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:300]}"
    assert "detail" in r.json()


def test_sales_scan_empty_returns_400(token):
    r = requests.post(f"{API}/sales/scan",
                      headers=_auth_headers(token),
                      files={"file": ("empty.jpg", b"", "image/jpeg")},
                      timeout=30)
    assert r.status_code == 400


def test_purchases_scan_valid_image_returns_200(token):
    jpg = _make_jpg_bytes()
    r = requests.post(f"{API}/purchases/scan",
                      headers=_auth_headers(token),
                      files={"file": ("inv.jpg", jpg, "image/jpeg")},
                      timeout=180)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:400]}"
    j = r.json()
    assert isinstance(j, dict)


def test_purchases_scan_garbage_returns_422(token):
    r = requests.post(f"{API}/purchases/scan",
                      headers=_auth_headers(token),
                      files={"file": ("junk.txt", b"not an invoice", "text/plain")},
                      timeout=60)
    assert r.status_code == 422
    assert "detail" in r.json()


def test_settings_default_business_name(client):
    r = client.get(f"{API}/settings")
    assert r.status_code == 200
    # If nothing set, backend now defaults to Vandana branding
    name = r.json().get("business_name", "")
    # allow either a persisted custom value or the new default; only assert absence of legacy default
    assert "SteelBiz" not in name


# ---------------- New enhancements: auto-create + edit reverse ----------------
def _find_product_id_by_name(client, name):
    prods = client.get(f"{API}/products").json()
    for p in prods:
        if p["name"] == name:
            return p
    return None


def test_sale_auto_creates_customer_and_edit_reverses_inventory(client):
    # setup product with known qty
    prod = client.post(f"{API}/products", json={"name": "TEST_EditProd", "unit": "KG",
                                                "quantity": 100, "avg_cost": 50}).json()
    pid = prod["id"]
    new_cust_name = "TEST_AutoCustUI"
    # ensure absent
    for c in client.get(f"{API}/customers").json():
        if c["name"].lower() == new_cust_name.lower():
            client.delete(f"{API}/customers/{c['id']}")

    # create sale with brand-new customer name (no customer_id)
    sale = {"customer_name": new_cust_name,
            "items": [{"product": "TEST_EditProd", "quantity": 10, "unit": "KG", "rate": 100}]}
    r = client.post(f"{API}/sales", json=sale)
    assert r.status_code == 200, r.text
    sd = r.json()
    sid = sd["id"]
    assert sd["total"] == 1000
    assert sd["profit"] == 500  # 1000 - (10 * 50)

    # customer now exists
    custs = client.get(f"{API}/customers").json()
    match = [c for c in custs if c["name"].lower() == new_cust_name.lower()]
    assert match, "auto-create customer failed"
    cust_id = match[0]["id"]

    # inventory decreased 100 -> 90
    p2 = _find_product_id_by_name(client, "TEST_EditProd")
    assert p2["quantity"] == 90

    # edit the sale: change qty from 10 to 25 -> inventory should be 100-25=75; total=2500; profit=2500-1250=1250
    upd = {"customer_name": new_cust_name, "customer_id": cust_id,
           "items": [{"product": "TEST_EditProd", "quantity": 25, "unit": "KG", "rate": 100}]}
    r = client.put(f"{API}/sales/{sid}", json=upd)
    assert r.status_code == 200, r.text
    sd2 = r.json()
    assert sd2["total"] == 2500
    assert sd2["profit"] == 1250
    p3 = _find_product_id_by_name(client, "TEST_EditProd")
    assert p3["quantity"] == 75, f"expected 75 after edit, got {p3['quantity']}"

    # cleanup
    client.delete(f"{API}/sales/{sid}") if False else None  # no delete endpoint required
    client.delete(f"{API}/customers/{cust_id}")
    client.delete(f"{API}/products/{pid}")


def test_purchase_auto_creates_supplier_and_edit_reverses_inventory(client):
    new_sup_name = "TEST_AutoSupUI"
    for s in client.get(f"{API}/suppliers").json():
        if s["name"].lower() == new_sup_name.lower():
            client.delete(f"{API}/suppliers/{s['id']}")

    # brand-new product name (free text allowed on purchase)
    prod_name = "TEST_NewPurchProd"
    # remove if pre-existing
    for p in client.get(f"{API}/products").json():
        if p["name"] == prod_name:
            client.delete(f"{API}/products/{p['id']}")

    purchase = {"supplier_name": new_sup_name,
                "items": [{"product": prod_name, "quantity": 20, "unit": "KG", "rate": 60}]}
    r = client.post(f"{API}/purchases", json=purchase)
    assert r.status_code == 200, r.text
    pd = r.json()
    pid_purchase = pd["id"]
    assert pd["total"] == 20 * 60

    # supplier auto-created
    sups = client.get(f"{API}/suppliers").json()
    match = [s for s in sups if s["name"].lower() == new_sup_name.lower()]
    assert match, "supplier auto-create failed"
    sup_id = match[0]["id"]

    # product now exists with qty 20
    p_new = _find_product_id_by_name(client, prod_name)
    assert p_new is not None
    assert p_new["quantity"] == 20

    # edit purchase: change qty to 50; inventory should reverse 20 then add 50 -> 50
    upd = {"supplier_name": new_sup_name, "supplier_id": sup_id,
           "items": [{"product": prod_name, "quantity": 50, "unit": "KG", "rate": 60}]}
    r = client.put(f"{API}/purchases/{pid_purchase}", json=upd)
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 50 * 60
    p_after = _find_product_id_by_name(client, prod_name)
    assert p_after["quantity"] == 50, f"expected 50 after edit, got {p_after['quantity']}"

    # cleanup
    client.delete(f"{API}/suppliers/{sup_id}")
    client.delete(f"{API}/products/{p_after['id']}")


def test_ensure_customer_case_insensitive(client):
    name = "TEST_CaseCust"
    # create initially via a sale
    r = client.post(f"{API}/sales", json={
        "customer_name": name,
        "items": [{"product": "NON_EXIST_PROD_X", "quantity": 1, "unit": "PCS", "rate": 10}],
    })
    assert r.status_code == 200
    # second sale using different case should NOT create a duplicate
    r = client.post(f"{API}/sales", json={
        "customer_name": name.lower(),
        "items": [{"product": "NON_EXIST_PROD_X", "quantity": 1, "unit": "PCS", "rate": 10}],
    })
    assert r.status_code == 200
    custs = [c for c in client.get(f"{API}/customers").json() if c["name"].lower() == name.lower()]
    assert len(custs) == 1, f"expected 1 customer, got {len(custs)}"
    client.delete(f"{API}/customers/{custs[0]['id']}")
