"""
Dropzyy 1 - MongoDB Database Configuration & Helper Functions
Supports MongoDB Atlas (Cloud) and Local MongoDB instances.
"""
import os
import re
import datetime
from typing import Optional, List, Dict, Any
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from dotenv import load_dotenv

load_dotenv()

# Read URI from environment variables (.env file)
MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
DIRECT_MONGODB_URI = os.getenv("DIRECT_MONGODB_URI", "").strip()

if MONGODB_URI and "tlsAllowInvalidCertificates" not in MONGODB_URI:
    MONGODB_URI += "&tlsAllowInvalidCertificates=true" if "?" in MONGODB_URI else "?tlsAllowInvalidCertificates=true"

MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "dropzyy").strip()

_mongo_client: Optional[MongoClient] = None

def get_mongo_client() -> Optional[MongoClient]:
    global _mongo_client
    if _mongo_client is not None:
        try:
            _mongo_client.admin.command('ping')
            return _mongo_client
        except Exception:
            _mongo_client = None

    try:
        import certifi
        ca_file = certifi.where()
    except Exception:
        ca_file = None

    attempts = [
        {"uri": MONGODB_URI, "kwargs": {"tlsAllowInvalidCertificates": True, "serverSelectionTimeoutMS": 10000}},
        {"uri": MONGODB_URI, "kwargs": {"tls": True, "tlsAllowInvalidCertificates": True, "serverSelectionTimeoutMS": 10000}},
        {"uri": MONGODB_URI, "kwargs": {"serverSelectionTimeoutMS": 10000}}
    ]
    if DIRECT_MONGODB_URI:
        attempts.insert(2, {"uri": DIRECT_MONGODB_URI, "kwargs": {"tlsAllowInvalidCertificates": True, "serverSelectionTimeoutMS": 10000}})
    if ca_file and MONGODB_URI:
        attempts.insert(0, {"uri": MONGODB_URI, "kwargs": {"tlsCAFile": ca_file, "serverSelectionTimeoutMS": 10000}})

    for att in attempts:
        try:
            c = MongoClient(att["uri"], **att["kwargs"])
            c.admin.command('ping')
            _mongo_client = c
            print(f"[MONGODB SUCCESS] Connected to MongoDB Atlas Cloud Database: {MONGODB_DB_NAME}")
            return _mongo_client
        except Exception as err:
            print(f"[MONGODB CONNECTION NOTICE]: {err}")

    print("[MONGODB WARNING] Could not connect to MongoDB Atlas. Falling back to SQLite/Memory.")
    _mongo_client = None
    return None

def get_mongo_db():
    client = get_mongo_client()
    if client is not None:
        return client[MONGODB_DB_NAME]
    return None

def is_mongo_active() -> bool:
    return get_mongo_db() is not None

# ==============================================================================
# MONGODB CRUD HELPER FUNCTIONS
# ==============================================================================

# 1. USER ACCOUNTS
def mongo_find_user(identifier: str) -> Optional[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return None
    clean = identifier.strip().lower()
    user = db.users.find_one({
        "$or": [
            {"username": clean},
            {"email": clean}
        ]
    })
    if user and "_id" in user:
        user["_id"] = str(user["_id"])
    return user

def mongo_create_user(user_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return user_dict
    if "created_at" not in user_dict:
        user_dict["created_at"] = datetime.datetime.utcnow().isoformat()
    res = db.users.insert_one(user_dict)
    user_dict["_id"] = str(res.inserted_id)
    return user_dict

def mongo_get_all_users() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    users = list(db.users.find({}, {"password_hash": 0}))
    for u in users:
        u["_id"] = str(u["_id"])
    return users

def mongo_update_user_address(username: str, address_data: dict) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.users.update_one(
        {"username": username.strip().lower()},
        {"$set": {
            "full_name": address_data.get("full_name"),
            "phone": address_data.get("phone"),
            "street_address": address_data.get("street_address"),
            "city": address_data.get("city"),
            "pincode": address_data.get("pincode"),
            "address": address_data
        }}
    )
    return res.modified_count > 0

def mongo_delete_user(username: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.users.delete_one({"username": username.strip().lower()})
    return res.deleted_count > 0

def mongo_update_user_timings(identifier: str, open_time: str, close_time: str, store_open: bool) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean = str(identifier).strip().lower()
    res = db.users.update_many(
        {"$or": [
            {"username": clean},
            {"email": clean},
            {"supplier_company_name": str(identifier).strip()}
        ]},
        {"$set": {
            "open_time": open_time,
            "close_time": close_time,
            "store_open": store_open
        }}
    )
    return res.modified_count > 0



# 2. PRODUCTS
def mongo_get_all_products() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    products = list(db.products.find({}))
    for p in products:
        p["_id"] = str(p["_id"])
    return products

def mongo_get_product_by_id(product_id: str) -> Optional[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return None
    p = db.products.find_one({"id": str(product_id)})
    if p and "_id" in p:
        p["_id"] = str(p["_id"])
    return p

def mongo_save_product(product_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return product_dict
    p_id = str(product_dict.get("id"))
    db.products.update_one(
        {"id": p_id},
        {"$set": product_dict},
        upsert=True
    )
    return product_dict

def mongo_delete_product(product_id: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean_id = str(product_id).strip()
    res = db.products.delete_many({
        "$or": [
            {"id": clean_id},
            {"title": clean_id}
        ]
    })
    return res.deleted_count > 0


# 3. ORDERS
def mongo_get_all_orders() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    orders = list(db.orders.find({}).sort("created_at", -1))
    for o in orders:
        o["_id"] = str(o["_id"])
    return orders

def mongo_get_user_orders(user_id: str) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    clean_uid = str(user_id).strip().lower()
    orders = list(db.orders.find({
        "$or": [
            {"user_id": clean_uid},
            {"userId": clean_uid},
            {"delivery.email": clean_uid}
        ]
    }).sort("created_at", -1))
    for o in orders:
        o["_id"] = str(o["_id"])
    return orders

def mongo_save_order(order_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return order_dict
    o_id = str(order_dict.get("id"))
    if "created_at" not in order_dict:
        order_dict["created_at"] = datetime.datetime.utcnow().isoformat()
    db.orders.update_one(
        {"id": o_id},
        {"$set": order_dict},
        upsert=True
    )
    return order_dict

def mongo_update_order_status(order_id: str, new_status: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.orders.update_one(
        {"id": str(order_id)},
        {"$set": {"status": new_status}}
    )
    return res.modified_count > 0

def mongo_delete_order(order_id: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean_id = str(order_id).strip()
    res = db.orders.delete_many({
        "$or": [
            {"id": clean_id},
            {"id": clean_id.upper()}
        ]
    })
    return res.deleted_count > 0


# 4. CART & WISHLIST
def mongo_get_user_cart(user_id: str) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    items = list(db.cart.find({"user_id": str(user_id)}))
    for i in items:
        i["_id"] = str(i["_id"])
    return items

def mongo_save_cart_item(user_id: str, product_id: str, quantity: int) -> bool:
    db = get_mongo_db()
    if db is None: return False
    db.cart.update_one(
        {"user_id": str(user_id), "product_id": str(product_id)},
        {"$set": {"quantity": quantity, "updated_at": datetime.datetime.utcnow().isoformat()}},
        upsert=True
    )
    return True

def mongo_clear_user_cart(user_id: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.cart.delete_many({"user_id": str(user_id)})
    return res.deleted_count > 0

def mongo_toggle_wishlist(user_id: str, product_id: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    uid = str(user_id)
    pid = str(product_id)
    existing = db.wishlist.find_one({"user_id": uid, "product_id": pid})
    if existing:
        db.wishlist.delete_one({"user_id": uid, "product_id": pid})
        return False
    else:
        db.wishlist.insert_one({"user_id": uid, "product_id": pid, "created_at": datetime.datetime.utcnow().isoformat()})
        return True

def mongo_get_user_wishlist(user_id: str) -> List[str]:
    db = get_mongo_db()
    if db is None: return []
    items = db.wishlist.find({"user_id": str(user_id)})
    return [i["product_id"] for i in items]


# 5. COUPONS & SERVICEABLE LOCATIONS
def mongo_get_all_coupons() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    coupons = list(db.coupons.find({}))
    for c in coupons:
        c["_id"] = str(c["_id"])
    return coupons

def mongo_save_coupon(coupon_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return coupon_dict
    code = coupon_dict.get("code", "").upper()
    db.coupons.update_one(
        {"code": code},
        {"$set": coupon_dict},
        upsert=True
    )
    return coupon_dict

def mongo_delete_coupon(identifier: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean_id = str(identifier).strip()
    res = db.coupons.delete_many({
        "$or": [
            {"id": clean_id},
            {"code": clean_id.upper()},
            {"code": clean_id}
        ]
    })
    return res.deleted_count > 0

def mongo_get_all_locations() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    locations = list(db.locations.find({}))
    for l in locations:
        l["_id"] = str(l["_id"])
    return locations

def mongo_save_location(location_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return location_dict
    pincode = str(location_dict.get("pincode"))
    db.locations.update_one(
        {"pincode": pincode},
        {"$set": location_dict},
        upsert=True
    )
    return location_dict

def mongo_delete_location(identifier: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean_id = str(identifier).strip()
    res = db.locations.delete_many({
        "$or": [
            {"id": clean_id},
            {"pincode": clean_id},
            {"city": clean_id},
            {"area": clean_id}
        ]
    })
    return res.deleted_count > 0

def mongo_get_all_categories() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    categories = list(db.categories.find({}))
    for c in categories:
        c["_id"] = str(c["_id"])
    return categories

def mongo_save_category(cat_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return cat_dict
    code = str(cat_dict.get("code")).lower()
    db.categories.update_one(
        {"code": code},
        {"$set": cat_dict},
        upsert=True
    )
    return cat_dict

def mongo_delete_category(identifier: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean_id = str(identifier).strip().lower()
    res = db.categories.delete_many({
        "$or": [
            {"id": clean_id},
            {"code": clean_id}
        ]
    })
    return res.deleted_count > 0

def mongo_get_all_refunds() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    refunds = list(db.refund_claims.find({}).sort("created_at", -1))
    for r in refunds:
        r["_id"] = str(r["_id"])
    return refunds

def mongo_save_refund(refund_dict: dict) -> Dict[str, Any]:
    db = get_mongo_db()
    if db is None: return refund_dict
    ref_id = str(refund_dict.get("id"))
    db.refund_claims.update_one(
        {"id": ref_id},
        {"$set": refund_dict},
        upsert=True
    )
    return refund_dict

def mongo_update_refund_status(refund_id: str, new_status: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.refund_claims.update_one(
        {"id": str(refund_id)},
        {"$set": {"status": new_status}}
    )
    return res.modified_count > 0

# 5. RESTAURANT / SUPPLIER STORE MANAGEMENT
def mongo_toggle_supplier_status(identifier: str, store_open: bool) -> bool:
    db = get_mongo_db()
    if db is None: return False
    clean = str(identifier).strip().lower()
    res = db.users.update_many(
        {"$or": [
            {"username": clean},
            {"email": clean},
            {"supplier_company_name": str(identifier).strip()}
        ]},
        {"$set": {"store_open": store_open}}
    )
    return res.modified_count > 0

def mongo_delete_restaurant(identifier: str, store_name: Optional[str] = None) -> Dict[str, int]:
    db = get_mongo_db()
    if db is None: return {"products_deleted": 0, "users_deleted": 0}
    clean = str(identifier).strip()
    clean_lower = clean.lower()
    clean_store = str(store_name or "").strip()

    names = {clean, clean_lower}
    if clean_store:
        names.add(clean_store)
        names.add(clean_store.lower())

    # Find the supplier user
    user_queries = [
        {"username": clean_lower},
        {"email": clean_lower},
        {"supplier_company_name": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
        {"full_name": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}}
    ]
    if clean_store:
        user_queries.extend([
            {"supplier_company_name": {"$regex": f"^{re.escape(clean_store)}$", "$options": "i"}},
            {"full_name": {"$regex": f"^{re.escape(clean_store)}$", "$options": "i"}}
        ])
    users = list(db.users.find({"$or": user_queries}))

    for u in users:
        if u.get("username"): names.add(u["username"].strip())
        if u.get("supplier_company_name"): names.add(u["supplier_company_name"].strip())
        if u.get("full_name"): names.add(u["full_name"].strip())
        if u.get("id"): names.add(str(u["id"]))
        if u.get("_id"): names.add(str(u["_id"]))

    or_clauses = []
    for n in names:
        if not n: continue
        escaped = re.escape(n)
        or_clauses.extend([
            {"supplier_name": {"$regex": f"^{escaped}$", "$options": "i"}},
            {"supplierName": {"$regex": f"^{escaped}$", "$options": "i"}},
            {"supplier_company_name": {"$regex": f"^{escaped}$", "$options": "i"}},
            {"supplier_user_id": n}
        ])

    prod_deleted = 0
    if or_clauses:
        prod_res = db.products.delete_many({"$or": or_clauses})
        prod_deleted = prod_res.deleted_count

    user_or = []
    for n in names:
        if not n: continue
        escaped = re.escape(n)
        user_or.extend([
            {"username": {"$regex": f"^{escaped}$", "$options": "i"}},
            {"supplier_company_name": {"$regex": f"^{escaped}$", "$options": "i"}},
            {"full_name": {"$regex": f"^{escaped}$", "$options": "i"}}
        ])

    user_deleted = 0
    if user_or:
        user_res = db.users.delete_many({"$or": user_or})
        user_deleted = user_res.deleted_count

    return {"products_deleted": prod_deleted, "users_deleted": user_deleted}


# 9. SUPPLIER AVAILABILITY CALENDAR
def mongo_get_supplier_availability(supplier_user_id: Any) -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    entries = list(db.supplier_availability.find({"supplier_user_id": str(supplier_user_id)}))
    for e in entries:
        e["_id"] = str(e["_id"])
    return entries

def mongo_set_supplier_availability(supplier_user_id: Any, date: str, is_open: bool) -> Dict[str, Any]:
    db = get_mongo_db()
    data = {
        "supplier_user_id": str(supplier_user_id),
        "date": str(date),
        "is_open": bool(is_open),
        "updated_at": datetime.datetime.utcnow().isoformat()
    }
    if db is None: return data
    db.supplier_availability.update_one(
        {"supplier_user_id": str(supplier_user_id), "date": str(date)},
        {"$set": data},
        upsert=True
    )
    return data

def mongo_delete_supplier_availability(supplier_user_id: Any, date: str) -> bool:
    db = get_mongo_db()
    if db is None: return False
    res = db.supplier_availability.delete_one({"supplier_user_id": str(supplier_user_id), "date": str(date)})
    return res.deleted_count > 0

def mongo_get_all_availabilities() -> List[Dict[str, Any]]:
    db = get_mongo_db()
    if db is None: return []
    entries = list(db.supplier_availability.find({}))
    for e in entries:
        e["_id"] = str(e["_id"])
    return entries
