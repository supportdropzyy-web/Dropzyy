"""
Seed Banjos Cafe supplier account and 30 full menu items into MongoDB Atlas.
"""
import sys
import mongo_db

def seed():
    m_db = mongo_db.get_mongo_db()
    if m_db is None:
        print("[ERROR] Could not connect to MongoDB Atlas!")
        sys.exit(1)

    print("[INFO] Connected to MongoDB Atlas. Seeding Banjos Cafe...")

    # 1. Upsert Banjos Cafe in users & suppliers collection
    banjos_user = {
        "id": 22,
        "username": "banjos",
        "email": "banjos@dropzyy.com",
        "full_name": "Ritesh Patil",
        "role": "supplier",
        "supplier_company_name": "Banjos Cafe",
        "city": "Savda-Faizpur",
        "store_open": True,
        "is_verified": 1,
        "open_time": "08:00 AM",
        "close_time": "10:00 PM",
        "phone": "+91 98230 45678"
    }
    m_db.users.update_one({"username": "banjos"}, {"$set": banjos_user}, upsert=True)
    m_db.suppliers.update_one(
        {"name_lower": "banjos cafe"},
        {"$set": {
            "id": 22,
            "name": "Banjos Cafe",
            "name_lower": "banjos cafe",
            "contact_person": "Ritesh Patil",
            "phone": "+91 98230 45678",
            "city": "Savda-Faizpur",
            "open_time": "08:00",
            "close_time": "22:00",
            "is_manually_closed": False
        }},
        upsert=True
    )
    print("[SUCCESS] Banjos Cafe supplier recorded in MongoDB.")

    # 2. Ensure categories exist in MongoDB
    categories = [
        {"id": 101, "code": "banjos", "name": "Banjos", "icon": "fa-solid fa-bread-slice"},
        {"id": 102, "code": "burgers", "name": "Burgers", "icon": "fa-solid fa-burger"},
        {"id": 103, "code": "pizza", "name": "Pizza", "icon": "fa-solid fa-pizza-slice"},
        {"id": 104, "code": "rolls", "name": "Rolls", "icon": "fa-solid fa-hotdog"},
        {"id": 105, "code": "momos_desserts", "name": "Momos & Desserts", "icon": "fa-solid fa-cookie-bite"},
    ]
    for cat in categories:
        m_db.categories.update_one({"code": cat["code"]}, {"$set": cat}, upsert=True)
    print(f"[SUCCESS] {len(categories)} categories upserted in MongoDB.")

    # 3. All 30 Menu Items with variants and food types
    menu_items = [
        # --- BANJOS ---
        {
            "id": "banjo_01",
            "title": "Garden Green Banjo",
            "category": "banjos",
            "food_type": "veg",
            "price": 109.0,
            "original_price": 129.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1525059696034-4967a8e1dca2?auto=format&fit=crop&w=600&q=80",
            "badge": "Chef Special",
            "discount": "15% OFF",
            "description": "Crispy garden veg patty packed with crunchy greens, house secret mayo, grilled between toasted golden buns.",
            "variants": [
                {"name": "Regular", "price": 109.0},
                {"name": "+ Cheese", "price": 129.0}
            ]
        },
        {
            "id": "banjo_02",
            "title": "Spinach Corn Banjo",
            "category": "banjos",
            "food_type": "veg",
            "price": 119.0,
            "original_price": 139.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=600&q=80",
            "badge": "Healthy Choice",
            "discount": "14% OFF",
            "description": "Nutritious creamy spinach and sweet corn patty delicately seasoned with garlic and grilled to golden perfection.",
            "variants": [
                {"name": "Regular", "price": 119.0},
                {"name": "+ Cheese", "price": 139.0}
            ]
        },
        {
            "id": "banjo_03",
            "title": "Tandoori Paneer Banjo",
            "category": "banjos",
            "food_type": "veg",
            "price": 149.0,
            "original_price": 169.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
            "badge": "Bestseller",
            "discount": "12% OFF",
            "description": "Rich paneer cubes bathed in smoky tandoori marinade, topped with crunchy pickled onions and tangy mint dressing.",
            "variants": [
                {"name": "Regular", "price": 149.0},
                {"name": "+ Cheese", "price": 169.0}
            ]
        },
        {
            "id": "banjo_04",
            "title": "Omelette Banjo",
            "category": "banjos",
            "food_type": "egg",
            "price": 79.0,
            "original_price": 99.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80",
            "badge": "Popular",
            "discount": "20% OFF",
            "description": "Fluffy double-egg masala omelette with diced onions and green chillies, served inside warm buttered banjo buns.",
            "variants": [
                {"name": "Regular", "price": 79.0},
                {"name": "+ Cheese", "price": 99.0}
            ]
        },
        {
            "id": "banjo_05",
            "title": "Chicken Banjo",
            "category": "banjos",
            "food_type": "non_veg",
            "price": 149.0,
            "original_price": 169.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=600&q=80",
            "badge": "Top Rated",
            "discount": "12% OFF",
            "description": "Juicy seasoned chicken breast patty spiced with aromatic herbs, crisp lettuce, and signature garlic mayonnaise.",
            "variants": [
                {"name": "Regular", "price": 149.0},
                {"name": "+ Cheese", "price": 169.0}
            ]
        },
        {
            "id": "banjo_06",
            "title": "Chicken Makhani Banjo",
            "category": "banjos",
            "food_type": "non_veg",
            "price": 169.0,
            "original_price": 189.0,
            "unit": "1 Banjo",
            "image": "https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=600&q=80",
            "badge": "House Special",
            "discount": "11% OFF",
            "description": "Succulent chicken chunks simmered in a velvety butter makhani gravy inside freshly toasted warm buns.",
            "variants": [
                {"name": "Regular", "price": 169.0},
                {"name": "+ Cheese", "price": 189.0}
            ]
        },

        # --- BURGERS ---
        {
            "id": "burger_01",
            "title": "Veg Burger",
            "category": "burgers",
            "food_type": "veg",
            "price": 79.0,
            "original_price": 99.0,
            "unit": "1 Burger",
            "image": "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80",
            "badge": "Classic",
            "discount": "20% OFF",
            "description": "Golden fried spiced vegetable patty with crisp iceberg lettuce, fresh sliced tomato, and creamy burger mayo.",
            "variants": [
                {"name": "Regular", "price": 79.0},
                {"name": "+ Cheese", "price": 99.0}
            ]
        },
        {
            "id": "burger_02",
            "title": "Spinach Corn Burger",
            "category": "burgers",
            "food_type": "veg",
            "price": 99.0,
            "original_price": 119.0,
            "unit": "1 Burger",
            "image": "https://images.unsplash.com/photo-1585238342024-78d387f4a707?auto=format&fit=crop&w=600&q=80",
            "badge": "Fresh",
            "discount": "17% OFF",
            "description": "Delightful patty infused with sweet corn kernels and tender spinach, dressed in herb mayo on a soft sesame bun.",
            "variants": [
                {"name": "Regular", "price": 99.0},
                {"name": "+ Cheese", "price": 119.0}
            ]
        },
        {
            "id": "burger_03",
            "title": "Tandoori Paneer Burger",
            "category": "burgers",
            "food_type": "veg",
            "price": 119.0,
            "original_price": 139.0,
            "unit": "1 Burger",
            "image": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=600&q=80",
            "badge": "Spicy",
            "discount": "14% OFF",
            "description": "Thick roasted paneer slice dusted in spicy tandoori rub with caramelized onions and cilantro mint spread.",
            "variants": [
                {"name": "Regular", "price": 119.0},
                {"name": "+ Cheese", "price": 139.0}
            ]
        },
        {
            "id": "burger_04",
            "title": "Chicken Burger",
            "category": "burgers",
            "food_type": "non_veg",
            "price": 129.0,
            "original_price": 149.0,
            "unit": "1 Burger",
            "image": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80",
            "badge": "Crispy",
            "discount": "13% OFF",
            "description": "Crispy batter-fried juicy chicken patty layered with tangy gherkins, crunchy lettuce, and house pepper mayo.",
            "variants": [
                {"name": "Regular", "price": 129.0},
                {"name": "+ Cheese", "price": 149.0}
            ]
        },

        # --- PIZZA ---
        {
            "id": "pizza_01",
            "title": "Cheese Margarita Pizza",
            "category": "pizza",
            "food_type": "veg",
            "price": 149.0,
            "original_price": 199.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=600&q=80",
            "badge": "All-Time Fav",
            "discount": "25% OFF",
            "description": "Classic stone-baked hand-stretched crust topped with signature herb tomato sauce and bubbling 100% mozzarella.",
            "variants": [
                {"name": "Regular", "price": 149.0},
                {"name": "Dbl Cheese", "price": 199.0}
            ]
        },
        {
            "id": "pizza_02",
            "title": "Cheese and Corn Pizza",
            "category": "pizza",
            "food_type": "veg",
            "price": 179.0,
            "original_price": 229.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
            "badge": "Cheesy",
            "discount": "22% OFF",
            "description": "Sweet golden American corn loaded generously over a gooey layer of melted mozzarella and Italian oregano.",
            "variants": [
                {"name": "Regular", "price": 179.0},
                {"name": "Dbl Cheese", "price": 229.0}
            ]
        },
        {
            "id": "pizza_03",
            "title": "Veg Delight Pizza",
            "category": "pizza",
            "food_type": "veg",
            "price": 189.0,
            "original_price": 239.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
            "badge": "Veggie Load",
            "discount": "21% OFF",
            "description": "Colorful feast of crunchy green capsicum, crisp red onions, ripe diced tomatoes, black olives, and melted cheese.",
            "variants": [
                {"name": "Regular", "price": 189.0},
                {"name": "Dbl Cheese", "price": 239.0}
            ]
        },
        {
            "id": "pizza_04",
            "title": "Paneer Makhani Pizza",
            "category": "pizza",
            "food_type": "veg",
            "price": 239.0,
            "original_price": 289.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?auto=format&fit=crop&w=600&q=80",
            "badge": "Royal Treat",
            "discount": "17% OFF",
            "description": "Creamy buttery makhani sauce base crowned with marinated cottage cheese cubes, capsicum, and fresh coriander.",
            "variants": [
                {"name": "Regular", "price": 239.0},
                {"name": "Dbl Cheese", "price": 289.0}
            ]
        },
        {
            "id": "pizza_05",
            "title": "Tandoori Paneer Pizza",
            "category": "pizza",
            "food_type": "veg",
            "price": 249.0,
            "original_price": 299.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=600&q=80",
            "badge": "Fiery Hot",
            "discount": "17% OFF",
            "description": "Smoky char-grilled paneer pieces, red paprika, sliced onions, and green peppers over molten mozzarella cheese.",
            "variants": [
                {"name": "Regular", "price": 249.0},
                {"name": "Dbl Cheese", "price": 299.0}
            ]
        },
        {
            "id": "pizza_06",
            "title": "Chicken Classic Pizza",
            "category": "pizza",
            "food_type": "non_veg",
            "price": 199.0,
            "original_price": 249.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1544982503-9f984c14501a?auto=format&fit=crop&w=600&q=80",
            "badge": "Classic NV",
            "discount": "20% OFF",
            "description": "Shredded herb chicken baked to golden juicy perfection with tomato basil sauce and creamy melted cheese.",
            "variants": [
                {"name": "Regular", "price": 199.0},
                {"name": "Dbl Cheese", "price": 249.0}
            ]
        },
        {
            "id": "pizza_07",
            "title": "Chicken Delight Pizza",
            "category": "pizza",
            "food_type": "non_veg",
            "price": 229.0,
            "original_price": 279.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1594007654729-407eedc4be65?auto=format&fit=crop&w=600&q=80",
            "badge": "Chef Choice",
            "discount": "18% OFF",
            "description": "Tender spiced chicken chunks, crisp bell peppers, red onions, and hot jalapeños on a thick bubbling cheese base.",
            "variants": [
                {"name": "Regular", "price": 229.0},
                {"name": "Dbl Cheese", "price": 279.0}
            ]
        },
        {
            "id": "pizza_08",
            "title": "Chicken Makhani Pizza",
            "category": "pizza",
            "food_type": "non_veg",
            "price": 249.0,
            "original_price": 299.0,
            "unit": "7 Inch (Regular)",
            "image": "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=600&q=80",
            "badge": "Royal NV",
            "discount": "17% OFF",
            "description": "Decadent butter chicken sauce base topped with roasted chicken tikka cubes and generous stretchy mozzarella.",
            "variants": [
                {"name": "Regular", "price": 249.0},
                {"name": "Dbl Cheese", "price": 299.0}
            ]
        },

        # --- ROLLS ---
        {
            "id": "roll_01",
            "title": "Veg Roll",
            "category": "rolls",
            "food_type": "veg",
            "price": 79.0,
            "original_price": 99.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
            "badge": "Crispy Wrap",
            "discount": "20% OFF",
            "description": "Warm flaky layered paratha wrapped around sautéed garden veggies, chaat masala, and fresh mint relish.",
            "variants": [
                {"name": "Regular", "price": 79.0},
                {"name": "+ Cheese", "price": 99.0}
            ]
        },
        {
            "id": "roll_02",
            "title": "Spinach Corn Roll",
            "category": "rolls",
            "food_type": "veg",
            "price": 89.0,
            "original_price": 109.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
            "badge": "Healthy",
            "discount": "18% OFF",
            "description": "Creamy garlic-infused spinach and sweet corn filling folded inside a freshly tossed soft griddled flatbread.",
            "variants": [
                {"name": "Regular", "price": 89.0},
                {"name": "+ Cheese", "price": 109.0}
            ]
        },
        {
            "id": "roll_03",
            "title": "Tandoori Paneer Roll",
            "category": "rolls",
            "food_type": "veg",
            "price": 129.0,
            "original_price": 149.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80",
            "badge": "Smoky",
            "discount": "13% OFF",
            "description": "Charred tandoori paneer bites rolled with sliced red onions, chaat masala, and spicy green chutney.",
            "variants": [
                {"name": "Regular", "price": 129.0},
                {"name": "+ Cheese", "price": 149.0}
            ]
        },
        {
            "id": "roll_04",
            "title": "Paneer Makhni Roll",
            "category": "rolls",
            "food_type": "veg",
            "price": 139.0,
            "original_price": 159.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
            "badge": "Makhani",
            "discount": "13% OFF",
            "description": "Soft fresh paneer simmered in aromatic makhani sauce wrapped snug inside a golden butter-lacquered paratha.",
            "variants": [
                {"name": "Regular", "price": 139.0},
                {"name": "+ Cheese", "price": 159.0}
            ]
        },
        {
            "id": "roll_05",
            "title": "Egg Roll (Double)",
            "category": "rolls",
            "food_type": "egg",
            "price": 69.0,
            "original_price": 89.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80",
            "badge": "Kolkata Style",
            "discount": "22% OFF",
            "description": "Crisp flaky paratha coated with double eggs cooked golden, tossed with pickled onions, green chilies, and tangy lime.",
            "variants": [
                {"name": "Regular", "price": 69.0},
                {"name": "+ Cheese", "price": 89.0}
            ]
        },
        {
            "id": "roll_06",
            "title": "Chicken Roll",
            "category": "rolls",
            "food_type": "non_veg",
            "price": 119.0,
            "original_price": 139.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80",
            "badge": "Juicy NV",
            "discount": "14% OFF",
            "description": "Tender spiced chicken pieces pan-roasted with onions and bell peppers, rolled in fresh flaky Indian flatbread.",
            "variants": [
                {"name": "Regular", "price": 119.0},
                {"name": "+ Cheese", "price": 139.0}
            ]
        },
        {
            "id": "roll_07",
            "title": "Chicken Makhani Roll",
            "category": "rolls",
            "food_type": "non_veg",
            "price": 159.0,
            "original_price": 179.0,
            "unit": "1 Roll",
            "image": "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80",
            "badge": "ChefNV",
            "discount": "11% OFF",
            "description": "Rich butter chicken chunks tossed in creamy gravy, seasoned herbs, and wrapped in warm handmade paratha.",
            "variants": [
                {"name": "Regular", "price": 159.0},
                {"name": "+ Cheese", "price": 179.0}
            ]
        },

        # --- MOMOS & DESSERTS ---
        {
            "id": "momo_01",
            "title": "Veg Momo",
            "category": "momos_desserts",
            "food_type": "veg",
            "price": 99.0,
            "original_price": 119.0,
            "unit": "6 Pieces",
            "image": "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=600&q=80",
            "badge": "Steamed",
            "discount": "17% OFF",
            "description": "Delicately pleated Himalayan dumplings packed with fresh shredded cabbage, carrots, spring onions, and spicy red chutney.",
            "variants": [
                {"name": "Regular", "price": 99.0},
                {"name": "+ Cheese", "price": 119.0}
            ]
        },
        {
            "id": "momo_02",
            "title": "Paneer Momo",
            "category": "momos_desserts",
            "food_type": "veg",
            "price": 119.0,
            "original_price": 139.0,
            "unit": "6 Pieces",
            "image": "https://images.unsplash.com/photo-1625398407796-82650a8c135f?auto=format&fit=crop&w=600&q=80",
            "badge": "Soft & Juicy",
            "discount": "14% OFF",
            "description": "Steamed dumplings bursting with flavorful spiced grated paneer, fresh coriander, ginger, and hot garlic dip.",
            "variants": [
                {"name": "Regular", "price": 119.0},
                {"name": "+ Cheese", "price": 139.0}
            ]
        },
        {
            "id": "momo_03",
            "title": "Chicken Momo",
            "category": "momos_desserts",
            "food_type": "non_veg",
            "price": 119.0,
            "original_price": 139.0,
            "unit": "6 Pieces",
            "image": "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?auto=format&fit=crop&w=600&q=80",
            "badge": "Himalayan Classic",
            "discount": "14% OFF",
            "description": "Juicy minced chicken infused with garlic and scallions, wrapped in thin dough skins and steamed to juicy perfection.",
            "variants": [
                {"name": "Regular", "price": 119.0},
                {"name": "+ Cheese", "price": 139.0}
            ]
        },
        {
            "id": "dessert_01",
            "title": "Choco Lava Cake",
            "category": "momos_desserts",
            "food_type": "veg",
            "price": 119.0,
            "original_price": 149.0,
            "unit": "1 Piece",
            "image": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=600&q=80",
            "badge": "Hot Dessert",
            "discount": "20% OFF",
            "description": "Warm, indulgent chocolate cake with a molten liquid Belgian chocolate core that flows with every spoon.",
            "variants": [
                {"name": "Regular", "price": 119.0}
            ]
        },
        {
            "id": "dessert_02",
            "title": "Walnut Brownie",
            "category": "momos_desserts",
            "food_type": "veg",
            "price": 129.0,
            "original_price": 159.0,
            "unit": "1 Piece",
            "image": "https://images.unsplash.com/photo-1607920591413-4ec007e70023?auto=format&fit=crop&w=600&q=80",
            "badge": "Fudgy Treat",
            "discount": "19% OFF",
            "description": "Rich fudgy dark cocoa brownie loaded with roasted crunchy walnut pieces. Best served warm.",
            "variants": [
                {"name": "Regular", "price": 129.0}
            ]
        }
    ]

    # Insert / update every product in MongoDB Atlas
    for item in menu_items:
        prod_doc = {
            "id": item["id"],
            "title": item["title"],
            "category": item["category"],
            "food_type": item["food_type"],
            "price": item["price"],
            "original_price": item["original_price"],
            "unit": item["unit"],
            "image": item["image"],
            "badge": item["badge"],
            "discount": item["discount"],
            "description": item["description"],
            "nutrition": "Freshly prepared at Banjos Cafe kitchen.",
            "supplier_name": "Banjos Cafe",
            "supplier_company_name": "Banjos Cafe",
            "supplier_id": 22,
            "supplier_user_id": "22",
            "is_online": True,
            "rating": 4.9,
            "reviews_count": 86,
            "variants": item["variants"]
        }
        mongo_db.mongo_save_product(prod_doc)
        print(f"  + Added: {item['title']} ({item['category']}) with {len(item['variants'])} variant(s)")

    print(f"\n[DONE] Successfully seeded all {len(menu_items)} Banjos Cafe items into MongoDB Atlas!")

if __name__ == "__main__":
    seed()
