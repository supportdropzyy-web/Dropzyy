import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

pdf_path = "Dropzyy_QA_Testing_Plan.pdf"

doc = SimpleDocTemplate(
    pdf_path,
    pagesize=letter,
    leftMargin=36,
    rightMargin=36,
    topMargin=36,
    bottomMargin=36
)

styles = getSampleStyleSheet()

# Custom styles
primary_color = colors.HexColor("#0F172A")    # Slate 900
emerald_color = colors.HexColor("#10B981")    # Emerald 500
dark_emerald  = colors.HexColor("#065F46")    # Emerald 800
light_bg      = colors.HexColor("#F8FAFC")    # Slate 50
border_color  = colors.HexColor("#E2E8F0")    # Slate 200
pass_color    = colors.HexColor("#059669")    # Green 600

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Heading1'],
    fontSize=22,
    leading=26,
    textColor=primary_color,
    fontName="Helvetica-Bold",
    spaceAfter=4
)

subtitle_style = ParagraphStyle(
    'DocSubTitle',
    parent=styles['Normal'],
    fontSize=11,
    leading=15,
    textColor=colors.HexColor("#475569"),
    spaceAfter=12
)

h1_style = ParagraphStyle(
    'SectionH1',
    parent=styles['Heading2'],
    fontSize=13,
    leading=17,
    textColor=dark_emerald,
    fontName="Helvetica-Bold",
    spaceBefore=14,
    spaceAfter=6
)

body_style = ParagraphStyle(
    'BodyTextCustom',
    parent=styles['Normal'],
    fontSize=8.5,
    leading=11,
    textColor=colors.HexColor("#1E293B")
)

bold_style = ParagraphStyle(
    'BoldTextCustom',
    parent=styles['Normal'],
    fontSize=8.5,
    leading=11,
    fontName="Helvetica-Bold",
    textColor=colors.HexColor("#0F172A")
)

badge_high = Paragraph("<font color='#DC2626'><b>HIGH</b></font>", body_style)
badge_med  = Paragraph("<font color='#D97706'><b>MEDIUM</b></font>", body_style)
badge_crit = Paragraph("<font color='#7C2D12'><b>CRITICAL</b></font>", body_style)

elements = []

# Title Banner
elements.append(Paragraph("Dropzyy 1 — Comprehensive QA Testing Plan & Verification Guide", title_style))
elements.append(Paragraph("<b>Version:</b> 1.0 Production Readiness &nbsp;|&nbsp; <b>Target:</b> Web App & FastAPI Backend &nbsp;|&nbsp; <b>Database:</b> MongoDB Atlas Cloud + SQLite", subtitle_style))
elements.append(HRFlowable(width="100%", thickness=2, color=emerald_color, spaceBefore=2, spaceAfter=10))

# Insert Workflow Infographic Image if exists
img_path = r"C:\Users\lalkr\.gemini\antigravity\brain\25e213cc-2016-4a3a-be1e-fd5c5c5bcf72\qa_test_dashboard_1790744471015.jpg"
if os.path.exists(img_path):
    elements.append(Image(img_path, width=7.5*inch, height=4.1*inch))
    elements.append(Spacer(1, 12))

# Helper to create formatted tables
def make_test_table(rows):
    table_data = []
    # Header
    table_data.append([
        Paragraph("<b>ID</b>", bold_style),
        Paragraph("<b>Test Case / Scenario</b>", bold_style),
        Paragraph("<b>Test Steps</b>", bold_style),
        Paragraph("<b>Expected Result</b>", bold_style),
        Paragraph("<b>Priority</b>", bold_style),
        Paragraph("<b>Status</b>", bold_style),
    ])
    for r in rows:
        table_data.append([
            Paragraph(r[0], bold_style),
            Paragraph(r[1], bold_style),
            Paragraph(r[2], body_style),
            Paragraph(r[3], body_style),
            r[4],
            Paragraph("[ &nbsp; ] Pass<br/>[ &nbsp; ] Fail", body_style)
        ])
    t = Table(table_data, colWidths=[38, 115, 160, 155, 45, 42])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    return t

# ---------------------------------------------------------
# MODULE 1: AUTHENTICATION, RBAC & SECURITY
# ---------------------------------------------------------
elements.append(Paragraph("Module 1: Authentication, Role-Based Access Control (RBAC) & Security", h1_style))
m1_tests = [
    ("AUTH-01", "Customer OTP Registration", 
     "1. Click 'Sign In' -> 'Register'.<br/>2. Enter valid email and click 'Send OTP'.<br/>3. Enter 6-digit OTP and set password.",
     "OTP received. New customer account created in SQLite and MongoDB Atlas.", badge_crit),
    ("AUTH-02", "Supplier Portal Sign-in", 
     "1. Enter supplier credentials (e.g. Ramesh Kirana).<br/>2. Click Login.",
     "JWT Bearer token issued. Redirected to Supplier Dashboard with inventory and timing controls.", badge_crit),
    ("AUTH-03", "Admin Privileges & RBAC Barrier", 
     "1. Login as customer.<br/>2. Try directly calling /api/admin/users or opening Admin Panel.",
     "Blocked with HTTP 403 Forbidden. Regular customer cannot access administrative settings.", badge_high),
    ("AUTH-04", "Security Headers & Rate Limiting", 
     "1. Inspect response headers in DevTools Network tab.<br/>2. Send 15 rapid failed login requests.",
     "Security headers present (X-Content-Type-Options, X-Frame-Options). Rate limiter triggers 429 Too Many Requests.", badge_high)
]
elements.append(make_test_table(m1_tests))
elements.append(Spacer(1, 10))

# ---------------------------------------------------------
# MODULE 2: OPERATING HOURS & AVAILABILITY CALENDAR
# ---------------------------------------------------------
elements.append(Paragraph("Module 2: Restaurant Operating Hours & Availability Calendar", h1_style))
m2_tests = [
    ("SCHED-01", "Operating Hours Evaluation (In-Hours)", 
     "1. Supplier sets hours 08:00 AM - 10:00 PM.<br/>2. Customer views restaurant during these hours.",
     "Store shows 'OPEN NOW' green pill. Live badge in dashboard shows 'Store is OPEN'. Orders allowed.", badge_crit),
    ("SCHED-02", "Operating Hours Evaluation (Outside-Hours)", 
     "1. Set closing time to a past hour (e.g. 1 hour ago).<br/>2. Refresh customer view.",
     "Store automatically turns 'CLOSED' red pill with reason 'Currently Closed (Opens at ...)'. Add to Cart is disabled.", badge_crit),
    ("SCHED-03", "Calendar Single-Day Closure Override", 
     "1. Supplier opens Availability Calendar.<br/>2. Select today's date & click 'Mark as CLOSED'.",
     "Calendar turns red for today. Store immediately displays 'Closed today (Calendar schedule)'. Overrides operating hours.", badge_crit),
    ("SCHED-04", "Calendar Reset to Default", 
     "1. Select today's closed date in calendar.<br/>2. Click 'Reset to Default'.",
     "Calendar cell resets to gray default. Store status immediately recalculates from daily operating hours.", badge_high),
    ("SCHED-05", "Global Calendar Fetch for Customers", 
     "1. Mark a store closed via calendar in supplier account.<br/>2. Open customer window in incognito.",
     "GET /api/supplier/availability loads calendar rules. Customer sees closed badge without opening supplier dashboard.", badge_crit)
]
elements.append(make_test_table(m2_tests))
elements.append(Spacer(1, 10))

# ---------------------------------------------------------
# MODULE 3: RESTAURANT & PRODUCT PERMANENT DELETION
# ---------------------------------------------------------
elements.append(Paragraph("Module 3: Restaurant Management & Permanent Deletion Verification", h1_style))
m3_tests = [
    ("DEL-01", "Admin Delete Restaurant (Dual Database)", 
     "1. Admin clicks 'Delete' button on a partner restaurant.<br/>2. Confirm dialog prompt.",
     "DELETE /api/restaurants/{id}?store_name={name} returns 200. Deleted from SQLite & MongoDB Atlas.", badge_crit),
    ("DEL-02", "Page Refresh Resuscitation Check", 
     "1. Delete restaurant as Admin.<br/>2. Hard refresh browser (Ctrl+F5).",
     "Restaurant and its products DO NOT reappear. Not resurrected from DEFAULT_PRODUCTS or DB cache.", badge_crit),
    ("DEL-03", "Supplier Self-Delete Restaurant", 
     "1. Supplier logs into dashboard -> clicks 'Delete Store'.<br/>2. Confirm dialog.",
     "Supplier company name cleared, role reverts to customer, all products removed from store.", badge_high),
    ("DEL-04", "Product Inventory CRUD", 
     "1. Supplier adds new item with price & image.<br/>2. Edit item price.<br/>3. Delete item.",
     "Item creates in SQLite/MongoDB. Instant catalog update on homepage and search.", badge_high)
]
elements.append(make_test_table(m3_tests))
elements.append(Spacer(1, 10))

# ---------------------------------------------------------
# MODULE 4: CART, CHECKOUT, COUPONS & LIVE TRACKING
# ---------------------------------------------------------
elements.append(Paragraph("Module 4: Cart, Checkout, Coupon Codes & Order Tracking", h1_style))
m4_tests = [
    ("ORD-01", "Add to Cart & Quantity Adjustments", 
     "1. Add open store items to cart.<br/>2. Increase quantity to 3, decrease to 1, then 0.",
     "Subtotal dynamically recalculates. Decreasing to 0 cleanly removes line item.", badge_crit),
    ("ORD-02", "Coupon Code Validation", 
     "1. Apply valid coupon 'KIRANA10'.<br/>2. Apply invalid coupon 'FAKE999'.",
     "'KIRANA10' applies 10% discount. Invalid code shows informative warning toast.", badge_med),
    ("ORD-03", "Order Checkout & PDF Invoice", 
     "1. Proceed to Checkout.<br/>2. Enter address & confirm order.<br/>3. Click 'Download PDF Invoice'.",
     "Order placed with unique Order ID (e.g. ORD-...). Branded PDF invoice generates and downloads.", badge_crit),
    ("ORD-04", "Realtime Order Status & Refund Claims", 
     "1. Open 'Booking Tracking & Refund Claims Platform'.<br/>2. File a refund claim on delivered order.",
     "Order lifecycle tracker updates (Placed -> Preparing -> Out for Delivery -> Delivered). Refund claim logged for Admin.", badge_high)
]
elements.append(make_test_table(m4_tests))
elements.append(Spacer(1, 10))

# ---------------------------------------------------------
# MODULE 5: DUAL DATABASE SYNCHRONIZATION
# ---------------------------------------------------------
elements.append(Paragraph("Module 5: Dual Database Sync (MongoDB Atlas & SQLite)", h1_style))
m5_tests = [
    ("SYNC-01", "MongoDB Atlas Cloud Parity", 
     "1. Add product or place order.<br/>2. Inspect MongoDB Atlas collection dropzyy.products / orders.",
     "Document appears in MongoDB Atlas with matching fields, status, and timestamp.", badge_high),
    ("SYNC-02", "SQLite Local Persistence", 
     "1. Inspect SQLite dropzyy.db.<br/>2. Verify users, products, suppliers, orders tables.",
     "Relational integrity intact with proper foreign keys and timestamps.", badge_high),
    ("SYNC-03", "Offline Database Fallback", 
     "1. Temporarily disrupt internet connection.<br/>2. Browse catalog and place local test order.",
     "App falls back gracefully to SQLite/localStorage without white-screen crash.", badge_med)
]
elements.append(make_test_table(m5_tests))

doc.build(elements)
print(f"Successfully generated: {os.path.abspath(pdf_path)}")
