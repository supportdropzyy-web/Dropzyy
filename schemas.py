"""
Dropzyy 1 - Pydantic Validation Schemas
"""
from typing import Optional, List
from pydantic import BaseModel

# Auth Schemas
class SendOTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ForgotPasswordOTPRequest(BaseModel):
    email: str

class ForgotPasswordResetRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class UserRegister(BaseModel):
    email: Optional[str] = None
    otp: Optional[str] = None
    password: str
    full_name: str
    phone: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = "customer" # 'customer', 'supplier', 'admin'
    supplier_company_name: Optional[str] = None

class UserLogin(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: str

class UserResponse(BaseModel):
    id: int
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: str
    role: str
    supplier_company_name: Optional[str] = None
    phone: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    is_verified: Optional[bool] = True
    store_open: Optional[bool] = True
    open_time: Optional[str] = "08:00 AM"
    close_time: Optional[str] = "10:00 PM"
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"

    class Config:
        from_attributes = True

class SupplierTimingsUpdate(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    open_time: str
    close_time: str
    store_open: bool

class UserUpdateAddress(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    phone: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None

# Supplier Schemas
class SupplierCreate(BaseModel):
    name: str
    contact_person: Optional[str] = ""
    phone: Optional[str] = ""
    city: Optional[str] = ""

class SupplierResponse(BaseModel):
    id: int
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    city: Optional[str]

    class Config:
        from_attributes = True

# Product Schemas
class ProductCreate(BaseModel):
    title: str
    category: str
    price: float
    original_price: float
    unit: str
    image: str
    badge: Optional[str] = "Fresh Produce"
    discount: Optional[str] = "10% OFF"
    description: Optional[str] = ""
    nutrition: Optional[str] = ""
    supplier_name: Optional[str] = "Dropzyy Direct Mandi"
    supplier_company_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_user_id: Optional[str] = None
    is_online: Optional[bool] = True

class ProductResponse(BaseModel):
    id: str
    title: str
    category: str
    price: float
    original_price: float
    unit: str
    rating: float
    reviews_count: int
    image: str
    badge: str
    discount: str
    description: Optional[str]
    nutrition: Optional[str]
    supplier_name: Optional[str] = "Dropzyy Direct Mandi"
    supplier_company_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_user_id: Optional[str] = None
    is_online: Optional[bool] = True

    class Config:
        from_attributes = True

# Order Schemas
class OrderCreate(BaseModel):
    id: str
    userId: Optional[str] = None
    date: str
    status: Optional[str] = "Placed"
    total: float
    delivery: Optional[dict] = None
    items: List[dict] = []

class OrderStatusUpdate(BaseModel):
    status: str

class OrderResponse(BaseModel):
    id: str
    userId: Optional[str] = None
    date: str
    status: str
    total: float
    delivery: Optional[dict] = None
    items: List[dict] = []

    class Config:
        from_attributes = True

# Cart Schemas
class CartItemCreate(BaseModel):
    user_id: str
    product_id: str
    quantity: Optional[int] = 1

class CartItemUpdate(BaseModel):
    quantity: int

class CartItemResponse(BaseModel):
    id: int
    user_id: str
    product_id: str
    quantity: int

    class Config:
        from_attributes = True

# Wishlist Schemas
class WishlistToggle(BaseModel):
    user_id: str
    product_id: str

class WishlistResponse(BaseModel):
    id: int
    user_id: str
    product_id: str

    class Config:
        from_attributes = True

# Coupon Schemas
class CouponCreate(BaseModel):
    code: str
    discount_percent: float
    min_order: Optional[float] = 0.0
    description: Optional[str] = ""
    is_active: Optional[bool] = True

class CouponResponse(BaseModel):
    id: int
    code: str
    discount_percent: float
    min_order: float
    description: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True

# Location Schemas
class LocationCreate(BaseModel):
    city: str
    pincode: str
    delivery_time: Optional[str] = "15 Mins"

class LocationResponse(BaseModel):
    id: int
    city: str
    pincode: str
    delivery_time: str

    class Config:
        from_attributes = True

# Category Schemas
class CategoryCreate(BaseModel):
    code: str
    name: str
    icon: Optional[str] = "fa-solid fa-layer-group"

class CategoryResponse(BaseModel):
    id: int
    code: str
    name: str
    icon: str

    class Config:
        from_attributes = True

# Refund Claim Schemas
class RefundClaimCreate(BaseModel):
    email: str
    order_id: str
    reason: str
    upi_id: Optional[str] = None
    details: str

class RefundClaimResponse(BaseModel):
    id: str
    email: str
    order_id: str
    reason: str
    upi_id: Optional[str] = None
    details: str
    status: str

    class Config:
        from_attributes = True

# Supplier Availability Calendar Schemas
class SupplierAvailabilitySet(BaseModel):
    supplier_user_id: int
    date: str          # YYYY-MM-DD
    is_open: bool

class SupplierAvailabilityResponse(BaseModel):
    id: int
    supplier_user_id: int
    date: str
    is_open: bool

    class Config:
        from_attributes = True
