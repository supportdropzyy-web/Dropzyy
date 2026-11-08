"""
Dropzyy 1 - SQLAlchemy Database Models
"""
import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Text, Boolean
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="customer") # 'admin', 'supplier', 'customer'
    supplier_company_name = Column(String, nullable=True) # e.g. 'Ramesh Kirana Wholesale Co.'
    phone = Column(String, nullable=True)
    street_address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    pincode = Column(String, nullable=True)
    is_verified = Column(Boolean, default=False)
    store_open = Column(Boolean, default=True)
    open_time = Column(String, default="08:00 AM")
    close_time = Column(String, default="10:00 PM")
    banner_image = Column(String, nullable=True) # Restaurant / Store Front Image / Banner
    telegram_chat_id = Column(String, nullable=True) # Connected Telegram Chat ID for kitchen order alerts

    menu_card_image = Column(String, nullable=True) # Full Restaurant Menu Card Image
    max_devices = Column(Integer, default=1) # Maximum concurrent login devices allowed (Admin configurable, default 1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    products = relationship("Product", back_populates="supplier_user")
    device_sessions = relationship("UserDeviceSession", back_populates="user", cascade="all, delete-orphan")

class UserDeviceSession(Base):
    __tablename__ = "user_device_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    device_id = Column(String, index=True, nullable=False)
    device_name = Column(String, nullable=True) # e.g. 'Chrome on Windows PC', 'Safari on iPhone'
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    last_active_at = Column(DateTime, default=datetime.datetime.utcnow)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="device_sessions")

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    contact_person = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    city = Column(String, nullable=True)

    products = relationship("Product", back_populates="supplier")

class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, index=True, nullable=False)
    price = Column(Float, nullable=False)
    original_price = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    rating = Column(Float, default=4.8)
    reviews_count = Column(Integer, default=100)
    image = Column(String, nullable=False)
    badge = Column(String, default="Fresh")
    discount = Column(String, default="10% OFF")
    description = Column(Text, nullable=True)
    nutrition = Column(Text, nullable=True)
    supplier_name = Column(String, default="Dropzyy Direct Mandi") # e.g. 'Ramesh Kirana Wholesale Co.'
    is_online = Column(Boolean, default=True)
    in_stock = Column(Boolean, default=True)
    stock_quantity = Column(Integer, default=50)
    show_stock_to_customer = Column(Boolean, default=True)
    
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    supplier = relationship("Supplier", back_populates="products")
    supplier_user = relationship("User", back_populates="products")

class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, nullable=True)
    date = Column(String, nullable=False)
    status = Column(String, default="Placed")
    total = Column(Float, nullable=False)
    delivery_json = Column(Text, nullable=True)
    items_json = Column(Text, nullable=True)
    cancelled_by = Column(String, nullable=True)
    cancel_reason = Column(Text, nullable=True)
    cancelled_at = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    product_id = Column(String, index=True, nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True, nullable=False)
    product_id = Column(String, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    discount_percent = Column(Float, default=0.0)
    discount_type = Column(String, default="percent")  # 'flat' (direct price e.g. ₹20, ₹30) or 'percent' (%)
    discount_value = Column(Float, default=0.0)        # ₹ amount or %
    min_order = Column(Float, default=0.0)             # 0 for every order, or 300, 400 etc.
    usage_limit = Column(String, default="unlimited")  # 'once_per_user' or 'unlimited'
    used_by = Column(Text, default="[]")               # JSON list of usernames who redeemed it
    target = Column(String, default="everyone")        # 'everyone' or 'user'
    target_user = Column(String, nullable=True)        # username if target == 'user'
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    city = Column(String, nullable=True)
    area = Column(String, nullable=True)
    pincode = Column(String, nullable=False)
    delivery_time = Column(String, default="15 Mins")
    delivery_charge = Column(Float, nullable=True, default=None)  # Custom delivery fee for this location in INR
    distance_km = Column(Float, nullable=True, default=None)      # Distance from store/hub in KM

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=True)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=True)
    created_by_supplier = Column(String, nullable=True)

class SupplierAvailability(Base):
    __tablename__ = "supplier_availability"

    id = Column(Integer, primary_key=True, index=True)
    supplier_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date = Column(String, nullable=False)          # Format: YYYY-MM-DD
    is_open = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class SiteVisitor(Base):
    __tablename__ = "site_visitors"

    id = Column(Integer, primary_key=True, index=True)
    visitor_id = Column(String, index=True, nullable=True) # Unique client visitor session ID
    date = Column(String, index=True, nullable=False)      # Format: YYYY-MM-DD
    month = Column(String, index=True, nullable=False)     # Format: YYYY-MM
    year = Column(Integer, index=True, nullable=False)      # e.g. 2026
    page = Column(String, default="/")
    device = Column(String, default="Desktop")             # Mobile, Tablet, Desktop
    city = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class DeliverySetting(Base):
    __tablename__ = "delivery_settings"

    id = Column(Integer, primary_key=True, index=True)
    free_delivery_threshold = Column(Float, default=300.0)   # Free delivery for orders above this value (e.g. ₹300)
    standard_delivery_fee = Column(Float, default=30.0)      # Delivery fee when below threshold or fixed (e.g. ₹30)
    is_free_delivery_enabled = Column(Boolean, default=True) # Whether threshold-based free delivery is enabled
    charge_type = Column(String, default="threshold")        # 'threshold', 'fixed', 'free', 'location', 'per_km'
    min_order_value = Column(Float, default=50.0)            # Minimum order amount to proceed to checkout
    description = Column(String, nullable=True)
    per_km_rate = Column(Float, default=10.0)                # Additional fee per KM (e.g. 10/km)
    base_km = Column(Float, default=2.0)                     # Base distance included in base fee (e.g. up to 2 KM)
    base_delivery_fee = Column(Float, default=20.0)          # Base fee for first base_km (e.g. 20)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class BlockedContact(Base):
    __tablename__ = "blocked_contacts"

    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True, index=True)
    reason = Column(String, nullable=True)
    blocked_by = Column(String, default="admin")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True)
    username = Column(String, nullable=True, index=True)
    role = Column(String, default="customer")  # admin, supplier, rider, customer
    endpoint = Column(Text, unique=True, index=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class WebsiteAnnouncement(Base):
    __tablename__ = "website_announcements"

    id = Column(Integer, primary_key=True, index=True)
    is_enabled = Column(Boolean, default=False)
    message = Column(String, default="")
    badge_text = Column(String, default="ANNOUNCEMENT")
    display_type = Column(String, default="scrolling") # 'scrolling' or 'static'
    color_theme = Column(String, default="emerald")    # 'emerald', 'amber', 'rose', 'indigo'
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
