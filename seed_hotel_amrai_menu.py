"""
Seed Hotel Amrai Supplier Account and 75 Authentic Menu Items with High-Res Food Images.
Account:
  Username: Ketan
  Password: Ketan@Amrai
  Company / Restaurant: Hotel Amrai
"""
import os
import sys
import random

os.chdir(r"C:\Users\lalkr\OneDrive\Desktop\dropzyy-main")
sys.path.insert(0, r"C:\Users\lalkr\OneDrive\Desktop\dropzyy-main")

from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
import models
import auth
import mongo_db

db = SessionLocal()

# 1. CREATE OR UPDATE USER 'Ketan'
print("--- STEP 1: Creating/Verifying Supplier Account 'Ketan' ---")
password_plain = "Ketan@Amrai"
hashed_pw = auth.hash_password(password_plain)

user = db.query(models.User).filter(models.User.username.ilike("ketan")).first()
if not user:
    user = models.User(
        username="Ketan",
        email="ketan@hotelamrai.com",
        password_hash=hashed_pw,
        full_name="Ketan Patil (Hotel Amrai)",
        role="supplier",
        supplier_company_name="Hotel Amrai",
        phone="9890123456",
        street_address="Amrai Garden Restaurant, Main Road",
        city="Dropzyy City",
        pincode="425107",
        is_verified=True,
        store_open=True,
        open_time="10:00 AM",
        close_time="11:30 PM",
        banner_image="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
        max_devices=5
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created SQLite Supplier User 'Ketan' with ID: {user.id}")
else:
    user.password_hash = hashed_pw
    user.role = "supplier"
    user.supplier_company_name = "Hotel Amrai"
    user.store_open = True
    db.commit()
    print(f"Updated existing SQLite Supplier User 'Ketan' with ID: {user.id}")

# Sync to MongoDB Atlas
if mongo_db.is_mongo_active():
    try:
        m_db = mongo_db.get_mongo_db()
        m_user = {
            "id": user.id,
            "username": "Ketan",
            "email": "ketan@hotelamrai.com",
            "password_hash": hashed_pw,
            "full_name": "Ketan Patil (Hotel Amrai)",
            "role": "supplier",
            "supplier_company_name": "Hotel Amrai",
            "phone": "9890123456",
            "store_open": True,
            "is_verified": True,
            "banner_image": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
            "max_devices": 5
        }
        m_db.users.update_one({"username": {"$regex": "^ketan$", "$options": "i"}}, {"$set": m_user}, upsert=True)
        print("Synced Supplier 'Ketan' to MongoDB Atlas Cloud Database!")
    except Exception as me:
        print("[MONGO NOTICE] User sync warning:", me)

# 2. DEFINING 75 HOTEL AMRAI MENU ITEMS WITH APPETIZING FOOD PHOTOS
RAW_ITEMS = [
    # Starters & Snacks
    ("Peri Peri Finger Chips / French Fries", 100, "starters", "Crispy golden potato fries tossed in zesty African peri-peri spice blend.", "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=600&q=80", "1 Plate", "Crispy & Spicy"),
    ("Finger Chips / French Fries", 95, "starters", "Classic salted golden crispy potato french fries served hot with dip.", "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=600&q=80", "1 Plate", "Classic Snack"),
    ("Chana Roast Garlic", 140, "starters", "Spicy roasted chickpeas tossed with golden crisp garlic cloves and aromatic spices.", "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80", "1 Plate", "Crunchy Garlic"),

    # Chinese Starters & Soups
    ("Veg Manchow Soup", 90, "chinese", "Spicy Indo-Chinese soup loaded with chopped vegetables, garlic, ginger and topped with crispy noodles.", "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=600&q=80", "1 Bowl (300ml)", "Hot & Spicy"),
    ("Soyabean Chilli (Dry / Gravy)", 140, "chinese", "Protein-packed soyabean chunks tossed in spicy dark soya, chilli, and bell pepper sauce.", "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?auto=format&fit=crop&w=600&q=80", "1 Plate", "High Protein"),
    ("Veg Manchurian (Dry / Gravy)", 140, "chinese", "Crispy minced vegetable dumplings tossed in tangy Chinese garlic soya sauce.", "https://images.unsplash.com/photo-1569058242253-92a9c755a0ec?auto=format&fit=crop&w=600&q=80", "1 Plate", "All-Time Fav"),
    ("Paneer Chilli (Dry / Gravy)", 180, "chinese", "Soft malai paneer cubes flash-fried and tossed with crunchy capsicum, onions and fiery green chillies.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "1 Plate", "Bestseller"),
    ("Mushroom Chilli (Dry / Gravy)", 180, "chinese", "Fresh button mushrooms wok-tossed in pungent chilli garlic sauce with spring onions.", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80", "1 Plate", "Chef Special"),
    ("Paneer 65", 210, "chinese", "South Indian style fiery paneer cubes marinated with curry leaves, crushed pepper and mustard seeds.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Plate", "Fiery Starter"),
    ("Veg 65", 170, "chinese", "Crisp battered farm vegetables fried with aromatic curry leaves and red chilli temper.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Plate", "Crispy Delight"),

    # Chinese Rice & Noodles
    ("Paneer Fried Rice", 170, "chinese", "Fragrant basmati rice stir-fried in a hot wok with soft paneer cubes, spring onions and light soy.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Box (Serves 1-2)", "Popular"),
    ("Veg Fried Rice", 140, "chinese", "Classic wok-tossed basmati rice with finely shredded carrots, cabbage, and French beans.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Box", "Classic"),
    ("Veg Schezwan Fried Rice", 150, "chinese", "Spicy basmati rice wok-tossed in homemade fiery Sichuan pepper and red chilli paste.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Box", "Spicy Kick"),
    ("Manchurian Fried Rice", 180, "chinese", "Flavorful combo of wok fried rice topped with savory vegetable Manchurian balls and gravy.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Box", "Chef Special"),
    ("Veg Hakka Noodles", 140, "chinese", "Silky wheat noodles stir-fried with julienned vegetables, white pepper and light soy sauce.", "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=600&q=80", "1 Box", "Popular"),
    ("Veg Schezwan Noodles", 150, "chinese", "Wok-tossed noodles coated in authentic spicy Sichuan sauce with crunchy cabbage and peppers.", "https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=600&q=80", "1 Box", "Hot & Savory"),

    # Main Course: Farmer's Special (Veg Curries)
    ("Veg Angara", 210, "main-course", "Rich spicy vegetable curry infused with real charcoal smoke (dhungar) and aromatic roasted spices.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2", "Smoky Flavor"),
    ("Veg Tufani", 200, "main-course", "Robust and zesty mixed vegetables simmered in a thick, storm of rustic North Indian spices.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2", "Chef Special"),
    ("Kaju Paneer Masala", 220, "main-course", "Decadent curry blending whole roasted cashew nuts and soft malai paneer in a golden butter gravy.", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", "Serves 2", "Royal Delight"),
    ("Kaju Curry", 220, "main-course", "Whole roasted cashews cooked in a rich, creamy mildly spiced tomato onion cashew sauce.", "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80", "Serves 2", "Nutty & Rich"),
    ("Veg Patiala Masala", 250, "main-course", "Punjabi specialty of stuffed vegetable rolls simmered in two distinct contrasting velvety gravies.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2-3", "Signature Dish"),
    ("Veg Kolhapuri", 160, "main-course", "Fiery authentic Kolhapuri style curry made with Lavangi chillies, coconut and farm vegetables.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2", "Kolhapuri Spicy"),
    ("Mix Veg", 150, "main-course", "Homestyle medley of seasonal vegetables cooked in a spiced cumin and coriander gravy.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2", "Homestyle"),
    ("Veg Maratha (Black Gravy)", 200, "main-course", "Traditional Khandeshi/Maharashtrian vegetable koftas simmered in dark roasted kala masala gravy.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2", "Authentic Maratha"),
    ("Shev Bhaji", 130, "main-course", "Famous Khandeshi spicy curry loaded with crisp spicy ratlami shev in red-hot tarri gravy.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "Serves 2", "Local Favorite"),

    # Paneer Special
    ("Paneer Patiala Masala", 250, "paneer", "Royal dish of soft paneer rolls and cubes served in a rich spiced Punjabi Patiala gravy.", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", "Serves 2", "Royal"),
    ("Paneer Angara", 230, "paneer", "Cottage cheese cubes infused with charcoal smoke and simmered in a bold fiery red gravy.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Smoky & Spicy"),
    ("Paneer Masala", 160, "paneer", "Classic onion-tomato gravy with tender paneer cubes spiced with garam masala.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Classic"),
    ("Shahi Paneer", 200, "paneer", "Mild, sweet and rich royal gravy made with cashews, cream, saffron and delicate cottage cheese.", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", "Serves 2", "Mild & Creamy"),
    ("Paneer Hyderabadi", 220, "paneer", "Spinach, mint, and cilantro infused green gravy cooked with fresh paneer and whole spices.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Green Gravy"),
    ("Paneer Tufani", 220, "paneer", "Thick and spicy tomato-onion curry loaded with tender paneer and capsicum.", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", "Serves 2", "Tangy & Bold"),
    ("Paneer Kolhapuri", 190, "paneer", "Fiery spicy paneer curry cooked with authentic roasted Kolhapuri dry coconut and red chillies.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Extra Spicy"),
    ("Paneer Butter Masala", 210, "paneer", "All-time favorite creamy butter tomato makhani sauce enriched with cream and soft paneer.", "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=600&q=80", "Serves 2", "Top Bestseller"),
    ("Paneer Banjara Tikka Masala", 250, "paneer", "Clay oven roasted marinated Banjara paneer tikka tossed in a spicy aromatic thick curry.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "Serves 2", "Tandoor Infused"),
    ("Paneer Bhurji (Dry)", 230, "paneer", "Scrambled cottage cheese stir-fried with chopped onions, tomatoes, ginger and green chillies.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Dry Special"),
    ("Paneer Bhurji (Gravy)", 220, "paneer", "Scrambled fresh paneer cooked in a rich, buttery onion tomato masala sauce.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Rich Gravy"),
    ("Paneer Tikka Masala", 250, "paneer", "Charcoal-grilled paneer tikka chunks dunked in a velvety spiced makhani tomato gravy.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "Serves 2", "Customer Fav"),

    # Dal (Lentils)
    ("Dal Tadka", 130, "dal", "Yellow toor dal tempered with double cumin seeds, sizzling garlic, dried red chillies and pure desi ghee.", "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80", "Serves 2", "Desi Ghee"),
    ("Dal Fry Kolhapuri", 150, "dal", "Spicy and pungent yellow lentils tempered with Kolhapuri spices and fresh coriander.", "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80", "Serves 2", "Spicy"),
    ("Dal Palak", 160, "dal", "Nutritious toor lentils slow-cooked with fresh shredded farm spinach and garlic tadka.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "Serves 2", "Healthy & Fresh"),

    # Tandoori (Tikka & Kebabs)
    ("Paneer Tikka (Dry)", 250, "tandoori", "Chunks of fresh paneer marinated in spiced yogurt and roasted on charcoal skewers to perfection.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "6 Pcs", "Charcoal Grilled"),
    ("Paneer Achari Tikka", 270, "tandoori", "Paneer cubes infused with pungent pickling spices (kalonji, mustard, fenugreek) and roasted.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "6 Pcs", "Tangy Pickle"),
    ("Paneer Lasuni Tikka", 260, "tandoori", "Paneer skewers marinated in thick garlic paste, cream, roasted cumin and baked crisp in tandoor.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "6 Pcs", "Garlic Lover"),
    ("Mushroom Tikka", 250, "tandoori", "Fresh whole button mushrooms marinated in aromatic tandoori masala and char-grilled.", "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80", "1 Portion", "Juicy Tikka"),

    # Rice & Biryani
    ("Dal Khichdi", 150, "rice", "Comfort food of rice and lentils tempered with cumin, turmeric, mild green chillies and ghee.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Bowl (Serves 1-2)", "Comfort Food"),
    ("Tadka Dal Khichdi", 160, "rice", "Classic dal khichdi elevated with an extra sizzling garlic, red chilli, and hing tadka.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Bowl", "Aromatic"),
    ("Butter Dal Khichdi", 160, "rice", "Silky smooth dal khichdi loaded with generous dollops of melted Amul butter.", "https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=600&q=80", "1 Bowl", "Extra Butter"),
    ("Jeera Rice (Full)", 100, "rice", "Fluffy long-grain basmati rice tempered with aromatic royal cumin seeds and fresh coriander.", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80", "Full Portion", "Basmati Rice"),
    ("Jeera Rice (Half)", 65, "rice", "Single-serving portion of fragrant jeera basmati rice.", "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80", "Half Portion", "Quick Bite"),
    ("Veg Biryani", 190, "rice", "Slow-cooked dum biryani layered with marinated farm vegetables, saffron basmati, and fried onions.", "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80", "1 Handi (Serves 1-2)", "Dum Biryani"),
    ("Paneer Tikka Dum Biryani", 240, "rice", "Signature royal dum biryani cooked with charcoal-grilled paneer tikka cubes, biryani masala and saffron.", "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80", "1 Handi", "Chef Special"),
    ("Veg Hyderabadi Biryani", 200, "rice", "Spicy green-spiced Hyderabadi style layered basmati rice with mint, brown onions, and vegetables.", "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80", "1 Handi", "Hyderabadi Style"),

    # Breads (Roti & Naan)
    ("Tandoori Roti", 15, "breads", "Crisp whole wheat flatbread baked inside a flaming clay tandoor oven.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Tandoor Fresh"),
    ("Butter Roti", 20, "breads", "Hot tandoori wheat roti glazed with rich melted dairy butter.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Butter Glazed"),
    ("Chapati", 15, "breads", "Soft homestyle wheat chapati made fresh on tawa.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Homestyle"),
    ("Butter Chapati", 18, "breads", "Tawa wheat chapati topped with butter.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Soft"),
    ("Phulka", 20, "breads", "Light puffed wheat phulka roasted over open flame.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Light & Soft"),
    ("Butter Phulka", 25, "breads", "Puffed flame phulka slathered with pure butter.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Pure Butter"),
    ("Plain Naan", 40, "breads", "Leavened fine flour bread baked crisp on the outside and soft inside the tandoor.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Pc", "Tandoori Naan"),
    ("Butter Naan", 45, "breads", "Signature clay-oven baked naan brushed generously with rich melted butter.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Pc", "Bestseller"),
    ("Garlic Naan", 50, "breads", "Tandoori naan topped with roasted minced garlic and fresh green coriander leaves.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Pc", "Garlic Butter"),
    ("Butter Garlic Naan", 60, "breads", "Crisp garlic-crusted naan drenched with warm melted butter.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Pc", "Most Popular"),
    ("Kulcha", 35, "breads", "Soft leavened flatbread sprinkled with nigella seeds and baked in tandoor.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Classic"),
    ("Butter Kulcha", 40, "breads", "Flaky soft tandoori kulcha enriched with creamy butter.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Flaky"),
    ("Bajra Bhakri", 25, "breads", "Traditional rural pearl-millet (bajra) bread baked on clay tawa - gluten-free and rustic.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Traditional"),
    ("Butter Bajra Bhakri", 30, "breads", "Healthy hot bajra bhakri topped with a generous dollop of butter.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Desi Style"),
    ("Lachha Paratha", 45, "breads", "Multi-layered flaky spiral wheat flatbread baked crisp in tandoor.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Multi Layered"),
    ("Butter Lachha Paratha", 50, "breads", "Crispy flaky layered paratha loaded with creamy butter between layers.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Crispy & Rich"),
    ("Tawa Paratha", 30, "breads", "Square layered wheat paratha shallow-fried crisp on tawa.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Homestyle"),
    ("Butter Tawa Paratha", 35, "breads", "Crisp tawa paratha with extra butter topping.", "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=600&q=80", "1 Pc", "Rich"),
    ("Cheese Naan", 55, "breads", "Tandoori naan stuffed with bubbling melted cheese and herb seasoning.", "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80", "1 Pc", "Cheesy"),

    # Papad & Chef's Specials
    ("Sindhi Papad", 60, "specials", "Crispy, peppery Sindhi style papad roasted with cumin and black pepper.", "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80", "2 Pcs", "Crispy Starter"),
    ("Special Veg Hariyali", 290, "specials", "Chef's special emerald-green curry of baby veggies, paneer and cashews in a rich spinach-mint-coriander gravy.", "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=600&q=80", "Serves 2-3", "Signature"),
    ("Paneer Veg Tikka Tadka Masala", 290, "specials", "House specialty combining smoky tandoori paneer tikka and grilled veggies with a sizzling garlic tadka.", "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80", "Serves 2-3", "Chef Special"),
    ("Cheese Balls", 270, "specials", "Golden fried crunchy dumplings stuffed with molten gooey mozzarella, jalapeños, and herbs.", "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80", "6 Pcs", "Cheese Lovers")
]

print(f"\n--- STEP 2: Inserting {len(RAW_ITEMS)} Menu Items into SQLite and MongoDB Atlas ---")

# Clear existing Hotel Amrai items to prevent duplicate pile-up
db.query(models.Product).filter(
    (models.Product.supplier_user_id == user.id) | (models.Product.supplier_name == "Hotel Amrai")
).delete(synchronize_session=False)
db.commit()

mongo_active = mongo_db.is_mongo_active()
m_db = mongo_db.get_mongo_db() if mongo_active else None
if m_db is not None:
    m_db.products.delete_many({"$or": [{"supplier_user_id": user.id}, {"supplier_company_name": "Hotel Amrai"}, {"supplier_name": "Hotel Amrai"}]})

inserted_count = 0
for idx, item in enumerate(RAW_ITEMS, start=1):
    title, price, category, desc, img, unit, badge = item
    prod_id = f"amrai_{idx:02d}"
    orig_price = round(price * 1.15, 0)
    rating = round(random.uniform(4.7, 4.95), 1)
    rev_count = random.randint(40, 110)
    
    # 1. SQLite Insert
    p_model = models.Product(
        id=prod_id,
        title=title,
        category=category,
        price=float(price),
        original_price=float(orig_price),
        unit=unit,
        rating=rating,
        reviews_count=rev_count,
        image=img,
        badge=badge,
        discount="15% OFF",
        description=desc,
        nutrition="Freshly prepared with authentic vegetarian ingredients at Hotel Amrai.",
        supplier_name="Hotel Amrai",
        is_online=True,
        in_stock=True,
        stock_quantity=99,
        show_stock_to_customer=False,
        supplier_id=user.id,
        supplier_user_id=user.id
    )
    db.add(p_model)
    
    # 2. Mongo Atlas Insert
    if m_db is not None:
        p_doc = {
            "id": prod_id,
            "title": title,
            "category": category,
            "price": float(price),
            "original_price": float(orig_price),
            "unit": unit,
            "rating": rating,
            "reviews_count": rev_count,
            "image": img,
            "badge": badge,
            "discount": "15% OFF",
            "description": desc,
            "nutrition": "Freshly prepared with authentic vegetarian ingredients at Hotel Amrai.",
            "supplier_name": "Hotel Amrai",
            "supplier_company_name": "Hotel Amrai",
            "food_type": "veg",
            "is_online": True,
            "in_stock": True,
            "stock_quantity": 99,
            "show_stock_to_customer": False,
            "supplier_id": user.id,
            "supplier_user_id": user.id
        }
        m_db.products.insert_one(p_doc)
        
    inserted_count += 1

db.commit()
db.close()

print(f"\nSUCCESS: Successfully added {inserted_count} Hotel Amrai menu items to both SQLite & MongoDB Atlas!")
print(f"Supplier Credentials: Username = 'Ketan' | Password = 'Ketan@Amrai' | Restaurant = 'Hotel Amrai'")
