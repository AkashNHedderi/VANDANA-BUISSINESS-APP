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
