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

def mongo_update_user(identifier: str, update_dict: dict) -> bool:
    """Update fields on a user/supplier document in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None or not identifier or not update_dict: return False
    clean = str(identifier).strip().lower()
    try:
        res = db.users.update_many(
            {"$or": [
                {"username": clean},
                {"email": clean},
                {"supplier_company_name": str(identifier).strip()}
            ]},
            {"$set": update_dict}
        )
        print(f"[MONGODB USER UPDATE] Updated {res.modified_count} user docs matching '{identifier}': {list(update_dict.keys())}")
        return res.modified_count > 0
    except Exception as e:
        print(f"[MONGODB USER UPDATE ERR]: {e}")
        return False

def mongo_get_all_restaurants() -> List[Dict[str, Any]]:
    """Retrieve all supplier partner restaurants and stores directly from MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return []
    try:
        users = list(db.users.find({"role": "supplier"}, {"password": 0, "password_hash": 0}))
        restaurants = []
        seen = set()
        for idx, u in enumerate(users):
            uname = str(u.get("username") or "").strip()
            comp = str(u.get("supplier_company_name") or "").strip()
            key = (comp or uname).lower()
            if not key or key in seen:
                continue
            seen.add(key)

            uid = u.get("id") or str(u.get("_id"))
            b_img = str(u.get("banner_image") or u.get("cover_image") or "").strip()
            m_img = str(u.get("menu_card_image") or "").strip()

            # Smart fallback to latest uploaded store images in MongoDB if not explicitly linked
            if not b_img:
                if "banjo" in key:
                    b_img = "/api/images/img_2fb9075497_1792486975.png"
                elif "dropzyy1" in key:
                    b_img = "/api/images/img_d0a319147b_1792861712.jpg"
                else:
                    try:
                        latest_img = db.images.find_one({"uploaded_by": uname}, sort=[("_id", -1)])
                        if latest_img and latest_img.get("id"):
                            b_img = f"/api/images/{latest_img.get('id')}"
                    except Exception:
                        pass

            if not m_img and "banjo" in key:
                m_img = "uploads/banjos_menu_card_page_1.jpg"

            restaurants.append({
                "id": uid,
                "username": uname,
                "full_name": u.get("full_name") or comp or uname,
                "supplier_company_name": comp or uname,
                "role": "supplier",
                "city": u.get("city") or (u.get("address") or {}).get("city") or "Savda",
                "open_time": u.get("open_time") or "08:00 AM",
                "close_time": u.get("close_time") or "10:00 PM",
                "store_open": bool(u.get("store_open", True)),
                "banner_image": b_img,
                "menu_card_image": m_img
            })
        return restaurants
    except Exception as e:
        print(f"[MONGODB GET RESTAURANTS ERR]: {e}")
        return []

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
    clauses = [
        {"id": clean_id},
        {"title": clean_id},
        {"_id": clean_id}
    ]
    if clean_id.isdigit():
        clauses.append({"id": int(clean_id)})
    try:
        from bson import ObjectId
        if ObjectId.is_valid(clean_id):
            clauses.append({"_id": ObjectId(clean_id)})
    except Exception:
        pass
    res = db.products.delete_many({"$or": clauses})
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

def mongo_update_order_status(order_id: str, new_status: str, cancelled_by: str = None, cancel_reason: str = None, cancelled_at: str = None) -> bool:
    db = get_mongo_db()
    if db is None: return False
    update_fields = {"status": new_status}
    if cancelled_by is not None: update_fields["cancelled_by"] = cancelled_by
    if cancel_reason is not None: update_fields["cancel_reason"] = cancel_reason
    if cancelled_at is not None: update_fields["cancelled_at"] = cancelled_at
    res = db.orders.update_one(
        {"id": str(order_id)},
        {"$set": update_fields}
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
        c["discount_type"] = c.get("discount_type") or ("flat" if "FLAT" in str(c.get("description", "")).upper() else "percent")
        val = c.get("discount_value")
        if val is None:
            val = c.get("discount_percent") or c.get("discount") or 0.0
        c["discount_value"] = float(val)
        c["discount_percent"] = float(c.get("discount_percent") or (val if c["discount_type"] == "percent" else 0.0))
        c["min_order"] = float(c.get("min_order") or 0.0)
        c["usage_limit"] = str(c.get("usage_limit") or "unlimited")
        raw_used = c.get("used_by")
        if isinstance(raw_used, list):
            c["used_by"] = [str(u).lower() for u in raw_used]
        elif isinstance(raw_used, str) and raw_used.strip():
            try:
                import json
                c["used_by"] = json.loads(raw_used)
            except Exception:
                c["used_by"] = [u.strip().lower() for u in raw_used.split(",") if u.strip()]
        else:
            c["used_by"] = []
        c["target"] = str(c.get("target") or "everyone")
        c["target_user"] = str(c.get("target_user") or c.get("targetUser") or "")
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

def mongo_record_coupon_usage(code: str, username: str) -> bool:
    """Record that a specific user has redeemed a coupon."""
    db = get_mongo_db()
    if db is None or not code or not username: return False
    clean_code = str(code).strip().upper()
    clean_user = str(username).strip().lower()
    try:
        db.coupons.update_one(
            {"code": clean_code},
            {"$addToSet": {"used_by": clean_user}}
        )
        print(f"[MONGODB COUPON USED] Recorded usage of '{clean_code}' for @{clean_user}")
        return True
    except Exception as e:
        print(f"[MONGODB COUPON USAGE ERROR] {e}")
        return False

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
        {"username": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
        {"email": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
        {"supplier_company_name": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
        {"full_name": {"$regex": f"^{re.escape(clean)}$", "$options": "i"}},
        {"id": clean},
        {"_id": clean}
    ]
    if clean.isdigit():
        user_queries.append({"id": int(clean)})
    try:
        from bson import ObjectId
        if ObjectId.is_valid(clean):
            user_queries.append({"_id": ObjectId(clean)})
    except Exception:
        pass

    if clean_store:
        user_queries.extend([
            {"username": {"$regex": f"^{re.escape(clean_store)}$", "$options": "i"}},
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
            {"supplier_user_id": n},
            {"supplier_user_id": str(n)},
            {"supplier_id": n}
        ])
        if str(n).isdigit():
            or_clauses.append({"supplier_id": int(n)})

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
        if str(n).isdigit():
            user_or.append({"id": int(n)})
        try:
            from bson import ObjectId
            if ObjectId.is_valid(n):
                user_or.append({"_id": ObjectId(n)})
        except Exception:
            pass

    for u in users:
        if u.get("_id"):
            user_or.append({"_id": u["_id"]})

    user_deleted = 0
    if user_or:
        user_res = db.users.delete_many({"$or": user_or})
        user_deleted = user_res.deleted_count

    # Also clean suppliers collection
    supp_or = []
    for n in names:
        if not n: continue
        supp_or.append({"name": {"$regex": f"^{re.escape(n)}$", "$options": "i"}})
    if supp_or:
        db.suppliers.delete_many({"$or": supp_or})

    # Also clean supplier_availability collection
    avail_or = []
    for n in names:
        if not n: continue
        avail_or.append({"supplier_user_id": str(n)})
        if str(n).isdigit():
            avail_or.append({"supplier_user_id": int(n)})
    if avail_or:
        db.supplier_availability.delete_many({"$or": avail_or})

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

# 7. IMAGE STORAGE (MONGODB ATLAS)
def mongo_save_image(image_id: str, filename: str, content_type: str, image_bytes: bytes, uploaded_by: Optional[str] = None) -> Dict[str, Any]:
    """Store image binary directly in MongoDB Atlas collection."""
    import bson
    db = get_mongo_db()
    data = {
        "id": image_id,
        "filename": filename,
        "content_type": content_type,
        "data": bson.Binary(image_bytes),
        "size": len(image_bytes),
        "uploaded_by": uploaded_by,
        "created_at": datetime.datetime.utcnow().isoformat()
    }
    if db is not None:
        db.images.update_one(
            {"id": image_id},
            {"$set": data},
            upsert=True
        )
        print(f"[MONGODB IMAGE SAVED] Image '{image_id}' ({len(image_bytes)} bytes) stored in MongoDB Atlas!")
    return {
        "id": image_id,
        "filename": filename,
        "content_type": content_type,
        "size": len(image_bytes)
    }

def mongo_get_image(image_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve image binary from MongoDB Atlas."""
    db = get_mongo_db()
    if db is None:
        return None
    clean_id = str(image_id).strip()
    doc = db.images.find_one({"id": clean_id})
    if not doc:
        doc = db.images.find_one({"filename": clean_id})
    if not doc and "." in clean_id:
        doc = db.images.find_one({"id": clean_id.split(".")[0]})
    return doc

# 8. VISITOR ANALYTICS (MONGODB ATLAS)
def mongo_save_visitor(visitor_dict: Dict[str, Any]) -> None:
    """Record site visit in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return
    try:
        db.site_visitors.insert_one(visitor_dict)
    except Exception as e:
        print(f"[MONGODB VISITOR LOG NOTICE] {e}")

def mongo_get_visitors(start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve visitors from MongoDB Atlas with optional date range."""
    db = get_mongo_db()
    if db is None: return []
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    try:
        visitors = list(db.site_visitors.find(query, {"_id": 0}))
        return visitors
    except Exception as e:
        print(f"[MONGODB GET VISITORS NOTICE] {e}")
        return []

# 9. DELIVERY SETTINGS (MONGODB ATLAS)
def mongo_save_delivery_settings(settings_dict: Dict[str, Any]) -> None:
    """Save delivery settings in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return
    try:
        data = {**settings_dict, "id": "global_delivery_settings", "updated_at": datetime.datetime.utcnow().isoformat()}
        db.delivery_settings.update_one(
            {"id": "global_delivery_settings"},
            {"$set": data},
            upsert=True
        )
    except Exception as e:
        print(f"[MONGODB DELIVERY SETTINGS NOTICE] {e}")

def mongo_get_delivery_settings() -> Optional[Dict[str, Any]]:
    """Get delivery settings from MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return None
    try:
        doc = db.delivery_settings.find_one({"id": "global_delivery_settings"}, {"_id": 0})
        return doc
    except Exception as e:
        print(f"[MONGODB GET DELIVERY SETTINGS NOTICE] {e}")
        return None

# ==============================================================================
# 10. BLOCKED CONTACTS (FRAUD SHIELD / CANCELLATION RESTRICTION)
# ==============================================================================
def mongo_clean_phone(phone: Optional[str]) -> str:
    if not phone: return ""
    import re
    digits = re.sub(r"\D", "", str(phone))
    return digits[-10:] if len(digits) >= 10 else digits

def mongo_get_all_blocked_contacts() -> List[Dict[str, Any]]:
    """Fetch all blocked contacts from MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return []
    try:
        cursor = db.blocked_contacts.find().sort("created_at", -1)
        res = []
        for doc in cursor:
            doc["id"] = str(doc.get("_id"))
            doc["_id"] = str(doc.get("_id"))
            res.append(doc)
        return res
    except Exception as e:
        print(f"[MONGODB BLOCKED CONTACTS GET NOTICE] {e}")
        return []

def mongo_save_blocked_contact(data: dict) -> Dict[str, Any]:
    """Block a mobile number or email address in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return data
    try:
        phone_clean = mongo_clean_phone(data.get("phone"))
        email_clean = str(data.get("email", "")).strip().lower()
        now_iso = datetime.datetime.utcnow().isoformat()

        record = {
            "phone": phone_clean,
            "raw_phone": str(data.get("phone", "")).strip(),
            "email": email_clean,
            "reason": str(data.get("reason", "Repeated order cancellations")),
            "blocked_by": str(data.get("blocked_by", "admin")),
            "created_at": str(data.get("created_at", now_iso))
        }

        # Query filter to avoid duplicates
        query_parts = []
        if phone_clean:
            query_parts.append({"phone": phone_clean})
        if email_clean:
            query_parts.append({"email": email_clean})

        if query_parts:
            query = {"$or": query_parts}
            db.blocked_contacts.update_one(query, {"$set": record}, upsert=True)
            saved = db.blocked_contacts.find_one(query)
            if saved:
                record["id"] = str(saved["_id"])
                record["_id"] = str(saved["_id"])
        else:
            ins = db.blocked_contacts.insert_one(record)
            record["id"] = str(ins.inserted_id)
            record["_id"] = str(ins.inserted_id)

        return record
    except Exception as e:
        print(f"[MONGODB SAVE BLOCKED CONTACT NOTICE] {e}")
        return data

def mongo_delete_blocked_contact(identifier: str) -> bool:
    """Unblock a contact by ID, phone, or email in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return False
    try:
        from bson import ObjectId
        ident_str = str(identifier).strip()
        phone_clean = mongo_clean_phone(ident_str)
        email_clean = ident_str.lower()

        or_conditions = [
            {"email": email_clean},
            {"raw_phone": ident_str}
        ]
        if phone_clean:
            or_conditions.append({"phone": phone_clean})
        if ObjectId.is_valid(ident_str):
            or_conditions.append({"_id": ObjectId(ident_str)})

        res = db.blocked_contacts.delete_many({"$or": or_conditions})
        return res.deleted_count > 0
    except Exception as e:
        print(f"[MONGODB DELETE BLOCKED CONTACT NOTICE] {e}")
        return False

def mongo_is_contact_blocked(phone: Optional[str] = None, email: Optional[str] = None) -> bool:
    """Check if a phone number or email address is currently blocked in MongoDB Atlas."""
    db = get_mongo_db()
    if db is None: return False
    try:
        phone_clean = mongo_clean_phone(phone)
        email_clean = str(email or "").strip().lower()
        if not phone_clean and not email_clean:
            return False

        conditions = []
        if phone_clean:
            conditions.append({"phone": phone_clean})
            conditions.append({"raw_phone": phone_clean})
        if email_clean:
            conditions.append({"email": email_clean})

        doc = db.blocked_contacts.find_one({"$or": conditions})
        return doc is not None
    except Exception as e:
        print(f"[MONGODB IS BLOCKED NOTICE] {e}")
        return False


