import json, urllib.request

URL = "https://sbxjobepecuyhkmbfysw.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNieGpvYmVwZWN1eWhrbWJmeXN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0Nzc1NzksImV4cCI6MjEwNjA1MzU3OX0.YApgBQR9JQlbaCCiIfOtiRo0cpGNA7tTMtYFAt3qVWc"

def req(path, method="GET", body=None, token=None):
    r = urllib.request.Request(URL + path, method=method)
    r.add_header("apikey", KEY)
    if token: r.add_header("Authorization", "Bearer " + token)
    if body is not None:
        r.add_header("Content-Type", "application/json")
        r.data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        print("ERROR", e.code, e.read().decode()[:300])
        return None

# 1. Login as demo
sess = req("/auth/v1/token?grant_type=password", "POST",
           {"email": "demo@mmhills.com", "password": "demo1234"})
tok = sess["access_token"]
uid = sess["user"]["id"]
print("logged in", uid)

# 2. Promote self to admin (own-row update allowed by profiles_update_self)
req(f"/rest/v1/profiles?id=eq.{uid}", "PATCH", {"role": "admin"}, tok)

# Verify role
p = req(f"/rest/v1/profiles?id=eq.{uid}&select=role", token=tok)
print("role:", p)

# 3. Seed demo products (no barcode column until phase 2-3 migration is run)
products = [
    {"name": "Cement 40kg", "sku": "CEM-40-001", "category": "Cement", "price": 350, "stock": 145, "reorder_point": 50},
    {"name": "Cement 50kg", "sku": "CEM-50-001", "category": "Cement", "price": 420, "stock": 78, "reorder_point": 40},
    {"name": "Nails 2\" (per kg)", "sku": "NAIL-2-001", "category": "Fasteners", "price": 85, "stock": 5, "reorder_point": 20},
    {"name": "Paint Brush 3\"", "sku": "PB-3-001", "category": "Paint Tools", "price": 45, "stock": 60, "reorder_point": 15},
    {"name": "Paint White 1L", "sku": "PNT-W-001", "category": "Paint", "price": 290, "stock": 30, "reorder_point": 10},
    {"name": "Hollow Blocks 6\"", "sku": "HB-6-001", "category": "Masonry", "price": 18, "stock": 500, "reorder_point": 100},
    {"name": "Steel Bar 12mm", "sku": "STL-12-001", "category": "Steel", "price": 210, "stock": 90, "reorder_point": 30},
    {"name": "Sand (per cubic)", "sku": "SAND-CU-01", "category": "Aggregates", "price": 1200, "stock": 25, "reorder_point": 5},
]
print(req("/rest/v1/products", "POST", products, tok) is not None)
print("DONE")
