# Dropzyy 1 🛒 Instant Delivery E-Commerce Store

Welcome to **Dropzyy 1** — a fast, modern, and high-performance e-commerce web application for purchasing groceries, restaurant food, produce, dairy, and beverages with 15-minute delivery.

## 🌟 Key Features

- **Modern & Responsive UI**: Clean glassmorphism header, curated emerald/mint palette, Outfit & Plus Jakarta Sans typography.
- **Dynamic Category Filtering**: Browse Fruits, Vegetables, Dairy & Eggs, Bakery, Snacks, and Restaurant Food.
- **Live Search & Sorting**: Real-time search by product name/description and sort by popularity, price, or rating.
- **Supplier & Restaurant Portals**: Real-time store availability calendar, operational hours, and product catalog management.
- **Quick View Product Modal**: View nutritional highlights, customer reviews, and product details.
- **Interactive Slide-Out Cart Drawer**:
  - Item quantity controls & real-time total updates.
  - Free shipping progress bar (Free shipping over ₹299).
  - Promo code discounts (Use code `FRESH10` for 10% OFF).
  - State persistence with JWT authentication.
- **Multi-Step Checkout & Order Tracking**: Complete delivery address, payment method selection (UPI, Credit/Debit, Cash on Delivery), live SMS/email receipts, and order status tracking.

## 🚀 Getting Started

Simply run locally with Uvicorn:

```bash
uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000` in your web browser.

## 📁 Project Structure

```
dropzyy/
├── index.html   # Main HTML structure & semantic elements
├── style.css    # Comprehensive CSS design system & responsive styling
├── app.js       # Application state, cart logic, & DOM interaction
├── main.py      # FastAPI backend application
├── models.py    # SQLAlchemy database models
├── schemas.py   # Pydantic schemas
├── auth.py      # Bcrypt hashing & JWT security utilities
├── database.py  # SQLite database configuration (dropzyy.db)
├── mongo_db.py  # MongoDB Atlas integration
├── .env         # Environment configuration (secrets & keys)
└── README.md    # Project documentation
```

---
*Dropzyy Instant Delivery Platform*
