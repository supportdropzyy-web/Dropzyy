"""
Dropzyy 1 - Pydantic Validation Schemas
"""
from typing import Optional, List, Union, Any, Dict
from pydantic import BaseModel, Field

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
    new_password: str = Field(..., min_length=6, description="Password must be at least 6 characters (characters, numbers and symbols allowed)")

class UserRegister(BaseModel):
    email: Optional[str] = None
    otp: Optional[str] = None
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters (characters, numbers and symbols allowed)")
    full_name: str
    phone: Optional[str] = None
    username: Optional[str] = None
    role: Optional[str] = "customer" # 'customer', 'supplier', 'admin'
    supplier_company_name: Optional[str] = None
    city: Optional[str] = None

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
    banner_image: Optional[str] = None
    menu_card_image: Optional[str] = None
    access_token: Optional[str] = None
    token_type: Optional[str] = "bearer"

    class Config:
        from_attributes = True

class AdminUserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None # 'customer', 'supplier', 'admin'
    phone: Optional[str] = None
    supplier_company_name: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    banner_image: Optional[str] = None
    menu_card_image: Optional[str] = None
    store_open: Optional[bool] = None
    open_time: Optional[str] = None
    close_time: Optional[str] = None

class SupplierStoreImagesUpdate(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    banner_image: Optional[str] = None
    menu_card_image: Optional[str] = None

class SupplierTimingsUpdate(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
    open_time: str
    close_time: str
    store_open: bool
    city: Optional[str] = None

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
    supplier_id: Optional[Union[int, str]] = None
    supplier_user_id: Optional[Union[str, int]] = None
    is_online: Optional[bool] = True
    variants: Optional[List[Dict[str, Any]]] = None
    food_type: Optional[str] = None

class ProductResponse(BaseModel):
    id: str
    title: str
    category: str
    price: float
    original_price: float
    unit: str
    rating: float = 4.8
    reviews_count: int = 100
    image: str
    badge: str = "Fresh"
    discount: str = "10% OFF"
    description: Optional[str] = ""
    nutrition: Optional[str] = ""
    supplier_name: Optional[str] = "Dropzyy Direct Mandi"
    supplier_company_name: Optional[str] = None
    supplier_id: Optional[Union[int, str]] = None
    supplier_user_id: Optional[Union[str, int]] = None
    is_online: Optional[bool] = True
    variants: Optional[List[Dict[str, Any]]] = None
    food_type: Optional[str] = None

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
    cancelled_by: Optional[str] = None
    cancel_reason: Optional[str] = None
    cancelled_at: Optional[str] = None

class OrderCancelRequest(BaseModel):
    reason: Optional[str] = None
    cancelled_by: Optional[str] = None

class OrderResponse(BaseModel):
    id: str
    userId: Optional[str] = None
    date: str
    status: str
    total: float
    delivery: Optional[dict] = None
    items: List[dict] = []
    cancelled_by: Optional[str] = None
    cancel_reason: Optional[str] = None
    cancelled_at: Optional[str] = None

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
    discount_type: Optional[str] = "flat"  # "flat" (direct price e.g. ₹20, ₹30) or "percent" (%)
    discount_value: float = 0.0            # ₹ discount or % discount
    discount_percent: Optional[float] = 0.0 # for backward compatibility
    min_order: Optional[float] = 0.0       # 0 for every order, or 300, 400 etc.
    usage_limit: Optional[str] = "unlimited"  # "once_per_user" or "unlimited"
    target: Optional[str] = "everyone"     # "everyone" or "user"
    target_user: Optional[str] = ""
    description: Optional[str] = ""
    is_active: Optional[bool] = True

class CouponResponse(BaseModel):
    id: Union[int, str]
    code: str
    discount_type: Optional[str] = "percent"
    discount_value: Optional[float] = 0.0
    discount_percent: Optional[float] = 0.0
    min_order: Optional[float] = 0.0
    usage_limit: Optional[str] = "unlimited"
    used_by: Optional[List[str]] = []
    target: Optional[str] = "everyone"
    target_user: Optional[str] = ""
    description: Optional[str] = ""
    is_active: bool = True

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
    created_by_supplier: Optional[str] = None

class CategoryResponse(BaseModel):
    id: int
    code: str
    name: str
    icon: str
    created_by_supplier: Optional[str] = None

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

# Visitor Analytics Schemas
class VisitorRecordRequest(BaseModel):
    visitor_id: Optional[str] = None
    page: Optional[str] = "/"
    device: Optional[str] = "Desktop"
    city: Optional[str] = None

class VisitorRecordResponse(BaseModel):
    status: str
    date: str
    visitor_id: Optional[str] = None

# Delivery & Free Shipping Settings Schemas
class DeliverySettingsUpdate(BaseModel):
    free_delivery_threshold: float = 300.0
    standard_delivery_fee: float = 30.0
    is_free_delivery_enabled: bool = True
    charge_type: str = "threshold" # 'threshold', 'fixed', 'free'
    min_order_value: float = 50.0
    description: Optional[str] = None

class DeliverySettingsResponse(BaseModel):
    id: Optional[int] = 1
    free_delivery_threshold: float = 300.0
    standard_delivery_fee: float = 30.0
    is_free_delivery_enabled: bool = True
    charge_type: str = "threshold"
    min_order_value: float = 50.0
    description: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True

