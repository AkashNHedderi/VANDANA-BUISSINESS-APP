"""Tests for same-name/different-spec product creation and sale confirmation."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PIN = "112233"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pin": PIN}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def created_ids():
    ids = {"products": [], "sales": []}
    yield ids


def test_login(token):
    assert token


def test_create_variant_same_name_diff_spec(client, created_ids):
    # first variant
    r1 = client.post(f"{BASE_URL}/api/products",
                     json={"name": "QATest Sheet", "specification": "0.40mm", "unit": "PCS", "quantity": 10, "avg_cost": 100})
    assert r1.status_code == 200, r1.text
    p1 = r1.json()
    created_ids["products"].append(p1["id"])

    # second variant - different spec - should succeed (previously 409)
    r2 = client.post(f"{BASE_URL}/api/products",
                     json={"name": "QATest Sheet", "specification": "0.50mm", "unit": "PCS", "quantity": 5, "avg_cost": 120})
    assert r2.status_code == 200, r2.text
    p2 = r2.json()
    created_ids["products"].append(p2["id"])
    assert p1["id"] != p2["id"]
    assert p2["specification"] == "0.50mm"


def test_duplicate_exact_spec_blocked(client):
    r3 = client.post(f"{BASE_URL}/api/products",
                     json={"name": "QATest Sheet", "specification": "0.40mm", "unit": "PCS"})
    assert r3.status_code == 409, r3.text


def test_both_variants_listed(client):
    r = client.get(f"{BASE_URL}/api/products")
    assert r.status_code == 200
    names = [(p["name"], p.get("specification", "")) for p in r.json()]
    assert ("QATest Sheet", "0.40mm") in names
    assert ("QATest Sheet", "0.50mm") in names


def test_sale_with_specific_variant(client, created_ids):
    # Sale with 0.50mm variant - ensure correct variant decremented
    products_before = {p["id"]: p["quantity"] for p in client.get(f"{BASE_URL}/api/products").json() if p["name"] == "QATest Sheet"}

    payload = {
        "customer_name": "Ravi Traders",
        "items": [{
            "product": "QATest Sheet",
            "specification": "0.50mm",
            "quantity": 2,
            "unit": "PCS",
            "rate": 150,
            "gst": 0,
            "discount": 0,
        }],
    }
    r = client.post(f"{BASE_URL}/api/sales", json=payload)
    assert r.status_code == 200, r.text
    sale = r.json()
    created_ids["sales"].append(sale["id"])
    assert sale["items"][0]["specification"] == "0.50mm"
    assert sale["total"] > 0

    # verify stock decremented on 0.50mm variant only
    products_after = {p["id"]: (p["quantity"], p.get("specification")) for p in client.get(f"{BASE_URL}/api/products").json() if p["name"] == "QATest Sheet"}
    for pid, before_qty in products_before.items():
        after_qty, spec = products_after[pid]
        if spec == "0.50mm":
            assert after_qty == before_qty - 2, f"0.50mm should decrement by 2, got {before_qty}->{after_qty}"
        else:
            assert after_qty == before_qty, f"0.40mm should be unchanged, got {before_qty}->{after_qty}"


def test_cleanup(client, created_ids):
    for sid in created_ids["sales"]:
        client.delete(f"{BASE_URL}/api/sales/{sid}")
    for pid in created_ids["products"]:
        client.delete(f"{BASE_URL}/api/products/{pid}")
