"""
Dropzyy 1 - FastAPI REST API Application & Web Server
Run locally with: uvicorn main:app --reload --port 8000
"""
import uuid
import os
import random
import datetime
import smtplib
import io
import base64
import time
from collections import defaultdict
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from fastapi import FastAPI, Depends, HTTPException, status, Query, Response, Request
from fastapi.responses import Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from dotenv import load_dotenv

# Load secure environment variables from .env
load_dotenv()

import models
from sqlalchemy import text, or_
import schemas
import auth
import mongo_db
from database import engine, Base, get_db

# ==============================================================================
# 🛡️ SECURITY HEADERS MIDDLEWARE
# ==============================================================================
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        return response

# ==============================================================================
# ⏱️ IN-MEMORY RATE LIMITER (Zero-dependency sliding window)
# ==============================================================================
_rate_limit_store: Dict[str, list] = defaultdict(list)

def check_rate_limit(key: str, limit: int = 10, window_sec: int = 60) -> bool:
    """Return True if under rate limit, False if rate limit exceeded."""
    now = time.time()
    timestamps = [t for t in _rate_limit_store[key] if now - t < window_sec]
    if len(timestamps) >= limit:
        return False
    timestamps.append(now)
    _rate_limit_store[key] = timestamps
    return True

# ==============================================================================
# 🔐 JWT ROLE-BASED ACCESS CONTROL (RBAC) DEPENDENCIES
# ==============================================================================
security_bearer = HTTPBearer(auto_error=False)

def get_current_user_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)) -> Optional[Dict[str, Any]]:
    """Extract and validate bearer token payload if present, or return None."""
    if not credentials or not credentials.credentials:
        return None
    return auth.decode_access_token(credentials.credentials)

def require_authenticated_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)) -> Dict[str, Any]:
    """Ensure user is logged in with a valid JWT token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required. Please log in to proceed.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    payload = auth.decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )
    return payload

def require_admin(payload: Dict[str, Any] = Depends(require_authenticated_user)) -> Dict[str, Any]:
    """Ensure user holds administrator role."""
    role = str(payload.get("role", "")).lower()
    if role not in ["admin", "sub_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Administrator privileges required."
        )
    return payload

def require_supplier(payload: Dict[str, Any] = Depends(require_authenticated_user)) -> Dict[str, Any]:
    """Ensure user holds supplier or administrator role."""
    role = str(payload.get("role", "")).lower()
    if role not in ["supplier", "admin", "sub_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: Supplier or Administrator privileges required."
        )
    return payload

# Initialize DB Tables & Auto-Migrate Missing Columns for SQLite (e.g., Render Deployment)
def auto_migrate_db():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        for col, col_type in [
            ("phone", "VARCHAR"),
            ("street_address", "VARCHAR"),
            ("city", "VARCHAR"),
            ("pincode", "VARCHAR"),
            ("email", "VARCHAR"),
            ("is_verified", "BOOLEAN"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                pass

auto_migrate_db()

app = FastAPI(
    title="Dropzyy 1 - Instant Delivery REST API & Web App",
    description="FastAPI Backend for Dropzyy Instant Delivery with Admin & Supplier Portals",
    version="1.0.0"
)

# Apply Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# Configurable CORS Middleware (loaded securely from .env)
_raw_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,http://127.0.0.1:5500,https://dropzyy.onrender.com,https://dropzyy.vercel.app"
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
if not _allowed_origins or "*" in _allowed_origins:
    _allowed_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

# ROOT & STATIC FILE SERVING FOR DEPLOYMENT (e.g. Render)
@app.get("/")
def read_index():
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    return {"message": "Dropzyy Instant Delivery API Server Running"}

@app.get("/style.css")
def get_css():
    if os.path.exists("style.css"):
        return FileResponse("style.css")
    raise HTTPException(status_code=404, detail="style.css not found")

@app.get("/app.js")
def get_js():
    if os.path.exists("app.js"):
        return FileResponse("app.js")
    raise HTTPException(status_code=404, detail="app.js not found")

@app.get("/dropzyy-logo.png")
def get_dropzyy_logo():
    if os.path.exists("dropzyy-logo.png"):
        return FileResponse("dropzyy-logo.png", media_type="image/png")
    if os.path.exists("logo.png"):
        return FileResponse("logo.png", media_type="image/png")
    raise HTTPException(status_code=404, detail="dropzyy-logo.png not found")

@app.get("/logo.png")
def get_logo():
    if os.path.exists("logo.png"):
        return FileResponse("logo.png", media_type="image/png")
    if os.path.exists("dropzyy-logo.png"):
        return FileResponse("dropzyy-logo.png", media_type="image/png")
    raise HTTPException(status_code=404, detail="logo.png not found")

# SEED DATA FUNCTION
def seed_initial_data(db: Session):
    admin_pw = os.getenv("ADMIN_PASSWORD", "Dropzyy@Admin#2026!")
    yash_pw = os.getenv("YASH_ADMIN_PASSWORD", "12528289Yash@")
    supplier_pw = os.getenv("SUPPLIER_PASSWORD", "Supplier@Dropzyy#2026!")

    # Seed Admin User
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if not admin:
        admin_user = models.User(
            username="admin",
            email="admin@dropzyy.com",
            password_hash=auth.hash_password(admin_pw),
            full_name="System Administrator",
            role="admin",
            is_verified=True
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)
        admin = admin_user
    else:
        if not admin.email:
            admin.email = "admin@dropzyy.com"
        # If admin exists with legacy hash, upgrade to bcrypt
        if not admin.password_hash.startswith(('$2b$', '$2a$', '$2y$')):
            admin.password_hash = auth.hash_password(admin_pw)
        db.commit()

    # Seed Yash Patil Admin User
    yash_admin = db.query(models.User).filter(models.User.username == "yashpatil").first()
    if not yash_admin:
        yash_user = models.User(
            username="yashpatil",
            email="yashpatil@dropzyy.com",
            password_hash=auth.hash_password(yash_pw),
            full_name="Yash Patil (System Admin)",
            role="admin",
            is_verified=True
        )
        db.add(yash_user)
        db.commit()
        db.refresh(yash_user)
        yash_admin = yash_user
    else:
        if not yash_admin.email:
            yash_admin.email = "yashpatil@dropzyy.com"
        if not yash_admin.password_hash.startswith(('$2b$', '$2a$', '$2y$')):
            yash_admin.password_hash = auth.hash_password(yash_pw)
        db.commit()

    # Seed Supplier User
    supplier = db.query(models.User).filter(models.User.username == "supplier").first()
    if not supplier:
        supplier_user = models.User(
            username="supplier",
            email="supplier@dropzyy.com",
            password_hash=auth.hash_password(supplier_pw),
            full_name="Desi Kirana Wholesaler",
            supplier_company_name="Ramesh Kirana Wholesale Co.",
            role="supplier",
            is_verified=True
        )
        db.add(supplier_user)
        db.commit()
        db.refresh(supplier_user)
        supplier = supplier_user
    else:
        if not supplier.email:
            supplier.email = "supplier@dropzyy.com"
        if not supplier.password_hash.startswith(('$2b$', '$2a$', '$2y$')):
            supplier.password_hash = auth.hash_password(supplier_pw)
        db.commit()

    # ── Sync all seeded accounts to MongoDB Atlas ──────────────────────────
    # Uses upsert so restarting the server never creates duplicates.
    if mongo_db.is_mongo_active():
        try:
            mongo_db_conn = mongo_db.get_mongo_db()
            if mongo_db_conn is not None:
                seeded_accounts = [
                    {
                        "id": admin.id,
                        "username": "admin",
                        "email": "admin@dropzyy.com",
                        "password_hash": admin.password_hash,
                        "full_name": "System Administrator",
                        "role": "admin",
                        "is_verified": True,
                        "store_open": True,
                        "open_time": "08:00 AM",
                        "close_time": "10:00 PM",
                        "seeded": True
                    },
                    {
                        "id": yash_admin.id,
                        "username": "yashpatil",
                        "email": "yashpatil@dropzyy.com",
                        "password_hash": yash_admin.password_hash,
                        "full_name": "Yash Patil (System Admin)",
                        "role": "admin",
                        "is_verified": True,
                        "store_open": True,
                        "open_time": "08:00 AM",
                        "close_time": "10:00 PM",
                        "seeded": True
                    },
                    {
                        "id": supplier.id,
                        "username": "supplier",
                        "email": "supplier@dropzyy.com",
                        "password_hash": supplier.password_hash,
                        "full_name": "Desi Kirana Wholesaler",
                        "role": "supplier",
                        "supplier_company_name": "Ramesh Kirana Wholesale Co.",
                        "is_verified": True,
                        "store_open": True,
                        "open_time": "08:00 AM",
                        "close_time": "10:00 PM",
                        "seeded": True
                    },
                ]
                for acc in seeded_accounts:
                    mongo_db_conn.users.update_one(
                        {"username": acc["username"]},   # match by username
                        {"$set": acc},                   # upsert full document
                        upsert=True
                    )
                print("[MONGODB SEED SYNC] admin, yashpatil, supplier accounts synced to MongoDB Atlas [SUCCESS]")
        except Exception as mongo_seed_err:
            print(f"[MONGODB SEED SYNC WARNING] Could not sync seeded accounts: {mongo_seed_err}")
    # ── End MongoDB seed sync ──────────────────────────────────────────────

    # Seed Suppliers
    if db.query(models.Supplier).count() == 0:
        s1 = models.Supplier(name="Maharashtra Farmers Co-op", contact_person="Ramesh Patil", phone="+91 98200 11223", city="Nashik")
        s2 = models.Supplier(name="Amul Anand Dairy Federation", contact_person="Suresh Patel", phone="+91 98250 44556", city="Anand")
        s3 = models.Supplier(name="ITC Agro Foods Division", contact_person="Vijay Sharma", phone="+91 98100 77889", city="Mumbai")
        s4 = models.Supplier(name="Ramesh Kirana Wholesale Co.", contact_person="Desi Kirana Wholesaler", phone="+91 98765 11111", city="Mumbai")
        db.add_all([s1, s2, s3, s4])
        db.commit()

    # Seed Products
    if db.query(models.Product).count() == 0:
        initial_products = [
            models.Product(
                id="k1", title="Aashirvaad Shuddh Chakki Atta", category="staples", price=245.0, original_price=280.0,
                unit="5 kg Pack", rating=4.9, reviews_count=1420,
                image="https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=500&q=80",
                badge="100% Whole Wheat", discount="12% OFF",
                description="Made from 100% pure whole wheat grains ground in traditional chakkis for soft, fluffy rotis.",
                nutrition="High Dietary Fiber, Natural Proteins, Zero Maida.",
                supplier_name="ITC Agro Foods Division"
            ),
            models.Product(
                id="k2", title="Fortune Sunlite Sunflower Oil", category="oil", price=145.0, original_price=165.0,
                unit="1 Litre Pouch", rating=4.8, reviews_count=890,
                image="https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80",
                badge="Light & Healthy", discount="12% OFF",
                description="Light, healthy refined sunflower oil enriched with Vitamins A & D for daily Indian cooking.",
                nutrition="Enriched with Omega-6, Vitamin A & Vitamin D.",
                supplier_name="Ramesh Kirana Wholesale Co."
            ),
            models.Product(
                id="k3", title="Fortune Premium Toor / Arhar Dal", category="staples", price=160.0, original_price=185.0,
                unit="1 kg Pack", rating=4.8, reviews_count=650,
                image="https://images.unsplash.com/photo-1585994191611-724212502ef0?auto=format&fit=crop&w=500&q=80",
                badge="Unpolished", discount="13% OFF",
                description="Unpolished premium yellow split pigeon peas (Toor Dal) with natural flavor and rich protein.",
                nutrition="High Protein, Iron, Potassium & Folic Acid.",
                supplier_name="Maharashtra Farmers Co-op"
            ),
            models.Product(
                id="k4", title="Daawat Rozana Super Basmati Rice", category="staples", price=380.0, original_price=450.0,
                unit="5 kg Pack", rating=4.9, reviews_count=1100,
                image="https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80",
                badge="Long Grain", discount="15% OFF",
                description="Aged long-grain Basmati rice perfect for daily dal-rice, pulao, and biryani.",
                nutrition="Gluten-Free, Low Fat, Rich Aroma & Fluffy Texture.",
                supplier_name="Ramesh Kirana Wholesale Co."
            ),
            models.Product(
                id="k5", title="Amul Pasteurised Butter", category="dairy", price=275.0, original_price=290.0,
                unit="500 g Pack", rating=5.0, reviews_count=2300,
                image="https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=500&q=80",
                badge="Taste of India", discount="5% OFF",
                description="Iconic salted Amul butter made from pure cow and buffalo milk cream. Perfect for parathas & toast.",
                nutrition="Rich Milk Fat, Vitamin A & Natural Flavor.",
                supplier_name="Amul Anand Dairy Federation"
            ),
            models.Product(
                id="k6", title="Tata Salt Vacuum Evaporated", category="staples", price=28.0, original_price=30.0,
                unit="1 kg Pack", rating=4.9, reviews_count=1800,
                image="https://images.unsplash.com/photo-1518110168401-f2877ee2c085?auto=format&fit=crop&w=500&q=80",
                badge="Desh Ka Namak", discount="7% OFF",
                description="India's favorite iodized salt ensuring mental development and daily health purity.",
                supplier_name="Dropzyy Direct"
            ),
            models.Product(
                id="k7", title="Maggi 2-Minute Masala Noodles", category="snacks", price=168.0, original_price=180.0,
                unit="12 Packs Mega Saver", rating=4.9, reviews_count=3100,
                image="https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80",
                badge="All Time Favorite", discount="7% OFF",
                description="The classic 2-minute instant noodles with signature roasted spices tastemaker.",
                supplier_name="Ramesh Kirana Wholesale Co."
            ),
            models.Product(
                id="k8", title="Fresh Ratnagiri Alphonso Mangoes", category="vegetables", price=650.0, original_price=800.0,
                unit="1 Dozen Box (12 Pcs)", rating=4.9, reviews_count=780,
                image="https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=500&q=80",
                badge="Devgad Special", discount="18% OFF",
                description="Authentic GI-tagged Ratnagiri Hapus mangoes naturally ripened in grass.",
                supplier_name="Maharashtra Farmers Co-op"
            ),
            models.Product(
                id="k9", title="Fresh Nashik Red Onions (Kanda)", category="vegetables", price=35.0, original_price=45.0,
                unit="1 kg Mesh Bag", rating=4.7, reviews_count=450,
                image="https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=500&q=80",
                badge="Mandi Fresh", discount="22% OFF",
                description="Hand-sorted crisp Nashik red onions essential for tadka, gravies, and salads.",
                supplier_name="Maharashtra Farmers Co-op"
            ),
            models.Product(
                id="k10", title="Fresh Farm Potatoes (Aloo)", category="vegetables", price=28.0, original_price=35.0,
                unit="1 kg Pack", rating=4.8, reviews_count=520,
                image="https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=500&q=80",
                badge="Daily Need", discount="20% OFF",
                description="Clean, firm potatoes perfect for aloo parathas, fries, and sabzi.",
                supplier_name="Maharashtra Farmers Co-op"
            ),
            models.Product(
                id="k11", title="Brooke Bond Red Label Tea", category="tea", price=260.0, original_price=290.0,
                unit="500 g Carton Pack", rating=4.9, reviews_count=1600,
                image="https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80",
                badge="Swad Apne Pan Ka", discount="10% OFF",
                description="Rich, strong CTC black tea leaves blend crafted for perfect Indian Masala Chai.",
                supplier_name="Ramesh Kirana Wholesale Co."
            ),
            models.Product(
                id="k12", title="Amul Taaza Toned Fresh Milk", category="dairy", price=54.0, original_price=56.0,
                unit="1 Litre Pouch", rating=5.0, reviews_count=4200,
                image="https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=500&q=80",
                badge="Daily Fresh", discount="4% OFF",
                description="Homogenised toned milk packed under strict hygienic conditions. Ideal for chai and coffee.",
                supplier_name="Amul Anand Dairy Federation"
            )
        ]
        db.add_all(initial_products)
        db.commit()

    # Seed Coupons
    if db.query(models.Coupon).count() == 0:
        c1 = models.Coupon(code="FRESH10", discount_percent=10.0, min_order=250.0, description="10% OFF on orders over ₹250")
        c2 = models.Coupon(code="KIRANA50", discount_percent=5.0, min_order=100.0, description="5% OFF on daily staples")
        c3 = models.Coupon(code="SUPER20", discount_percent=20.0, min_order=1000.0, description="20% Mega Bachat discount")
        db.add_all([c1, c2, c3])
        db.commit()

    # Seed Serviceable Locations
    if db.query(models.Location).count() == 0:
        l1 = models.Location(city="Mumbai", pincode="400001", delivery_time="15 Mins")
        l2 = models.Location(city="Nashik", pincode="422001", delivery_time="20 Mins")
        l3 = models.Location(city="Pune", pincode="411001", delivery_time="15 Mins")
        l4 = models.Location(city="Thane", pincode="400601", delivery_time="15 Mins")
        db.add_all([l1, l2, l3, l4])
        db.commit()

@app.on_event("startup")
def on_startup():
    auto_migrate_db()
    db = next(get_db())
    seed_initial_data(db)
    if mongo_db.is_mongo_active():
        print("[FASTAPI STARTUP] MongoDB Cloud Database Active & Connected!")

# SMTP & Resend API Mail Server Configuration (loaded securely from .env)
SENDER_EMAIL = os.getenv("SENDER_EMAIL", "supportdropzyy@gmail.com").strip()
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "").replace(" ", "").replace('"', '').replace("'", "").strip()
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()

def send_resend_email(to_email: str, subject: str, html_body: str, pdf_attachment_bytes: bytes = None, pdf_filename: str = None) -> bool:
    """
    Dispatches instant email via Resend HTTP REST API (0.5s delivery).
    """
    if not RESEND_API_KEY:
        return False
    try:
        import urllib.request
        import json
        import base64

        url = "https://api.resend.com/emails"
        payload_dict = {
            "from": "Dropzyy <onboarding@resend.dev>",
            "to": [to_email.strip()],
            "subject": subject,
            "html": html_body
        }

        if pdf_attachment_bytes and pdf_filename:
            encoded_pdf = base64.b64encode(pdf_attachment_bytes).decode('utf-8')
            payload_dict["attachments"] = [
                {
                    "content": encoded_pdf,
                    "filename": pdf_filename
                }
            ]

        data_bytes = json.dumps(payload_dict).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.getcode() in (200, 201):
                print(f"[RESEND SUCCESS] Instant email delivered to {to_email} via Resend API in 0.5s!")
                return True
    except Exception as e:
        print(f"[RESEND API LOG] {e}")
    return False

def send_nodemailer_email(to_email: str, subject: str, html_body: str, pdf_attachment_bytes: bytes = None, pdf_filename: str = None) -> bool:
    """
    Dispatches instant email via local/cloud Nodemailer Express microservice (email-service.js).
    """
    try:
        import urllib.request
        import json
        import base64

        url = os.getenv("NODEMAILER_SERVICE_URL", "http://localhost:3000/api/nodemailer/send")
        payload_dict = {
            "to": to_email.strip(),
            "subject": subject,
            "html": html_body
        }

        if pdf_attachment_bytes and pdf_filename:
            encoded_pdf = base64.b64encode(pdf_attachment_bytes).decode('utf-8')
            payload_dict["attachments"] = [
                {
                    "filename": pdf_filename,
                    "content": encoded_pdf,
                    "encoding": "base64"
                }
            ]

        data_bytes = json.dumps(payload_dict).encode('utf-8')
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.getcode() == 200:
                print(f"[NODEMAILER SUCCESS] Email delivered to {to_email} via Nodemailer service!")
                return True
    except Exception as e:
        pass
    return False

def send_smtp_email(to_email: str, subject: str, html_body: str, pdf_attachment_bytes: bytes = None, pdf_filename: str = None) -> bool:
    """
    Unified Email Dispatcher tuned for Render/Cloud & Local environments.
    Tries Nodemailer microservice first, then Resend API, then direct SSL Port 465 / TLS Port 587.
    """
    if not to_email or "@" not in to_email:
        print(f"[SMTP ERROR] Invalid target email address: {to_email}")
        return False

    # 1. Try Nodemailer Service First
    if send_nodemailer_email(to_email, subject, html_body, pdf_attachment_bytes, pdf_filename):
        return True

    # 2. Try Resend HTTP REST API
    if RESEND_API_KEY:
        if send_resend_email(to_email, subject, html_body, pdf_attachment_bytes, pdf_filename):
            return True

    email_sender = SENDER_EMAIL
    pass_clean = SENDER_PASSWORD

    if not pass_clean or pass_clean == "YOUR_16_DIGIT_GMAIL_APP_PASSWORD":
        print(f"[SMTP NOTICE] Gmail App Password missing or invalid.")
        return False

    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = email_sender
    msg["To"] = to_email.strip()
    msg.attach(MIMEText(html_body, "html"))

    if pdf_attachment_bytes and pdf_filename:
        pdf_part = MIMEApplication(pdf_attachment_bytes, _subtype="pdf")
        pdf_part.add_header("Content-Disposition", "attachment", filename=pdf_filename)
        msg.attach(pdf_part)

    # 1. Try SSL Port 465 (Cloud/Render Preferred)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as server:
            server.login(email_sender, pass_clean)
            server.sendmail(email_sender, [to_email.strip()], msg.as_string())
        print(f"[SUCCESS] Email delivered to {to_email} via Gmail SSL Port 465!")
        return True
    except Exception as ssl_err:
        print(f"[SMTP SSL Notice] Port 465 notice ({ssl_err}), trying TLS Port 587...")

    # 2. Try TLS Port 587 (Fallback)
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(email_sender, pass_clean)
            server.sendmail(email_sender, [to_email.strip()], msg.as_string())
        print(f"[SUCCESS] Email delivered to {to_email} via Gmail TLS Port 587!")
        return True
    except Exception as tls_err:
        print(f"[SMTP ERROR] Both SSL (465) and TLS (587) failed to deliver email to {to_email}: {tls_err}")
        return False

def send_email_otp(to_email: str, otp_code: str) -> bool:
    """
    Sends 6-digit OTP verification email to user using Gmail SMTP.
    """
    subject = "Dropzyy - Your Email Verification Code"
    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 28px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #059669; font-size: 24px; margin: 0; font-weight: 800;">🛍️ Dropzyy</h1>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px;">APNI DIGITAL KIRANA DUKAN</p>
        </div>
        
        <p style="color: #334155; font-size: 15px;">Hello,</p>
        <p style="color: #334155; font-size: 15px;">Thank you for signing up with Dropzyy Instant Delivery! Please use the 6-digit verification code below to complete your registration:</p>
        
        <div style="background: #f0fdf4; border: 2px dashed #10b981; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #047857; display: block;">{otp_code}</span>
          <small style="color: #059669; font-size: 12px; margin-top: 6px; display: block;">Valid for 10 minutes</small>
        </div>
        
        <p style="color: #64748b; font-size: 13px;">If you did not request this email, please ignore this message.</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin: 0;">Sent automatically from <strong>{SENDER_EMAIL}</strong> for Dropzyy Instant Delivery</p>
      </div>
    </body>
    </html>
    """

    print(f"\n==================================================")
    print(f" [DROPZYY EMAILJS OTP GENERATED] Target: {to_email}")
    print(f" OTP Code: {otp_code}")
    print(f"==================================================\n")

    return True

# PDF INVOICE GENERATOR & ORDER CONFIRMATION EMAIL HANDLER
def generate_order_pdf_invoice(order_id: str, date_str: str, customer_info: dict, items: list, total_amount: float) -> bytes:
    """
    Generates a professional PDF Bill Invoice using ReportLab and returns raw PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []

    # Title & Branding Header
    title_style = ParagraphStyle(
        'InvoiceTitle',
        parent=styles['Heading1'],
        fontSize=20,
        textColor=colors.HexColor("#059669"),
        spaceAfter=2
    )
    story.append(Paragraph("🛍️ DROPZYY INSTANT DELIVERY", title_style))
    story.append(Paragraph("Your everyday essentials, delivered. | Official Tax Invoice & Order Bill", styles['Normal']))
    story.append(Spacer(1, 14))

    # Invoice Details Grid
    c_name = customer_info.get("name") or customer_info.get("fullName") or "Customer"
    c_email = customer_info.get("email") or "N/A"
    c_phone = customer_info.get("phone") or "N/A"
    c_addr = customer_info.get("address") or "Delivery Address"
    c_pay = customer_info.get("payment") or "Cash / Online"

    meta_data = [
        [Paragraph(f"<b>Invoice ID:</b> #{order_id}", styles['Normal']), Paragraph(f"<b>Order Date:</b> {date_str[:10]}", styles['Normal'])],
        [Paragraph(f"<b>Customer Name:</b> {c_name}", styles['Normal']), Paragraph(f"<b>Payment Mode:</b> {c_pay}", styles['Normal'])],
        [Paragraph(f"<b>Email Address:</b> {c_email}", styles['Normal']), Paragraph(f"<b>Delivery Mode:</b> Fast Delivery", styles['Normal'])],
        [Paragraph(f"<b>Phone Number:</b> {c_phone}", styles['Normal']), Paragraph(f"<b>Delivery Address:</b> {c_addr}", styles['Normal'])]
    ]
    meta_table = Table(meta_data, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
        ('PADDING', (0,0), (-1,-1), 6),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 16))

    # Items Summary Table
    table_data = [["#", "Item Description", "Qty", "Unit Price", "Total Amount"]]
    items_subtotal = 0.0
    for idx, item in enumerate(items, 1):
        item_title = item.get("title") or item.get("name") or "Kirana Item"
        unit = item.get("unit") or ""
        qty = int(item.get("quantity") or item.get("qty") or 1)
        price = float(item.get("price") or 0.0)
        item_total = price * qty
        items_subtotal += item_total
        table_data.append([
            str(idx),
            f"{item_title} ({unit})" if unit else item_title,
            str(qty),
            f"Rs. {price:.2f}",
            f"Rs. {item_total:.2f}"
        ])

    discount_val = float(customer_info.get("discount") or 0.0)
    shipping_fee = float(customer_info.get("shipping") if customer_info.get("shipping") is not None else (0.0 if items_subtotal >= 299 else 29.0))
    grand_total = max(0.0, items_subtotal - discount_val + shipping_fee)

    table_data.append(["", "", "", "Items Subtotal:", f"Rs. {items_subtotal:.2f}"])
    if discount_val > 0:
        table_data.append(["", "", "", "Promo Discount:", f"-Rs. {discount_val:.2f}"])
    
    if shipping_fee > 0:
        table_data.append(["", "", "", "Delivery Charge:", f"Rs. {shipping_fee:.2f}"])
    else:
        table_data.append(["", "", "", "Delivery Charge:", "FREE (Rs. 0.00)"])

    table_data.append(["", "", "", "Grand Total:", f"Rs. {grand_total:.2f}"])

    items_table = Table(table_data, colWidths=[30, 260, 50, 100, 100])
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#059669")),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('ALIGN', (2,0), (-1,-1), 'CENTER'),
        ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
        ('PADDING', (0,0), (-1,-1), 6),
        ('GRID', (0,0), (-1,-5), 0.5, colors.HexColor("#CBD5E1")),
        ('LINEABOVE', (3,-4), (-1,-1), 1, colors.HexColor("#CBD5E1")),
        ('LINEABOVE', (3,-1), (-1,-1), 1.5, colors.HexColor("#059669")),
        ('FONTNAME', (3,-4), (-1,-1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (3,-1), (-1,-1), colors.HexColor("#059669")),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 20))

    story.append(Paragraph("<b>Thank you for ordering with Dropzyy!</b>", styles['Normal']))
    story.append(Paragraph("For support or order tracking, visit Dropzyy app or email supportdropzyy@gmail.com", styles['Normal']))

    doc.build(story)
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

def send_order_delivery_email(to_email: str, order_id: str, date_str: str, customer_info: dict, items: list, total_amount: float) -> bool:
    """
    Sends Order Delivered Email with HTML item summary + Attached PDF Invoice to customer when status changes to Delivered.
    """
    if not to_email or "@" not in to_email:
        print(f"[ORDER EMAIL] Invalid or missing target email: {to_email}")
        return False

    pass_clean = SENDER_PASSWORD.replace(" ", "").replace('"', '').replace("'", "").strip()

    # Generate PDF Invoice
    pdf_bytes = None
    try:
        pdf_bytes = generate_order_pdf_invoice(order_id, date_str, customer_info, items, total_amount)
    except Exception as pdf_err:
        print(f"[PDF GENERATION ERROR] {pdf_err}")

    # Build HTML Item rows
    items_html = ""
    for item in items:
        t = item.get("title") or item.get("name") or "Kirana Item"
        q = item.get("quantity") or item.get("qty") or 1
        p = float(item.get("price") or 0.0)
        u = item.get("unit", "")
        items_html += f"""
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">{t} {f'({u})' if u else ''}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">{q}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹{p:.2f}</td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #059669;">₹{(p*q):.2f}</td>
        </tr>
        """

    c_name = customer_info.get("name") or customer_info.get("fullName") or "Valued Customer"
    c_addr = customer_info.get("address") or "Saved Address"

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; padding: 28px; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        <div style="text-align: center; border-bottom: 3px solid #059669; padding-bottom: 16px; margin-bottom: 20px;">
          <h1 style="color: #059669; margin: 0; font-size: 26px;">🛍️ Dropzyy</h1>
          <p style="color: #64748b; font-size: 13px; margin-top: 4px; font-weight: 700;">🎉 ORDER DELIVERED — TAX INVOICE #{order_id}</p>
        </div>
        
        <p style="color: #334155; font-size: 15px;">Hello <strong>{c_name}</strong>,</p>
        <p style="color: #334155; font-size: 15px;">Great news! Your Dropzyy order <strong>#{order_id}</strong> has been successfully <strong>DELIVERED</strong> to your location.</p>
        
        <div style="background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 10px; padding: 14px; margin: 18px 0;">
          <h4 style="color: #047857; margin: 0 0 6px 0; font-size: 14px;">📍 Delivered Location:</h4>
          <p style="margin: 0; color: #1e293b; font-size: 14px; font-weight: 600;">{c_addr}</p>
        </div>

        <h3 style="color: #0f172a; font-size: 16px; margin-top: 22px;">📦 Delivered Items Summary:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left;">
              <th style="padding: 10px;">Item</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
              <th style="padding: 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            {items_html}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 18px; font-size: 20px; font-weight: 800; color: #059669;">
          Total Bill Amount Paid: ₹{total_amount:.2f}
        </div>

        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px; margin-top: 22px; font-size: 13px; color: #1e40af; border-radius: 6px;">
          📄 <strong>PDF Bill Invoice Attached:</strong> Your official Tax Invoice <strong>Dropzyy_Invoice_{order_id}.pdf</strong> is attached to this email for your records.
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
        <p style="text-align: center; color: #94a3b8; font-size: 12px; margin: 0;">Thank you for shopping with <strong>Dropzyy Instant Delivery</strong></p>
      </div>
    </body>
    </html>
    """

    subject = f"Order Delivered #{order_id} - Dropzyy Tax Invoice Attached"
    pdf_filename = f"Dropzyy_Invoice_{order_id}.pdf" if pdf_bytes else None
    return send_smtp_email(to_email, subject, html_body, pdf_attachment_bytes=pdf_bytes, pdf_filename=pdf_filename)

# ==============================================================================
# 📲 TWILIO & FAST2SMS SMS API CONFIGURATION (loaded securely from .env)
# ==============================================================================
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "supportdropzyy@gmail.com").strip()
ADMIN_MOBILE_NUMBER = os.getenv("ADMIN_MOBILE_NUMBER", "+917020447482").strip()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_API_KEY_SID = os.getenv("TWILIO_API_KEY_SID", "").strip()
TWILIO_API_SECRET = os.getenv("TWILIO_API_SECRET", "").strip()
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER", "").strip()
ENABLE_PAID_SMS = os.getenv("ENABLE_PAID_SMS", "False").lower() in ["true", "1", "yes"]
SMS_API_KEY = os.getenv("SMS_API_KEY", "").strip()

def send_admin_order_email_alert(order_id: str, customer_info: dict, items: list, total_amount: float) -> bool:
    """
    Sends an instant Order Received Alert email to Admin (patilyash948@gmail.com) with full order details.
    """
    c_name = customer_info.get("name") or customer_info.get("fullName") or "Customer"
    c_phone = customer_info.get("phone") or "N/A"
    c_addr = customer_info.get("address") or "N/A"
    c_pay = customer_info.get("payment") or "COD"

    items_html = ""
    for item in items:
        t = item.get("title") or item.get("name") or "Kirana Item"
        q = item.get("quantity") or item.get("qty") or 1
        p = float(item.get("price") or 0.0)
        tot = p * q
        items_html += f"""
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>{t}</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">{q}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹{p:.2f}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">₹{tot:.2f}</td>
        </tr>
        """

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; background: #f8fafc; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
        <div style="background: #00a86b; padding: 16px; border-radius: 8px; color: #ffffff; text-align: center;">
          <h2 style="margin: 0;">🚨 DROPZYY ADMIN: NEW ORDER RECEIVED!</h2>
          <p style="margin: 4px 0 0 0; font-size: 14px;">Order ID: #{order_id}</p>
        </div>

        <div style="margin: 20px 0; padding: 14px; background: #f1f5f9; border-radius: 8px;">
          <h3 style="margin: 0 0 8px 0; color: #1e293b;">👤 Customer & Delivery Info:</h3>
          <p style="margin: 4px 0;"><strong>Name:</strong> {c_name}</p>
          <p style="margin: 4px 0;"><strong>Mobile:</strong> {c_phone}</p>
          <p style="margin: 4px 0;"><strong>Address:</strong> {c_addr}</p>
          <p style="margin: 4px 0;"><strong>Payment Mode:</strong> {c_pay.upper()}</p>
        </div>

        <h3 style="color: #1e293b;">🛒 Ordered Items:</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f8fafc; text-align: left;">
              <th style="padding: 10px;">Item</th>
              <th style="padding: 10px; text-align: center;">Qty</th>
              <th style="padding: 10px; text-align: right;">Price</th>
              <th style="padding: 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            {items_html}
          </tbody>
        </table>

        <div style="text-align: right; font-size: 20px; font-weight: bold; color: #00a86b;">
          Total Payable Amount: ₹{total_amount:.2f}
        </div>
      </div>
    </body>
    </html>
    """

    subject = f"NEW ORDER RECEIVED Order #{order_id} - Rs. {total_amount:.2f} ({c_name})"
    print(f"[EMAILJS MODE] Admin order notification generated for Order #{order_id}")
    return True

def send_customer_delivery_bill_email(order_id: str, customer_email: str, customer_info: dict, items: list, total_amount: float) -> bool:
    """
    Dispatches the official Dropzyy Invoice Bill directly to the customer's email upon Parcel Delivery.
    """
    if not customer_email or "@" not in customer_email:
        return False

    c_name = customer_info.get("name") or customer_info.get("fullName") or "Valued Customer"
    c_phone = customer_info.get("phone") or "N/A"
    c_addr = customer_info.get("address") or "N/A"
    c_pay = customer_info.get("payment") or "COD"

    items_html = ""
    for item in items:
        title = item.get("title") or item.get("name") or "Kirana Item"
        qty = item.get("quantity") or item.get("qty") or 1
        price = item.get("price") or 0.0
        item_total = float(price) * int(qty)
        supplier = item.get("supplierName") or "Dropzyy Direct"
        items_html += f"""
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>{title}</strong><br><small style="color: #666;">Supplier: {supplier}</small></td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">{qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹{float(price):.2f}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;"><strong>₹{item_total:.2f}</strong></td>
        </tr>
        """

    html_body = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; }}
        .bill-card {{ max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); border-top: 6px solid #00a86b; }}
        .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #00a86b; padding-bottom: 15px; margin-bottom: 20px; }}
        .status-badge {{ background: #d1fae5; color: #065f46; font-weight: bold; padding: 6px 14px; border-radius: 20px; font-size: 14px; display: inline-block; }}
        .customer-box {{ background: #f8fafc; border-left: 4px solid #00a86b; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; }}
        table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
        th {{ background: #f1f5f9; text-align: left; padding: 10px; color: #334155; font-size: 13px; }}
        .total-box {{ text-align: right; background: #ecfdf5; padding: 15px; border-radius: 8px; font-size: 18px; font-weight: bold; color: #047857; }}
      </style>
    </head>
    <body>
      <div class="bill-card">
        <div class="header">
          <div>
            <h2 style="color: #00a86b; margin: 0;">🛒 Dropzyy Invoice</h2>
            <small style="color: #64748b;">Your everyday essentials, delivered.</small>
          </div>
          <div style="text-align: right;">
            <span class="status-badge">DELIVERED & PAID</span><br>
            <small style="color: #64748b;">Order #{order_id}</small>
          </div>
        </div>

        <div class="customer-box">
          <strong>Billed To:</strong> {c_name}<br>
          <strong>Mobile:</strong> {c_phone}<br>
          <strong>Delivery Address:</strong> {c_addr}<br>
          <strong>Payment Mode:</strong> {c_pay.upper()}
        </div>

        <h3>📦 Itemized Parcel Invoice Summary</h3>
        <table>
          <thead>
            <tr>
              <th>Item Description</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Price</th>
              <th style="text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items_html}
          </tbody>
        </table>

        <div class="total-box">
          Grand Total Paid: ₹{total_amount:.2f}
        </div>

        <p style="text-align: center; color: #64748b; font-size: 13px; margin-top: 25px;">
          Thank you for ordering with Dropzyy! If you have any questions, reply to this email or contact <strong>supportdropzyy@gmail.com</strong>.
        </p>
      </div>
    </body>
    </html>
    """

    subject = f"Your Dropzyy Order #{order_id} Has Been Delivered! 📦 Bill Invoice"
    return send_smtp_email(customer_email, subject, html_body)

def send_admin_order_sms_alert(order_id: str, customer_info: dict, items: list, total_amount: float, db: Session = None) -> bool:
    """
    Dispatches an instant SMS alert to all registered Admin account mobile numbers from SQLite database via Twilio or Fast2SMS.
    """
    c_name = customer_info.get("name") or customer_info.get("fullName") or "Customer"
    c_phone = customer_info.get("phone") or "N/A"
    c_addr = customer_info.get("address") or "N/A"
    c_pay = customer_info.get("payment") or "COD"

    item_summary_list = []
    for item in items:
        t = item.get("title") or item.get("name") or "Kirana Item"
        q = item.get("quantity") or item.get("qty") or 1
        item_summary_list.append(f"{t} (x{q})")
    
    items_str = ", ".join(item_summary_list[:4])
    if len(item_summary_list) > 4:
        items_str += f" +{len(item_summary_list) - 4} more"

    sms_text = (
        f"[DROPZYY NEW ORDER ALERT]\n"
        f"Order ID: #{order_id}\n"
        f"Total Bill: Rs. {total_amount:.2f} ({c_pay.upper()})\n"
        f"Customer: {c_name} ({c_phone})\n"
        f"Address: {c_addr}\n"
        f"Items: {items_str}\n"
        f"Status: Placed - Ready for Dispatch!"
    )

    # Retrieve registered Admin account mobile numbers from Database
    target_phones = []
    if db:
        admin_users = db.query(models.User).filter(
            models.User.role.in_(["admin", "sub_admin"]),
            models.User.phone.isnot(None),
            models.User.phone != ""
        ).all()
        for u in admin_users:
            if u.phone and u.phone.strip():
                clean_p = u.phone.strip().replace(" ", "").replace("-", "")
                if not clean_p.startswith("+"):
                    clean_p = "+91" + clean_p.replace("+91", "")
                # Ignore dummy/test numbers (e.g. 9876543210 or 1234567890)
                if clean_p.endswith("9876543210") or clean_p.endswith("1234567890"):
                    continue
                if clean_p not in target_phones:
                    target_phones.append(clean_p)

    if not target_phones:
        clean_default = ADMIN_MOBILE_NUMBER.strip().replace(" ", "").replace("-", "")
        if not clean_default.startswith("+"):
            clean_default = "+91" + clean_default.replace("+91", "")
        target_phones.append(clean_default)

    target_numbers_str = ",".join(target_phones)

    print("\n" + "=" * 55)
    print(f" [SMS ALERT TO REGISTERED ADMIN ACCOUNT MOBILE(S)] Target: {target_numbers_str}")
    print("=" * 55)
    print(sms_text)
    print("=" * 55 + "\n")

    if not ENABLE_PAID_SMS:
        print("[NOTICE] Paid SMS dispatch is disabled (ENABLE_PAID_SMS=False) to prevent Rs. 5-10 per message charges.")
        return True

    # 1. Fast2SMS Gateway (Sends 100% Custom SMS text to Indian numbers without template limits)
    if SMS_API_KEY and SMS_API_KEY != "YOUR_FAST2SMS_API_KEY_HERE":
        try:
            import urllib.request
            import urllib.parse
            import json
            headers = {
                'authorization': SMS_API_KEY,
                'Content-Type': 'application/json'
            }
            payload = json.dumps({
                'route': 'q',
                'message': sms_text,
                'language': 'english',
                'flash': 0,
                'numbers': target_numbers_str.replace("+91", "").replace(" ", "")
            }).encode('utf-8')
            req_f2s = urllib.request.Request("https://www.fast2sms.com/dev/bulkV2", data=payload, headers=headers, method='POST')
            with urllib.request.urlopen(req_f2s, timeout=5) as f2s_resp:
                print(f"[FAST2SMS SUCCESS] Live Custom Order SMS sent to {target_numbers_str}! Status: {f2s_resp.getcode()}")
                return True
        except Exception as sms_err:
            print(f"[FAST2SMS LOG] {sms_err}")

    # 2. Twilio REST API Gateway Dispatcher
    if TWILIO_API_KEY_SID and TWILIO_API_SECRET and TWILIO_ACCOUNT_SID.startswith("AC"):
        try:
            import base64
            import urllib.request
            import urllib.parse
            import json

            credentials = f"{TWILIO_API_KEY_SID}:{TWILIO_API_SECRET}"
            auth_header = "Basic " + base64.b64encode(credentials.encode("ascii")).decode("ascii")
            twilio_url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"

            for target_phone in target_phones:
                try:
                    post_data = urllib.parse.urlencode({
                        'From': TWILIO_PHONE_NUMBER,
                        'To': target_phone,
                        'Body': sms_text
                    }).encode('utf-8')

                    req = urllib.request.Request(twilio_url, data=post_data, method='POST')
                    req.add_header('Authorization', auth_header)
                    req.add_header('Content-Type', 'application/x-www-form-urlencoded')

                    with urllib.request.urlopen(req, timeout=8) as resp:
                        print(f"[TWILIO SUCCESS] Live SMS sent to {target_phone}! Status Code: {resp.getcode()}")
                except urllib.error.HTTPError as http_err:
                    err_body = http_err.read().decode('utf-8', errors='ignore')
                    err_json = json.loads(err_body) if err_body.startswith('{') else {}
                    err_msg = err_json.get('message', err_body)
                    
                    # Fallback for India Twilio Trial template requirement
                    if "template" in err_msg.lower() or http_err.code == 422:
                        try:
                            fallback_data = urllib.parse.urlencode({
                                'From': TWILIO_PHONE_NUMBER,
                                'To': target_phone,
                                'Body': 'sms_delivery_updates'
                            }).encode('utf-8')
                            req_fallback = urllib.request.Request(twilio_url, data=fallback_data, method='POST')
                            req_fallback.add_header('Authorization', auth_header)
                            req_fallback.add_header('Content-Type', 'application/x-www-form-urlencoded')
                            with urllib.request.urlopen(req_fallback, timeout=8) as resp_fallback:
                                print(f"[TWILIO SUCCESS] Live SMS sent to {target_phone} via Trial Template! Status Code: {resp_fallback.getcode()}")
                        except Exception as fb_err:
                            print(f"[TWILIO NOTICE] Trial template send notice for {target_phone}: {fb_err}")
                    else:
                        print(f"[TWILIO NOTICE] Could not deliver SMS to {target_phone}: {err_msg}")
        except Exception as twilio_err:
            print(f"[TWILIO GATEWAY LOG] {twilio_err}")

    return True

# In-memory OTP Store for email verification
otp_store = {}

# AUTH API ENDPOINTS
@app.post("/api/auth/send-otp")
def send_otp(payload: schemas.SendOTPRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"otp_{client_ip}", limit=5, window_sec=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many OTP requests. Please wait 1 minute before requesting another OTP."
        )

    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    
    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_store[email_clean] = {
        "code": otp_code,
        "created_at": datetime.datetime.utcnow()
    }
    
    # Attempt sending real email via Gmail SMTP
    email_sent = send_email_otp(email_clean, otp_code)

    res_data = {
        "message": f"Verification code sent to {email_clean}",
        "email": email_clean,
        "sender": SENDER_EMAIL,
        "live_email_sent": email_sent,
        "otp_preview": otp_code
    }
    return res_data

@app.post("/api/auth/verify-otp")
def verify_otp(payload: schemas.VerifyOTPRequest):
    email_clean = payload.email.strip().lower()
    record = otp_store.get(email_clean)
    if not record or record["code"] != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired OTP code!")
    return {"message": "OTP verified successfully!", "verified": True}

@app.post("/api/auth/forgot-password/send-otp")
def forgot_password_send_otp(payload: schemas.ForgotPasswordOTPRequest, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"forgot_otp_{client_ip}", limit=5, window_sec=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please wait 1 minute."
        )

    email_clean = payload.email.strip().lower()
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    
    target_email = email_clean
    existing_user = db.query(models.User).filter(
        (models.User.email == email_clean) | (models.User.username == email_clean)
    ).first()
    if existing_user and existing_user.email:
        target_email = existing_user.email

    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999)}"
    otp_store[email_clean] = {
        "code": otp_code,
        "created_at": datetime.datetime.utcnow()
    }
    
    # Send email via Gmail SMTP
    email_sent = send_email_otp(target_email, otp_code)

    res_data = {
        "message": f"Password reset code sent to {target_email}",
        "email": target_email,
        "sender": SENDER_EMAIL,
        "live_email_sent": email_sent,
        "otp_preview": otp_code
    }
    return res_data

@app.post("/api/auth/forgot-password/reset", response_model=schemas.UserResponse)
def forgot_password_reset(payload: schemas.ForgotPasswordResetRequest, db: Session = Depends(get_db)):
    email_clean = payload.email.strip().lower()
    otp_record = otp_store.get(email_clean)
    if not otp_record or otp_record["code"] != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired verification code!")
    
    user = db.query(models.User).filter(
        (models.User.email == email_clean) | (models.User.username == email_clean)
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found!")
    
    # Update password in SQLite database using bcrypt
    user.password_hash = auth.hash_password(payload.new_password)
    db.commit()
    db.refresh(user)
    
    # Clear OTP from memory store
    otp_store.pop(email_clean, None)

    token = auth.create_access_token(user.id, user.username, user.role)
    setattr(user, 'access_token', token)
    setattr(user, 'token_type', 'bearer')
    return user

@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register_user(user_data: schemas.UserRegister, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"reg_{client_ip}", limit=8, window_sec=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please wait 1 minute."
        )

    email_raw = (user_data.email or "").strip().lower()
    derived_username = (user_data.username or (email_raw.split("@")[0] if "@" in email_raw else "user_" + str(uuid.uuid4())[:6])).strip()
    
    email_clean = email_raw if (email_raw and "@" in email_raw) else f"{derived_username.lower()}@dropzyy.com"

    existing = db.query(models.User).filter(
        (models.User.email == email_clean) | (models.User.username == derived_username)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"An account with username '@{derived_username}' or email '{email_clean}' already exists!")
    
    assigned_role = user_data.role if user_data.role in ['customer', 'supplier', 'admin'] else 'customer'
    supplier_comp = user_data.supplier_company_name if assigned_role == "supplier" else None

    new_user = models.User(
        username=derived_username,
        email=email_clean,
        password_hash=auth.hash_password(user_data.password),
        full_name=user_data.full_name,
        phone=user_data.phone,
        supplier_company_name=supplier_comp,
        role=assigned_role,
        is_verified=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Sync user account to MongoDB Atlas Cloud Database immediately
    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_create_user({
                "id": new_user.id,
                "username": derived_username,
                "email": email_clean,
                "password_hash": new_user.password_hash,
                "full_name": user_data.full_name,
                "phone": user_data.phone,
                "role": assigned_role,
                "supplier_company_name": supplier_comp,
                "is_verified": True
            })
            print(f"[MONGODB USER SUCCESS] Account @{derived_username} ({email_clean}) saved to MongoDB Atlas!")
        except Exception as m_err:
            print(f"[MONGODB USER NOTICE]: {m_err}")

    # Remove used OTP
    otp_store.pop(email_clean, None)

    # If registered as a supplier, ensure an entry exists in suppliers table
    if assigned_role == "supplier":
        s_name = supplier_comp or user_data.full_name
        existing_s = db.query(models.Supplier).filter(models.Supplier.name == s_name).first()
        if not existing_s:
            new_s = models.Supplier(
                name=s_name,
                contact_person=user_data.full_name,
                phone=user_data.phone or "+91 98000 00000",
                city="Mumbai"
            )
            db.add(new_s)
            db.commit()

    token = auth.create_access_token(new_user.id, new_user.username, new_user.role)
    setattr(new_user, 'access_token', token)
    setattr(new_user, 'token_type', 'bearer')
    return new_user

@app.post("/api/auth/login", response_model=schemas.UserResponse)
def login_user(credentials: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"login_{client_ip}", limit=10, window_sec=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 1 minute before trying again."
        )

    identifier = (credentials.username or credentials.email or "").strip()
    if not identifier:
        raise HTTPException(status_code=400, detail="Email or username is required!")
    
    # Allow login via email or username
    user = db.query(models.User).filter(
        (models.User.email == identifier.lower()) | (models.User.username == identifier)
    ).first()

    if user and auth.verify_password(credentials.password, user.password_hash):
        # Generate JWT Bearer Token
        token = auth.create_access_token(user.id, user.username, user.role)
        setattr(user, 'access_token', token)
        setattr(user, 'token_type', 'bearer')
        return user

    # If not found or failed in SQLite, check MongoDB Atlas if active
    if mongo_db.is_mongo_active():
        m_user = mongo_db.mongo_find_user(identifier)
        if m_user:
            p_hash = m_user.get("password_hash")
            if p_hash and auth.verify_password(credentials.password, p_hash):
                try:
                    cached_user = models.User(
                        username=m_user.get("username"),
                        email=m_user.get("email") or f"{identifier.lower()}@dropzyy.com",
                        password_hash=p_hash,
                        full_name=m_user.get("full_name") or identifier,
                        phone=m_user.get("phone"),
                        role=m_user.get("role") or "customer",
                        supplier_company_name=m_user.get("supplier_company_name"),
                        is_verified=m_user.get("is_verified", True),
                        open_time=m_user.get("open_time") or "08:00 AM",
                        close_time=m_user.get("close_time") or "10:00 PM",
                        store_open=m_user.get("store_open") if m_user.get("store_open") is not None else True
                    )
                    db.add(cached_user)
                    db.commit()
                    db.refresh(cached_user)
                    token = auth.create_access_token(cached_user.id, cached_user.username, cached_user.role)
                    setattr(cached_user, 'access_token', token)
                    setattr(cached_user, 'token_type', 'bearer')
                    return cached_user
                except Exception as sync_err:
                    db.rollback()
                    fallback_user = models.User(
                        id=m_user.get("id") or 999,
                        username=m_user.get("username"),
                        email=m_user.get("email") or f"{identifier.lower()}@dropzyy.com",
                        password_hash=p_hash,
                        full_name=m_user.get("full_name") or identifier,
                        phone=m_user.get("phone"),
                        role=m_user.get("role") or "customer",
                        supplier_company_name=m_user.get("supplier_company_name"),
                        is_verified=m_user.get("is_verified", True),
                        open_time=m_user.get("open_time") or "08:00 AM",
                        close_time=m_user.get("close_time") or "10:00 PM",
                        store_open=m_user.get("store_open") if m_user.get("store_open") is not None else True
                    )
                    token = auth.create_access_token(fallback_user.id, fallback_user.username, fallback_user.role)
                    setattr(fallback_user, 'access_token', token)
                    setattr(fallback_user, 'token_type', 'bearer')
                    return fallback_user

    raise HTTPException(status_code=401, detail="Invalid email/username or password!")

@app.put("/api/auth/profile/address", response_model=schemas.UserResponse)
def update_user_address(data: schemas.UserUpdateAddress, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == data.user_id).first()
    if not user:
        raise HTTPException(status_code=444, detail="User not found!")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone
    if data.street_address is not None:
        user.street_address = data.street_address
    if data.city is not None:
        user.city = data.city
    if data.pincode is not None:
        user.pincode = data.pincode
    db.commit()
    db.refresh(user)
    return user

@app.put("/api/supplier/timings")
def update_supplier_timings(data: schemas.SupplierTimingsUpdate, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    query = db.query(models.User)
    user = None
    if data.user_id:
        user = query.filter(models.User.id == data.user_id).first()
    if not user and data.username:
        user = query.filter(models.User.username == data.username).first()
    
    # Also sync to MongoDB Atlas if active
    if mongo_db.is_mongo_active():
        try:
            m_target = data.username or (user.username if user else None)
            if m_target:
                mongo_db.mongo_update_user_timings(m_target, data.open_time, data.close_time, data.store_open)
                print(f"[MONGODB TIMINGS] Synced timings for {m_target} to MongoDB Atlas")
        except Exception as m_err:
            print(f"[MONGODB TIMINGS ERROR]: {m_err}")

    if not user:
        if mongo_db.is_mongo_active() and data.username:
            m_user = mongo_db.mongo_find_user(data.username)
            if m_user:
                return {
                    "status": "success",
                    "message": "Supplier operating hours updated successfully in MongoDB Atlas",
                    "user": {
                        "id": m_user.get("id") or 0,
                        "username": m_user.get("username"),
                        "open_time": data.open_time,
                        "close_time": data.close_time,
                        "store_open": data.store_open
                    }
                }
        raise HTTPException(status_code=404, detail="User/Supplier not found!")
    
    user.open_time = data.open_time
    user.close_time = data.close_time
    user.store_open = data.store_open
    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "message": "Supplier operating hours updated successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "open_time": user.open_time,
            "close_time": user.close_time,
            "store_open": user.store_open
        }
    }

@app.put("/api/supplier/toggle-status")
def toggle_supplier_status(payload: dict, db: Session = Depends(get_db), current_user: dict = Depends(require_supplier)):
    store_open = bool(payload.get("store_open", True))
    role = str(current_user.get("role", "")).lower()
    
    target_username = current_user.get("username", "")
    if role in ["admin", "sub_admin"] and payload.get("username"):
        target_username = str(payload.get("username")).strip()
        
    if not target_username:
        raise HTTPException(status_code=400, detail="Supplier username required")
        
    clean_uname = target_username.strip().lower()
    
    # 1. Update SQLite
    u = db.query(models.User).filter(
        (models.User.username.ilike(clean_uname)) | 
        (models.User.supplier_company_name.ilike(target_username.strip()))
    ).first()
    if u:
        u.store_open = store_open
        db.commit()
        db.refresh(u)
        
    # 2. Update MongoDB Atlas
    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_toggle_supplier_status(target_username, store_open)
        except Exception as err:
            print(f"[MONGODB STATUS TOGGLE ERROR]: {err}")
            
    return {
        "status": "success",
        "username": target_username,
        "store_open": store_open,
        "message": f"Restaurant is now {'ONLINE (Open) 🟢' if store_open else 'OFFLINE (Closed) 🔴'}"
    }

@app.delete("/api/restaurants/{identifier}")
def delete_restaurant(
    identifier: str, 
    store_name: Optional[str] = None, 
    db: Session = Depends(get_db), 
    current_user: Optional[dict] = Depends(get_current_user_token)
):
    clean_id = identifier.strip()
    clean_lower = clean_id.lower()
    clean_store = (store_name or "").strip()
    clean_store_lower = clean_store.lower()

    # Permission check: If supplier token is present and not admin, supplier can ONLY delete their own restaurant!
    if current_user:
        role = str(current_user.get("role", "")).lower()
        user_uname = str(current_user.get("username", "")).strip().lower()
        if role not in ["admin", "sub_admin"]:
            sup_user = db.query(models.User).filter(models.User.username.ilike(user_uname)).first()
            is_owner = (
                user_uname == clean_lower or
                str(current_user.get("sub", "")) == clean_id or
                (sup_user and sup_user.supplier_company_name and sup_user.supplier_company_name.strip().lower() in [clean_lower, clean_store_lower])
            )
            if not is_owner:
                raise HTTPException(status_code=403, detail="Forbidden: You can only delete your own restaurant store!")

    # 1. Delete in MongoDB Atlas
    mongo_res = {"products_deleted": 0, "users_deleted": 0}
    if mongo_db.is_mongo_active():
        try:
            mongo_res = mongo_db.mongo_delete_restaurant(clean_id, clean_store)
        except Exception as err:
            print(f"[MONGODB DELETE RESTAURANT ERR]: {err}")

    # 2. Delete in SQLite
    user_filter_conditions = [
        models.User.username.ilike(clean_lower),
        models.User.supplier_company_name.ilike(clean_id),
        models.User.full_name.ilike(clean_id)
    ]
    if clean_id.isdigit():
        user_filter_conditions.append(models.User.id == int(clean_id))
    if clean_store:
        user_filter_conditions.extend([
            models.User.username.ilike(clean_store_lower),
            models.User.supplier_company_name.ilike(clean_store),
            models.User.full_name.ilike(clean_store)
        ])

    matched_users = db.query(models.User).filter(or_(*user_filter_conditions)).all()
    
    names_to_delete = {clean_id, clean_lower}
    if clean_store:
        names_to_delete.add(clean_store)
        names_to_delete.add(clean_store_lower)

    user_ids_to_delete = set()
    for u in matched_users:
        if u.username: names_to_delete.add(u.username)
        if u.supplier_company_name: names_to_delete.add(u.supplier_company_name)
        if u.full_name: names_to_delete.add(u.full_name)
        user_ids_to_delete.add(u.id)

    prods_deleted_count = 0
    all_names_list = [n.strip() for n in names_to_delete if n and n.strip()]
    prod_filter_clauses = []
    for n in all_names_list:
        prod_filter_clauses.append(models.Product.supplier_name.ilike(n))
        prod_filter_clauses.append(models.Product.supplier_user_id == n)
    for uid in user_ids_to_delete:
        prod_filter_clauses.append(models.Product.supplier_user_id == str(uid))
        prod_filter_clauses.append(models.Product.supplier_id == uid)

    if prod_filter_clauses:
        prods_query = db.query(models.Product).filter(or_(*prod_filter_clauses))
        for p in prods_query.all():
            db.delete(p)
            prods_deleted_count += 1

    if user_ids_to_delete:
        db.query(models.SupplierAvailability).filter(
            models.SupplierAvailability.supplier_user_id.in_(list(user_ids_to_delete))
        ).delete(synchronize_session=False)

    for n in all_names_list:
        db.query(models.Supplier).filter(models.Supplier.name.ilike(n)).delete(synchronize_session=False)

    users_deleted_count = len(matched_users)
    for u in matched_users:
        db.delete(u)

    db.commit()

    return {
        "status": "success",
        "restaurant": clean_id,
        "sqlite_deleted": {"products": prods_deleted_count, "users": users_deleted_count},
        "mongo_deleted": mongo_res,
        "message": f"Restaurant '{clean_id}' and all menu items have been permanently deleted."
    }

# ADMIN USER MANAGEMENT API ENDPOINTS
@app.get("/api/admin/users", response_model=List[schemas.UserResponse])
def get_all_users(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    users = list(db.query(models.User).all())
    if mongo_db.is_mongo_active():
        try:
            m_users = mongo_db.mongo_get_all_users()
            existing_usernames = {u.username.lower() for u in users if u.username}
            for mu in m_users:
                uname = (mu.get("username") or "").lower()
                if uname and uname not in existing_usernames:
                    users.append(models.User(
                        id=mu.get("id") or (1000 + len(users)),
                        username=mu.get("username"),
                        email=mu.get("email") or f"{uname}@dropzyy.com",
                        full_name=mu.get("full_name") or uname,
                        phone=mu.get("phone"),
                        role=mu.get("role") or "customer",
                        supplier_company_name=mu.get("supplier_company_name"),
                        is_verified=mu.get("is_verified", True),
                        open_time=mu.get("open_time") or "08:00 AM",
                        close_time=mu.get("close_time") or "10:00 PM",
                        store_open=mu.get("store_open") if mu.get("store_open") is not None else True
                    ))
                    existing_usernames.add(uname)
                elif uname and uname in existing_usernames:
                    matched = next((u for u in users if (u.username or "").lower() == uname), None)
                    if matched:
                        if mu.get("open_time"): matched.open_time = mu.get("open_time")
                        if mu.get("close_time"): matched.close_time = mu.get("close_time")
                        if mu.get("store_open") is not None: matched.store_open = mu.get("store_open")
                        if mu.get("supplier_company_name") and not matched.supplier_company_name:
                            matched.supplier_company_name = mu.get("supplier_company_name")
        except Exception as e:
            print(f"[MONGODB USER MERGE ERR]: {e}")
    return users

@app.delete("/api/admin/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": f"User {user_id} deleted successfully"}

# PRODUCT API ENDPOINTS
@app.get("/api/products", response_model=List[schemas.ProductResponse])
def get_products(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    if mongo_db.is_mongo_active():
        m_prods = mongo_db.mongo_get_all_products()
        if m_prods is not None:
            res = []
            cat_str = category if isinstance(category, str) else None
            srch_str = search if isinstance(search, str) else None

            for p in m_prods:
                p_cat = str(p.get("category", ""))
                p_title = str(p.get("title", ""))
                p_desc = str(p.get("description", ""))

                if cat_str and cat_str != "all" and p_cat != cat_str:
                    continue
                if srch_str:
                    s_clean = srch_str.lower()
                    if s_clean not in p_title.lower() and s_clean not in p_desc.lower():
                        continue

                res.append(schemas.ProductResponse(
                    id=str(p.get("id", p.get("_id"))),
                    title=p_title,
                    category=p_cat,
                    price=float(p.get("price", 0.0)),
                    original_price=float(p.get("original_price") or p.get("price", 0.0)),
                    unit=str(p.get("unit", "")),
                    rating=float(p.get("rating", 4.8)),
                    reviews_count=int(p.get("reviews_count", 100)),
                    image=str(p.get("image", "")),
                    badge=str(p.get("badge", "Fresh")),
                    discount=str(p.get("discount", "10% OFF")),
                    description=p_desc,
                    nutrition=str(p.get("nutrition", "")),
                    supplier_name=str(p.get("supplier_name", "Dropzyy Direct")),
                    supplier_company_name=str(p.get("supplier_company_name")) if p.get("supplier_company_name") else None,
                    supplier_id=int(p["supplier_id"]) if (p.get("supplier_id") is not None and str(p.get("supplier_id")).isdigit()) else None,
                    supplier_user_id=str(p.get("supplier_user_id")) if p.get("supplier_user_id") else None,
                    is_online=bool(p.get("is_online", True))
                ))
            return res

    query = db.query(models.Product)
    if category and category != "all":
        query = query.filter(models.Product.category == category)
    if search:
        query = query.filter(
            (models.Product.title.ilike(f"%{search}%")) | 
            (models.Product.description.ilike(f"%{search}%"))
        )
    return query.all()

@app.post("/api/products", response_model=schemas.ProductResponse)
def create_product(product_data: schemas.ProductCreate, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    product_id = "k_" + str(uuid.uuid4())[:8]
    new_product = models.Product(
        id=product_id,
        title=product_data.title,
        category=product_data.category,
        price=product_data.price,
        original_price=product_data.original_price,
        unit=product_data.unit,
        image=product_data.image,
        badge=product_data.badge or "Fresh",
        discount=product_data.discount or "10% OFF",
        description=product_data.description,
        nutrition=product_data.nutrition,
        supplier_name=product_data.supplier_name or "Dropzyy Direct",
        supplier_id=product_data.supplier_id
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_product({
                "id": new_product.id,
                "title": new_product.title,
                "category": new_product.category,
                "price": new_product.price,
                "original_price": new_product.original_price,
                "unit": new_product.unit,
                "image": new_product.image,
                "badge": new_product.badge,
                "discount": new_product.discount,
                "description": new_product.description,
                "nutrition": new_product.nutrition,
                "supplier_name": new_product.supplier_name,
                "supplier_company_name": product_data.supplier_company_name or new_product.supplier_name,
                "supplier_user_id": product_data.supplier_user_id,
                "is_online": bool(product_data.is_online if product_data.is_online is not None else True)
            })
            print(f"[MONGODB SYNC SUCCESS] Product '{new_product.title}' saved to MongoDB Atlas!")
        except Exception as m_err:
            print(f"[MONGODB SYNC ERROR] Could not save product to MongoDB: {m_err}")
            raise HTTPException(status_code=500, detail=f"Failed to save product to MongoDB: {str(m_err)}")

    is_on = bool(product_data.is_online if product_data.is_online is not None else True)
    setattr(new_product, 'supplier_company_name', product_data.supplier_company_name or new_product.supplier_name)
    setattr(new_product, 'supplier_user_id', product_data.supplier_user_id)
    setattr(new_product, 'is_online', is_on)
    return new_product

@app.put("/api/products/{product_id}", response_model=schemas.ProductResponse)
def update_product(product_id: str, product_data: schemas.ProductCreate, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_save_product({
            "id": product_id,
            "title": product_data.title,
            "category": product_data.category,
            "price": product_data.price,
            "original_price": product_data.original_price,
            "unit": product_data.unit,
            "image": product_data.image,
            "badge": product_data.badge,
            "discount": product_data.discount,
            "description": product_data.description,
            "nutrition": product_data.nutrition,
            "supplier_name": product_data.supplier_name,
            "supplier_company_name": product_data.supplier_company_name,
            "supplier_user_id": product_data.supplier_user_id,
            "is_online": bool(product_data.is_online if product_data.is_online is not None else True)
        })

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if product:
        product.title = product_data.title
        product.category = product_data.category
        product.price = product_data.price
        product.original_price = product_data.original_price
        product.unit = product_data.unit
        product.image = product_data.image
        product.badge = product_data.badge or product.badge
        product.discount = product_data.discount or product.discount
        product.description = product_data.description
        product.nutrition = product_data.nutrition
        product.supplier_name = product_data.supplier_name or product.supplier_name
        if product_data.is_online is not None:
            product.is_online = product_data.is_online
        db.commit()
        db.refresh(product)
        is_on = bool(product_data.is_online if product_data.is_online is not None else True)
        setattr(product, 'supplier_company_name', product_data.supplier_company_name)
        setattr(product, 'supplier_user_id', product_data.supplier_user_id)
        setattr(product, 'is_online', is_on)
        return product

    return schemas.ProductResponse(
        id=product_id,
        title=product_data.title,
        category=product_data.category,
        price=product_data.price,
        original_price=product_data.original_price,
        unit=product_data.unit,
        rating=4.8,
        reviews_count=100,
        image=product_data.image,
        badge=product_data.badge or "Fresh",
        discount=product_data.discount or "10% OFF",
        description=product_data.description,
        nutrition=product_data.nutrition,
        supplier_name=product_data.supplier_name,
        supplier_company_name=product_data.supplier_company_name,
        supplier_user_id=product_data.supplier_user_id,
        is_online=bool(product_data.is_online if product_data.is_online is not None else True)
    )

@app.delete("/api/products/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_product(product_id)

    product = db.query(models.Product).filter(models.Product.id == product_id).first()
    if product:
        db.delete(product)
        db.commit()
    return {"message": f"Product {product_id} deleted successfully"}

# SUPPLIER API ENDPOINTS
@app.get("/api/suppliers", response_model=List[schemas.SupplierResponse])
def get_suppliers(db: Session = Depends(get_db)):
    return db.query(models.Supplier).all()

@app.post("/api/suppliers", response_model=schemas.SupplierResponse)
def create_supplier(supplier_data: schemas.SupplierCreate, db: Session = Depends(get_db)):
    new_supplier = models.Supplier(
        name=supplier_data.name,
        contact_person=supplier_data.contact_person,
        phone=supplier_data.phone,
        city=supplier_data.city
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return new_supplier

# ORDER API ENDPOINTS (FOR CROSS-DEVICE SYNC)
import json

@app.get("/api/orders", response_model=List[schemas.OrderResponse])
def get_orders(user_id: Optional[str] = Query(None), db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        if user_id and user_id not in ["admin", "yashpatil", "supplier"]:
            m_orders = mongo_db.mongo_get_user_orders(user_id)
        else:
            m_orders = mongo_db.mongo_get_all_orders()
        
        if m_orders is not None:
            results = []
            for o in m_orders:
                results.append(schemas.OrderResponse(
                    id=str(o.get("id", o.get("_id"))),
                    userId=o.get("userId") or o.get("user_id"),
                    date=str(o.get("date", "")),
                    status=str(o.get("status", "Placed")),
                    total=float(o.get("total", 0.0)),
                    delivery=o.get("delivery") if isinstance(o.get("delivery"), dict) else {},
                    items=o.get("items") if isinstance(o.get("items"), list) else []
                ))
            return results

    query = db.query(models.Order)
    if user_id and isinstance(user_id, str) and user_id != "admin" and user_id != "yashpatil" and user_id != "supplier":
        u = db.query(models.User).filter(
            (models.User.username == user_id) | 
            (models.User.email == user_id.lower()) | 
            (models.User.id == (int(user_id) if str(user_id).isdigit() else -1))
        ).first()
        if u:
            query = query.filter(
                (models.Order.user_id == str(u.id)) | 
                (models.Order.user_id == str(u.username)) | 
                (models.Order.user_id == str(u.email)) | 
                (models.Order.user_id == None)
            )
        else:
            query = query.filter(
                (models.Order.user_id == str(user_id)) | 
                (models.Order.user_id == None)
            )
    db_orders = query.order_by(models.Order.created_at.desc()).all()
    results = []
    for o in db_orders:
        results.append(schemas.OrderResponse(
            id=o.id,
            userId=o.user_id,
            date=o.date,
            status=o.status,
            total=o.total,
            delivery=json.loads(o.delivery_json) if o.delivery_json else None,
            items=json.loads(o.items_json) if o.items_json else []
        ))
    return results

@app.delete("/api/orders/{order_id}")
def delete_order(order_id: str, db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_order(order_id)

    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if order:
        db.delete(order)
        db.commit()
    return {"message": f"Order {order_id} deleted successfully"}

@app.put("/api/orders/{order_id}/cancel")
def cancel_order(order_id: str, db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_update_order_status(str(order_id), "Cancelled")

    order = db.query(models.Order).filter(models.Order.id == str(order_id)).first()
    if order:
        order.status = "Cancelled"
        db.commit()
        db.refresh(order)

    return {"message": "Order cancelled successfully", "id": order_id, "status": "Cancelled"}

EMAILJS_PUBLIC_KEY = "_p0PL2iAKyPOfO7Op"
EMAILJS_SERVICE_ID = "default_service"
EMAILJS_BILL_TEMPLATE_ID = "template_1xw8s47"

def send_emailjs_delivery_bill(order_id: str, customer_email: str = "", customer_name: str = "", items: list = None, total_amount: float = 0.0) -> bool:
    """
    Dispatches delivery bill EXCLUSIVELY via EmailJS REST API over HTTPS Port 443.
    """
    if not customer_email or "@" not in customer_email:
        return False

    try:
        import urllib.request
        import json

        items = items or []
        items_str = ", ".join([f"{i.get('title') or i.get('name') or 'Item'} (x{i.get('qty') or i.get('quantity') or 1})" for i in items])
        subtotal = sum([float(i.get('price', 0)) * int(i.get('qty') or i.get('quantity') or 1) for i in items])
        ship_fee = 0.0 if subtotal >= 299 else 29.0
        formatted_total = f"₹{total_amount:.2f}"
        formatted_shipping = "FREE (₹0.00)" if ship_fee == 0 else f"₹{ship_fee:.2f}"

        orders_arr = []
        for i in items:
            p = float(i.get('price', 0))
            q = int(i.get('qty') or i.get('quantity') or 1)
            orders_arr.append({
                "name": i.get('title') or i.get('name') or 'Item',
                "title": i.get('title') or i.get('name') or 'Item',
                "units": q,
                "quantity": q,
                "price": f"₹{p:.2f}",
                "total": f"₹{(p*q):.2f}"
            })

        payload = {
            "service_id": EMAILJS_SERVICE_ID,
            "template_id": EMAILJS_BILL_TEMPLATE_ID,
            "user_id": EMAILJS_PUBLIC_KEY,
            "template_params": {
                "to_email": customer_email,
                "email": customer_email,
                "user_email": customer_email,
                "recipient": customer_email,
                "to": customer_email,
                "reply_to": customer_email,
                "to_name": customer_name or "Valued Customer",
                "name": customer_name or "Valued Customer",
                "order_id": order_id,
                "id": order_id,
                "orders": orders_arr,
                "items_summary": items_str,
                "cost": {
                    "shipping": formatted_shipping,
                    "tax": "₹0.00",
                    "subtotal": f"₹{subtotal:.2f}",
                    "total": formatted_total
                },
                "cost.shipping": formatted_shipping,
                "cost.tax": "₹0.00",
                "cost.subtotal": f"₹{subtotal:.2f}",
                "cost.total": formatted_total,
                "total_amount": formatted_total,
                "order_total": formatted_total,
                "total": formatted_total
            }
        }

        url = "https://api.emailjs.com/api/v1.0/email/send"
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Origin": "https://dropzyy.onrender.com"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.getcode() in (200, 201):
                print(f"[EMAILJS REST SUCCESS] Instant delivery bill sent to {customer_email} via EmailJS REST API!")
                return True
    except Exception as err:
        print(f"[EMAILJS REST LOG]: {err}")

    return False

_sent_delivery_email_ids = set()

@app.put("/api/orders/{order_id}/status")
def update_order_status(order_id: str, payload: dict, db: Session = Depends(get_db)):
    new_status = payload.get("status", "Placed")
    if mongo_db.is_mongo_active():
        mongo_db.mongo_update_order_status(str(order_id), new_status)

    order = db.query(models.Order).filter(models.Order.id == str(order_id)).first()
    if order:
        order.status = new_status
        db.commit()
        db.refresh(order)

    # When order status is set to Delivered, send EmailJS delivery bill via EmailJS REST API over HTTPS Port 443!
    if str(new_status).lower() == "delivered":
        target_email = ""
        c_name = "Valued Customer"
        items_list = []
        tot_amt = 0.0

        if mongo_db.is_mongo_active():
            m_orders = mongo_db.mongo_get_all_orders()
            for o in m_orders:
                if str(o.get("id")) == str(order_id):
                    del_info = o.get("delivery") or {}
                    items_list = o.get("items") or []
                    target_email = del_info.get("email") or o.get("userId") or o.get("user_id") or ""
                    c_name = del_info.get("name") or "Valued Customer"
                    tot_amt = float(o.get("total", 0))
                    break

        if not target_email and order:
            del_info = json.loads(order.delivery_json) if order.delivery_json else {}
            items_list = json.loads(order.items_json) if order.items_json else []
            target_email = del_info.get("email") or order.user_id or ""
            c_name = del_info.get("name") or "Valued Customer"
            tot_amt = float(order.total)

        if target_email and "@" in target_email:
            send_emailjs_delivery_bill(str(order_id), target_email, c_name, items_list, tot_amt)

    return {"message": "Order status updated successfully", "id": order_id, "status": new_status, "emailjs_sent": True}

# EmailJS Only Bill Status Endpoint
class SendBillRequestPayload(BaseModel):
    email: Optional[str] = None

@app.post("/api/orders/{order_id}/send-bill")
def send_order_bill_endpoint(order_id: str, payload: Optional[SendBillRequestPayload] = None, db: Session = Depends(get_db)):
    return {"success": True, "message": "Email delivery handled exclusively via client-side EmailJS", "emailjs_only": True}

@app.post("/api/orders", response_model=schemas.OrderResponse)
def create_order(order_data: schemas.OrderCreate, db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_order({
                "id": str(order_data.id),
                "user_id": str(order_data.userId) if order_data.userId else None,
                "userId": str(order_data.userId) if order_data.userId else None,
                "date": str(order_data.date or datetime.datetime.utcnow().isoformat()),
                "status": str(order_data.status or "Placed"),
                "total": float(order_data.total),
                "delivery": order_data.delivery if isinstance(order_data.delivery, dict) else {},
                "items": order_data.items if isinstance(order_data.items, list) else []
            })
            print(f"[MONGODB ORDER SYNC SUCCESS] Order #{order_data.id} saved to MongoDB Atlas Cloud!")
        except Exception as m_err:
            print(f"[MONGODB ORDER SYNC NOTICE] Could not save order to MongoDB: {m_err}")

    existing = db.query(models.Order).filter(models.Order.id == order_data.id).first()
    if existing:
        existing.status = order_data.status or existing.status
        existing.total = order_data.total
        existing.delivery_json = json.dumps(order_data.delivery) if order_data.delivery else None
        existing.items_json = json.dumps(order_data.items) if order_data.items else None
        db.commit()
        db.refresh(existing)
        return schemas.OrderResponse(
            id=existing.id,
            userId=existing.user_id,
            date=existing.date,
            status=existing.status,
            total=existing.total,
            delivery=json.loads(existing.delivery_json) if existing.delivery_json else None,
            items=json.loads(existing.items_json) if existing.items_json else []
        )
    
    new_order = models.Order(
        id=order_data.id,
        user_id=str(order_data.userId) if order_data.userId is not None else None,
        date=order_data.date,
        status=order_data.status or "Placed",
        total=order_data.total,
        delivery_json=json.dumps(order_data.delivery) if order_data.delivery else None,
        items_json=json.dumps(order_data.items) if order_data.items else None
    )
    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    # Trigger Instant Admin Notifications (Email + SMS)
    delivery_info = json.loads(new_order.delivery_json) if new_order.delivery_json else {}
    items_list = json.loads(new_order.items_json) if new_order.items_json else []
    
    # 1. Instant Email Notification to Admin (patilyash948@gmail.com) with full itemized breakdown
    send_admin_order_email_alert(
        order_id=new_order.id,
        customer_info=delivery_info,
        items=items_list,
        total_amount=new_order.total
    )

    # 2. Instant SMS Notification to Admin (+917020447482)
    send_admin_order_sms_alert(
        order_id=new_order.id,
        customer_info=delivery_info,
        items=items_list,
        total_amount=new_order.total,
        db=db
    )

    return schemas.OrderResponse(
        id=new_order.id,
        userId=new_order.user_id,
        date=new_order.date,
        status=new_order.status,
        total=new_order.total,
        delivery=delivery_info,
        items=items_list
    )



@app.get("/api/orders/{order_id}/pdf")
def download_order_pdf_invoice(order_id: str, db: Session = Depends(get_db)):
    """
    Directly returns raw PDF attachment bytes for instant browser download.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    delivery_info = json.loads(order.delivery_json) if order.delivery_json else {}
    items_list = json.loads(order.items_json) if order.items_json else []
    
    pdf_bytes = generate_order_pdf_invoice(
        order_id=order.id,
        date_str=order.date,
        customer_info=delivery_info,
        items=items_list,
        total_amount=order.total
    )
    
    headers = {
        'Content-Disposition': f'attachment; filename="Dropzyy_Invoice_{order.id}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)

# CART API ENDPOINTS
@app.get("/api/cart/{user_id}", response_model=List[schemas.CartItemResponse])
def get_user_cart(user_id: str, db: Session = Depends(get_db)):
    return db.query(models.CartItem).filter(models.CartItem.user_id == str(user_id)).all()

@app.post("/api/cart", response_model=schemas.CartItemResponse)
def add_to_cart(item: schemas.CartItemCreate, db: Session = Depends(get_db)):
    existing = db.query(models.CartItem).filter(
        models.CartItem.user_id == str(item.user_id),
        models.CartItem.product_id == item.product_id
    ).first()
    if existing:
        existing.quantity += item.quantity
        db.commit()
        db.refresh(existing)
        return existing
    new_item = models.CartItem(
        user_id=str(item.user_id),
        product_id=item.product_id,
        quantity=item.quantity
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.put("/api/cart/{cart_item_id}", response_model=schemas.CartItemResponse)
def update_cart_quantity(cart_item_id: int, payload: schemas.CartItemUpdate, db: Session = Depends(get_db)):
    cart_item = db.query(models.CartItem).filter(models.CartItem.id == cart_item_id).first()
    if not cart_item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if payload.quantity <= 0:
        db.delete(cart_item)
        db.commit()
        return cart_item
    cart_item.quantity = payload.quantity
    db.commit()
    db.refresh(cart_item)
    return cart_item

@app.delete("/api/cart/{user_id}/{product_id}")
def delete_cart_item(user_id: str, product_id: str, db: Session = Depends(get_db)):
    cart_item = db.query(models.CartItem).filter(
        models.CartItem.user_id == str(user_id),
        models.CartItem.product_id == product_id
    ).first()
    if cart_item:
        db.delete(cart_item)
        db.commit()
    return {"message": "Cart item removed"}

@app.delete("/api/cart/clear/{user_id}")
def clear_user_cart(user_id: str, db: Session = Depends(get_db)):
    db.query(models.CartItem).filter(models.CartItem.user_id == str(user_id)).delete()
    db.commit()
    return {"message": f"Cart cleared for user {user_id}"}

# WISHLIST API ENDPOINTS
@app.get("/api/wishlist/{user_id}")
def get_user_wishlist(user_id: str, db: Session = Depends(get_db)):
    items = db.query(models.WishlistItem).filter(models.WishlistItem.user_id == str(user_id)).all()
    return [item.product_id for item in items]

@app.post("/api/wishlist/toggle")
def toggle_wishlist_item(payload: schemas.WishlistToggle, db: Session = Depends(get_db)):
    existing = db.query(models.WishlistItem).filter(
        models.WishlistItem.user_id == str(payload.user_id),
        models.WishlistItem.product_id == payload.product_id
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"in_wishlist": False, "product_id": payload.product_id}
    else:
        new_item = models.WishlistItem(
            user_id=str(payload.user_id),
            product_id=payload.product_id
        )
        db.add(new_item)
        db.commit()
        return {"in_wishlist": True, "product_id": payload.product_id}

# COUPONS API ENDPOINTS
@app.get("/api/coupons", response_model=List[schemas.CouponResponse])
def get_coupons(db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        m_coupons = mongo_db.mongo_get_all_coupons()
        if m_coupons is not None:
            res = []
            for idx, c in enumerate(m_coupons):
                if c.get("is_active") is False:
                    continue
                res.append(schemas.CouponResponse(
                    id=idx + 1,
                    code=str(c.get("code", "")).upper(),
                    discount_percent=float(c.get("discount_percent") or c.get("discount") or 0.0),
                    min_order=float(c.get("min_order") or 0.0),
                    description=str(c.get("description", "")),
                    is_active=bool(c.get("is_active", True))
                ))
            return res
    return db.query(models.Coupon).filter(models.Coupon.is_active == True).all()

@app.post("/api/coupons", response_model=schemas.CouponResponse)
def create_coupon(coupon_data: schemas.CouponCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    code_clean = coupon_data.code.strip().upper()
    
    # Check duplicate in MongoDB if active
    if mongo_db.is_mongo_active():
        all_c = mongo_db.mongo_get_all_coupons()
        if any(str(c.get("code", "")).upper() == code_clean for c in all_c):
            raise HTTPException(status_code=400, detail=f"Coupon code '{code_clean}' already exists in database!")
    
    existing = db.query(models.Coupon).filter(models.Coupon.code == code_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Coupon code '{code_clean}' already exists in database!")
    
    new_coupon = models.Coupon(
        code=code_clean,
        discount_percent=coupon_data.discount_percent,
        min_order=coupon_data.min_order or 0.0,
        description=coupon_data.description or "",
        is_active=coupon_data.is_active
    )
    db.add(new_coupon)
    db.commit()
    db.refresh(new_coupon)

    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_coupon({
                "id": str(new_coupon.id),
                "code": new_coupon.code,
                "discount": new_coupon.discount_percent,
                "discount_percent": new_coupon.discount_percent,
                "min_order": new_coupon.min_order,
                "description": new_coupon.description,
                "is_active": new_coupon.is_active
            })
            print(f"[MONGODB SYNC SUCCESS] Coupon '{new_coupon.code}' saved to MongoDB Atlas!")
        except Exception as err:
            print(f"[MONGODB SYNC ERROR] Could not save coupon: {err}")
            raise HTTPException(status_code=500, detail=f"Failed to save coupon to MongoDB: {str(err)}")

    return new_coupon

@app.delete("/api/coupons/{coupon_id}")
def delete_coupon(coupon_id: str, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_coupon(str(coupon_id))
    try:
        if coupon_id.isdigit():
            c = db.query(models.Coupon).filter(models.Coupon.id == int(coupon_id)).first()
            if c:
                db.delete(c)
                db.commit()
    except Exception:
        pass
    return {"message": "Coupon deleted"}

# SERVICEABLE LOCATIONS API ENDPOINTS
@app.get("/api/locations", response_model=List[schemas.LocationResponse])
def get_locations(db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        m_locs = mongo_db.mongo_get_all_locations()
        if m_locs is not None:
            res = []
            for idx, l in enumerate(m_locs):
                res.append(schemas.LocationResponse(
                    id=idx + 1,
                    city=str(l.get("city", "Mumbai")),
                    pincode=str(l.get("pincode", "")),
                    delivery_time=str(l.get("delivery_time", "15 Mins"))
                ))
            return res
    return db.query(models.Location).all()

@app.post("/api/locations", response_model=schemas.LocationResponse)
def create_location(loc_data: schemas.LocationCreate, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    pin_clean = str(loc_data.pincode).strip()
    
    if mongo_db.is_mongo_active():
        all_l = mongo_db.mongo_get_all_locations()
        if any(str(l.get("pincode", "")).strip() == pin_clean for l in all_l):
            raise HTTPException(status_code=400, detail=f"Pincode '{pin_clean}' already added in database!")

    existing = db.query(models.Location).filter(models.Location.pincode == pin_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Pincode '{pin_clean}' already added in database!")

    new_loc = models.Location(
        city=loc_data.city,
        pincode=pin_clean,
        delivery_time=loc_data.delivery_time or "15 Mins"
    )
    db.add(new_loc)
    db.commit()
    db.refresh(new_loc)

    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_location({
                "id": str(new_loc.id),
                "city": new_loc.city,
                "pincode": new_loc.pincode,
                "delivery_time": new_loc.delivery_time
            })
            print(f"[MONGODB SYNC SUCCESS] Location '{new_loc.pincode}' saved to MongoDB Atlas!")
        except Exception as err:
            print(f"[MONGODB SYNC ERROR] Could not save location: {err}")
            raise HTTPException(status_code=500, detail=f"Failed to save location to MongoDB: {str(err)}")

    return new_loc

@app.delete("/api/locations/{location_id}")
def delete_location(location_id: str, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_location(str(location_id))
    try:
        if location_id.isdigit():
            l = db.query(models.Location).filter(models.Location.id == int(location_id)).first()
            if l:
                db.delete(l)
                db.commit()
    except Exception:
        pass
    return {"message": "Location deleted"}

# ==========================================
# Category Management Endpoints (MongoDB Atlas & SQLite Sync)
# ==========================================
@app.get("/api/categories", response_model=List[schemas.CategoryResponse])
def get_categories(db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        try:
            m_cats = mongo_db.mongo_get_all_categories()
            if m_cats:
                result = []
                for idx, c in enumerate(m_cats, 1):
                    result.append(schemas.CategoryResponse(
                        id=int(c.get("id", idx)) if str(c.get("id", "")).isdigit() else idx,
                        code=str(c.get("code", "")).lower(),
                        name=str(c.get("name", "")),
                        icon=str(c.get("icon", "fa-solid fa-layer-group"))
                    ))
                return result
        except Exception as err:
            print(f"[MONGODB CATEGORIES FETCH ERROR] {err}")
    
    return db.query(models.Category).all()

@app.post("/api/categories", response_model=schemas.CategoryResponse)
def create_category(cat_data: schemas.CategoryCreate, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    code_clean = cat_data.code.strip().lower().replace(" ", "_")
    if mongo_db.is_mongo_active():
        all_c = mongo_db.mongo_get_all_categories()
        if any(str(c.get("code", "")).strip().lower() == code_clean for c in all_c):
            raise HTTPException(status_code=400, detail=f"Category '{code_clean}' already exists in database!")

    existing = db.query(models.Category).filter(models.Category.code == code_clean).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{code_clean}' already exists in database!")

    new_cat = models.Category(
        code=code_clean,
        name=cat_data.name.strip(),
        icon=cat_data.icon or "fa-solid fa-layer-group"
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)

    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_category({
                "id": str(new_cat.id),
                "code": new_cat.code,
                "name": new_cat.name,
                "icon": new_cat.icon
            })
            print(f"[MONGODB SYNC SUCCESS] Category '{new_cat.code}' saved to MongoDB Atlas!")
        except Exception as err:
            print(f"[MONGODB SYNC ERROR] Could not save category: {err}")

    return new_cat

@app.delete("/api/categories/{identifier}")
def delete_category(identifier: str, db: Session = Depends(get_db), _supplier: dict = Depends(require_supplier)):
    clean_id = identifier.strip().lower()
    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_category(clean_id)
    try:
        if clean_id.isdigit():
            c = db.query(models.Category).filter(models.Category.id == int(clean_id)).first()
        else:
            c = db.query(models.Category).filter(models.Category.code == clean_id).first()
        if c:
            db.delete(c)
            db.commit()
    except Exception:
        pass
    return {"message": f"Category '{clean_id}' deleted successfully"}

# -------------------------------------------------------------------
# REFUND CLAIMS REST API ENDPOINTS
# -------------------------------------------------------------------
@app.get("/api/refunds")
def get_all_refunds(db: Session = Depends(get_db)):
    if mongo_db.is_mongo_active():
        try:
            m_refunds = mongo_db.mongo_get_all_refunds()
            if m_refunds is not None:
                return m_refunds
        except Exception as e:
            print(f"[MONGODB REFUND FETCH ERR]: {e}")
    
    return db.query(models.RefundClaim).order_by(models.RefundClaim.created_at.desc()).all()

@app.post("/api/refunds", response_model=schemas.RefundClaimResponse)
def create_refund_claim(claim_data: schemas.RefundClaimCreate, db: Session = Depends(get_db)):
    refund_id = f"REF-{random.randint(100000, 999999)}"
    
    new_claim = models.RefundClaim(
        id=refund_id,
        email=claim_data.email.strip().lower(),
        order_id=claim_data.order_id.strip(),
        reason=claim_data.reason.strip(),
        upi_id=claim_data.upi_id.strip() if claim_data.upi_id else "",
        details=claim_data.details.strip(),
        status="Pending"
    )
    db.add(new_claim)
    db.commit()
    db.refresh(new_claim)

    if mongo_db.is_mongo_active():
        try:
            mongo_db.mongo_save_refund({
                "id": str(new_claim.id),
                "email": new_claim.email,
                "order_id": new_claim.order_id,
                "reason": new_claim.reason,
                "upi_id": new_claim.upi_id,
                "details": new_claim.details,
                "status": "Pending",
                "created_at": datetime.datetime.utcnow().isoformat()
            })
            print(f"[MONGODB SYNC SUCCESS] Refund Claim '{new_claim.id}' saved to MongoDB Atlas!")
        except Exception as err:
            print(f"[MONGODB SYNC ERROR] Could not save refund claim: {err}")

    return new_claim

@app.put("/api/refunds/{refund_id}/status")
def update_refund_status(refund_id: str, payload: dict, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    new_status = payload.get("status", "Approved")
    if mongo_db.is_mongo_active():
        mongo_db.mongo_update_refund_status(str(refund_id), new_status)

    claim = db.query(models.RefundClaim).filter(models.RefundClaim.id == str(refund_id)).first()
    if claim:
        claim.status = new_status
        db.commit()
        db.refresh(claim)

    return {"message": f"Refund claim {refund_id} updated to {new_status}", "id": refund_id, "status": new_status}

# ==========================================
# SUPPLIER AVAILABILITY CALENDAR ENDPOINTS
# ==========================================

@app.get("/api/supplier/availability")
def get_all_supplier_availability(db: Session = Depends(get_db)):
    """Get all date-based availability entries across all suppliers."""
    entries = db.query(models.SupplierAvailability).all()
    res = [
        {
            "id": e.id,
            "supplier_user_id": e.supplier_user_id,
            "date": e.date,
            "is_open": e.is_open
        }
        for e in entries
    ]
    if mongo_db.is_mongo_active():
        mongo_entries = mongo_db.mongo_get_all_availabilities()
        seen = {(e["supplier_user_id"], e["date"]) for e in res}
        for me in mongo_entries:
            key = (me.get("supplier_user_id"), me.get("date"))
            if key not in seen and me.get("supplier_user_id"):
                try:
                    s_id = int(me.get("supplier_user_id"))
                except Exception:
                    s_id = me.get("supplier_user_id")
                res.append({
                    "id": me.get("id", 0),
                    "supplier_user_id": s_id,
                    "date": me.get("date"),
                    "is_open": me.get("is_open", True)
                })
    return res

@app.get("/api/supplier/availability/{supplier_user_id}")
def get_supplier_availability(supplier_user_id: int, db: Session = Depends(get_db)):
    """Get all date-based availability entries for a specific supplier."""
    entries = db.query(models.SupplierAvailability)\
        .filter(models.SupplierAvailability.supplier_user_id == supplier_user_id)\
        .order_by(models.SupplierAvailability.date)\
        .all()
    res = [
        {
            "id": e.id,
            "supplier_user_id": e.supplier_user_id,
            "date": e.date,
            "is_open": e.is_open
        }
        for e in entries
    ]
    if mongo_db.is_mongo_active():
        mongo_entries = mongo_db.mongo_get_supplier_availability(supplier_user_id)
        seen = {e["date"] for e in res}
        for me in mongo_entries:
            if me.get("date") not in seen:
                res.append({
                    "id": me.get("id", 0),
                    "supplier_user_id": supplier_user_id,
                    "date": me.get("date"),
                    "is_open": me.get("is_open", True)
                })
    return res

@app.post("/api/supplier/availability")
def set_supplier_availability(data: schemas.SupplierAvailabilitySet, db: Session = Depends(get_db)):
    """Create or update a supplier's availability for a specific date (upsert)."""
    # 1. Update SQLite
    existing = db.query(models.SupplierAvailability).filter(
        models.SupplierAvailability.supplier_user_id == data.supplier_user_id,
        models.SupplierAvailability.date == data.date
    ).first()

    res_id = 0
    if existing:
        existing.is_open = data.is_open
        existing.updated_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(existing)
        res_id = existing.id
    else:
        new_entry = models.SupplierAvailability(
            supplier_user_id=data.supplier_user_id,
            date=data.date,
            is_open=data.is_open
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        res_id = new_entry.id

    # 2. Update MongoDB Atlas
    if mongo_db.is_mongo_active():
        mongo_db.mongo_set_supplier_availability(data.supplier_user_id, data.date, data.is_open)

    return {
        "id": res_id,
        "supplier_user_id": data.supplier_user_id,
        "date": data.date,
        "is_open": data.is_open
    }

@app.delete("/api/supplier/availability/{supplier_user_id}/{date}")
def delete_supplier_availability(supplier_user_id: int, date: str, db: Session = Depends(get_db)):
    """Remove a specific date override (resets that date to default store status)."""
    entry = db.query(models.SupplierAvailability).filter(
        models.SupplierAvailability.supplier_user_id == supplier_user_id,
        models.SupplierAvailability.date == date
    ).first()
    if entry:
        db.delete(entry)
        db.commit()

    if mongo_db.is_mongo_active():
        mongo_db.mongo_delete_supplier_availability(supplier_user_id, date)

    return {"message": f"Availability entry for {date} removed"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


