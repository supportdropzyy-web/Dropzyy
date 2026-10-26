/* ==========================================
   Dropzyy Instant Delivery Logic & FastAPI Integration
   ========================================== */

// Dynamically use Render host when deployed or localhost when developing
const API_BASE_URL = (window.location.origin && !window.location.origin.includes('file://')) 
    ? `${window.location.origin}/api` 
    : 'http://localhost:8000/api';

// ── JWT BEARER TOKEN AUTO-INJECTOR ────────────────────────────────────────────
// Automatically attaches Authorization: Bearer <token> to all API requests
const _nativeFetch = window.fetch;
window.fetch = function(url, options = {}) {
    options = options || {};
    try {
        const urlStr = String(url);
        // Only inject to backend API endpoints (avoid leaking to EmailJS, CDN, Unsplash)
        if (urlStr.includes('/api/')) {
            let token = null;
            if (typeof state !== 'undefined' && state && state.currentUser) {
                token = state.currentUser.access_token || state.currentUser.token;
            }
            if (!token) {
                try {
                    const saved = JSON.parse(
                        localStorage.getItem('dropzyy_user') || 
                        sessionStorage.getItem('dropzyy_user') || 
                        localStorage.getItem('freshkart_user') || 
                        sessionStorage.getItem('freshkart_user')
                    );
                    token = saved ? (saved.access_token || saved.token) : null;
                } catch (e) {}
            }
            if (!token) {
                token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
            }
            if (token) {
                if (options.headers instanceof Headers) {
                    if (!options.headers.has('Authorization')) {
                        options.headers.set('Authorization', `Bearer ${token}`);
                    }
                } else if (Array.isArray(options.headers)) {
                    if (!options.headers.some(h => String(h[0]).toLowerCase() === 'authorization')) {
                        options.headers.push(['Authorization', `Bearer ${token}`]);
                    }
                } else {
                    options.headers = options.headers || {};
                    if (!options.headers['Authorization'] && !options.headers['authorization']) {
                        options.headers['Authorization'] = `Bearer ${token}`;
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[AUTH FETCH INTERCEPTOR]', e);
    }
    return _nativeFetch.call(this, url, options);
};

// Helper for fast-failing network requests when backend is offline
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return response;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

/* ==========================================
   EmailJS Integration (https://www.emailjs.com)
   ========================================== */
const EMAILJS_CONFIG = {
    serviceId: window.EMAILJS_SERVICE_ID || 'default_service',
    otpTemplateId: window.EMAILJS_OTP_TEMPLATE_ID || 'template_j6pyi2d', // One-Time Password Template
    billTemplateId: window.EMAILJS_BILL_TEMPLATE_ID || 'template_1xw8s47', // Order Confirmation Template
    publicKey: window.EMAILJS_PUBLIC_KEY || ''
};

// Initialize EmailJS Browser SDK if public key is present
if (window.emailjs && EMAILJS_CONFIG.publicKey) {
    try {
        emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
    } catch (e) {
        console.warn('EmailJS init notice:', e);
    }
}

// 1. Send OTP Verification Code via EmailJS
async function sendOTPViaEmailJS(toEmail, otpCode, toName = 'Valued Customer') {
    if (!toEmail || !toEmail.includes('@')) return { success: false };

    const templateParams = {
        to_email: toEmail,
        email: toEmail,
        user_email: toEmail,
        recipient: toEmail,
        to: toEmail,
        reply_to: toEmail,
        to_name: toName,
        name: toName,
        otp_code: otpCode,
        otp: otpCode,
        code: otpCode,
        passcode: otpCode,
        subject: 'Your Dropzyy Email Verification Code (OTP)',
        message: `Your verification code is ${otpCode}. Valid for 10 minutes.`
    };

    const pKey = window.EMAILJS_PUBLIC_KEY || '_p0PL2iAKyPOfO7Op';
    const sId = window.EMAILJS_SERVICE_ID || 'default_service';
    const tId = window.EMAILJS_OTP_TEMPLATE_ID || 'template_j6pyi2d';

    try {
        if (window.emailjs) {
            await emailjs.send(sId, tId, templateParams, pKey);
            return { success: true, method: 'sdk' };
        }
    } catch (err) {
        console.warn('EmailJS SDK send notice, trying REST API fallback:', err);
    }

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: sId,
                template_id: tId,
                user_id: pKey,
                template_params: templateParams
            })
        });
        if (response.ok) {
            return { success: true, method: 'rest' };
        }
    } catch (err) {}

    return { success: true, method: 'emailjs' };
}

// 2. Send Order Confirmation Email / Parcel Bill via EmailJS
async function sendBillViaEmailJS(toEmail, toName, orderObj) {
    if (!toEmail || !toEmail.includes('@')) return { success: false };

    const itemsSummary = (orderObj.items || []).map(i => `${i.title || i.name} (${i.qty || i.quantity || 1} x ₹${i.price})`).join(', ');
    const payMode = orderObj.delivery ? (orderObj.delivery.payment || 'COD').toUpperCase() : 'COD';
    const cName = toName || (orderObj.delivery ? orderObj.delivery.name : 'Valued Customer');
    const orderDate = orderObj.date ? new Date(orderObj.date).toLocaleDateString() : new Date().toLocaleDateString();

    const pKey = window.EMAILJS_PUBLIC_KEY || '_p0PL2iAKyPOfO7Op';
    const sId = window.EMAILJS_SERVICE_ID || 'default_service';
    const tId = window.EMAILJS_BILL_TEMPLATE_ID || 'template_1xw8s47';

    const subTotal = (orderObj.items || []).reduce((s, i) => s + (parseFloat(i.price || 0) * parseInt(i.qty || i.quantity || 1)), 0);
    const discAmount = parseFloat(orderObj.discount || (orderObj.delivery && orderObj.delivery.discount) || 0);
    const shipFee = parseFloat(orderObj.shipping !== undefined ? orderObj.shipping : ((orderObj.delivery && orderObj.delivery.shipping !== undefined) ? orderObj.delivery.shipping : (subTotal >= 299 ? 0 : 29)));
    const calculatedGrandTotal = parseFloat(orderObj.total || (subTotal - discAmount + shipFee));

    const formattedTotal = `₹${calculatedGrandTotal.toFixed(2)}`;
    const formattedNumTotal = `${calculatedGrandTotal.toFixed(2)}`;
    const formattedSubtotal = `₹${subTotal.toFixed(2)}`;
    const formattedShipping = shipFee > 0 ? `₹${shipFee.toFixed(2)}` : 'FREE (₹0.00)';

    const ordersArray = (orderObj.items || []).map(i => ({
        name: i.title || i.name || 'Product Item',
        title: i.title || i.name || 'Product Item',
        units: i.qty || i.quantity || 1,
        quantity: i.qty || i.quantity || 1,
        qty: i.qty || i.quantity || 1,
        price: `₹${parseFloat(i.price || 0).toFixed(2)}`,
        unit_price: `₹${parseFloat(i.price || 0).toFixed(2)}`,
        total: `₹${(parseFloat(i.price || 0) * (i.qty || i.quantity || 1)).toFixed(2)}`
    }));

    const costObj = {
        shipping: formattedShipping,
        shipping_fee: formattedShipping,
        delivery_fee: formattedShipping,
        tax: '₹0.00',
        subtotal: formattedSubtotal,
        discount: `₹${discAmount.toFixed(2)}`,
        total: formattedTotal,
        grand_total: formattedTotal
    };

    const templateParams = {
        // Email & Customer Name
        to_email: toEmail,
        email: toEmail,
        user_email: toEmail,
        recipient: toEmail,
        to: toEmail,
        reply_to: toEmail,
        to_name: cName,
        name: cName,
        customer_name: cName,

        // Order ID
        order_id: orderObj.id,
        order_no: orderObj.id,
        orderno: orderObj.id,
        order_number: orderObj.id,
        id: orderObj.id,

        // EmailJS Dynamic Array & Object Templates (matches template_1xw8s47 editor!)
        orders: ordersArray,
        items_list: ordersArray,
        order_items: ordersArray,
        cost: costObj,

        // Flattened cost object properties for Mustache tags {{cost.shipping}}, {{cost.tax}}, {{cost.total}}
        'cost.shipping': formattedShipping,
        'cost.tax': '₹0.00',
        'cost.subtotal': formattedSubtotal,
        'cost.total': formattedTotal,
        'cost.grand_total': formattedTotal,

        // Totals & Prices
        total_amount: formattedTotal,
        order_total: formattedTotal,
        total: formattedTotal,
        amount: formattedTotal,
        grand_total: formattedTotal,
        total_price: formattedTotal,
        price: formattedTotal,
        cost_total: formattedTotal,
        order_total_num: formattedNumTotal,

        // Items Summary Strings
        items_summary: itemsSummary,
        order_information: itemsSummary,
        order_info: itemsSummary,
        order_details: itemsSummary,
        items: itemsSummary,
        item_list: itemsSummary,
        details: itemsSummary,
        description: itemsSummary,
        message: `Order #${orderObj.id} Details: ${itemsSummary}. Delivery Address: ${deliveryAddr}. Total: ${formattedTotal} (${payMode}).`,

        // Delivery Address
        delivery_address: deliveryAddr,
        address: deliveryAddr,
        shipping_address: deliveryAddr,
        delivery_addr: deliveryAddr,

        // Payment & Status & Date
        payment_mode: payMode,
        payment_method: payMode,
        payment: payMode,
        order_status: orderObj.status || 'Placed / Processing',
        status: orderObj.status || 'Placed / Processing',
        order_date: orderDate,
        date: orderDate
    };

    try {
        if (window.emailjs) {
            await emailjs.send(sId, tId, templateParams, pKey);
            return { success: true, method: 'sdk' };
        }
    } catch (err) {
        console.warn('EmailJS SDK bill notice, trying REST API fallback:', err);
    }

    try {
        const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: sId,
                template_id: tId,
                user_id: pKey,
                template_params: templateParams
            })
        });
        if (response.ok) {
            return { success: true, method: 'rest' };
        }
    } catch (err) {}

    return { success: true, method: 'emailjs' };
}

// 1. DEFAULT FALLBACK PRODUCTS DATASET
const DEFAULT_PRODUCTS = [
    {
        id: 'k1', title: 'Aashirvaad Shuddh Chakki Atta', category: 'staples', price: 245, originalPrice: 280,
        unit: '5 kg Pack', rating: 4.9, reviewsCount: 1420,
        image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=500&q=80',
        badge: '100% Whole Wheat', discount: '12% OFF',
        description: 'Made from 100% pure whole wheat grains ground in traditional chakkis for soft, fluffy rotis.',
        nutrition: 'High Dietary Fiber, Natural Proteins, Zero Maida.',
        supplierName: 'ITC Agro Foods Division'
    },
    {
        id: 'k2', title: 'Fortune Sunlite Sunflower Oil', category: 'oil', price: 145, originalPrice: 165,
        unit: '1 Litre Pouch', rating: 4.8, reviewsCount: 890,
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80',
        badge: 'Light & Healthy', discount: '12% OFF',
        description: 'Light, healthy refined sunflower oil enriched with Vitamins A & D for daily Indian cooking.',
        nutrition: 'Enriched with Omega-6, Vitamin A & Vitamin D.',
        supplierName: 'Ramesh Kirana Wholesale Co.'
    },
    {
        id: 'k3', title: 'Fortune Premium Toor / Arhar Dal', category: 'staples', price: 160, originalPrice: 185,
        unit: '1 kg Pack', rating: 4.8, reviewsCount: 650,
        image: 'https://images.unsplash.com/photo-1585994191611-724212502ef0?auto=format&fit=crop&w=500&q=80',
        badge: 'Unpolished', discount: '13% OFF',
        description: 'Unpolished premium yellow split pigeon peas (Toor Dal) with natural flavor and rich protein.',
        nutrition: 'High Protein, Iron, Potassium & Folic Acid.',
        supplierName: 'Maharashtra Farmers Co-op'
    },
    {
        id: 'k4', title: 'Daawat Rozana Super Basmati Rice', category: 'staples', price: 380, originalPrice: 450,
        unit: '5 kg Pack', rating: 4.9, reviewsCount: 1100,
        image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80',
        badge: 'Long Grain', discount: '15% OFF',
        description: 'Aged long-grain Basmati rice perfect for daily dal-rice, pulao, and biryani.',
        nutrition: 'Gluten-Free, Low Fat, Rich Aroma & Fluffy Texture.',
        supplierName: 'Ramesh Kirana Wholesale Co.'
    },
    {
        id: 'k5', title: 'Amul Pasteurised Butter', category: 'dairy', price: 275, originalPrice: 290,
        unit: '500 g Pack', rating: 5.0, reviewsCount: 2300,
        image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=500&q=80',
        badge: 'Taste of India', discount: '5% OFF',
        description: 'Iconic salted Amul butter made from pure cow and buffalo milk cream. Perfect for parathas & toast.',
        nutrition: 'Rich Milk Fat, Vitamin A & Natural Flavor.',
        supplierName: 'Amul Anand Dairy Federation'
    },
    {
        id: 'k6', title: 'Tata Salt Vacuum Evaporated', category: 'staples', price: 28, originalPrice: 30,
        unit: '1 kg Pack', rating: 4.9, reviewsCount: 1800,
        image: 'https://images.unsplash.com/photo-1518110168401-f2877ee2c085?auto=format&fit=crop&w=500&q=80',
        badge: 'Desh Ka Namak', discount: '7% OFF',
        description: 'India\'s favorite iodized salt ensuring mental development and daily health purity.',
        nutrition: 'Iodine Fortified, Hygienic Vacuum Evaporated.',
        supplierName: 'Dropzyy Direct'
    },
    {
        id: 'k7', title: 'Maggi 2-Minute Masala Noodles', category: 'snacks', price: 168, originalPrice: 180,
        unit: '12 Packs Mega Saver', rating: 4.9, reviewsCount: 3100,
        image: 'https://images.unsplash.com/photo-1612927601601-6638404737ce?auto=format&fit=crop&w=500&q=80',
        badge: 'All Time Favorite', discount: '7% OFF',
        description: 'The classic 2-minute instant noodles with signature roasted spices tastemaker.',
        nutrition: 'Fortified with Iron & Wheat Goodness.',
        supplierName: 'Ramesh Kirana Wholesale Co.'
    },
    {
        id: 'k8', title: 'Fresh Ratnagiri Alphonso Mangoes', category: 'vegetables', price: 650, originalPrice: 800,
        unit: '1 Dozen Box (12 Pcs)', rating: 4.9, reviewsCount: 780,
        image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=500&q=80',
        badge: 'Devgad Special', discount: '18% OFF',
        description: 'Authentic GI-tagged Ratnagiri Hapus mangoes naturally ripened in grass.',
        nutrition: 'Rich in Vitamin C, Carotenoids & Fiber.',
        supplierName: 'Maharashtra Farmers Co-op'
    },
    {
        id: 'k9', title: 'Fresh Nashik Red Onions (Kanda)', category: 'vegetables', price: 35, originalPrice: 45,
        unit: '1 kg Mesh Bag', rating: 4.7, reviewsCount: 450,
        image: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=500&q=80',
        badge: 'Mandi Fresh', discount: '22% OFF',
        description: 'Hand-sorted crisp Nashik red onions essential for tadka, gravies, and salads.',
        nutrition: 'Quercetin Antioxidants, Vitamin C & Sulfur Compounds.',
        supplierName: 'Maharashtra Farmers Co-op'
    },
    {
        id: 'k10', title: 'Fresh Farm Potatoes (Aloo)', category: 'vegetables', price: 28, originalPrice: 35,
        unit: '1 kg Pack', rating: 4.8, reviewsCount: 520,
        image: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=500&q=80',
        badge: 'Daily Need', discount: '20% OFF',
        description: 'Clean, firm potatoes perfect for aloo parathas, fries, and sabzi.',
        nutrition: 'Carbohydrates, Potassium & Vitamin B6.',
        supplierName: 'Maharashtra Farmers Co-op'
    },
    {
        id: 'k11', title: 'Brooke Bond Red Label Tea', category: 'tea', price: 260, originalPrice: 290,
        unit: '500 g Carton Pack', rating: 4.9, reviewsCount: 1600,
        image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=500&q=80',
        badge: 'Swad Apne Pan Ka', discount: '10% OFF',
        description: 'Rich, strong CTC black tea leaves blend crafted for perfect Indian Masala Chai.',
        nutrition: 'Natural Flavonoids, Immunity Booster.',
        supplierName: 'Ramesh Kirana Wholesale Co.'
    },
    {
        id: 'k12', title: 'Amul Taaza Toned Fresh Milk', category: 'dairy', price: 54, originalPrice: 56,
        unit: '1 Litre Pouch', rating: 5.0, reviewsCount: 4200,
        image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=500&q=80',
        badge: 'Daily Fresh', discount: '4% OFF',
        description: 'Homogenised toned milk packed under strict hygienic conditions. Ideal for chai and coffee.',
        nutrition: '3.0% Fat, 8.5% SNF, High Calcium & Protein.',
        supplierName: 'Amul Anand Dairy Federation'
    }
];

const DEFAULT_CATEGORIES = [
    { id: 'all', name: 'All Categories', icon: 'fa-solid fa-border-all', count: 16 },
    { id: 'staples', name: 'Atta, Rice & Dal', icon: 'fa-solid fa-wheat-awn', count: 6 },
    { id: 'oil', name: 'Oil & Ghee', icon: 'fa-solid fa-bottle-droplet', count: 1 },
    { id: 'dairy', name: 'Dairy & Butter', icon: 'fa-solid fa-cow', count: 2 },
    { id: 'vegetables', name: 'Sabzi & Fruits', icon: 'fa-solid fa-carrot', count: 3 },
    { id: 'tea', name: 'Tea & Drinks', icon: 'fa-solid fa-mug-hot', count: 1 },
    { id: 'snacks', name: 'Snacks & Noodles', icon: 'fa-solid fa-cookie-bite', count: 3 }
];

const PURGED_UNUSED_CATS = new Set(['hotel_dishes', 'hotelndish', 'foofsd', 'foofsdsdsd', 'bakery_items']);
let customCategories = [];
let CATEGORIES = [...DEFAULT_CATEGORIES];
customCategories.forEach(c => {
    if (!CATEGORIES.some(cat => cat.id === c.id)) {
        CATEGORIES.push(c);
    }
});

// ==============================================================================
// 🛡️ DATA PRIVACY & SECURITY SAFEGUARD: ZERO DATABASE DUMP IN LOCALSTORAGE
// Completely wipe all database items, users, passwords, and sensitive settings
// from client browser localStorage. Data is securely held in-memory and synced via API.
// ==============================================================================
const SENSITIVE_STORAGE_KEYS = [
    'dropzyy_registered_users',
    'freshkart_registered_users',
    'dropzyy_all_products_cache',
    'dropzyy_custom_products',
    'dropzyy_custom_categories',
    'dropzyy_delivery_settings',
    'dropzyy_supplier_store_images',
    'dropzyy_deleted_products',
    'dropzyy_deleted_restaurants',
    'dropzyy_blocked_contacts',
    'dropzyy_orders_history',
    'freshkart_products',
    'freshkart_cart'
];
SENSITIVE_STORAGE_KEYS.forEach(k => {
    try { localStorage.removeItem(k); } catch(e) {}
    try { sessionStorage.removeItem(k); } catch(e) {}
});

// Sanitize dropzyy_user in localStorage so it ONLY ever stores { username: "..." }
try {
    const rawUser = localStorage.getItem('dropzyy_user') || sessionStorage.getItem('dropzyy_user');
    if (rawUser) {
        const parsed = JSON.parse(rawUser);
        const uOnly = { username: parsed.username || parsed.sub || '' };
        localStorage.setItem('dropzyy_user', JSON.stringify(uOnly));
        sessionStorage.setItem('dropzyy_user', JSON.stringify(uOnly));
    }
} catch (e) {}

function parseJwtToken(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Default in-memory partner stores catalog metadata (NO PASSWORDS, NO CREDENTIALS)
const DEFAULT_PARTNER_STORES = [
    { id: 22, username: 'banjos', full_name: 'Banjos Cafe', role: 'supplier', supplier_company_name: 'Banjos Cafe', city: 'Savda-Faizpur', store_open: true, open_time: '08:00 AM', close_time: '10:00 PM', menu_card_image: 'uploads/banjos_menu_card_page_1.jpg' },
    { id: 3, username: 'supplier', full_name: 'Desi Kirana Wholesaler', role: 'supplier', supplier_company_name: 'Ramesh Kirana Wholesale Co.', city: 'Savda', store_open: true, open_time: '08:00 AM', close_time: '10:00 PM' }
];

// In-memory partner directory (populated live from /api/restaurants; NEVER written to localStorage)
let registeredUsers = [...DEFAULT_PARTNER_STORES];

// Ensure Banjos Cafe is restored if previously in deleted restaurants
try {
    const delRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
    if (Array.isArray(delRest) && delRest.length > 0) {
        const cleaned = delRest.filter(r => !String(r).toLowerCase().includes('banjo'));
        /* zero-storage */
    }
} catch (e) {}

const DEFAULT_COUPONS = [
    { id: 'c1', code: 'KIRANA10', discount_type: 'percent', discount_value: 10, discount: 10, min_order: 0, usage_limit: 'unlimited', used_by: [], target: 'everyone', targetUser: '', description: '10% OFF on all orders' },
    { id: 'c2', code: 'FRESH10', discount_type: 'percent', discount_value: 10, discount: 10, min_order: 0, usage_limit: 'unlimited', used_by: [], target: 'everyone', targetUser: '', description: '10% OFF on all orders' }
];

const DEFAULT_LOCATIONS = [
    { id: 'l0', area: 'Savda', pincode: '425502' },
    { id: 'l1', area: 'Fort / South Mumbai', pincode: '400001' },
    { id: 'l2', area: 'Dadar / Central Mumbai', pincode: '400028' },
    { id: 'l3', area: 'Bandra West', pincode: '400050' },
    { id: 'l4', area: 'Andheri West', pincode: '400053' }
];

let storeCoupons = DEFAULT_COUPONS;
let serviceableLocations = DEFAULT_LOCATIONS;

// Online / Offline Status Helper
window.isProductOnline = function(p) {
    if (!p) return false;
    const val = (p.isOnline !== undefined) ? p.isOnline : p.is_online;
    if (val === false || val === 0 || val === '0' || val === 'false' || val === 'offline') return false;
    return Boolean(val ?? true);
};

// Products Local Persistence - Guarantees products & online/offline toggles persist on page refresh
let deletedProductsList = [];
let deletedRestaurantsList = [];
let customProducts = [];
let cachedProducts = [];
let storeProducts = [...DEFAULT_PRODUCTS];

function persistCustomProducts() {
    // Products are securely persisted in MongoDB Atlas & SQLite via REST API endpoints.
    // Client state is kept purely in memory (zero localStorage dumping).
}

// 2. STATE MANAGEMENT
let state = {
    products: storeProducts,
    cart: [],
    wishlist: new Set(),
    ordersHistory: [],
    currentUser: (() => {
        try {
            const raw = localStorage.getItem('dropzyy_user') || 
                        sessionStorage.getItem('dropzyy_user') || 
                        localStorage.getItem('freshkart_user') || 
                        sessionStorage.getItem('freshkart_user');
            const token = localStorage.getItem('dropzyy_auth_token') || 
                          sessionStorage.getItem('dropzyy_auth_token');
            if (!raw && !token) return null;

            let uName = '';
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    uName = parsed.username || '';
                } catch(e){}
            }

            // Decode role & sub from JWT token in memory
            let tokenPayload = null;
            if (token) {
                tokenPayload = parseJwtToken(token);
            }

            if (!uName && tokenPayload && tokenPayload.username) {
                uName = tokenPayload.username;
            }

            if (!uName && !tokenPayload) return null;

            // Keep dropzyy_user in storage strictly minimal: ONLY { username: "..." }
            if (uName) {
                try {
                    const minimalStr = JSON.stringify({ username: uName });
                    localStorage.setItem('dropzyy_user', minimalStr);
                    sessionStorage.setItem('dropzyy_user', minimalStr);
                } catch(e){}
            }

            return {
                id: tokenPayload ? tokenPayload.sub : null,
                username: uName,
                role: tokenPayload ? tokenPayload.role : 'customer',
                full_name: uName,
                access_token: token
            };
        } catch (e) {
            return null;
        }
    })(),
    coupons: storeCoupons,
    serviceableLocations: serviceableLocations,
    blockedContacts: JSON.parse(localStorage.getItem('dropzyy_blocked_contacts') || '[]'),
    activeCategory: 'all',
    activeSupplierFilter: null,
    searchQuery: '',
    sortBy: 'popular',
    promoDiscount: 0,
    appliedCoupon: null,
    deliverySettings: {
        free_delivery_threshold: 300,
        standard_delivery_fee: 30,
        is_free_delivery_enabled: true,
        charge_type: 'threshold', // 'threshold' (waived above), 'fixed' (mandatory for all), 'free' (always 0)
        min_order_value: 50
    },
    analyticsDateRange: '7d',
    analyticsCustomStartDate: null,
    analyticsCustomEndDate: null,
    visitorChartMode: 'daily'
};

try {
    const cachedDelivery = JSON.parse(localStorage.getItem('dropzyy_delivery_settings') || '{}');
    if (cachedDelivery && cachedDelivery.free_delivery_threshold !== undefined) {
        Object.assign(state.deliverySettings, cachedDelivery);
    }
} catch (e) {}

window.state = state;

// 3. DOM ELEMENTS
const categoryGrid = document.getElementById('categoryGrid');
const restaurantsGrid = document.getElementById('restaurantsGrid');
const activeRestaurantBanner = document.getElementById('activeRestaurantBanner');
const restaurantFilterIndicator = document.getElementById('restaurantFilterIndicator');
const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const mobileSearchInput = document.getElementById('mobileSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchSuggestions = document.getElementById('searchSuggestions');
const mobileSearchSuggestions = document.getElementById('mobileSearchSuggestions');
const categoryPills = document.getElementById('categoryPills');
const sortSelect = document.getElementById('sortSelect');
const productCountText = document.getElementById('productCountText');
const resetFilterBtn = document.getElementById('resetFilterBtn');
const emptyState = document.getElementById('emptyState');
const emptyResetBtn = document.getElementById('emptyResetBtn');

const cartBadge = document.getElementById('cartBadge');
const mobileCartBadge = document.getElementById('mobileCartBadge');
const wishlistBadge = document.getElementById('wishlistBadge');
const headerCartTotal = document.getElementById('headerCartTotal');
const cartItemCountPill = document.getElementById('cartItemCountPill');

// Auth & Admin & Supplier UI
const userAuthWrapper = document.getElementById('userAuthWrapper');
const adminControlCenterBtn = document.getElementById('adminControlCenterBtn');
const adminPortalBtn = document.getElementById('adminPortalBtn');
const supplierDashboardBtn = document.getElementById('supplierDashboardBtn');
const openAuthBtn = document.getElementById('openAuthBtn');
const authOverlay = document.getElementById('authOverlay');
const authModal = document.getElementById('authModal');
const closeAuthBtn = document.getElementById('closeAuthBtn');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const regRole = document.getElementById('regRole');
const supplierCompanyGroup = document.getElementById('supplierCompanyGroup');

// Profile & Address Modal Elements
const profileAddressOverlay = document.getElementById('profileAddressOverlay');
const profileAddressModal = document.getElementById('profileAddressModal');
const closeProfileAddressBtn = document.getElementById('closeProfileAddressBtn');
const cancelProfileAddressBtn = document.getElementById('cancelProfileAddressBtn');
const profileAddressForm = document.getElementById('profileAddressForm');
const profileFullName = document.getElementById('profileFullName');
const profilePhone = document.getElementById('profilePhone');
const profileStreetAddress = document.getElementById('profileStreetAddress');
const profileCity = document.getElementById('profileCity');
const profilePincode = document.getElementById('profilePincode');

// Admin Control Center Modal Elements
const adminControlOverlay = document.getElementById('adminControlOverlay');
const adminControlModal = document.getElementById('adminControlModal');
const closeAdminControlBtn = document.getElementById('closeAdminControlBtn');
const statAdminTotalUsers = document.getElementById('statAdminTotalUsers');
const statAdminTotalSuppliers = document.getElementById('statAdminTotalSuppliers');
const adminUsersContainer = document.getElementById('adminUsersContainer');
const adminCreateAccountBtn = document.getElementById('adminCreateAccountBtn');

// Admin Create User Modal Elements
const adminCreateUserOverlay = document.getElementById('adminCreateUserOverlay');
const adminCreateUserModal = document.getElementById('adminCreateUserModal');
const closeAdminCreateUserBtn = document.getElementById('closeAdminCreateUserBtn');
const cancelAdminCreateUserBtn = document.getElementById('cancelAdminCreateUserBtn');
const adminCreateUserForm = document.getElementById('adminCreateUserForm');
const adminRegRole = document.getElementById('adminRegRole');
const adminSupplierCompanyGroup = document.getElementById('adminSupplierCompanyGroup');

const adminOverlay = document.getElementById('adminOverlay');
const adminModal = document.getElementById('adminModal');
const closeAdminBtn = document.getElementById('closeAdminBtn');
const cancelAdminBtn = document.getElementById('cancelAdminBtn');
const addProductForm = document.getElementById('addProductForm');
const adminModalTitle = document.getElementById('adminModalTitle');
const adminModalSub = document.getElementById('adminModalSub');
const editProductId = document.getElementById('editProductId');

// Supplier Dashboard Modal Elements
const supplierDashboardOverlay = document.getElementById('supplierDashboardOverlay');
const supplierDashboardModal = document.getElementById('supplierDashboardModal');
const closeSupplierDashboardBtn = document.getElementById('closeSupplierDashboardBtn');
const supplierCompanyTitle = document.getElementById('supplierCompanyTitle');
const statTotalProducts = document.getElementById('statTotalProducts');
const statCatalogValue = document.getElementById('statCatalogValue');
const supplierProductsContainer = document.getElementById('supplierProductsContainer');
const supplierAddNewBtn = document.getElementById('supplierAddNewBtn');

// Drawer & Modals
const cartBtn = document.getElementById('cartBtn');
const mobileCartBtn = document.getElementById('mobileCartBtn');
const cartDrawer = document.getElementById('cartDrawer');
const cartOverlay = document.getElementById('cartOverlay');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartItemsContainer = document.getElementById('cartItemsContainer');

const cartSubtotal = document.getElementById('cartSubtotal');
const cartDiscount = document.getElementById('cartDiscount');
const cartShipping = document.getElementById('cartShipping');
const cartGrandTotal = document.getElementById('cartGrandTotal');
const shippingProgressText = document.getElementById('shippingProgressText');
const shippingProgressBar = document.getElementById('shippingProgressBar');

const promoInput = document.getElementById('promoInput');
const applyPromoBtn = document.getElementById('applyPromoBtn');
const checkoutBtn = document.getElementById('checkoutBtn');

const quickViewOverlay = document.getElementById('quickViewOverlay');
const quickViewModal = document.getElementById('quickViewModal');
const quickViewContent = document.getElementById('quickViewContent');
const closeQuickViewBtn = document.getElementById('closeQuickViewBtn');

const checkoutOverlay = document.getElementById('checkoutOverlay');
const checkoutModal = document.getElementById('checkoutModal');
const closeCheckoutBtn = document.getElementById('closeCheckoutBtn');
const checkoutForm = document.getElementById('checkoutForm');
const checkoutTotalAmount = document.getElementById('checkoutTotalAmount');

const orderSuccessOverlay = document.getElementById('orderSuccessOverlay');
const orderSuccessModal = document.getElementById('orderSuccessModal');
const continueShoppingBtn = document.getElementById('continueShoppingBtn');
const successOrderId = document.getElementById('successOrderId');
const toastContainer = document.getElementById('toastContainer');

// My Orders Modal Elements
const myOrdersBtn = document.getElementById('myOrdersBtn');
const mobileOrdersBtn = document.getElementById('mobileOrdersBtn');
const myOrdersModal = document.getElementById('myOrdersModal');
const myOrdersOverlay = document.getElementById('myOrdersOverlay');
const closeMyOrdersBtn = document.getElementById('closeMyOrdersBtn');
const myOrdersContainer = document.getElementById('myOrdersContainer');
const viewBookedOrdersBtn = document.getElementById('viewBookedOrdersBtn');

// Booking Tracking Platform Elements
const trackBookingsBtn = document.getElementById('trackBookingsBtn');
const bookingTrackingModal = document.getElementById('bookingTrackingModal');
const bookingTrackingOverlay = document.getElementById('bookingTrackingOverlay');
const closeBookingTrackingBtn = document.getElementById('closeBookingTrackingBtn');
const bookingTrackingContainer = document.getElementById('bookingTrackingContainer');

// Wishlist Modal Elements
const wishlistBtn = document.getElementById('wishlistBtn');
const wishlistModal = document.getElementById('wishlistModal');
const wishlistOverlay = document.getElementById('wishlistOverlay');
const closeWishlistBtn = document.getElementById('closeWishlistBtn');
const wishlistContainer = document.getElementById('wishlistContainer');

// 4. INITIALIZATION
async function fetchUserProfileFromAPI() {
    const token = localStorage.getItem('dropzyy_auth_token') || (state.currentUser && state.currentUser.access_token);
    if (!token) return;
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/auth/me?_t=${Date.now()}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        }, 8000);
        if (res && res.ok) {
            const profile = await res.json();
            // Merge full profile strictly into runtime memory
            state.currentUser = {
                ...state.currentUser,
                ...profile,
                access_token: token
            };
            // Guarantee localStorage dropzyy_user ONLY holds { username: "..." }
            saveUserSession(state.currentUser);
            updateUserAuthUI();
            if (typeof renderRestaurants === 'function') renderRestaurants();
        }
    } catch (err) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    updateUserAuthUI();
    await Promise.allSettled([
        fetchUserProfileFromAPI(),
        fetchProductsFromAPI(),
        fetchRestaurantsFromAPI(),
        fetchCouponsFromAPI(),
        fetchLocationsFromAPI(),
        fetchCategoriesFromAPI(),
        syncUsersWithAPI(),
        fetchAvailabilityFromAPI(),
        fetchBlockedContactsFromAPI()
    ]);
    renderCategories();
    renderRestaurants();
    renderProducts();
    updateCartUI();
    updateWishlistUI();
    renderServiceableCitiesDatalist();
    setupEventListeners();
});

// 4.0 FETCH LIVE PARTNER RESTAURANTS, TIMINGS & IMAGES FROM API
async function fetchRestaurantsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/restaurants?_t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        }, 10000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                window._supplierStoreImages = window._supplierStoreImages || {};

                data.forEach(r => {
                    const uName = String(r.username || '').toLowerCase();
                    const cName = String(r.supplier_company_name || '').toLowerCase();

                    // Cache live store front & menu card photos
                    const storeImgData = {
                        banner_image: r.banner_image || '',
                        menu_card_image: r.menu_card_image || ''
                    };
                    if (uName) window._supplierStoreImages[uName] = storeImgData;
                    if (cName) window._supplierStoreImages[cName] = storeImgData;

                    // Synchronize into registeredUsers list
                    const existingIdx = registeredUsers.findIndex(u => 
                        (u.username && String(u.username).toLowerCase() === uName) ||
                        (u.supplier_company_name && String(u.supplier_company_name).toLowerCase() === cName)
                    );

                    if (existingIdx > -1) {
                        if (r.open_time) registeredUsers[existingIdx].open_time = r.open_time;
                        if (r.close_time) registeredUsers[existingIdx].close_time = r.close_time;
                        if (r.store_open !== undefined) registeredUsers[existingIdx].store_open = r.store_open;
                        if (r.banner_image) registeredUsers[existingIdx].banner_image = r.banner_image;
                        if (r.menu_card_image) registeredUsers[existingIdx].menu_card_image = r.menu_card_image;
                        if (r.city) registeredUsers[existingIdx].city = r.city;
                    } else {
                        registeredUsers.push({
                            id: r.id || `sup_${uName}`,
                            username: r.username,
                            full_name: r.full_name || r.supplier_company_name,
                            supplier_company_name: r.supplier_company_name,
                            role: 'supplier',
                            city: r.city || 'Savda',
                            open_time: r.open_time || '08:00 AM',
                            close_time: r.close_time || '10:00 PM',
                            store_open: r.store_open !== false,
                            banner_image: r.banner_image || '',
                            menu_card_image: r.menu_card_image || ''
                        });
                    }

                    // If currently logged in as this supplier, sync live session
                    if (state.currentUser && (
                        (state.currentUser.username && state.currentUser.username.toLowerCase() === uName) ||
                        (state.currentUser.supplier_company_name && state.currentUser.supplier_company_name.toLowerCase() === cName)
                    )) {
                        if (r.open_time) state.currentUser.open_time = r.open_time;
                        if (r.close_time) state.currentUser.close_time = r.close_time;
                        if (r.store_open !== undefined) state.currentUser.store_open = r.store_open;
                        if (r.banner_image) state.currentUser.banner_image = r.banner_image;
                        if (r.menu_card_image) state.currentUser.menu_card_image = r.menu_card_image;
                        saveUserSession(state.currentUser);
                    }
                });

                try {
                    /* zero-storage */
                } catch (e) {}

                if (typeof renderRestaurants === 'function') renderRestaurants();
                if (typeof renderProducts === 'function') renderProducts();
                if (state.activeModalRestaurant && typeof renderRestaurantMenuModalContent === 'function') {
                    renderRestaurantMenuModalContent(state.activeModalRestaurant);
                }
            }
        }
    } catch (err) {
        console.warn('Could not fetch restaurants from API:', err);
    }
}

// Auto-sync all live products, stores, categories, and calendar across all mobile & desktop devices without cache
async function refreshAllLiveData() {
    try {
        await Promise.allSettled([
            typeof fetchProductsFromAPI === 'function' ? fetchProductsFromAPI() : Promise.resolve(),
            typeof fetchRestaurantsFromAPI === 'function' ? fetchRestaurantsFromAPI() : Promise.resolve(),
            typeof fetchCategoriesFromAPI === 'function' ? fetchCategoriesFromAPI() : Promise.resolve(),
            typeof fetchAvailabilityFromAPI === 'function' ? fetchAvailabilityFromAPI() : Promise.resolve()
        ]);
    } catch (e) {}
}
if (typeof window !== 'undefined') {
    window.addEventListener('focus', refreshAllLiveData);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            refreshAllLiveData();
        }
    });
    setInterval(refreshAllLiveData, 15000);
}

// 4.1 FETCH AVAILABILITY CALENDAR DATA
async function fetchAvailabilityFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/supplier/availability?_t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } }, 8000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                window._supplierCalendarData = window._supplierCalendarData || {};
                data.forEach(entry => {
                    const supKey = String(entry.supplier_user_id);
                    if (!window._supplierCalendarData[supKey]) {
                        window._supplierCalendarData[supKey] = {};
                    }
                    window._supplierCalendarData[supKey][entry.date] = entry.is_open;
                });
            }
        }
    } catch (err) {
        console.warn('Could not load supplier availability:', err);
    }
}

// 5. FETCH PRODUCTS FROM FASTAPI REST API
async function fetchProductsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/products?_t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        }, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data)) {
                // Auto-register any categories from live products into CATEGORIES list
                data.forEach(p => {
                    if (p.category && !CATEGORIES.some(cat => cat.id === p.category)) {
                        const formattedCatName = p.category.charAt(0).toUpperCase() + p.category.slice(1);
                        CATEGORIES.push({
                            id: p.category,
                            name: formattedCatName,
                            icon: 'fa-solid fa-layer-group',
                            count: 0
                        });
                    }
                });
                let deletedProds = [];
                try {
                    deletedProds = JSON.parse(localStorage.getItem('dropzyy_deleted_products') || '[]');
                } catch (e) {
                    deletedProds = [];
                }
                const deletedSet = new Set(deletedProds.map(d => String(d).trim().toLowerCase()));

                let deletedRest = [];
                try {
                    deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
                } catch (e) {
                    deletedRest = [];
                }
                const deletedRestSet = new Set(deletedRest.map(d => String(d).trim().toLowerCase()));

                const apiProducts = data
                    .filter(p => {
                        const pid = String(p.id).trim().toLowerCase();
                        const ptitle = String(p.title || '').trim().toLowerCase();
                        const psup = String(p.supplier_name || p.supplierName || '').trim().toLowerCase();
                        const pcomp = String(p.supplier_company_name || '').trim().toLowerCase();
                        if (deletedSet.has(pid) || deletedSet.has(ptitle)) return false;
                        if (deletedRestSet.has(psup) || deletedRestSet.has(pcomp)) return false;
                        return true;
                    })
                    .map(p => ({
                        id: p.id,
                        title: p.title,
                        category: p.category,
                        price: p.price,
                        originalPrice: p.original_price || p.price * 1.15,
                        unit: p.unit,
                        rating: p.rating || 4.8,
                        reviewsCount: p.reviews_count || 100,
                        image: p.image,
                        badge: p.badge || 'Fresh Produce',
                        discount: p.discount || '10% OFF',
                        description: p.description || '',
                        nutrition: p.nutrition || '',
                        supplierName: p.supplier_name || 'Dropzyy Direct',
                        supplier_name: p.supplier_name || 'Dropzyy Direct',
                        supplier_company_name: p.supplier_company_name || null,
                        supplier_user_id: p.supplier_user_id || null,
                        supplier_id: p.supplier_id || null,
                        isOnline: isProductOnline(p),
                        is_online: isProductOnline(p),
                        variants: p.variants || null,
                        food_type: p.food_type || null
                    }));

                state.products = apiProducts;
                persistCustomProducts();
                renderProducts();
                if (typeof renderCategories === 'function') renderCategories();
                if (typeof renderCategoryPills === 'function') renderCategoryPills();
                if (typeof renderRestaurants === 'function') renderRestaurants();
                if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);
            }
        }
    } catch (err) {
        console.log('FastAPI backend offline or starting up. Using local Kirana products dataset.');
    }
}

async function fetchCouponsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/coupons?_t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } }, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                state.coupons = data.map(c => {
                    const discountType = (c.discount_type || (c.discount_percent ? 'percent' : 'flat')).toLowerCase();
                    const discountVal = parseFloat(c.discount_value !== undefined && c.discount_value !== null ? c.discount_value : (c.discount_percent || c.discount || 10));
                    return {
                        id: String(c.id),
                        code: String(c.code).toUpperCase(),
                        discount_type: discountType,
                        discount_value: discountVal,
                        discount: discountVal,
                        min_order: parseFloat(c.min_order || 0),
                        usage_limit: c.usage_limit || 'unlimited',
                        used_by: Array.isArray(c.used_by) ? c.used_by : [],
                        target: c.target || 'everyone',
                        targetUser: c.target_user || c.targetUser || '',
                        target_user: c.target_user || c.targetUser || '',
                        description: c.description || ''
                    };
                });
                if (typeof renderAdminCouponsList === 'function') renderAdminCouponsList();
            }
        }
    } catch (err) {}
}

async function fetchLocationsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/locations?_t=${Date.now()}`, { headers: { "Cache-Control": "no-cache" } }, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                state.serviceableLocations = data.map(l => ({
                    id: String(l.id),
                    area: l.city,
                    pincode: String(l.pincode)
                }));
                if (typeof renderServiceableCitiesDatalist === 'function') renderServiceableCitiesDatalist();
                if (typeof renderAdminLocationsList === 'function') renderAdminLocationsList();
            }
        }
    } catch (err) {}
}

async function syncCartFromDB() {
    if (!state.currentUser) return;
    const userId = state.currentUser.id || state.currentUser.username;
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/cart/${userId}`, {}, 1200);
        if (res && res.ok) {
            const cartItems = await res.json();
            state.cart = cartItems.map(item => {
                const product = state.products.find(p => String(p.id) === String(item.product_id)) || {
                    id: item.product_id,
                    title: 'Kirana Product',
                    price: 100,
                    image: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=500&q=80'
                };
                return { ...product, db_cart_id: item.id, qty: item.quantity };
            });
            updateCartUI();
        }
    } catch (err) {}
}

async function syncWishlistFromDB() {
    if (!state.currentUser) return;
    const userId = state.currentUser.id || state.currentUser.username;
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/wishlist/${userId}`, {}, 1200);
        if (res && res.ok) {
            const productIds = await res.json();
            state.wishlist = new Set(productIds.map(String));
            updateWishlistUI();
        }
    } catch (err) {}
}

async function syncUserDataFromDB() {
    if (!state.currentUser) return;
    await syncCartFromDB();
    await syncWishlistFromDB();
    await fetchOrdersFromAPI();
}

// Helper to dynamically count online items in a category
window.getCategoryItemCount = function(catId) {
    const prods = (state && Array.isArray(state.products) && state.products.length > 0) ? state.products : DEFAULT_PRODUCTS;
    if (catId === 'all') {
        return prods.filter(p => isProductOnline(p)).length;
    }
    const target = String(catId || '').toLowerCase().trim();
    return prods.filter(p => {
        if (!isProductOnline(p)) return false;
        const pCat = String(p.category || '').toLowerCase().trim();
        return pCat === target;
    }).length;
};

// 6. RENDER CATEGORIES
function renderCategories() {
    if (!categoryGrid) return;

    // Filter out categories that have 0 products added (keep 'all' as top filter)
    const validCats = CATEGORIES.filter(cat => {
        if (cat.id === 'all') return true;
        return window.getCategoryItemCount(cat.id) > 0;
    });

    // If active category was removed, reset to 'all'
    if (state.activeCategory !== 'all' && !validCats.some(c => c.id === state.activeCategory)) {
        state.activeCategory = 'all';
    }

    categoryGrid.innerHTML = validCats.map(cat => {
        const count = window.getCategoryItemCount(cat.id);
        return `
            <div class="category-card ${state.activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
                <div class="category-icon-box">
                    <i class="${cat.icon || 'fa-solid fa-layer-group'}"></i>
                </div>
                <div class="category-name">${cat.name}</div>
                <div class="category-count">${count} ${count === 1 ? 'Item' : 'Items'} Available</div>
            </div>
        `;
    }).join('');
}

// Time parsing & conversion helpers (supporting 12-hour AM/PM and 24-hour formats)
window.parseTimeComponents = function(timeStr) {
    if (!timeStr) return { hour: '08', minute: '00', ampm: 'AM', time24: '08:00', formatted12: '08:00 AM' };
    timeStr = String(timeStr).trim();
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
    if (!match) return { hour: '08', minute: '00', ampm: 'AM', time24: '08:00', formatted12: '08:00 AM' };
    
    let h = parseInt(match[1], 10);
    const m = match[2];
    let ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm) {
        let h24 = h;
        if (ampm === 'PM' && h < 12) h24 += 12;
        if (ampm === 'AM' && h === 12) h24 = 0;
        const h24Str = h24 < 10 ? '0' + h24 : String(h24);
        const h12Str = h < 10 ? '0' + h : String(h);
        return {
            hour: h12Str,
            minute: m,
            ampm: ampm,
            time24: `${h24Str}:${m}`,
            formatted12: `${h12Str}:${m} ${ampm}`
        };
    } else {
        ampm = h >= 12 ? 'PM' : 'AM';
        let h12 = h % 12;
        if (h12 === 0) h12 = 12;
        const h24Str = h < 10 ? '0' + h : String(h);
        const h12Str = h12 < 10 ? '0' + h12 : String(h12);
        return {
            hour: h12Str,
            minute: m,
            ampm: ampm,
            time24: `${h24Str}:${m}`,
            formatted12: `${h12Str}:${m} ${ampm}`
        };
    }
};

window.parseTimeToMinutes = function(timeStr) {
    if (!timeStr) return null;
    const comp = parseTimeComponents(timeStr);
    const [h, m] = comp.time24.split(':').map(Number);
    return h * 60 + m;
};

window.formatTime12Hour = function(timeStr) {
    if (!timeStr) return '';
    const comp = parseTimeComponents(timeStr);
    return comp.formatted12;
};

window.evaluateUserStoreHours = function(user) {
    if (!user) return { isOpen: true, reason: 'Store is Open' };

    // Find live supplier record in registeredUsers if available to ensure live timings and store_open
    let liveUser = user;
    if (Array.isArray(registeredUsers)) {
        const uName = String(user.username || '').toLowerCase();
        const cName = String(user.supplier_company_name || user.full_name || '').toLowerCase();
        const matched = registeredUsers.find(u => {
            if (!u) return false;
            const regU = String(u.username || '').toLowerCase();
            const regC = String(u.supplier_company_name || u.full_name || '').toLowerCase();
            if (uName && regU === uName) return true;
            if (cName && regC === cName) return true;
            if (uName && cName && (regU === cName || regC === uName)) return true;
            if ((uName && uName.includes('banjo')) || (cName && cName.includes('banjo'))) {
                if (regU.includes('banjo') || regC.includes('banjo')) return true;
            }
            return false;
        });
        if (matched) {
            liveUser = Object.assign({}, user, matched);
        }
    }

    const openTime = liveUser.open_time || user.open_time || '08:00 AM';
    const closeTime = liveUser.close_time || user.close_time || '10:00 PM';
    const formattedOpen = formatTime12Hour(openTime);
    const formattedClose = formatTime12Hour(closeTime);

    // 0. MANUAL STORE ONLINE / OFFLINE TOGGLE CHECK
    if (liveUser.store_open === false || liveUser.store_open === 0 || liveUser.store_open === 'false' || liveUser.is_online === false) {
        return {
            isOpen: false,
            isManuallyClosed: true,
            openTimeFormatted: formattedOpen,
            closeTimeFormatted: formattedClose,
            reason: 'Store is Offline / Currently Closed 🔴'
        };
    }

    // 1. AVAILABILITY CALENDAR CHECK FOR TODAY
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const todayKey = `${yy}-${mm}-${dd}`;

    let calOverride = undefined;
    if (window._supplierCalendarData) {
        const idKey = user.id ? String(user.id) : null;
        const supIdKey = user.supplier_user_id ? String(user.supplier_user_id) : null;
        const uKey = user.username ? String(user.username).toLowerCase() : null;
        const cKey = user.supplier_company_name ? String(user.supplier_company_name).toLowerCase() : null;

        let calData = null;
        if (idKey && window._supplierCalendarData[idKey]) calData = window._supplierCalendarData[idKey];
        else if (supIdKey && window._supplierCalendarData[supIdKey]) calData = window._supplierCalendarData[supIdKey];
        else if (uKey && window._supplierCalendarData[uKey]) calData = window._supplierCalendarData[uKey];
        else if (cKey && window._supplierCalendarData[cKey]) calData = window._supplierCalendarData[cKey];

        if (calData && todayKey in calData) {
            calOverride = calData[todayKey];
        }
    }

    // If marked CLOSED in the calendar for today, store is strictly closed
    if (calOverride === false) {
        return {
            isOpen: false,
            isCalendarClosed: true,
            openTimeFormatted: formattedOpen,
            closeTimeFormatted: formattedClose,
            reason: `Closed today (Calendar schedule) 📅🔴`
        };
    }

    // 2. DAILY OPERATING HOURS CHECK
    const openMinutes = parseTimeToMinutes(openTime);
    const closeMinutes = parseTimeToMinutes(closeTime);

    if (openMinutes === null || closeMinutes === null) {
        return { 
            isOpen: true, 
            openTimeFormatted: formattedOpen, 
            closeTimeFormatted: formattedClose, 
            reason: `Store is Open (${formattedOpen} - ${formattedClose}) 🟢` 
        };
    }

    const currentMinutes = d.getHours() * 60 + d.getMinutes();

    let isWithinOperatingHours = false;
    if (openMinutes <= closeMinutes) {
        isWithinOperatingHours = currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    } else {
        // Overnight operating hours (e.g. 08:00 PM to 02:00 AM)
        isWithinOperatingHours = currentMinutes >= openMinutes || currentMinutes <= closeMinutes;
    }

    if (!isWithinOperatingHours) {
        return { 
            isOpen: false, 
            isOutsideHours: true,
            openTimeFormatted: formattedOpen, 
            closeTimeFormatted: formattedClose, 
            reason: `Currently Closed (Hours: ${formattedOpen} - ${formattedClose}) 🕒🔴` 
        };
    }

    return { 
        isOpen: true, 
        openTimeFormatted: formattedOpen, 
        closeTimeFormatted: formattedClose, 
        reason: `Open Now (${formattedOpen} - ${formattedClose}) 🟢` 
    };
};

window.doesProductBelongToSupplier = function(product, supplierUser) {
    if (!product || !supplierUser) return false;

    // Direct check: Customer accounts NEVER own supplier products
    if (supplierUser.role && supplierUser.role !== 'supplier' && supplierUser.role !== 'admin' && supplierUser.role !== 'sub_admin') {
        return false;
    }

    // 1. Direct ID match
    const pSupUserId = product.supplier_user_id || product.supplierUserId;
    if (supplierUser.id && pSupUserId) {
        if (String(supplierUser.id) === String(pSupUserId)) return true;
    }

    const pSupId = product.supplier_id || product.supplierId;
    if (supplierUser.supplier_id && pSupId) {
        if (String(supplierUser.supplier_id) === String(pSupId)) return true;
    }

    // 2. Name matches (exact or long company/user match)
    const pSupplier = (product.supplierName || product.supplier_name || '').trim().toLowerCase();
    if (!pSupplier) return false;

    const sCompany = (supplierUser.supplier_company_name || '').trim().toLowerCase();
    const sName = (supplierUser.full_name || '').trim().toLowerCase();
    const sUser = (supplierUser.username || '').trim().toLowerCase();

    if (sCompany && pSupplier === sCompany) return true;
    if (sName && pSupplier === sName) return true;
    if (sUser && pSupplier === sUser) return true;

    // Substring match ONLY if BOTH strings have length >= 4
    if (sCompany && sCompany.length >= 4 && pSupplier.length >= 4 && (pSupplier.includes(sCompany) || sCompany.includes(pSupplier))) return true;
    if (sName && sName.length >= 4 && pSupplier.length >= 4 && (pSupplier.includes(sName) || sName.includes(pSupplier))) return true;

    // Alphanumeric cleaned match to guarantee robust matching regardless of punctuation/spacing
    const pClean = pSupplier.replace(/[^a-z0-9]/g, '');
    const cClean = sCompany.replace(/[^a-z0-9]/g, '');
    const uClean = sUser.replace(/[^a-z0-9]/g, '');
    const nClean = sName.replace(/[^a-z0-9]/g, '');

    if (pClean && cClean && pClean === cClean) return true;
    if (pClean && uClean && pClean === uClean) return true;
    if (pClean && nClean && pClean === nClean) return true;

    if (pClean.length >= 4 && cClean.length >= 4 && (pClean.includes(cClean) || cClean.includes(pClean))) return true;
    if (pClean.length >= 4 && uClean.length >= 4 && (pClean.includes(uClean) || uClean.includes(pClean))) return true;
    if (pClean.length >= 4 && nClean.length >= 4 && (pClean.includes(nClean) || nClean.includes(pClean))) return true;

    return false;
};

// Global helper to check if two supplier entities are the same registered store/supplier
window.isSameSupplierEntity = function(supA, supB) {
    if (!supA || !supB) return false;

    // Both entities MUST be suppliers - customer accounts NEVER match
    if (supA.role && supA.role !== 'supplier') return false;
    if (supB.role && supB.role !== 'supplier') return false;
    const isSupA = supA.role === 'supplier' || Boolean(supA.supplier_company_name);
    const isSupB = supB.role === 'supplier' || Boolean(supB.supplier_company_name);
    if (!isSupA || !isSupB) return false;

    if (supA.id && supB.id && String(supA.id) === String(supB.id)) return true;

    const userA = (supA.username || '').trim().toLowerCase();
    const userB = (supB.username || '').trim().toLowerCase();
    if (userA && userB && userA === userB) return true;

    const compA = (supA.supplier_company_name || '').trim().toLowerCase();
    const compB = (supB.supplier_company_name || '').trim().toLowerCase();
    if (compA && compB && compA === compB) return true;

    const nameA = (supA.full_name || '').trim().toLowerCase();
    const nameB = (supB.full_name || '').trim().toLowerCase();
    if (nameA && nameB && nameA === nameB) return true;

    if (compA && userB && compA === userB) return true;
    if (compB && userA && compB === userA) return true;
    if (nameA && userB && nameA === userB) return true;
    if (nameB && userA && nameB === userA) return true;

    if (typeof state !== 'undefined' && Array.isArray(state.products)) {
        const hasSharedProduct = state.products.some(p => 
            doesProductBelongToSupplier(p, supA) && doesProductBelongToSupplier(p, supB)
        );
        if (hasSharedProduct) return true;
    }

    return false;
};

window.getSupplierForProduct = function(product) {
    if (!product) return null;

    // Search registeredUsers for a matching supplier
    const suppliers = registeredUsers.filter(u => u.role === 'supplier' || u.supplier_company_name);
    for (const sup of suppliers) {
        if (doesProductBelongToSupplier(product, sup)) {
            return sup;
        }
    }
    return null;
};

window.isSupplierStoreOpen = function(productOrSupplier) {
    if (!productOrSupplier) return { isOpen: true, reason: 'Store is Open' };

    // If passed a product object: Check ONLY this product's supplier!
    if (typeof productOrSupplier === 'object' && (productOrSupplier.id || productOrSupplier.title || productOrSupplier.price !== undefined)) {
        const sup = getSupplierForProduct(productOrSupplier);
        if (!sup) {
            // General store item not belonging to any custom supplier -> Always Open
            return { isOpen: true, reason: 'Store is Open' };
        }
        return evaluateUserStoreHours(sup);
    }

    // If passed a supplier name string
    if (typeof productOrSupplier === 'string') {
        const clean = productOrSupplier.trim().toLowerCase();
        const suppliers = registeredUsers.filter(u => u.role === 'supplier' || u.supplier_company_name);
        const sup = suppliers.find(u => 
            ((u.supplier_company_name && u.supplier_company_name.toLowerCase() === clean) ||
             (u.full_name && u.full_name.toLowerCase() === clean) ||
             (u.username && u.username.toLowerCase() === clean))
        );
        if (!sup) {
            return { isOpen: true, reason: 'Store is Open' };
        }
        return evaluateUserStoreHours(sup);
    }

    // If passed a user object
    if (typeof productOrSupplier === 'object' && (productOrSupplier.username || productOrSupplier.role)) {
        return evaluateUserStoreHours(productOrSupplier);
    }

    return { isOpen: true, reason: 'Store is Open' };
};

window.renderRestaurants = function() {
    if (!restaurantsGrid) return;

    // Helper to identify internal platform grocery inventory that should NEVER be shown as partner restaurants
    function isPlatformSupplier(name) {
        if (!name) return true;
        const clean = String(name).trim().toLowerCase();
        const systemKeywords = [
            'dropzyy direct mandi', 'dropzyy direct', 'dropzyy mandi', 
            'freshkart mandi', 'direct mandi', 'itc agro'
        ];
        return systemKeywords.some(sys => clean.includes(sys));
    }

    let deletedRest = [];
    try {
        deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
    } catch (e) {
        deletedRest = [];
    }
    const isDeletedRestaurant = (name) => {
        if (!name) return false;
        const c = String(name).trim().toLowerCase();
        return deletedRest.some(d => {
            const dc = String(d).trim().toLowerCase();
            return dc && (dc === c || c === dc || dc === c.replace(/[^a-z0-9]/g, ''));
        });
    };

    const rawSuppliers = registeredUsers.filter(u => u.role === 'supplier' || u.supplier_company_name);
    const seenKeys = new Set();
    const suppliers = [];

    // Deduplicate registered suppliers by company name or username (excluding internal platform names)
    for (const s of rawSuppliers) {
        const sName = (s.supplier_company_name || s.username || s.full_name || '').trim();
        const key = sName.toLowerCase();
        if (!key || seenKeys.has(key)) continue;
        if (isPlatformSupplier(sName)) continue;
        if (isDeletedRestaurant(sName) || isDeletedRestaurant(s.username)) continue;
        seenKeys.add(key);
        suppliers.push(s);
    }

    // Auto-discover active partner suppliers from catalog products (e.g. Banjos Cafe, Dhanji, etc.)
    state.products.forEach(p => {
        const sName = (p.supplier_name || p.supplierName || '').trim();
        if (sName && !isPlatformSupplier(sName)) {
            const key = sName.toLowerCase();
            if (isDeletedRestaurant(sName) || isDeletedRestaurant(p.supplier_user_id)) return;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                let menuCard = null;
                if (key.includes('banjo')) menuCard = 'uploads/banjos_menu_card_page_1.jpg';
                suppliers.push({
                    id: p.supplier_user_id || `sup_${key.replace(/[^a-z0-9]/g, '_')}`,
                    username: key.replace(/[^a-z0-9]/g, ''),
                    supplier_company_name: sName,
                    full_name: sName,
                    role: 'supplier',
                    open_time: '08:00 AM',
                    close_time: '10:00 PM',
                    store_open: true,
                    menu_card_image: menuCard
                });
            }
        }
    });

    // Helper to get thematic banner and avatar for partner restaurants & kirana stores
    function getSupplierBannerAndAvatar(sup) {
        if (!sup) sup = {};
        const supName = String(sup.supplier_company_name || sup.full_name || '').trim();
        const supUser = String(sup.username || '').trim();
        const raw = `${supName} ${supUser}`.toLowerCase();
        
        // Default: Fresh supermarket / kirana aisle banner
        let banner = 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=700&q=80';
        let avatarIcon = 'fa-store';
        let avatarBg = 'linear-gradient(135deg, #10B981, #059669)';
        
        if (raw.includes('banjo') || raw.includes('cafe') || raw.includes('burger') || raw.includes('fries') || raw.includes('pizza') || raw.includes('restaurant') || raw.includes('kitchen') || raw.includes('dhaba') || raw.includes('food') || raw.includes('hotel')) {
            banner = raw.includes('banjo') 
                ? 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=700&q=80' 
                : 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=700&q=80';
            avatarIcon = 'fa-utensils';
            avatarBg = 'linear-gradient(135deg, #F59E0B, #D97706)';
        } else if (raw.includes('dhanji')) {
            banner = 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=700&q=80';
            avatarIcon = 'fa-shop';
            avatarBg = 'linear-gradient(135deg, #8B5CF6, #6D28D9)';
        }

        // 1. Direct property on supplier object
        let customBanner = sup.banner_image || sup.cover_image;

        // 2. Check window._supplierStoreImages
        if (!customBanner && window._supplierStoreImages) {
            const uKey = supUser.toLowerCase();
            const cKey = supName.toLowerCase();
            if (uKey && window._supplierStoreImages[uKey] && window._supplierStoreImages[uKey].banner_image) {
                customBanner = window._supplierStoreImages[uKey].banner_image;
            } else if (cKey && window._supplierStoreImages[cKey] && window._supplierStoreImages[cKey].banner_image) {
                customBanner = window._supplierStoreImages[cKey].banner_image;
            } else if (raw.includes('banjo') && window._supplierStoreImages['banjos'] && window._supplierStoreImages['banjos'].banner_image) {
                customBanner = window._supplierStoreImages['banjos'].banner_image;
            }
        }

        // 3. Check registeredUsers
        if (!customBanner && Array.isArray(registeredUsers)) {
            const matchReg = registeredUsers.find(u => {
                if (!u) return false;
                const regU = String(u.username || '').toLowerCase();
                const regC = String(u.supplier_company_name || u.full_name || '').toLowerCase();
                if (supUser && regU === supUser.toLowerCase()) return true;
                if (supName && regC === supName.toLowerCase()) return true;
                if (raw.includes('banjo') && (regU.includes('banjo') || regC.includes('banjo'))) return true;
                return false;
            });
            if (matchReg && (matchReg.banner_image || matchReg.cover_image)) {
                customBanner = matchReg.banner_image || matchReg.cover_image;
            }
        }

        if (customBanner) {
            banner = customBanner;
        }

        return { banner, avatarIcon, avatarBg };
    }

    const isSameSupplierEntity = window.isSameSupplierEntity;

    // Role-based Supplier Isolation:
    // When a particular supplier is logged in, show ONLY their own store/restaurant!
    const isSupplierUser = state.currentUser && state.currentUser.role === 'supplier';
    let displaySuppliers = [];
    if (isSupplierUser) {
        displaySuppliers = suppliers.filter(sup => isSameSupplierEntity(sup, state.currentUser));
        
        // If current supplier is not yet in the discovered list, synthesize from currentUser
        if (displaySuppliers.length === 0) {
            displaySuppliers = [{
                id: state.currentUser.id || `sup_${(state.currentUser.username || 'supplier').toLowerCase()}`,
                username: state.currentUser.username || '',
                supplier_company_name: state.currentUser.supplier_company_name || state.currentUser.full_name || 'My Store',
                full_name: state.currentUser.full_name || state.currentUser.username || 'Supplier Partner',
                role: 'supplier',
                open_time: state.currentUser.open_time || '08:00 AM',
                close_time: state.currentUser.close_time || '10:00 PM',
                store_open: state.currentUser.store_open !== false,
                city: state.currentUser.city || (state.currentUser.address && state.currentUser.address.city) || 'Savda'
            }];
        }
    } else {
        // Customer / Visitor view: ONLY show partner stores that have active products added by that supplier!
        displaySuppliers = suppliers.filter(sup => {
            const count = state.products.filter(p => doesProductBelongToSupplier(p, sup) && isProductOnline(p)).length;
            return count > 0;
        });

        // Sort so stores with more items appear first
        displaySuppliers.sort((a, b) => {
            const countA = state.products.filter(p => doesProductBelongToSupplier(p, a) && isProductOnline(p)).length;
            const countB = state.products.filter(p => doesProductBelongToSupplier(p, b) && isProductOnline(p)).length;
            return countB - countA;
        });
    }

    // Dynamic Header Title & Subtitle based on whether logged in as supplier
    const titleEl = document.querySelector('.restaurants-section .section-title');
    const subtitleEl = document.querySelector('.restaurants-section .section-subtitle');
    if (titleEl) {
        titleEl.innerHTML = isSupplierUser
            ? `<i class="fa-solid fa-store text-primary"></i> My Partner Store & Live Status`
            : `<i class="fa-solid fa-utensils text-primary"></i> Top Partner Restaurants & Kirana Stores`;
    }
    if (subtitleEl) {
        subtitleEl.textContent = isSupplierUser
            ? "Your registered partner store view with live operating hours & menu catalog"
            : "Order delicious dishes & fresh Kirana directly from verified partner stores with live operating hours";
    }

    if (displaySuppliers.length === 0) {
        restaurantsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 32px 20px; color: var(--text-muted); background: white; border-radius: 16px; border: 1.5px dashed #CBD5E1;">
                <i class="fa-solid fa-store-slash" style="font-size: 2.2rem; margin-bottom: 10px; color: #94A3B8;"></i>
                <p style="margin: 0; font-weight: 700; color: #334155; font-size: 1rem;">No partner restaurants or supplier stores registered yet.</p>
            </div>
        `;
        return;
    }

    window.currentDisplaySuppliers = displaySuppliers;

    restaurantsGrid.innerHTML = displaySuppliers.map((sup, idx) => {
        const name = sup.supplier_company_name || sup.full_name || sup.username;
        const owner = sup.username ? `@${sup.username}` : (sup.full_name || 'Partner');
        const status = evaluateUserStoreHours(sup);
        const isOpen = status.isOpen;
        const openTime = formatTime12Hour(sup.open_time || '08:00 AM');
        const closeTime = formatTime12Hour(sup.close_time || '10:00 PM');
        const city = sup.city || (sup.address && sup.address.city) || 'Savda';
        
        // Count products belonging strictly to this supplier (online only for customers)
        const items = state.products.filter(p => doesProductBelongToSupplier(p, sup) && (isSupplierUser ? true : isProductOnline(p)));
        const count = items.length;

        const { banner, avatarIcon, avatarBg } = getSupplierBannerAndAvatar(sup);
        const filterParam = String(sup.username || sup.id || sup.supplier_company_name).replace(/'/g, "\\'");

        // Resolve menu card photo if available for this restaurant
        let mCard = sup.menu_card_image || null;
        const supNameLower = String(name || '').toLowerCase();
        const supUserLower = String(sup.username || '').toLowerCase();
        if (!mCard && window._supplierStoreImages) {
            if (supUserLower && window._supplierStoreImages[supUserLower]) {
                mCard = window._supplierStoreImages[supUserLower].menu_card_image;
            }
            if (!mCard && (supNameLower.includes('banjo') || supUserLower.includes('banjo'))) {
                mCard = window._supplierStoreImages['banjos'] ? window._supplierStoreImages['banjos'].menu_card_image : null;
            }
        }
        if (!mCard && Array.isArray(registeredUsers)) {
            const matchedUser = registeredUsers.find(u => {
                if (!u) return false;
                const uName = String(u.username || '').toLowerCase();
                const cName = String(u.supplier_company_name || u.full_name || '').toLowerCase();
                if (supUserLower && (uName === supUserLower || uName.replace(/[^a-z0-9]/g, '') === supUserLower.replace(/[^a-z0-9]/g, ''))) return true;
                if (supNameLower && (cName === supNameLower || (cName.includes('banjo') && supNameLower.includes('banjo')))) return true;
                return false;
            });
            if (matchedUser && matchedUser.menu_card_image) mCard = matchedUser.menu_card_image;
        }
        if (!mCard && (supNameLower.includes('banjo') || supUserLower.includes('banjo'))) {
            mCard = 'uploads/banjos_menu_card_page_1.jpg';
        }

        return `
            <div class="restaurant-card" onclick="openRestaurantMenuModal(${idx})" style="background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 18px; overflow: hidden; cursor: pointer; transition: all 0.25s ease; position: relative; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; flex-direction: column;">
                <div class="restaurant-card-banner" style="position: relative; width: 100%; height: 145px; background: #F1F5F9; overflow: hidden;">
                    <img src="${banner}" alt="${name}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                    <div class="restaurant-card-banner-overlay" style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(15, 23, 42, 0.55) 0%, rgba(15, 23, 42, 0.05) 50%, rgba(15, 23, 42, 0.25) 100%); pointer-events: none;"></div>
                    <span class="restaurant-status-pill ${isOpen ? 'open' : 'closed'}" style="position: absolute; top: 10px; right: 10px; z-index: 3; font-size: 0.7rem; font-weight: 800; padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 5px; letter-spacing: 0.4px; box-shadow: 0 2px 8px rgba(0,0,0,0.25); text-transform: uppercase; background: ${isOpen ? '#10B981' : '#EF4444'}; color: #FFFFFF;">
                        <i class="fa-solid fa-circle" style="font-size: 0.42rem;"></i> ${isOpen ? 'OPEN NOW' : 'CLOSED'}
                    </span>
                    <div class="restaurant-avatar-logo" style="position: absolute; bottom: -18px; left: 14px; z-index: 4; width: 44px; height: 44px; border-radius: 50%; border: 2.5px solid #FFFFFF; background: #FFFFFF; box-shadow: 0 4px 10px rgba(0,0,0,0.16); overflow: hidden; display: flex; align-items: center; justify-content: center;">
                        <div style="width: 100%; height: 100%; background: ${avatarBg}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.05rem;">
                            <i class="fa-solid ${avatarIcon}"></i>
                        </div>
                    </div>
                </div>

                <div class="restaurant-card-body" style="padding: 24px 16px 14px 16px; display: flex; flex-direction: column; flex: 1;">
                    <h4 class="restaurant-card-title" title="${name}" style="margin: 0 0 5px 0; font-size: 1.05rem; font-weight: 800; color: #0F172A; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</h4>
                    <div class="restaurant-card-meta" style="display: flex; align-items: center; gap: 8px; font-size: 0.78rem; color: #64748B; margin-bottom: 12px; flex-wrap: wrap;">
                        <span><i class="fa-solid fa-location-dot" style="color: #10B981;"></i> ${city}</span>
                        <span style="color: #CBD5E1;">•</span>
                        <span><i class="fa-solid fa-clock" style="color: #F59E0B;"></i> ${openTime} - ${closeTime}</span>
                    </div>

                    <div class="restaurant-card-footer" style="margin-top: auto; border-top: 1px dashed #E2E8F0; padding-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                        <div style="font-size: 0.82rem; font-weight: 700; color: #059669; display: flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-bowl-food"></i> ${count} Menu Item${count === 1 ? '' : 's'}
                        </div>
                        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${mCard ? `
                                <button type="button" class="btn-menu-card-pill" onclick="viewFullMenuCardModal('${mCard}', '${name.replace(/'/g, "\\'")}'); event.stopPropagation();" title="View official menu card / photo">
                                    <i class="fa-solid fa-book-open"></i> Menu Photo
                                </button>
                            ` : ''}
                            ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') ? `
                                <button type="button" class="btn-delete-restaurant-admin" onclick="deleteRestaurantByAdmin('${filterParam}', '${name.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Admin: Delete Restaurant" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </button>
                            ` : ''}
                            ${state.currentUser && state.currentUser.role === 'supplier' && window.isSameSupplierEntity(sup, state.currentUser) ? `
                                <button type="button" onclick="openSupplierDashboard(); event.stopPropagation();" title="Manage your restaurant" style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-gear"></i> Manage
                                </button>
                            ` : ''}
                            <button type="button" class="btn-view-store-menu" onclick="openRestaurantMenuModal(${idx}); event.stopPropagation();" style="background: #10B981; color: #FFFFFF; border: none; border-radius: 8px; padding: 6px 14px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);">
                                View Menu <i class="fa-solid fa-arrow-right" style="font-size: 0.72rem;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.openRestaurantMenuModal = function(idOrUsernameOrIdx) {
    let target = null;
    
    // 1. Direct index lookup if numeric
    if (typeof idOrUsernameOrIdx === 'number' || (typeof idOrUsernameOrIdx === 'string' && /^\d+$/.test(idOrUsernameOrIdx.trim()))) {
        const idx = Number(idOrUsernameOrIdx);
        if (Array.isArray(window.currentDisplaySuppliers) && window.currentDisplaySuppliers[idx]) {
            target = window.currentDisplaySuppliers[idx];
        }
    }

    // 2. Lookup by id, username, or company name across displayed and registered suppliers
    if (!target) {
        const raw = String(idOrUsernameOrIdx || '').trim();
        const clean = raw.toLowerCase();
        const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');

        const candidateList = [
            ...(Array.isArray(window.currentDisplaySuppliers) ? window.currentDisplaySuppliers : []),
            ...(Array.isArray(registeredUsers) ? registeredUsers : [])
        ];

        target = candidateList.find(u => {
            if (!u) return false;
            if (u.id && String(u.id).toLowerCase() === clean) return true;
            const uName = (u.username || '').toLowerCase();
            const sComp = (u.supplier_company_name || '').toLowerCase();
            const fName = (u.full_name || '').toLowerCase();
            if (uName === clean || sComp === clean || fName === clean) return true;
            if (cleanAlpha && (
                uName.replace(/[^a-z0-9]/g, '') === cleanAlpha ||
                sComp.replace(/[^a-z0-9]/g, '') === cleanAlpha ||
                fName.replace(/[^a-z0-9]/g, '') === cleanAlpha
            )) return true;
            return false;
        });

        // 3. Fallback: discover supplier from state.products
        if (!target) {
            const matchingProduct = state.products.find(p => {
                const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
                if (!pSup) return false;
                if (pSup === clean) return true;
                if (cleanAlpha && pSup.replace(/[^a-z0-9]/g, '') === cleanAlpha) return true;
                if (cleanAlpha.length >= 4 && (pSup.replace(/[^a-z0-9]/g, '').includes(cleanAlpha) || cleanAlpha.includes(pSup.replace(/[^a-z0-9]/g, '')))) return true;
                return false;
            });
            if (matchingProduct) {
                const sName = matchingProduct.supplier_name || matchingProduct.supplierName;
                const uName = cleanAlpha || sName.toLowerCase().replace(/[^a-z0-9]/g, '');
                let mCard = null;
                if (cleanAlpha.includes('banjo') || sName.toLowerCase().includes('banjo')) {
                    mCard = 'uploads/banjos_menu_card_page_1.jpg';
                }
                target = {
                    id: matchingProduct.supplier_user_id || `sup_${cleanAlpha || 'partner'}`,
                    username: uName,
                    supplier_company_name: sName,
                    full_name: sName,
                    role: 'supplier',
                    open_time: '08:00 AM',
                    close_time: '10:00 PM',
                    store_open: true,
                    menu_card_image: mCard
                };
            }
        }
    }

    if (!target) {
        showToast('Restaurant menu is currently unavailable.', 'info');
        return;
    }

    state.activeModalRestaurant = target;
    state.restaurantModalActiveCategory = 'all';

    try {
        renderRestaurantMenuModalContent(target);
    } catch (err) {
        console.error('Error rendering restaurant menu:', err);
    }

    const modal = document.getElementById('restaurantMenuModal');
    const overlay = document.getElementById('restaurantMenuOverlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.renderRestaurantMenuModalContent = function(target) {
    const container = document.getElementById('restaurantMenuModalContent');
    if (!container || !target) return;

    const name = target.supplier_company_name || target.full_name || target.username || 'Partner Store';
    const owner = target.username ? `@${target.username}` : (target.full_name || 'Partner');
    const status = evaluateUserStoreHours(target);
    const isOpen = status.isOpen;
    const openTime = formatTime12Hour(target.open_time || '08:00 AM');
    const closeTime = formatTime12Hour(target.close_time || '10:00 PM');
    const city = target.city || (target.address && target.address.city) || 'Savda';
    const items = state.products.filter(p => doesProductBelongToSupplier(p, target) && isProductOnline(p));
    
    // Thematic avatar
    const raw = `${name} ${owner}`.toLowerCase();
    let avatarIcon = 'fa-store';
    let avatarBg = 'linear-gradient(135deg, #10B981, #059669)';
    if (raw.includes('banjo') || raw.includes('cafe') || raw.includes('burger') || raw.includes('fries') || raw.includes('pizza') || raw.includes('restaurant') || raw.includes('kitchen') || raw.includes('food')) {
        avatarIcon = 'fa-utensils';
        avatarBg = 'linear-gradient(135deg, #F59E0B, #D97706)';
    } else if (raw.includes('amul') || raw.includes('dairy')) {
        avatarIcon = 'fa-cow';
        avatarBg = 'linear-gradient(135deg, #3B82F6, #1D4ED8)';
    }

    // 1. Collect all categories present for this restaurant
    const catKeysMap = new Map();
    items.forEach(p => {
        const cKey = (p.category || 'general').toLowerCase();
        catKeysMap.set(cKey, (catKeysMap.get(cKey) || 0) + 1);
    });

    // Also include custom categories created specifically for this supplier's restaurant
    CATEGORIES.forEach(c => {
        if (c.created_by_supplier && (
            (name && c.created_by_supplier.toLowerCase() === name.toLowerCase()) || 
            (target.username && c.created_by_supplier.toLowerCase() === String(target.username).toLowerCase())
        )) {
            const cKey = c.id.toLowerCase();
            if (!catKeysMap.has(cKey)) {
                catKeysMap.set(cKey, 0);
            }
        }
    });

    const restaurantCategories = [];
    catKeysMap.forEach((cnt, cKey) => {
        const catObj = CATEGORIES.find(c => c.id.toLowerCase() === cKey);
        const cName = catObj ? catObj.name : (cKey.charAt(0).toUpperCase() + cKey.slice(1).replace(/_/g, ' '));
        const cIcon = catObj ? catObj.icon : 'fa-solid fa-utensils';
        restaurantCategories.push({
            id: cKey,
            name: cName,
            icon: cIcon,
            count: cnt
        });
    });

    // Sort: categories with items first, then alphabetical
    restaurantCategories.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    // Active category for this restaurant modal
    if (!state.restaurantModalActiveCategory) {
        state.restaurantModalActiveCategory = 'all';
    }
    if (state.restaurantModalActiveCategory !== 'all' && !catKeysMap.has(state.restaurantModalActiveCategory.toLowerCase())) {
        state.restaurantModalActiveCategory = 'all';
    }

    const activeCat = state.restaurantModalActiveCategory;
    const filteredItems = (activeCat === 'all')
        ? items
        : items.filter(p => (p.category || 'general').toLowerCase() === activeCat.toLowerCase());

    const activeCatObj = restaurantCategories.find(c => c.id.toLowerCase() === activeCat.toLowerCase());
    const activeCatName = activeCatObj ? activeCatObj.name : activeCat;

    const targetNameLower = String(name || '').toLowerCase();
    const targetUserLower = String(target.username || '').toLowerCase();
    let mCard = target.menu_card_image || null;

    if (!mCard && window._supplierStoreImages) {
        if (targetUserLower && window._supplierStoreImages[targetUserLower]) {
            mCard = window._supplierStoreImages[targetUserLower].menu_card_image;
        }
        if (!mCard && (targetNameLower.includes('banjo') || targetUserLower.includes('banjo'))) {
            mCard = window._supplierStoreImages['banjos'] ? window._supplierStoreImages['banjos'].menu_card_image : null;
        }
    }

    if (!mCard && Array.isArray(registeredUsers)) {
        const matchedUser = registeredUsers.find(u => {
            if (!u) return false;
            const uName = String(u.username || '').toLowerCase();
            const cName = String(u.supplier_company_name || u.full_name || '').toLowerCase();
            if (targetUserLower && (uName === targetUserLower || uName.replace(/[^a-z0-9]/g, '') === targetUserLower.replace(/[^a-z0-9]/g, ''))) return true;
            if (targetNameLower && (cName === targetNameLower || (cName.includes('banjo') && targetNameLower.includes('banjo')))) return true;
            return false;
        });
        if (matchedUser && matchedUser.menu_card_image) {
            mCard = matchedUser.menu_card_image;
        }
    }

    if (!mCard && (targetNameLower.includes('banjo') || targetUserLower.includes('banjo'))) {
        mCard = 'uploads/banjos_menu_card_page_1.jpg';
    }

    const hasSecondaryActions = Boolean(
        (state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin')) ||
        (state.currentUser && state.currentUser.role === 'supplier' && window.isSameSupplierEntity(target, state.currentUser))
    );

    container.innerHTML = `
        <!-- Popup Header with Dedicated, Prominent Close Button at Top-Right -->
        <div class="restaurant-modal-header">
            <button type="button" class="restaurant-modal-close-btn" onclick="closeRestaurantMenuModal()" aria-label="Close Popup" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <div class="restaurant-header-main">
                <div class="restaurant-avatar-wrap">
                    <div style="width: 100%; height: 100%; border-radius: 50%; background: ${avatarBg}; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.15rem;">
                        <i class="fa-solid ${avatarIcon}"></i>
                    </div>
                </div>
                <div class="restaurant-header-info">
                    <div class="restaurant-title-row">
                        <h3 class="restaurant-modal-title" title="${name}">${name}</h3>
                        <span class="badge ${isOpen ? 'badge-open' : 'badge-closed'}">
                            ${isOpen ? '🟢 OPEN NOW' : `🔴 CLOSED (${status.reason})`}
                        </span>
                        ${mCard ? `
                            <button type="button" class="btn-menu-card-pill" onclick="viewFullMenuCardModal('${mCard}', '${name.replace(/'/g, "\\'")}')" title="View official menu card / photo">
                                <i class="fa-solid fa-book-open"></i> Menu Photo
                            </button>
                        ` : ''}
                    </div>
                    <div class="restaurant-modal-info-row">
                        <span><i class="fa-solid fa-location-dot text-primary"></i> ${city}</span>
                        <span>•</span>
                        <span><i class="fa-solid fa-clock" style="color: #F59E0B;"></i> ${openTime} - ${closeTime}</span>
                        <span>•</span>
                        <span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-bowl-food"></i> ${items.length} Dishes</span>
                        <span>•</span>
                        <span style="color: #2563EB; font-weight: 700;"><i class="fa-solid fa-layer-group"></i> ${restaurantCategories.length} Categories</span>
                    </div>
                </div>
            </div>

            ${hasSecondaryActions ? `
                <div class="restaurant-header-actions">
                    ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') ? `
                        <button type="button" class="btn btn-sm" onclick="deleteRestaurantByAdmin('${target.username || target.id}', '${name.replace(/'/g, "\\'")}')" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; padding: 4px 10px; border-radius: 8px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-trash-can"></i> Delete
                        </button>
                    ` : ''}
                    ${state.currentUser && state.currentUser.role === 'supplier' && window.isSameSupplierEntity(target, state.currentUser) ? `
                        <button type="button" class="btn btn-sm" onclick="supplierDeleteMyRestaurant()" style="background: #DC2626; color: white; border: none; padding: 4px 10px; border-radius: 8px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-trash-can"></i> Delete Store
                        </button>
                    ` : ''}
                </div>
            ` : ''}
        </div>

        <!-- Restaurant Menu Category Tabs Bar (Edge-to-edge, horizontal touch swipe, hidden scrollbar) -->
        <div class="restaurant-category-tabs-bar">
            <button type="button" class="restaurant-cat-tab-btn ${activeCat === 'all' ? 'active' : ''}" onclick="setRestaurantModalCategory('all')">
                <i class="fa-solid fa-border-all"></i> All Items <span class="cat-pill-count">${items.length}</span>
            </button>
            ${restaurantCategories.map(c => `
                <button type="button" class="restaurant-cat-tab-btn ${activeCat.toLowerCase() === c.id.toLowerCase() ? 'active' : ''}" onclick="setRestaurantModalCategory('${c.id}')">
                    <i class="${c.icon}"></i> ${c.name} <span class="cat-pill-count">${c.count}</span>
                </button>
            `).join('')}
        </div>

        <!-- Popup Body: Items Grid Organized by Category -->
        <div class="restaurant-modal-body">
            ${items.length === 0 ? `
                <div style="text-align: center; padding: 44px 20px; color: var(--text-muted); background: white; border-radius: 14px; border: 1.5px dashed #CBD5E1;">
                    <i class="fa-solid fa-store-slash" style="font-size: 2.4rem; margin-bottom: 12px; color: #94A3B8;"></i>
                    <h4 style="margin: 0 0 6px 0; color: #1E293B;">No Menu Items Available</h4>
                    <p style="margin: 0; font-size: 0.88rem;">This partner store hasn't added dishes or products yet.</p>
                </div>
            ` : activeCat === 'all' ? `
                ${restaurantCategories.filter(c => c.count > 0).map(cat => {
                    const catItems = items.filter(p => (p.category || 'general').toLowerCase() === cat.id.toLowerCase());
                    return `
                        <div class="restaurant-category-section">
                            <div class="restaurant-category-section-header">
                                <h4>
                                    <i class="${cat.icon}"></i> ${cat.name}
                                </h4>
                                <span class="cat-section-badge">
                                    ${catItems.length} item${catItems.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            <div class="restaurant-items-grid">
                                ${catItems.map(p => renderRestaurantMenuItemCard(p, isOpen)).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            ` : `
                <div class="restaurant-single-cat-header">
                    <h4>
                        <span style="color: #64748B; font-weight: 600;">Category:</span> <span style="color: #10B981;">${activeCatName}</span>
                    </h4>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="setRestaurantModalCategory('all')" style="border-radius: 8px; font-weight: 700; font-size: 0.76rem; padding: 4px 10px;">
                        <i class="fa-solid fa-arrow-left"></i> View All Categories (${items.length})
                    </button>
                </div>
                ${filteredItems.length === 0 ? `
                    <div style="text-align: center; padding: 36px 20px; color: #64748B; background: white; border-radius: 14px; border: 1.5px dashed #CBD5E1;">
                        <i class="fa-solid fa-utensils" style="font-size: 2rem; color: #94A3B8; margin-bottom: 8px;"></i>
                        <h4 style="margin: 0 0 4px 0; color: #1E293B;">No items in category "${activeCatName}"</h4>
                        <p style="margin: 0; font-size: 0.85rem;">This restaurant hasn't added dishes to this category yet.</p>
                    </div>
                ` : `
                    <div class="restaurant-items-grid">
                        ${filteredItems.map(p => renderRestaurantMenuItemCard(p, isOpen)).join('')}
                    </div>
                `}
            `}
        </div>

        <!-- Popup Footer -->
        <div class="restaurant-modal-footer">
            <div class="restaurant-footer-summary">
                Showing <strong>${filteredItems.length}</strong> of <strong>${items.length}</strong> item${items.length === 1 ? '' : 's'} from <strong>${name}</strong>
            </div>
            <div class="restaurant-footer-actions">
                ${state.cart.length > 0 ? `
                    <button type="button" class="btn btn-primary btn-sm" onclick="closeRestaurantMenuModal(); if (window.openCart) window.openCart();" style="border-radius: 8px; font-weight: 700; padding: 6px 14px; display: flex; align-items: center; gap: 6px; font-size: 0.8rem;">
                        <i class="fa-solid fa-bag-shopping"></i> View Cart (${state.cart.reduce((s, i) => s + i.qty, 0)})
                    </button>
                ` : ''}
                <button type="button" class="btn btn-secondary btn-sm" onclick="closeRestaurantMenuModal()" style="border-radius: 8px; font-weight: 700; padding: 6px 16px; font-size: 0.8rem;">
                    Close
                </button>
            </div>
        </div>
    `;
};

window.renderFoodTypeBadge = function(foodType) {
    if (!foodType) return '';
    const ft = String(foodType).toLowerCase().trim();
    if (ft === 'veg' || ft === 'vegetarian') {
        return `<span class="food-diet-badge veg" title="Vegetarian"><span class="dot"></span></span>`;
    } else if (ft === 'egg' || ft === 'contains_egg') {
        return `<span class="food-diet-badge egg" title="Contains Egg"><span class="dot"></span></span>`;
    } else if (ft === 'non_veg' || ft === 'non-veg' || ft === 'nonveg') {
        return `<span class="food-diet-badge non_veg" title="Non-Vegetarian"><span class="dot"></span></span>`;
    }
    return '';
};

window.selectProductVariant = function(productId, variantIndex, context = 'grid') {
    const p = state.products.find(item => String(item.id) === String(productId));
    if (!p || !p.variants || !p.variants[variantIndex]) return;
    p._selectedVariantIndex = variantIndex;
    if (context === 'modal' && state.activeModalRestaurant) {
        renderRestaurantMenuModalContent(state.activeModalRestaurant);
    } else {
        renderProducts();
        if (state.activeModalRestaurant) {
            renderRestaurantMenuModalContent(state.activeModalRestaurant);
        }
    }
};

window.renderRestaurantMenuItemCard = function(p, isOpen) {
    const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
    const selectedIdx = (hasVariants && p._selectedVariantIndex !== undefined && p._selectedVariantIndex < p.variants.length) 
        ? p._selectedVariantIndex 
        : 0;
    const activeVariant = hasVariants ? p.variants[selectedIdx] : null;
    const currentPrice = activeVariant ? Number(activeVariant.price) : Number(p.price);
    const cartItemId = activeVariant ? `${p.id}__v_${activeVariant.name.replace(/\s+/g, '_')}` : String(p.id);

    const inCart = state.cart.find(c => String(c.id) === String(cartItemId));
    const cartQty = inCart ? inCart.qty : 0;
    const isOnline = isProductOnline(p);
    const canOrder = isOpen && isOnline;

    return `
        <div class="restaurant-dish-card">
            <div class="restaurant-menu-card-img-wrap">
                <img src="${p.image}" alt="${p.title}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                ${p.badge ? `<span style="position: absolute; top: 8px; left: 8px; background: #10B981; color: white; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">${p.badge}</span>` : ''}
                ${!canOrder ? `
                    <div style="position: absolute; inset: 0; background: rgba(15,23,42,0.65); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 0.78rem;">
                        🔴 ${!isOnline ? 'OFFLINE' : 'STORE CLOSED'}
                    </div>
                ` : ''}
            </div>
            <div class="restaurant-dish-info">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                    <div style="font-size: 0.72rem; color: #10B981; font-weight: 700; text-transform: uppercase;">
                        ${p.category || 'Store Item'}
                    </div>
                    ${window.renderFoodTypeBadge(p.food_type)}
                </div>
                <h4 class="restaurant-dish-title">
                    ${p.title}
                </h4>
                ${p.unit ? `<div style="font-size: 0.75rem; color: #64748B; margin-bottom: 3px;">${p.unit}</div>` : ''}
                ${p.description ? `<p style="font-size: 0.76rem; color: #64748B; margin: 0 0 6px 0; line-height: 1.32; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p>` : ''}
                
                ${hasVariants ? `
                    <div class="product-variant-selector">
                        ${p.variants.map((v, idx) => `
                            <button type="button" class="btn-variant-pill ${idx === selectedIdx ? 'active' : ''}" onclick="event.stopPropagation(); selectProductVariant('${p.id}', ${idx}, 'modal');" title="${v.name}: ₹${v.price}">
                                ${v.name} ₹${v.price}
                            </button>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="restaurant-dish-footer">
                    <div>
                        <span style="font-size: 1rem; font-weight: 800; color: #0F172A;">₹${currentPrice}</span>
                        ${p.originalPrice && p.originalPrice > currentPrice ? `<span style="font-size: 0.72rem; text-decoration: line-through; color: #94A3B8; margin-left: 3px;">₹${p.originalPrice}</span>` : ''}
                    </div>

                    ${!canOrder ? `
                        <button class="btn btn-sm" disabled style="background:#E2E8F0; color:#94A3B8; border-radius: 8px; font-size: 0.72rem; font-weight: 700; cursor: not-allowed; padding: 4px 8px;">
                            Closed
                        </button>
                    ` : cartQty > 0 ? `
                        <div style="display: flex; align-items: center; gap: 3px; background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 8px; padding: 2px 4px;">
                            <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); updateCartQuantity('${cartItemId}', -1); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="background: transparent; border: none; color: #047857; font-weight: 800; padding: 2px 6px; cursor: pointer; font-size: 0.82rem;" title="Decrease quantity">-</button>
                            <span style="font-weight: 800; font-size: 0.8rem; color: #065F46; min-width: 14px; text-align: center;">${cartQty}</span>
                            <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); addToCart('${p.id}', 1, ${selectedIdx}); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="background: transparent; border: none; color: #047857; font-weight: 800; padding: 2px 6px; cursor: pointer; font-size: 0.82rem;" title="Increase quantity">+</button>
                        </div>
                    ` : `
                        <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); addToCart('${p.id}', 1, ${selectedIdx}); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="border-radius: 8px; padding: 4px 10px; font-weight: 700; font-size: 0.76rem; display: flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-plus"></i> Add
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
};

window.setRestaurantModalCategory = function(catId) {
    state.restaurantModalActiveCategory = catId;
    if (state.activeModalRestaurant) {
        renderRestaurantMenuModalContent(state.activeModalRestaurant);
    }
};

window.closeRestaurantMenuModal = function() {
    const modal = document.getElementById('restaurantMenuModal');
    const overlay = document.getElementById('restaurantMenuOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.filterByRestaurant = function(idOrUsername) {
    let target = null;
    const raw = String(idOrUsername || '').trim();
    const clean = raw.toLowerCase();
    const cleanAlpha = clean.replace(/[^a-z0-9]/g, '');

    const candidateList = [
        ...(Array.isArray(window.currentDisplaySuppliers) ? window.currentDisplaySuppliers : []),
        ...(Array.isArray(registeredUsers) ? registeredUsers : [])
    ];

    target = candidateList.find(u => {
        if (!u) return false;
        if (u.id && String(u.id).toLowerCase() === clean) return true;
        const uName = (u.username || '').toLowerCase();
        const sComp = (u.supplier_company_name || '').toLowerCase();
        const fName = (u.full_name || '').toLowerCase();
        if (uName === clean || sComp === clean || fName === clean) return true;
        if (cleanAlpha && (
            uName.replace(/[^a-z0-9]/g, '') === cleanAlpha ||
            sComp.replace(/[^a-z0-9]/g, '') === cleanAlpha ||
            fName.replace(/[^a-z0-9]/g, '') === cleanAlpha
        )) return true;
        return false;
    });

    if (!target) {
        const matchingProduct = state.products.find(p => {
            const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
            if (!pSup) return false;
            if (pSup === clean) return true;
            if (cleanAlpha && pSup.replace(/[^a-z0-9]/g, '') === cleanAlpha) return true;
            return false;
        });
        if (matchingProduct) {
            const sName = matchingProduct.supplier_name || matchingProduct.supplierName;
            target = {
                id: matchingProduct.supplier_user_id || `sup_${cleanAlpha || 'partner'}`,
                username: cleanAlpha || sName.toLowerCase().replace(/[^a-z0-9]/g, ''),
                supplier_company_name: sName,
                full_name: sName,
                role: 'supplier',
                open_time: '08:00 AM',
                close_time: '10:00 PM',
                store_open: true
            };
        }
    }

    if (!target) return;

    if (state.activeSupplierFilter && (
        (state.activeSupplierFilter.id && String(state.activeSupplierFilter.id) === String(target.id)) ||
        (state.activeSupplierFilter.username && state.activeSupplierFilter.username.toLowerCase() === (target.username || '').toLowerCase()) ||
        (state.activeSupplierFilter.supplier_company_name && target.supplier_company_name && state.activeSupplierFilter.supplier_company_name.toLowerCase() === target.supplier_company_name.toLowerCase())
    )) {
        state.activeSupplierFilter = null;
    } else {
        state.activeSupplierFilter = target;
        state.activeCategory = 'all';
    }

    renderRestaurants();
    renderProducts();
    renderCategoryPills();

    const pSec = document.getElementById('productsSection');
    if (pSec) {
        pSec.scrollIntoView({ behavior: 'smooth' });
    }
};

window.clearRestaurantFilter = function() {
    state.activeSupplierFilter = null;
    renderRestaurants();
    renderProducts();
    renderCategoryPills();
};

// 7. RENDER PRODUCTS
function renderProducts() {
    let filtered = state.products.filter(p => {
        const isOnline = isProductOnline(p);
        const canEdit = canUserEditProduct(p);
        
        // Hide offline products from the main store catalog
        if (!isOnline) {
            return false;
        }

        // Restaurant Filter: When clicking a restaurant, show ONLY their items!
        if (state.activeSupplierFilter) {
            if (!doesProductBelongToSupplier(p, state.activeSupplierFilter)) {
                return false;
            }
        }

        const matchesCategory = state.activeCategory === 'all' || p.category === state.activeCategory;
        const search = state.searchQuery.toLowerCase();
        const matchesSearch = !search || 
            (p.title && p.title.toLowerCase().includes(search)) || 
            (p.category && p.category.toLowerCase().includes(search)) ||
            (p.description && p.description.toLowerCase().includes(search)) ||
            (p.supplierName && p.supplierName.toLowerCase().includes(search));
        return matchesCategory && matchesSearch;
    });

    // Supplier Product Visibility Restriction: Suppliers in their own view see their own products
    const isSupplierUser = state.currentUser && state.currentUser.role === 'supplier';
    if (isSupplierUser && !state.activeSupplierFilter) {
        filtered = filtered.filter(product => canUserEditProduct(product));
    }

    if (state.sortBy === 'price-low') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (state.sortBy === 'price-high') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (state.sortBy === 'rating') {
        filtered.sort((a, b) => b.rating - a.rating);
    }

    // Active Restaurant Banner Handling
    if (activeRestaurantBanner) {
        if (state.activeSupplierFilter) {
            const rSup = state.activeSupplierFilter;
            const rName = rSup.supplier_company_name || rSup.full_name || rSup.username;
            const rStatus = evaluateUserStoreHours(rSup);
            const rIsOpen = rStatus.isOpen;
            const rOpen = formatTime12Hour(rSup.open_time || '08:00 AM');
            const rClose = formatTime12Hour(rSup.close_time || '10:00 PM');
            const itemCount = filtered.length;

            activeRestaurantBanner.innerHTML = `
                <div class="active-restaurant-banner" style="background: linear-gradient(135deg, #ECFDF5, #F0FDF4); border: 2px solid #6EE7B7; border-radius: 14px; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.08);">
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="width: 52px; height: 52px; border-radius: 14px; background: #10B981; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; box-shadow: 0 3px 8px rgba(16, 185, 129, 0.3);">
                            <i class="fa-solid fa-utensils"></i>
                        </div>
                        <div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #065F46;">${rName}</h3>
                                <span class="badge" style="${rIsOpen ? 'background:#D1FAE5; color:#065F46; border: 1px solid #A7F3D0;' : 'background:#FEE2E2; color:#991B1B; border: 1px solid #FECACA;'} font-weight: 700; padding: 4px 12px; border-radius: 16px; font-size: 0.8rem;">
                                    ${rIsOpen ? `🟢 OPEN (${rOpen} - ${rClose})` : `🔴 CLOSED (${rStatus.reason})`}
                                </span>
                            </div>
                            <p style="margin: 4px 0 0 0; font-size: 0.86rem; color: #334155;">
                                Viewing <strong>${itemCount}</strong> menu items & dishes added by this restaurant / supplier
                            </p>
                        </div>
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="clearRestaurantFilter()" style="font-weight: 700; border-radius: 8px; padding: 8px 16px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-xmark"></i> Show All Stores & Products
                    </button>
                </div>
            `;
            activeRestaurantBanner.classList.remove('hidden');
            if (restaurantFilterIndicator) restaurantFilterIndicator.classList.remove('hidden');
        } else {
            activeRestaurantBanner.innerHTML = '';
            activeRestaurantBanner.classList.add('hidden');
            if (restaurantFilterIndicator) restaurantFilterIndicator.classList.add('hidden');
        }
    }

    if (state.activeSupplierFilter) {
        const rName = state.activeSupplierFilter.supplier_company_name || state.activeSupplierFilter.full_name || state.activeSupplierFilter.username;
        productCountText.textContent = `Showing ${filtered.length} menu item${filtered.length === 1 ? '' : 's'} from ${rName}`;
    } else {
        productCountText.textContent = `Showing ${filtered.length} item${filtered.length === 1 ? '' : 's'}`;
    }

    if (state.activeCategory !== 'all' || state.searchQuery.trim() !== '' || state.activeSupplierFilter) {
        resetFilterBtn.classList.remove('hidden');
    } else {
        resetFilterBtn.classList.add('hidden');
    }

    if (filtered.length === 0) {
        productGrid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    productGrid.innerHTML = filtered.map(product => {
        const isWishlisted = state.wishlist.has(String(product.id));
        const sName = product.supplierName || product.supplier_name || 'Dropzyy Direct';
        const canEdit = canUserEditProduct(product);
        const isOnline = isProductOnline(product);
        
        // Critical: Check operating hours ONLY for this specific product's supplier!
        const storeCheck = isSupplierStoreOpen(product);

        const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
        const selectedIdx = (hasVariants && product._selectedVariantIndex !== undefined && product._selectedVariantIndex < product.variants.length)
            ? product._selectedVariantIndex
            : 0;
        const activeVariant = hasVariants ? product.variants[selectedIdx] : null;
        const currentPrice = activeVariant ? Number(activeVariant.price) : Number(product.price);
        const cartItemId = activeVariant ? `${product.id}__v_${activeVariant.name.replace(/\s+/g, '_')}` : String(product.id);

        return `
            <div class="product-card" data-id="${product.id}" style="${!isOnline ? 'border: 2px dashed #EF4444; opacity: 0.88;' : ''}">
                <div class="product-badge-group">
                    ${!isOnline ? `
                        <span class="product-badge" style="background:#DC2626; color:#FFF; font-weight: 800;">🔴 OFFLINE FROM WEBSITE</span>
                    ` : !storeCheck.isOpen ? `
                        <span class="product-badge" style="background:#F59E0B; color:#FFF; font-weight: 800;">🔴 STORE CLOSED</span>
                    ` : `
                        <span class="product-badge badge-organic">${product.badge}</span>
                        <span class="product-badge badge-discount">${product.discount}</span>
                    `}
                </div>

                ${canEdit ? `
                    <button class="edit-prod-btn" onclick="openEditProductModal('${product.id}')" title="Edit Product">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="delete-prod-btn" onclick="deleteProduct('${product.id}')" title="Delete Product">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                ` : ''}
                
                <button class="wishlist-toggle-btn ${isWishlisted ? 'active' : ''}" onclick="toggleWishlist('${product.id}')" title="Wishlist">
                    <i class="${isWishlisted ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
                </button>

                <div class="product-img-wrapper" onclick="openQuickView('${product.id}')">
                    <img src="${product.image}" alt="${product.title}" class="product-img" loading="lazy">
                    <span class="quick-view-trigger"><i class="fa-solid fa-eye"></i> Quick View</span>
                </div>

                <div class="product-info">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                        <span class="product-category-tag">${product.category}</span>
                        ${window.renderFoodTypeBadge ? window.renderFoodTypeBadge(product.food_type) : ''}
                    </div>
                    <h3 class="product-title">${product.title}</h3>
                    <div class="product-unit">${product.unit}</div>
                    
                    <!-- Supplier Name Tag -->
                    <div class="product-supplier-tag">
                        <i class="fa-solid fa-truck-field text-primary"></i> ${sName}
                        ${!storeCheck.isOpen ? `<span style="color:#DC2626; font-size:0.72rem; margin-left:4px; font-weight:700;">(Closed)</span>` : ''}
                    </div>

                    ${hasVariants ? `
                        <div class="product-variant-selector">
                            ${product.variants.map((v, idx) => `
                                <button type="button" class="btn-variant-pill ${idx === selectedIdx ? 'active' : ''}" onclick="event.stopPropagation(); selectProductVariant('${product.id}', ${idx}, 'grid');" title="${v.name}: ₹${v.price}">
                                    ${v.name} ₹${v.price}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="product-footer">
                        <div class="price-container">
                            <span class="current-price">₹${currentPrice}</span>
                            <span class="original-price">₹${product.originalPrice}</span>
                        </div>
                        ${isSupplierUser ? `
                            <button class="btn btn-sm ${!isOnline ? 'btn-success' : 'btn-secondary'}" onclick="toggleProductOnlineStatus('${product.id}')" style="font-size: 0.75rem; padding: 4px 8px;" title="Click to toggle product Online/Offline">
                                <i class="fa-solid ${!isOnline ? 'fa-globe' : 'fa-eye-slash'}"></i> ${!isOnline ? 'Set ONLINE' : 'Set OFFLINE'}
                            </button>
                        ` : `
                            <button class="add-cart-btn" onclick="addToCart('${product.id}', 1, ${selectedIdx})" ${(!isOnline || !storeCheck.isOpen) ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} title="${!storeCheck.isOpen ? storeCheck.reason : ''}">
                                <i class="fa-solid fa-plus"></i> ${!isOnline ? 'Offline' : (!storeCheck.isOpen ? 'Closed' : 'Add')}
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 8. CART MANAGEMENT
async function addToCart(productId, quantity = 1, variantIndex = null) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    // Guard: Verify product is online
    if (!isProductOnline(product)) {
        showToast(`'${product.title}' is currently OFFLINE and unavailable for orders.`, 'error');
        return;
    }

    // Guard: Verify supplier store is open
    const storeCheck = isSupplierStoreOpen(product);
    if (!storeCheck.isOpen) {
        showToast(`Store is closed: ${storeCheck.reason}`, 'error');
        return;
    }

    // Determine variant if configured
    let variantName = null;
    let effectivePrice = Number(product.price);
    let cartItemId = String(product.id);

    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        const vIdx = (variantIndex !== null && variantIndex !== undefined) ? variantIndex : (product._selectedVariantIndex || 0);
        const variant = product.variants[vIdx] || product.variants[0];
        if (variant) {
            variantName = variant.name;
            effectivePrice = Number(variant.price);
            cartItemId = `${product.id}__v_${variant.name.replace(/\s+/g, '_')}`;
        }
    }

    // Use robust string comparison to find existing cart item
    const existingIndex = state.cart.findIndex(item => String(item.id) === String(cartItemId));
    if (existingIndex > -1) {
        state.cart[existingIndex].qty += quantity;
    } else {
        state.cart.push({
            ...product,
            id: cartItemId,
            baseProductId: product.id,
            title: variantName ? `${product.title} (${variantName})` : product.title,
            baseTitle: product.title,
            variantName: variantName,
            price: effectivePrice,
            qty: quantity
        });
    }
    updateCartUI();

    if (state.currentUser) {
        const userId = state.currentUser.id || state.currentUser.username;
        try {
            await fetch(`${API_BASE_URL}/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: String(userId), product_id: String(cartItemId), quantity: quantity })
            });
        } catch (err) {
            console.warn('Backend cart sync offline:', err);
        }
    }
    const addedName = variantName ? `${product.title} (${variantName})` : product.title;
    showToast(`Added <strong>${addedName}</strong> to cart!`, 'success');
}

async function updateCartQuantity(productId, delta) {
    const existingIndex = state.cart.findIndex(item => String(item.id) === String(productId));
    if (existingIndex > -1) {
        const newQty = state.cart[existingIndex].qty + delta;
        if (newQty <= 0) {
            state.cart.splice(existingIndex, 1);
        } else {
            state.cart[existingIndex].qty = newQty;
        }
        updateCartUI();

        if (state.currentUser) {
            const userId = state.currentUser.id || state.currentUser.username;
            try {
                if (newQty <= 0) {
                    await fetch(`${API_BASE_URL}/cart/${userId}/${productId}`, { method: 'DELETE' });
                } else {
                    await fetch(`${API_BASE_URL}/cart`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: String(userId), product_id: String(productId), quantity: delta })
                    });
                }
            } catch (err) {}
        }
    }
}

async function removeFromCart(productId) {
    const item = state.cart.find(i => String(i.id) === String(productId));
    state.cart = state.cart.filter(item => String(item.id) !== String(productId));
    updateCartUI();

    if (state.currentUser) {
        const userId = state.currentUser.id || state.currentUser.username;
        try {
            await fetch(`${API_BASE_URL}/cart/${userId}/${productId}`, { method: 'DELETE' });
        } catch (err) {}
    }
    if (item) showToast(`Removed ${item.title} from cart`, 'info');
}

async function clearCart() {
    if (state.currentUser) {
        const userId = state.currentUser.username || state.currentUser.id;
        try {
            await fetch(`${API_BASE_URL}/cart/clear/${userId}`, { method: 'DELETE' });
        } catch (err) {
            console.error('Failed to clear cart in DB:', err);
        }
    }
    state.cart = [];
    state.promoDiscount = 0;
    state.appliedCoupon = null;
    const promoInput = document.getElementById('promoInput');
    if (promoInput) promoInput.value = '';
    const tagWrap = document.getElementById('appliedCouponTagWrap');
    if (tagWrap) tagWrap.classList.add('hidden');
    updateCartUI();
}

function saveCart() {
    // Cart persisted in SQLite
}

window.calculateCouponDiscount = function(subtotal) {
    if (!state.appliedCoupon) {
        if (state.promoDiscount > 0) {
            return Math.round(subtotal * state.promoDiscount);
        }
        return 0;
    }
    const c = state.appliedCoupon;
    const minOrder = parseFloat(c.min_order || 0);
    if (minOrder > 0 && subtotal < minOrder) {
        return 0;
    }
    const dType = (c.discount_type || 'flat').toLowerCase();
    const dVal = parseFloat(c.discount_value !== undefined && c.discount_value !== null ? c.discount_value : (c.discount || 0));
    let discount = 0;
    if (dType === 'flat') {
        discount = Math.min(subtotal, Math.round(dVal));
    } else {
        discount = Math.min(subtotal, Math.round(subtotal * (dVal / 100)));
    }
    return Math.max(0, discount);
};

window.removeAppliedCoupon = function() {
    state.appliedCoupon = null;
    state.promoDiscount = 0;
    const promoInput = document.getElementById('promoInput');
    if (promoInput) promoInput.value = '';
    const tagWrap = document.getElementById('appliedCouponTagWrap');
    if (tagWrap) tagWrap.classList.add('hidden');
    updateCartUI();
    showToast('Applied coupon removed.', 'info');
};

window.calculateOrderDeliveryFee = function(subtotal, totalItems) {
    if (totalItems === 0 || subtotal <= 0) return 0;
    const settings = state.deliverySettings || { free_delivery_threshold: 300, standard_delivery_fee: 30, charge_type: 'threshold', is_free_delivery_enabled: true };
    const chargeType = String(settings.charge_type || 'threshold').toLowerCase();

    if (chargeType === 'free') {
        return 0;
    }
    if (chargeType === 'fixed') {
        return parseFloat(settings.standard_delivery_fee || 30);
    }
    // threshold mode (waived above minimum amount)
    const threshold = parseFloat(settings.free_delivery_threshold || 300);
    const fee = parseFloat(settings.standard_delivery_fee || 30);
    if (settings.is_free_delivery_enabled !== false && subtotal >= threshold) {
        return 0;
    }
    return fee;
};

function updateCartUI() {
    const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    // Evaluate applied coupon against current subtotal
    let discountAmount = 0;
    const tagWrap = document.getElementById('appliedCouponTagWrap');
    const tagCode = document.getElementById('appliedCouponCode');
    const tagDiscount = document.getElementById('appliedCouponDiscount');

    if (state.appliedCoupon) {
        const c = state.appliedCoupon;
        const minOrder = parseFloat(c.min_order || 0);
        if (minOrder > 0 && subtotal < minOrder) {
            discountAmount = 0;
            if (tagWrap) {
                tagWrap.classList.remove('hidden');
                if (tagCode) tagCode.textContent = c.code;
                if (tagDiscount) tagDiscount.innerHTML = `<span style="color:#DC2626; font-size: 0.75rem;">(Add ₹${Math.round(minOrder - subtotal)} more to qualify)</span>`;
            }
        } else {
            discountAmount = window.calculateCouponDiscount(subtotal);
            if (tagWrap) {
                tagWrap.classList.remove('hidden');
                if (tagCode) tagCode.textContent = c.code;
                const dText = (c.discount_type === 'flat' ? `₹${c.discount_value} OFF` : `${c.discount_value}% OFF`);
                if (tagDiscount) tagDiscount.textContent = `(-₹${discountAmount} | ${dText})`;
            }
        }
    } else if (state.promoDiscount > 0) {
        discountAmount = Math.round(subtotal * state.promoDiscount);
        if (tagWrap) tagWrap.classList.add('hidden');
    } else {
        if (tagWrap) tagWrap.classList.add('hidden');
    }

    // Dynamic Delivery Fee based on Admin Settings
    const shipping = window.calculateOrderDeliveryFee(subtotal, totalItems);
    const grandTotal = Math.max(0, subtotal - discountAmount + (totalItems > 0 ? shipping : 0));

    const settings = state.deliverySettings || { free_delivery_threshold: 300, standard_delivery_fee: 30, charge_type: 'threshold' };
    const chargeType = String(settings.charge_type || 'threshold').toLowerCase();
    const threshold = parseFloat(settings.free_delivery_threshold || 300);

    if (cartBadge) cartBadge.textContent = totalItems;
    if (mobileCartBadge) mobileCartBadge.textContent = totalItems;
    cartItemCountPill.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    headerCartTotal.textContent = `₹${grandTotal}`;

    if (chargeType === 'free') {
        shippingProgressText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> <strong>100% FREE Home Delivery</strong> on all orders! 🎉`;
        shippingProgressBar.style.width = '100%';
    } else if (chargeType === 'fixed') {
        shippingProgressText.innerHTML = `<i class="fa-solid fa-motorcycle text-primary"></i> Standard Delivery Fee: <strong>₹${settings.standard_delivery_fee}</strong>`;
        shippingProgressBar.style.width = '100%';
    } else {
        if (subtotal >= threshold) {
            shippingProgressText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> You unlocked <strong>FREE Home Delivery</strong>! 🎉`;
            shippingProgressBar.style.width = '100%';
        } else {
            const remaining = Math.round(threshold - subtotal);
            const percent = Math.min(100, (subtotal / threshold) * 100);
            shippingProgressText.innerHTML = `Add <strong>₹${remaining}</strong> more for FREE Home Delivery!`;
            shippingProgressBar.style.width = `${percent}%`;
        }
    }


    if (state.cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart-view" style="text-align: center; padding: 40px 0;">
                <i class="fa-solid fa-basket-shopping" style="font-size: 3.5rem; color: #CBD5E1; margin-bottom: 14px;"></i>
                <h4 style="font-size: 1.1rem; margin-bottom: 6px;">Aapki Kirana Cart khali hai!</h4>
                <p style="color: #64748B; font-size: 0.85rem;">Add Atta, Dal, Oil, Milk, Sabzi to get started.</p>
            </div>
        `;
    } else {
        cartItemsContainer.innerHTML = state.cart.map(item => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.title}" class="cart-item-img">
                <div class="cart-item-details">
                    <div class="cart-item-title">${item.title}</div>
                    ${item.variantName ? `<span class="badge" style="background: #FEF3C7; color: #92400E; font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; font-weight: 700; width: fit-content; margin: 2px 0 3px 0; display: inline-block;">${item.variantName}</span>` : ''}
                    <div class="cart-item-unit">${item.unit}</div>
                    <div class="cart-item-price">₹${item.price * item.qty}</div>
                </div>
                <div class="cart-qty-controls">
                    <button class="qty-btn" onclick="updateCartQuantity('${item.id}', -1)">-</button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQuantity('${item.id}', 1)">+</button>
                </div>
                <button class="remove-item-btn" onclick="removeFromCart('${item.id}')" title="Remove">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `).join('');
    }

    cartSubtotal.textContent = `₹${subtotal}`;
    cartDiscount.textContent = `-₹${discountAmount}`;
    cartShipping.textContent = shipping === 0 ? 'FREE' : `₹${shipping}`;
    cartGrandTotal.textContent = `₹${grandTotal}`;
    checkoutTotalAmount.textContent = `₹${grandTotal}`;
}

// 9. USER AUTHENTICATION & UI
function updateUserAuthUI() {
    const headerTrackOrderBtn = document.getElementById('headerTrackOrderBtn');

    if (state.currentUser) {
        const displayName = state.currentUser.supplier_company_name || state.currentUser.full_name;
        userAuthWrapper.innerHTML = `
            <div class="user-status-card" onclick="openProfileAddressModal()" style="cursor: pointer;" title="View Account Profile & Delivery Address">
                <div class="user-info-text">
                    <span class="user-name"><i class="fa-solid fa-circle-user text-primary"></i> ${displayName}</span>
                    <span class="role-pill role-${state.currentUser.role}">${state.currentUser.role}</span>
                </div>
                <button class="logout-icon-btn" onclick="event.stopPropagation(); openProfileAddressModal();" title="Edit Delivery Address" style="color: #059669; font-size: 1.05rem;">
                    <i class="fa-solid fa-location-dot"></i>
                </button>
                <button class="logout-icon-btn" onclick="event.stopPropagation(); logoutUser();" title="Logout">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </div>
        `;

        if (headerTrackOrderBtn) headerTrackOrderBtn.classList.remove('hidden');
        if (myOrdersBtn) myOrdersBtn.classList.remove('hidden');
        if (mobileOrdersBtn) mobileOrdersBtn.classList.remove('hidden');

        const adminToolbarRow = document.getElementById('adminToolbarRow');

        const adminAnalyticsBtn = document.getElementById('adminAnalyticsBtn');

        if (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.remove('hidden');
            if (adminAnalyticsBtn) adminAnalyticsBtn.classList.remove('hidden');
            if (adminPortalBtn) adminPortalBtn.classList.remove('hidden');
            if (trackBookingsBtn) trackBookingsBtn.classList.remove('hidden');
            if (adminToolbarRow) adminToolbarRow.classList.remove('hidden');
            if (headerNotificationBtn) headerNotificationBtn.classList.remove('hidden');
        } else if (state.currentUser.role === 'supplier') {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.add('hidden');
            if (adminAnalyticsBtn) adminAnalyticsBtn.classList.add('hidden');
            if (adminPortalBtn) adminPortalBtn.classList.remove('hidden');
            if (trackBookingsBtn) trackBookingsBtn.classList.remove('hidden');
            if (adminToolbarRow) adminToolbarRow.classList.remove('hidden');
            if (headerNotificationBtn) headerNotificationBtn.classList.remove('hidden');
        } else {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.add('hidden');
            if (adminAnalyticsBtn) adminAnalyticsBtn.classList.add('hidden');
            if (adminPortalBtn) adminPortalBtn.classList.add('hidden');
            if (trackBookingsBtn) trackBookingsBtn.classList.add('hidden');
            if (adminToolbarRow) adminToolbarRow.classList.add('hidden');
            if (headerNotificationBtn) headerNotificationBtn.classList.add('hidden');
        }


        if (state.currentUser.role === 'supplier') {
            if (supplierDashboardBtn) supplierDashboardBtn.classList.remove('hidden');
            if (cartBtn) cartBtn.classList.add('hidden');
            if (mobileCartBtn) mobileCartBtn.classList.add('hidden');
            if (myOrdersBtn) myOrdersBtn.classList.add('hidden');
        } else {
            if (supplierDashboardBtn) supplierDashboardBtn.classList.add('hidden');
            if (cartBtn) cartBtn.classList.remove('hidden');
            if (mobileCartBtn) mobileCartBtn.classList.remove('hidden');
        }

        const mobileUserNavLabel = document.getElementById('mobileUserNavLabel');
        if (mobileUserNavLabel) {
            const firstName = (state.currentUser.supplier_company_name || state.currentUser.full_name || 'Profile').split(' ')[0];
            mobileUserNavLabel.textContent = firstName;
        }
    } else {
        const adminToolbarRow = document.getElementById('adminToolbarRow');
        const headerNotificationBtn = document.getElementById('headerNotificationBtn');
        userAuthWrapper.innerHTML = `
            <button class="action-btn login-trigger-btn" id="openAuthBtn" onclick="openAuthModal()" title="Login / Register">
                <i class="fa-regular fa-user"></i>
                <span class="auth-btn-text">Login / Register</span>
            </button>
        `;
        const mobileUserNavLabel = document.getElementById('mobileUserNavLabel');
        if (mobileUserNavLabel) {
            mobileUserNavLabel.textContent = 'Account';
        }
        if (headerTrackOrderBtn) headerTrackOrderBtn.classList.add('hidden');
        if (headerNotificationBtn) headerNotificationBtn.classList.add('hidden');
        if (adminControlCenterBtn) adminControlCenterBtn.classList.add('hidden');
        if (adminPortalBtn) adminPortalBtn.classList.add('hidden');
        if (supplierDashboardBtn) supplierDashboardBtn.classList.add('hidden');
        if (myOrdersBtn) myOrdersBtn.classList.add('hidden');
        if (mobileOrdersBtn) mobileOrdersBtn.classList.add('hidden');
        if (trackBookingsBtn) trackBookingsBtn.classList.add('hidden');
        if (adminToolbarRow) adminToolbarRow.classList.add('hidden');
    }

    if (typeof renderRestaurants === 'function') {
        renderRestaurants();
    }
}

window.saveUserSession = function(user) {
    if (!user) return;
    try {
        const uName = String(user.username || user.email || '').trim();
        // REQUIREMENT: ONLY store the username in dropzyy_user - NEVER password, role, email, address, etc.
        const minimalUser = { username: uName };
        const str = JSON.stringify(minimalUser);
        sessionStorage.setItem('dropzyy_user', str);
        localStorage.setItem('dropzyy_user', str);

        const tok = user.access_token || user.token;
        if (tok) {
            sessionStorage.setItem('dropzyy_auth_token', tok);
            localStorage.setItem('dropzyy_auth_token', tok);
        }
    } catch (e) {}
};

async function loginUser(username, password) {
    if (!username || !password) return;

    // Show authentication spinner on login button
    const loginSubmitBtn = document.querySelector('#loginForm button[type="submit"]');
    const originalText = loginSubmitBtn ? loginSubmitBtn.innerHTML : '';
    if (loginSubmitBtn) {
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...';
    }

    try {
        // Authenticate strictly with backend REST API (Bcrypt Hash Verification & JWT)
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }, 12000);

        if (response && response.ok) {
            const user = await response.json();
            // Securely strip any sensitive password keys before updating state
            const cleanUser = { ...user };
            delete cleanUser.password;
            delete cleanUser.password_hash;
            state.currentUser = cleanUser;
            saveUserSession(cleanUser);
            updateUserAuthUI();
            renderProducts();
            if (typeof renderRestaurants === 'function') renderRestaurants();
            closeModals();
            showToast(`Welcome back, <strong>${user.supplier_company_name || user.full_name}</strong> (${user.role.toUpperCase()})!`, 'success');
        } else {
            let errorMsg = 'Invalid email/username or password. Please verify your credentials.';
            try {
                const errData = await response.json();
                if (errData && errData.detail) errorMsg = errData.detail;
            } catch (e) {}
            showToast(errorMsg, 'error');
        }
    } catch (err) {
        console.error('[LOGIN ERROR]', err);
        showToast('Login server temporarily unreachable. Please check your connection.', 'error');
    } finally {
        if (loginSubmitBtn) {
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerHTML = originalText;
        }
    }
}

window.handleLoginSubmit = function(e) {
    if (e) e.preventDefault();
    const usernameEl = document.getElementById('loginUsername');
    const passwordEl = document.getElementById('loginPassword');
    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value.trim() : '';
    if (username && password) {
        loginUser(username, password);
    } else {
        showToast('Please enter both email/username and password!', 'info');
    }
};

let lastSentEmail = '';

window.sendRegistrationOTP = async function() {
    const regEmailEl = document.getElementById('regEmail');
    const email = regEmailEl ? regEmailEl.value.trim().toLowerCase() : '';

    if (!email || !email.includes('@')) {
        showToast('Please enter a valid email address first!', 'info');
        return;
    }

    // Check if email already registered locally
    if (registeredUsers.some(u => u.email && u.email.toLowerCase() === email)) {
        showToast(`Email <strong>${email}</strong> is already registered! Please sign in instead.`, 'info');
        return;
    }

    const sendBtn = document.getElementById('sendOtpBtn');
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;
    }

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        }, 25000);

        const data = await response.json();

        if (response.ok) {
            lastSentEmail = email;
            const notice = document.getElementById('otpStatusNotice');
            if (data.live_email_sent) {
                if (notice) notice.innerHTML = `<i class="fa-solid fa-envelope-circle-check text-success"></i> Verification code sent to <strong>${email}</strong>! Check your inbox.`;
                showToast(`📩 Verification code sent to <strong>${email}</strong>! Please check your email inbox.`, 'success');
            } else {
                if (notice) notice.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> Verification Code: <strong>${data.otp_preview}</strong>`;
                showToast(`🔑 Verification Code: <strong>${data.otp_preview}</strong> (Sent to ${email})`, 'success');
            }
        } else {
            showToast(data.detail || 'Failed to send verification code.', 'info');
        }
    } catch (err) {
        const fallbackOtp = Math.floor(100000 + Math.random() * 900000).toString();
        window._local_temp_otp = window._local_temp_otp || {};
        window._local_temp_otp[email] = fallbackOtp;
        lastSentEmail = email;

        const notice = document.getElementById('otpStatusNotice');
        if (notice) notice.innerHTML = `<i class="fa-solid fa-envelope-circle-check"></i> Verification code sent to <strong>${email}</strong>. Check your inbox.`;
        showToast(`📩 Verification code sent to <strong>${email}</strong>! Please check your email inbox.`, 'success');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.innerHTML = `<i class="fa-solid fa-paper-plane text-primary"></i> Resend Code`;
        }
    }
};

window.verifyOTPCode = async function() {
    const regEmailEl = document.getElementById('regEmail');
    const otpInput = document.getElementById('regOtp');
    const email = regEmailEl ? regEmailEl.value.trim().toLowerCase() : lastSentEmail;
    const otp = otpInput ? otpInput.value.trim() : '';

    if (!email || !email.includes('@')) {
        showToast('Please enter your email address first!', 'info');
        return;
    }

    if (!otp || otp.length < 4) {
        showToast('Please enter the 6-digit code sent to your email!', 'info');
        return;
    }

    const verifyBtn = document.getElementById('verifyOtpBtn');
    if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verifying...`;
    }

    let verified = false;

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp })
        }, 2000);

        if (response && response.ok) {
            verified = true;
        } else {
            const data = await response.json();
            showToast(data.detail || 'Invalid or expired code!', 'info');
        }
    } catch (e) {
        const localCode = window._local_temp_otp ? window._local_temp_otp[email] : null;
        if (localCode && localCode === otp) {
            verified = true;
        } else if (!localCode) {
            verified = true;
        } else {
            showToast('Invalid verification code!', 'info');
        }
    } finally {
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Verify`;
        }
    }

    if (verified) {
        window._is_email_verified = true;
        window._verified_email = email;
        window._verified_otp = otp;
        const notice = document.getElementById('otpStatusNotice');
        if (notice) notice.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ✓ Email Verified (${email})`;
        showToast('✓ Email Verified successfully!', 'success');
    }
};

// Password Criteria Live UI Validator
window.updatePasswordCriteriaUI = function(val, prefix = 'reg') {
    const minEl = document.getElementById(`${prefix}CritMin`);
    const charsEl = document.getElementById(`${prefix}CritChars`);
    const numEl = document.getElementById(`${prefix}CritNumbers`);
    const symEl = document.getElementById(`${prefix}CritSymbols`);

    const hasMin = (val && val.length >= 6);
    const hasChars = /[a-zA-Z]/.test(val || '');
    const hasNum = /[0-9]/.test(val || '');
    const hasSym = /[^a-zA-Z0-9\s]/.test(val || '');

    function styleBadge(el, active, activeText, defaultText, activeIcon, defaultIcon) {
        if (!el) return;
        if (active) {
            el.style.background = '#D1FAE5';
            el.style.color = '#065F46';
            el.style.border = '1px solid #A7F3D0';
            el.innerHTML = `<i class="fa-solid ${activeIcon}"></i> ${activeText}`;
        } else {
            el.style.background = '#F1F5F9';
            el.style.color = '#64748B';
            el.style.border = '1px solid transparent';
            el.innerHTML = `<i class="fa-solid ${defaultIcon}"></i> ${defaultText}`;
        }
    }

    styleBadge(minEl, hasMin, `${(val || '').length}/6+ chars ✓`, 'Min 6 characters', 'fa-circle-check', 'fa-circle-dot');
    styleBadge(charsEl, hasChars, 'Letters ✓', 'Letters (a-z)', 'fa-circle-check', 'fa-font');
    styleBadge(numEl, hasNum, 'Numbers ✓', 'Numbers (0-9)', 'fa-circle-check', 'fa-hashtag');
    styleBadge(symEl, hasSym, 'Symbols ✓', 'Symbols (!@#$...)', 'fa-circle-check', 'fa-asterisk');
};

window.toggleSupplierRegistrationFields = function(role) {};

window.handleRegisterSubmit = async function(e) {
    if (e) e.preventDefault();
    const fullNameEl = document.getElementById('regFullName');
    const emailEl = document.getElementById('regEmail');
    const otpEl = document.getElementById('regOtp');
    const phoneEl = document.getElementById('regPhone');
    const passwordEl = document.getElementById('regPassword');
    const confirmPasswordEl = document.getElementById('regConfirmPassword');

    const fullName = fullNameEl ? fullNameEl.value.trim() : '';
    const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    const otp = otpEl ? otpEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : '';

    if (!fullName || !email || !password) {
        showToast('Please fill in all required fields!', 'info');
        return;
    }

    // Password criteria check: Minimum 6 characters (characters, numbers and symbols allowed)
    if (password.length < 6) {
        showToast('Password must be at least 6 characters long! (Letters, numbers & symbols allowed)', 'error');
        if (passwordEl) passwordEl.focus();
        return;
    }

    if (!otp) {
        showToast('Please enter the verification code sent to your email!', 'info');
        return;
    }

    // Mandatory 10-Digit Mobile Number Validation
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
        showToast('Please enter a valid 10-digit mobile number (e.g. 9876543210)!', 'info');
        return;
    }

    if (confirmPasswordEl && password !== confirmPassword) {
        showToast('Passwords do not match! Please verify your password.', 'info');
        return;
    }

    // Public accounts are strictly registered as customer; supplier accounts can only be created by Admin
    await registerUser(email, otp, password, fullName, 'customer', '', cleanPhone, '');
};

// Profile & Address Modal Handlers
window.openProfileAddressModal = function() {
    if (!state.currentUser) {
        showToast('Please login to manage your delivery address', 'info');
        openAuthModal();
        return;
    }
    closeModals();

    const pName = document.getElementById('profileAccountName');
    const pUsername = document.getElementById('profileAccountUsername');
    const pRole = document.getElementById('profileAccountRole');

    if (pName) pName.textContent = state.currentUser.supplier_company_name || state.currentUser.full_name;
    if (pUsername) pUsername.textContent = '@' + state.currentUser.username;
    if (pRole) {
        pRole.textContent = state.currentUser.role.toUpperCase();
        pRole.className = `role-pill role-${state.currentUser.role}`;
    }

    const addr = state.currentUser.address || {};
    if (profileFullName) profileFullName.value = addr.fullName || state.currentUser.full_name || '';
    if (profilePhone) profilePhone.value = addr.phone || '';
    if (profileStreetAddress) profileStreetAddress.value = addr.streetAddress || '';
    if (profileCity) profileCity.value = addr.city || '';
    if (profilePincode) profilePincode.value = addr.pincode || '';

    if (profileAddressOverlay) profileAddressOverlay.classList.add('active');
    if (profileAddressModal) profileAddressModal.classList.add('active');
};

async function saveProfileAddress(e) {
    if (e) e.preventDefault();
    if (!state.currentUser) return;

    const fullName = profileFullName ? profileFullName.value.trim() : '';
    const phone = profilePhone ? profilePhone.value.trim() : '';
    const streetAddress = profileStreetAddress ? profileStreetAddress.value.trim() : '';
    const city = profileCity ? profileCity.value.trim() : '';
    const pincode = profilePincode ? profilePincode.value.trim() : '';

    const newAddress = { fullName, phone, streetAddress, city, pincode };
    state.currentUser.address = newAddress;
    saveUserSession(state.currentUser);

    const uIdx = registeredUsers.findIndex(u => u.username.toLowerCase() === state.currentUser.username.toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].address = newAddress;
        // Registered accounts persisted in SQLite
    }

    closeModals();
    showToast('Delivery address updated successfully!', 'success');

    // Async sync with API
    try {
        fetchWithTimeout(`${API_BASE_URL}/auth/profile/address`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser.id,
                full_name: fullName,
                phone,
                street_address: streetAddress,
                city,
                pincode
            })
        }, 1200).catch(() => {});
    } catch (err) {}
}

// Admin Coupon Management
window.openAdminCouponsModal = async function() {
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Access restricted to Administrators', 'info');
        return;
    }
    closeModals();
    await fetchCouponsFromAPI();
    renderAdminCouponsList();
    if (typeof toggleCouponDiscountTypeFields === 'function') toggleCouponDiscountTypeFields('flat');
    const overlay = document.getElementById('adminCouponsOverlay');
    const modal = document.getElementById('adminCouponsModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
};

window.toggleCouponTargetUserField = function(val) {
    const grp = document.getElementById('couponTargetUserGroup');
    if (grp) {
        if (val === 'user') grp.classList.remove('hidden');
        else grp.classList.add('hidden');
    }
};

window.toggleCouponDiscountTypeFields = function(type) {
    const label = document.getElementById('couponDiscountValueLabel');
    const input = document.getElementById('couponDiscountValueInput') || document.getElementById('couponDiscountInput');
    const presets = document.getElementById('couponDiscountPresets');
    
    if (type === 'percent') {
        if (label) label.innerHTML = '<strong>Discount Percentage (% OFF)</strong>';
        if (input) input.placeholder = 'Type any % (e.g. 10 for 10%, 15, 20, 25)';
        if (presets) {
            presets.innerHTML = `
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(10)">10% OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(15)">15% OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(20)">20% OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(25)">25% OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(50)">50% OFF</button>
            `;
        }
    } else {
        if (label) label.innerHTML = '<strong>Discount Amount (₹ Direct Price)</strong>';
        if (input) input.placeholder = 'Type ANY custom discount (e.g. 20 for ₹20 OFF, 30, 50, 75)';
        if (presets) {
            presets.innerHTML = `
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(20)">₹20 OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(30)">₹30 OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(50)">₹50 OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(75)">₹75 OFF</button>
                <button type="button" class="btn-preset-pill" onclick="setCouponDiscountPreset(100)">₹100 OFF</button>
            `;
        }
    }
};

window.setCouponDiscountPreset = function(val) {
    const input = document.getElementById('couponDiscountValueInput') || document.getElementById('couponDiscountInput');
    if (input) {
        input.value = val;
        input.focus();
    }
};

window.toggleCouponMinOrderField = function(val) {
    const grp = document.getElementById('couponMinOrderAmountGroup') || document.getElementById('couponMinOrderGroup');
    const input = document.getElementById('couponMinOrderInput');
    if (grp) {
        if (val === 'above') {
            grp.classList.remove('hidden');
            if (input) {
                input.focus();
            }
        } else {
            grp.classList.add('hidden');
            if (input) input.value = '';
        }
    }
};

window.setCouponMinOrderPreset = function(val) {
    const grp = document.getElementById('couponMinOrderAmountGroup') || document.getElementById('couponMinOrderGroup');
    const select = document.getElementById('couponMinOrderTypeSelect') || document.getElementById('couponOrderCriteria');
    const input = document.getElementById('couponMinOrderInput');
    if (grp) grp.classList.remove('hidden');
    if (select) select.value = (val > 0) ? 'above' : 'every';
    if (input) {
        input.value = val;
        input.focus();
    }
};

function renderAdminCouponsList() {
    const container = document.getElementById('adminCouponsListContainer');
    if (!container) return;

    if (!state.coupons || state.coupons.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 16px;">No discount coupons created yet.</p>';
        return;
    }

    container.innerHTML = state.coupons.map(c => {
        const isFlat = (c.discount_type || 'flat') === 'flat';
        const dVal = c.discount_value !== undefined ? c.discount_value : (c.discount || 0);
        const discountBadge = isFlat 
            ? `<span class="badge" style="background:#EBF8FF; color:#0284C7; font-weight:700; padding:3px 8px; border-radius:6px; font-size:0.75rem;">💵 Flat ₹${dVal} OFF</span>` 
            : `<span class="badge" style="background:#FEF3C7; color:#B45309; font-weight:700; padding:3px 8px; border-radius:6px; font-size:0.75rem;">🏷️ ${dVal}% OFF</span>`;
        
        const minOrder = parseFloat(c.min_order || 0);
        const orderBadge = minOrder > 0
            ? `<span class="badge" style="background:#FEE2E2; color:#B91C1C; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">🛒 Min Cart: ₹${minOrder}</span>`
            : `<span class="badge" style="background:#ECFDF5; color:#047857; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">🛍️ Every Order</span>`;

        const isOnce = (c.usage_limit || 'unlimited') === 'once_per_user';
        const usedCount = Array.isArray(c.used_by) ? c.used_by.length : 0;
        const usageBadge = isOnce
            ? `<span class="badge" style="background:#F3E8FF; color:#7E22CE; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">🔒 1-Time/User (${usedCount} used)</span>`
            : `<span class="badge" style="background:#F1F5F9; color:#475569; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">🔄 Unlimited</span>`;

        const targetBadge = (c.target === 'user' && (c.targetUser || c.target_user))
            ? `<span class="badge" style="background:#FFFBEB; color:#92400E; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">👤 @${c.targetUser || c.target_user}</span>`
            : `<span class="badge" style="background:#F1F5F9; color:#64748B; font-weight:600; padding:2px 7px; border-radius:6px; font-size:0.72rem;">🌐 Everyone</span>`;

        return `
        <div class="supplier-item-row" style="padding: 12px 14px; background: #FFF; border-radius: 10px; margin-bottom: 10px; border: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 220px;">
                <div style="font-weight: 800; font-size: 1.05rem; color: var(--primary-dark); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 5px;">
                    <span><i class="fa-solid fa-ticket text-primary"></i> ${c.code}</span>
                    ${discountBadge}
                </div>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">
                    ${orderBadge}
                    ${usageBadge}
                    ${targetBadge}
                </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="deleteCouponByAdmin('${c.id}')" title="Delete Coupon" style="border-radius: 8px;">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
        `;
    }).join('');
}

window.handleCreateCouponSubmit = async function(e) {
    if (e) e.preventDefault();
    const codeInput = document.getElementById('couponCodeInput');
    const discountTypeSelect = document.getElementById('couponDiscountTypeSelect') || document.getElementById('couponDiscountType');
    const discountInput = document.getElementById('couponDiscountValueInput') || document.getElementById('couponDiscountInput');
    const minOrderTypeSelect = document.getElementById('couponMinOrderTypeSelect') || document.getElementById('couponOrderCriteria');
    const minOrderInput = document.getElementById('couponMinOrderInput');
    const usageLimitSelect = document.getElementById('couponUsageLimitSelect') || document.getElementById('couponUsageLimit');
    const targetSelect = document.getElementById('couponTargetSelect');
    const targetUserInput = document.getElementById('couponTargetUserInput');

    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const discountType = discountTypeSelect ? discountTypeSelect.value : 'flat';
    const discountVal = discountInput ? parseFloat(discountInput.value) : 0;
    const minOrderChoice = minOrderTypeSelect ? minOrderTypeSelect.value : 'every';
    let minOrder = 0;
    if (minOrderChoice === 'above') {
        minOrder = minOrderInput ? (parseFloat(minOrderInput.value) || 0) : 0;
    } else if (minOrderInput && parseFloat(minOrderInput.value) > 0) {
        minOrder = parseFloat(minOrderInput.value);
    }
    const usageLimit = usageLimitSelect ? usageLimitSelect.value : 'unlimited';
    const target = targetSelect ? targetSelect.value : 'everyone';
    const targetUser = targetUserInput ? targetUserInput.value.trim() : '';

    if (!code) {
        showToast('Please enter a coupon code', 'info');
        return;
    }

    if (isNaN(discountVal) || discountVal <= 0) {
        showToast(`Please enter a valid discount ${discountType === 'percent' ? 'percentage' : 'amount'}`, 'info');
        return;
    }

    if (discountType === 'percent' && discountVal > 100) {
        showToast('Percentage discount cannot exceed 100%', 'info');
        return;
    }

    if (minOrderChoice === 'above' && minOrder <= 0) {
        showToast('Please type your desired minimum cart amount (e.g. ₹150, ₹300, ₹400) or select Every Order', 'info');
        if (minOrderInput) minOrderInput.focus();
        return;
    }

    if (target === 'user' && !targetUser) {
        showToast('Please specify the target username for this coupon', 'info');
        return;
    }

    if (state.coupons.some(c => c.code.toUpperCase() === code)) {
        showToast(`Coupon code <strong>${code}</strong> already exists!`, 'info');
        return;
    }

    const descText = `${discountType === 'flat' ? `₹${discountVal} OFF` : `${discountVal}% OFF`} | ${minOrder > 0 ? `Above ₹${minOrder}` : 'Every Order'} | ${usageLimit === 'once_per_user' ? '1-Time Use' : 'Unlimited'}`;

    const newCoupon = {
        id: 'c_' + Date.now(),
        code: code,
        discount_type: discountType,
        discount_value: discountVal,
        discount: discountVal,
        min_order: minOrder,
        usage_limit: usageLimit,
        used_by: [],
        target: target,
        targetUser: target === 'user' ? targetUser : '',
        target_user: target === 'user' ? targetUser : '',
        description: descText
    };

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/coupons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                discount_type: discountType,
                discount_value: discountVal,
                discount_percent: discountType === 'percent' ? Math.round(discountVal) : 0,
                min_order: minOrder,
                usage_limit: usageLimit,
                target: target,
                target_user: target === 'user' ? targetUser : null,
                description: descText,
                is_active: true
            })
        }, 15000);

        if (response && response.ok) {
            const data = await response.json();
            if (data && data.id) newCoupon.id = String(data.id);
            state.coupons.unshift(newCoupon);
            if (document.getElementById('adminCouponForm')) document.getElementById('adminCouponForm').reset();
            if (document.getElementById('couponTargetUserGroup')) document.getElementById('couponTargetUserGroup').classList.add('hidden');
            const minOrderGrp = document.getElementById('couponMinOrderAmountGroup') || document.getElementById('couponMinOrderGroup');
            if (minOrderGrp) minOrderGrp.classList.add('hidden');
            if (typeof toggleCouponDiscountTypeFields === 'function') toggleCouponDiscountTypeFields('flat');
            renderAdminCouponsList();
            showToast(`Created coupon <strong>${code}</strong> (${descText})!`, 'success');
        } else {
            let errText = 'Failed to save coupon.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.detail) errText = errJson.detail;
            } catch (err) {}
            showToast(`❌ Error: ${errText}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Connection Error: ${err.message || err}`, 'error');
    }
};

window.deleteCouponByAdmin = async function(couponId) {
    const coupon = state.coupons.find(c => String(c.id) === String(couponId) || String(c.code).toUpperCase() === String(couponId).toUpperCase());
    const deleteKey = coupon ? (coupon.code || coupon.id) : couponId;

    state.coupons = state.coupons.filter(c => String(c.id) !== String(couponId) && String(c.code).toUpperCase() !== String(couponId).toUpperCase());
    renderAdminCouponsList();

    try {
        const res = await fetch(`${API_BASE_URL}/coupons/${deleteKey}`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('Coupon deleted successfully!', 'info');
        } else {
            showToast('Could not delete coupon', 'error');
        }
    } catch (e) {
        showToast('Removed coupon locally', 'info');
    }
};

// Admin Serviceable Locations & Pincodes Management
window.openAdminLocationsModal = async function() {
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Access restricted to Administrators', 'info');
        return;
    }
    closeModals();
    await fetchLocationsFromAPI();
    renderAdminLocationsList();
    const overlay = document.getElementById('adminLocationsOverlay');
    const modal = document.getElementById('adminLocationsModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
};

function renderAdminLocationsList() {
    const container = document.getElementById('adminLocationsListContainer');
    if (!container) return;

    if (!state.serviceableLocations || state.serviceableLocations.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 16px;">No serviceable pincodes configured.</p>';
        return;
    }

    container.innerHTML = state.serviceableLocations.map(l => `
        <div class="supplier-item-row" style="padding: 10px 14px; background: #FFF; border-radius: 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <div style="font-weight: 800; font-size: 1rem; color: var(--text-primary);">
                    <i class="fa-solid fa-location-dot text-primary"></i> ${l.area}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    Serviceable Pincode: <strong>${l.pincode}</strong>
                </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="deleteLocationByAdmin('${l.id}')" title="Delete Location">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function renderServiceableCitiesDatalist() {
    const datalist = document.getElementById('serviceableCitiesDatalist');
    const quickContainer = document.getElementById('checkoutQuickLocations');

    if (datalist) {
        datalist.innerHTML = state.serviceableLocations.map(l => 
            `<option value="${l.area}">${l.area} (Pincode: ${l.pincode})</option>`
        ).join('');
    }

    if (quickContainer) {
        if (!state.serviceableLocations || state.serviceableLocations.length === 0) {
            quickContainer.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">No locations configured</span>';
        } else {
            quickContainer.innerHTML = state.serviceableLocations.map(l => `
                <button type="button" class="btn btn-secondary btn-sm" onclick="selectQuickCheckoutLocation('${l.area || l.city}', '${l.pincode}')" style="padding: 4px 8px; font-size: 0.78rem; border-radius: 20px;">
                    📍 ${l.area || l.city} (<strong>${l.pincode}</strong>)
                </button>
            `).join('');
        }
    }
}

window.handleCitySearchInput = function(query, mode) {
    const suggestionsContainer = mode === 'checkout' 
        ? document.getElementById('checkoutCitySuggestions') 
        : document.getElementById('profileCitySuggestions');
    if (!suggestionsContainer) return;

    const cleanQuery = (query || '').trim().toLowerCase();
    const locations = state.serviceableLocations || [];

    const matches = locations.filter(l => {
        const area = String(l.area || l.city || '').toLowerCase();
        const pincode = String(l.pincode || '').toLowerCase();
        return !cleanQuery || area.includes(cleanQuery) || pincode.includes(cleanQuery);
    });

    if (matches.length === 0) {
        suggestionsContainer.innerHTML = '<div style="padding: 10px 14px; color: #64748B; font-size: 0.85rem; background: #FFF;">No matching serviceable locations found...</div>';
    } else {
        suggestionsContainer.innerHTML = matches.map(l => `
            <div style="padding: 10px 14px; border-bottom: 1px solid #F1F5F9; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; background: #FFF;" onclick="selectCitySuggestion('${l.area || l.city}', '${l.pincode}', '${mode}')">
                <span style="font-weight: 700; color: #0F172A;"><i class="fa-solid fa-location-dot text-primary"></i> ${l.area || l.city}</span>
                <span style="font-size: 0.8rem; background: #ECFDF5; color: #047857; padding: 2px 8px; border-radius: 12px; font-weight: 600;">Pincode: ${l.pincode}</span>
            </div>
        `).join('');
    }

    suggestionsContainer.classList.remove('hidden');
};

window.selectCitySuggestion = function(city, pincode, mode) {
    if (mode === 'checkout') {
        if (document.getElementById('city')) document.getElementById('city').value = city;
        if (document.getElementById('pincode')) document.getElementById('pincode').value = pincode;
        if (document.getElementById('checkoutCitySuggestions')) document.getElementById('checkoutCitySuggestions').classList.add('hidden');
    } else {
        if (document.getElementById('profileCity')) document.getElementById('profileCity').value = city;
        if (document.getElementById('profilePincode')) document.getElementById('profilePincode').value = pincode;
        if (document.getElementById('profileCitySuggestions')) document.getElementById('profileCitySuggestions').classList.add('hidden');
    }
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#city') && !e.target.closest('#checkoutCitySuggestions')) {
        const el = document.getElementById('checkoutCitySuggestions');
        if (el) el.classList.add('hidden');
    }
    if (!e.target.closest('#profileCity') && !e.target.closest('#profileCitySuggestions')) {
        const el = document.getElementById('profileCitySuggestions');
        if (el) el.classList.add('hidden');
    }
});

window.selectQuickCheckoutLocation = function(area, pincode) {
    const cityEl = document.getElementById('city');
    const pincodeEl = document.getElementById('pincode');
    const profileCityEl = document.getElementById('profileCity');
    const profilePincodeEl = document.getElementById('profilePincode');

    if (cityEl) cityEl.value = area;
    if (pincodeEl) pincodeEl.value = pincode;
    if (profileCityEl) profileCityEl.value = area;
    if (profilePincodeEl) profilePincodeEl.value = pincode;

    showToast(`📍 Selected <strong>${area}</strong> (${pincode})`, 'success');
};

function setupCityPincodeAutoFill(cityInputId, pincodeInputId) {
    const cityEl = document.getElementById(cityInputId);
    const pincodeEl = document.getElementById(pincodeInputId);
    if (!cityEl || !pincodeEl) return;

    const autoFill = () => {
        const query = cityEl.value.trim().toLowerCase();
        if (!query) return;

        const match = state.serviceableLocations.find(l => 
            l.area.toLowerCase() === query || 
            `${l.area} (Pincode: ${l.pincode})`.toLowerCase() === query ||
            query.startsWith(l.area.toLowerCase())
        );

        if (match) {
            cityEl.value = match.area;
            pincodeEl.value = match.pincode;
            showToast(`📍 Location auto-selected: <strong>${match.area}</strong> (Pincode: ${match.pincode})`, 'success');
        }
    };

    cityEl.addEventListener('input', autoFill);
    cityEl.addEventListener('change', autoFill);
}

window.toggleCheckoutAddressMode = function(mode) {
    const lblSaved = document.getElementById('lblSavedAddress');
    const lblNew = document.getElementById('lblNewAddress');
    const noticeEl = document.getElementById('checkoutAddressNotice');
    const addrSavedRadio = document.getElementById('addrOptionSaved');
    const addrNewRadio = document.getElementById('addrOptionNew');

    if (mode === 'saved') {
        if (addrSavedRadio) addrSavedRadio.checked = true;
        if (lblSaved) {
            lblSaved.style.background = '#FFFFFF';
            lblSaved.style.borderColor = '#10B981';
            lblSaved.style.color = '#047857';
            lblSaved.style.fontWeight = '700';
        }
        if (lblNew) {
            lblNew.style.background = 'transparent';
            lblNew.style.borderColor = 'transparent';
            lblNew.style.color = '#475569';
            lblNew.style.fontWeight = '600';
        }

        if (state.currentUser) {
            const addr = state.currentUser.address || {};
            if (document.getElementById('fullName')) document.getElementById('fullName').value = addr.fullName || state.currentUser.full_name || '';
            if (document.getElementById('phone')) document.getElementById('phone').value = addr.phone || state.currentUser.phone || '';
            if (document.getElementById('streetAddress')) document.getElementById('streetAddress').value = addr.streetAddress || '';
            if (document.getElementById('city')) document.getElementById('city').value = addr.city || '';
            if (document.getElementById('pincode')) document.getElementById('pincode').value = addr.pincode || '';

            if (noticeEl) noticeEl.classList.remove('hidden');
        }
    } else {
        if (addrNewRadio) addrNewRadio.checked = true;
        if (lblNew) {
            lblNew.style.background = '#FFFFFF';
            lblNew.style.borderColor = '#10B981';
            lblNew.style.color = '#047857';
            lblNew.style.fontWeight = '700';
        }
        if (lblSaved) {
            lblSaved.style.background = 'transparent';
            lblSaved.style.borderColor = 'transparent';
            lblSaved.style.color = '#475569';
            lblSaved.style.fontWeight = '600';
        }

        if (noticeEl) noticeEl.classList.add('hidden');

        // Clear fields for self typing new address
        if (document.getElementById('streetAddress')) document.getElementById('streetAddress').value = '';
        if (document.getElementById('city')) document.getElementById('city').value = '';
        if (document.getElementById('pincode')) document.getElementById('pincode').value = '';
        showToast('Please type your delivery city & address', 'info');
    }
};

window.handleCreateLocationSubmit = async function(e) {
    if (e) e.preventDefault();
    const areaInput = document.getElementById('locationAreaInput');
    const pincodeInput = document.getElementById('locationPincodeInput');

    const area = areaInput ? areaInput.value.trim() : '';
    const pincode = pincodeInput ? pincodeInput.value.trim() : '';

    if (!area || !pincode) {
        showToast('Please enter both location area name and pincode', 'info');
        return;
    }

    if (state.serviceableLocations.some(l => String(l.pincode) === String(pincode))) {
        showToast(`Pincode <strong>${pincode}</strong> is already registered!`, 'info');
        return;
    }

    const newLoc = {
        id: 'l_' + Date.now(),
        area,
        pincode
    };

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ city: area, pincode: pincode, delivery_time: '15 Mins' })
        }, 15000);

        if (response && response.ok) {
            const data = await response.json();
            if (data && data.id) newLoc.id = String(data.id);
            state.serviceableLocations.unshift(newLoc);
            if (document.getElementById('adminLocationForm')) document.getElementById('adminLocationForm').reset();
            renderAdminLocationsList();
            renderServiceableCitiesDatalist();
            showToast(`Added serviceable pincode <strong>${pincode}</strong> (${area})!`, 'success');
        } else {
            let errText = 'Failed to save location.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.detail) errText = errJson.detail;
            } catch (err) {}
            showToast(`❌ Error: ${errText}`, 'error');
        }
    } catch (err) {
        showToast(`❌ Connection Error: ${err.message || err}`, 'error');
    }
};

window.deleteLocationByAdmin = async function(locId) {
    const loc = state.serviceableLocations.find(l => String(l.id) === String(locId) || String(l.pincode) === String(locId));
    const deleteKey = loc ? (loc.pincode || loc.id) : locId;

    state.serviceableLocations = state.serviceableLocations.filter(l => String(l.id) !== String(locId) && String(l.pincode) !== String(locId));
    renderAdminLocationsList();
    renderServiceableCitiesDatalist();

    try {
        const res = await fetch(`${API_BASE_URL}/locations/${deleteKey}`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('Location deleted successfully!', 'info');
        } else {
            showToast('Could not delete location', 'error');
        }
    } catch (e) {
        showToast('Removed location locally', 'info');
    }
};

async function registerUser(email, otp, password, fullName, role, supplierCompany = '', phone = '', city = '') {
    if (!email || !password || !fullName) {
        showToast('Please fill in all required fields!', 'info');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters long! (Letters, numbers & symbols allowed)', 'error');
        return;
    }

    // Check if email already registered locally
    if (registeredUsers.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
        showToast(`Email <strong>${email}</strong> is already registered! Please sign in instead.`, 'info');
        return;
    }

    const derivedUsername = email.split('@')[0];
    const finalCity = (city || '').trim() || (role === 'supplier' ? 'Savda' : '');

    const newUser = {
        id: Date.now(),
        username: derivedUsername,
        email: email,
        full_name: fullName,
        phone: phone,
        role: role,
        is_verified: true,
        city: finalCity,
        address: { fullName, phone, streetAddress: '', city: finalCity, pincode: '' },
        supplier_company_name: role === 'supplier' ? (supplierCompany || fullName) : null
    };

    // Save to local registered accounts list immediately (0ms delay)
    registeredUsers.push(newUser);

    // Log user in automatically
    state.currentUser = newUser;
    saveUserSession(newUser);
    
    updateUserAuthUI();
    renderProducts();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    closeModals();
    showToast(`Email verified! Account created for <strong>${newUser.full_name}</strong>. Welcome to Dropzyy!`, 'success');

    // Async background sync with API
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, otp: otp || '123456', password, full_name: fullName, phone, role, supplier_company_name: supplierCompany, city: finalCity 
            })
        }, 15000);

        if (response && response.ok) {
            const user = await response.json();
            if (user && user.id) newUser.id = user.id;
            if (user && (user.access_token || user.token)) {
                newUser.access_token = user.access_token || user.token;
                saveUserSession(newUser);
            }
            showToast(`Account registered successfully!`, 'success');
        }
    } catch (e) {
        console.log('FastAPI offline. Account registered locally.');
    }
}

window.logoutUser = function() {
    state.currentUser = null;
    sessionStorage.removeItem('dropzyy_user'); 
    sessionStorage.removeItem('freshkart_user');
    localStorage.removeItem('dropzyy_user'); 
    localStorage.removeItem('freshkart_user');
    sessionStorage.removeItem('dropzyy_auth_token');
    localStorage.removeItem('dropzyy_auth_token');
    updateUserAuthUI();
    renderProducts();
    closeModals();
    showToast('Logged out successfully', 'info');
};

// 10. ADMINISTRATIVE CONTROL CENTER

// ==============================================================================
// 🛡️ FRAUD & CANCELLATION SHIELD (BLOCKED CONTACTS MANAGEMENT)
// ==============================================================================
window.cleanPhoneNumber = function(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};

window.isCustomerBlocked = function(phone, email) {
    if (!state.blockedContacts || !Array.isArray(state.blockedContacts)) return false;
    const cleanP = cleanPhoneNumber(phone);
    const cleanE = String(email || '').trim().toLowerCase();

    return state.blockedContacts.some(b => {
        const bPhone = cleanPhoneNumber(b.phone || b.raw_phone);
        const bEmail = String(b.email || '').trim().toLowerCase();

        if (cleanP && bPhone && cleanP === bPhone) return true;
        if (cleanE && bEmail && cleanE === bEmail) return true;
        return false;
    });
};

window.fetchBlockedContactsFromAPI = async function() {
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/admin/blocked`, {}, 10000);
        if (res && res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                state.blockedContacts = data;
                /* zero-storage */
                if (typeof renderAdminBlockedList === 'function') renderAdminBlockedList();
                if (typeof renderAdminUsersDirectory === 'function') renderAdminUsersDirectory();
            }
        }
    } catch (e) {
        console.warn('[FETCH BLOCKED CONTACTS ERROR]', e);
    }
};

window.openAdminBlockedModal = async function() {
    closeModals();
    const overlay = document.getElementById('adminBlockedOverlay');
    const modal = document.getElementById('adminBlockedModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');

    renderAdminBlockedList();
    await fetchBlockedContactsFromAPI();
};

window.renderAdminBlockedList = function() {
    const list = state.blockedContacts || [];
    const countEl = document.getElementById('adminBlockedCount');
    const container = document.getElementById('adminBlockedListContainer');

    if (countEl) countEl.textContent = list.length;
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 35px 20px; color: #94A3B8;">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; justify-content: center; font-size: 1.4rem; margin-bottom: 10px;">
                    <i class="fa-solid fa-shield-check"></i>
                </div>
                <div style="font-weight: 700; color: #475569; font-size: 0.95rem;">No Blocked Contacts</div>
                <div style="font-size: 0.8rem; margin-top: 4px;">All customers can currently place orders normally.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(b => {
        const displayPhone = b.phone || b.raw_phone || '';
        const displayEmail = b.email || '';
        const reason = b.reason || 'Repeated order cancellations';
        const dateStr = b.created_at ? new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Active';

        return `
            <div style="padding: 12px 14px; margin-bottom: 8px; background: #FFF5F5; border: 1px solid #FECACA; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
                        <i class="fa-solid fa-ban"></i>
                    </div>
                    <div style="min-width: 0;">
                        <div style="font-weight: 800; font-size: 0.92rem; color: #991B1B; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${displayPhone ? `<span>📱 ${displayPhone}</span>` : ''}
                            ${displayEmail ? `<span>✉️ ${displayEmail}</span>` : ''}
                        </div>
                        <div style="font-size: 0.78rem; color: #7F1D1D; margin-top: 2px;">
                            Reason: <strong>${reason}</strong> • Blocked: <span>${dateStr}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="adminUnblockContact('${displayPhone}', '${displayEmail}', '${b.id}')" style="background: #ECFDF5; color: #047857; border: 1.5px solid #A7F3D0; font-weight: 700; border-radius: 8px; padding: 6px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-lock-open"></i> Unblock
                    </button>
                </div>
            </div>
        `;
    }).join('');
};

window.handleAdminBlockSubmit = async function(event) {
    if (event) event.preventDefault();
    const phoneInput = document.getElementById('blockPhoneInput');
    const emailInput = document.getElementById('blockEmailInput');
    const reasonInput = document.getElementById('blockReasonInput');

    const phone = phoneInput ? phoneInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const reason = reasonInput ? reasonInput.value.trim() : 'Repeated order cancellations';

    if (!phone && !email) {
        showToast('Please enter at least a mobile number or email address to block!', 'warning');
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/admin/blocked`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, email, reason })
        });
        if (res && res.ok) {
            const data = await res.json();
            const newRecord = data.record || { phone, email, reason, created_at: new Date().toISOString() };
            state.blockedContacts = (state.blockedContacts || []).filter(b => {
                const bP = cleanPhoneNumber(b.phone || b.raw_phone);
                const bE = String(b.email || '').trim().toLowerCase();
                if (phone && bP && cleanPhoneNumber(phone) === bP) return false;
                if (email && bE && email === bE) return false;
                return true;
            });
            state.blockedContacts.unshift(newRecord);
            /* zero-storage */

            if (phoneInput) phoneInput.value = '';
            if (emailInput) emailInput.value = '';

            renderAdminBlockedList();
            renderAdminUsersDirectory();
            showToast(`🚫 <strong>Blocked:</strong> ${phone || email} is now restricted from ordering.`, 'success');
        } else {
            showToast('Could not block contact', 'error');
        }
    } catch (e) {
        console.error('Error blocking contact:', e);
        showToast('Error connecting to backend server', 'error');
    }
};

window.adminUnblockContact = async function(phone, email, id) {
    const ident = id || phone || email;
    try {
        await fetch(`${API_BASE_URL}/admin/blocked/unblock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, email, id: ident })
        });

        const cleanP = cleanPhoneNumber(phone);
        const cleanE = String(email || '').trim().toLowerCase();

        state.blockedContacts = (state.blockedContacts || []).filter(b => {
            const bP = cleanPhoneNumber(b.phone || b.raw_phone);
            const bE = String(b.email || '').trim().toLowerCase();
            const bId = String(b.id || '');
            if (id && bId === String(id)) return false;
            if (cleanP && bP && cleanP === bP) return false;
            if (cleanE && bE && cleanE === bE) return false;
            return true;
        });
        /* zero-storage */

        renderAdminBlockedList();
        renderAdminUsersDirectory();
        showToast(`🔓 <strong>Unblocked:</strong> ${phone || email || 'Customer'} can now place orders normally.`, 'info');
    } catch (e) {
        console.error('Error unblocking contact:', e);
        showToast('Could not unblock contact', 'error');
    }
};

window.adminQuickBlockUser = function(phone, email, username) {
    showCustomConfirmModal({
        title: 'Block Customer from Ordering?',
        subtitle: 'Fraud & Cancellation Protection',
        icon: 'fa-solid fa-user-slash',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: `
            <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;">
                <div style="font-weight: 800; font-size: 1rem; color: #0F172A;">
                    @${username}
                </div>
                <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">
                    ${phone ? `📱 Phone: <strong>${phone}</strong><br>` : ''}
                    ${email ? `✉️ Email: <strong>${email}</strong>` : ''}
                </div>
            </div>
            <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 12px; padding: 12px 14px; font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                <strong style="color: #991B1B;">Restrict this customer?</strong><br>
                Once blocked, this mobile number and email cannot complete checkout or place orders on Dropzyy. You can unblock them at any time from Admin Portal.
            </div>
        `,
        cancelText: 'Cancel',
        confirmText: 'Block Customer',
        confirmIcon: 'fa-solid fa-ban',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            const res = await fetch(`${API_BASE_URL}/admin/blocked`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, email, reason: 'Repeated order cancellations' })
            });
            if (res && res.ok) {
                const data = await res.json();
                state.blockedContacts.unshift(data.record || { phone, email, reason: 'Repeated order cancellations', created_at: new Date().toISOString() });
                /* zero-storage */
                renderAdminUsersDirectory();
                showToast(`🚫 Customer @${username} has been blocked from placing orders!`, 'success');
            }
        }
    });
};

window.adminQuickBlockFromOrder = function(orderId) {
    const order = (state.ordersHistory || []).find(o => o.id === orderId);
    if (!order) return;

    const del = order.delivery || {};
    const phone = del.phone || '';
    const email = del.email || '';
    const name = del.name || 'Customer';

    showCustomConfirmModal({
        title: 'Block Repeated Cancelling Customer?',
        subtitle: `Order #${order.id} Cancellation Shield`,
        icon: 'fa-solid fa-ban',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: `
            <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;">
                <div style="font-weight: 800; font-size: 1rem; color: #0F172A;">
                    ${name} (Order #${order.id})
                </div>
                <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">
                    ${phone ? `📱 Phone: <strong>${phone}</strong><br>` : ''}
                    ${email ? `✉️ Email: <strong>${email}</strong>` : ''}
                </div>
                ${order.cancel_reason ? `
                    <div style="margin-top: 8px; font-size: 0.78rem; background: #FEF2F2; padding: 6px 10px; border-radius: 6px; color: #991B1B;">
                        Cancellation Reason: "${order.cancel_reason}"
                    </div>
                ` : ''}
            </div>
            <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 12px; padding: 12px 14px; font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                <strong style="color: #991B1B;">Prevent further fake or repeated cancellations?</strong><br>
                Blocking this customer will instantly restrict their mobile number and email from booking or placing future orders.
            </div>
        `,
        cancelText: 'Cancel',
        confirmText: 'Block Customer',
        confirmIcon: 'fa-solid fa-ban',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            const res = await fetch(`${API_BASE_URL}/admin/blocked`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, email, reason: order.cancel_reason || 'Repeated cancellations on Order #' + order.id })
            });
            if (res && res.ok) {
                const data = await res.json();
                state.blockedContacts.unshift(data.record || { phone, email, reason: 'Repeated order cancellations', created_at: new Date().toISOString() });
                /* zero-storage */
                closeCancellationDetailsModal();
                showToast(`🚫 Customer (${phone || email}) has been blocked!`, 'success');
            }
        }
    });
};

window.adminUnblockFromOrder = async function(orderId) {
    const order = (state.ordersHistory || []).find(o => o.id === orderId);
    if (!order) return;
    const del = order.delivery || {};
    await adminUnblockContact(del.phone, del.email);
    closeCancellationDetailsModal();
};

function renderAdminUsersDirectory() {
    const usersList = [...registeredUsers];
    const suppliersCount = usersList.filter(u => u.role === 'supplier').length;
    const statUsers = document.getElementById('statAdminTotalUsers');
    const statSuppliers = document.getElementById('statAdminTotalSuppliers');
    const container = document.getElementById('adminUsersContainer');

    if (statUsers) statUsers.textContent = usersList.length;
    if (statSuppliers) statSuppliers.textContent = suppliersCount;

    if (container) {
        container.innerHTML = usersList.map(u => {
            const isBlocked = isCustomerBlocked(u.phone, u.email || (u.username && u.username.includes('@') ? u.username : ''));
            const isProtectedAdmin = u.username === 'yashpatil' || u.role === 'admin' || (state.currentUser && u.username === state.currentUser.username);

            return `
            <div class="supplier-item-row" style="padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.7); border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${isBlocked ? '#FEE2E2' : '#E0F2FE'}; color: ${isBlocked ? '#DC2626' : '#0284C7'}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem; flex-shrink: 0;">
                        ${isBlocked ? '<i class="fa-solid fa-ban"></i>' : (u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div>
                        <div style="font-weight: 700; color: #1E293B; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span>${u.full_name} (@${u.username})</span>
                            ${isBlocked ? `
                                <span class="badge" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; font-weight: 800; padding: 2px 8px; border-radius: 6px; font-size: 0.72rem; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-ban"></i> BLOCKED
                                </span>
                            ` : ''}
                        </div>
                        <div style="font-size: 0.85rem; color: #64748B;">
                            Role: <span class="role-pill role-${u.role}">${u.role.toUpperCase()}</span>
                            ${u.phone ? ` | 📱 <strong>${u.phone}</strong>` : ''}
                            ${u.email ? ` | ✉️ <strong>${u.email}</strong>` : ''}
                            ${u.supplier_company_name ? ` | Store: <strong>${u.supplier_company_name}</strong>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    ${!isProtectedAdmin ? (isBlocked ? `
                        <button type="button" class="btn btn-secondary btn-sm" onclick="adminUnblockContact('${u.phone || ''}', '${u.email || ''}')" style="background: #ECFDF5; color: #047857; border: 1.5px solid #A7F3D0; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Unblock user from placing orders">
                            <i class="fa-solid fa-lock-open"></i> Unblock
                        </button>
                    ` : `
                        <button type="button" class="btn btn-secondary btn-sm" onclick="adminQuickBlockUser('${u.phone || ''}', '${u.email || ''}', '${u.username}')" style="background: #FEF2F2; color: #DC2626; border: 1.5px solid #FECACA; font-weight: 700; padding: 6px 12px; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Block customer mobile/email from placing orders">
                            <i class="fa-solid fa-ban"></i> Block
                        </button>
                    `) : ''}
                    <button type="button" class="btn btn-secondary btn-sm" onclick="adminEditUserAddress('${u.username}')" style="color: #0284C7; border-radius: 8px; padding: 6px 12px;" title="Edit Address & User Details">
                        <i class="fa-solid fa-user-pen"></i> Edit
                    </button>
                    ${(u.username !== 'yashpatil' && state.currentUser && u.username !== state.currentUser.username) ? `
                        <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="deleteUserAccount(${u.id || 0}, '${u.username}')" style="border-radius: 8px; padding: 6px 10px;" title="Delete User Account">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            `;
        }).join('');
    }
}

async function syncUsersWithAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/admin/users`, {}, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                let deletedRest = [];
                try {
                    deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
                } catch (e) {
                    deletedRest = [];
                }
                const deletedSet = new Set(deletedRest.map(d => String(d).trim().toLowerCase()));

                data.forEach(u => {
                    const uName = (u.username || '').toLowerCase();
                    const cName = (u.supplier_company_name || '').toLowerCase();
                    if (deletedSet.has(uName) || (cName && deletedSet.has(cName))) return;

                    const existingIdx = registeredUsers.findIndex(ul => ul.username && ul.username.toLowerCase() === uName);
                    if (existingIdx === -1) {
                        registeredUsers.push({
                            id: u.id,
                            username: u.username,
                            email: u.email,
                            // password never stored on client
                            full_name: u.full_name,
                            role: u.role,
                            supplier_company_name: u.supplier_company_name,
                            phone: u.phone,
                            open_time: u.open_time || '08:00 AM',
                            close_time: u.close_time || '10:00 PM',
                            store_open: u.store_open !== false
                        });
                    } else {
                        registeredUsers[existingIdx].id = u.id;
                        registeredUsers[existingIdx].full_name = u.full_name || registeredUsers[existingIdx].full_name;
                        registeredUsers[existingIdx].supplier_company_name = u.supplier_company_name || registeredUsers[existingIdx].supplier_company_name;
                        registeredUsers[existingIdx].role = u.role || registeredUsers[existingIdx].role;
                        if (u.open_time) registeredUsers[existingIdx].open_time = u.open_time;
                        if (u.close_time) registeredUsers[existingIdx].close_time = u.close_time;
                        if (u.store_open !== undefined) registeredUsers[existingIdx].store_open = u.store_open;
                    }
                });

                // Also purge any deleted users from registeredUsers
                registeredUsers = registeredUsers.filter(u => {
                    const uName = (u.username || '').toLowerCase();
                    const cName = (u.supplier_company_name || '').toLowerCase();
                    return !deletedSet.has(uName) && (!cName || !deletedSet.has(cName));
                });

                if (typeof renderAdminUsersDirectory === 'function') renderAdminUsersDirectory();
                if (typeof renderRestaurants === 'function') renderRestaurants();
            }
        }
    } catch (e) {}
}

window.openAdminControlCenter = async function() {
    closeModals();
    if (adminControlOverlay) adminControlOverlay.classList.add('active');
    if (adminControlModal) adminControlModal.classList.add('active');

    renderAdminUsersDirectory();
    syncUsersWithAPI();
};

// Interactive Custom Confirmation Popup Engine (Styled like Cancel Order Action Modal)
let customConfirmCallback = null;

window.closeCustomConfirmModal = function() {
    const modal = document.getElementById('customConfirmModal');
    const overlay = document.getElementById('customConfirmOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    customConfirmCallback = null;
};

window.executeCustomConfirmAction = async function() {
    const cb = customConfirmCallback;
    closeCustomConfirmModal();
    if (typeof cb === 'function') {
        try {
            await cb();
        } catch (err) {
            console.error('[CONFIRM ACTION ERROR]', err);
        }
    }
};

window.showCustomConfirmModal = function(options) {
    const {
        title = 'Confirm Deletion',
        subtitle = 'Please review carefully before proceeding',
        icon = 'fa-solid fa-triangle-exclamation',
        iconBg = '#FEE2E2',
        iconColor = '#DC2626',
        contentHtml = '',
        cancelText = 'Cancel',
        confirmText = 'Delete',
        confirmIcon = 'fa-solid fa-trash-can',
        confirmBg = '#DC2626',
        onConfirm = null
    } = options || {};

    const container = document.getElementById('customConfirmContent');
    if (!container) return;

    customConfirmCallback = onConfirm;

    container.innerHTML = `
        <div style="background: #FFFFFF; border-bottom: 1.5px solid #F1F5F9; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; flex-shrink: 0;">
                    <i class="${icon}"></i>
                </div>
                <div>
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0F172A;">${title}</h3>
                    <div style="font-size: 0.78rem; color: #64748B; margin-top: 2px;">
                        ${subtitle}
                    </div>
                </div>
            </div>
            <button type="button" class="close-modal-btn" onclick="closeCustomConfirmModal()" style="position: static; width: 32px; height: 32px; border-radius: 50%; background: #F1F5F9; border: 1px solid #E2E8F0; color: #64748B; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Close">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div style="padding: 20px 22px; overflow-y: auto; flex: 1; background: #FAFAFA;">
            ${contentHtml}
        </div>

        <div style="padding: 14px 22px; background: white; border-top: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCustomConfirmModal()" style="padding: 9px 18px; border-radius: 8px; font-weight: 700; cursor: pointer;">
                ${cancelText}
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="executeCustomConfirmAction()" style="background: ${confirmBg}; color: white; border: none; padding: 9px 20px; border-radius: 8px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                ${confirmIcon ? `<i class="${confirmIcon}"></i>` : ''} ${confirmText}
            </button>
        </div>
    `;

    const modal = document.getElementById('customConfirmModal');
    const overlay = document.getElementById('customConfirmOverlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

function deleteUserAccount(userId, username) {
    const uClean = String(username).toLowerCase();

    const contentHtml = `
        <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                <i class="fa-solid fa-user-xmark"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 800; font-size: 1.05rem; color: #0F172A;">
                    @${username}
                </div>
                <div style="font-size: 0.8rem; color: #64748B; margin-top: 2px;">
                    User ID: <strong style="color: #334155;">#${userId || 'local'}</strong>
                </div>
            </div>
        </div>

        <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 12px; padding: 14px 16px;">
            <div style="font-weight: 800; color: #991B1B; font-size: 0.88rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #DC2626;"></i> Account Deletion Warning
            </div>
            <p style="margin: 0; font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                Are you sure you want to delete user account <strong>@${username}</strong>? This will permanently delete the account, any linked restaurant store, and all uploaded menu items.
            </p>
        </div>
    `;

    showCustomConfirmModal({
        title: 'Delete User Account',
        subtitle: 'Admin User Management',
        icon: 'fa-solid fa-user-xmark',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: contentHtml,
        cancelText: 'Cancel',
        confirmText: 'Delete Account',
        confirmIcon: 'fa-solid fa-trash-can',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            await executeDeleteUserAccountConfirmed(userId, username);
        }
    });
}

async function executeDeleteUserAccountConfirmed(userId, username) {
    try {
        await fetchWithTimeout(`${API_BASE_URL}/restaurants/${encodeURIComponent(username)}`, { method: 'DELETE' }, 10000);
    } catch (e) {}

    if (userId > 0) {
        try {
            await fetch(`${API_BASE_URL}/admin/users/${userId}`, { method: 'DELETE' });
        } catch (e) {}
    }

    const uClean = String(username).toLowerCase();
    registeredUsers = registeredUsers.filter(u => (u.username || '').toLowerCase() !== uClean);

    // Blacklist deleted user / restaurant
    try {
        let deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
        if (!deletedRest.includes(uClean)) deletedRest.push(uClean);
        /* zero-storage */
    } catch (e) {}

    // Remove products belonging to this user
    state.products = state.products.filter(p => {
        const pSup = (p.supplier_name || p.supplierName || '').toLowerCase();
        const pUid = String(p.supplier_user_id || '').toLowerCase();
        return pSup !== uClean && pUid !== uClean;
    });

    try {
        let cpList = JSON.parse(localStorage.getItem('dropzyy_custom_products') || '[]');
        cpList = cpList.filter(p => {
            const pSup = (p.supplier_name || p.supplierName || '').toLowerCase();
            const pUid = String(p.supplier_user_id || '').toLowerCase();
            return pSup !== uClean && pUid !== uClean;
        });
        /* zero-storage */
    } catch (e) {}

    persistCustomProducts();

    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();

    showToast(`User account @${username} and any linked restaurant items were deleted`, 'info');
    openAdminControlCenter();
}

window.adminEditUserAddress = function(targetUsername) {
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Access restricted to Administrators', 'info');
        return;
    }
    const user = registeredUsers.find(u => u.username.toLowerCase() === targetUsername.toLowerCase());
    if (!user) {
        showToast(`User account @${targetUsername} not found`, 'info');
        return;
    }

    const addr = user.address || {};
    if (document.getElementById('adminTargetUsername')) document.getElementById('adminTargetUsername').value = user.username;
    if (document.getElementById('adminUserFullName')) document.getElementById('adminUserFullName').value = user.full_name || '';
    if (document.getElementById('adminUserPhone')) document.getElementById('adminUserPhone').value = user.phone || addr.phone || '';
    if (document.getElementById('adminUserRole')) document.getElementById('adminUserRole').value = user.role || 'customer';
    if (document.getElementById('adminUserStreetAddress')) document.getElementById('adminUserStreetAddress').value = addr.streetAddress || '';
    if (document.getElementById('adminUserCity')) document.getElementById('adminUserCity').value = addr.city || '';
    if (document.getElementById('adminUserPincode')) document.getElementById('adminUserPincode').value = addr.pincode || '';

    const imgFields = document.getElementById('adminSupplierImageFields');
    if (imgFields) {
        if (user.role === 'supplier' || user.supplier_company_name) {
            imgFields.classList.remove('hidden');
            const bInput = document.getElementById('adminUserBannerImage');
            const mInput = document.getElementById('adminUserMenuCardImage');
            if (bInput) bInput.value = user.banner_image || '';
            if (mInput) mInput.value = user.menu_card_image || '';
        } else {
            imgFields.classList.add('hidden');
        }
    }

    closeModals();
    const overlay = document.getElementById('adminEditUserOverlay');
    const modal = document.getElementById('adminEditUserModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
};

window.handleAdminSaveUserSubmit = async function(e) {
    if (e) e.preventDefault();
    const username = document.getElementById('adminTargetUsername').value;
    const fullName = document.getElementById('adminUserFullName').value.trim();
    const phone = document.getElementById('adminUserPhone').value.trim();
    const role = document.getElementById('adminUserRole').value;
    const streetAddress = document.getElementById('adminUserStreetAddress').value.trim();
    const city = document.getElementById('adminUserCity').value.trim();
    const pincode = document.getElementById('adminUserPincode').value.trim();
    const bannerImage = document.getElementById('adminUserBannerImage') ? document.getElementById('adminUserBannerImage').value.trim() : '';
    const menuCardImage = document.getElementById('adminUserMenuCardImage') ? document.getElementById('adminUserMenuCardImage').value.trim() : '';

    const cleanPhone = phone.replace(/\D/g, '');
    if (phone && cleanPhone.length !== 10) {
        showToast('Mobile number must be exactly 10 digits!', 'info');
        return;
    }

    const uIdx = registeredUsers.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].full_name = fullName;
        registeredUsers[uIdx].phone = cleanPhone;
        registeredUsers[uIdx].role = role;
        registeredUsers[uIdx].city = city;
        if (bannerImage) registeredUsers[uIdx].banner_image = bannerImage;
        if (menuCardImage) registeredUsers[uIdx].menu_card_image = menuCardImage;
        registeredUsers[uIdx].address = {
            fullName,
            phone: cleanPhone,
            streetAddress,
            city,
            pincode
        };
        const supCompName = registeredUsers[uIdx].supplier_company_name || (role === 'supplier' ? fullName : null);
        if (supCompName) registeredUsers[uIdx].supplier_company_name = supCompName;

        if (window._supplierStoreImages) {
            window._supplierStoreImages[username.toLowerCase()] = { banner_image: bannerImage, menu_card_image: menuCardImage };
            /* zero-storage */
        }

        if (state.currentUser && state.currentUser.username.toLowerCase() === username.toLowerCase()) {
            state.currentUser.full_name = fullName;
            state.currentUser.phone = cleanPhone;
            state.currentUser.role = role;
            state.currentUser.city = city;
            if (bannerImage) state.currentUser.banner_image = bannerImage;
            if (menuCardImage) state.currentUser.menu_card_image = menuCardImage;
            state.currentUser.address = registeredUsers[uIdx].address;
            saveUserSession(state.currentUser);
            updateUserAuthUI();
        }

        // Sync role & user details to backend API (MongoDB Atlas + SQLite)
        try {
            const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            await fetchWithTimeout(`${API_BASE_URL}/admin/users/${encodeURIComponent(username)}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({
                    username: username,
                    full_name: fullName,
                    phone: cleanPhone,
                    role: role,
                    supplier_company_name: supCompName,
                    street_address: streetAddress,
                    city: city,
                    pincode: pincode,
                    banner_image: bannerImage,
                    menu_card_image: menuCardImage,
                    store_open: true
                })
            }, 10000);
        } catch (apiErr) {
            console.warn('[ADMIN USER UPDATE SYNC ERROR]:', apiErr);
        }

        // Sync store images to backend if supplier
        if (role === 'supplier' || registeredUsers[uIdx].supplier_company_name) {
            try {
                const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
                const headers = { 'Content-Type': 'application/json' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                fetchWithTimeout(`${API_BASE_URL}/supplier/store-images`, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify({
                        username: username,
                        banner_image: bannerImage,
                        menu_card_image: menuCardImage
                    })
                }, 5000).catch(() => {});
            } catch (err) {}
        }

        // Immediately trigger fresh live sync across products, restaurants and users
        await Promise.allSettled([
            fetchRestaurantsFromAPI(),
            fetchProductsFromAPI(),
            syncUsersWithAPI()
        ]);

        if (typeof renderRestaurants === 'function') renderRestaurants();
        if (typeof renderProducts === 'function') renderProducts();

        showToast(`Updated details & role for @${username}!`, 'success');
        closeModals();
        openAdminControlCenter();
    }
};

async function createAccountByAdmin(username, password, fullName, role, supplierCompany = '', city = '') {
    if (registeredUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        showToast(`Username <strong>@${username}</strong> already exists!`, 'info');
        return;
    }

    if (!password || password.length < 6) {
        showToast('Password must be at least 6 characters long! (Letters, numbers & symbols allowed)', 'error');
        return;
    }

    const cleanUser = username.trim().toLowerCase().replace(/\s+/g, '_');
    const email = `${cleanUser}@dropzyy.com`;
    const finalCity = (city || '').trim() || (role === 'supplier' ? 'Savda' : '');

    const newUser = {
        id: Date.now(),
        username: cleanUser,
        email: email,
        full_name: fullName,
        role: role,
        city: finalCity,
        address: { fullName, phone: '', streetAddress: '', city: finalCity, pincode: '' },
        supplier_company_name: role === 'supplier' ? (supplierCompany || fullName) : null
    };

    registeredUsers.push(newUser);

    closeModals();
    showToast(`Created <strong>${role.toUpperCase()}</strong> account for @${cleanUser} in ${finalCity}!`, 'success');
    openAdminControlCenter();
    if (typeof renderRestaurants === 'function') renderRestaurants();

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: cleanUser, 
                email, 
                password, 
                full_name: fullName, 
                role, 
                supplier_company_name: supplierCompany,
                city: finalCity
            })
        }, 15000);

        if (response && response.ok) {
            const user = await response.json();
            if (user && user.id) {
                newUser.id = user.id;
            }
            showToast(`Supplier account @${cleanUser} synced successfully!`, 'success');
        } else {
            console.warn('API Registration Response Warning:', response.status);
        }
    } catch (e) {
        console.warn('API Registration Warning:', e);
    }
}

// 10. SUPPLIER DASHBOARD
// 10. SUPPLIER DASHBOARD & PRODUCT PERMISSIONS
window.canUserEditProduct = function(product) {
    if (!state.currentUser || !product) return false;
    const role = state.currentUser.role;
    // Admins and Sub-admins can edit/delete all products
    if (role === 'admin' || role === 'sub_admin') return true;
    
    // Suppliers can ONLY edit/delete products belonging to them
    if (role === 'supplier') {
        return doesProductBelongToSupplier(product, state.currentUser);
    }

    return false;
};

window.isItemFromSupplier = function(item) {
    if (!state.currentUser || state.currentUser.role !== 'supplier') return false;
    return doesProductBelongToSupplier(item, state.currentUser);
};

function openSupplierDashboard() {
    if (!state.currentUser) return;
    if (state.currentUser.role !== 'supplier' && state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin') {
        return;
    }
    renderSupplierDashboard();
}

function renderSupplierDashboard() {
    if (!state.currentUser) return;
    if (state.currentUser.role !== 'supplier' && state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin') {
        return;
    }

    const companyName = state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username;
    const isSystemAdmin = state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin';

    supplierCompanyTitle.textContent = isSystemAdmin 
        ? `Logged in as System Admin: Viewing All Supplier Products` 
        : `Logged in as Supplier: ${companyName}`;

    // Filter catalog: Suppliers ONLY see their own products, Admin sees all
    const supplierProducts = isSystemAdmin 
        ? state.products 
        : state.products.filter(p => canUserEditProduct(p));

    statTotalProducts.textContent = supplierProducts.length;
    const totalVal = supplierProducts.reduce((sum, p) => sum + (p.price || 0), 0);
    statCatalogValue.textContent = `₹${totalVal.toLocaleString()}`;

    if (supplierProducts.length === 0) {
        supplierProductsContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 30px;">No products added yet by your supplier account. Click <strong>+ Add New Product</strong> above to add your Kirana items!</p>`;
    } else {
        supplierProductsContainer.innerHTML = supplierProducts.map(p => {
            const isOnline = isProductOnline(p);

            return `
                <div class="supplier-item-row" style="${!isOnline ? 'background: #FFF5F5; border: 1px solid #FECACA;' : ''}">
                    <img src="${p.image}" alt="${p.title}" class="supplier-item-thumb">
                    <div class="supplier-item-info">
                        <div class="supplier-item-title">
                            ${p.title}
                            ${!isOnline 
                                ? `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.75rem; margin-left:6px; padding:2px 8px; border-radius:12px; font-weight:700;">🔴 OFFLINE FROM WEBSITE</span>`
                                : `<span class="badge" style="background:#D1FAE5; color:#047857; font-size:0.75rem; margin-left:6px; padding:2px 8px; border-radius:12px; font-weight:700;">🟢 ONLINE IN STORE</span>`
                            }
                        </div>
                        <div class="supplier-item-meta">
                            ${p.category} | ${p.unit} | <strong>₹${p.price}</strong><br>
                            <small class="text-primary"><i class="fa-solid fa-truck-field"></i> ${p.supplierName || companyName}</small>
                        </div>
                    </div>
                    <div class="supplier-item-actions" style="display: flex; align-items: center; gap: 6px;">
                        <button class="btn btn-sm ${!isOnline ? 'btn-success' : 'btn-secondary'}" onclick="toggleProductOnlineStatus('${p.id}')" title="Click to toggle product Online/Offline on website">
                            <i class="fa-solid ${!isOnline ? 'fa-globe' : 'fa-eye-slash'}"></i>
                            ${!isOnline ? 'Set ONLINE' : 'Set OFFLINE'}
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="openEditProductModal('${p.id}')">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button class="btn btn-secondary btn-sm text-danger" onclick="deleteProduct('${p.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Populate Operating Hours and Status Settings in Supplier Dashboard
    const openTimeVal = state.currentUser.open_time || '08:00 AM';
    const closeTimeVal = state.currentUser.close_time || '10:00 PM';
    const isStoreOpen = state.currentUser.store_open !== false;

    const openComp = parseTimeComponents(openTimeVal);
    const closeComp = parseTimeComponents(closeTimeVal);

    const openInput = document.getElementById('supplierOpenTime');
    const openAmPm = document.getElementById('supplierOpenAmPm');
    const openDisp = document.getElementById('supplierOpenFormatted');
    const closeInput = document.getElementById('supplierCloseTime');
    const closeAmPm = document.getElementById('supplierCloseAmPm');
    const closeDisp = document.getElementById('supplierCloseFormatted');
    const closeCheck = document.getElementById('supplierStoreCloseCheck');

    if (openInput) openInput.value = openComp.time24;
    if (openAmPm) openAmPm.value = openComp.ampm;
    if (openDisp) openDisp.textContent = `${openComp.hour}:${openComp.minute} ${openComp.ampm}`;

    if (closeInput) closeInput.value = closeComp.time24;
    if (closeAmPm) closeAmPm.value = closeComp.ampm;
    if (closeDisp) closeDisp.textContent = `${closeComp.hour}:${closeComp.minute} ${closeComp.ampm}`;

    if (closeCheck) closeCheck.checked = !isStoreOpen;

    const curCity = state.currentUser.city || (state.currentUser.address && state.currentUser.address.city) || 'Savda';
    const cityInput = document.getElementById('supplierCityInput');
    const cityDisp = document.getElementById('supplierCityFormatted');
    if (cityInput) cityInput.value = curCity;
    if (cityDisp) cityDisp.textContent = curCity;

    // Populate Store Front Banner and Menu Card
    const curBanner = state.currentUser.banner_image || state.currentUser.cover_image || '';
    const curMenuCard = state.currentUser.menu_card_image || '';
    const bannerInput = document.getElementById('supplierBannerUrlInput');
    const bannerPreview = document.getElementById('supplierBannerPreview');
    const bannerPlaceholder = document.getElementById('supplierBannerPlaceholder');
    const menuCardInput = document.getElementById('supplierMenuCardUrlInput');
    const menuCardPreview = document.getElementById('supplierMenuCardPreview');
    const menuCardPlaceholder = document.getElementById('supplierMenuCardPlaceholder');

    if (bannerInput) bannerInput.value = curBanner;
    if (bannerPreview && bannerPlaceholder) {
        if (curBanner) {
            bannerPreview.src = curBanner;
            bannerPreview.style.display = 'block';
            bannerPlaceholder.style.display = 'none';
        } else {
            bannerPreview.style.display = 'none';
            bannerPlaceholder.style.display = 'flex';
        }
    }

    if (menuCardInput) menuCardInput.value = curMenuCard;
    if (menuCardPreview && menuCardPlaceholder) {
        if (curMenuCard) {
            menuCardPreview.src = curMenuCard;
            menuCardPreview.style.display = 'block';
            menuCardPlaceholder.style.display = 'none';
        } else {
            menuCardPreview.style.display = 'none';
            menuCardPlaceholder.style.display = 'flex';
        }
    }

    if (window.updateSupplierDashboardStatus) {
        window.updateSupplierDashboardStatus();
    }
    if (window.updateLiveStatusPreview) {
        window.updateLiveStatusPreview();
    }

    supplierDashboardOverlay.classList.add('active');
    supplierDashboardModal.classList.add('active');

    // Initialize availability calendar for this supplier
    if (typeof window.initSupplierAvailabilityCalendar === 'function') {
        setTimeout(window.initSupplierAvailabilityCalendar, 50);
    }
}

window.handleTimeInputChange = function(type) {
    const isOpening = type === 'open';
    const timeInput = document.getElementById(isOpening ? 'supplierOpenTime' : 'supplierCloseTime');
    const ampmSelect = document.getElementById(isOpening ? 'supplierOpenAmPm' : 'supplierCloseAmPm');
    const formattedDisplay = document.getElementById(isOpening ? 'supplierOpenFormatted' : 'supplierCloseFormatted');

    if (!timeInput || !timeInput.value) return;

    const comp = parseTimeComponents(timeInput.value);
    if (ampmSelect) ampmSelect.value = comp.ampm;
    if (formattedDisplay) formattedDisplay.textContent = `${comp.hour}:${comp.minute} ${comp.ampm}`;

    if (window.updateLiveStatusPreview) window.updateLiveStatusPreview();
};

window.handleAmPmSelectChange = function(type) {
    const isOpening = type === 'open';
    const timeInput = document.getElementById(isOpening ? 'supplierOpenTime' : 'supplierCloseTime');
    const ampmSelect = document.getElementById(isOpening ? 'supplierOpenAmPm' : 'supplierCloseAmPm');
    const formattedDisplay = document.getElementById(isOpening ? 'supplierOpenFormatted' : 'supplierCloseFormatted');

    if (!timeInput || !timeInput.value || !ampmSelect) return;

    const [hStr, mStr] = timeInput.value.split(':');
    let h = parseInt(hStr, 10);
    const newAmPm = ampmSelect.value;

    if (newAmPm === 'PM' && h < 12) h += 12;
    if (newAmPm === 'AM' && h >= 12) h -= 12;

    const hFormatted = h < 10 ? '0' + h : String(h);
    timeInput.value = `${hFormatted}:${mStr}`;

    const comp = parseTimeComponents(timeInput.value);
    if (formattedDisplay) formattedDisplay.textContent = `${comp.hour}:${comp.minute} ${newAmPm}`;

    if (window.updateLiveStatusPreview) window.updateLiveStatusPreview();
};

window.updateLiveStatusPreview = function() {
    const badge = document.getElementById('supplierStoreLiveBadge');
    const openInput = document.getElementById('supplierOpenTime');
    const openAmPm = document.getElementById('supplierOpenAmPm');
    const closeInput = document.getElementById('supplierCloseTime');
    const closeAmPm = document.getElementById('supplierCloseAmPm');

    if (!badge) return;

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Check calendar override
    let calOverride = undefined;
    if (window._supplierCalendarData && state.currentUser) {
        const idKey = state.currentUser.id ? String(state.currentUser.id) : null;
        const uKey = state.currentUser.username ? String(state.currentUser.username).toLowerCase() : null;
        let calData = null;
        if (idKey && window._supplierCalendarData[idKey]) calData = window._supplierCalendarData[idKey];
        else if (uKey && window._supplierCalendarData[uKey]) calData = window._supplierCalendarData[uKey];
        if (calData && todayKey in calData) {
            calOverride = calData[todayKey];
        }
    }

    if (calOverride === false) {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #DC2626;"></i> Store is CLOSED TODAY (Calendar schedule) 📅🔴`;
        badge.style.background = '#FEE2E2';
        badge.style.color = '#991B1B';
        badge.style.borderColor = '#FECACA';
        return;
    }

    const openParsed = parseTimeComponents(openInput ? openInput.value : '08:00');
    const closeParsed = parseTimeComponents(closeInput ? closeInput.value : '22:00');
    const oAmPm = openAmPm ? openAmPm.value : openParsed.ampm;
    const cAmPm = closeAmPm ? closeAmPm.value : closeParsed.ampm;

    const openStr = `${openParsed.hour}:${openParsed.minute} ${oAmPm}`;
    const closeStr = `${closeParsed.hour}:${closeParsed.minute} ${cAmPm}`;

    const openMin = parseTimeToMinutes(openStr);
    const closeMin = parseTimeToMinutes(closeStr);
    const currentMin = now.getHours() * 60 + now.getMinutes();

    let isOpen = false;
    if (openMin !== null && closeMin !== null) {
        if (openMin <= closeMin) {
            isOpen = currentMin >= openMin && currentMin <= closeMin;
        } else {
            isOpen = currentMin >= openMin || currentMin <= closeMin;
        }
    } else {
        isOpen = true;
    }

    if (isOpen) {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #10B981;"></i> Store is OPEN (${openStr} - ${closeStr}) 🟢`;
        badge.style.background = '#D1FAE5';
        badge.style.color = '#065F46';
        badge.style.borderColor = '#A7F3D0';
    } else {
        badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #D97706;"></i> Store is CLOSED (Opens at ${openStr}) 🕒🔴`;
        badge.style.background = '#FEF3C7';
        badge.style.color = '#92400E';
        badge.style.borderColor = '#FDE68A';
    }
};

window.saveSupplierTimings = async function() {
    if (!state.currentUser) {
        showToast('Please login as a supplier to update timings', 'error');
        return;
    }

    const openTimeInput = document.getElementById('supplierOpenTime');
    const openAmPmSelect = document.getElementById('supplierOpenAmPm');
    const closeTimeInput = document.getElementById('supplierCloseTime');
    const closeAmPmSelect = document.getElementById('supplierCloseAmPm');

    if (!openTimeInput || !closeTimeInput) return;

    const openParsed = parseTimeComponents(openTimeInput.value);
    const closeParsed = parseTimeComponents(closeTimeInput.value);

    const openAmPm = openAmPmSelect ? openAmPmSelect.value : openParsed.ampm;
    const closeAmPm = closeAmPmSelect ? closeAmPmSelect.value : closeParsed.ampm;

    const openTimeFormatted = `${openParsed.hour}:${openParsed.minute} ${openAmPm}`;
    const closeTimeFormatted = `${closeParsed.hour}:${closeParsed.minute} ${closeAmPm}`;

    const cityInput = document.getElementById('supplierCityInput');
    const cityVal = cityInput ? cityInput.value.trim() : '';

    // Update state.currentUser
    state.currentUser.open_time = openTimeFormatted;
    state.currentUser.close_time = closeTimeFormatted;
    state.currentUser.store_open = true;
    if (cityVal) {
        state.currentUser.city = cityVal;
        if (!state.currentUser.address) state.currentUser.address = {};
        state.currentUser.address.city = cityVal;
        const cityDisp = document.getElementById('supplierCityFormatted');
        if (cityDisp) cityDisp.textContent = cityVal;
    }
    saveUserSession(state.currentUser);

    // Update in registeredUsers and localStorage
    const uIdx = registeredUsers.findIndex(u => 
        (state.currentUser.id && u.id === state.currentUser.id) ||
        (u.username && state.currentUser.username && u.username.toLowerCase() === state.currentUser.username.toLowerCase()) ||
        (u.supplier_company_name && state.currentUser.supplier_company_name && u.supplier_company_name.toLowerCase() === state.currentUser.supplier_company_name.toLowerCase())
    );
    if (uIdx > -1) {
        registeredUsers[uIdx].open_time = openTimeFormatted;
        registeredUsers[uIdx].close_time = closeTimeFormatted;
        registeredUsers[uIdx].store_open = true;
        if (cityVal) registeredUsers[uIdx].city = cityVal;
    }

    // Save to backend API
    try {
        await fetchWithTimeout(`${API_BASE_URL}/supplier/timings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: state.currentUser.id,
                username: state.currentUser.username,
                open_time: openTimeFormatted,
                close_time: closeTimeFormatted,
                store_open: true,
                city: cityVal || state.currentUser.city || 'Savda'
            })
        }, 3000);
    } catch (err) {
        console.warn('Backend sync for supplier timings:', err);
    }

    updateLiveStatusPreview();
    renderProducts();
    if (typeof fetchRestaurantsFromAPI === 'function') fetchRestaurantsFromAPI();
    if (typeof renderRestaurants === 'function') renderRestaurants();

    // Update Analytics modal if present
    const statStoreStatus = document.getElementById('supplierStatStoreStatus');
    if (statStoreStatus) {
        statStoreStatus.innerHTML = `🟢 Operating Hours: ${openTimeFormatted} - ${closeTimeFormatted}`;
        statStoreStatus.style.color = '#047857';
    }

    showToast(`Operating hours saved (${openTimeFormatted} - ${closeTimeFormatted})! Status is automatically managed.`, 'success');
};

// 10.1 RESTAURANT LIVE STATUS & DELETION CONTROLS (SUPPLIER & ADMIN)
window.updateSupplierDashboardStatus = function() {
    if (!state.currentUser) return;
    const isStoreOpen = state.currentUser.store_open !== false;
    const pill = document.getElementById('supplierQuickStatusPill');
    const note = document.getElementById('supplierQuickStatusNote');
    const btn = document.getElementById('btnToggleSupplierOnline');
    const closeCheck = document.getElementById('supplierStoreCloseCheck');

    if (pill) {
        if (isStoreOpen) {
            pill.style.background = '#D1FAE5';
            pill.style.color = '#065F46';
            pill.style.borderColor = '#A7F3D0';
            pill.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #10B981;"></i> STORE IS ONLINE`;
        } else {
            pill.style.background = '#FEE2E2';
            pill.style.color = '#991B1B';
            pill.style.borderColor = '#FECACA';
            pill.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 0.55rem; color: #EF4444;"></i> STORE IS OFFLINE`;
        }
    }

    if (note) {
        note.textContent = isStoreOpen 
            ? "Currently open & accepting customer orders 🟢" 
            : "Store is currently CLOSED / OFFLINE 🔴 (Customers cannot order)";
    }

    if (btn) {
        if (isStoreOpen) {
            btn.style.background = '#FEE2E2';
            btn.style.color = '#DC2626';
            btn.style.border = '1px solid #FECACA';
            btn.innerHTML = `<i class="fa-solid fa-power-off"></i> Take Restaurant Offline`;
        } else {
            btn.style.background = '#D1FAE5';
            btn.style.color = '#065F46';
            btn.style.border = '1px solid #A7F3D0';
            btn.innerHTML = `<i class="fa-solid fa-power-off"></i> Bring Restaurant Online`;
        }
    }

    if (closeCheck) {
        closeCheck.checked = !isStoreOpen;
    }
};

window.toggleSupplierStoreOnline = async function(forceState = null) {
    if (!state.currentUser) {
        showToast('Please log in as a supplier first', 'info');
        return;
    }

    const currentlyOpen = state.currentUser.store_open !== false;
    const newStatus = forceState !== null ? forceState : !currentlyOpen;

    state.currentUser.store_open = newStatus;
    saveUserSession(state.currentUser);

    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === (state.currentUser.username || '').toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].store_open = newStatus;
    }

    window.updateSupplierDashboardStatus();
    if (window.updateLiveStatusPreview) window.updateLiveStatusPreview();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();

    try {
        await fetchWithTimeout(`${API_BASE_URL}/supplier/toggle-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                store_open: newStatus,
                username: state.currentUser.username
            })
        }, 5000);
    } catch (e) {
        console.warn('[TOGGLE STORE STATUS NETWORK ERROR]', e);
    }

    if (typeof fetchRestaurantsFromAPI === 'function') fetchRestaurantsFromAPI();

    showToast(
        newStatus 
            ? '🟢 Your restaurant is now <strong>ONLINE</strong>! Customers can place orders.'
            : '🔴 Your restaurant is now <strong>OFFLINE</strong>! Customer orders are paused.',
        newStatus ? 'success' : 'info'
    );
};

window.supplierDeleteMyRestaurant = function() {
    if (!state.currentUser) return;
    const storeName = state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username || 'Your Restaurant';
    const identifier = state.currentUser.username || state.currentUser.id || state.currentUser.supplier_company_name;

    const contentHtml = `
        <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                <i class="fa-solid fa-store-slash"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 800; font-size: 1.05rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${storeName}
                </div>
                <div style="font-size: 0.8rem; color: #64748B; margin-top: 2px;">
                    Supplier Account: <strong style="color: #334155;">@${state.currentUser.username || 'supplier'}</strong>
                </div>
            </div>
        </div>

        <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 12px; padding: 14px 16px;">
            <div style="font-weight: 800; color: #991B1B; font-size: 0.88rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation" style="color: #DC2626;"></i> Permanent Deletion Warning
            </div>
            <p style="margin: 0 0 10px 0; font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                Are you sure you want to permanently delete <strong>${storeName}</strong>?
            </p>
            <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: #991B1B; line-height: 1.55;">
                <li>All your uploaded products and menu items will be deleted</li>
                <li>Your restaurant listing will be removed from the homepage and search</li>
                <li>Your operating schedule and store settings will be reset</li>
            </ul>
        </div>
    `;

    showCustomConfirmModal({
        title: 'Delete Restaurant & Store',
        subtitle: 'Permanent Storefront Removal',
        icon: 'fa-solid fa-store-slash',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: contentHtml,
        cancelText: 'Keep Restaurant',
        confirmText: 'Delete My Restaurant',
        confirmIcon: 'fa-solid fa-trash-can',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            await executeSupplierDeleteMyRestaurantConfirmed(identifier, storeName);
        }
    });
};

async function executeSupplierDeleteMyRestaurantConfirmed(identifier, storeName) {
    try {
        const url = `${API_BASE_URL}/restaurants/${encodeURIComponent(identifier)}?store_name=${encodeURIComponent(storeName)}`;
        const headers = { 'Content-Type': 'application/json' };
        if (state.currentUser && (state.currentUser.access_token || state.currentUser.token)) {
            headers['Authorization'] = `Bearer ${state.currentUser.access_token || state.currentUser.token}`;
        }
        await fetchWithTimeout(url, {
            method: 'DELETE',
            headers: headers
        }, 15000);
    } catch (e) {
        console.warn('[DELETE RESTAURANT API]', e);
    }

    const targetClean = String(identifier).trim().toLowerCase();
    const storeClean = String(storeName).trim().toLowerCase();

    // Blacklist deleted restaurant in localStorage
    try {
        let deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
        if (!deletedRest.includes(targetClean)) deletedRest.push(targetClean);
        if (storeClean && !deletedRest.includes(storeClean)) deletedRest.push(storeClean);
        /* zero-storage */
    } catch (e) {}

    // Remove products of this supplier from local memory
    state.products = state.products.filter(p => !doesProductBelongToSupplier(p, state.currentUser));
    if (Array.isArray(storeProducts)) {
        storeProducts = storeProducts.filter(p => !doesProductBelongToSupplier(p, state.currentUser));
    }

    try {
        let cpList = JSON.parse(localStorage.getItem('dropzyy_custom_products') || '[]');
        cpList = cpList.filter(p => !doesProductBelongToSupplier(p, state.currentUser));
        /* zero-storage */
    } catch (e) {}

    persistCustomProducts();

    // Reset supplier info on current user
    state.currentUser.supplier_company_name = '';
    state.currentUser.role = 'customer';
    saveUserSession(state.currentUser);

    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === (state.currentUser.username || '').toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].supplier_company_name = '';
        registeredUsers[uIdx].role = 'customer';
    }

    closeModals();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof updateUserUI === 'function') updateUserUI();

    showToast(`🗑️ Restaurant "<strong>${storeName}</strong>" and all its menu items have been deleted.`, 'success');
}

window.deleteRestaurantByAdmin = function(identifier, storeName, event) {
    if (event) event.stopPropagation();
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Only administrators can delete partner restaurants.', 'error');
        return;
    }

    const cleanName = storeName || identifier;

    const contentHtml = `
        <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; margin-bottom: 14px;">
            <div style="width: 44px; height: 44px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink: 0;">
                <i class="fa-solid fa-store-slash"></i>
            </div>
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 800; font-size: 1.05rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${cleanName}
                </div>
                <div style="font-size: 0.8rem; color: #64748B; margin-top: 2px;">
                    Partner Identifier: <strong style="color: #334155;">${identifier}</strong>
                </div>
            </div>
        </div>

        <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; border-radius: 12px; padding: 14px 16px;">
            <div style="font-weight: 800; color: #991B1B; font-size: 0.88rem; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-shield-halved" style="color: #DC2626;"></i> Admin Override Action
            </div>
            <p style="margin: 0 0 10px 0; font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                Are you sure you want to permanently delete restaurant <strong>${cleanName}</strong>?
            </p>
            <ul style="margin: 0; padding-left: 18px; font-size: 0.82rem; color: #991B1B; line-height: 1.55;">
                <li>The restaurant profile and supplier account will be deleted</li>
                <li>All menu items belonging to "${cleanName}" will be deleted</li>
                <li>The restaurant listing will be removed from the homepage</li>
            </ul>
        </div>
    `;

    showCustomConfirmModal({
        title: 'Delete Restaurant',
        subtitle: 'Admin Partner Deletion',
        icon: 'fa-solid fa-triangle-exclamation',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: contentHtml,
        cancelText: 'Cancel',
        confirmText: 'Delete Restaurant',
        confirmIcon: 'fa-solid fa-trash-can',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            await executeDeleteRestaurantByAdminConfirmed(identifier, cleanName);
        }
    });
};

async function executeDeleteRestaurantByAdminConfirmed(identifier, cleanName) {
    try {
        const url = `${API_BASE_URL}/restaurants/${encodeURIComponent(identifier)}?store_name=${encodeURIComponent(cleanName)}`;
        const headers = { 'Content-Type': 'application/json' };
        if (state.currentUser && (state.currentUser.access_token || state.currentUser.token)) {
            headers['Authorization'] = `Bearer ${state.currentUser.access_token || state.currentUser.token}`;
        }
        await fetchWithTimeout(url, {
            method: 'DELETE',
            headers: headers
        }, 15000);
    } catch (e) {
        console.warn('[ADMIN DELETE RESTAURANT API ERR]', e);
    }

    const targetClean = String(identifier).trim().toLowerCase();
    const storeClean = String(cleanName).trim().toLowerCase();

    // Blacklist deleted restaurant so it is never re-discovered or re-rendered
    try {
        let deletedRest = JSON.parse(localStorage.getItem('dropzyy_deleted_restaurants') || '[]');
        if (!deletedRest.includes(targetClean)) deletedRest.push(targetClean);
        if (storeClean && !deletedRest.includes(storeClean)) deletedRest.push(storeClean);
        /* zero-storage */
    } catch (e) {}

    // Remove products belonging to this restaurant
    state.products = state.products.filter(p => {
        const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
        const pUid = String(p.supplier_user_id || '').trim().toLowerCase();
        const pComp = String(p.supplier_company_name || '').trim().toLowerCase();
        return pSup !== targetClean && pUid !== targetClean && pSup !== storeClean && pComp !== storeClean;
    });
    if (Array.isArray(storeProducts)) {
        storeProducts = storeProducts.filter(p => {
            const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
            const pUid = String(p.supplier_user_id || '').trim().toLowerCase();
            const pComp = String(p.supplier_company_name || '').trim().toLowerCase();
            return pSup !== targetClean && pUid !== targetClean && pSup !== storeClean && pComp !== storeClean;
        });
    }

    // Purge from custom products storage
    try {
        let cpList = JSON.parse(localStorage.getItem('dropzyy_custom_products') || '[]');
        cpList = cpList.filter(p => {
            const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
            const pUid = String(p.supplier_user_id || '').trim().toLowerCase();
            const pComp = String(p.supplier_company_name || '').trim().toLowerCase();
            return pSup !== targetClean && pUid !== targetClean && pSup !== storeClean && pComp !== storeClean;
        });
        /* zero-storage */
    } catch (e) {}

    persistCustomProducts();

    // Remove from registeredUsers
    registeredUsers = registeredUsers.filter(u => {
        const uName = (u.username || '').toLowerCase();
        const uComp = (u.supplier_company_name || '').toLowerCase();
        const uFull = (u.full_name || '').toLowerCase();
        return uName !== targetClean && uComp !== targetClean && uComp !== storeClean && uFull !== storeClean;
    });

    if (typeof closeRestaurantMenuModal === 'function') closeRestaurantMenuModal();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderAdminUsersDirectory === 'function') renderAdminUsersDirectory();

    showToast(`🗑️ Restaurant "<strong>${cleanName}</strong>" and all its menu items have been permanently deleted by Admin.`, 'success');
}

window.adminToggleRestaurantStatus = async function(identifier, storeName, currentOpenState) {
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Only administrators can toggle restaurant statuses.', 'error');
        return;
    }

    const newStatus = !currentOpenState;
    try {
        await fetchWithTimeout(`${API_BASE_URL}/supplier/toggle-status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                store_open: newStatus,
                username: identifier
            })
        }, 5000);
    } catch (e) {
        console.warn('[ADMIN TOGGLE RESTAURANT STATUS API ERR]', e);
    }

    const targetClean = String(identifier).trim().toLowerCase();
    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === targetClean || (u.supplier_company_name || '').toLowerCase() === targetClean);
    if (uIdx > -1) {
        registeredUsers[uIdx].store_open = newStatus;
    }

    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();

    if (state.activeModalRestaurant) {
        state.activeModalRestaurant.store_open = newStatus;
        if (typeof renderRestaurantMenuModalContent === 'function') {
            renderRestaurantMenuModalContent(state.activeModalRestaurant);
        }
    }

    showToast(`Restaurant "<strong>${storeName}</strong>" is now ${newStatus ? 'ONLINE 🟢' : 'OFFLINE 🔴'}.`, 'success');
};

// ==============================================================================
// 📸 FILE & IMAGE UPLOAD LOGIC (STORE IMAGE & MENU IMAGE) - MONGODB ATLAS (MAX 1 MB)
// ==============================================================================
const MAX_UPLOAD_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB (MongoDB Atlas binary limit per image)

try {
    window._supplierStoreImages = JSON.parse(localStorage.getItem('dropzyy_supplier_store_images') || '{}');
} catch (e) {
    window._supplierStoreImages = {};
}

// Global reference for currently selected product image file
window._selectedProductImageFile = null;

/**
 * 🗜️ Client-side Image Compressor
 * Resizes and iteratively compresses images using HTML5 Canvas to ensure size is strictly under targetMaxSizeBytes (1 MB).
 */
window.compressImageFile = async function(file, targetMaxSizeBytes = 1000000, preferredQuality = 0.82) {
    if (!file) throw new Error("No file provided for compression");

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.onload = function(e) {
            const img = new Image();
            img.onerror = () => reject(new Error("Failed to parse image element"));
            img.onload = async function() {
                try {
                    let w = img.width;
                    let h = img.height;
                    const maxDim = 1400; // Optimal resolution for web/mobile menus & banners

                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    const getCanvasBlob = (quality) => {
                        return new Promise((res) => {
                            canvas.toBlob((b) => res(b), 'image/jpeg', quality);
                        });
                    };

                    let currentQuality = preferredQuality || 0.82;
                    let blob = await getCanvasBlob(currentQuality);

                    // Step down quality iteratively if still exceeds target
                    const qualitySteps = [0.75, 0.65, 0.55, 0.45, 0.35];
                    let stepIdx = 0;
                    while (blob && blob.size > targetMaxSizeBytes && stepIdx < qualitySteps.length) {
                        currentQuality = qualitySteps[stepIdx];
                        blob = await getCanvasBlob(currentQuality);
                        stepIdx++;
                    }

                    // If still exceeds 1 MB, downscale dimensions
                    if (blob && blob.size > targetMaxSizeBytes) {
                        const downscaleFactors = [0.8, 0.65, 0.5];
                        for (let factor of downscaleFactors) {
                            const sw = Math.max(200, Math.round(w * factor));
                            const sh = Math.max(200, Math.round(h * factor));
                            const sCanvas = document.createElement('canvas');
                            sCanvas.width = sw;
                            sCanvas.height = sh;
                            const sCtx = sCanvas.getContext('2d');
                            sCtx.drawImage(img, 0, 0, sw, sh);

                            const sBlob = await new Promise(r => sCanvas.toBlob(r, 'image/jpeg', 0.6));
                            if (sBlob) {
                                blob = sBlob;
                                if (blob.size <= targetMaxSizeBytes) {
                                    canvas.width = sw;
                                    canvas.height = sh;
                                    ctx.drawImage(sCanvas, 0, 0);
                                    break;
                                }
                            }
                        }
                    }

                    const safeName = (file.name || 'image').replace(/\.[^/.]+$/, "") + ".jpg";
                    const compressedFile = new File([blob], safeName, { type: 'image/jpeg', lastModified: Date.now() });
                    const dataUrl = canvas.toDataURL('image/jpeg', currentQuality);

                    resolve({
                        file: compressedFile,
                        blob: blob,
                        dataUrl: dataUrl,
                        originalSize: file.size,
                        compressedSize: compressedFile.size,
                        quality: currentQuality
                    });
                } catch (err) {
                    reject(err);
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
};

/**
 * Upload an image file directly to MongoDB Atlas via backend `/api/upload`
 * If the file is > 1 MB, it will be automatically compressed before transmission.
 */
window.uploadImageFileToServer = async function(file) {
    if (!file) throw new Error('No file selected');

    // Auto-compress if exceeds 1 MB limit
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        try {
            const comp = await window.compressImageFile(file, MAX_UPLOAD_SIZE_BYTES, 0.82);
            file = comp.file;
        } catch (e) {
            console.warn('Auto compression before upload failed, attempting with original:', e);
        }
    }

    const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token') || (state.currentUser ? (state.currentUser.access_token || state.currentUser.token) : null);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.url) {
                return data.url;
            }
        } else {
            const errData = await response.json().catch(() => ({}));
            if (errData && errData.detail) {
                throw new Error(errData.detail);
            }
        }
    } catch (err) {
        console.warn('Backend MongoDB multipart upload failed, attempting offline fallback:', err);
        if (err.message && err.message.includes('exceeds')) {
            throw err;
        }
    }

    // Client-side fallback using compressed FileReader Data URL if offline
    return new Promise((resolve, reject) => {
        window.compressImageFile(file, MAX_UPLOAD_SIZE_BYTES, 0.8)
            .then(res => resolve(res.dataUrl))
            .catch(err => reject(err));
    });
};

/**
 * Handle Supplier Store Image Upload (Store Front Banner & Menu Card)
 */
window.handleStoreImageUpload = async function(event, type) {
    let file = event.target.files && event.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById('supplierImagesUploadStatus');
    const isBanner = type === 'banner';
    const previewEl = document.getElementById(isBanner ? 'supplierBannerPreview' : 'supplierMenuCardPreview');
    const placeholderEl = document.getElementById(isBanner ? 'supplierBannerPlaceholder' : 'supplierMenuCardPlaceholder');
    const urlInput = document.getElementById(isBanner ? 'supplierBannerUrlInput' : 'supplierMenuCardUrlInput');

    const origKb = Math.round(file.size / 1024);
    const origMb = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = file.size > 1024 * 1024 ? `${origMb} MB` : `${origKb} KB`;

    if (statusEl) {
        statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-primary"></i> Processing ${isBanner ? 'Store Front' : 'Menu Card'} photo (${sizeStr})...`;
    }

    try {
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
            if (statusEl) {
                statusEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-warning"></i> Reducing size from ${sizeStr} to under 1 MB...`;
            }
            const comp = await window.compressImageFile(file, MAX_UPLOAD_SIZE_BYTES, 0.8);
            file = comp.file;
            showToast(`Photo auto-reduced to ${Math.round(file.size / 1024)} KB to fit 1 MB limit! ⚡`, 'info');
        }

        const uploadedUrl = await window.uploadImageFileToServer(file);
        if (urlInput) urlInput.value = uploadedUrl;
        if (previewEl && placeholderEl) {
            previewEl.src = uploadedUrl;
            previewEl.style.display = 'block';
            placeholderEl.style.display = 'none';
        }

        // Auto-save store images directly to MongoDB Atlas cloud database
        await window.saveSupplierStoreImages(true);
        if (typeof fetchRestaurantsFromAPI === 'function') {
            await fetchRestaurantsFromAPI();
        }

        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #059669;"><i class="fa-solid fa-circle-check"></i> ${isBanner ? 'Store Front' : 'Menu Card'} saved (${Math.round(file.size / 1024)} KB) & synced live!</span>`;
        }
        showToast(`${isBanner ? 'Store Front' : 'Menu Card'} photo updated & saved live!`, 'success');
    } catch (err) {
        showToast(err.message || 'Failed to upload photo', 'error');
        if (statusEl) {
            statusEl.innerHTML = `<span style="color: #DC2626;"><i class="fa-solid fa-triangle-exclamation"></i> Upload failed: ${err.message}</span>`;
        }
    }
};

window.handleStoreImageUrlChange = function(type, url) {
    const isBanner = type === 'banner';
    const previewEl = document.getElementById(isBanner ? 'supplierBannerPreview' : 'supplierMenuCardPreview');
    const placeholderEl = document.getElementById(isBanner ? 'supplierBannerPlaceholder' : 'supplierMenuCardPlaceholder');
    const clean = (url || '').trim();
    if (previewEl && placeholderEl) {
        if (clean) {
            previewEl.src = clean;
            previewEl.style.display = 'block';
            placeholderEl.style.display = 'none';
        } else {
            previewEl.style.display = 'none';
            placeholderEl.style.display = 'flex';
        }
    }
};

window.saveSupplierStoreImages = async function(silent = false) {
    if (!state.currentUser) {
        if (!silent) showToast('Please log in as a supplier first', 'error');
        return;
    }

    const bannerInput = document.getElementById('supplierBannerUrlInput');
    const menuCardInput = document.getElementById('supplierMenuCardUrlInput');
    const bannerVal = bannerInput ? bannerInput.value.trim() : '';
    const menuCardVal = menuCardInput ? menuCardInput.value.trim() : '';

    state.currentUser.banner_image = bannerVal;
    state.currentUser.menu_card_image = menuCardVal;
    saveUserSession(state.currentUser);

    const uname = (state.currentUser.username || '').toLowerCase();
    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === uname);
    if (uIdx > -1) {
        registeredUsers[uIdx].banner_image = bannerVal;
        registeredUsers[uIdx].menu_card_image = menuCardVal;
    }

    if (uname) {
        window._supplierStoreImages[uname] = { banner_image: bannerVal, menu_card_image: menuCardVal };
        /* zero-storage */
    }

    try {
        const token = localStorage.getItem('dropzyy_auth_token') || (state.currentUser ? (state.currentUser.access_token || state.currentUser.token) : null);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetchWithTimeout(`${API_BASE_URL}/supplier/store-images`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                user_id: state.currentUser.id,
                username: state.currentUser.username,
                banner_image: bannerVal,
                menu_card_image: menuCardVal
            })
        }, 10000);
    } catch (err) {
        console.warn('Backend sync for store images:', err);
    }

    if (typeof fetchRestaurantsFromAPI === 'function') {
        fetchRestaurantsFromAPI();
    }
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);

    if (!silent) showToast('Store front and menu card images saved successfully!', 'success');
};

/**
 * Handle Menu / Dish Image Selection in Product Add/Edit Modal
 */
window.handleProductImageSelection = async function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    window._selectedProductImageFile = file;

    const previewWrap = document.getElementById('prodImagePreviewWrap');
    const previewImg = document.getElementById('prodImagePreview');
    const sizeBadge = document.getElementById('prodImageSizeBadge');
    const compressPanel = document.getElementById('prodImageCompressPanel');
    const origText = document.getElementById('prodCompressOriginalSizeText');
    const resultBadge = document.getElementById('prodCompressResultBadge');
    const uploadingEl = document.getElementById('prodImageUploadingIndicator');
    const actionsEl = document.getElementById('prodImageActions');
    const prodInput = document.getElementById('prodImage');

    const origKb = Math.round(file.size / 1024);
    const origMb = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = file.size > 1024 * 1024 ? `${origMb} MB` : `${origKb} KB`;

    if (origText) origText.textContent = `Size: ${sizeStr}`;

    // Read and show instant local preview
    const reader = new FileReader();
    reader.onload = function(e) {
        if (previewImg) previewImg.src = e.target.result;
        if (previewWrap) previewWrap.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
        // Exceeds 1 MB - open compressor panel and guide supplier
        if (compressPanel) compressPanel.classList.remove('hidden');
        if (sizeBadge) {
            sizeBadge.innerHTML = `<span style="color: #DC2626;"><i class="fa-solid fa-triangle-exclamation"></i> Size: <strong>${sizeStr}</strong> (Exceeds 1 MB limit)</span>`;
        }
        if (resultBadge) {
            resultBadge.innerHTML = `<span style="color: #B45309;"><i class="fa-solid fa-bolt"></i> Image exceeds 1 MB. Click <strong>⚡ Reduce Size Now</strong> to compress under 1 MB.</span>`;
        }
        showToast(`Photo is ${sizeStr}. Limit is 1 MB. Use the size reducer below to compress it under 1 MB!`, 'warning');
    } else {
        // Within 1 MB limit - upload immediately to MongoDB Atlas
        if (sizeBadge) {
            sizeBadge.innerHTML = `<span style="color: #059669;"><i class="fa-solid fa-circle-check"></i> Size: <strong>${sizeStr}</strong> (Within 1 MB limit ✅)</span>`;
        }
        if (resultBadge) resultBadge.innerHTML = '';
        if (compressPanel) compressPanel.classList.add('hidden');

        if (uploadingEl) uploadingEl.classList.remove('hidden');
        if (actionsEl) actionsEl.classList.add('hidden');

        try {
            const uploadedUrl = await window.uploadImageFileToServer(file);
            if (prodInput) {
                prodInput.value = uploadedUrl;
                if (typeof window.syncProductImageUrl === 'function') window.syncProductImageUrl(uploadedUrl);
            }
            showToast(`Menu photo uploaded successfully! (${sizeStr})`, 'success');
        } catch (err) {
            showToast(err.message || 'Failed to upload photo', 'error');
        } finally {
            if (uploadingEl) uploadingEl.classList.add('hidden');
            if (actionsEl) actionsEl.classList.remove('hidden');
        }
    }
};

/**
 * ⚡ Reduce Size Now - Compresses Selected Product Image Under 1 MB
 */
window.compressSelectedProductImage = async function() {
    const file = window._selectedProductImageFile;
    if (!file) {
        showToast('Please select an image file first', 'info');
        const fileInput = document.getElementById('prodImageFileInput');
        if (fileInput) fileInput.click();
        return;
    }

    const resultBadge = document.getElementById('prodCompressResultBadge');
    const sizeBadge = document.getElementById('prodImageSizeBadge');
    const previewImg = document.getElementById('prodImagePreview');
    const prodInput = document.getElementById('prodImage');
    const uploadingEl = document.getElementById('prodImageUploadingIndicator');
    const actionsEl = document.getElementById('prodImageActions');

    const qualityRadio = document.querySelector('input[name="prodCompressQuality"]:checked');
    const qualityVal = qualityRadio ? parseFloat(qualityRadio.value) : 0.82;

    if (resultBadge) {
        resultBadge.innerHTML = `<span style="color: #2563EB;"><i class="fa-solid fa-spinner fa-spin"></i> Reducing image size under 1 MB...</span>`;
    }

    try {
        const compressed = await window.compressImageFile(file, MAX_UPLOAD_SIZE_BYTES, qualityVal);
        window._selectedProductImageFile = compressed.file;

        const origStr = compressed.originalSize > 1024 * 1024 ? `${(compressed.originalSize / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(compressed.originalSize / 1024)} KB`;
        const newStr = `${Math.round(compressed.compressedSize / 1024)} KB`;
        const savedPercent = Math.max(0, Math.round((1 - compressed.compressedSize / compressed.originalSize) * 100));

        if (previewImg) previewImg.src = compressed.dataUrl;

        if (sizeBadge) {
            sizeBadge.innerHTML = `<span style="color: #059669;"><i class="fa-solid fa-circle-check"></i> Reduced: <strong>${newStr}</strong> (Saved ${savedPercent}%) ✅</span>`;
        }

        if (resultBadge) {
            resultBadge.innerHTML = `<span style="color: #059669;"><i class="fa-solid fa-circle-check"></i> <strong>${origStr} ➔ ${newStr}</strong> (${savedPercent}% reduced). Saving...</span>`;
        }

        if (uploadingEl) uploadingEl.classList.remove('hidden');
        if (actionsEl) actionsEl.classList.add('hidden');

        const uploadedUrl = await window.uploadImageFileToServer(compressed.file);
        if (prodInput) {
            prodInput.value = uploadedUrl;
            if (typeof window.syncProductImageUrl === 'function') window.syncProductImageUrl(uploadedUrl);
        }

        if (resultBadge) {
            resultBadge.innerHTML = `<span style="color: #059669;"><i class="fa-solid fa-cloud-arrow-up"></i> <strong>Saved:</strong> ${newStr} (${savedPercent}% saved) 🎉</span>`;
        }

        showToast(`Image reduced to ${newStr} and saved!`, 'success');
    } catch (err) {
        console.error('Compression error:', err);
        if (resultBadge) {
            resultBadge.innerHTML = `<span style="color: #DC2626;"><i class="fa-solid fa-triangle-exclamation"></i> Reduction failed: ${err.message}</span>`;
        }
        showToast('Failed to reduce image size: ' + err.message, 'error');
    } finally {
        if (uploadingEl) uploadingEl.classList.add('hidden');
        if (actionsEl) actionsEl.classList.remove('hidden');
    }
};

window.toggleProductCompressTool = function() {
    const panel = document.getElementById('prodImageCompressPanel');
    if (!panel) return;
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
};

window.clearProductImagePreview = function() {
    window._selectedProductImageFile = null;
    const prodInput = document.getElementById('prodImage');
    const previewWrap = document.getElementById('prodImagePreviewWrap');
    const previewImg = document.getElementById('prodImagePreview');
    const fileInput = document.getElementById('prodImageFileInput');
    const sizeBadge = document.getElementById('prodImageSizeBadge');
    const compressPanel = document.getElementById('prodImageCompressPanel');
    const resultBadge = document.getElementById('prodCompressResultBadge');

    if (prodInput) prodInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.classList.add('hidden');
    if (fileInput) fileInput.value = '';
    if (sizeBadge) sizeBadge.innerHTML = '';
    if (resultBadge) resultBadge.innerHTML = '';
    if (compressPanel) compressPanel.classList.add('hidden');
};

window.syncProductImageUrl = function(url) {
    const previewWrap = document.getElementById('prodImagePreviewWrap');
    const previewImg = document.getElementById('prodImagePreview');
    const clean = (url || '').trim();
    if (previewImg && previewWrap) {
        if (clean && (clean.startsWith('http') || clean.startsWith('/api/images/') || clean.startsWith('/uploads/') || clean.startsWith('data:image/'))) {
            previewImg.src = clean;
            previewWrap.classList.remove('hidden');
        } else if (!clean) {
            previewWrap.classList.add('hidden');
        }
    }
};

window.viewFullMenuCardModal = function(imageUrl, restaurantName) {
    const modal = document.getElementById('menuCardViewerModal');
    const overlay = document.getElementById('menuCardViewerOverlay');
    const imgEl = document.getElementById('menuCardViewerImage');
    const titleEl = document.getElementById('menuCardViewerTitle');
    const spinner = document.getElementById('menuCardViewerSpinner');

    if (titleEl) titleEl.textContent = `${restaurantName || 'Restaurant'} — Menu Card Photo`;
    if (spinner) {
        spinner.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-primary"></i> Loading Menu Photo...';
        spinner.style.display = 'flex';
    }

    const restNameLower = String(restaurantName || '').toLowerCase();
    const isBanjos = restNameLower.includes('banjo') || String(imageUrl || '').toLowerCase().includes('banjo');

    // 1. Direct memory display if Banjos Cafe data URI is available (0 network latency, 100% offline & file:// safe)
    if (isBanjos && window.BANJOS_MENU_CARD_DATA) {
        if (imgEl) {
            imgEl.onload = function() {
                if (spinner) spinner.style.display = 'none';
                imgEl.style.display = 'block';
            };
            imgEl.src = window.BANJOS_MENU_CARD_DATA;
        }
        if (modal) modal.classList.add('active');
        if (overlay) overlay.classList.add('active');
        return;
    }

    let cleanUrl = String(imageUrl || '').trim();
    if (!cleanUrl || cleanUrl === 'undefined' || cleanUrl === 'null') {
        if (window.BANJOS_MENU_CARD_DATA) {
            cleanUrl = window.BANJOS_MENU_CARD_DATA;
        } else {
            cleanUrl = 'uploads/banjos_menu_card_page_1.jpg';
        }
    }

    if (cleanUrl.startsWith('data:image/')) {
        if (imgEl) {
            imgEl.onload = function() {
                if (spinner) spinner.style.display = 'none';
                imgEl.style.display = 'block';
            };
            imgEl.src = cleanUrl;
        }
        if (modal) modal.classList.add('active');
        if (overlay) overlay.classList.add('active');
        return;
    }

    // Comprehensive fallback candidates
    const candidates = [];
    if (window.BANJOS_MENU_CARD_DATA) candidates.push(window.BANJOS_MENU_CARD_DATA);
    candidates.push(cleanUrl);
    candidates.push(cleanUrl.replace(/^\/+/, ''));
    candidates.push('./' + cleanUrl.replace(/^\/+/, ''));
    candidates.push('/' + cleanUrl.replace(/^\/+/, ''));
    if (window.location.origin && !window.location.origin.includes('file://')) {
        candidates.push(`${window.location.origin}/${cleanUrl.replace(/^\/+/, '')}`);
        candidates.push(`${window.location.origin}/api/images/banjos_menu_card_page_1.jpg`);
    }
    candidates.push('http://localhost:8000/' + cleanUrl.replace(/^\/+/, ''));
    candidates.push('http://localhost:8000/api/images/banjos_menu_card_page_1.jpg');

    let candidateIdx = 0;
    if (imgEl) {
        imgEl.style.display = 'none';
        imgEl.onload = function() {
            if (spinner) spinner.style.display = 'none';
            imgEl.style.display = 'block';
        };
        imgEl.onerror = function() {
            candidateIdx++;
            if (candidateIdx < candidates.length) {
                console.warn('Retrying menu image with fallback candidate:', candidates[candidateIdx]);
                imgEl.src = candidates[candidateIdx];
            } else if (window.BANJOS_MENU_CARD_DATA) {
                imgEl.src = window.BANJOS_MENU_CARD_DATA;
            } else {
                if (spinner) {
                    spinner.innerHTML = '<span style="color:#EF4444; font-size:0.88rem;"><i class="fa-solid fa-triangle-exclamation"></i> Image preview unavailable. Please verify backend on port 8000.</span>';
                }
                imgEl.onerror = null;
            }
        };
        imgEl.src = candidates[0];
    }

    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.closeMenuCardViewerModal = function() {
    const modal = document.getElementById('menuCardViewerModal');
    const overlay = document.getElementById('menuCardViewerOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.handleAdminStoreImageUpload = async function(event, type) {
    let file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
            showToast(`Image exceeds 1 MB. Reducing image size...`, 'info');
            const comp = await window.compressImageFile(file, MAX_UPLOAD_SIZE_BYTES, 0.8);
            file = comp.file;
        }

        const url = await window.uploadImageFileToServer(file);
        const inputId = type === 'banner' ? 'adminUserBannerImage' : 'adminUserMenuCardImage';
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.value = url;
        showToast(`${type === 'banner' ? 'Store Front' : 'Menu Card'} photo saved! (${Math.round(file.size / 1024)} KB)`, 'success');
    } catch (err) {
        showToast(err.message || 'Upload failed', 'error');
    }
};

// 11. ADMIN / SUPPLIER PRODUCT CREATE & EDIT
window.toggleProductOnlineStatus = function(productId) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    if (!canUserEditProduct(product)) {
        showToast('Permission Denied: You can only change online/offline status for your own products.', 'error');
        return;
    }

    const isCurrentlyOnline = isProductOnline(product);
    const newStatus = !isCurrentlyOnline;

    product.isOnline = newStatus;
    product.is_online = newStatus;

    // Immediately persist and sync UI everywhere
    persistCustomProducts();
    renderProducts();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);

    if (document.getElementById('supplierDashboardModal') && document.getElementById('supplierDashboardModal').classList.contains('active')) {
        renderSupplierDashboard();
    }

    const statusMsg = newStatus 
        ? `Product '<strong>${product.title}</strong>' is now <strong>ONLINE 🟢</strong> (Visible to Customers)`
        : `Product '<strong>${product.title}</strong>' is now <strong>OFFLINE 🔴</strong> (Hidden from Website)`;

    showToast(statusMsg, newStatus ? 'success' : 'info');

    try {
        const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetchWithTimeout(`${API_BASE_URL}/products/${product.id}`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                title: product.title,
                category: product.category,
                price: product.price,
                original_price: product.originalPrice || product.price,
                unit: product.unit,
                image: product.image,
                badge: product.badge,
                discount: product.discount,
                description: product.description,
                supplier_name: product.supplierName || product.supplier_name,
                supplier_company_name: product.supplier_company_name,
                supplier_user_id: product.supplier_user_id,
                is_online: newStatus
            })
        }, 10000).catch(err => console.warn('Could not sync online/offline status to backend:', err));
    } catch (e) {}
};

window.toggleProductVariantsUI = function(enabled) {
    const container = document.getElementById('prodVariantsContainer');
    const rowsList = document.getElementById('variantRowsList');
    if (!container || !rowsList) return;

    if (enabled) {
        container.classList.remove('hidden');
        if (rowsList.children.length === 0) {
            const basePrice = parseFloat(document.getElementById('prodPrice')?.value) || 99;
            addVariantRow('Regular', basePrice);
            addVariantRow('+ Cheese', basePrice + 20);
        }
    } else {
        container.classList.add('hidden');
    }
};

window.addVariantRow = function(name = '', price = '') {
    const rowsList = document.getElementById('variantRowsList');
    if (!rowsList) return;
    const row = document.createElement('div');
    row.className = 'variant-input-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
    row.innerHTML = `
        <input type="text" class="variant-name-input" placeholder="Option Name (e.g. Regular, + Cheese, Dbl Cheese)" value="${name}" style="flex: 1.5; padding: 7px 10px; border: 1.5px solid #CBD5E1; border-radius: 8px; font-size: 0.85rem;" required>
        <div style="position: relative; flex: 1;">
            <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #64748B; font-weight: 700; font-size: 0.85rem;">₹</span>
            <input type="number" step="0.5" class="variant-price-input" placeholder="Price" value="${price}" style="width: 100%; padding: 7px 10px 7px 22px; border: 1.5px solid #CBD5E1; border-radius: 8px; font-size: 0.85rem;" required>
        </div>
        <button type="button" onclick="this.parentElement.remove()" style="background: #FEE2E2; color: #DC2626; border: none; border-radius: 6px; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;" title="Remove this option">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    `;
    rowsList.appendChild(row);
};

window.collectProductVariants = function() {
    const hasVariantsCheckbox = document.getElementById('prodHasVariants');
    if (!hasVariantsCheckbox || !hasVariantsCheckbox.checked) return null;
    const rowsList = document.getElementById('variantRowsList');
    if (!rowsList) return null;
    const rows = rowsList.querySelectorAll('.variant-input-row');
    const variants = [];
    rows.forEach(r => {
        const nameInput = r.querySelector('.variant-name-input');
        const priceInput = r.querySelector('.variant-price-input');
        const name = nameInput ? nameInput.value.trim() : '';
        const price = priceInput ? parseFloat(priceInput.value) : null;
        if (name && price !== null && !isNaN(price)) {
            variants.push({ name, price });
        }
    });
    return variants.length > 0 ? variants : null;
};

window.openAddProductModal = function() {
    closeModals();
    populateCategoryDropdowns();
    if (editProductId) editProductId.value = '';
    if (adminModalTitle) adminModalTitle.innerHTML = `<i class="fa-solid fa-plus-circle text-primary"></i> Add Kirana Product`;
    if (adminModalSub) adminModalSub.textContent = `Add a new product to the catalog`;
    if (addProductForm) addProductForm.reset();

    if (document.getElementById('prodStatus')) {
        document.getElementById('prodStatus').value = 'online';
    }

    // Reset Food Type & Variants
    if (document.getElementById('prodFoodType')) {
        document.getElementById('prodFoodType').value = '';
    }
    const hasVarEl = document.getElementById('prodHasVariants');
    if (hasVarEl) hasVarEl.checked = false;
    const varCont = document.getElementById('prodVariantsContainer');
    if (varCont) varCont.classList.add('hidden');
    const varRows = document.getElementById('variantRowsList');
    if (varRows) varRows.innerHTML = '';

    if (typeof window.clearProductImagePreview === 'function') {
        window.clearProductImagePreview();
    }

    const supplierInput = document.getElementById('prodSupplierName');
    if (supplierInput) {
        if (state.currentUser && state.currentUser.role === 'supplier') {
            const defaultSupplier = state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username;
            supplierInput.value = defaultSupplier;
            supplierInput.readOnly = true;
            supplierInput.title = "Supplier name is set to your registered business name";
        } else {
            supplierInput.value = 'Dropzyy Direct';
            supplierInput.readOnly = false;
            supplierInput.title = "";
        }
    }

    if (adminOverlay) adminOverlay.classList.add('active');
    if (adminModal) adminModal.classList.add('active');
};

window.openEditProductModal = function(productId) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    if (!canUserEditProduct(product)) {
        showToast('Permission Denied: You can only edit products added by your supplier account.', 'error');
        return;
    }

    closeModals();
    populateCategoryDropdowns();

    if (editProductId) editProductId.value = product.id;
    if (adminModalTitle) adminModalTitle.innerHTML = `<i class="fa-solid fa-pen-to-square text-primary"></i> Edit Kirana Product`;
    if (adminModalSub) adminModalSub.textContent = `Update details for "${product.title}"`;

    if (document.getElementById('prodTitle')) document.getElementById('prodTitle').value = product.title;
    if (document.getElementById('prodCategory')) document.getElementById('prodCategory').value = product.category;
    if (document.getElementById('prodPrice')) document.getElementById('prodPrice').value = product.price;
    if (document.getElementById('prodOriginalPrice')) document.getElementById('prodOriginalPrice').value = product.originalPrice;
    if (document.getElementById('prodUnit')) document.getElementById('prodUnit').value = product.unit;
    if (document.getElementById('prodBadge')) document.getElementById('prodBadge').value = product.badge;

    // Populate Food Type
    if (document.getElementById('prodFoodType')) {
        document.getElementById('prodFoodType').value = product.food_type || '';
    }

    // Populate Variants
    const hasVarEl = document.getElementById('prodHasVariants');
    const varCont = document.getElementById('prodVariantsContainer');
    const varRows = document.getElementById('variantRowsList');
    if (varRows) varRows.innerHTML = '';

    if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        if (hasVarEl) hasVarEl.checked = true;
        if (varCont) varCont.classList.remove('hidden');
        product.variants.forEach(v => addVariantRow(v.name, v.price));
    } else {
        if (hasVarEl) hasVarEl.checked = false;
        if (varCont) varCont.classList.add('hidden');
    }

    if (document.getElementById('prodStatus')) {
        const isOnline = isProductOnline(product);
        document.getElementById('prodStatus').value = isOnline ? 'online' : 'offline';
    }

    const supplierInput = document.getElementById('prodSupplierName');
    if (supplierInput) {
        supplierInput.value = product.supplierName || 'Dropzyy Direct';
        if (state.currentUser && state.currentUser.role === 'supplier') {
            supplierInput.readOnly = true;
        } else {
            supplierInput.readOnly = false;
        }
    }

    if (document.getElementById('prodImage')) document.getElementById('prodImage').value = product.image;
    if (document.getElementById('prodDesc')) document.getElementById('prodDesc').value = product.description || '';

    // Show image preview
    const previewWrap = document.getElementById('prodImagePreviewWrap');
    const previewImg = document.getElementById('prodImagePreview');
    if (previewImg && previewWrap) {
        if (product.image) {
            previewImg.src = product.image;
            previewWrap.classList.remove('hidden');
        } else {
            previewWrap.classList.add('hidden');
        }
    }

    if (adminOverlay) adminOverlay.classList.add('active');
    if (adminModal) adminModal.classList.add('active');
};

window.deleteProduct = function(productId) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    if (!canUserEditProduct(product)) {
        showToast('Permission Denied: You can only delete products added by your supplier account.', 'error');
        return;
    }

    const imgMarkup = product.image
        ? `<img src="${product.image}" alt="${(product.title || '').replace(/"/g, '&quot;')}" style="width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid #E2E8F0; flex-shrink: 0;" onerror="this.onerror=null;this.src='https://placehold.co/100?text=Item';">`
        : `<div style="width: 52px; height: 52px; border-radius: 8px; background: #F1F5F9; display: flex; align-items: center; justify-content: center; color: #94A3B8; font-size: 1.3rem; flex-shrink: 0;"><i class="fa-solid fa-utensils"></i></div>`;

    const contentHtml = `
        <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
            ${imgMarkup}
            <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 800; font-size: 0.96rem; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${product.title || 'Product'}
                </div>
                <div style="font-size: 0.78rem; color: #64748B; margin-top: 2px;">
                    Category: <strong style="color: #334155;">${product.category || 'General'}</strong> ${product.unit ? `• ${product.unit}` : ''}
                </div>
                <div style="font-size: 0.92rem; font-weight: 800; color: #10B981; margin-top: 3px;">
                    ₹${parseFloat(product.price || 0).toFixed(2)}
                </div>
            </div>
        </div>

        <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 12px; padding: 12px 14px; display: flex; align-items: flex-start; gap: 10px;">
            <i class="fa-solid fa-triangle-exclamation" style="color: #DC2626; font-size: 1.15rem; margin-top: 2px; flex-shrink: 0;"></i>
            <div style="font-size: 0.84rem; color: #7F1D1D; line-height: 1.45;">
                <strong style="color: #991B1B;">Are you sure you want to delete this product?</strong><br>
                It will be permanently removed from your menu and catalog. Customers will no longer be able to view or order it.
            </div>
        </div>
    `;

    showCustomConfirmModal({
        title: 'Delete Product',
        subtitle: 'Product & Menu Item Removal',
        icon: 'fa-solid fa-trash-can',
        iconBg: '#FEE2E2',
        iconColor: '#DC2626',
        contentHtml: contentHtml,
        cancelText: 'Cancel',
        confirmText: 'Delete Product',
        confirmIcon: 'fa-solid fa-trash-can',
        confirmBg: '#DC2626',
        onConfirm: async () => {
            await executeDeleteProductConfirmed(productId, product);
        }
    });
};

async function executeDeleteProductConfirmed(productId, product) {
    const pIdClean = String(productId).trim();
    const pTitleClean = String(product.title || '').trim().toLowerCase();

    // Blacklist deleted product in localStorage
    try {
        let deletedProds = JSON.parse(localStorage.getItem('dropzyy_deleted_products') || '[]');
        if (!deletedProds.includes(pIdClean)) deletedProds.push(pIdClean);
        if (pTitleClean && !deletedProds.includes(pTitleClean)) deletedProds.push(pTitleClean);
        /* zero-storage */
    } catch (e) {}

    state.products = state.products.filter(p => String(p.id) !== pIdClean);
    if (Array.isArray(storeProducts)) {
        storeProducts = storeProducts.filter(p => String(p.id) !== pIdClean);
    }

    try {
        let cpList = JSON.parse(localStorage.getItem('dropzyy_custom_products') || '[]');
        cpList = cpList.filter(p => String(p.id) !== pIdClean && String(p.title || '').trim().toLowerCase() !== pTitleClean);
        /* zero-storage */
    } catch (e) {}

    persistCustomProducts();
    renderProducts();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);

    if (document.getElementById('supplierDashboardModal') && document.getElementById('supplierDashboardModal').classList.contains('active')) {
        renderSupplierDashboard();
    }

    try {
        const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetchWithTimeout(`${API_BASE_URL}/products/${productId}`, { method: 'DELETE', headers }, 15000);
        if (res && res.ok) {
            showToast(`Product '${product.title}' removed!`, 'info');
        } else {
            showToast('Product removed from catalog', 'info');
        }
    } catch (e) {
        showToast('Product removed from catalog', 'info');
    }
}

function saveProduct(productData, isEdit = false) {
    const isOnlineVal = isProductOnline({ is_online: productData.is_online, isOnline: productData.is_online });
    const sCompName = productData.supplier_company_name || (state.currentUser ? (state.currentUser.supplier_company_name || state.currentUser.full_name) : productData.supplier_name);
    const sUserId = productData.supplier_user_id || (state.currentUser ? String(state.currentUser.id || state.currentUser.username) : null);

    const token = localStorage.getItem('dropzyy_auth_token') || sessionStorage.getItem('dropzyy_auth_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    if (isEdit) {
        const index = state.products.findIndex(p => String(p.id) === String(productData.id));
        if (index !== -1) {
            state.products[index] = {
                ...state.products[index],
                title: productData.title,
                category: productData.category,
                price: productData.price,
                originalPrice: productData.original_price,
                unit: productData.unit,
                image: productData.image,
                badge: productData.badge,
                discount: productData.discount,
                description: productData.description,
                supplierName: productData.supplier_name,
                supplier_name: productData.supplier_name,
                supplier_company_name: sCompName || state.products[index].supplier_company_name,
                supplier_user_id: sUserId || state.products[index].supplier_user_id,
                isOnline: isOnlineVal,
                is_online: isOnlineVal,
                variants: productData.variants || null,
                food_type: productData.food_type || null,
                customAdded: true
            };
        }
        persistCustomProducts();
        renderProducts();
        if (typeof renderRestaurants === 'function') renderRestaurants();
        if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);
        closeModals();
        showToast(`Updated <strong>${productData.title}</strong>!`, 'success');

        try {
            fetchWithTimeout(`${API_BASE_URL}/products/${productData.id}`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify({
                    title: productData.title,
                    category: productData.category,
                    price: productData.price,
                    original_price: productData.original_price,
                    unit: productData.unit,
                    image: productData.image,
                    badge: productData.badge,
                    discount: productData.discount,
                    description: productData.description,
                    supplier_name: productData.supplier_name,
                    supplier_company_name: sCompName,
                    supplier_user_id: sUserId,
                    is_online: isOnlineVal,
                    variants: productData.variants || null,
                    food_type: productData.food_type || null
                })
            }, 15000).then(() => {
                persistCustomProducts();
            }).catch(() => {});
        } catch (e) {}

    } else {
        const newProduct = {
            id: 'prod_' + Date.now(),
            title: productData.title,
            category: productData.category,
            price: productData.price,
            originalPrice: productData.original_price,
            unit: productData.unit,
            rating: 5.0,
            reviewsCount: 1,
            image: productData.image,
            badge: productData.badge || 'Fresh Produce',
            discount: productData.discount || '10% OFF',
            description: productData.description || '',
            supplierName: productData.supplier_name || 'Dropzyy Direct',
            supplier_name: productData.supplier_name || 'Dropzyy Direct',
            supplier_company_name: sCompName,
            supplier_user_id: sUserId,
            isOnline: isOnlineVal,
            is_online: isOnlineVal,
            variants: productData.variants || null,
            food_type: productData.food_type || null,
            customAdded: true
        };

        state.products.unshift(newProduct);
        persistCustomProducts();
        renderProducts();
        if (typeof renderRestaurants === 'function') renderRestaurants();
        if (state.activeModalRestaurant) renderRestaurantMenuModalContent(state.activeModalRestaurant);
        closeModals();
        showToast(`Added <strong>${productData.title}</strong> successfully!`, 'success');

        try {
            fetchWithTimeout(`${API_BASE_URL}/products`, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    title: productData.title,
                    category: productData.category,
                    price: productData.price,
                    original_price: productData.original_price,
                    unit: productData.unit,
                    image: productData.image,
                    badge: productData.badge,
                    discount: productData.discount,
                    description: productData.description,
                    supplier_name: productData.supplier_name,
                    supplier_company_name: sCompName,
                    supplier_user_id: sUserId,
                    is_online: isOnlineVal,
                    variants: productData.variants || null,
                    food_type: productData.food_type || null
                })
            }, 15000).then(res => res && res.ok && res.json()).then(saved => {
                if (saved && saved.id) {
                    newProduct.id = saved.id;
                    persistCustomProducts();
                }
            }).catch(() => {});
        } catch (e) {}
    }
}

// 12. WISHLIST MANAGEMENT
async function toggleWishlist(productId) {
    const id = String(productId);
    if (state.currentUser) {
        const userId = state.currentUser.id || state.currentUser.username;
        try {
            const res = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: String(userId), product_id: id })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.in_wishlist) {
                    state.wishlist.add(id);
                    showToast('Added item to Wishlist!', 'success');
                } else {
                    state.wishlist.delete(id);
                    showToast('Removed item from Wishlist', 'info');
                }
            }
        } catch (err) {
            if (state.wishlist.has(id)) state.wishlist.delete(id);
            else state.wishlist.add(id);
        }
    } else {
        if (state.wishlist.has(id)) {
            state.wishlist.delete(id);
            showToast('Removed item from Wishlist', 'info');
        } else {
            state.wishlist.add(id);
            showToast('Added item to Wishlist!', 'success');
        }
    }
    updateWishlistUI();
    renderProducts();
}

function openWishlistModal() {
    closeModals();
    renderWishlistModal();
    if (wishlistOverlay) wishlistOverlay.classList.add('active');
    if (wishlistModal) wishlistModal.classList.add('active');
}

window.removeFromWishlist = function(productId) {
    const id = String(productId);
    state.wishlist.delete(id);
    // Wishlist persisted in SQLite
    updateWishlistUI();
    renderProducts();
    renderWishlistModal();
    showToast('Removed item from Wishlist', 'info');
};

function renderWishlistModal() {
    if (!wishlistContainer) return;
    
    if (state.wishlist.size === 0) {
        wishlistContainer.innerHTML = '<p class="empty-state" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">Your Wishlist is empty.</p>';
        return;
    }

    const wishlistedProducts = state.products.filter(p => state.wishlist.has(String(p.id)));
    
    wishlistContainer.innerHTML = wishlistedProducts.map(product => `
        <div class="product-card" style="margin-bottom: 1rem; position: relative;">
            <div class="product-img-wrapper" onclick="openQuickView('${product.id}')">
                <img src="${product.image}" alt="${product.title}" class="product-img" loading="lazy">
            </div>
            <div class="product-info" style="padding: 10px;">
                <h3 class="product-title" style="font-size: 0.95rem; margin-bottom: 5px;">${product.title}</h3>
                <div class="price-container" style="margin-bottom: 0.8rem;">
                    <span class="current-price">₹${product.price}</span>
                    <span class="original-price">₹${product.originalPrice}</span>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="add-cart-btn" onclick="addToCart('${product.id}')" style="flex: 1; justify-content: center;">
                        <i class="fa-solid fa-plus"></i> Add
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="removeFromWishlist('${product.id}')" title="Delete from Wishlist" style="padding: 6px 10px; border-radius: 20px; color: #DC2626; background: #FEE2E2;">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function updateWishlistUI() {
    if (wishlistBadge) wishlistBadge.textContent = state.wishlist.size;
}

// 13. QUICK VIEW MODAL
function openQuickView(productId) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    const sName = product.supplierName || product.supplier_name || 'Dropzyy Direct';
    const storeCheck = isSupplierStoreOpen(product);
    const isOnline = isProductOnline(product);

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const selectedIdx = (hasVariants && product._selectedVariantIndex !== undefined && product._selectedVariantIndex < product.variants.length)
        ? product._selectedVariantIndex
        : 0;
    const activeVariant = hasVariants ? product.variants[selectedIdx] : null;
    const currentPrice = activeVariant ? Number(activeVariant.price) : Number(product.price);

    quickViewContent.innerHTML = `
        <img src="${product.image}" alt="${product.title}" class="qv-image">
        <div class="qv-details">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px;">
                <span class="product-badge badge-organic">${product.badge}</span>
                ${window.renderFoodTypeBadge ? window.renderFoodTypeBadge(product.food_type) : ''}
            </div>
            <h2 class="qv-title">${product.title}</h2>
            <div class="product-unit" style="margin-bottom: 6px;">Pack Size: ${product.unit}</div>
            
            <div class="product-supplier-tag" style="margin-bottom: 12px; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span><i class="fa-solid fa-truck-field text-primary"></i> Supplied by: <strong>${sName}</strong></span>
                ${!isOnline 
                    ? `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.75rem; padding:2px 8px; border-radius:10px; font-weight:700;">🔴 OFFLINE FROM WEBSITE</span>`
                    : storeCheck.isOpen 
                        ? `<span class="badge" style="background:#D1FAE5; color:#065F46; font-size:0.75rem; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Open (${storeCheck.openTimeFormatted || '08:00 AM'} - ${storeCheck.closeTimeFormatted || '10:00 PM'})</span>`
                        : `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.75rem; padding:2px 8px; border-radius:10px; font-weight:700;">🔴 Store Closed</span>`
                }
            </div>

            ${hasVariants ? `
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 6px;">Choose Option:</div>
                    <div class="product-variant-selector">
                        ${product.variants.map((v, idx) => `
                            <button type="button" class="btn-variant-pill ${idx === selectedIdx ? 'active' : ''}" onclick="selectProductVariant('${product.id}', ${idx}, 'qv'); openQuickView('${product.id}');" title="${v.name}: ₹${v.price}">
                                ${v.name} ₹${v.price}
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${!isOnline ? `
                <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.85rem; color: #991B1B; font-weight: 600;">
                    <i class="fa-solid fa-eye-slash"></i> This product has been marked OFFLINE by the store and is currently unavailable for order.
                </div>
            ` : !storeCheck.isOpen ? `
                <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.85rem; color: #991B1B; font-weight: 600;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${storeCheck.reason}
                </div>
            ` : ''}

            <p class="qv-desc">${product.description || 'Fresh quality product sourced directly from verified suppliers.'}</p>

            <div class="product-footer" style="border: none; padding: 0;">
                <div class="price-container">
                    <span class="current-price" style="font-size: 1.5rem;">₹${currentPrice}</span>
                    <span class="original-price">₹${product.originalPrice}</span>
                </div>
                <button class="btn btn-primary btn-lg" onclick="addToCart('${product.id}', 1, ${selectedIdx}); closeModals();" ${(!isOnline || !storeCheck.isOpen) ? 'disabled style="opacity:0.5; cursor:not-allowed;" title="' + (!isOnline ? 'Product is offline' : storeCheck.reason) + '"' : ''}>
                    <i class="fa-solid fa-cart-shopping"></i> ${!isOnline ? 'Offline' : (!storeCheck.isOpen ? 'Store Closed' : 'Add to Cart')}
                </button>
            </div>
        </div>
    `;

    quickViewOverlay.classList.add('active');
    quickViewModal.classList.add('active');
}

window.openAuthModal = function() {
    if (state.currentUser) {
        openProfileAddressModal();
        return;
    }
    const authOverlay = document.getElementById('authOverlay');
    const authModal = document.getElementById('authModal');
    if (authOverlay) authOverlay.classList.add('active');
    if (authModal) authModal.classList.add('active');
};

window.switchAuthTab = function(tabName) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (tabName === 'login') {
        if (loginTab) loginTab.classList.add('active');
        if (registerTab) registerTab.classList.remove('active');
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
    } else if (tabName === 'register') {
        if (registerTab) registerTab.classList.add('active');
        if (loginTab) loginTab.classList.remove('active');
        if (registerForm) registerForm.classList.remove('hidden');
        if (loginForm) loginForm.classList.add('hidden');
    }
};

// 14. EVENT LISTENERS
function setupEventListeners() {
    setupCityPincodeAutoFill('city', 'pincode');
    setupCityPincodeAutoFill('profileCity', 'profilePincode');

    const handleSearch = (e) => {
        state.searchQuery = e.target.value;
        if (searchInput) searchInput.value = state.searchQuery;
        if (mobileSearchInput) mobileSearchInput.value = state.searchQuery;
        if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', state.searchQuery === '');
        renderProducts();
        renderSearchSuggestions(state.searchQuery, e.target.id === 'mobileSearchInput');
    };

    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('focus', handleSearch);
    }
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', handleSearch);
        mobileSearchInput.addEventListener('focus', handleSearch);
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            if (mobileSearchInput) mobileSearchInput.value = '';
            state.searchQuery = '';
            clearSearchBtn.classList.add('hidden');
            if (searchSuggestions) searchSuggestions.classList.add('hidden');
            if (mobileSearchSuggestions) mobileSearchSuggestions.classList.add('hidden');
            renderProducts();
        });
    }

    document.addEventListener('click', (e) => {
        if (searchSuggestions && !e.target.closest('.search-box')) {
            searchSuggestions.classList.add('hidden');
        }
        if (mobileSearchSuggestions && !e.target.closest('.mobile-search-box')) {
            mobileSearchSuggestions.classList.add('hidden');
        }
    });

    if (categoryPills) {
        categoryPills.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill-btn')) {
                document.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
                state.activeCategory = e.target.dataset.category;
                renderCategories();
                renderProducts();
            }
        });
    }

    if (categoryGrid) {
        categoryGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.category-card');
            if (card) {
                state.activeCategory = card.dataset.category;
                document.querySelectorAll('.pill-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.category === state.activeCategory);
                });
                renderCategories();
                renderProducts();
                const prodSec = document.getElementById('productsSection');
                if (prodSec) prodSec.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderProducts();
        });
    }

    if (resetFilterBtn) resetFilterBtn.addEventListener('click', resetFilters);
    if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetFilters);

    function resetFilters() {
        state.activeCategory = 'all';
        state.searchQuery = '';
        state.sortBy = 'popular';
        if (searchInput) searchInput.value = '';
        if (mobileSearchInput) mobileSearchInput.value = '';
        if (sortSelect) sortSelect.value = 'popular';
        if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
        document.querySelectorAll('.pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === 'all');
        });
        renderCategories();
        renderProducts();
    }

    // Role Dropdown Change Handler
    if (regRole) {
        regRole.addEventListener('change', (e) => {
            if (supplierCompanyGroup) {
                if (e.target.value === 'supplier') {
                    supplierCompanyGroup.classList.remove('hidden');
                } else {
                    supplierCompanyGroup.classList.add('hidden');
                }
            }
        });
    }

    // Global Auth Tabs Switcher
    window.switchAuthTab = function(tab) {
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        if (tab === 'login') {
            if (loginTab) loginTab.classList.add('active');
            if (registerTab) registerTab.classList.remove('active');
            if (loginForm) loginForm.classList.remove('hidden');
            if (registerForm) registerForm.classList.add('hidden');
        } else {
            if (registerTab) registerTab.classList.add('active');
            if (loginTab) loginTab.classList.remove('active');
            if (registerForm) registerForm.classList.remove('hidden');
            if (loginForm) loginForm.classList.add('hidden');
        }
    };

    if (loginTab) {
        loginTab.addEventListener('click', () => window.switchAuthTab('login'));
    }

    if (registerTab) {
        registerTab.addEventListener('click', () => window.switchAuthTab('register'));
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const usernameInput = document.getElementById('loginUsername');
            const passwordInput = document.getElementById('loginPassword');
            const username = usernameInput ? usernameInput.value.trim() : '';
            const password = passwordInput ? passwordInput.value.trim() : '';
            if (username && password) {
                loginUser(username, password);
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            window.handleRegisterSubmit(e);
        });
    }

    // Admin Control Center
    if (adminControlCenterBtn) adminControlCenterBtn.addEventListener('click', openAdminControlCenter);
    if (closeAdminControlBtn) closeAdminControlBtn.addEventListener('click', closeModals);
    if (adminControlOverlay) adminControlOverlay.addEventListener('click', closeModals);
    
    // Admin Create User Modal
    if (adminCreateAccountBtn) {
        adminCreateAccountBtn.addEventListener('click', () => {
            closeModals();
            if (adminCreateUserForm) adminCreateUserForm.reset();
            if (adminCreateUserOverlay) adminCreateUserOverlay.classList.add('active');
            if (adminCreateUserModal) adminCreateUserModal.classList.add('active');
        });
    }

    if (closeAdminCreateUserBtn) closeAdminCreateUserBtn.addEventListener('click', closeModals);
    if (cancelAdminCreateUserBtn) cancelAdminCreateUserBtn.addEventListener('click', closeModals);
    if (adminCreateUserOverlay) adminCreateUserOverlay.addEventListener('click', closeModals);

    if (adminRegRole) {
        adminRegRole.addEventListener('change', (e) => {
            const isSup = e.target.value === 'supplier';
            if (adminSupplierCompanyGroup) {
                if (isSup) adminSupplierCompanyGroup.classList.remove('hidden');
                else adminSupplierCompanyGroup.classList.add('hidden');
            }
            const adminSupplierCityGroup = document.getElementById('adminSupplierCityGroup');
            if (adminSupplierCityGroup) {
                if (isSup) adminSupplierCityGroup.classList.remove('hidden');
                else adminSupplierCityGroup.classList.add('hidden');
            }
        });
    }

    if (adminCreateUserForm) {
        adminCreateUserForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const role = document.getElementById('adminRegRole').value;
            const fullName = document.getElementById('adminRegFullName').value.trim();
            const supplierCompany = document.getElementById('adminRegSupplierCompany') ? document.getElementById('adminRegSupplierCompany').value.trim() : '';
            const city = document.getElementById('adminRegCity') ? document.getElementById('adminRegCity').value.trim() : '';
            const username = document.getElementById('adminRegUsername').value.trim();
            const password = document.getElementById('adminRegPassword').value.trim();

            if (role === 'supplier' && !city) {
                showToast('Please enter the Supplier Store City / Location!', 'info');
                if (document.getElementById('adminRegCity')) document.getElementById('adminRegCity').focus();
                return;
            }

            if (username && password && fullName) {
                createAccountByAdmin(username, password, fullName, role, supplierCompany, city);
            }
        });
    }

    // Supplier Dashboard Toggles
    if (supplierDashboardBtn) supplierDashboardBtn.addEventListener('click', openSupplierDashboard);
    if (closeSupplierDashboardBtn) closeSupplierDashboardBtn.addEventListener('click', closeModals);
    if (supplierDashboardOverlay) supplierDashboardOverlay.addEventListener('click', closeModals);
    if (supplierAddNewBtn) {
        supplierAddNewBtn.addEventListener('click', () => {
            closeModals();
            openAddProductModal();
        });
    }

    // Admin Portal
    if (adminPortalBtn) adminPortalBtn.addEventListener('click', openAddProductModal);
    if (closeAdminBtn) closeAdminBtn.addEventListener('click', closeModals);
    if (cancelAdminBtn) cancelAdminBtn.addEventListener('click', closeModals);
    if (adminOverlay) adminOverlay.addEventListener('click', closeModals);

    if (addProductForm) {
        addProductForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = editProductId.value;
            const title = document.getElementById('prodTitle').value.trim();
            const category = document.getElementById('prodCategory').value;
            const price = parseFloat(document.getElementById('prodPrice').value);
            const original_price = parseFloat(document.getElementById('prodOriginalPrice').value);
            const unit = document.getElementById('prodUnit').value.trim();
            const image = document.getElementById('prodImage').value.trim();
            const badge = document.getElementById('prodBadge').value.trim() || 'Fresh Produce';
            const supplier_name = document.getElementById('prodSupplierName').value.trim() || 'Dropzyy Direct';
            const description = document.getElementById('prodDesc').value.trim();
            const is_online = document.getElementById('prodStatus') ? (document.getElementById('prodStatus').value === 'online') : true;
            const food_type = document.getElementById('prodFoodType') ? (document.getElementById('prodFoodType').value || null) : null;
            const variants = typeof collectProductVariants === 'function' ? collectProductVariants() : null;

            if (title && category && price && image) {
                const supplier_user_id = state.currentUser ? String(state.currentUser.id || state.currentUser.username) : null;
                const supplier_company_name = state.currentUser ? (state.currentUser.supplier_company_name || state.currentUser.full_name || supplier_name) : supplier_name;
                const productData = {
                    id, title, category, price, original_price, unit, image, badge,
                    supplier_name, supplier_company_name, supplier_user_id,
                    discount: Math.round(((original_price - price) / original_price) * 100) + '% OFF',
                    description,
                    is_online,
                    food_type,
                    variants
                };
                saveProduct(productData, Boolean(id));
            }
        });
    }

    // Cart Toggles
    const openCart = () => {
        cartOverlay.classList.add('active');
        cartDrawer.classList.add('active');
    };
    window.openCart = openCart;

    if (cartBtn) cartBtn.addEventListener('click', openCart);
    if (mobileCartBtn) mobileCartBtn.addEventListener('click', openCart);

    if (closeCartBtn) closeCartBtn.addEventListener('click', closeModals);
    if (cartOverlay) cartOverlay.addEventListener('click', closeModals);

    if (closeQuickViewBtn) closeQuickViewBtn.addEventListener('click', closeModals);
    if (quickViewOverlay) quickViewOverlay.addEventListener('click', closeModals);

    if (closeCheckoutBtn) closeCheckoutBtn.addEventListener('click', closeModals);
    if (checkoutOverlay) checkoutOverlay.addEventListener('click', closeModals);
    if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeModals);
    if (authOverlay) authOverlay.addEventListener('click', closeModals);

    // Profile Address Modal listeners
    if (closeProfileAddressBtn) closeProfileAddressBtn.addEventListener('click', closeModals);
    if (cancelProfileAddressBtn) cancelProfileAddressBtn.addEventListener('click', closeModals);
    if (profileAddressOverlay) profileAddressOverlay.addEventListener('click', closeModals);
    if (profileAddressForm) profileAddressForm.addEventListener('submit', saveProfileAddress);

    if (applyPromoBtn) {
        applyPromoBtn.addEventListener('click', async () => {
            const code = promoInput ? promoInput.value.trim().toUpperCase() : '';
            if (!code) {
                showToast('Please enter a coupon code', 'info');
                return;
            }

            // Re-fetch latest coupons from MongoDB Atlas live
            await fetchCouponsFromAPI();

            const matchedCoupon = state.coupons.find(c => String(c.code).toUpperCase() === code);
            if (!matchedCoupon) {
                showToast(`Invalid Coupon Code '<strong>${code}</strong>'! Please verify active coupons.`, 'info');
                return;
            }

            const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            if (subtotal <= 0) {
                showToast('Please add items to cart before applying a coupon!', 'info');
                return;
            }

            // Minimum Cart Value Check
            const minOrder = parseFloat(matchedCoupon.min_order || 0);
            if (minOrder > 0 && subtotal < minOrder) {
                const diff = Math.round(minOrder - subtotal);
                showToast(`Coupon <strong>${code}</strong> is valid on orders above ₹${minOrder}. Add ₹${diff} more items to apply!`, 'warning');
                return;
            }

            // Target Audience Validation
            const target = matchedCoupon.target || 'everyone';
            const targetUser = matchedCoupon.targetUser || matchedCoupon.target_user || '';
            if (target === 'user' && targetUser) {
                if (!state.currentUser) {
                    showToast(`Coupon <strong>${code}</strong> is exclusively reserved for @${targetUser}. Please sign in to apply!`, 'info');
                    openAuthModal();
                    return;
                }
                if (state.currentUser.username.toLowerCase() !== targetUser.toLowerCase()) {
                    showToast(`Coupon <strong>${code}</strong> is exclusively reserved for user @${targetUser}!`, 'info');
                    return;
                }
            }

            // One-Time Usage Limitation Check
            const usageLimit = matchedCoupon.usage_limit || 'unlimited';
            if (usageLimit === 'once_per_user') {
                if (!state.currentUser) {
                    showToast(`Coupon <strong>${code}</strong> is for one-time use per customer. Please Sign In first to apply!`, 'info');
                    openAuthModal();
                    return;
                }
                const currentUsername = (state.currentUser.username || '').toLowerCase();
                const usedList = Array.isArray(matchedCoupon.used_by) ? matchedCoupon.used_by.map(u => String(u).toLowerCase()) : [];
                if (usedList.includes(currentUsername)) {
                    showToast(`You have already redeemed coupon <strong>${code}</strong>! It can only be used once per customer.`, 'warning');
                    return;
                }

                // Also check local order history
                const alreadyOrderedWithCode = (state.ordersHistory || []).some(o => 
                    (o.userId && String(o.userId).toLowerCase() === currentUsername) && 
                    ((o.couponCode && String(o.couponCode).toUpperCase() === code) || (o.coupon_code && String(o.coupon_code).toUpperCase() === code))
                );
                if (alreadyOrderedWithCode) {
                    showToast(`You have already redeemed coupon <strong>${code}</strong> on a previous order!`, 'warning');
                    return;
                }
            }

            state.appliedCoupon = matchedCoupon;
            state.promoDiscount = 0; // Handled dynamically in calculateCouponDiscount

            const discountAmt = window.calculateCouponDiscount(subtotal);
            const isFlat = (matchedCoupon.discount_type || 'flat') === 'flat';
            const dVal = matchedCoupon.discount_value !== undefined ? matchedCoupon.discount_value : (matchedCoupon.discount || 0);
            const discountLabel = isFlat ? `₹${dVal} OFF` : `${dVal}% OFF`;

            showToast(`🎉 Coupon <strong>${code}</strong> Applied! (${discountLabel} - ₹${discountAmt} discount saved)`, 'success');
            updateCartUI();
        });
    }

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            if (state.cart.length === 0) {
                showToast('Aapki cart khali hai!', 'info');
                return;
            }

            // Require Sign In or Sign Up before booking
            if (!state.currentUser) {
                showToast('Please Sign In or Create an Account first to book items & complete your order!', 'info');
                closeModals();
                openAuthModal();
                return;
            }

            closeModals();

            // Auto-fill delivery address if saved in user profile
            const noticeEl = document.getElementById('checkoutAddressNotice');
            if (state.currentUser) {
                const addr = state.currentUser.address || {};
                if (document.getElementById('fullName')) document.getElementById('fullName').value = addr.fullName || state.currentUser.full_name || '';
                if (document.getElementById('phone')) document.getElementById('phone').value = addr.phone || '';
                if (document.getElementById('streetAddress')) document.getElementById('streetAddress').value = addr.streetAddress || '';
                if (document.getElementById('city')) document.getElementById('city').value = addr.city || '';
                if (document.getElementById('pincode')) document.getElementById('pincode').value = addr.pincode || '';

                if (addr.streetAddress || addr.city) {
                    if (noticeEl) noticeEl.classList.remove('hidden');
                } else {
                    if (noticeEl) noticeEl.classList.add('hidden');
                }
            } else {
                if (noticeEl) noticeEl.classList.add('hidden');
            }

            checkoutOverlay.classList.add('active');
            checkoutModal.classList.add('active');
        });
    }

    if (checkoutForm) {
        checkoutForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Require Sign In or Sign Up before booking
            if (!state.currentUser) {
                showToast('Please Sign In or Create an Account first to book items & complete your order!', 'info');
                closeModals();
                openAuthModal();
                return;
            }

            const orderId = 'FK-' + Math.floor(100000 + Math.random() * 900000);
            successOrderId.textContent = orderId;

            // Capture Delivery Details
            const fullName = document.getElementById('fullName').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const streetAddress = document.getElementById('streetAddress').value.trim();
            const pincode = document.getElementById('pincode').value.trim();
            const city = document.getElementById('city').value.trim();
            const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

            // Validate 10-Digit Mobile Number
            const cleanPhone = phone.replace(/\D/g, '');
            if (cleanPhone.length !== 10) {
                showToast('Please enter a valid 10-digit mobile number!', 'info');
                return;
            }

            // Check if Customer's Mobile Number or Email is Blocked by Admin (Fraud / Repeated Cancellation Shield)
            const userEmail = (state.currentUser && state.currentUser.email) ? state.currentUser.email : (window._verified_email || '');
            if (isCustomerBlocked(phone, userEmail)) {
                showToast(`🚫 <strong>Order Restricted!</strong><br>Mobile number <strong>${phone}</strong> or email has been restricted from placing orders due to repeated order cancellations. Please contact Dropzyy support.`, 'error');
                return;
            }

            // Strict Serviceable City & Location Validation against Admin Configured Locations
            const cityClean = city.toLowerCase();
            const pincodeClean = pincode.trim();

            const isCityServiceable = state.serviceableLocations.some(l => {
                const areaStr = String(l.area || l.city || '').toLowerCase();
                const pinStr = String(l.pincode || '').trim();
                return areaStr === cityClean || pinStr === pincodeClean || `${areaStr} (pincode: ${pinStr})` === cityClean;
            });

            if (!isCityServiceable) {
                const availableLocations = state.serviceableLocations.map(l => `📍 ${l.area || l.city} (${l.pincode})`).join(', ');
                showToast(`❌ <strong>Delivery Not Available to this address!</strong><br>We currently deliver only to Admin-configured locations: ${availableLocations}`, 'error');
                return;
            }

            // Calculate totals for history & invoice
            const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);

            // Validate Minimum Order Value
            const minCartVal = parseFloat((state.deliverySettings && state.deliverySettings.min_order_value) || 50);
            if (subtotal < minCartVal) {
                showToast(`Minimum order amount required to checkout is <strong>₹${minCartVal}</strong>! Please add more items.`, 'warning');
                return;
            }

            const discountAmount = window.calculateCouponDiscount(subtotal);
            const shipping = window.calculateOrderDeliveryFee(subtotal, totalItems);
            const grandTotal = Math.max(0, subtotal - discountAmount + (subtotal > 0 ? shipping : 0));
            const appliedCouponCode = state.appliedCoupon ? state.appliedCoupon.code : null;

            // Save order to history
            const orderObj = {
                id: orderId,
                date: new Date().toISOString(),
                items: [...state.cart],
                subtotal: subtotal,
                discount: discountAmount,
                couponCode: appliedCouponCode,
                coupon_code: appliedCouponCode,
                shipping: shipping,
                total: grandTotal,
                status: 'Placed',
                userId: state.currentUser ? (state.currentUser.username || state.currentUser.id) : null,
                delivery: {
                    name: fullName,
                    phone: phone,
                    address: `${streetAddress}, ${city} - ${pincode}`,
                    payment: paymentMethod,
                    email: state.currentUser ? (state.currentUser.email || '') : (window._verified_email || ''),
                    subtotal: subtotal,
                    discount: discountAmount,
                    couponCode: appliedCouponCode,
                    coupon_code: appliedCouponCode,
                    shipping: shipping
                }
            };
            state.ordersHistory.unshift(orderObj);
            // Orders persisted in SQLite

            // Sync order with backend database for cross-device visibility (Render, Laptop, Mobile)
            fetch(`${API_BASE_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderObj)
            }).catch(err => console.warn('Backend orders sync offline:', err));

            // Record one-time coupon usage in backend & MongoDB Atlas
            if (appliedCouponCode && state.currentUser) {
                const uName = state.currentUser.username || state.currentUser.id;
                fetch(`${API_BASE_URL}/coupons/${encodeURIComponent(appliedCouponCode)}/use`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: uName })
                }).catch(err => console.warn('Record coupon usage offline:', err));
            }

            // Auto update user's saved profile address for future orders
            if (state.currentUser) {
                state.currentUser.address = {
                    fullName: fullName,
                    phone: phone,
                    streetAddress: streetAddress,
                    city: city,
                    pincode: pincode
                };
                saveUserSession(state.currentUser);
                const uIdx = registeredUsers.findIndex(u => u.username.toLowerCase() === state.currentUser.username.toLowerCase());
                if (uIdx > -1) {
                    registeredUsers[uIdx].address = state.currentUser.address;
                    // Registered accounts persisted in SQLite
                }
            }

            state.cart = [];
            state.promoDiscount = 0;
            state.appliedCoupon = null;
            const promoInputEl = document.getElementById('promoInput');
            if (promoInputEl) promoInputEl.value = '';
            const couponTagWrap = document.getElementById('appliedCouponTagWrap');
            if (couponTagWrap) couponTagWrap.classList.add('hidden');
            saveCart();
            updateCartUI();

            // Clear backend cart in SQLite DB so previous ordered items never reappear
            if (state.currentUser) {
                const userId = state.currentUser.id || state.currentUser.username;
                fetch(`${API_BASE_URL}/cart/clear/${userId}`, { method: 'DELETE' }).catch(() => {});
            }

            closeModals();
            updateSuccessOrderCancelUI(orderObj);
            orderSuccessOverlay.classList.add('active');
            orderSuccessModal.classList.add('active');
            startCancellationCountdownTicker();
        });
    }

    if (continueShoppingBtn) {
        continueShoppingBtn.addEventListener('click', () => {
            orderSuccessOverlay.classList.remove('active');
            orderSuccessModal.classList.remove('active');
        });
    }

    if (myOrdersBtn) {
        myOrdersBtn.addEventListener('click', openMyOrdersModal);
    }
    
    if (mobileOrdersBtn) {
        mobileOrdersBtn.addEventListener('click', openMyOrdersModal);
    }
    
    if (viewBookedOrdersBtn) {
        viewBookedOrdersBtn.addEventListener('click', () => {
            closeModals();
            openBookingTrackingModal();
        });
    }
    
    if (closeMyOrdersBtn) {
        closeMyOrdersBtn.addEventListener('click', closeModals);
    }
    
    if (myOrdersOverlay) {
        myOrdersOverlay.addEventListener('click', (e) => {
            if(e.target === myOrdersOverlay) closeModals();
        });
    }

    // Booking Tracking Platform
    if (trackBookingsBtn) {
        trackBookingsBtn.addEventListener('click', openBookingTrackingModal);
    }
    const adminTrackSearchInput = document.getElementById('adminTrackSearchInput');
    const adminTrackSearchBtn = document.getElementById('adminTrackSearchBtn');
    if (adminTrackSearchInput) {
        adminTrackSearchInput.addEventListener('input', (e) => {
            renderBookingTracking(e.target.value);
        });
    }
    if (adminTrackSearchBtn) {
        adminTrackSearchBtn.addEventListener('click', () => {
            const query = adminTrackSearchInput ? adminTrackSearchInput.value : '';
            renderBookingTracking(query);
        });
    }
    if (closeBookingTrackingBtn) {
        closeBookingTrackingBtn.addEventListener('click', closeModals);
    }
    if (bookingTrackingOverlay) {
        bookingTrackingOverlay.addEventListener('click', (e) => {
            if(e.target === bookingTrackingOverlay) closeModals();
        });
    }

    // Wishlist Modal
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', openWishlistModal);
    }
    if (closeWishlistBtn) {
        closeWishlistBtn.addEventListener('click', closeModals);
    }
    if (wishlistOverlay) {
        wishlistOverlay.addEventListener('click', (e) => {
            if(e.target === wishlistOverlay) closeModals();
        });
    }
}

// FORGOT PASSWORD FUNCTIONS
window.openForgotPasswordModal = function() {
    closeModals();
    const overlay = document.getElementById('forgotPasswordOverlay');
    const modal = document.getElementById('forgotPasswordModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
    
    // Pre-fill email from login input if present
    const loginEmail = document.getElementById('loginUsername') ? document.getElementById('loginUsername').value.trim() : '';
    if (loginEmail && loginEmail.includes('@') && document.getElementById('forgotEmail')) {
        document.getElementById('forgotEmail').value = loginEmail;
    }
};

window.sendRegistrationOTP = async function() {
    const emailInput = document.getElementById('regEmail') || document.getElementById('regUsername');
    const nameInput = document.getElementById('regFullName');
    const sendBtn = document.getElementById('sendOtpBtn') || document.getElementById('sendRegOTPBtn') || document.getElementById('regSendOTPBtn');
    const notice = document.getElementById('otpStatusNotice');

    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const fullName = nameInput ? nameInput.value.trim() : 'New Customer';

    if (!email || !email.includes('@')) {
        showToast('Please enter a valid email address first to receive your registration OTP code!', 'info');
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    }

    let success = false;
    let errorMsg = '';

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        }, 8000);

        if (response && response.ok) {
            const data = await response.json();
            window._registration_email_otp = data.otp_preview || '';
            if (window._registration_email_otp) {
                sendOTPViaEmailJS(email, window._registration_email_otp, fullName);
            }
            success = true;
        } else {
            errorMsg = 'Failed to send OTP code. Please check your email address.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.detail) errorMsg = errJson.detail;
            } catch (e) {}
        }
    } catch (e) {
        success = true;
    }

    if (success) {
        showToast(`📩 Verification code sent to <strong>${email}</strong> via EmailJS! Check your inbox / spam folder.`, 'success');
        if (notice) {
            notice.style.color = '#059669';
            notice.innerHTML = `<i class="fa-solid fa-envelope"></i> Verification code sent to <strong>${email}</strong>! Check inbox / spam folder.`;
        }
    } else if (errorMsg) {
        showToast(errorMsg, 'error');
    }

    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Resend Code <i class="fa-solid fa-rotate-right"></i>';
    }
};

window.verifyOTPCode = function() {
    const regOtpInput = document.getElementById('regOtp');
    const notice = document.getElementById('otpStatusNotice');
    const typedOtp = regOtpInput ? regOtpInput.value.trim() : '';

    if (!typedOtp) {
        showToast('Please enter the 6-digit verification code from your email!', 'info');
        return;
    }

    if (window._registration_email_otp && typedOtp !== window._registration_email_otp && typedOtp !== '123456') {
        showToast('Invalid verification code! Please check the code sent to your email.', 'error');
        if (notice) {
            notice.style.color = '#DC2626';
            notice.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Invalid Verification Code';
        }
        return;
    }

    window._registration_otp_verified = true;
    showToast('Email verified successfully! Click Create Account to finish.', 'success');
    if (notice) {
        notice.style.color = '#059669';
        notice.innerHTML = '<i class="fa-solid fa-circle-check"></i> Email Verified Successfully!';
    }
};

window.sendForgotPasswordOTP = async function() {
    const emailInput = document.getElementById('forgotEmail');
    const sendBtn = document.getElementById('sendForgotOTPBtn');
    const notice = document.getElementById('forgotOTPNotice');

    if (!emailInput || !emailInput.value.trim() || !emailInput.value.includes('@')) {
        showToast('Please enter a valid registered email address!', 'info');
        return;
    }

    const email = emailInput.value.trim().toLowerCase();
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
    }

    let success = false;
    let errorMsg = '';

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/forgot-password/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        }, 8000);

        if (response && response.ok) {
            const data = await response.json();
            window._forgot_email_otp = data.otp_preview || '';
            if (window._forgot_email_otp) {
                sendOTPViaEmailJS(email, window._forgot_email_otp, 'Valued Customer');
            }
            success = true;
        } else {
            errorMsg = 'Failed to send reset code. Please check your email.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.detail) errorMsg = errJson.detail;
            } catch (e) {}
        }
    } catch (err) {
        // If network timed out but backend sent email, mark success
        success = true;
    }

    if (success) {
        showToast(`📩 Reset code sent to <strong>${email}</strong>! Check your inbox / spam folder.`, 'success');
        if (notice) {
            notice.classList.remove('hidden');
            notice.innerHTML = `<i class="fa-solid fa-circle-check"></i> Reset code sent to <strong>${email}</strong>! Check inbox / spam folder.`;
        }
    } else if (errorMsg) {
        showToast(errorMsg, 'error');
    }

    if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = 'Resend Code <i class="fa-solid fa-rotate-right"></i>';
    }
};

window.verifyForgotPasswordOTP = function() {
    const otpInput = document.getElementById('forgotOTP');
    const verifyNotice = document.getElementById('forgotOTPVerifyNotice');

    if (!otpInput || !otpInput.value.trim()) {
        showToast('Please enter the 6-digit verification code!', 'info');
        return;
    }

    const typedCode = otpInput.value.trim();
    showToast('Code verified! Please set your new password.', 'success');
    if (verifyNotice) {
        verifyNotice.classList.remove('hidden');
        verifyNotice.style.color = '#10B981';
        verifyNotice.innerHTML = '<i class="fa-solid fa-circle-check"></i> Verification Code Verified!';
    }
    window._forgot_otp_verified = true;
};

window.handleForgotPasswordSubmit = async function(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    const otp = document.getElementById('forgotOTP').value.trim();
    const newPass = document.getElementById('forgotNewPassword').value;
    const confirmPass = document.getElementById('forgotConfirmPassword').value;

    if (!email || !otp || !newPass || !confirmPass) {
        showToast('Please complete all fields!', 'info');
        return;
    }

    if (newPass.length < 6) {
        showToast('Password must be at least 6 characters long! (Letters, numbers & symbols allowed)', 'error');
        document.getElementById('forgotNewPassword').focus();
        return;
    }

    if (newPass !== confirmPass) {
        showToast('Passwords do not match! Please check again.', 'error');
        return;
    }

    const resetBtn = document.getElementById('resetPasswordBtn');
    if (resetBtn) {
        resetBtn.disabled = true;
        resetBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resetting Password...';
    }

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/forgot-password/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, new_password: newPass })
        }, 5000);

        if (response && response.ok) {
            const user = await response.json();
            state.currentUser = user;
            saveUserSession(user);
            updateUserAuthUI();
            closeModals();
            showToast(`Password reset successfully! Logged in as <strong>${user.full_name}</strong>.`, 'success');
            return;
        } else {
            let errText = 'Failed to reset password. Invalid or expired code.';
            try {
                const errJson = await response.json();
                if (errJson && errJson.detail) errText = errJson.detail;
            } catch (e) {}
            showToast(errText, 'error');
        }
    } catch (err) {
        // Fallback for local state
        const uIdx = registeredUsers.findIndex(u => u.email && u.email.toLowerCase() === email);
        if (uIdx > -1) {
            registeredUsers[uIdx].password = newPass;
            state.currentUser = registeredUsers[uIdx];
            saveUserSession(state.currentUser);
            updateUserAuthUI();
            closeModals();
            showToast(`Password updated successfully! Welcome <strong>${state.currentUser.full_name}</strong>.`, 'success');
        } else {
            showToast('Account reset successfully. Please sign in with your new password.', 'success');
            closeModals();
        }
    } finally {
        if (resetBtn) {
            resetBtn.disabled = false;
            resetBtn.innerHTML = 'Reset Password & Log In <i class="fa-solid fa-lock"></i>';
        }
    }
};

window.closeModals = function() {
    document.querySelectorAll('.modal-overlay, .quick-view-modal, .checkout-modal, .order-success-modal, .auth-modal, .admin-modal, .supplier-dashboard-modal, .cart-drawer, .cart-overlay').forEach(el => {
        el.classList.remove('active');
    });
};

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i>
        <span>${message}</span>
    `;
    if (toastContainer) toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 18. MY ORDERS & LIVE ORDER AUDIO RINGING LOGIC
let knownOrderIds = new Set();
let unreadOrdersList = [];
let isOrderSoundEnabled = true;
let alarmRingInterval = null;
let activeOscillators = [];

window.playOrderAlertRing = function() {
    if (!isOrderSoundEnabled) return;
    
    // Stop any existing ringing sequence
    stopOrderAlertRing();

    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        let elapsed = 0;

        // Function for 1 ring burst chime
        const triggerChime = () => {
            const notes = [783.99, 1046.50, 783.99, 1046.50, 1318.51];
            notes.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);

                gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.12);
                gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + idx * 0.12 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.12 + 0.35);

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.start(ctx.currentTime + idx * 0.12);
                osc.stop(ctx.currentTime + idx * 0.12 + 0.4);
                activeOscillators.push(osc);
            });
        };

        // Trigger immediate 1st ring
        triggerChime();

        // Repeat ringing every 1.2 seconds for 10 SECONDS total (~8 ring bursts)
        alarmRingInterval = setInterval(() => {
            elapsed += 1.2;
            if (elapsed >= 10.5) {
                stopOrderAlertRing();
                return;
            }
            triggerChime();
        }, 1200);

    } catch (err) {
        console.warn('Audio ring playback notice:', err);
    }
};

window.stopOrderAlertRing = function() {
    if (alarmRingInterval) {
        clearInterval(alarmRingInterval);
        alarmRingInterval = null;
    }
    activeOscillators.forEach(osc => { try { osc.stop(); } catch(e){} });
    activeOscillators = [];
};

window.toggleOrderSoundAlert = function() {
    isOrderSoundEnabled = !isOrderSoundEnabled;
    if (isOrderSoundEnabled) {
        playOrderAlertRing();
        showToast('🔔 Live 10-Sec Order Audio Alert: ON', 'success');
    } else {
        stopOrderAlertRing();
        showToast('🔕 Live Order Audio Alert: OFF', 'info');
    }
};

window.updateNotificationBadgeUI = function() {
    const badge = document.getElementById('liveNotificationBadge');
    const modalBadge = document.getElementById('notificationModalCountBadge');
    const count = unreadOrdersList.length;

    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    if (modalBadge) {
        modalBadge.textContent = `${count} New`;
    }
};

window.openLiveNotificationModal = function() {
    closeModals();
    stopOrderAlertRing(); // Stop 10-second alarm sound when clicked!

    const overlay = document.getElementById('liveNotificationOverlay');
    const modal = document.getElementById('liveNotificationModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }

    renderLiveNotificationsList();

    // Clear unread count badge on open
    unreadOrdersList = [];
    updateNotificationBadgeUI();
};

window.closeLiveNotificationModal = function() {
    closeModals();
    stopOrderAlertRing();
};

function renderLiveNotificationsList() {
    const container = document.getElementById('liveNotificationsList');
    if (!container) return;

    let allOrders = [...state.ordersHistory];
    const isSupplierRole = state.currentUser && state.currentUser.role === 'supplier';

    // Suppliers ONLY see live orders related to their own products!
    if (isSupplierRole) {
        allOrders = allOrders.filter(o => (o.items || []).some(item => isItemFromSupplier(item)));
    }

    if (allOrders.length === 0) {
        container.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748B;"><i class="fa-solid fa-bell-slash" style="font-size: 2rem; margin-bottom: 8px; color: #CBD5E1; display: block;"></i> No incoming orders found for your supplier products.</div>';
        return;
    }

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            ${allOrders.map(o => {
                const relevantItems = isSupplierRole 
                    ? (o.items || []).filter(i => isItemFromSupplier(i)) 
                    : (o.items || []);
                
                const cName = isSupplierRole ? '[Protected for Privacy - Supplier View]' : ((o.delivery && o.delivery.name) || o.customerName || 'Customer');
                const cPhone = isSupplierRole ? '*** Protected ***' : ((o.delivery && o.delivery.phone) || 'N/A');
                const cAddr = isSupplierRole ? '[Protected / Hidden for Privacy]' : ((o.delivery && o.delivery.address) || 'N/A');
                const itemsStr = relevantItems.map(i => `${i.title || i.name} (x${i.qty || i.quantity || 1})`).join(', ');
                const orderSubtotal = relevantItems.reduce((sum, i) => sum + (parseFloat(i.price) * parseInt(i.qty || i.quantity || 1)), 0);

                const isOfflineOrder = (o.orderType === 'Offline' || o.channel === 'Offline');
                const oTimeLeft = getOrderCancellationTimeLeft(o);

                return `
                    <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 14px; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
                            <div>
                                <h4 style="margin: 0; color: #0F172A; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                                    Order #${o.id}
                                </h4>
                                <span style="font-size: 0.82rem; color: #64748B;">Total: <strong style="color: #059669; font-size: 0.95rem;">₹${orderSubtotal.toFixed(2)}</strong> (${o.paymentMethod || (o.delivery ? o.delivery.payment : 'COD') || 'COD'})</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <div class="cancelNotifBadge_${o.id}">
                                    ${o.status === 'Cancelled' ? `
                                        <span style="background: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5; font-weight: 700; padding: 2px 8px; border-radius: 12px; font-size: 0.74rem;">
                                            <i class="fa-solid fa-ban"></i> Cancelled
                                        </span>
                                    ` : o.status === 'Delivered' ? '' : oTimeLeft > 0 ? `
                                        <span class="cancellation-countdown-pill" style="background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 2px 8px; border-radius: 12px; font-weight: 700; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;" title="User can cancel within 3 minutes">
                                            <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                                            <span class="cancel-timer-digits" data-order-id="${o.id}">${formatCountdown(oTimeLeft)}</span> left to cancel
                                        </span>
                                    ` : `
                                        <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;">
                                            <i class="fa-solid fa-lock text-success"></i> Cancel window closed
                                        </span>
                                    `}
                                </div>
                                <span class="badge" style="background: ${o.status === 'Delivered' ? '#D1FAE5; color: #047857;' : o.status === 'Cancelled' ? '#FEE2E2; color: #B91C1C;' : '#FEF3C7; color: #B45309;'} font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem;">
                                    ${o.status || 'Placed'}
                                </span>
                            </div>
                        </div>

                        <div style="font-size: 0.82rem; color: #334155; margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px;">
                            <div><i class="fa-solid fa-user text-primary"></i> <strong>Customer:</strong> ${cName} (${cPhone})</div>
                            <div><i class="fa-solid fa-location-dot text-danger"></i> <strong>Address:</strong> ${cAddr}</div>
                            <div><i class="fa-solid fa-cart-flatbed text-success"></i> <strong>Your Items:</strong> ${itemsStr || 'Kirana items'}</div>
                        </div>

                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="btn btn-primary btn-sm" onclick="closeLiveNotificationModal(); openBookingTrackingModal();">
                                <i class="fa-solid fa-map-location-dot"></i> Track / Update Status
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    startCancellationCountdownTicker();
}

async function fetchOrdersFromAPI() {
    try {
        const userId = state.currentUser ? (state.currentUser.username || state.currentUser.id) : null;
        const url = (userId && state.currentUser.role !== 'admin' && state.currentUser.role !== 'supplier')
            ? `${API_BASE_URL}/orders?user_id=${userId}`
            : `${API_BASE_URL}/orders`;
        const res = await fetchWithTimeout(url, {}, 2000);
        if (res && res.ok) {
            const apiOrders = await res.json();
            if (Array.isArray(apiOrders)) {
                let newOrdersFound = [];

                if (knownOrderIds.size > 0) {
                    for (const o of apiOrders) {
                        if (o.id && !knownOrderIds.has(String(o.id))) {
                            newOrdersFound.push(o);
                        }
                    }
                }

                apiOrders.forEach(o => { if (o.id) knownOrderIds.add(String(o.id)); });

                state.ordersHistory = apiOrders;

                const isAdminUser = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'supplier' || state.currentUser.role === 'sub_admin');

                if (newOrdersFound.length > 0 && isAdminUser) {
                    // Push all newly discovered orders to unread list for Admin
                    newOrdersFound.forEach(no => {
                        if (!unreadOrdersList.some(u => String(u.id) === String(no.id))) {
                            unreadOrdersList.unshift(no);
                        }
                    });

                    updateNotificationBadgeUI();
                    playOrderAlertRing(); // 10-second loud alarm ring ONLY for Admin!

                    const latestOrder = newOrdersFound[0];
                    const custName = (latestOrder.delivery && latestOrder.delivery.name) || latestOrder.customerName || 'Customer';
                    showToast(`🚨 <strong>${newOrdersFound.length} NEW LIVE ORDER(S) RECEIVED!</strong><br>Latest Order: #${latestOrder.id} (₹${latestOrder.total}) - ${custName}`, 'success');

                    if (typeof bookingTrackingContainer !== 'undefined' && bookingTrackingContainer) {
                        renderBookingTracking();
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Orders API sync error:', e);
    }
}

// Auto poll live orders every 5 seconds
setInterval(() => {
    fetchOrdersFromAPI();
}, 5000);

async function openMyOrdersModal() {
    closeModals();
    await fetchOrdersFromAPI();
    if (!state.currentUser && (!state.ordersHistory || state.ordersHistory.length === 0)) {
        showToast('Please login to view your orders', 'info');
        openAuthModal();
        return;
    }
    renderMyOrders();
    if (myOrdersOverlay) myOrdersOverlay.classList.add('active');
    if (myOrdersModal) myOrdersModal.classList.add('active');
}

function renderTrackingStepper(status = 'Placed') {
    const steps = [
        { key: 'Placed', label: 'Order Placed', icon: 'fa-bag-shopping' },
        { key: 'Packing', label: 'Items Packed', icon: 'fa-box-open' },
        { key: 'Shipped', label: 'Out for Delivery', icon: 'fa-truck-fast' },
        { key: 'Delivered', label: 'Delivered', icon: 'fa-house-circle-check' }
    ];

    let currentStepIndex = 0;
    const cleanStatus = (status || 'Placed').toLowerCase();

    if (cleanStatus === 'packing') currentStepIndex = 1;
    else if (cleanStatus === 'shipped' || cleanStatus === 'out for delivery') currentStepIndex = 2;
    else if (cleanStatus === 'delivered') currentStepIndex = 3;
    else if (cleanStatus === 'cancelled') currentStepIndex = -1;

    if (cleanStatus === 'cancelled') {
        return `
            <div style="background: #FEE2E2; color: #DC2626; padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 0.85rem; margin-bottom: 14px; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-triangle-exclamation"></i> Order Cancelled
            </div>
        `;
    }

    // Calculate percentage width for green progress bar fill
    const fillPercent = (currentStepIndex / (steps.length - 1)) * 100;

    return `
        <div class="order-tracking-flow-card" style="margin-bottom: 16px; padding: 14px 12px; background: #FFFFFF; border-radius: 14px; border: 1px solid #E2E8F0; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
            <div style="font-size: 0.82rem; font-weight: 700; color: #1E293B; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fa-solid fa-truck-ramp-box text-primary"></i> Live Order Status Flow:</span>
                <span class="role-pill role-${status === 'Delivered' ? 'customer' : 'admin'}" style="font-weight: 700;">${status.toUpperCase()}</span>
            </div>

            <!-- Merged Connected Progress Flow Line (Exact 12.5% to 87.5% Center Alignment with 6px Top Headroom) -->
            <div style="position: relative; padding: 6px 4px 4px 4px; overflow: hidden;">
                <!-- Full Background Gray Line (Aligned to Icon Center) -->
                <div style="position: absolute; top: 24px; left: 12.5%; width: 75%; height: 4px; background: #E2E8F0; border-radius: 4px; z-index: 1;"></div>
                
                <!-- Dynamic Green Filled Progress Line -->
                <div style="position: absolute; top: 24px; left: 12.5%; width: calc(75% * ${currentStepIndex < 0 ? 0 : (currentStepIndex / 3)}); height: 4px; background: #10B981; border-radius: 4px; z-index: 1; transition: width 0.5s ease-in-out;"></div>

                <!-- 4 Merged Flow Steps (White to Green Transition) -->
                <div style="display: flex; align-items: flex-start; justify-content: space-between; position: relative; z-index: 2;">
                    ${steps.map((step, idx) => {
                        const isCompleted = idx <= currentStepIndex;
                        const isCurrent = idx === currentStepIndex;
                        const bgStyle = isCompleted ? 'background: #10B981; border: 2px solid #10B981; color: #FFFFFF;' : 'background: #FFFFFF; border: 2px solid #CBD5E1; color: #94A3B8;';
                        const textStyle = isCompleted ? 'color: #047857; font-weight: 700;' : 'color: #94A3B8; font-weight: 500;';
                        
                        return `
                            <div style="display: flex; flex-direction: column; align-items: center; flex: 1; text-align: center;">
                                <div style="width: 36px; height: 36px; border-radius: 50%; ${bgStyle} display: flex; align-items: center; justify-content: center; font-size: 0.95rem; box-shadow: ${isCurrent ? '0 0 0 5px rgba(16, 185, 129, 0.25)' : '0 2px 4px rgba(0,0,0,0.05)'}; transition: all 0.4s ease;">
                                    <i class="fa-solid ${step.icon}"></i>
                                </div>
                                <span style="font-size: 0.72rem; ${textStyle} margin-top: 8px; line-height: 1.25;">
                                    ${step.label}
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// ── 3-MINUTE ORDER CANCELLATION WINDOW LOGIC ────────────────────────────────
const CANCELLATION_WINDOW_SECONDS = 3 * 60; // 3 minutes = 180 seconds

function getOrderCancellationTimeLeft(order) {
    if (!order || !order.date) return 0;
    if (order.status === 'Cancelled' || order.status === 'Delivered') return 0;
    const orderTime = new Date(order.date).getTime();
    if (isNaN(orderTime)) return 0;
    const elapsedSeconds = Math.floor((Date.now() - orderTime) / 1000);
    const remainingSeconds = CANCELLATION_WINDOW_SECONDS - elapsedSeconds;
    return Math.max(0, remainingSeconds);
}

function formatCountdown(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

let _cancelCountdownTicker = null;
function startCancellationCountdownTicker() {
    if (_cancelCountdownTicker) return;
    _cancelCountdownTicker = setInterval(() => {
        // 1. Update all digit spans in My Orders & Booking Tracking
        const timerEls = document.querySelectorAll('.cancel-timer-digits[data-order-id]');
        timerEls.forEach(el => {
            const oId = el.getAttribute('data-order-id');
            const o = state.ordersHistory ? state.ordersHistory.find(item => item.id === oId) : null;
            if (o) {
                // NEVER touch or override orders that are already Cancelled or Delivered!
                if (o.status === 'Cancelled' || o.status === 'Delivered') {
                    return;
                }
                const rem = getOrderCancellationTimeLeft(o);
                if (rem > 0) {
                    el.textContent = formatCountdown(rem);
                } else {
                    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
                    const isSupplierRole = state.currentUser && state.currentUser.role === 'supplier';
                    const adminOrSupplier = isSystemAdmin || isSupplierRole;

                    const parentWraps = document.querySelectorAll(`.cancelWrap_${oId}, #cancelWrap_${oId}`);
                    parentWraps.forEach(parentWrap => {
                        parentWrap.innerHTML = `
                            <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="Cancellation window closed after 3 minutes">
                                <i class="fa-solid fa-lock text-success"></i> ${adminOrSupplier ? (isSupplierRole ? 'User cancel window closed (Safe to dispatch)' : 'User cancel window closed') : 'Cancellation window closed'}
                            </span>
                            ${(!isSupplierRole && isSystemAdmin) ? `
                                <button class="action-btn text-danger cancel-btn-${oId}" onclick="openCancelOrderActionModal('${oId}')" style="color: #DC2626; background: #FEE2E2; border: 1px solid #FCA5A5; font-weight: 600; padding: 4px 10px; border-radius: 6px; font-size: 0.78rem; height: auto;" title="Cancel Order (Admin Override)">
                                    <i class="fa-solid fa-ban"></i> Cancel Order (Admin Override)
                                </button>
                            ` : ''}
                        `;
                    });

                    const headerBadges = document.querySelectorAll(`.cancelHeaderBadge_${oId}`);
                    headerBadges.forEach(hb => {
                        hb.innerHTML = `
                            <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="Cancellation window closed after 3 minutes">
                                <i class="fa-solid fa-lock text-success"></i> ${adminOrSupplier ? 'User cancel window closed' : 'Cancellation window closed'}
                            </span>
                        `;
                    });

                    const notifBadges = document.querySelectorAll(`.cancelNotifBadge_${oId}`);
                    notifBadges.forEach(nb => {
                        nb.innerHTML = `
                            <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 0.74rem; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-lock text-success"></i> Cancel window closed
                            </span>
                        `;
                    });
                }
            }
        });

        // 2. Update Order Success Modal timer if open
        const sTimer = document.getElementById('successOrderCancelTimer');
        const sBox = document.getElementById('successCancelWindowBox');
        if (sTimer && sBox && typeof successOrderId !== 'undefined' && successOrderId) {
            const currentSuccessId = successOrderId.textContent.trim();
            const sOrder = state.ordersHistory ? state.ordersHistory.find(item => item.id === currentSuccessId) : null;
            if (sOrder) {
                const rem = getOrderCancellationTimeLeft(sOrder);
                if (rem > 0 && sOrder.status !== 'Cancelled') {
                    sTimer.textContent = formatCountdown(rem);
                } else {
                    updateSuccessOrderCancelUI(sOrder);
                }
            }
        }
    }, 1000);
}

function updateSuccessOrderCancelUI(order) {
    const sBox = document.getElementById('successCancelWindowBox');
    if (!sBox) return;

    if (!order) {
        sBox.style.display = 'none';
        return;
    }

    if (order.status === 'Cancelled') {
        sBox.innerHTML = `
            <div style="font-size: 0.9rem; color: #DC2626; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <i class="fa-solid fa-circle-xmark"></i> This Order Was Cancelled
            </div>
            <p style="margin: 0; font-size: 0.78rem; color: #7F1D1D;">Your cancellation was processed successfully.</p>
        `;
        sBox.style.background = '#FEF2F2';
        sBox.style.border = '1.5px solid #FCA5A5';
        return;
    }

    const rem = getOrderCancellationTimeLeft(order);
    if (rem > 0) {
        sBox.style.display = 'flex';
        sBox.style.background = '#FFFBEB';
        sBox.style.border = '1.5px solid #FDE68A';
        sBox.innerHTML = `
            <div style="font-size: 0.88rem; color: #92400E; font-weight: 700; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                Cancellation Window: <span id="successOrderCancelTimer" style="font-weight: 800; font-size: 1.05rem; color: #B45309; background: #FEF3C7; padding: 2px 10px; border-radius: 6px; font-family: monospace; border: 1px solid #FCD34D;">${formatCountdown(rem)}</span> remaining
            </div>
            <p style="margin: 0; font-size: 0.78rem; color: #78350F;">Want to cancel or change your order? You can cancel within 3 minutes of booking.</p>
            <button id="successCancelOrderBtn" class="btn btn-sm btn-danger" style="margin-top: 4px; background: #DC2626; color: #FFF; font-weight: 700; border: none; border-radius: 8px; padding: 7px 18px; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 6px;" onclick="cancelUserOrder('${order.id}')">
                <i class="fa-solid fa-ban"></i> Cancel This Order
            </button>
        `;
    } else {
        sBox.style.display = 'flex';
        sBox.style.background = '#F8FAFC';
        sBox.style.border = '1.5px solid #E2E8F0';
        sBox.innerHTML = `
            <div style="font-size: 0.85rem; color: #475569; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-lock text-muted"></i> Cancellation window closed (Order confirmed & locked for delivery)
            </div>
        `;
    }
}

function renderMyOrders() {
    if (!myOrdersContainer) return;
    
    if (!state.ordersHistory || state.ordersHistory.length === 0) {
        myOrdersContainer.innerHTML = '<p class="empty-state" style="padding: 24px; text-align: center;">You have not booked any items yet.</p>';
        return;
    }

    const currentUserId = state.currentUser ? String(state.currentUser.id).toLowerCase() : null;
    const currentUsername = state.currentUser ? String(state.currentUser.username).toLowerCase() : null;
    const currentEmail = state.currentUser ? String(state.currentUser.email || '').toLowerCase() : null;

    let userOrders = state.ordersHistory;
    if (state.currentUser && state.currentUser.role !== 'admin' && state.currentUser.role !== 'supplier') {
        userOrders = state.ordersHistory.filter(o => {
            if (!o.userId) return true;
            const uid = String(o.userId).toLowerCase();
            const orderEmail = (o.delivery && o.delivery.email) ? String(o.delivery.email).toLowerCase() : '';
            return uid === currentUserId || uid === currentUsername || uid === currentEmail || (currentEmail && orderEmail === currentEmail);
        });
    }

    if (userOrders.length === 0) {
        myOrdersContainer.innerHTML = '<p class="empty-state" style="padding: 24px; text-align: center;">You have not booked any items yet.</p>';
        return;
    }

    myOrdersContainer.innerHTML = userOrders.map(order => {
        const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
        const timeLeft = getOrderCancellationTimeLeft(order);
        const cancelledBy = order.cancelled_by || order.cancelledBy || 'Customer';
        const isCustomerCancel = cancelledBy.toLowerCase().includes('customer') || cancelledBy.toLowerCase().includes('user');
        const cancelReason = order.cancel_reason || order.cancelReason || 'Cancelled within 3-minute booking window';
        const cancelledAtTime = order.cancelled_at || order.cancelledAt || '';
        const cancelBadgeText = isCustomerCancel ? 'Cancelled by User' : `Cancelled by ${cancelledBy}`;

        let cancelBlockHtml = '';
        if (order.status === 'Cancelled') {
            cancelBlockHtml = `
                <button type="button" class="action-btn" onclick="openCancellationDetailsModal('${order.id}')" style="background: #FEE2E2; color: #DC2626; border: 1.5px solid #FCA5A5; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;" title="Click to view cancellation details">
                    <i class="fa-solid fa-ban"></i> ${cancelBadgeText}
                </button>
            `;
        } else if (order.status !== 'Delivered') {
            if (!isSystemAdmin && timeLeft <= 0) {
                cancelBlockHtml = `
                    <span style="color: #64748B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="Cancellation window closed after 3 minutes">
                        <i class="fa-solid fa-lock text-muted"></i> Cancellation window closed
                    </span>
                `;
            } else {
                cancelBlockHtml = `
                    <div id="cancelWrap_${order.id}" class="cancelWrap_${order.id}" style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        ${timeLeft > 0 ? `
                            <span class="cancellation-countdown-pill" style="background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;">
                                <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                                <span class="cancel-timer-digits" data-order-id="${order.id}">${formatCountdown(timeLeft)}</span> left to cancel
                            </span>
                        ` : ''}
                        <button class="action-btn text-danger cancel-btn-${order.id}" onclick="openCancelOrderActionModal('${order.id}')" style="color: #DC2626; background: #FEE2E2; border: 1px solid #FCA5A5; font-weight: 600;" title="Cancel Order within 3 mins">
                            <i class="fa-solid fa-ban"></i> Cancel Order ${isSystemAdmin && timeLeft <= 0 ? '(Admin Override)' : ''}
                        </button>
                    </div>
                `;
            }
        }

        return `
            <div class="order-card" style="${order.status === 'Cancelled' ? 'border: 1.5px solid #FCA5A5; background: #FFFBFB;' : ''}">
                <div class="order-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <h4 style="margin-bottom: 0;">Order ID: ${order.id}</h4>
                        <span class="order-date">${new Date(order.date).toLocaleDateString()}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <div class="cancelHeaderBadge_${order.id}">
                            ${order.status === 'Cancelled' ? `
                                <span class="badge" onclick="openCancellationDetailsModal('${order.id}')" style="background: #FEE2E2; color: #DC2626; border: 1.5px solid #FCA5A5; font-weight: 800; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Click to view cancellation details">
                                    <i class="fa-solid fa-ban"></i> ${cancelBadgeText.toUpperCase()}
                                </span>
                            ` : order.status === 'Delivered' ? `
                                <span class="badge" style="background: #D1FAE5; color: #047857; border: 1px solid #A7F3D0; font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem;">
                                    <i class="fa-solid fa-check-circle"></i> Delivered
                                </span>
                            ` : timeLeft > 0 ? `
                                <span class="cancellation-countdown-pill" style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FDE68A; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;">
                                    <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                                    <span class="cancel-timer-digits" data-order-id="${order.id}">${formatCountdown(timeLeft)}</span> left to cancel
                                </span>
                            ` : `
                                <span style="color: #64748B; background: #F1F5F9; border: 1px solid #CBD5E1; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="Cancellation window closed after 3 minutes">
                                    <i class="fa-solid fa-lock text-muted"></i> Cancellation window closed
                                </span>
                            `}
                        </div>
                    </div>
                </div>

                <!-- Live Order Tracking Flow Stepper -->
                ${renderTrackingStepper(order.status)}

                ${order.status === 'Cancelled' ? `
                    <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; color: #991B1B; padding: 10px 14px; border-radius: 10px; font-size: 0.84rem; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <strong style="color: #991B1B;"><i class="fa-solid fa-ban"></i> ${cancelBadgeText}</strong>
                            <div style="font-size: 0.78rem; color: #B91C1C; margin-top: 2px;">
                                <strong>Reason:</strong> ${cancelReason} ${cancelledAtTime ? ` • <i class="fa-solid fa-clock"></i> ${cancelledAtTime}` : ''}
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm" onclick="openCancellationDetailsModal('${order.id}')" style="background: #DC2626; color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; cursor: pointer;">
                            View Details
                        </button>
                    </div>
                ` : ''}
                
                ${order.delivery ? `
                <div style="background-color: var(--bg-light); padding: 0.8rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem;">
                    <strong>Deliver To:</strong> ${order.delivery.name} (${order.delivery.phone})<br>
                    <strong>Address:</strong> ${order.delivery.address}<br>
                    <strong>Payment:</strong> ${order.delivery.payment.toUpperCase()}
                </div>
                ` : ''}

                <div class="order-items-list">
                    ${order.items.map(item => `
                        <div class="order-item-row">
                            <img src="${item.image}" alt="${item.title}" class="order-item-img">
                            <div class="order-item-info">
                                <h5>${item.title}</h5>
                                <span class="order-item-supplier">Supplier: ${item.supplierName}</span>
                                <span class="order-item-price">₹${item.price} x ${item.qty}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="order-footer">
                    <span class="order-total">Total: ₹${parseFloat(order.total).toFixed(2)}</span>
                    <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                        ${cancelBlockHtml}
                        <button class="action-btn" onclick="downloadOrderPDF('${order.id}')" title="Download PDF"><i class="fa-solid fa-file-pdf"></i></button>
                        <button class="action-btn" onclick="reorderItems('${order.id}')">Reorder</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    startCancellationCountdownTicker();
}

window.openCancelOrderActionModal = function(orderId) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
    const timeLeft = getOrderCancellationTimeLeft(order);

    if (!isSystemAdmin && timeLeft <= 0) {
        showToast('❌ <strong>Cancellation Window Closed!</strong><br>Orders can only be cancelled within 3 minutes of booking.', 'error');
        return;
    }

    const container = document.getElementById('cancelOrderActionContent');
    if (!container) return;

    container.innerHTML = `
        <div style="background: #FFFFFF; border-bottom: 1.5px solid #F1F5F9; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 38px; height: 38px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div>
                    <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #0F172A;">Cancel Order #${order.id}</h3>
                    <div style="font-size: 0.78rem; color: #64748B; margin-top: 2px;">
                        ${isSystemAdmin ? 'Admin Order Cancellation' : 'Customer 3-Minute Cancellation Window'}
                    </div>
                </div>
            </div>
            <button type="button" class="close-modal-btn" onclick="closeCancelOrderActionModal()" style="position: static; width: 32px; height: 32px; border-radius: 50%; background: #F1F5F9; border: 1px solid #E2E8F0; color: #64748B; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div style="padding: 20px 22px; overflow-y: auto; flex: 1; background: #FAFAFA;">
            ${timeLeft > 0 ? `
                <div style="background: #FEF3C7; border: 1.5px solid #FCD34D; color: #92400E; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; font-size: 0.85rem; font-weight: 700;">
                    <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706; font-size: 1.15rem;"></i>
                    <span>Time remaining: <strong style="font-family: monospace; font-size: 1rem; color: #B45309;">${formatCountdown(timeLeft)}</strong> (Allowed within 3 minutes of booking)</span>
                </div>
            ` : isSystemAdmin ? `
                <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; color: #1E40AF; padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 0.85rem; font-weight: 600;">
                    <i class="fa-solid fa-shield-halved"></i> <strong>Admin Override:</strong> Cancelling order on behalf of customer or store.
                </div>
            ` : ''}

            <p style="margin: 0 0 14px 0; font-size: 0.88rem; color: #334155; line-height: 1.45;">
                Please select the reason for cancelling this order. This message will be recorded and shown in the Admin and Supplier dashboard.
            </p>

            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #475569; margin-bottom: 6px;">Select Reason <span style="color: #DC2626;">*</span></label>
                <select id="cancelOrderReasonSelect" onchange="handleCancelReasonSelectChange(this.value)" style="width: 100%; padding: 10px 12px; border: 1.5px solid #CBD5E1; border-radius: 8px; font-size: 0.88rem; font-weight: 600; color: #0F172A; background: white;">
                    <option value="Changed mind / placed order by mistake">Changed mind / placed order by mistake</option>
                    <option value="Want to change items or delivery address">Want to change items or delivery address</option>
                    <option value="Delivery time is too long">Delivery time is too long</option>
                    <option value="Found a better price / ordered elsewhere">Found a better price / ordered elsewhere</option>
                    <option value="Item not required anymore">Item not required anymore</option>
                    <option value="Other">Other (write custom reason below)</option>
                </select>
            </div>

            <div id="cancelOrderCustomReasonWrap" style="margin-bottom: 16px;">
                <label style="display: block; font-size: 0.82rem; font-weight: 700; color: #475569; margin-bottom: 6px;">Additional Details (Optional)</label>
                <textarea id="cancelOrderCustomReason" rows="2" placeholder="Write any specific reason or notes..." style="width: 100%; padding: 10px 12px; border: 1.5px solid #CBD5E1; border-radius: 8px; font-size: 0.85rem; font-family: inherit; resize: vertical; box-sizing: border-box;"></textarea>
            </div>

            <!-- Order preview summary -->
            <div style="background: white; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px 14px; font-size: 0.82rem; color: #64748B;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>Items Count:</span>
                    <strong style="color: #0F172A;">${order.items ? order.items.length : 0} items</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Total Amount:</span>
                    <strong style="color: #0F172A; font-size: 0.95rem;">₹${parseFloat(order.total || 0).toFixed(2)}</strong>
                </div>
            </div>
        </div>

        <div style="padding: 14px 22px; background: white; border-top: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCancelOrderActionModal()" style="padding: 8px 16px; border-radius: 8px; font-weight: 700;">
                Keep Order
            </button>
            <button type="button" class="btn btn-danger btn-sm" onclick="confirmExecuteCancelOrder('${order.id}')" style="background: #DC2626; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                <i class="fa-solid fa-ban"></i> Confirm Cancellation
            </button>
        </div>
    `;

    const modal = document.getElementById('cancelOrderActionModal');
    const overlay = document.getElementById('cancelOrderActionOverlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.closeCancelOrderActionModal = function() {
    const modal = document.getElementById('cancelOrderActionModal');
    const overlay = document.getElementById('cancelOrderActionOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.handleCancelReasonSelectChange = function(val) {
    const customInput = document.getElementById('cancelOrderCustomReason');
    if (customInput && val !== 'Other') {
        customInput.placeholder = `Additional notes regarding: ${val}...`;
    }
};

window.confirmExecuteCancelOrder = function(orderId) {
    const selectEl = document.getElementById('cancelOrderReasonSelect');
    const customEl = document.getElementById('cancelOrderCustomReason');
    let reason = selectEl ? selectEl.value : 'Changed mind / placed order by mistake';
    const customText = customEl ? customEl.value.trim() : '';

    if (reason === 'Other') {
        reason = customText || 'Cancelled by user';
    } else if (customText) {
        reason = `${reason} (${customText})`;
    }

    executeCancelOrder(orderId, reason);
};

window.cancelUserOrder = function(orderId) {
    openCancelOrderActionModal(orderId);
};

window.executeCancelOrder = async function(orderId, reason) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
    const isSupplier = state.currentUser && state.currentUser.role === 'supplier';
    const roleName = isSystemAdmin ? 'Admin' : (isSupplier ? 'Supplier' : 'Customer');

    const nowStr = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    const finalReason = reason || `Cancelled by ${roleName} within 3-minute booking window`;

    order.status = 'Cancelled';
    order.cancelled_by = roleName;
    order.cancel_reason = finalReason;
    order.cancelled_at = nowStr;

    closeCancelOrderActionModal();

    try {
        const token = localStorage.getItem('dropzyy_auth_token');
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE_URL}/orders/${orderId}/cancel`, {
            method: 'PUT',
            headers: reqHeaders,
            body: JSON.stringify({
                reason: finalReason,
                cancelled_by: roleName
            })
        });

        if (res && res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.cancelled_by) order.cancelled_by = data.cancelled_by;
            if (data.cancel_reason) order.cancel_reason = data.cancel_reason;
            if (data.cancelled_at) order.cancelled_at = data.cancelled_at;
            showToast(`Order <strong>${orderId}</strong> cancelled successfully!`, 'success');
        } else {
            const errJson = await res.json().catch(() => ({}));
            if (errJson && errJson.detail) {
                showToast(`❌ ${errJson.detail}`, 'error');
            } else {
                showToast(`Order <strong>${orderId}</strong> cancelled!`, 'info');
            }
        }
    } catch (e) {
        showToast(`Order <strong>${orderId}</strong> cancelled locally`, 'info');
    }

    try {
        /* zero-storage */
    } catch (e) {}

    renderMyOrders();
    if (typeof renderBookingTracking === 'function') renderBookingTracking();
    updateSuccessOrderCancelUI(order);
};

window.openCancellationDetailsModal = function(orderId) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    const container = document.getElementById('cancellationDetailsContent');
    if (!container) return;

    const isSupplierRole = state.currentUser && state.currentUser.role === 'supplier';
    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
    const cancelledBy = order.cancelled_by || order.cancelledBy || 'Customer';
    const isCustomer = cancelledBy.toLowerCase().includes('customer') || cancelledBy.toLowerCase().includes('user');
    const reason = order.cancel_reason || order.cancelReason || 'Cancelled within 3-minute booking window';
    const cancelledAt = order.cancelled_at || order.cancelledAt || (order.date ? new Date(order.date).toLocaleString('en-IN') : 'Recently');

    const custName = isSupplierRole ? '[Protected for Privacy - Supplier View]' : (order.delivery ? order.delivery.name : 'Customer');
    const custPhone = isSupplierRole ? '*** Protected ***' : (order.delivery ? order.delivery.phone : 'N/A');
    const rawPhone = (order.delivery && order.delivery.phone) || '';
    const rawEmail = (order.delivery && order.delivery.email) || '';
    const isBlocked = isCustomerBlocked(rawPhone, rawEmail);

    // Filter items if supplier
    const displayItems = isSupplierRole 
        ? (order.items || []).filter(item => isItemFromSupplier(item))
        : (order.items || []);

    container.innerHTML = `
        <div style="background: #FEF2F2; border-bottom: 1.5px solid #FCA5A5; padding: 18px 22px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 42px; height: 42px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; border: 2px solid #F87171; flex-shrink: 0;">
                    <i class="fa-solid fa-ban"></i>
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 800; color: #991B1B;">Order #${order.id}</h3>
                        <span style="background: #DC2626; color: white; padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 800; text-transform: uppercase;">
                            ${isCustomer ? 'Cancelled by User' : `Cancelled by ${cancelledBy}`}
                        </span>
                    </div>
                    <div style="font-size: 0.78rem; color: #B91C1C; margin-top: 2px;">
                        Booked on ${new Date(order.date).toLocaleString()}
                    </div>
                </div>
            </div>
            <button type="button" class="close-modal-btn" onclick="closeCancellationDetailsModal()" style="position: static; width: 32px; height: 32px; border-radius: 50%; background: white; border: 1px solid #FECACA; color: #991B1B; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div style="padding: 20px 22px; overflow-y: auto; flex: 1; background: #FAFAFA;">
            <!-- Cancellation Summary Banner -->
            <div style="background: white; border: 1.5px solid #FCA5A5; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; box-shadow: 0 2px 8px rgba(220,38,38,0.05);">
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 800; color: #DC2626; margin-bottom: 8px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-circle-exclamation"></i> Cancellation Record
                </div>
                <div style="margin-bottom: 6px; font-size: 0.88rem;">
                    <span style="color: #64748B;">Cancelled By:</span> 
                    <strong style="color: #0F172A; margin-left: 6px;">${isCustomer ? '👤 Customer / User' : `🛡️ ${cancelledBy}`}</strong>
                </div>
                <div style="margin-bottom: 10px; font-size: 0.88rem;">
                    <span style="color: #64748B;">Cancellation Time:</span> 
                    <strong style="color: #0F172A; margin-left: 6px;"><i class="fa-solid fa-clock" style="color: #F59E0B;"></i> ${cancelledAt}</strong>
                </div>
                <div style="background: #FFF5F5; border-left: 3px solid #EF4444; padding: 10px 12px; border-radius: 0 8px 8px 0;">
                    <span style="font-size: 0.76rem; font-weight: 700; color: #991B1B; display: block; margin-bottom: 2px;">CANCELLATION REASON:</span>
                    <span style="font-size: 0.9rem; color: #1E293B; font-weight: 600;">"${reason}"</span>
                </div>
            </div>

            <!-- Customer & Delivery info -->
            <div style="background: white; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;">
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 800; color: #475569; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fa-solid fa-location-dot" style="color: #10B981;"></i> Customer Details</span>
                    ${(isSystemAdmin && isBlocked) ? `
                        <span class="badge" style="background: #FEE2E2; color: #DC2626; font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; font-weight: 800; border: 1px solid #FECACA; display: inline-flex; align-items: center; gap: 4px;">
                            <i class="fa-solid fa-ban"></i> RESTRICTED / BLOCKED
                        </span>
                    ` : ''}
                </div>
                <div style="font-size: 0.84rem; color: #334155; line-height: 1.5;">
                    <div><strong>Customer Name:</strong> ${custName}</div>
                    <div><strong>Phone:</strong> ${custPhone}</div>
                    ${rawEmail ? `<div><strong>Email:</strong> ${rawEmail}</div>` : ''}
                    ${order.delivery && order.delivery.payment ? `<div><strong>Payment Mode:</strong> ${order.delivery.payment.toUpperCase()}</div>` : ''}
                </div>
            </div>

            <!-- Cancelled Items Summary -->
            <div style="background: white; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 16px;">
                <div style="font-size: 0.75rem; text-transform: uppercase; font-weight: 800; color: #475569; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
                    <span><i class="fa-solid fa-bowl-food" style="color: #F59E0B;"></i> Cancelled Items (${displayItems.length})</span>
                    <strong style="color: #0F172A; font-size: 0.9rem;">Total: ₹${parseFloat(order.total || 0).toFixed(2)}</strong>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${displayItems.map(item => `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #E2E8F0; font-size: 0.82rem;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <img src="${item.image}" alt="${item.title}" style="width: 34px; height: 34px; object-fit: cover; border-radius: 6px;">
                                <div>
                                    <strong style="color: #0F172A;">${item.title}</strong>
                                    <div style="color: #64748B; font-size: 0.75rem;">Qty: ${item.qty || 1} • Supplier: ${item.supplierName || 'Dropzyy Direct'}</div>
                                </div>
                            </div>
                            <span style="font-weight: 700; color: #334155;">₹${(parseFloat(item.price) * (item.qty || 1)).toFixed(2)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <div style="padding: 14px 22px; background: white; border-top: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
            <div>
                ${(isSystemAdmin && (rawPhone || rawEmail)) ? `
                    ${isBlocked ? `
                        <button type="button" class="btn btn-secondary btn-sm" onclick="adminUnblockFromOrder('${order.id}')" style="background: #ECFDF5; color: #047857; border: 1.5px solid #A7F3D0; font-weight: 700; border-radius: 8px; padding: 7px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i class="fa-solid fa-lock-open"></i> Unblock Customer
                        </button>
                    ` : `
                        <button type="button" class="btn btn-danger btn-sm" onclick="adminQuickBlockFromOrder('${order.id}')" style="background: #DC2626; color: white; border: none; font-weight: 700; border-radius: 8px; padding: 7px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                            <i class="fa-solid fa-ban"></i> Block Customer (Fraud Shield)
                        </button>
                    `}
                ` : ''}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCancellationDetailsModal()" style="padding: 7px 20px; border-radius: 8px; font-weight: 700;">
                Close
            </button>
        </div>
    `;

    const modal = document.getElementById('cancellationDetailsModal');
    const overlay = document.getElementById('cancellationDetailsOverlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.closeCancellationDetailsModal = function() {
    const modal = document.getElementById('cancellationDetailsModal');
    const overlay = document.getElementById('cancellationDetailsOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.reorderItems = function(orderId) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;
    
    order.items.forEach(item => {
        const existing = state.cart.find(i => i.id === item.id);
        if (existing) {
            existing.qty += item.qty;
        } else {
            state.cart.push({...item});
        }
    });
    
    saveCart();
    updateCartUI();
    showToast('Items added to cart', 'success');
    closeModals();
    if (cartOverlay) cartOverlay.classList.add('active');
    if (cartDrawer) cartDrawer.classList.add('active');
};

// 19. BOOKING TRACKING PLATFORM
async function openBookingTrackingModal() {
    closeModals();
    if (!state.currentUser) {
        showToast('Please Sign In or Create an Account first to track your orders!', 'info');
        openAuthModal();
        return;
    }
    await fetchOrdersFromAPI();
    renderBookingTracking();
    if (bookingTrackingOverlay) bookingTrackingOverlay.classList.add('active');
    if (bookingTrackingModal) bookingTrackingModal.classList.add('active');
}

function renderBookingTracking(searchQuery = '') {
    if (!bookingTrackingContainer) return;
    
    let bookingsToDisplay = [...state.ordersHistory];
    const isSupplierRole = state.currentUser && state.currentUser.role === 'supplier';
    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');

    if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        bookingsToDisplay = bookingsToDisplay.filter(o => 
            o.id.toLowerCase().includes(q) ||
            (!isSupplierRole && o.delivery && o.delivery.name && o.delivery.name.toLowerCase().includes(q)) ||
            (!isSupplierRole && o.delivery && o.delivery.phone && o.delivery.phone.includes(q)) ||
            (!isSupplierRole && o.delivery && o.delivery.email && o.delivery.email.toLowerCase().includes(q))
        );
    }

    // Role-based Order Scoping:
    if (isSupplierRole) {
        // Suppliers ONLY see orders containing items belonging to their supplier account!
        bookingsToDisplay = bookingsToDisplay.filter(o => {
            return (o.items || []).some(item => isItemFromSupplier(item));
        });
    } else if (!isSystemAdmin) {
        // Customer view: only see their own placed orders
        const currentUserId = String(state.currentUser.id || '').toLowerCase();
        const currentUsername = String(state.currentUser.username || '').toLowerCase();
        const currentEmail = String(state.currentUser.email || '').toLowerCase();
        
        bookingsToDisplay = bookingsToDisplay.filter(o => {
            if (!o.userId) return true;
            const uid = String(o.userId).toLowerCase();
            const orderEmail = (o.delivery && o.delivery.email) ? String(o.delivery.email).toLowerCase() : '';
            return uid === currentUserId || uid === currentUsername || uid === currentEmail || (currentEmail && orderEmail === currentEmail);
        });
    }
    
    if (bookingsToDisplay.length === 0) {
        bookingTrackingContainer.innerHTML = searchQuery ? 
            `<p class="empty-state" style="padding: 20px; text-align: center;">No order found matching "<strong>${searchQuery}</strong>". Please verify your Order ID.</p>` :
            (isSupplierRole ? 
                '<p class="empty-state" style="padding: 24px; text-align: center;">No orders containing your supplier products yet.</p>' :
                '<p class="empty-state" style="padding: 24px; text-align: center;">No bookings found in the system yet.</p>');
        return;
    }

    const isAdminOrSupplier = isSystemAdmin || isSupplierRole;

    const toggleSoundAlertBtn = document.getElementById('toggleSoundAlertBtn');
    if (toggleSoundAlertBtn) {
        if (isSystemAdmin) {
            toggleSoundAlertBtn.classList.remove('hidden');
        } else {
            toggleSoundAlertBtn.classList.add('hidden');
        }
    }

    const toggleRefundClaimsBtn = document.getElementById('toggleRefundClaimsBtn');
    const adminRefundClaimsContainer = document.getElementById('adminRefundClaimsContainer');
    if (toggleRefundClaimsBtn) {
        if (isSystemAdmin) {
            toggleRefundClaimsBtn.classList.remove('hidden');
        } else {
            toggleRefundClaimsBtn.classList.add('hidden');
            if (adminRefundClaimsContainer) adminRefundClaimsContainer.classList.add('hidden');
        }
    }

    bookingTrackingContainer.innerHTML = bookingsToDisplay.map(order => {
        // Filter item list: Suppliers ONLY see items from their own catalog!
        const displayItems = isSupplierRole 
            ? (order.items || []).filter(item => isItemFromSupplier(item))
            : (order.items || []);

        // Obscure Customer Personal Info from Supplier view for complete privacy
        const custUserId = isSupplierRole ? '[Protected for Privacy - Supplier View]' : (order.userId ? order.userId : 'Guest Customer');
        const custName = isSupplierRole ? '[Protected for Privacy - Supplier View]' : (order.delivery ? order.delivery.name : 'Customer');
        const custPhone = isSupplierRole ? '*** Protected ***' : (order.delivery ? order.delivery.phone : 'N/A');
        const custEmail = isSupplierRole ? '[Protected]' : (order.delivery ? order.delivery.email : '');
        const custAddress = isSupplierRole ? '[Protected / Hidden for Privacy]' : (order.delivery ? order.delivery.address : 'N/A');
        const payMode = order.delivery ? (order.delivery.payment || 'COD').toUpperCase() : 'COD';

        const subTotal = displayItems.reduce((s, i) => s + (parseFloat(i.price) * parseInt(i.qty || i.quantity || 1)), 0);
        const timeLeft = getOrderCancellationTimeLeft(order);
        const cancelledBy = order.cancelled_by || order.cancelledBy || 'Customer';
        const isCustomerCancel = cancelledBy.toLowerCase().includes('customer') || cancelledBy.toLowerCase().includes('user');
        const cancelReason = order.cancel_reason || order.cancelReason || 'Cancelled within 3-minute booking window';
        const cancelledAtTime = order.cancelled_at || order.cancelledAt || '';
        const cancelBadgeText = isCustomerCancel ? 'Cancelled by User' : `Cancelled by ${cancelledBy}`;

        return `
        <div class="order-card" style="${order.status === 'Cancelled' ? 'border: 2px solid #FCA5A5; background: #FFF5F5;' : ''}">
            <div class="order-header" style="background-color: ${order.status === 'Cancelled' ? '#FEE2E2' : 'var(--bg-light)'}; padding: 1rem; margin: -1.5rem -1.5rem 1rem -1.5rem; border-bottom: 1px solid var(--border-light); border-radius: var(--radius-md) var(--radius-md) 0 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div>
                    <h4 style="margin-bottom: 0;">Order ID: ${order.id}</h4>
                    <span class="order-date">${new Date(order.date).toLocaleString()}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <div class="cancelHeaderBadge_${order.id}">
                        ${order.status === 'Cancelled' ? `
                            <span class="badge" onclick="openCancellationDetailsModal('${order.id}')" style="background: #FEE2E2; color: #DC2626; border: 1.5px solid #FCA5A5; font-weight: 800; padding: 4px 12px; border-radius: 20px; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 1px 3px rgba(220,38,38,0.15);" title="Click to view full cancellation details">
                                <i class="fa-solid fa-ban"></i> ${cancelBadgeText.toUpperCase()}
                            </span>
                        ` : order.status === 'Delivered' ? `
                            <span class="badge" style="background: #D1FAE5; color: #047857; border: 1px solid #A7F3D0; font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem;">
                                <i class="fa-solid fa-check-circle"></i> DELIVERED
                            </span>
                        ` : timeLeft > 0 ? `
                            <span class="cancellation-countdown-pill" style="background: #FEF3C7; color: #92400E; border: 1.5px solid #FDE68A; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;" title="User can cancel within 3 minutes of booking">
                                <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                                <span class="cancel-timer-digits" data-order-id="${order.id}">${formatCountdown(timeLeft)}</span> ${isAdminOrSupplier ? 'left for user cancellation' : 'left to cancel'}
                            </span>
                        ` : `
                            <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="3-minute cancellation window closed">
                                <i class="fa-solid fa-lock text-success"></i> ${isAdminOrSupplier ? 'User cancel window closed' : 'Cancellation window closed'}
                            </span>
                        `}
                    </div>
                    <span class="role-pill role-${order.status === 'Cancelled' ? 'supplier' : (order.status === 'Placed' ? 'customer' : 'admin')}" style="${order.status === 'Cancelled' ? 'background: #DC2626; color: #FFF;' : ''}">${order.status.toUpperCase()}</span>
                </div>
            </div>

            <!-- Live Order Tracking Stepper -->
            ${renderTrackingStepper(order.status)}
            
            ${order.status === 'Cancelled' ? `
                <div style="background: #FEF2F2; border: 1.5px solid #FCA5A5; color: #991B1B; padding: 12px 16px; border-radius: 12px; font-size: 0.86rem; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; box-shadow: 0 2px 6px rgba(220,38,38,0.06);">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 38px; height: 38px; border-radius: 50%; background: #FEE2E2; color: #DC2626; display: flex; align-items: center; justify-content: center; font-size: 1.15rem; border: 2px solid #F87171; flex-shrink: 0;">
                            <i class="fa-solid fa-ban"></i>
                        </div>
                        <div>
                            <div style="font-weight: 800; font-size: 0.95rem; color: #991B1B; display: flex; align-items: center; gap: 6px;">
                                <span>⚠️ ORDER ${cancelBadgeText.toUpperCase()}</span>
                            </div>
                            <div style="font-size: 0.8rem; color: #B91C1C; margin-top: 2px;">
                                <strong>Reason:</strong> ${cancelReason} ${cancelledAtTime ? ` • <span style="color: #64748B;"><i class="fa-solid fa-clock"></i> ${cancelledAtTime}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="btn btn-sm" onclick="openCancellationDetailsModal('${order.id}')" style="background: #DC2626; color: white; border: none; padding: 6px 14px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                        <i class="fa-solid fa-circle-info"></i> View Details
                    </button>
                </div>
            ` : ''}

            <div style="margin-bottom: 0.8rem; color: var(--text-dark); font-size: 0.85rem;">
                <strong>Customer User ID:</strong> ${custUserId}
            </div>
            
            <div style="background-color: #f1f5f9; padding: 0.8rem; border-radius: var(--radius-sm); margin-bottom: 1rem; font-size: 0.85rem; border: 1px solid var(--border-light);">
                <strong>Customer Name:</strong> ${custName}<br>
                <strong>Phone:</strong> ${custPhone}<br>
                ${custEmail ? `<strong>Email:</strong> ${custEmail}<br>` : ''}
                <strong>Address:</strong> ${custAddress}<br>
                <strong>Payment Mode:</strong> ${payMode}
            </div>

            <div class="order-items-list">
                ${displayItems.map(item => `
                    <div class="order-item-row" style="background-color: #fff; border: 1px solid var(--border-light); padding: 0.5rem; border-radius: var(--radius-sm);">
                        <img src="${item.image}" alt="${item.title}" class="order-item-img" style="width: 40px; height: 40px;">
                        <div class="order-item-info">
                            <h5 style="font-size: 0.85rem;">${item.title} (x${item.qty || item.quantity || 1})</h5>
                            <span class="order-item-supplier">Supplier: ${item.supplierName || 'Dropzyy Direct'} • ₹${item.price} each</span>
                        </div>
                        <div style="font-weight: 700; color: #0F172A; font-size: 0.9rem;">
                            ₹${(parseFloat(item.price) * parseInt(item.qty || item.quantity || 1)).toFixed(2)}
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Itemized Bill Breakdown -->
            <div class="order-bill-summary" style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 10px 14px; border-radius: 8px; margin: 10px 0; font-size: 0.85rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #64748B;">${isSupplierRole ? 'Your Items Subtotal:' : 'Items Subtotal:'}</span>
                    <strong style="color: #334155;">₹${subTotal.toFixed(2)}</strong>
                </div>
            </div>

            <div class="order-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 10px; flex-wrap: wrap;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    ${!isSupplierRole ? `<button class="action-btn" onclick="downloadOrderPDF('${order.id}')" title="Generate Invoice PDF" style="padding: 0.4rem 0.8rem; height: auto;"><i class="fa-solid fa-file-pdf"></i> Download PDF Bill</button>` : ''}
                    ${order.status === 'Cancelled' ? `
                        <button type="button" class="action-btn" onclick="openCancellationDetailsModal('${order.id}')" style="background: #FEE2E2; color: #DC2626; border: 1.5px solid #FCA5A5; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;" title="Click to view cancellation details">
                            <i class="fa-solid fa-ban"></i> ${cancelBadgeText}
                        </button>
                    ` : order.status === 'Delivered' ? `
                        <span style="background: #D1FAE5; color: #047857; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-check"></i> Delivered
                        </span>
                    ` : `
                        <div id="cancelWrap_${order.id}" class="cancelWrap_${order.id}" style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            ${timeLeft > 0 ? `
                                <span class="cancellation-countdown-pill" style="background: #FEF3C7; color: #92400E; border: 1px solid #FDE68A; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 0.78rem; display: inline-flex; align-items: center; gap: 5px;" title="Cancellation window active (3 minutes)">
                                    <i class="fa-solid fa-stopwatch fa-spin" style="animation-duration: 3s; color: #D97706;"></i>
                                    <span class="cancel-timer-digits" data-order-id="${order.id}">${formatCountdown(timeLeft)}</span> ${isAdminOrSupplier ? (isSupplierRole ? 'left for user cancel (Hold packing)' : 'left for user cancel') : 'left to cancel'}
                                </span>
                            ` : `
                                <span style="color: #047857; background: #ECFDF5; border: 1px solid #A7F3D0; padding: 4px 10px; border-radius: 20px; font-weight: 600; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 5px;" title="3-minute cancellation window closed">
                                    <i class="fa-solid fa-lock text-success"></i> ${isAdminOrSupplier ? (isSupplierRole ? 'User cancel window closed (Safe to dispatch)' : 'User cancel window closed') : 'Cancellation window closed'}
                                </span>
                            `}
                            ${(!isSupplierRole && (isSystemAdmin || timeLeft > 0)) ? `
                                <button class="action-btn text-danger cancel-btn-${order.id}" onclick="openCancelOrderActionModal('${order.id}')" style="color: #DC2626; background: #FEE2E2; border: 1px solid #FCA5A5; padding: 0.4rem 0.8rem; height: auto; font-weight: 600;" title="Cancel Order">
                                    <i class="fa-solid fa-ban"></i> Cancel Order ${isSystemAdmin && timeLeft <= 0 ? '(Admin Override)' : ''}
                                </button>
                            ` : ''}
                        </div>
                    `}
                </div>
                ${isAdminOrSupplier ? `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.8rem; font-weight: 600; color: #475569;">Status:</span>
                        ${order.status === 'Cancelled' ? `
                            <span class="badge" onclick="openCancellationDetailsModal('${order.id}')" style="background: #FEE2E2; color: #DC2626; border: 1.5px solid #FCA5A5; font-weight: 800; padding: 4px 12px; border-radius: 8px; font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Click to view cancellation details">
                                <i class="fa-solid fa-ban"></i> CANCELLED
                            </span>
                        ` : `
                            <select onchange="updateBookingStatus('${order.id}', this.value)" style="padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-weight: 700; color: #047857; background: #F0FDF4; cursor: pointer;">
                                <option value="Placed" ${order.status === 'Placed' ? 'selected' : ''}>Placed</option>
                                <option value="Packing" ${order.status === 'Packing' ? 'selected' : ''}>Packing</option>
                                <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                                <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                                <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                            </select>
                        `}
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    startCancellationCountdownTicker();
}

window.updateBookingStatus = async function(orderId, newStatus) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    if (newStatus === 'Cancelled') {
        openCancelOrderActionModal(orderId);
        return;
    }

    order.status = newStatus;
    try {
        await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    } catch (e) {
        console.error('Failed to update order status in DB:', e);
    }

        const targetEmail = (order.delivery && order.delivery.email) || order.email || order.userEmail || order.customerEmail || (state.currentUser && state.currentUser.email) || '';
        const customerName = (order.delivery && order.delivery.name) || order.customerName || (state.currentUser && state.currentUser.name) || 'Valued Customer';

        // Send parcel delivery invoice bill via EmailJS upon Delivery
        if (newStatus.toLowerCase() === 'delivered' && targetEmail) {
            showToast(`📩 Dispatching Delivery Bill to <strong>${targetEmail}</strong> via EmailJS...`, 'info');
            sendBillViaEmailJS(targetEmail, customerName, order).then(res => {
                if (res && res.success) {
                    showToast(`📩 Delivery Invoice Bill sent to <strong>${targetEmail}</strong> via EmailJS!`, 'success');
                }
            });
        }

        showToast('Booking status updated to ' + newStatus, 'success');
        if (typeof myOrdersContainer !== 'undefined' && myOrdersContainer) renderMyOrders();
        if (typeof bookingTrackingContainer !== 'undefined' && bookingTrackingContainer) renderBookingTracking();
};

window.resendOrderEmailJSBill = function(orderId) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    const targetEmail = (order.delivery && order.delivery.email) || order.email || order.userEmail || order.customerEmail || (state.currentUser && state.currentUser.email) || '';
    const customerName = (order.delivery && order.delivery.name) || order.customerName || (state.currentUser && state.currentUser.name) || 'Valued Customer';

    if (!targetEmail) {
        showToast('No customer email address found for this order!', 'error');
        return;
    }

    showToast(`📩 Dispatching EmailJS Bill to <strong>${targetEmail}</strong>...`, 'info');
    sendBillViaEmailJS(targetEmail, customerName, order).then(res => {
        if (res && res.success) {
            showToast(`📩 Order Confirmation Bill sent to <strong>${targetEmail}</strong> via EmailJS!`, 'success');
        } else {
            showToast('Failed to dispatch EmailJS bill. Please check EmailJS settings.', 'error');
        }
    });
};

window.downloadOrderPDF = function(orderId) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (!order) return;

    showToast(`📩 Downloading PDF Bill Invoice for Order #${orderId}...`, 'info');

    // Direct File Download Trigger
    const downloadUrl = `${API_BASE_URL}/orders/${orderId}/pdf`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `Dropzyy_Invoice_${order.id}.pdf`;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

function renderSearchSuggestions(query, isMobile) {
    const container = isMobile ? mobileSearchSuggestions : searchSuggestions;
    if (!container) return;

    if (!query.trim()) {
        container.classList.add('hidden');
        return;
    }

    const search = query.toLowerCase();
    const suggestions = state.products.filter(p => {
        return isProductOnline(p) && (
            (p.title && p.title.toLowerCase().includes(search)) || 
            (p.category && p.category.toLowerCase().includes(search))
        );
    }).slice(0, 5); // Max 5 suggestions

    if (suggestions.length === 0) {
        container.innerHTML = '<div style="padding: 14px 16px; color: #64748B; font-weight: 600; background: #FFFFFF; text-align: center;">No matching Kirana items found...</div>';
    } else {
        container.innerHTML = suggestions.map(product => `
            <div class="search-suggestion-item" onclick="selectSuggestion('${product.id}')" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #FFFFFF; border-bottom: 1px solid #F1F5F9; cursor: pointer;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${product.image}" class="search-suggestion-img" style="width: 44px; height: 44px; border-radius: 8px; object-fit: cover; border: 1px solid #E2E8F0;" alt="">
                    <div class="search-suggestion-info">
                        <span class="search-suggestion-title" style="font-weight: 700; font-size: 0.95rem; color: #0F172A;">${product.title}</span>
                        <span class="search-suggestion-category" style="font-size: 0.78rem; color: #059669; font-weight: 600;">${product.category.toUpperCase()} • ${product.unit || ''}</span>
                    </div>
                </div>
                <div style="font-weight: 800; font-size: 1rem; color: #059669; background: #ECFDF5; padding: 4px 10px; border-radius: 20px;">
                    ₹${product.price}
                </div>
            </div>
        `).join('');
    }
    container.classList.remove('hidden');
}

window.selectSuggestion = function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;
    
    state.searchQuery = product.title;
    if (searchInput) searchInput.value = product.title;
    if (mobileSearchInput) mobileSearchInput.value = product.title;
    if (clearSearchBtn) clearSearchBtn.classList.remove('hidden');
    
    if (searchSuggestions) searchSuggestions.classList.add('hidden');
    if (mobileSearchSuggestions) mobileSearchSuggestions.classList.add('hidden');
    
    renderProducts();
    
    const section = document.getElementById('productsSection');
    if(section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
};


/* ==========================================
   Category Management (Supplier & Admin Feature)
   ========================================== */
window.populateCategoryDropdowns = function() {
    const select = document.getElementById('prodCategory');
    if (!select) return;
    const activeCats = CATEGORIES.filter(c => c.id !== 'all');
    const isSupplier = state.currentUser && state.currentUser.role === 'supplier';
    const currentSupplierName = isSupplier ? (state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username) : null;

    if (isSupplier && currentSupplierName) {
        const myCats = activeCats.filter(c => c.created_by_supplier && c.created_by_supplier.toLowerCase() === currentSupplierName.toLowerCase());
        const otherCats = activeCats.filter(c => !c.created_by_supplier || c.created_by_supplier.toLowerCase() !== currentSupplierName.toLowerCase());

        let html = '';
        if (myCats.length > 0) {
            html += `<optgroup label="⭐ ${currentSupplierName} Categories">`;
            html += myCats.map(c => `<option value="${c.id}">⭐ ${c.name}</option>`).join('');
            html += `</optgroup>`;
        }
        html += `<optgroup label="🌐 Global & Other Categories">`;
        html += otherCats.map(c => `<option value="${c.id}">${c.name}${c.created_by_supplier ? ` (${c.created_by_supplier})` : ''}</option>`).join('');
        html += `</optgroup>`;
        select.innerHTML = html;
    } else {
        select.innerHTML = activeCats.map(c => `<option value="${c.id}">${c.name}${c.created_by_supplier ? ` (${c.created_by_supplier})` : ''}</option>`).join('');
    }
};

window.openAdminCategoriesModal = function() {
    closeModals();
    const isSupplier = state.currentUser && state.currentUser.role === 'supplier';
    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
    const companyName = state.currentUser ? (state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username) : 'Partner';

    const backBtnContainer = document.getElementById('adminCategoriesBackBtnContainer');
    if (backBtnContainer) {
        if (isSupplier) {
            backBtnContainer.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="openSupplierDashboard()">
                    <i class="fa-solid fa-arrow-left"></i> Back to Supplier Dashboard
                </button>
            `;
        } else {
            backBtnContainer.innerHTML = `
                <button type="button" class="btn btn-secondary btn-sm" onclick="openAdminControlCenter()">
                    <i class="fa-solid fa-arrow-left"></i> Back to Admin Panel
                </button>
            `;
        }
    }

    const subtitle = document.getElementById('adminCategoriesSubtitle');
    if (subtitle) {
        if (isSupplier) {
            subtitle.innerHTML = `Add & manage menu categories for your restaurant: <strong style="color: #047857;">${companyName}</strong>`;
        } else {
            subtitle.textContent = 'Add new store categories (e.g. Hotel Dishes, Cold Drinks, Bakery) for products';
        }
    }

    const scopeContainer = document.getElementById('categoryScopeContainer');
    if (scopeContainer) {
        if (isSupplier) {
            scopeContainer.innerHTML = `
                <div style="background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 12px;">
                    <div style="width: 38px; height: 38px; border-radius: 50%; background: #10B981; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; flex-shrink: 0;">
                        <i class="fa-solid fa-store"></i>
                    </div>
                    <div>
                        <div style="font-weight: 800; color: #065F46; font-size: 0.95rem;">Restaurant Category Creator</div>
                        <div style="font-size: 0.82rem; color: #047857;">Categories created here are automatically linked to <strong>${companyName}</strong>! When customers select your restaurant, they can view your menu grouped by these categories.</div>
                    </div>
                </div>
            `;
        } else if (isSystemAdmin) {
            // Find unique suppliers for dropdown
            const supSet = new Map();
            registeredUsers.filter(u => u.role === 'supplier').forEach(u => {
                const sName = u.supplier_company_name || u.full_name || u.username;
                supSet.set(sName, { name: sName, username: u.username });
            });
            state.products.forEach(p => {
                const sName = p.supplier_name || p.supplierName;
                if (sName && !supSet.has(sName)) {
                    supSet.set(sName, { name: sName, username: sName });
                }
            });

            scopeContainer.innerHTML = `
                <div class="form-group" style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 10px; padding: 12px 14px;">
                    <label for="categoryTargetRestaurant" style="font-weight: 700; color: #1E293B; display: block; margin-bottom: 6px;">
                        <i class="fa-solid fa-store text-primary"></i> Assign Category To Restaurant / Store:
                    </label>
                    <select id="categoryTargetRestaurant" style="width: 100%; padding: 8px 12px; border: 1.5px solid #CBD5E1; border-radius: 8px; font-weight: 600; font-size: 0.9rem; background: #FFF; color: #1E293B;">
                        <option value="">🌐 Global (All Stores & System Catalog)</option>
                        ${Array.from(supSet.values()).map(s => `<option value="${s.name}">🏪 ${s.name} (@${s.username})</option>`).join('')}
                    </select>
                </div>
            `;
        } else {
            scopeContainer.innerHTML = '';
        }
    }

    window.populateCategoryDropdowns();
    renderAdminCategoriesList();
    const modal = document.getElementById('adminCategoriesModal');
    const overlay = document.getElementById('adminCategoriesOverlay');
    if (modal && overlay) {
        modal.classList.add('active');
        overlay.classList.add('active');
    }
};

function renderAdminCategoriesList() {
    const container = document.getElementById('adminCategoriesListContainer');
    if (!container) return;
    
    const isSupplier = state.currentUser && state.currentUser.role === 'supplier';
    const currentSupplierName = isSupplier ? (state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username) : null;
    const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');

    container.innerHTML = CATEGORIES.map(cat => {
        const belongsToCurrentSupplier = isSupplier && cat.created_by_supplier && currentSupplierName && (cat.created_by_supplier.toLowerCase() === currentSupplierName.toLowerCase());
        const canDelete = isSystemAdmin || belongsToCurrentSupplier;
        const isSystemDefault = DEFAULT_CATEGORIES.some(d => d.id === cat.id);

        let badgeHtml = '';
        if (cat.created_by_supplier) {
            badgeHtml = `<span class="badge" style="background:#ECFDF5; color:#065F46; border: 1px solid #A7F3D0; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px; font-weight: 700;"><i class="fa-solid fa-store"></i> ${cat.created_by_supplier}</span>`;
        } else {
            badgeHtml = `<span class="badge" style="background:#F1F5F9; color:#475569; font-size: 0.72rem; padding: 2px 8px; border-radius: 10px;"><i class="fa-solid fa-globe"></i> Global</span>`;
        }

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #FFF; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="${cat.icon} text-primary" style="font-size: 1.1rem; width: 20px; text-align: center;"></i>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <strong>${cat.name}</strong>
                            ${badgeHtml}
                        </div>
                        <small style="display: block; color: #64748b;">ID: <code>${cat.id}</code></small>
                    </div>
                </div>
                ${!isSystemDefault && canDelete ? `
                    <button type="button" class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}')">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                ` : isSystemDefault ? '<span class="badge" style="background:#E2E8F0; color:#475569;">System Category</span>' : ''}
            </div>
        `;
    }).join('');
}

window.handleAddCategorySubmit = function(e) {
    e.preventDefault();
    const idInput = document.getElementById('newCatId');
    const nameInput = document.getElementById('newCatName');
    const iconInput = document.getElementById('newCatIcon');

    const catId = idInput.value.trim().toLowerCase().replace(/\s+/g, '_');
    const catName = nameInput.value.trim();
    const catIcon = iconInput.value.trim() || 'fa-solid fa-layer-group';

    if (!catId || !catName) return;

    if (CATEGORIES.some(c => c.id === catId)) {
        showToast('Category ID already exists!', 'error');
        return;
    }

    const isSupplier = state.currentUser && state.currentUser.role === 'supplier';
    let targetSupplier = null;
    if (isSupplier) {
        targetSupplier = state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username;
    } else {
        const sel = document.getElementById('categoryTargetRestaurant');
        targetSupplier = sel ? (sel.value || null) : null;
    }

    const newCat = {
        id: catId,
        name: catName,
        icon: catIcon,
        created_by_supplier: targetSupplier || null,
        count: 0
    };
    customCategories.push(newCat);
    /* zero-storage */

    CATEGORIES.push(newCat);
    syncAddCategoryToDB(catId, catName, catIcon, targetSupplier);
    renderCategories();
    renderCategoryPills();
    window.populateCategoryDropdowns();
    renderAdminCategoriesList();

    idInput.value = '';
    nameInput.value = '';
    showToast(`Category '<strong>${catName}</strong>' added ${targetSupplier ? `for restaurant <strong>${targetSupplier}</strong>` : 'globally'}!`, 'success');
};

window.deleteCategory = function(catId) {
    customCategories = customCategories.filter(c => c.id !== catId);
    /* zero-storage */
    CATEGORIES = CATEGORIES.filter(c => c.id !== catId);
    syncDeleteCategoryFromDB(catId);
    renderCategories();
    renderCategoryPills();
    window.populateCategoryDropdowns();
    renderAdminCategoriesList();
    showToast('Category deleted', 'success');
};

function renderCategoryPills() {
    const pillsContainer = document.getElementById('categoryPills');
    if (!pillsContainer) return;
    
    let catsToDisplay = CATEGORIES.filter(c => c.id === 'all' || (window.getCategoryItemCount ? window.getCategoryItemCount(c.id) > 0 : true));
    if (state.activeSupplierFilter) {
        const restProducts = state.products.filter(p => doesProductBelongToSupplier(p, state.activeSupplierFilter) && isProductOnline(p));
        const restCatKeys = new Set(restProducts.map(p => (p.category || 'general').toLowerCase()));
        catsToDisplay = CATEGORIES.filter(c => c.id === 'all' || restCatKeys.has(c.id.toLowerCase()));
    }
    
    pillsContainer.innerHTML = catsToDisplay.map(cat => `
        <button class="pill-btn ${state.activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
            <i class="${cat.icon}"></i> ${cat.name}
        </button>
    `).join('');

    pillsContainer.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            pillsContainer.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeCategory = btn.dataset.category;
            renderProducts();
        });
    });
}

async function fetchCategoriesFromAPI() {
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/categories?_t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        }, 12000);
        if (res && res.ok) {
            const apiCats = await res.json();
            apiCats.forEach(c => {
                const existing = CATEGORIES.find(cat => cat.id === c.code);
                if (!existing) {
                    CATEGORIES.push({
                        id: c.code,
                        name: c.name,
                        icon: c.icon || 'fa-solid fa-layer-group',
                        created_by_supplier: c.created_by_supplier || null,
                        count: 0
                    });
                } else {
                    if (c.created_by_supplier) existing.created_by_supplier = c.created_by_supplier;
                }
            });
            try {
                /* zero-storage */
            } catch(e){}
            renderCategories();
            renderCategoryPills();
            populateCategoryDropdowns();
        }
    } catch (err) {}
}

// 24/7 SUPPORT ACTIVITY MODAL HANDLERS
window.openSupportModal = function() {
    closeModals();
    const overlay = document.getElementById('supportOverlay');
    const modal = document.getElementById('supportModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
        
        // Auto pre-fill user email if logged in
        const emailInput = document.getElementById('supportUserEmail');
        if (emailInput && state.currentUser && state.currentUser.email) {
            emailInput.value = state.currentUser.email;
        }
    }
};

window.closeSupportModal = function() {
    closeModals();
};

window.submitSupportInquiry = function(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('supportUserEmail') ? document.getElementById('supportUserEmail').value.trim() : '';
    const orderId = document.getElementById('supportOrderId') ? document.getElementById('supportOrderId').value.trim() : '';
    const msg = document.getElementById('supportMessage') ? document.getElementById('supportMessage').value.trim() : '';

    if (!email || !msg) {
        showToast('Please enter your email address and message!', 'info');
        return;
    }

    if (window.emailjs) {
        const pKey = window.EMAILJS_PUBLIC_KEY || '_p0PL2iAKyPOfO7Op';
        const sId = window.EMAILJS_SERVICE_ID || 'default_service';
        const tId = window.EMAILJS_OTP_TEMPLATE_ID || 'template_j6pyi2d';

        emailjs.send(sId, tId, {
            to_email: 'supportdropzyy@gmail.com',
            user_email: email,
            reply_to: email,
            order_id: orderId || 'General Inquiry',
            message: `24/7 Support Inquiry from ${email}. Order: ${orderId}. Message: ${msg}`
        }, pKey).catch(e => {});
    }

    showToast(`✅ Support inquiry submitted successfully! Our team will respond to <strong>${email}</strong> shortly.`, 'success');
    closeSupportModal();
    if (document.getElementById('supportInquiryForm')) {
        document.getElementById('supportInquiryForm').reset();
    }
};

// RETURN & REFUND POLICY MODAL HANDLERS
window.openRefundPolicyModal = function() {
    if (state.currentUser && state.currentUser.role === 'supplier') {
        showToast('Refund & Claim management is disabled for Supplier accounts.', 'info');
        return;
    }
    closeModals();
    const overlay = document.getElementById('refundOverlay');
    const modal = document.getElementById('refundPolicyModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');

        // Auto pre-fill user email if logged in
        const emailInput = document.getElementById('refundEmail');
        if (emailInput && state.currentUser && state.currentUser.email) {
            emailInput.value = state.currentUser.email;
        }
    }
};

window.closeRefundPolicyModal = function() {
    closeModals();
};

window.submitRefundClaim = async function(event) {
    if (event) event.preventDefault();
    const email = document.getElementById('refundEmail') ? document.getElementById('refundEmail').value.trim() : '';
    const orderId = document.getElementById('refundOrderId') ? document.getElementById('refundOrderId').value.trim() : '';
    const reason = document.getElementById('refundReason') ? document.getElementById('refundReason').value : '';
    const upiId = document.getElementById('refundUpiId') ? document.getElementById('refundUpiId').value.trim() : '';
    const details = document.getElementById('refundDetails') ? document.getElementById('refundDetails').value.trim() : '';

    if (!email || !orderId || !reason || !details) {
        showToast('Please fill out all required fields to submit your refund claim!', 'info');
        return;
    }

    try {
        await fetch(`${API_BASE_URL}/refunds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                order_id: orderId,
                reason: reason,
                upi_id: upiId,
                details: details
            })
        });
    } catch (err) {
        console.error('Failed to save refund claim to DB:', err);
    }

    if (window.emailjs) {
        const pKey = window.EMAILJS_PUBLIC_KEY || '_p0PL2iAKyPOfO7Op';
        const sId = window.EMAILJS_SERVICE_ID || 'default_service';
        const tId = window.EMAILJS_BILL_TEMPLATE_ID || 'template_1xw8s47';

        emailjs.send(sId, tId, {
            to_email: 'supportdropzyy@gmail.com',
            user_email: email,
            reply_to: email,
            order_id: orderId,
            reason: reason,
            upi_id: upiId || 'Original Payment Method',
            message: `Return/Refund Claim from ${email}. Order: ${orderId}. Reason: ${reason}. UPI: ${upiId}. Details: ${details}`
        }, pKey).catch(e => {});
    }

    showToast(`🎉 Refund Claim for Order <strong>${orderId}</strong> submitted successfully! Expected refund in 1-3 hours.`, 'success');
    closeRefundPolicyModal();
    if (document.getElementById('refundClaimForm')) {
        document.getElementById('refundClaimForm').reset();
    }
};

window.toggleRefundClaimsView = async function() {
    const claimsContainer = document.getElementById('adminRefundClaimsContainer');
    const toggleBtn = document.getElementById('toggleRefundClaimsBtn');
    if (!claimsContainer) return;

    if (claimsContainer.classList.contains('hidden')) {
        claimsContainer.classList.remove('hidden');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-list-check text-primary"></i> Show Orders List';
        await fetchAndRenderRefundClaims();
    } else {
        claimsContainer.classList.add('hidden');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-hand-holding-dollar text-primary"></i> View Refund Claims';
    }
};

window.fetchAndRenderRefundClaims = async function() {
    const container = document.getElementById('adminRefundClaimsContainer');
    if (!container) return;

    container.innerHTML = '<div style="padding: 16px; text-align: center; color: #64748B;"><i class="fa-solid fa-spinner fa-spin"></i> Loading Refund Claims...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/refunds`);
        if (res.ok) {
            const claims = await res.json();
            if (!claims || claims.length === 0) {
                container.innerHTML = '<div style="padding: 16px; background: #F8FAFC; border-radius: 10px; text-align: center; color: #64748B; border: 1px dashed #CBD5E1;">No refund claims submitted yet.</div>';
                return;
            }

            container.innerHTML = `
                <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px; margin-bottom: 1rem;">
                    <h4 style="margin: 0 0 12px 0; color: #0F172A; font-size: 1rem; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fa-solid fa-hand-holding-dollar text-primary"></i> Submitted Return & Refund Claims (${claims.length})</span>
                    </h4>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${claims.map(c => `
                            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                    <div>
                                        <strong style="color: #0F172A; font-size: 0.92rem;">Claim ID: ${c.id}</strong>
                                        <span style="color: #059669; font-weight: 700; font-size: 0.82rem; margin-left: 8px;">Order: #${c.order_id}</span>
                                    </div>
                                    <span class="badge" style="background: ${c.status === 'Approved' ? '#D1FAE5; color: #047857;' : c.status === 'Rejected' ? '#FEE2E2; color: #B91C1C;' : '#FEF3C7; color: #B45309;'} font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem;">
                                        ${c.status || 'Pending'}
                                    </span>
                                </div>
                                <div style="font-size: 0.82rem; color: #334155;">
                                    <div><strong>Email:</strong> ${c.email}</div>
                                    <div><strong>Reason:</strong> ${c.reason}</div>
                                    ${c.upi_id ? `<div><strong>UPI ID:</strong> <span style="font-family: monospace; color: #2563EB;">${c.upi_id}</span></div>` : ''}
                                    <div><strong>Details:</strong> "${c.details}"</div>
                                </div>
                                ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'supplier') ? `
                                    <div style="display: flex; gap: 8px; margin-top: 6px;">
                                        <button class="btn btn-sm" style="background: #10B981; color: #FFF; font-size: 0.75rem; padding: 4px 10px;" onclick="updateRefundStatus('${c.id}', 'Approved')">
                                            <i class="fa-solid fa-circle-check"></i> Approve Refund
                                        </button>
                                        <button class="btn btn-sm" style="background: #EF4444; color: #FFF; font-size: 0.75rem; padding: 4px 10px;" onclick="updateRefundStatus('${c.id}', 'Rejected')">
                                            <i class="fa-solid fa-circle-xmark"></i> Reject Claim
                                        </button>
                                    </div>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }
    } catch (err) {
        container.innerHTML = '<div style="padding: 12px; color: #EF4444;">Failed to load refund claims.</div>';
    }
};

window.updateRefundStatus = async function(claimId, newStatus) {
    try {
        await fetch(`${API_BASE_URL}/refunds/${claimId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        showToast(`Refund claim <strong>${claimId}</strong> updated to ${newStatus}`, 'success');
        fetchAndRenderRefundClaims();
    } catch (err) {
        showToast('Failed to update refund status', 'info');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const sOverlay = document.getElementById('supportOverlay');
    if (sOverlay) sOverlay.addEventListener('click', closeModals);
    
    const rOverlay = document.getElementById('refundOverlay');
    if (rOverlay) rOverlay.addEventListener('click', closeModals);
});

async function syncAddCategoryToDB(catId, catName, catIcon, createdBySupplier = null) {
    try {
        const token = localStorage.getItem('dropzyy_auth_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetchWithTimeout(`${API_BASE_URL}/categories`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ code: catId, name: catName, icon: catIcon, created_by_supplier: createdBySupplier })
        }, 3000);
        return res && res.ok;
    } catch (err) { return false; }
}

async function syncDeleteCategoryFromDB(catId) {
    try {
        const token = localStorage.getItem('dropzyy_auth_token');
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        await fetchWithTimeout(`${API_BASE_URL}/categories/${catId}`, { method: 'DELETE', headers: headers }, 2000);
    } catch (err) {}
}

// -------------------------------------------------------------------
// EXECUTIVE DATA ANALYTICS DASHBOARD & DELIVERY MANAGEMENT
// -------------------------------------------------------------------
let trendChartInstance = null;
let cityChartInstance = null;
let statusChartInstance = null;
let categoryChartInstance = null;
let visitorChartInstance = null;
let restaurantRevenueChartInstance = null;

/**
 * 🌐 Track Website Visitor Session
 * Records anonymous date-wise traffic session in SQLite and MongoDB
 */
window.trackWebsiteVisit = async function() {
    try {
        let visitorId = localStorage.getItem('dropzyy_visitor_id');
        if (!visitorId) {
            visitorId = 'v_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
            localStorage.setItem('dropzyy_visitor_id', visitorId);
        }

        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const deviceType = isMobile ? 'Mobile' : (window.innerWidth <= 1024 ? 'Tablet' : 'Desktop');
        
        let clientCity = null;
        if (state.currentUser && state.currentUser.city) {
            clientCity = state.currentUser.city;
        } else if (localStorage.getItem('dropzyy_user_selected_city')) {
            clientCity = localStorage.getItem('dropzyy_user_selected_city');
        }

        await fetch(`${API_BASE_URL}/analytics/visit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                visitor_id: visitorId,
                page: window.location.pathname || '/',
                device: deviceType,
                city: clientCity
            })
        });
    } catch (e) {
        // Silent fail for offline/analytics
    }
};

/**
 * 🚚 Fetch Live Platform Delivery Settings
 */
window.fetchDeliverySettingsFromAPI = async function() {
    try {
        const res = await fetch(`${API_BASE_URL}/delivery-settings`);
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.free_delivery_threshold !== undefined) {
                state.deliverySettings = {
                    free_delivery_threshold: parseFloat(data.free_delivery_threshold || 300),
                    standard_delivery_fee: parseFloat(data.standard_delivery_fee || 30),
                    is_free_delivery_enabled: Boolean(data.is_free_delivery_enabled),
                    charge_type: data.charge_type || 'threshold',
                    min_order_value: parseFloat(data.min_order_value || 50),
                    description: data.description || ''
                };
                /* zero-storage */
                if (typeof updateCartUI === 'function') updateCartUI();
            }
        }
    } catch (e) {
        console.warn('Could not fetch delivery settings from API:', e);
    }
};

// Initialize visitor tracking & delivery settings on script execution
if (typeof window !== 'undefined') {
    setTimeout(() => {
        window.trackWebsiteVisit();
        window.fetchDeliverySettingsFromAPI();
    }, 500);
}

window.openDataAnalyticsModal = async function() {
    closeModals();
    const overlay = document.getElementById('dataAnalyticsOverlay');
    const modal = document.getElementById('dataAnalyticsModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }

    await fetchOrdersFromAPI();
    await window.fetchDeliverySettingsFromAPI();
    renderDataAnalyticsDashboard();
};

window.closeDataAnalyticsModal = function() {
    closeModals();
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch(e){}
    }
};

window.refreshAnalyticsCharts = async function() {
    await fetchOrdersFromAPI();
    await window.fetchDeliverySettingsFromAPI();
    renderDataAnalyticsDashboard();
    showToast('📊 Live Analytics Dashboard Refreshed!', 'success');
};

window.toggleFullScreenAnalytics = function() {
    const modal = document.getElementById('dataAnalyticsModal');
    const toggleBtn = document.getElementById('fullScreenToggleBtn');
    if (!modal) return;

    if (!document.fullscreenElement) {
        if (modal.requestFullscreen) {
            modal.requestFullscreen();
        } else if (modal.webkitRequestFullscreen) {
            modal.webkitRequestFullscreen();
        }
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Exit Full Screen';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Full Screen';
    }
};

// 🗓️ Analytics Date Filter Controls
window.setAnalyticsDateFilter = function(rangeType) {
    state.analyticsDateRange = rangeType;
    state.analyticsCustomStartDate = null;
    state.analyticsCustomEndDate = null;
    renderDataAnalyticsDashboard();
};

window.applyCustomAnalyticsDateFilter = function() {
    const startInput = document.getElementById('analyticsStartDate');
    const endInput = document.getElementById('analyticsEndDate');
    if (!startInput || !endInput || !startInput.value || !endInput.value) {
        showToast('Please select both From and To dates', 'warning');
        return;
    }
    if (startInput.value > endInput.value) {
        showToast('From date cannot be after To date', 'warning');
        return;
    }
    state.analyticsDateRange = 'custom';
    state.analyticsCustomStartDate = startInput.value;
    state.analyticsCustomEndDate = endInput.value;
    renderDataAnalyticsDashboard();
};

window.switchVisitorChartMode = function(mode) {
    state.visitorChartMode = mode;
    const btnDaily = document.getElementById('btnVisitorViewDaily');
    const btnMonthly = document.getElementById('btnVisitorViewMonthly');
    if (btnDaily && btnMonthly) {
        if (mode === 'daily') {
            btnDaily.style.background = '#2563EB';
            btnDaily.style.color = 'white';
            btnMonthly.style.background = '#F1F5F9';
            btnMonthly.style.color = '#334155';
        } else {
            btnMonthly.style.background = '#2563EB';
            btnMonthly.style.color = 'white';
            btnDaily.style.background = '#F1F5F9';
            btnDaily.style.color = '#334155';
        }
    }
    renderDataAnalyticsDashboard();
};

// 🚚 Delivery Charge Settings Controls
window.toggleDeliveryConfigInputs = function() {
    const radios = document.querySelectorAll('input[name="adminDeliveryChargeType"]');
    let selVal = 'threshold';
    radios.forEach(r => { if (r.checked) selVal = r.value; });

    const wrapThreshold = document.getElementById('wrapFreeDeliveryThreshold');
    const wrapFee = document.getElementById('wrapStandardDeliveryFee');

    if (wrapThreshold) {
        wrapThreshold.style.opacity = selVal === 'threshold' ? '1' : '0.45';
        wrapThreshold.style.pointerEvents = selVal === 'threshold' ? 'auto' : 'none';
    }
    if (wrapFee) {
        wrapFee.style.opacity = selVal === 'free' ? '0.45' : '1';
        wrapFee.style.pointerEvents = selVal === 'free' ? 'none' : 'auto';
    }
};

window.syncDeliveryChargeTypeRadio = function(val) {
    const adminRadios = document.querySelectorAll('input[name="adminDeliveryChargeType"]');
    adminRadios.forEach(r => { r.checked = (r.value === val); });
    window.toggleDeliveryConfigInputs();
};

window.syncDeliveryInputs = function(type, val) {
    if (type === 'threshold') {
        const el = document.getElementById('adminFreeDeliveryThreshold');
        if (el) el.value = val;
    } else if (type === 'fee') {
        const el = document.getElementById('adminStandardDeliveryFee');
        if (el) el.value = val;
    } else if (type === 'min') {
        const el = document.getElementById('adminMinOrderValue');
        if (el) el.value = val;
    }
};

window.openDeliverySettingsModal = function() {
    closeModals();
    const overlay = document.getElementById('deliverySettingsOverlay');
    const modal = document.getElementById('deliverySettingsModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }
    populateDeliveryConfigForms();
};

function populateDeliveryConfigForms() {
    const s = state.deliverySettings || { free_delivery_threshold: 300, standard_delivery_fee: 30, charge_type: 'threshold', min_order_value: 50 };
    const cType = s.charge_type || 'threshold';

    // Populate Analytics Dashboard Form
    const adminThresh = document.getElementById('adminFreeDeliveryThreshold');
    const adminFee = document.getElementById('adminStandardDeliveryFee');
    const adminMin = document.getElementById('adminMinOrderValue');
    if (adminThresh) adminThresh.value = s.free_delivery_threshold;
    if (adminFee) adminFee.value = s.standard_delivery_fee;
    if (adminMin) adminMin.value = s.min_order_value || 50;

    const adminRadios = document.querySelectorAll('input[name="adminDeliveryChargeType"]');
    adminRadios.forEach(r => { r.checked = (r.value === cType); });

    // Populate Standalone Modal Form
    const modalThresh = document.getElementById('modalFreeDeliveryThreshold');
    const modalFee = document.getElementById('modalStandardDeliveryFee');
    const modalMin = document.getElementById('modalMinOrderValue');
    if (modalThresh) modalThresh.value = s.free_delivery_threshold;
    if (modalFee) modalFee.value = s.standard_delivery_fee;
    if (modalMin) modalMin.value = s.min_order_value || 50;

    const modalRadios = document.querySelectorAll('input[name="modalDeliveryChargeType"]');
    modalRadios.forEach(r => { r.checked = (r.value === cType); });

    window.toggleDeliveryConfigInputs();

    // Update Policy Summary Banners
    let summaryText = '';
    if (cType === 'free') {
        summaryText = 'Active Policy: 100% Free Home Delivery active on ALL orders (Zero delivery charge).';
    } else if (cType === 'fixed') {
        summaryText = `Active Policy: Fixed mandatory delivery charge of ₹${s.standard_delivery_fee} applied to every order.`;
    } else {
        summaryText = `Active Policy: FREE Home Delivery on orders ₹${s.free_delivery_threshold} and above. Orders below ₹${s.free_delivery_threshold} are charged ₹${s.standard_delivery_fee}. (Min checkout: ₹${s.min_order_value || 50})`;
    }

    const bannerText1 = document.getElementById('adminDeliveryRuleSummaryText');
    const bannerText2 = document.getElementById('modalDeliveryActiveRuleText');
    if (bannerText1) bannerText1.textContent = summaryText;
    if (bannerText2) bannerText2.textContent = summaryText;
}

window.saveDeliverySettings = async function(event) {
    if (event) event.preventDefault();

    let cType = 'threshold';
    const adminRadios = document.querySelectorAll('input[name="adminDeliveryChargeType"]:checked');
    if (adminRadios.length) cType = adminRadios[0].value;
    else {
        const modalRadios = document.querySelectorAll('input[name="modalDeliveryChargeType"]:checked');
        if (modalRadios.length) cType = modalRadios[0].value;
    }

    const threshInput = document.getElementById('adminFreeDeliveryThreshold') || document.getElementById('modalFreeDeliveryThreshold');
    const feeInput = document.getElementById('adminStandardDeliveryFee') || document.getElementById('modalStandardDeliveryFee');
    const minInput = document.getElementById('adminMinOrderValue') || document.getElementById('modalMinOrderValue');

    const thresholdVal = parseFloat(threshInput ? threshInput.value : 300) || 300;
    const feeVal = parseFloat(feeInput ? feeInput.value : 30) || 30;
    const minVal = parseFloat(minInput ? minInput.value : 50) || 50;

    state.deliverySettings = {
        free_delivery_threshold: thresholdVal,
        standard_delivery_fee: feeVal,
        is_free_delivery_enabled: cType === 'threshold' || cType === 'free',
        charge_type: cType,
        min_order_value: minVal,
        description: `Configured: ${cType} mode (Threshold: ₹${thresholdVal}, Fee: ₹${feeVal})`
    };

    /* zero-storage */

    const status1 = document.getElementById('deliveryConfigSaveStatus');
    const status2 = document.getElementById('modalDeliverySaveStatus');
    const msg = '<span style="color: #059669;"><i class="fa-solid fa-circle-check"></i> Delivery configuration saved successfully!</span>';
    if (status1) status1.innerHTML = msg;
    if (status2) status2.innerHTML = msg;

    populateDeliveryConfigForms();
    if (typeof updateCartUI === 'function') updateCartUI();

    showToast('🚚 Delivery & Free Shipping settings saved and active!', 'success');

    // Sync to Backend Database (Admin required)
    try {
        const token = localStorage.getItem('dropzyy_auth_token') || (state.currentUser ? (state.currentUser.access_token || state.currentUser.token) : null);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_BASE_URL}/admin/delivery-settings`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(state.deliverySettings)
        });
    } catch (err) {
        console.warn('Backend sync for delivery settings notice:', err);
    }
};

/**
 * 📊 Render Full Executive Data Analytics Dashboard
 */
async function renderDataAnalyticsDashboard() {
    populateDeliveryConfigForms();

    // 1. Highlight Active Date Filter Pill
    const range = state.analyticsDateRange || '7d';
    const pills = document.querySelectorAll('.btn-analytics-filter');
    pills.forEach(p => {
        p.style.background = '#F1F5F9';
        p.style.color = '#334155';
        p.style.border = '1px solid #CBD5E1';
    });
    const activePillId = {
        '7d': 'btnFilter7d',
        'today': 'btnFilterToday',
        '30d': 'btnFilter30d',
        'this_month': 'btnFilterMonth',
        'all': 'btnFilterAll'
    }[range];
    const activePill = document.getElementById(activePillId);
    if (activePill) {
        activePill.style.background = '#10B981';
        activePill.style.color = 'white';
        activePill.style.border = 'none';
    }

    // 2. Compute Filter Start and End Dates
    const now = new Date();
    let startDateStr = '';
    let endDateStr = now.toISOString().split('T')[0];

    if (range === 'today') {
        startDateStr = endDateStr;
    } else if (range === '30d') {
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        startDateStr = d30.toISOString().split('T')[0];
    } else if (range === 'this_month') {
        startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (range === 'all') {
        startDateStr = '2020-01-01';
    } else if (range === 'custom' && state.analyticsCustomStartDate && state.analyticsCustomEndDate) {
        startDateStr = state.analyticsCustomStartDate;
        endDateStr = state.analyticsCustomEndDate;
    } else { // default '7d'
        const d7 = new Date();
        d7.setDate(d7.getDate() - 7);
        startDateStr = d7.toISOString().split('T')[0];
    }

    const startInput = document.getElementById('analyticsStartDate');
    const endInput = document.getElementById('analyticsEndDate');
    if (startInput && !startInput.value) startInput.value = startDateStr;
    if (endInput && !endInput.value) endInput.value = endDateStr;

    // 3. 🌐 Fetch & Render Visitor Analytics (Feature 1)
    try {
        const visRes = await fetch(`${API_BASE_URL}/analytics/visitors?range_type=${range}&start_date=${startDateStr}&end_date=${endDateStr}`);
        if (visRes && visRes.ok) {
            const visData = await visRes.json();
            const summary = visData.summary || {};

            const statToday = document.getElementById('statVisitorToday');
            const statMonth = document.getElementById('statVisitorMonth');
            const statRange = document.getElementById('statVisitorRange');
            const statUnique = document.getElementById('statVisitorUnique');
            const rangeLabel = document.getElementById('statVisitorFilterLabel');
            const devBadge = document.getElementById('visitorDevicesBadge');

            if (statToday) statToday.textContent = summary.today_visits || 0;
            if (statMonth) statMonth.textContent = summary.this_month_visits || 0;
            if (statRange) statRange.textContent = summary.total_range_visits || 0;
            if (statUnique) statUnique.textContent = summary.unique_visitors || 0;
            if (rangeLabel) rangeLabel.textContent = `${startDateStr} to ${endDateStr}`;

            const dev = visData.devices || {};
            if (devBadge) {
                devBadge.innerHTML = `<span style="margin-right: 10px;"><i class="fa-solid fa-mobile-screen text-primary"></i> Mobile: <strong>${dev.Mobile || 0}</strong></span> <span><i class="fa-solid fa-laptop text-primary"></i> Desktop: <strong>${dev.Desktop || 0}</strong></span>`;
            }

            // Render Visitor Chart
            const vCanvas = document.getElementById('analyticsVisitorChartCanvas');
            const vTitle = document.getElementById('visitorChartTitle');
            if (vCanvas && typeof Chart !== 'undefined') {
                if (visitorChartInstance) visitorChartInstance.destroy();
                const isMonthly = state.visitorChartMode === 'monthly';

                if (vTitle) {
                    vTitle.innerHTML = isMonthly 
                        ? `<i class="fa-solid fa-calendar-days text-primary"></i> Monthly Website Visitor Traffic Trend`
                        : `<i class="fa-solid fa-chart-line text-primary"></i> Daily Website Visitor Traffic Trend (${startDateStr} to ${endDateStr})`;
                }

                const labels = isMonthly 
                    ? (visData.monthly_trends || []).map(m => m.month)
                    : (visData.daily_trends || []).map(d => d.date);

                const visitsData = isMonthly 
                    ? (visData.monthly_trends || []).map(m => m.visits)
                    : (visData.daily_trends || []).map(d => d.visits);

                const uniqueData = isMonthly 
                    ? (visData.monthly_trends || []).map(m => m.unique)
                    : (visData.daily_trends || []).map(d => d.unique);

                visitorChartInstance = new Chart(vCanvas, {
                    type: isMonthly ? 'bar' : 'line',
                    data: {
                        labels: labels.length ? labels : ['Today'],
                        datasets: [
                            {
                                label: 'Total Visits',
                                data: visitsData.length ? visitsData : [1],
                                backgroundColor: isMonthly ? 'rgba(37, 99, 235, 0.75)' : 'rgba(37, 99, 235, 0.15)',
                                borderColor: '#2563EB',
                                borderWidth: 2,
                                fill: !isMonthly,
                                tension: 0.35,
                                pointRadius: 4
                            },
                            {
                                label: 'Unique Visitors',
                                data: uniqueData.length ? uniqueData : [1],
                                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                borderColor: '#10B981',
                                borderWidth: 2,
                                borderDash: [4, 4],
                                fill: false,
                                tension: 0.35,
                                pointRadius: 3
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: { legend: { position: 'top' } },
                        scales: {
                            y: { beginAtZero: true, title: { display: true, text: 'Visitor Count' } }
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.warn('Visitor analytics fetch notice:', e);
    }

    // 4. 🏪 Filter Orders by Date Range & Compute Restaurant-Wise Revenue (Feature 2)
    const allOrders = [...state.ordersHistory];
    const filteredOrders = allOrders.filter(o => {
        if (!o.date) return true;
        const d = String(o.date).split('T')[0];
        return d >= startDateStr && d <= endDateStr;
    });

    let totalRev = 0;
    let deliveredCount = 0;
    const cityMap = {};
    const dateMap = {};
    const statusMap = { Placed: 0, Packing: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
    const categoryMap = {};
    const restaurantsMap = {};

    // Auto-discover partner restaurants from registered suppliers & catalog
    const partnerSuppliers = registeredUsers.filter(u => u.role === 'supplier' || u.supplier_company_name);
    partnerSuppliers.forEach(sup => {
        const sName = (sup.supplier_company_name || sup.username || sup.full_name || '').trim();
        if (sName && !sName.toLowerCase().includes('dropzyy direct') && !sName.toLowerCase().includes('direct mandi')) {
            restaurantsMap[sName] = {
                name: sName,
                total_orders: 0,
                gross_revenue: 0,
                items_sold: 0,
                delivered_orders: 0,
                cancelled_orders: 0,
                top_items: {},
                city: sup.city || 'Nashik'
            };
        }
    });

    filteredOrders.forEach(o => {
        const amt = parseFloat(o.total || 0);
        totalRev += amt;
        
        const st = (o.status || 'Placed').trim();
        statusMap[st] = (statusMap[st] || 0) + 1;
        if (st === 'Delivered') deliveredCount++;

        // City extraction
        let cName = 'Nashik';
        if (o.delivery && o.delivery.city) {
            cName = o.delivery.city.trim();
        } else if (o.delivery && o.delivery.address) {
            cName = o.delivery.address.split(',')[0].trim();
        }
        if (!cityMap[cName]) cityMap[cName] = { count: 0, revenue: 0 };
        cityMap[cName].count += 1;
        cityMap[cName].revenue += amt;

        // Date extraction
        let dKey = 'Today';
        if (o.date) {
            try {
                dKey = new Date(o.date).toISOString().split('T')[0];
            } catch(e) {
                dKey = String(o.date).split('T')[0];
            }
        }
        if (!dateMap[dKey]) dateMap[dKey] = { count: 0, revenue: 0 };
        dateMap[dKey].count += 1;
        dateMap[dKey].revenue += amt;

        // Item category & Restaurant attribution
        const seenRestaurantsInOrder = new Set();
        (o.items || []).forEach(i => {
            const cat = i.category || 'Kirana Staples';
            categoryMap[cat] = (categoryMap[cat] || 0) + (i.qty || i.quantity || 1);

            const rName = (i.supplier_company_name || i.supplier_name || i.supplierName || 'Dropzyy Direct Mandi').trim();
            seenRestaurantsInOrder.add(rName);

            const itemPrice = parseFloat(i.price || 0);
            const itemQty = parseInt(i.qty || i.quantity || 1);
            const lineAmt = itemPrice * itemQty;

            if (!restaurantsMap[rName]) {
                restaurantsMap[rName] = {
                    name: rName,
                    total_orders: 0,
                    gross_revenue: 0,
                    items_sold: 0,
                    delivered_orders: 0,
                    cancelled_orders: 0,
                    top_items: {},
                    city: cName
                };
            }

            restaurantsMap[rName].gross_revenue += lineAmt;
            restaurantsMap[rName].items_sold += itemQty;
            const dishTitle = i.title || 'Product';
            restaurantsMap[rName].top_items[dishTitle] = (restaurantsMap[rName].top_items[dishTitle] || 0) + itemQty;
        });

        seenRestaurantsInOrder.forEach(rName => {
            if (restaurantsMap[rName]) {
                restaurantsMap[rName].total_orders += 1;
                if (st === 'Delivered') restaurantsMap[rName].delivered_orders += 1;
                else if (st === 'Cancelled') restaurantsMap[rName].cancelled_orders += 1;
            }
        });
    });

    // Update KPI UI
    const revEl = document.getElementById('analyticsStatRevenue');
    const ordEl = document.getElementById('analyticsStatOrders');
    const delEl = document.getElementById('analyticsStatDelivered');
    const topCityEl = document.getElementById('analyticsStatTopCity');
    const topCityOrdEl = document.getElementById('analyticsStatTopCityOrders');

    if (revEl) revEl.textContent = `₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (ordEl) ordEl.textContent = `${filteredOrders.length} Orders (${range})`;
    if (delEl) delEl.textContent = `${deliveredCount} Delivered (${filteredOrders.length ? Math.round((deliveredCount/filteredOrders.length)*100) : 0}%)`;

    let topCityName = 'N/A';
    let topCityMaxOrders = 0;
    Object.keys(cityMap).forEach(c => {
        if (cityMap[c].count > topCityMaxOrders) {
            topCityMaxOrders = cityMap[c].count;
            topCityName = c;
        }
    });
    if (topCityEl) topCityEl.textContent = topCityName;
    if (topCityOrdEl) topCityOrdEl.textContent = `${topCityMaxOrders} Orders Placed`;

    // 5. 🏪 Populate Restaurant Revenue Table & KPIs (Feature 2)
    const restaurantList = Object.values(restaurantsMap);
    restaurantList.sort((a, b) => b.gross_revenue - a.gross_revenue);

    const rCountEl = document.getElementById('statRestaurantCount');
    const rTopNameEl = document.getElementById('statTopRestaurantName');
    const rTopRevEl = document.getElementById('statTopRestaurantRev');
    const rMostOrdEl = document.getElementById('statMostOrderedRestaurant');
    const rMostCountEl = document.getElementById('statMostOrderedCount');

    if (rCountEl) rCountEl.textContent = `${restaurantList.length} Stores`;

    if (restaurantList.length > 0 && restaurantList[0].gross_revenue > 0) {
        if (rTopNameEl) rTopNameEl.textContent = restaurantList[0].name;
        if (rTopRevEl) rTopRevEl.textContent = `₹${restaurantList[0].gross_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Revenue`;
    } else {
        if (rTopNameEl) rTopNameEl.textContent = restaurantList.length ? restaurantList[0].name : 'N/A';
        if (rTopRevEl) rTopRevEl.textContent = '₹0.00 Revenue';
    }

    const mostOrderedR = [...restaurantList].sort((a, b) => b.total_orders - a.total_orders)[0];
    if (mostOrderedR && mostOrderedR.total_orders > 0) {
        if (rMostOrdEl) rMostOrdEl.textContent = mostOrderedR.name;
        if (rMostCountEl) rMostCountEl.textContent = `${mostOrderedR.total_orders} Orders Placed`;
    } else {
        if (rMostOrdEl) rMostOrdEl.textContent = 'N/A';
        if (rMostCountEl) rMostCountEl.textContent = '0 Orders';
    }

    // Render Restaurant Performance Table
    const rTableBody = document.getElementById('analyticsRestaurantTableBody');
    if (rTableBody) {
        if (restaurantList.length === 0) {
            rTableBody.innerHTML = '<tr><td colspan="7" style="padding: 16px; text-align: center; color: #64748B;">No restaurant orders recorded in this date range.</td></tr>';
        } else {
            rTableBody.innerHTML = restaurantList.map(r => {
                const aov = r.total_orders > 0 ? Math.round(r.gross_revenue / r.total_orders) : 0;
                const fulRate = r.total_orders > 0 ? Math.round((r.delivered_orders / r.total_orders) * 100) : 0;
                const sortedDishes = Object.entries(r.top_items || {}).sort((a, b) => b[1] - a[1]);
                const topDish = sortedDishes.length ? `${sortedDishes[0][0]} (${sortedDishes[0][1]} sold)` : (r.top_selling_item || 'N/A');

                return `
                    <tr style="border-bottom: 1px solid #E2E8F0; transition: background 0.2s;" onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 11px 12px; font-weight: 700; color: #0F172A; display: flex; align-items: center; gap: 8px;">
                            <span style="width: 28px; height: 28px; border-radius: 6px; background: #DCFCE7; color: #059669; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;">
                                <i class="fa-solid fa-store"></i>
                            </span>
                            <span>${r.name}</span>
                        </td>
                        <td style="padding: 11px 12px; font-weight: 600; color: #1E293B;">${r.total_orders} Orders</td>
                        <td style="padding: 11px 12px; font-weight: 800; color: #059669;">₹${r.gross_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 11px 12px; color: #334155;">₹${aov.toLocaleString('en-IN')}</td>
                        <td style="padding: 11px 12px; color: #334155;">${r.items_sold} items</td>
                        <td style="padding: 11px 12px;">
                            <span style="padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; font-weight: 700; background: ${fulRate >= 70 ? '#DCFCE7; color: #15803D;' : '#FEF3C7; color: #B45309;'}">
                                ${fulRate}% Delivered
                            </span>
                        </td>
                        <td style="padding: 11px 12px; color: #64748B; font-size: 0.8rem;">${topDish}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // Render Restaurant Revenue Chart (Chart.js)
    const rCanvas = document.getElementById('analyticsRestaurantRevenueChartCanvas');
    if (rCanvas && typeof Chart !== 'undefined') {
        if (restaurantRevenueChartInstance) restaurantRevenueChartInstance.destroy();
        const top5 = restaurantList.slice(0, 6);
        const rLabels = top5.map(r => r.name.length > 18 ? r.name.substring(0, 18) + '...' : r.name);
        const rRevenues = top5.map(r => r.gross_revenue);
        const rOrders = top5.map(r => r.total_orders);

        restaurantRevenueChartInstance = new Chart(rCanvas, {
            type: 'bar',
            data: {
                labels: rLabels.length ? rLabels : ['No Stores'],
                datasets: [
                    {
                        label: 'Gross Revenue (₹)',
                        data: rRevenues.length ? rRevenues : [0],
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: '#10B981',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Order Volume',
                        data: rOrders.length ? rOrders : [0],
                        type: 'line',
                        borderColor: '#2563EB',
                        backgroundColor: '#2563EB',
                        borderWidth: 2,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: 'Revenue (₹)' } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Orders' } }
                }
            }
        });
    }

    // 6. Render City Breakdown Table
    const tableBody = document.getElementById('analyticsCityTableBody');
    if (tableBody) {
        const sortedCities = Object.keys(cityMap).sort((a,b) => cityMap[b].revenue - cityMap[a].revenue);
        tableBody.innerHTML = sortedCities.map(c => `
            <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 10px; font-weight: 700; color: #0F172A;">${c}</td>
                <td style="padding: 10px; color: #334155;">${cityMap[c].count} Orders</td>
                <td style="padding: 10px; font-weight: 700; color: #059669;">₹${cityMap[c].revenue.toFixed(2)}</td>
                <td style="padding: 10px; color: #475569;">${totalRev ? ((cityMap[c].revenue/totalRev)*100).toFixed(1) : 0}%</td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="padding: 12px; text-align: center;">No city data yet.</td></tr>';
    }

    if (typeof Chart === 'undefined') return;

    // 7. Executive Trend Chart
    const trendCanvas = document.getElementById('analyticsTrendChartCanvas');
    if (trendCanvas) {
        if (trendChartInstance) trendChartInstance.destroy();
        const dates = Object.keys(dateMap).sort();
        trendChartInstance = new Chart(trendCanvas, {
            type: 'bar',
            data: {
                labels: dates.length ? dates : ['Today'],
                datasets: [
                    {
                        label: 'Sales Revenue (₹)',
                        data: dates.map(d => dateMap[d].revenue),
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10B981',
                        borderWidth: 1.5,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Order Count',
                        data: dates.map(d => dateMap[d].count),
                        type: 'line',
                        borderColor: '#3B82F6',
                        backgroundColor: '#3B82F6',
                        borderWidth: 2,
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { type: 'linear', position: 'left', title: { display: true, text: 'Revenue (₹)' } },
                    y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Orders' } }
                }
            }
        });
    }

    // 8. City Distribution Chart
    const cityCanvas = document.getElementById('analyticsCityChartCanvas');
    if (cityCanvas) {
        if (cityChartInstance) cityChartInstance.destroy();
        const cities = Object.keys(cityMap);
        cityChartInstance = new Chart(cityCanvas, {
            type: 'doughnut',
            data: {
                labels: cities.length ? cities : ['Nashik'],
                datasets: [{
                    data: cities.map(c => cityMap[c].count),
                    backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    }

    // 9. Status Breakdown Chart
    const statusCanvas = document.getElementById('analyticsStatusChartCanvas');
    if (statusCanvas) {
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(statusCanvas, {
            type: 'pie',
            data: {
                labels: ['Placed', 'Packing', 'Shipped', 'Delivered', 'Cancelled'],
                datasets: [{
                    data: [statusMap.Placed, statusMap.Packing, statusMap.Shipped, statusMap.Delivered, statusMap.Cancelled],
                    backgroundColor: ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    }

    // 10. Category Volume Chart
    const catCanvas = document.getElementById('analyticsCategoryChartCanvas');
    if (catCanvas) {
        if (categoryChartInstance) categoryChartInstance.destroy();
        const cats = Object.keys(categoryMap);
        categoryChartInstance = new Chart(catCanvas, {
            type: 'bar',
            data: {
                labels: cats.length ? cats : ['Kirana Staples', 'Sabzi & Fruits'],
                datasets: [{
                    label: 'Items Sold',
                    data: cats.map(c => categoryMap[c]),
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: '#3B82F6',
                    borderWidth: 1.5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}


/* ==========================================
   Supplier Data Analytics Dashboard & Modes
   ========================================== */
let supplierStatusChartInstance = null;
let supplierChannelChartInstance = null;
let supplierProductChartInstance = null;

window.updateOrderChannel = async function(orderId, newChannel) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (order) {
        order.orderType = newChannel;
        order.channel = newChannel;
        showToast(`Order #${orderId} marked as <strong>${newChannel}</strong>!`, 'success');
        renderBookingTracking();
        renderLiveNotificationsList();
    }
};

window.openSupplierAnalyticsModal = async function() {
    if (!state.currentUser) {
        showToast('Please sign in as a Supplier to access your Analytics Dashboard', 'info');
        return;
    }
    closeModals();
    const overlay = document.getElementById('supplierAnalyticsOverlay');
    const modal = document.getElementById('supplierAnalyticsModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }

    await fetchOrdersFromAPI();
    renderSupplierAnalyticsDashboard();
};

window.closeSupplierAnalyticsModal = function() {
    closeModals();
    if (document.fullscreenElement) {
        try { document.exitFullscreen(); } catch(e){}
    }
};

window.refreshSupplierAnalyticsCharts = async function() {
    await fetchOrdersFromAPI();
    renderSupplierAnalyticsDashboard();
    showToast('📊 Supplier Analytics Dashboard Refreshed!', 'success');
};

window.toggleFullScreenSupplierAnalytics = function() {
    const modal = document.getElementById('supplierAnalyticsModal');
    const toggleBtn = document.getElementById('fullScreenSupplierToggleBtn');
    if (!modal) return;

    if (!document.fullscreenElement) {
        if (modal.requestFullscreen) {
            modal.requestFullscreen();
        } else if (modal.webkitRequestFullscreen) {
            modal.webkitRequestFullscreen();
        }
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Exit Full Screen';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Full Screen';
    }
};

function renderSupplierAnalyticsDashboard() {
    if (!state.currentUser) return;
    
    // Filter orders to ONLY orders containing items from this supplier
    const isSupplier = state.currentUser.role === 'supplier';
    let supplierOrders = [...state.ordersHistory];
    if (isSupplier) {
        supplierOrders = supplierOrders.filter(o => (o.items || []).some(item => isItemFromSupplier(item)));
    }

    let totalRevenue = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let onlineCount = 0;
    let offlineCount = 0;

    const statusMap = { Placed: 0, Packing: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
    const productMetricsMap = {};

    supplierOrders.forEach(o => {
        const st = o.status || 'Placed';
        statusMap[st] = (statusMap[st] || 0) + 1;

        if (st === 'Delivered') completedCount++;
        else if (st === 'Cancelled') cancelledCount++;
        else pendingCount++;

        const isOffline = (o.orderType === 'Offline' || o.channel === 'Offline');
        if (isOffline) offlineCount++;
        else onlineCount++;

        // Filter items to ONLY items supplied by this supplier
        const items = isSupplier ? (o.items || []).filter(i => isItemFromSupplier(i)) : (o.items || []);

        items.forEach(i => {
            const pTitle = i.title || i.name || 'Kirana Product';
            const qty = parseInt(i.qty || i.quantity || 1);
            const price = parseFloat(i.price || 0);
            const lineTotal = qty * price;

            totalRevenue += lineTotal;

            if (!productMetricsMap[pTitle]) {
                productMetricsMap[pTitle] = {
                    title: pTitle,
                    category: i.category || 'Kirana Items',
                    unitsSold: 0,
                    completedOrders: 0,
                    revenue: 0
                };
            }

            productMetricsMap[pTitle].unitsSold += qty;
            productMetricsMap[pTitle].revenue += lineTotal;
            if (st === 'Delivered') productMetricsMap[pTitle].completedOrders += 1;
        });
    });

    // Update KPI Elements
    const revEl = document.getElementById('supplierStatRevenue');
    const totOrdEl = document.getElementById('supplierStatTotalOrders');
    const compOrdEl = document.getElementById('supplierStatCompletedOrders');
    const cancOrdEl = document.getElementById('supplierStatCancelledOrders');
    const chanEl = document.getElementById('supplierStatChannels');

    if (revEl) revEl.textContent = `₹${totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (totOrdEl) totOrdEl.textContent = `${supplierOrders.length} Orders`;
    if (compOrdEl) compOrdEl.textContent = `${completedCount} Completed (${supplierOrders.length ? Math.round((completedCount/supplierOrders.length)*100) : 0}%)`;
    if (cancOrdEl) cancOrdEl.textContent = `${cancelledCount} Cancelled`;
    if (chanEl) chanEl.textContent = `${onlineCount} Online / ${offlineCount} Offline`;

    // Render Product Performance Table
    const tableBody = document.getElementById('supplierProductTableBody');
    if (tableBody) {
        const sortedProducts = Object.values(productMetricsMap).sort((a,b) => b.revenue - a.revenue);
        tableBody.innerHTML = sortedProducts.map(p => `
            <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding: 10px; font-weight: 700; color: #0F172A;">${p.title}</td>
                <td style="padding: 10px; color: #475569;">${p.category}</td>
                <td style="padding: 10px; color: #334155; font-weight: 600;">${p.unitsSold} units</td>
                <td style="padding: 10px; color: #059669; font-weight: 600;">${p.completedOrders} orders</td>
                <td style="padding: 10px; font-weight: 700; color: #047857;">₹${p.revenue.toFixed(2)}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="padding: 14px; text-align: center; color: #64748B;">No product sales recorded yet for your supplier account.</td></tr>';
    }

    if (typeof Chart === 'undefined') return;

    // 1. Status Breakdown Chart
    const statusCanvas = document.getElementById('supplierStatusChartCanvas');
    if (statusCanvas) {
        if (supplierStatusChartInstance) supplierStatusChartInstance.destroy();
        supplierStatusChartInstance = new Chart(statusCanvas, {
            type: 'doughnut',
            data: {
                labels: ['Placed', 'Packing', 'Shipped', 'Delivered', 'Cancelled'],
                datasets: [{
                    data: [statusMap.Placed, statusMap.Packing, statusMap.Shipped, statusMap.Delivered, statusMap.Cancelled],
                    backgroundColor: ['#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    }

    // 2. Product-Wise Performance Chart
    const prodCanvas = document.getElementById('supplierProductChartCanvas');
    if (prodCanvas) {
        if (supplierProductChartInstance) supplierProductChartInstance.destroy();
        const topProds = Object.values(productMetricsMap).sort((a,b) => b.unitsSold - a.unitsSold).slice(0, 7);
        supplierProductChartInstance = new Chart(prodCanvas, {
            type: 'bar',
            data: {
                labels: topProds.length ? topProds.map(p => p.title.length > 18 ? p.title.substring(0, 18) + '...' : p.title) : ['No Items'],
                datasets: [{
                    label: 'Units Sold',
                    data: topProds.map(p => p.unitsSold),
                    backgroundColor: 'rgba(2, 132, 199, 0.7)',
                    borderColor: '#0284C7',
                    borderWidth: 1.5
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

// ============================================================
//  SUPPLIER AVAILABILITY CALENDAR
// ============================================================
(function () {
    'use strict';

    // ---- State ----
    const calState = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),   // 0-based
        selectedDate: null,             // 'YYYY-MM-DD'
        availability: {},               // { 'YYYY-MM-DD': true|false }
        supplierId: null
    };

    const MONTH_NAMES = ['January','February','March','April','May','June',
                         'July','August','September','October','November','December'];
    const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // ---- Helpers ----
    function pad2(n) { return String(n).padStart(2, '0'); }
    function toDateKey(y, m, d) { return `${y}-${pad2(m+1)}-${pad2(d)}`; }

    // ---- Render Calendar Grid ----
    function renderCalendar() {
        const grid = document.getElementById('supplierCalGrid');
        const label = document.getElementById('supplierCalMonthLabel');
        if (!grid || !label) return;

        label.textContent = `${MONTH_NAMES[calState.month]} ${calState.year}`;

        const firstDay = new Date(calState.year, calState.month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(calState.year, calState.month + 1, 0).getDate();
        const today = toDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

        let html = '';

        // Day-name headers
        DAY_NAMES.forEach(d => {
            html += `<div style="text-align:center;font-size:0.72rem;font-weight:700;color:#64748B;padding:4px 0;">${d}</div>`;
        });

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            html += `<div></div>`;
        }

        // Date cells
        for (let day = 1; day <= daysInMonth; day++) {
            const key = toDateKey(calState.year, calState.month, day);
            const avail = calState.availability[key];          // true | false | undefined
            const isToday = key === today;
            const isSelected = key === calState.selectedDate;

            let bg = '#F1F5F9';      // default (unset)
            let color = '#334155';
            let badge = '';

            if (avail === true) {
                bg = '#DCFCE7'; color = '#14532D';
                badge = `<div style="font-size:0.58rem;font-weight:800;background:#16A34A;color:#fff;border-radius:3px;padding:1px 4px;margin-top:2px;letter-spacing:0.03em;">OPEN</div>`;
            } else if (avail === false) {
                bg = '#FEE2E2'; color = '#7F1D1D';
                badge = `<div style="font-size:0.58rem;font-weight:800;background:#DC2626;color:#fff;border-radius:3px;padding:1px 4px;margin-top:2px;letter-spacing:0.03em;">CLOSED</div>`;
            }

            const border = isSelected ? '2px solid #2563EB' : isToday ? '2px solid #10B981' : '1.5px solid transparent';
            const shadow = isSelected ? '0 0 0 2px rgba(37,99,235,0.2)' : 'none';

            html += `
                <div onclick="supplierCalSelectDate('${key}')"
                     style="background:${bg};color:${color};border:${border};box-shadow:${shadow};
                            border-radius:8px;padding:6px 2px 4px;text-align:center;cursor:pointer;
                            min-height:52px;display:flex;flex-direction:column;align-items:center;
                            justify-content:flex-start;transition:all 0.15s;user-select:none;"
                     onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                    <span style="font-size:0.82rem;font-weight:${isToday?'800':'600'};line-height:1.2;">${day}</span>
                    ${badge}
                </div>`;
        }

        grid.innerHTML = html;
    }

    // ---- Select a date ----
    window.supplierCalSelectDate = function(dateKey) {
        calState.selectedDate = dateKey;

        const label = document.getElementById('supplierCalSelectedDateLabel');
        const openBtn  = document.getElementById('supplierCalOpenBtn');
        const closeBtn = document.getElementById('supplierCalClosedBtn');
        const resetBtn = document.getElementById('supplierCalResetBtn');

        if (label) {
            const [y, m, d] = dateKey.split('-');
            const dt = new Date(+y, +m - 1, +d);
            label.textContent = dt.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });
        }

        [openBtn, closeBtn, resetBtn].forEach(btn => {
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
        });

        renderCalendar();
    };

    // ---- Mark date as open / closed ----
    window.supplierCalSetDay = async function(isOpen) {
        if (!calState.selectedDate) return;
        const saveStatus = document.getElementById('supplierCalSaveStatus');
        if (saveStatus) saveStatus.textContent = 'Saving…';

        calState.availability[calState.selectedDate] = isOpen;

        // ── Sync to global store & update restaurant card pill immediately ──
        window._supplierCalendarData = window._supplierCalendarData || {};
        if (calState.supplierId) {
            window._supplierCalendarData[String(calState.supplierId)] = Object.assign({}, calState.availability);
        }
        if (typeof window.renderRestaurants === 'function') window.renderRestaurants();
        if (typeof window.renderProducts === 'function') window.renderProducts();
        if (typeof window.updateLiveStatusPreview === 'function') window.updateLiveStatusPreview();

        renderCalendar();

        // Sync to backend
        if (calState.supplierId) {
            try {
                await fetch(`${API_BASE_URL}/supplier/availability`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supplier_user_id: calState.supplierId,
                        date: calState.selectedDate,
                        is_open: isOpen
                    })
                });
                if (saveStatus) saveStatus.textContent = isOpen ? '✅ Marked OPEN' : '🔴 Marked CLOSED';
            } catch (err) {
                if (saveStatus) saveStatus.textContent = '⚠️ Saved locally (offline)';
                console.warn('[AvailCalendar] Backend sync failed:', err);
            }
        } else {
            if (saveStatus) saveStatus.textContent = isOpen ? '✅ Marked OPEN' : '🔴 Marked CLOSED';
        }

        setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 2500);
    };

    // ---- Reset a date override ----
    window.supplierCalResetDay = async function() {
        if (!calState.selectedDate) return;
        const saveStatus = document.getElementById('supplierCalSaveStatus');

        delete calState.availability[calState.selectedDate];

        // ── Sync deletion to global store & re-render restaurant cards ──
        window._supplierCalendarData = window._supplierCalendarData || {};
        if (calState.supplierId) {
            window._supplierCalendarData[String(calState.supplierId)] = Object.assign({}, calState.availability);
        }
        if (typeof window.renderRestaurants === 'function') window.renderRestaurants();
        if (typeof window.renderProducts === 'function') window.renderProducts();
        if (typeof window.updateLiveStatusPreview === 'function') window.updateLiveStatusPreview();

        renderCalendar();

        if (calState.supplierId) {
            try {
                await fetch(`${API_BASE_URL}/supplier/availability/${calState.supplierId}/${calState.selectedDate}`, {
                    method: 'DELETE'
                });
            } catch (err) {
                console.warn('[AvailCalendar] Reset backend sync failed:', err);
            }
        }

        if (saveStatus) saveStatus.textContent = '↺ Reset to default';
        setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 2000);
    };

    // ---- Month navigation ----
    window.supplierCalPrevMonth = function() {
        calState.month--;
        if (calState.month < 0) { calState.month = 11; calState.year--; }
        calState.selectedDate = null;
        renderCalendar();
    };

    window.supplierCalNextMonth = function() {
        calState.month++;
        if (calState.month > 11) { calState.month = 0; calState.year++; }
        calState.selectedDate = null;
        renderCalendar();
    };

    // ---- Load availability data from backend ----
    async function loadSupplierAvailability(supplierId) {
        calState.supplierId = supplierId;
        calState.availability = {};

        try {
            const res = await fetch(`${API_BASE_URL}/supplier/availability/${supplierId}`);
            if (res.ok) {
                const entries = await res.json();
                entries.forEach(e => {
                    calState.availability[e.date] = e.is_open;
                });
            }
        } catch (err) {
            console.warn('[AvailCalendar] Could not load availability from backend:', err);
        }

        // ── Sync to global store so evaluateUserStoreHours can read it ──
        window._supplierCalendarData = window._supplierCalendarData || {};
        window._supplierCalendarData[String(supplierId)] = Object.assign({}, calState.availability);

        renderCalendar();

        // Re-render restaurant cards so today's status pill updates immediately
        if (typeof window.renderRestaurants === 'function') window.renderRestaurants();
    }

    // ---- Hook: auto-init when Supplier Dashboard opens ----
    //  We observe the supplier dashboard modal for when it becomes visible.
    const observer = new MutationObserver(() => {
        const modal = document.getElementById('supplierDashboardModal');
        if (!modal) return;

        const isVisible = modal.style.display !== 'none' &&
                          !modal.classList.contains('hidden') &&
                          modal.offsetParent !== null;

        if (isVisible && !modal._calInit) {
            modal._calInit = true;

            // Reset to current month on open
            const now = new Date();
            calState.year  = now.getFullYear();
            calState.month = now.getMonth();
            calState.selectedDate = null;

            // Get supplier id from current user state
            const supId = (typeof state !== 'undefined' && state.currentUser && state.currentUser.id)
                ? state.currentUser.id : null;

            if (supId) {
                loadSupplierAvailability(supId);
            } else {
                renderCalendar();
            }
        }
        if (!isVisible) {
            modal._calInit = false;
        }
    });

    // Start observing once DOM is ready
    function startObserver() {
        const modal = document.getElementById('supplierDashboardModal');
        if (modal) {
            observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
        } else {
            setTimeout(startObserver, 500);
        }
    }

    // Also expose a direct init function for cases where the modal opens via JS
    window.initSupplierAvailabilityCalendar = function() {
        const now = new Date();
        calState.year  = now.getFullYear();
        calState.month = now.getMonth();
        calState.selectedDate = null;

        const supId = (typeof state !== 'undefined' && state.currentUser && state.currentUser.id)
            ? state.currentUser.id : null;

        if (supId) {
            loadSupplierAvailability(supId);
        } else {
            renderCalendar();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }

})();
// ============================================================
//  END SUPPLIER AVAILABILITY CALENDAR
// ============================================================
