# -*- coding: utf-8 -*-
"""
Add Katta Biryani and Tandoor (Faizpur) Supplier, Restaurant Profile,
and complete 34-item Menu with suitable food photos to MongoDB Atlas and Dropzyy.
"""

import sys
import sqlite3
import mongo_db
import auth

sys.stdout.reconfigure(encoding='utf-8')

# Food images mapping for each menu item
ITEM_IMAGES = {
    # Non-Veg
    "Egg Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half Portion",
        "badge": "Popular",
        "description": "Fragrant long-grain basmati rice layered with spiced hard-boiled eggs and golden fried onions."
    },
    "Egg Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full Portion",
        "badge": "Bestseller",
        "description": "Family pack aromatic dum biryani with marinated eggs, saffron glaze, and roasted spices."
    },
    "Chicken Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half Portion",
        "badge": "Chef Special",
        "description": "Tender bone-in chicken marinated in secret Katta spices, slow-cooked in handi with aged basmati rice."
    },
    "Chicken Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full Portion",
        "badge": "Must Try",
        "description": "Grand feast portion of signature chicken dum biryani, tender succulent meat pieces and rich aromas."
    },
    "Chicken Tandoor Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half Portion",
        "badge": "Tandoor Special",
        "description": "Smoky clay-oven grilled chicken tandoor pieces tossed with seasoned spiced biryani rice."
    },
    "Chicken Tandoor Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full Portion",
        "badge": "Signature",
        "description": "Generous full serving of charcoal-infused tandoor roasted chicken blended with dum rice."
    },
    "Chicken Tikka Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half Portion",
        "badge": "Spicy",
        "description": "Boneless chicken tikka boti char-grilled and layered over aromatic saffron basmati rice."
    },
    "Chicken Tikka Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full Portion",
        "badge": "Bestseller",
        "description": "Platter of tender boneless tikka cubes with royal dum biryani rice and rich masala gravy."
    },
    "Chicken Tandoor (Half)": {
        "image": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half (4 Pcs)",
        "badge": "Clay Oven",
        "description": "Half bird marinated in hung curd, Kashmiri deghi mirch, and roasted spices, charcoal-grilled to perfection."
    },
    "Chicken Tandoor (Full)": {
        "image": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full (8 Pcs)",
        "badge": "Party Special",
        "description": "Whole chicken roasted in authentic charcoal tandoor, served sizzling with spicy mint chutney and onion rings."
    },
    "Egg Latpat": {
        "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Spicy",
        "description": "Boiled eggs simmered in semi-dry thick onion-tomato gravy with Khandeshi tadka."
    },
    "Egg Masala": {
        "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Classic",
        "description": "Fried eggs drenched in rich, spicy Indian curry bursting with garlic and roasted garam masala."
    },
    "Chicken Handi (Half)": {
        "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Half Handi",
        "badge": "Handi Special",
        "description": "Country chicken pieces slow-cooked in traditional clay earthen handi with luscious brown masala."
    },
    "Chicken Handi (Full)": {
        "image": "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "Full Handi",
        "badge": "Grand Special",
        "description": "Feast portion of slow-simmered handi chicken in rich spicy gravy, perfect for families."
    },
    "Chicken Latpat": {
        "image": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Khandeshi",
        "description": "Famous spicy Khandeshi style latpat chicken with thick clinging gravy, coriander, and fried garlic."
    },
    "Chicken Masala Plate": {
        "image": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Homestyle",
        "description": "Authentic dhaba style chicken curry with whole spices, rich and deeply satisfying."
    },
    "Chicken Masala (Green)": {
        "image": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Haryali",
        "description": "Chicken pieces prepared in a refreshing aromatic cilantro, mint, green chili, and spinach masala."
    },
    "Chicken Masala (Yellow)": {
        "image": "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Mild Spice",
        "description": "Golden saffron-turmeric spiced chicken gravy prepared with ground cashews, cream, and mild aromatics."
    },
    "Kadhai Chicken": {
        "image": "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=600&q=80",
        "food_type": "non-veg",
        "unit": "1 Plate",
        "badge": "Wok Tossed",
        "description": "Chicken cooked in an iron wok with crisp bell peppers, whole coriander seeds, and crushed dried chilies."
    },

    # Veg
    "Veg Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1642821373181-696a54913e9a?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Half Portion",
        "badge": "Pure Veg",
        "description": "Fresh farm vegetables, green peas, and carrots dum-cooked with fragrant basmati rice."
    },
    "Veg Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1642821373181-696a54913e9a?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Full Portion",
        "badge": "Popular",
        "description": "Full handi feast of assorted vegetables and spices infused with royal kewra and mint essence."
    },
    "Paneer Biryani (Half)": {
        "image": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Half Portion",
        "badge": "Paneer Special",
        "description": "Soft malai paneer cubes marinated in tikka spices, layered with fluffy dum rice."
    },
    "Paneer Biryani (Full)": {
        "image": "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Full Portion",
        "badge": "Bestseller",
        "description": "Lavish serving of paneer dum biryani crowned with crispy brown onions and roasted cashews."
    },
    "Paneer Tandoor (Half)": {
        "image": "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Half (4 Pcs)",
        "badge": "Clay Oven",
        "description": "Chunky cottage cheese cubes skewered with capsicum and charred in charcoal tandoor."
    },
    "Paneer Tandoor (Full)": {
        "image": "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "Full (8 Pcs)",
        "badge": "Tandoor King",
        "description": "Sizzling platter of succulent paneer tikkas with fresh mint dip and lemon wedges."
    },
    "Mix Veg": {
        "image": "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Healthy",
        "description": "Medley of seasonal vegetables cooked in homestyle savory onion-tomato gravy."
    },
    "Shev Bhaji": {
        "image": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Khandeshi Hit",
        "description": "Famous spicy Khandeshi Shev Bhaji served with crunchy spiced gram flour noodles in zesty rassa."
    },
    "Dal Tadka": {
        "image": "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Desi Ghee",
        "description": "Yellow toor dal tempered with desi ghee, cumin, garlic, curry leaves, and dry red chilies."
    },
    "Paneer Masala": {
        "image": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Creamy",
        "description": "Soft fresh paneer simmered in a spiced tomato-onion reduction with buttery finish."
    },
    "Paneer Tikka Masala": {
        "image": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Chef Special",
        "description": "Char-grilled paneer tikkas dunked in velvety makhani sauce infused with kasuri methi."
    },
    "Kadhai Paneer": {
        "image": "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Wok Tossed",
        "description": "Paneer cubes and bell peppers tossed in freshly pounded coriander-cumin kadhai masala."
    },
    "Kaju Masala": {
        "image": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Rich & Royal",
        "description": "Roasted cashew nuts cooked in rich golden creamy gravy garnished with almonds."
    },
    "Kaju Paneer Masala": {
        "image": "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Plate",
        "badge": "Shahi Deluxe",
        "description": "Double delight of soft malai paneer and crunchy whole cashews in royal Mughlai gravy."
    },

    # Breads
    "Chapati": {
        "image": "https://images.unsplash.com/photo-1626074353765-517a681e40be?auto=format&fit=crop&w=600&q=80",
        "food_type": "veg",
        "unit": "1 Pc",
        "badge": "Hot & Fresh",
        "description": "Tawa fresh soft whole wheat roti / phulka smeared with pure desi ghee."
    }
}

RAW_MENU_DATA = {
    "restaurant_name": "Katta Biryani and Tandoor",
    "location": "Faizpur",
    "tagline": "Good Food • Great Vibes",
    "categories": [
        {
            "category_name": "Non Veg",
            "items": [
                { "name": "Egg Biryani (Half)", "price": 100 },
                { "name": "Egg Biryani (Full)", "price": 175 },
                { "name": "Chicken Biryani (Half)", "price": 110 },
                { "name": "Chicken Biryani (Full)", "price": 210 },
                { "name": "Chicken Tandoor Biryani (Half)", "price": 120 },
                { "name": "Chicken Tandoor Biryani (Full)", "price": 200 },
                { "name": "Chicken Tikka Biryani (Half)", "price": 120 },
                { "name": "Chicken Tikka Biryani (Full)", "price": 200 },
                { "name": "Chicken Tandoor (Half)", "price": 280 },
                { "name": "Chicken Tandoor (Full)", "price": 490 },
                { "name": "Egg Latpat", "price": 140 },
                { "name": "Egg Masala", "price": 125 },
                { "name": "Chicken Handi (Half)", "price": 550 },
                { "name": "Chicken Handi (Full)", "price": 950 },
                { "name": "Chicken Latpat", "price": 180 },
                { "name": "Chicken Masala Plate", "price": 140 },
                { "name": "Chicken Masala (Green)", "price": 150 },
                { "name": "Chicken Masala (Yellow)", "price": 160 },
                { "name": "Kadhai Chicken", "price": 180 }
            ]
        },
        {
            "category_name": "Veg",
            "items": [
                { "name": "Veg Biryani (Half)", "price": 100 },
                { "name": "Veg Biryani (Full)", "price": 175 },
                { "name": "Paneer Biryani (Half)", "price": 120 },
                { "name": "Paneer Biryani (Full)", "price": 190 },
                { "name": "Paneer Tandoor (Half)", "price": 350 },
                { "name": "Paneer Tandoor (Full)", "price": 600 },
                { "name": "Mix Veg", "price": 150 },
                { "name": "Shev Bhaji", "price": 120 },
                { "name": "Dal Tadka", "price": 140 },
                { "name": "Paneer Masala", "price": 170 },
                { "name": "Paneer Tikka Masala", "price": 190 },
                { "name": "Kadhai Paneer", "price": 180 },
                { "name": "Kaju Masala", "price": 150 },
                { "name": "Kaju Paneer Masala", "price": 190 }
            ]
        },
        {
            "category_name": "Breads",
            "items": [
                { "name": "Chapati", "price": 14 }
            ]
        }
    ]
}

def setup_katta_biryani():
    db = mongo_db.get_mongo_db()
    if db is None:
        print("[ERROR] MongoDB Atlas is not connected!")
        return

    print("=== Step 1: Configuring Supplier User 'Pranav' ===")
    pw_plain = "Pranav@Faizpur"
    pw_hash = auth.hash_password(pw_plain)
    banner_img = "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80"
    restaurant_name = RAW_MENU_DATA["restaurant_name"]
    location = RAW_MENU_DATA["location"]
    tagline = RAW_MENU_DATA["tagline"]

    # 1. Update / Insert user in MongoDB Atlas
    user_doc = db.users.find_one({"username": {"$regex": "^pranav$", "$options": "i"}})
    user_id = user_doc.get("id", 6) if user_doc else 6

    update_fields = {
        "username": "pranav",
        "email": "pranav@dropzyy.com",
        "password_hash": pw_hash,
        "full_name": "Pranav Firake",
        "role": "supplier",
        "supplier_company_name": restaurant_name,
        "restaurant_name": restaurant_name,
        "city": location,
        "location": location,
        "tagline": tagline,
        "open_time": "11:00 AM",
        "close_time": "11:00 PM",
        "store_open": True,
        "is_verified": True,
        "max_devices": 2,
        "banner_image": banner_img,
        "cover_image": banner_img,
        "supplier_id": user_id
    }

    if user_doc:
        db.users.update_one({"_id": user_doc["_id"]}, {"$set": update_fields})
        print(f"  -> Updated existing user 'pranav' in MongoDB (User ID: {user_id})")
    else:
        update_fields["id"] = user_id
        db.users.insert_one(update_fields)
        print(f"  -> Created new user 'pranav' in MongoDB (User ID: {user_id})")

    # 2. Update SQLite users table if exists
    try:
        conn = sqlite3.connect("dropzyy.db")
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE lower(username) = 'pranav' OR id = 6")
        row = c.fetchone()
        if row:
            c.execute("""
                UPDATE users SET 
                    username = 'pranav',
                    password_hash = ?,
                    role = 'supplier',
                    full_name = 'Pranav Firake',
                    supplier_company_name = ?,
                    city = ?,
                    open_time = '11:00 AM',
                    close_time = '11:00 PM',
                    store_open = 1,
                    banner_image = ?
                WHERE id = ?
            """, (pw_hash, restaurant_name, location, banner_img, row[0]))
            print("  -> Updated SQLite user 'pranav'")
        else:
            c.execute("""
                INSERT INTO users (id, username, email, password_hash, role, full_name, supplier_company_name, city, open_time, close_time, store_open, banner_image)
                VALUES (6, 'pranav', 'pranav@dropzyy.com', ?, 'supplier', 'Pranav Firake', ?, ?, '11:00 AM', '11:00 PM', 1, ?)
            """, (pw_hash, restaurant_name, location, banner_img))
            print("  -> Inserted SQLite user 'pranav'")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"  [SQLite Note]: {e}")

    # 3. Clean up any existing Katta products to ensure clean insertion
    del_res = db.products.delete_many({
        "$or": [
            {"id": {"$regex": "^katta_"}},
            {"supplier_name": {"$regex": "katta", "$options": "i"}},
            {"supplier_company_name": {"$regex": "katta", "$options": "i"}}
        ]
    })
    print(f"\n=== Step 2: Cleared {del_res.deleted_count} old Katta Biryani items ===")

    # 4. Insert All 34 Menu Products
    print("=== Step 3: Inserting 34 Menu Products with High-Res Photos ===")
    product_docs = []
    item_idx = 1

    for cat in RAW_MENU_DATA["categories"]:
        cat_name = cat["category_name"]
        for itm in cat["items"]:
            name = itm["name"]
            price = float(itm["price"])
            meta = ITEM_IMAGES.get(name, {
                "image": "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80",
                "food_type": "non-veg" if "chicken" in name.lower() or "egg" in name.lower() else "veg",
                "unit": "1 Portion",
                "badge": "Fresh",
                "description": f"Freshly prepared {name} at Katta Biryani and Tandoor Faizpur."
            })

            # Calculate realistic original price (15-25% higher)
            orig_price = round(price * 1.20)
            if orig_price == price:
                orig_price = price + 20

            pid = f"katta_{item_idx:02d}"
            doc = {
                "id": pid,
                "title": name,
                "category": "food",
                "menu_category": cat_name,
                "food_type": meta["food_type"],
                "price": price,
                "original_price": float(orig_price),
                "discount": f"{round(((orig_price - price) / orig_price) * 100)}% OFF",
                "unit": meta["unit"],
                "badge": meta["badge"],
                "rating": 4.8 if item_idx % 2 == 0 else 4.9,
                "reviews_count": 50 + (item_idx * 7) % 150,
                "image": meta["image"],
                "description": meta["description"],
                "nutrition": f"Authentic taste prepared fresh daily at {restaurant_name}, {location}.",
                "supplier_name": restaurant_name,
                "supplier_company_name": restaurant_name,
                "supplier_id": user_id,
                "supplier_user_id": str(user_id),
                "is_online": True,
                "in_stock": True,
                "show_stock_to_customer": True,
                "stock_quantity": 50
            }
            product_docs.append(doc)
            item_idx += 1

    if product_docs:
        ins_res = db.products.insert_many(product_docs)
        print(f"  -> Successfully inserted {len(ins_res.inserted_ids)} products into MongoDB Atlas!")

    # 5. Synchronize DEFAULT_REGISTERED_USERS in app.js
    print("\n=== Step 4: Synchronizing app.js DEFAULT_REGISTERED_USERS ===")
    app_js_path = "app.js"
    with open(app_js_path, "r", encoding="utf-8") as f:
        js_content = f.read()

    pranav_entry = (
        "    { id: 6, username: 'pranav', email: 'pranav@dropzyy.com', password: 'Pranav@Faizpur', "
        "full_name: 'Pranav Firake', role: 'supplier', supplier_company_name: 'Katta Biryani and Tandoor', "
        "restaurant_name: 'Katta Biryani and Tandoor', city: 'Faizpur', location: 'Faizpur', "
        "tagline: 'Good Food • Great Vibes', store_open: true, open_time: '11:00 AM', close_time: '11:00 PM', "
        "banner_image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80' }"
    )

    if "username: 'pranav'" not in js_content and 'username: "pranav"' not in js_content:
        # Insert into DEFAULT_REGISTERED_USERS
        target_str = "const DEFAULT_REGISTERED_USERS = ["
        replacement_str = f"const DEFAULT_REGISTERED_USERS = [\n{pranav_entry},"
        js_content = js_content.replace(target_str, replacement_str, 1)
        with open(app_js_path, "w", encoding="utf-8") as f:
            f.write(js_content)
        print("  -> Injected 'pranav' into DEFAULT_REGISTERED_USERS in app.js")
    else:
        print("  -> 'pranav' already configured in app.js")

    print("\n🎉 SETUP COMPLETED SUCCESSFULLY!")

if __name__ == "__main__":
    setup_katta_biryani()
