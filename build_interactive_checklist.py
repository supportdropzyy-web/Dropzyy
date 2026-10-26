import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, Flowable, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

pdf_filename = "Dropzyy_Interactive_QA_Checklist.pdf"

# -------------------------------------------------------------------------
# CUSTOM INTERACTIVE ACROFORM FLOWABLES (TICKMARK CHECKBOX & TEXTFIELD)
# -------------------------------------------------------------------------
class InteractiveCheckbox(Flowable):
    def __init__(self, name, size=11, is_pass=True, tooltip=""):
        super().__init__()
        self.name = name
        self.size = size
        self.is_pass = is_pass
        self.tooltip = tooltip
        self.width = size + 4
        self.height = size + 4

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        border_col = colors.HexColor('#059669') if self.is_pass else colors.HexColor('#DC2626')
        text_col   = colors.HexColor('#065F46') if self.is_pass else colors.HexColor('#991B1B')
        self.canv.acroForm.checkbox(
            name=self.name,
            tooltip=self.tooltip or ("Mark Passed" if self.is_pass else "Mark Failed"),
            checked=False,
            x=1,
            y=1,
            size=self.size,
            buttonStyle='check',
            borderStyle='solid',
            borderWidth=1.2,
            borderColor=border_col,
            fillColor=colors.HexColor('#FFFFFF'),
            textColor=text_col
        )
        self.canv.restoreState()

class InteractiveTextField(Flowable):
    def __init__(self, name, width=70, height=14, default_val="", tooltip=""):
        super().__init__()
        self.name = name
        self.width = width
        self.height = height
        self.default_val = default_val
        self.tooltip = tooltip

    def wrap(self, availWidth, availHeight):
        return self.width, self.height

    def draw(self):
        self.canv.saveState()
        self.canv.acroForm.textfield(
            name=self.name,
            value=self.default_val,
            tooltip=self.tooltip or "Type tester notes or defect ID",
            x=0,
            y=1,
            width=self.width,
            height=self.height,
            fontSize=7.5,
            borderStyle='solid',
            borderWidth=0.7,
            borderColor=colors.HexColor('#CBD5E1'),
            fillColor=colors.HexColor('#FFFFFF'),
            textColor=colors.HexColor('#0F172A')
        )
        self.canv.restoreState()

# -------------------------------------------------------------------------
# DOCUMENT SETUP & STYLING
# -------------------------------------------------------------------------
doc = SimpleDocTemplate(
    pdf_filename,
    pagesize=letter,
    leftMargin=26,
    rightMargin=26,
    topMargin=26,
    bottomMargin=26
)

styles = getSampleStyleSheet()

primary_color = colors.HexColor("#0F172A")    # Slate 900
emerald_color = colors.HexColor("#10B981")    # Emerald 500
dark_emerald  = colors.HexColor("#065F46")    # Emerald 800
border_color  = colors.HexColor("#CBD5E1")    # Slate 300

title_style = ParagraphStyle(
    'DocTitle',
    parent=styles['Heading1'],
    fontSize=18,
    leading=22,
    textColor=primary_color,
    fontName="Helvetica-Bold",
    spaceAfter=3
)

subtitle_style = ParagraphStyle(
    'DocSubTitle',
    parent=styles['Normal'],
    fontSize=9.5,
    leading=13,
    textColor=colors.HexColor("#475569"),
    spaceAfter=8
)

h1_style = ParagraphStyle(
    'SectionH1',
    parent=styles['Heading2'],
    fontSize=11,
    leading=14,
    textColor=dark_emerald,
    fontName="Helvetica-Bold",
    spaceBefore=10,
    spaceAfter=4
)

cell_body = ParagraphStyle(
    'CellBody',
    parent=styles['Normal'],
    fontSize=7.8,
    leading=10,
    textColor=colors.HexColor("#1E293B")
)

cell_bold = ParagraphStyle(
    'CellBold',
    parent=styles['Normal'],
    fontSize=7.8,
    leading=10,
    fontName="Helvetica-Bold",
    textColor=colors.HexColor("#0F172A")
)

header_style = ParagraphStyle(
    'HeaderStyle',
    parent=styles['Normal'],
    fontSize=8,
    leading=10,
    fontName="Helvetica-Bold",
    textColor=colors.HexColor("#0F172A")
)

elements = []

# Title & Banner
elements.append(Paragraph("Dropzyy 1.0 — QA Tester Interactive Verification Checklist", title_style))
elements.append(Paragraph("<b>Fillable Digital AcroForm PDF:</b> Testers can click checkboxes to tickmark Pass/Fail and type notes directly in this document.", subtitle_style))
elements.append(HRFlowable(width="100%", thickness=1.5, color=emerald_color, spaceBefore=0, spaceAfter=8))

# Tester Details Form Box
header_box_data = [
    [
        Paragraph("<b>Tester Name:</b>", cell_bold),
        InteractiveTextField("qa_tester_name", width=120, height=14, tooltip="Enter QA Tester full name"),
        Paragraph("<b>Test Date:</b>", cell_bold),
        InteractiveTextField("qa_test_date", width=80, height=14, default_val="2026-09-30", tooltip="Enter date of testing"),
        Paragraph("<b>Target URL:</b>", cell_bold),
        InteractiveTextField("qa_target_url", width=110, height=14, default_val="http://127.0.0.1:8000", tooltip="App URL"),
    ],
    [
        Paragraph("<b>Environment:</b>", cell_bold),
        Paragraph("FastAPI + Mongo Atlas + SQLite", cell_body),
        Paragraph("<b>Result:</b>", cell_bold),
        Table([
            [
                InteractiveCheckbox("overall_pass", size=10, is_pass=True),
                Paragraph("<font color='#059669'><b>PASSED</b></font>", cell_body),
                InteractiveCheckbox("overall_fail", size=10, is_pass=False),
                Paragraph("<font color='#DC2626'><b>FAILED</b></font>", cell_body),
            ]
        ], colWidths=[14, 45, 14, 45]),
        Paragraph("<b>Sign-off:</b>", cell_bold),
        InteractiveTextField("qa_signoff", width=110, height=14, tooltip="QA Lead Signature / Notes")
    ]
]

t_header = Table(header_box_data, colWidths=[65, 130, 60, 110, 65, 130])
t_header.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F8FAFC")),
    ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#94A3B8")),
    ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#E2E8F0")),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('TOPPADDING', (0,0), (-1,-1), 3),
    ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ('LEFTPADDING', (0,0), (-1,-1), 5),
    ('RIGHTPADDING', (0,0), (-1,-1), 5),
]))
elements.append(t_header)
elements.append(Spacer(1, 8))

# Embed Workflow Diagram
img_path = r"C:\Users\lalkr\.gemini\antigravity\brain\25e213cc-2016-4a3a-be1e-fd5c5c5bcf72\qa_test_dashboard_1790744471015.jpg"
if os.path.exists(img_path):
    elements.append(Image(img_path, width=7.6*inch, height=3.4*inch))
    elements.append(Spacer(1, 6))

# Helper to construct interactive checklist tables
def create_interactive_test_table(rows):
    table_data = []
    # Header Row
    table_data.append([
        Paragraph("<b>ID & Pri.</b>", header_style),
        Paragraph("<b>Scenario / Scope</b>", header_style),
        Paragraph("<b>Execution Steps</b>", header_style),
        Paragraph("<b>Expected Criteria</b>", header_style),
        Paragraph("<font color='#059669'><b>PASS</b></font>", header_style),
        Paragraph("<font color='#DC2626'><b>FAIL</b></font>", header_style),
        Paragraph("<b>Defect / Notes</b>", header_style),
    ])

    for r in rows:
        cid, pri, title, steps, expected = r
        p_badge = f"<font color='{'#DC2626' if pri=='CRIT' else '#D97706'}'><b>[{pri}]</b></font>"
        table_data.append([
            Paragraph(f"<b>{cid}</b><br/>{p_badge}", cell_body),
            Paragraph(f"<b>{title}</b>", cell_bold),
            Paragraph(steps, cell_body),
            Paragraph(expected, cell_body),
            InteractiveCheckbox(f"pass_{cid.lower().replace('-','_')}", size=11, is_pass=True),
            InteractiveCheckbox(f"fail_{cid.lower().replace('-','_')}", size=11, is_pass=False),
            InteractiveTextField(f"note_{cid.lower().replace('-','_')}", width=68, height=13)
        ])

    col_widths = [45, 95, 160, 160, 24, 24, 72]
    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#F1F5F9")),
        ('GRID', (0,0), (-1,-1), 0.5, border_color),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (4,0), (5,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
    ]))
    return t

# -------------------------------------------------------------------------
# MODULE 1: AUTHENTICATION, RBAC & SECURITY
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 1: Authentication, Role-Based Access Control (RBAC) & Security", h1_style))
m1 = [
    ("AUTH-01", "CRIT", "Customer Registration & OTP", 
     "1. Click Sign In -> Register.<br/>2. Enter valid email -> Send OTP.<br/>3. Enter 6-digit OTP & password.",
     "OTP received. Account created in SQLite and MongoDB Atlas dropzyy.users."),
    ("AUTH-02", "CRIT", "Supplier Login & Portal", 
     "1. Sign in with supplier credentials.<br/>2. Verify dashboard view.",
     "JWT Bearer token assigned. Redirected to Supplier Dashboard with operating hours & calendar."),
    ("AUTH-03", "CRIT", "Admin RBAC Barrier", 
     "1. Login as regular customer.<br/>2. Try navigating to /api/admin/users or opening Admin view.",
     "Blocked with HTTP 403 Forbidden. Regular customer cannot access administrative views."),
    ("AUTH-04", "HIGH", "Rate Limiter & Headers", 
     "1. Inspect response headers in DevTools.<br/>2. Submit 12 failed login attempts rapidly.",
     "X-Content-Type-Options: nosniff present. 11th request triggers HTTP 429 Too Many Requests.")
]
elements.append(create_interactive_test_table(m1))
elements.append(Spacer(1, 6))

# -------------------------------------------------------------------------
# MODULE 2: OPERATING HOURS & LIVE SCHEDULING
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 2: Restaurant Operating Hours & Live Scheduling", h1_style))
m2 = [
    ("SCHED-01", "CRIT", "Operating Hours (In-Hours)", 
     "1. Supplier sets hours (e.g. 08:00 AM - 10:00 PM).<br/>2. View restaurant during these hours.",
     "Displays green 'OPEN NOW' pill. Dashboard displays 'Store is OPEN'. Cart accepts orders."),
    ("SCHED-02", "CRIT", "Operating Hours (Outside-Hours)", 
     "1. Set closing time 1 hour prior to current time.<br/>2. Refresh catalog view.",
     "Automatically displays red 'CLOSED' pill with 'Opens at ...'. Add to Cart is disabled."),
    ("SCHED-03", "HIGH", "Overnight Hours Support", 
     "1. Set hours 08:00 PM to 02:00 AM.<br/>2. Test at 11:00 PM and at 03:00 AM.",
     "Correctly identified as OPEN at 11:00 PM, and automatically CLOSED at 03:00 AM.")
]
elements.append(create_interactive_test_table(m2))
elements.append(Spacer(1, 6))

# -------------------------------------------------------------------------
# MODULE 3: AVAILABILITY CALENDAR SCHEDULING
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 3: Restaurant Availability Calendar Scheduling", h1_style))
m3 = [
    ("CAL-01", "CRIT", "Mark Specific Date CLOSED", 
     "1. Open Supplier Calendar.<br/>2. Select today's date -> Click 'Mark as CLOSED'.",
     "Date turns red. Store immediately turns 'Closed today (Calendar schedule) 📅🔴'."),
    ("CAL-02", "CRIT", "Calendar Override Priority", 
     "1. Ensure current time is within operating hours.<br/>2. Mark date CLOSED in calendar.",
     "Calendar closure strictly takes precedence over operating hours. Store remains closed all day."),
    ("CAL-03", "HIGH", "Reset Date to Default", 
     "1. Click closed date -> 'Reset to Default'.<br/>2. Check store status.",
     "Date resets to gray neutral. Store status immediately recalculates based on daily operating hours."),
    ("CAL-04", "CRIT", "Global Customer Availability Sync", 
     "1. Mark store closed via supplier account.<br/>2. Open clean browser as customer.",
     "GET /api/supplier/availability fetches rules. Customer sees closed badge without opening dashboard.")
]
elements.append(create_interactive_test_table(m3))
elements.append(Spacer(1, 6))

# -------------------------------------------------------------------------
# MODULE 4: RESTAURANT & PRODUCT PERMANENT DELETION
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 4: Restaurant Deletion & Catalog Management", h1_style))
m4 = [
    ("DEL-01", "CRIT", "Admin Delete Restaurant", 
     "1. Admin clicks 'Delete' on partner restaurant card.<br/>2. Confirm dialog prompt.",
     "DELETE /api/restaurants/{id}?store_name={name} returns 200. Deleted from SQLite & MongoDB Atlas."),
    ("DEL-02", "CRIT", "Anti-Resurrection Verification", 
     "1. Delete restaurant via Admin.<br/>2. Hard refresh browser (Ctrl + F5).",
     "Restaurant and products DO NOT reappear. Not resurrected from DEFAULT_PRODUCTS or DB cache."),
    ("DEL-03", "HIGH", "Supplier Self-Delete Store", 
     "1. Supplier logs in -> clicks 'Delete Store'.<br/>2. Confirm warning dialog.",
     "Company name cleared, role reverts to customer, all products removed from live catalog."),
    ("DEL-04", "HIGH", "Product Inventory CRUD", 
     "1. Supplier adds product with price & image.<br/>2. Edit price.<br/>3. Delete product.",
     "Instant catalog update on homepage and search. Persists in SQLite and MongoDB Atlas.")
]
elements.append(create_interactive_test_table(m4))
elements.append(Spacer(1, 6))

# -------------------------------------------------------------------------
# MODULE 5: CART, CHECKOUT, COUPONS & LIVE TRACKING
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 5: Cart, Checkout, Coupon Codes & Order Tracking", h1_style))
m5 = [
    ("ORD-01", "CRIT", "Cart Line Items & Quantities", 
     "1. Add open store items.<br/>2. Increment to 3, decrement to 1, then 0.",
     "Subtotal dynamically recalculates. Decreasing to 0 cleanly removes line item."),
    ("ORD-02", "HIGH", "Coupon Validation (KIRANA10)", 
     "1. Enter coupon 'KIRANA10' -> Apply.<br/>2. Enter invalid code 'FAKE999'.",
     "'KIRANA10' deducts 10% discount. Invalid code displays clear error notification."),
    ("ORD-03", "CRIT", "Order Placement & Invoice PDF", 
     "1. Complete checkout.<br/>2. Confirm order.<br/>3. Click 'Download PDF Invoice'.",
     "Order placed with unique ORD ID. Branded PDF invoice downloads with itemized summary."),
    ("ORD-04", "HIGH", "Order Tracking & Refund Claim", 
     "1. Open 'Booking Tracking & Refund Claims'.<br/>2. File refund claim on order.",
     "Order lifecycle updates (Placed -> Preparing -> Out for Delivery -> Delivered). Refund claim logged for Admin.")
]
elements.append(create_interactive_test_table(m5))
elements.append(Spacer(1, 6))

# -------------------------------------------------------------------------
# MODULE 6: DUAL DATABASE SYNC & EDGE CASES
# -------------------------------------------------------------------------
elements.append(Paragraph("Module 6: Dual Database Sync (MongoDB + SQLite) & Edge Cases", h1_style))
m6 = [
    ("SYNC-01", "CRIT", "MongoDB Atlas Cloud Parity", 
     "1. Add product or place order.<br/>2. Query MongoDB collection dropzyy.products / orders.",
     "Document replicated in MongoDB Atlas with matching fields, status, and UTC timestamp."),
    ("SYNC-02", "HIGH", "SQLite Relational Integrity", 
     "1. Query SQLite dropzyy.db.<br/>2. Check users, products, suppliers, orders tables.",
     "Foreign key constraints and data types strictly valid."),
    ("EDGE-01", "HIGH", "Closed Store Order Prevention", 
     "1. Navigate to a closed restaurant.<br/>2. Attempt to add item or force checkout.",
     "UI shows closed notice; checkout action blocked until store reopens."),
    ("EDGE-02", "MED", "Session Expiry Handling", 
     "1. Clear sessionStorage dropzyy_user.<br/>2. Trigger protected API request.",
     "Handled gracefully with redirect to login or fallback to customer guest mode.")
]
elements.append(create_interactive_test_table(m6))

# Build Document
doc.build(elements)
print(f"[SUCCESS] Generated Fillable QA Checklist PDF: {os.path.abspath(pdf_filename)}")
