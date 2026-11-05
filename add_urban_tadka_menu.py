# -*- coding: utf-8 -*-
"""
Add Urban Tadka (Faizpur) Supplier Profile, Restaurant, and all 79 Menu Items
with suitable high-resolution photos into MongoDB Atlas.
"""

import sys
import sqlite3
import mongo_db
import auth

sys.stdout.reconfigure(encoding='utf-8')

# High quality Unsplash food photos for each category
CATEGORY_PHOTO_PRESETS = {
    "Milkshake": {
        "Vanilla Milkshake": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "Strawberry Milkshake": "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?auto=format&fit=crop&w=600&q=80",
        "Mango Milkshake": "https://images.unsplash.com/photo-1546173159-315724a31696?auto=format&fit=crop&w=600&q=80",
        "Rose Milkshake": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "Oreo Milkshake": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=600&q=80",
        "Kitkat Milkshake": "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "unit": "300 ml Glass",
        "food_type": "veg"
    },
    "Coffee": {
        "Cold Coffee": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
        "Oreo Cold Coffee": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80",
        "Kitkat Cold Coffee": "https://images.unsplash.com/photo-1577805947697-89e18249d767?auto=format&fit=crop&w=600&q=80",
        "Chocolate Cold Coffee": "https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=600&q=80",
        "Coffee with Ice Cream": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=600&q=80",
        "unit": "300 ml Glass",
        "food_type": "veg"
    },
    "Mojito": {
        "Kiwi Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Khus Mojito": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Lichi Mojito": "https://images.unsplash.com/photo-1546171753-97d7676e4602?auto=format&fit=crop&w=600&q=80",
        "Mango Mojito": "https://images.unsplash.com/photo-1536935338788-846bb9981813?auto=format&fit=crop&w=600&q=80",
        "Orange Mojito": "https://images.unsplash.com/photo-1621263764928-df1444c5e859?auto=format&fit=crop&w=600&q=80",
        "Pineapple Mojito": "https://images.unsplash.com/photo-1546171753-97d7676e4602?auto=format&fit=crop&w=600&q=80",
        "Watermelon Mojito": "https://images.unsplash.com/photo-1587015566802-5dc157c901cf?auto=format&fit=crop&w=600&q=80",
        "Kala Khatta Mojito": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Black Currant Mojito": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "Green Apple Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Citrus Blue Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Lime & Mint Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Blue Lagoon Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "Urban Special Mojito": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80",
        "unit": "350 ml Mocktail Glass",
        "food_type": "veg"
    },
    "Slushy": {
        "default": "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80",
        "unit": "300 ml Cup",
        "food_type": "veg"
    },
    "Idli & Dosa": {
        "Idli": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Plain Dosa": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
        "Butter Dosa": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
        "Cheese Dosa": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
        "Masala Dosa": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
        "Onion Uttapam": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Tomato Uttapam": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Veg. Uttapam": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Cheese Uttapam": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Plate with Sambhar & Chutney",
        "food_type": "veg"
    },
    "Pizza": {
        "Margarita Pizza": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80",
        "Veg Farm Pizza": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
        "Veg. Cheese Pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
        "Tandoor Pizza": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
        "Paneer Tikka Pizza": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80",
        "Paneer Cheese Pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
        "Urban Special Pizza": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
        "unit": "8 Inch Pan Pizza",
        "food_type": "veg"
    },
    "Sandwich": {
        "Classic Veg Sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
        "Peri Peri Sandwich": "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80",
        "Cheese Sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
        "Paneer Sandwich": "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80",
        "Tandoor Sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
        "Urban Special Sandwich": "https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Grilled Sandwich (4 Pcs)",
        "food_type": "veg"
    },
    "Maggi": {
        "default": "https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Bowl",
        "food_type": "veg"
    },
    "Spicy Tadka": {
        "Poha": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Rassa Poha": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
        "Misal Pav": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Plate",
        "food_type": "veg"
    },
    "Fries": {
        "default": "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Box (Large)",
        "food_type": "veg"
    },
    "Spring Potato": {
        "default": "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Spiral Stick",
        "food_type": "veg"
    },
    "Pasta": {
        "Red Sauce Pasta": "https://images.unsplash.com/photo-1621996346565-e3d5d6281691?auto=format&fit=crop&w=600&q=80",
        "White Sauce Pasta": "https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1621996346565-e3d5d6281691?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Bowl (Penne)",
        "food_type": "veg"
    },
    "Burger": {
        "Veg Burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
        "Cheese Burger": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
        "Peri Peri Burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
        "Tandoor Burger": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
        "Double Tikki Burger": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80",
        "Paneer Peri Peri Burger": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
        "default": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
        "unit": "1 Burger with Dip",
        "food_type": "veg"
    }
}

RAW_URBAN_MENU = {
  "restaurant_name": "Urban Tadka",
  "location": "Faizpur",
  "tagline": "Good Food • Quick Bites • Great Vibes",
  "categories": [
    {
      "category_name": "Milkshake",
      "items": [
        { "name": "Vanilla Milkshake", "price": 92 },
        { "name": "Strawberry Milkshake", "price": 103 },
        { "name": "Mango Milkshake", "price": 103 },
        { "name": "Rose Milkshake", "price": 103 },
        { "name": "Oreo Milkshake", "price": 115 },
        { "name": "Kitkat Milkshake", "price": 115 }
      ]
    },
    {
      "category_name": "Coffee",
      "items": [
        { "name": "Cold Coffee", "price": 69 },
        { "name": "Oreo Cold Coffee", "price": 92 },
        { "name": "Kitkat Cold Coffee", "price": 92 },
        { "name": "Chocolate Cold Coffee", "price": 92 },
        { "name": "Coffee with Ice Cream", "price": 115 }
      ]
    },
    {
      "category_name": "Mojito",
      "items": [
        { "name": "Kiwi Mojito", "price": 80 },
        { "name": "Khus Mojito", "price": 80 },
        { "name": "Lichi Mojito", "price": 80 },
        { "name": "Mango Mojito", "price": 80 },
        { "name": "Orange Mojito", "price": 80 },
        { "name": "Pineapple Mojito", "price": 80 },
        { "name": "Watermelon Mojito", "price": 80 },
        { "name": "Kala Khatta Mojito", "price": 92 },
        { "name": "Black Currant Mojito", "price": 92 },
        { "name": "Green Apple Mojito", "price": 103 },
        { "name": "Citrus Blue Mojito", "price": 103 },
        { "name": "Lime & Mint Mojito", "price": 103 },
        { "name": "Blue Lagoon Mojito", "price": 103 },
        { "name": "Urban Special Mojito", "price": 115 }
      ]
    },
    {
      "category_name": "Slushy",
      "items": [
        { "name": "Kala Khatta Slushy", "price": 58 },
        { "name": "Orange Slushy", "price": 58 },
        { "name": "Mango Slushy", "price": 58 },
        { "name": "Strawberry Slushy", "price": 58 },
        { "name": "Blue Lagoon Slushy", "price": 64 },
        { "name": "Urban Special Slushy", "price": 80 }
      ]
    },
    {
      "category_name": "Idli & Dosa",
      "items": [
        { "name": "Idli", "price": 58 },
        { "name": "Plain Dosa", "price": 58 },
        { "name": "Butter Dosa", "price": 69 },
        { "name": "Cheese Dosa", "price": 80 },
        { "name": "Masala Dosa", "price": 92 },
        { "name": "Onion Uttapam", "price": 80 },
        { "name": "Tomato Uttapam", "price": 92 },
        { "name": "Veg. Uttapam", "price": 103 },
        { "name": "Cheese Uttapam", "price": 115 }
      ]
    },
    {
      "category_name": "Pizza",
      "items": [
        { "name": "Margarita Pizza", "price": 140 },
        { "name": "Veg Farm Pizza", "price": 160 },
        { "name": "Veg. Cheese Pizza", "price": 210 },
        { "name": "Tandoor Pizza", "price": 220 },
        { "name": "Paneer Tikka Pizza", "price": 255 },
        { "name": "Paneer Cheese Pizza", "price": 259 },
        { "name": "Urban Special Pizza", "price": 290 }
      ]
    },
    {
      "category_name": "Sandwich",
      "items": [
        { "name": "Classic Veg Sandwich", "price": 70 },
        { "name": "Peri Peri Sandwich", "price": 80 },
        { "name": "Cheese Sandwich", "price": 90 },
        { "name": "Paneer Sandwich", "price": 90 },
        { "name": "Tandoor Sandwich", "price": 105 },
        { "name": "Urban Special Sandwich", "price": 125 }
      ]
    },
    {
      "category_name": "Maggi",
      "items": [
        { "name": "Plain Maggi", "price": 58 },
        { "name": "Masala Maggi", "price": 70 },
        { "name": "Cheese Maggi", "price": 80 },
        { "name": "Veggie Maggi", "price": 90 },
        { "name": "Peri Peri Maggi", "price": 90 }
      ]
    },
    {
      "category_name": "Spicy Tadka",
      "items": [
        { "name": "Poha", "price": 30 },
        { "name": "Rassa Poha", "price": 50 },
        { "name": "Misal Pav", "price": 90 }
      ]
    },
    {
      "category_name": "Fries",
      "items": [
        { "name": "Salted Fries", "price": 90 },
        { "name": "Masala Fries", "price": 90 },
        { "name": "Chatpat Fries", "price": 90 },
        { "name": "Peri Peri Fries", "price": 105 },
        { "name": "Cheese Fries", "price": 115 },
        { "name": "Tandoor Fries", "price": 115 }
      ]
    },
    {
      "category_name": "Spring Potato",
      "items": [
        { "name": "Salted Twister", "price": 70 },
        { "name": "Masala Twister", "price": 70 },
        { "name": "Peri Peri Twister", "price": 80 },
        { "name": "Tandoor Twister", "price": 90 }
      ]
    },
    {
      "category_name": "Pasta",
      "items": [
        { "name": "Red Sauce Pasta", "price": 105 },
        { "name": "White Sauce Pasta", "price": 115 }
      ]
    },
    {
      "category_name": "Burger",
      "items": [
        { "name": "Veg Burger", "price": 90 },
        { "name": "Cheese Burger", "price": 100 },
        { "name": "Peri Peri Burger", "price": 100 },
        { "name": "Tandoor Burger", "price": 115 },
        { "name": "Double Tikki Burger", "price": 150 },
        { "name": "Paneer Peri Peri Burger", "price": 140 }
      ]
    }
  ]
}

def setup_urban_tadka():
    db = mongo_db.get_mongo_db()
    if db is None:
        print("[ERROR] MongoDB Atlas is not connected!")
        return

    print("=== Step 1: Setting up Supplier User 'Arnav' ===")
    pw_plain = "Arnav@Faizpur"
    pw_hash = auth.hash_password(pw_plain)
    banner_img = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80"
    restaurant_name = RAW_URBAN_MENU["restaurant_name"]
    location = RAW_URBAN_MENU["location"]
    tagline = RAW_URBAN_MENU["tagline"]

    user_doc = db.users.find_one({"username": {"$regex": "^arnav$", "$options": "i"}})
    user_id = 9

    user_fields = {
        "id": 9,
        "username": "arnav",
        "email": "arnav@dropzyy.com",
        "password_hash": pw_hash,
        "full_name": "Arnav Patil",
        "role": "supplier",
        "supplier_company_name": restaurant_name,
        "restaurant_name": restaurant_name,
        "city": location,
        "location": location,
        "tagline": tagline,
        "open_time": "08:00 AM",
        "close_time": "11:00 PM",
        "store_open": True,
        "is_verified": True,
        "max_devices": 5,
        "banner_image": banner_img,
        "cover_image": banner_img,
        "supplier_id": 9
    }

    if user_doc:
        db.users.update_one({"_id": user_doc["_id"]}, {"$set": user_fields})
        print(f"  -> Updated existing user 'arnav' in MongoDB Atlas (User ID: {user_id})")
    else:
        user_fields["id"] = user_id
        db.users.insert_one(user_fields)
        print(f"  -> Created new supplier user 'arnav' in MongoDB Atlas (User ID: {user_id})")

    # SQLite sync
    try:
        conn = sqlite3.connect("dropzyy.db")
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE lower(username) = 'arnav' OR id = 7")
        row = c.fetchone()
        if row:
            c.execute("""
                UPDATE users SET 
                    username = 'arnav',
                    password_hash = ?,
                    role = 'supplier',
                    full_name = 'Arnav Patil',
                    supplier_company_name = ?,
                    city = ?,
                    open_time = '08:00 AM',
                    close_time = '11:00 PM',
                    store_open = 1,
                    banner_image = ?
                WHERE id = ?
            """, (pw_hash, restaurant_name, location, banner_img, row[0]))
            print("  -> Updated SQLite user 'arnav'")
        else:
            c.execute("""
                INSERT INTO users (id, username, email, password_hash, role, full_name, supplier_company_name, city, open_time, close_time, store_open, banner_image)
                VALUES (7, 'arnav', 'arnav@dropzyy.com', ?, 'supplier', 'Arnav Patil', ?, ?, '08:00 AM', '11:00 PM', 1, ?)
            """, (pw_hash, restaurant_name, location, banner_img))
            print("  -> Inserted SQLite user 'arnav'")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"  [SQLite Note]: {e}")

    # Step 2: Clear old urban products if any
    del_res = db.products.delete_many({
        "$or": [
            {"id": {"$regex": "^urban_"}},
            {"supplier_name": {"$regex": "urban", "$options": "i"}},
            {"supplier_company_name": {"$regex": "urban", "$options": "i"}}
        ]
    })
    print(f"\n=== Step 2: Cleared {del_res.deleted_count} old Urban Tadka products ===")

    # Step 3: Insert All 79 Menu Products
    print("=== Step 3: Inserting 79 Menu Products with Photos ===")
    product_docs = []
    item_counter = 1

    for cat in RAW_URBAN_MENU["categories"]:
        cat_name = cat["category_name"]
        cat_meta = CATEGORY_PHOTO_PRESETS.get(cat_name, {})
        default_img = cat_meta.get("default", "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80")
        default_unit = cat_meta.get("unit", "1 Portion")
        default_type = cat_meta.get("food_type", "veg")

        # Map to Dropzyy main category
        main_cat = "food"
        if cat_name.lower() == "pizza":
            main_cat = "pizza"
        elif cat_name.lower() == "burger":
            main_cat = "burgers"

        for itm in cat["items"]:
            name = itm["name"]
            price = float(itm["price"])
            img_url = cat_meta.get(name, default_img)

            orig_price = round(price * 1.20)
            if orig_price == price:
                orig_price = price + 15

            pid = f"urban_{item_counter:02d}"
            doc = {
                "id": pid,
                "title": name,
                "category": main_cat,
                "menu_category": cat_name,
                "food_type": default_type,
                "price": price,
                "original_price": float(orig_price),
                "discount": f"{round(((orig_price - price) / orig_price) * 100)}% OFF",
                "unit": default_unit,
                "badge": "Urban Special" if "urban" in name.lower() else ("Bestseller" if item_counter % 3 == 0 else "Fresh"),
                "rating": 4.8 if item_counter % 2 == 0 else 4.9,
                "reviews_count": 45 + (item_counter * 5) % 120,
                "image": img_url,
                "description": f"Delicious {name} freshly prepared with premium ingredients at {restaurant_name}, {location}.",
                "nutrition": f"Prepared hygienic & fresh at {restaurant_name} kitchen.",
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
            item_counter += 1

    if product_docs:
        ins_res = db.products.insert_many(product_docs)
        print(f"  -> Successfully inserted {len(ins_res.inserted_ids)} products into MongoDB Atlas!")

    # Step 4: Synchronize app.js DEFAULT_REGISTERED_USERS
    print("\n=== Step 4: Synchronizing app.js DEFAULT_REGISTERED_USERS ===")
    app_js_path = "app.js"
    with open(app_js_path, "r", encoding="utf-8") as f:
        js_content = f.read()

    arnav_entry = (
        "    { id: 7, username: 'arnav', email: 'arnav@dropzyy.com', password: 'Arnav@Faizpur', "
        "full_name: 'Arnav Patil', role: 'supplier', supplier_company_name: 'Urban Tadka', "
        "restaurant_name: 'Urban Tadka', city: 'Faizpur', location: 'Faizpur', "
        "tagline: 'Good Food • Quick Bites • Great Vibes', store_open: true, open_time: '08:00 AM', close_time: '11:00 PM', "
        "banner_image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80' }"
    )

    if "username: 'arnav'" not in js_content and 'username: "arnav"' not in js_content:
        target_str = "const DEFAULT_REGISTERED_USERS = ["
        replacement_str = f"const DEFAULT_REGISTERED_USERS = [\n{arnav_entry},"
        js_content = js_content.replace(target_str, replacement_str, 1)
        with open(app_js_path, "w", encoding="utf-8") as f:
            f.write(js_content)
        print("  -> Injected 'arnav' into DEFAULT_REGISTERED_USERS in app.js")
    else:
        print("  -> 'arnav' already in app.js")

    print("\n🎉 ALL 79 URBAN TADKA MENU ITEMS & SUPPLIER CONFIGURED SUCCESSFULLY!")

if __name__ == "__main__":
    setup_urban_tadka()
