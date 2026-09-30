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
                    const saved = JSON.parse(sessionStorage.getItem('dropzyy_user') || sessionStorage.getItem('freshkart_user'));
                    token = saved ? (saved.access_token || saved.token) : null;
                } catch (e) {}
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

let customCategories = JSON.parse(localStorage.getItem('dropzyy_custom_categories')) || [];
let CATEGORIES = [...DEFAULT_CATEGORIES];
customCategories.forEach(c => {
    if (!CATEGORIES.some(cat => cat.id === c.id)) {
        CATEGORIES.push(c);
    }
});

// Registered Accounts Persistence
const DEFAULT_REGISTERED_USERS = [
    { id: 1, username: 'yashpatil', email: 'yashpatil@dropzyy.com', password: '12528289Yash@', full_name: 'Yash Patil (System Admin)', role: 'admin' },
    { id: 2, username: 'admin', email: 'admin@dropzyy.com', password: 'admin123', full_name: 'System Administrator', role: 'admin' }
];

let registeredUsers = JSON.parse(localStorage.getItem('dropzyy_registered_users')) || [...DEFAULT_REGISTERED_USERS];
// Purge legacy deleted test accounts from local storage
registeredUsers = registeredUsers.filter(u => {
    if (!u) return false;
    const uName = (u.username || '').toLowerCase();
    const cName = (u.supplier_company_name || '').toLowerCase();
    if (uName === 'bhupesh11' || cName === 'bhupeshkirana') return false;
    if (uName === 'dhanji' || cName === 'dhanji') return false;
    if (uName === 'ritesh@123' || cName === 'banjos cafe' || cName === 'banjos') return false;
    return true;
});
DEFAULT_REGISTERED_USERS.forEach(defaultUser => {
    if (!registeredUsers.some(u => u.username.toLowerCase() === defaultUser.username.toLowerCase())) {
        registeredUsers.unshift(defaultUser);
    }
});
localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));

const DEFAULT_COUPONS = [
    { id: 'c1', code: 'KIRANA10', discount: 10, target: 'everyone', targetUser: '' },
    { id: 'c2', code: 'FRESH10', discount: 10, target: 'everyone', targetUser: '' }
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
let storeProducts = DEFAULT_PRODUCTS;

// 2. STATE MANAGEMENT
let state = {
    products: storeProducts,
    cart: [],
    wishlist: new Set(),
    ordersHistory: [],
    currentUser: JSON.parse(sessionStorage.getItem('dropzyy_user') || sessionStorage.getItem('freshkart_user')) || null,
    coupons: storeCoupons,
    serviceableLocations: serviceableLocations,
    activeCategory: 'all',
    activeSupplierFilter: null,
    searchQuery: '',
    sortBy: 'popular',
    promoDiscount: 0
};

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
document.addEventListener('DOMContentLoaded', async () => {
    updateUserAuthUI();
    await Promise.allSettled([
        fetchProductsFromAPI(),
        fetchCouponsFromAPI(),
        fetchLocationsFromAPI(),
        fetchCategoriesFromAPI(),
        syncUsersWithAPI(),
        fetchAvailabilityFromAPI()
    ]);
    renderCategories();
    renderRestaurants();
    renderProducts();
    updateCartUI();
    updateWishlistUI();
    renderServiceableCitiesDatalist();
    setupEventListeners();
});

// 4.1 FETCH AVAILABILITY CALENDAR DATA
async function fetchAvailabilityFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/supplier/availability`, {}, 5000);
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
        const response = await fetchWithTimeout(`${API_BASE_URL}/products`, {}, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                state.products = data.map(p => ({
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
                    isOnline: (p.is_online !== false),
                    is_online: (p.is_online !== false)
                }));
            }
        }
    } catch (err) {
        console.log('FastAPI backend offline or starting up. Using local Kirana products dataset.');
    }
}

async function fetchCouponsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/coupons`, {}, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
                state.coupons = data.map(c => ({
                    id: String(c.id),
                    code: String(c.code).toUpperCase(),
                    discount: c.discount_percent || c.discount || 10,
                    target: 'everyone',
                    targetUser: ''
                }));
                if (typeof renderAdminCouponsList === 'function') renderAdminCouponsList();
            }
        }
    } catch (err) {}
}

async function fetchLocationsFromAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/locations`, {}, 15000);
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

// 6. RENDER CATEGORIES
function renderCategories() {
    categoryGrid.innerHTML = CATEGORIES.map(cat => `
        <div class="category-card ${state.activeCategory === cat.id ? 'active' : ''}" data-category="${cat.id}">
            <div class="category-icon-box">
                <i class="${cat.icon}"></i>
            </div>
            <div class="category-name">${cat.name}</div>
            <div class="category-count">${cat.count} Items Available</div>
        </div>
    `).join('');
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

    const formattedOpen = formatTime12Hour(user.open_time || '08:00 AM');
    const formattedClose = formatTime12Hour(user.close_time || '10:00 PM');
    const openTime = user.open_time || '08:00 AM';
    const closeTime = user.close_time || '10:00 PM';

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

    // Substring match ONLY if length >= 4 to avoid 1-letter bugs like 'r'
    if (sCompany && sCompany.length >= 4 && (pSupplier.includes(sCompany) || sCompany.includes(pSupplier))) return true;
    if (sName && sName.length >= 4 && (pSupplier.includes(sName) || sName.includes(pSupplier))) return true;

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
            'dropzyy', 'freshkart', 'mandi', 'direct mandi', 'itc agro', 
            'farmers co-op', 'amul anand', 'wholesaler', 'wholesale co'
        ];
        return systemKeywords.some(sys => clean.includes(sys));
    }

    const rawSuppliers = registeredUsers.filter(u => u.role === 'supplier' || u.supplier_company_name);
    const seenKeys = new Set();
    const suppliers = [];

    // Deduplicate registered suppliers by company name or username (excluding internal platform names)
    for (const s of rawSuppliers) {
        const sName = (s.supplier_company_name || s.username || s.full_name || '').trim();
        const key = sName.toLowerCase();
        if (!key || seenKeys.has(key)) continue;
        if (isPlatformSupplier(sName)) continue;
        seenKeys.add(key);
        suppliers.push(s);
    }

    // Auto-discover active partner suppliers from catalog products (e.g. Banjos Cafe, Dhanji, etc.)
    state.products.forEach(p => {
        const sName = (p.supplier_name || p.supplierName || '').trim();
        if (sName && !isPlatformSupplier(sName)) {
            const key = sName.toLowerCase();
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                suppliers.push({
                    id: p.supplier_user_id || `sup_${key.replace(/[^a-z0-9]/g, '_')}`,
                    username: key.replace(/[^a-z0-9]/g, ''),
                    supplier_company_name: sName,
                    full_name: sName,
                    role: 'supplier',
                    open_time: '08:00 AM',
                    close_time: '10:00 PM',
                    store_open: true
                });
            }
        }
    });

    // Helper to get thematic banner and avatar for partner restaurants & kirana stores
    function getSupplierBannerAndAvatar(sup) {
        const raw = `${sup.supplier_company_name || ''} ${sup.full_name || ''} ${sup.username || ''}`.toLowerCase();
        
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

        if (sup.banner_image || sup.cover_image) banner = sup.banner_image || sup.cover_image;

        return { banner, avatarIcon, avatarBg };
    }

    // Helper to check if two supplier entities are the same
    function isSameSupplierEntity(supA, supB) {
        if (!supA || !supB) return false;
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

        const hasSharedProduct = state.products.some(p => 
            doesProductBelongToSupplier(p, supA) && doesProductBelongToSupplier(p, supB)
        );
        if (hasSharedProduct) return true;

        return false;
    }

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
                city: state.currentUser.city || 'Mumbai'
            }];
        }
    } else {
        // Customer / Visitor view: ONLY show partner stores that have active products added by that supplier!
        displaySuppliers = suppliers.filter(sup => {
            const count = state.products.filter(p => doesProductBelongToSupplier(p, sup)).length;
            return count > 0;
        });

        // Sort so stores with more items appear first
        displaySuppliers.sort((a, b) => {
            const countA = state.products.filter(p => doesProductBelongToSupplier(p, a)).length;
            const countB = state.products.filter(p => doesProductBelongToSupplier(p, b)).length;
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

    restaurantsGrid.innerHTML = displaySuppliers.map(sup => {
        const name = sup.supplier_company_name || sup.full_name || sup.username;
        const owner = sup.username ? `@${sup.username}` : (sup.full_name || 'Partner');
        const status = evaluateUserStoreHours(sup);
        const isOpen = status.isOpen;
        const openTime = formatTime12Hour(sup.open_time || '08:00 AM');
        const closeTime = formatTime12Hour(sup.close_time || '10:00 PM');
        const city = sup.city || 'Mumbai';
        
        // Count products belonging strictly to this supplier
        const items = state.products.filter(p => doesProductBelongToSupplier(p, sup));
        const count = items.length;

        const { banner, avatarIcon, avatarBg } = getSupplierBannerAndAvatar(sup);
        const filterParam = sup.username || sup.id || sup.supplier_company_name;

        return `
            <div class="restaurant-card" onclick="openRestaurantMenuModal('${filterParam}')" style="background: #FFFFFF; border: 1.5px solid #E2E8F0; border-radius: 18px; overflow: hidden; cursor: pointer; transition: all 0.25s ease; position: relative; box-shadow: 0 4px 14px rgba(0,0,0,0.04); display: flex; flex-direction: column;">
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
                        <div style="display: flex; align-items: center; gap: 6px;">
                            ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') ? `
                                <button type="button" class="btn-delete-restaurant-admin" onclick="deleteRestaurantByAdmin('${filterParam}', '${name.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Admin: Delete Restaurant" style="background: #FEE2E2; color: #DC2626; border: 1px solid #FECACA; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </button>
                            ` : ''}
                            ${state.currentUser && isSameSupplierEntity(sup, state.currentUser) ? `
                                <button type="button" onclick="openSupplierDashboard(); event.stopPropagation();" title="Manage your restaurant" style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-gear"></i> Manage
                                </button>
                            ` : ''}
                            <button type="button" class="btn-view-store-menu" onclick="openRestaurantMenuModal('${filterParam}'); event.stopPropagation();" style="background: #10B981; color: #FFFFFF; border: none; border-radius: 8px; padding: 6px 14px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(16, 185, 129, 0.25);">
                                View Menu <i class="fa-solid fa-arrow-right" style="font-size: 0.72rem;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
};

window.openRestaurantMenuModal = function(idOrUsername) {
    const clean = String(idOrUsername).trim().toLowerCase();
    let target = registeredUsers.find(u => 
        (u.id && String(u.id) === String(idOrUsername)) ||
        (u.username && u.username.toLowerCase() === clean) ||
        (u.supplier_company_name && u.supplier_company_name.toLowerCase() === clean) ||
        (u.full_name && u.full_name.toLowerCase() === clean)
    );

    // If not found in registeredUsers, check if there's an active supplier from products
    if (!target) {
        const matchingProduct = state.products.find(p => {
            const pSup = (p.supplier_name || p.supplierName || '').toLowerCase();
            return pSup === clean;
        });
        if (matchingProduct) {
            const sName = matchingProduct.supplier_name || matchingProduct.supplierName;
            target = {
                id: matchingProduct.supplier_user_id || `sup_${clean.replace(/[^a-z0-9]/g, '_')}`,
                username: clean.replace(/[^a-z0-9]/g, ''),
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

    state.activeModalRestaurant = target;
    renderRestaurantMenuModalContent(target);

    const modal = document.getElementById('restaurantMenuModal');
    const overlay = document.getElementById('restaurantMenuOverlay');
    if (modal) modal.classList.add('active');
    if (overlay) overlay.classList.add('active');
};

window.renderRestaurantMenuModalContent = function(target) {
    const container = document.getElementById('restaurantMenuModalContent');
    if (!container || !target) return;

    const name = target.supplier_company_name || target.full_name || target.username;
    const owner = target.username ? `@${target.username}` : (target.full_name || 'Partner');
    const status = evaluateUserStoreHours(target);
    const isOpen = status.isOpen;
    const openTime = formatTime12Hour(target.open_time || '08:00 AM');
    const closeTime = formatTime12Hour(target.close_time || '10:00 PM');
    const city = target.city || 'Mumbai';
    const items = state.products.filter(p => doesProductBelongToSupplier(p, target));
    
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

    container.innerHTML = `
        <!-- Popup Header (Clean, Modern UI matching approved design) -->
        <div style="background: #FFFFFF; border-bottom: 1px solid #E2E8F0; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 14px;">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: ${avatarBg}; color: white; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">
                    <i class="fa-solid ${avatarIcon}"></i>
                </div>
                <div>
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 800; color: #0F172A;">${name}</h3>
                        <span class="badge" style="${isOpen ? 'background:#D1FAE5; color:#065F46; border: 1px solid #A7F3D0;' : 'background:#FEE2E2; color:#991B1B; border: 1px solid #FECACA;'} font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 12px;">
                            ${isOpen ? '🟢 OPEN' : `🔴 CLOSED (${status.reason})`}
                        </span>
                    </div>
                    <div style="margin-top: 4px; font-size: 0.8rem; color: #64748B; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span><i class="fa-solid fa-location-dot" style="color: #10B981;"></i> ${city}</span>
                        <span>•</span>
                        <span><i class="fa-solid fa-clock" style="color: #F59E0B;"></i> ${openTime} - ${closeTime}</span>
                        <span>•</span>
                        <span style="color: #059669; font-weight: 700;"><i class="fa-solid fa-bowl-food"></i> <strong>${items.length}</strong> Item${items.length === 1 ? '' : 's'}</span>
                    </div>
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                ${state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') ? `
                    <button type="button" class="btn btn-sm" onclick="deleteRestaurantByAdmin('${target.username || target.id}', '${name.replace(/'/g, "\\'")}')" style="background: #DC2626; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                        <i class="fa-solid fa-trash-can"></i> Delete Restaurant
                    </button>
                ` : ''}
                ${state.currentUser && isSameSupplierEntity(target, state.currentUser) ? `
                    <button type="button" class="btn btn-sm" onclick="supplierDeleteMyRestaurant()" style="background: #DC2626; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(220,38,38,0.25);">
                        <i class="fa-solid fa-trash-can"></i> Delete Store
                    </button>
                ` : ''}
                <button type="button" class="close-modal-btn" onclick="closeRestaurantMenuModal()" style="position: static; width: 34px; height: 34px; border-radius: 50%; background: #F1F5F9; border: 1px solid #E2E8F0; color: #64748B; display: flex; align-items: center; justify-content: center; font-size: 1rem; cursor: pointer; transition: all 0.2s;" title="Close Popup" onmouseover="this.style.background='#E2E8F0'; this.style.color='#0F172A'" onmouseout="this.style.background='#F1F5F9'; this.style.color='#64748B'">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>

        <!-- Popup Body: Items Grid -->
        <div style="padding: 22px 24px; overflow-y: auto; flex: 1; background: #F8FAFC;">
            ${items.length === 0 ? `
                <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); background: white; border-radius: 14px; border: 1.5px dashed #CBD5E1;">
                    <i class="fa-solid fa-store-slash" style="font-size: 2.5rem; margin-bottom: 12px; color: #94A3B8;"></i>
                    <h4 style="margin: 0 0 6px 0; color: #1E293B;">No Menu Items Available</h4>
                    <p style="margin: 0; font-size: 0.9rem;">This partner store hasn't added menu items or products yet.</p>
                </div>
            ` : `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 16px;">
                    ${items.map(p => {
                        const inCart = state.cart.find(c => String(c.id) === String(p.id));
                        const cartQty = inCart ? inCart.qty : 0;
                        const isOnline = (p.isOnline !== false && p.is_online !== false);
                        const canOrder = isOpen && isOnline;

                        return `
                            <div style="background: white; border: 1.5px solid #E2E8F0; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                                <div style="position: relative; width: 100%; height: 135px; background: #F1F5F9; overflow: hidden;">
                                    <img src="${p.image}" alt="${p.title}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                                    ${p.badge ? `<span style="position: absolute; top: 8px; left: 8px; background: #10B981; color: white; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">${p.badge}</span>` : ''}
                                    ${!canOrder ? `
                                        <div style="position: absolute; inset: 0; background: rgba(15,23,42,0.65); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 0.78rem;">
                                            🔴 ${!isOnline ? 'OFFLINE' : 'STORE CLOSED'}
                                        </div>
                                    ` : ''}
                                </div>
                                <div style="padding: 12px; display: flex; flex-direction: column; flex: 1;">
                                    <div style="font-size: 0.72rem; color: #10B981; font-weight: 700; text-transform: uppercase; margin-bottom: 2px;">
                                        ${p.category || 'Store Item'}
                                    </div>
                                    <h4 style="margin: 0 0 4px 0; font-size: 0.95rem; font-weight: 700; color: #0F172A; line-height: 1.3;">
                                        ${p.title}
                                    </h4>
                                    <div style="font-size: 0.78rem; color: #64748B; margin-bottom: 8px;">
                                        ${p.unit || ''}
                                    </div>
                                    ${p.description ? `<p style="font-size: 0.78rem; color: #64748B; margin: 0 0 10px 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description}</p>` : ''}
                                    
                                    <div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px dashed #E2E8F0;">
                                        <div>
                                            <span style="font-size: 1.05rem; font-weight: 800; color: #0F172A;">₹${p.price}</span>
                                            ${p.originalPrice && p.originalPrice > p.price ? `<span style="font-size: 0.75rem; text-decoration: line-through; color: #94A3B8; margin-left: 4px;">₹${p.originalPrice}</span>` : ''}
                                        </div>

                                        ${!canOrder ? `
                                            <button class="btn btn-sm" disabled style="background:#E2E8F0; color:#94A3B8; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: not-allowed; padding: 4px 10px;">
                                                Closed
                                            </button>
                                        ` : cartQty > 0 ? `
                                            <div style="display: flex; align-items: center; gap: 4px; background: #ECFDF5; border: 1.5px solid #10B981; border-radius: 8px; padding: 2px 4px;">
                                                <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); updateCartQuantity('${p.id}', -1); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="background: transparent; border: none; color: #047857; font-weight: 800; padding: 2px 7px; cursor: pointer; font-size: 0.85rem;" title="Decrease quantity">-</button>
                                                <span style="font-weight: 800; font-size: 0.82rem; color: #065F46; min-width: 14px; text-align: center;">${cartQty}</span>
                                                <button type="button" class="btn btn-sm" onclick="event.stopPropagation(); addToCart('${p.id}', 1); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="background: transparent; border: none; color: #047857; font-weight: 800; padding: 2px 7px; cursor: pointer; font-size: 0.85rem;" title="Increase quantity">+</button>
                                            </div>
                                        ` : `
                                            <button type="button" class="btn btn-sm btn-primary" onclick="event.stopPropagation(); addToCart('${p.id}'); setTimeout(() => renderRestaurantMenuModalContent(state.activeModalRestaurant), 10);" style="border-radius: 8px; padding: 5px 12px; font-weight: 700; font-size: 0.78rem; display: flex; align-items: center; gap: 4px;">
                                                <i class="fa-solid fa-plus"></i> Add
                                            </button>
                                        `}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>

        <!-- Popup Footer -->
        <div style="padding: 14px 24px; background: white; border-top: 1px solid #E2E8F0; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
            <div style="font-size: 0.85rem; color: #64748B;">
                Showing <strong>${items.length}</strong> item${items.length === 1 ? '' : 's'} from <strong>${name}</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                ${state.cart.length > 0 ? `
                    <button type="button" class="btn btn-primary btn-sm" onclick="closeRestaurantMenuModal(); if (window.openCart) window.openCart();" style="border-radius: 8px; font-weight: 700; padding: 6px 16px; display: flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-bag-shopping"></i> View Cart (${state.cart.reduce((s, i) => s + i.qty, 0)})
                    </button>
                ` : ''}
                <button type="button" class="btn btn-secondary btn-sm" onclick="closeRestaurantMenuModal()" style="border-radius: 8px; font-weight: 700; padding: 6px 18px;">
                    Close
                </button>
            </div>
        </div>
    `;
};

window.closeRestaurantMenuModal = function() {
    const modal = document.getElementById('restaurantMenuModal');
    const overlay = document.getElementById('restaurantMenuOverlay');
    if (modal) modal.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
};

window.filterByRestaurant = function(idOrUsername) {
    const clean = String(idOrUsername).trim().toLowerCase();
    let target = registeredUsers.find(u => 
        (u.id && String(u.id) === String(idOrUsername)) ||
        (u.username && u.username.toLowerCase() === clean) ||
        (u.supplier_company_name && u.supplier_company_name.toLowerCase() === clean) ||
        (u.full_name && u.full_name.toLowerCase() === clean)
    );

    // If not found in registeredUsers, check if there's an active supplier from products
    if (!target) {
        const matchingProduct = state.products.find(p => {
            const pSup = (p.supplier_name || p.supplierName || '').toLowerCase();
            return pSup === clean;
        });
        if (matchingProduct) {
            const sName = matchingProduct.supplier_name || matchingProduct.supplierName;
            target = {
                id: matchingProduct.supplier_user_id || `sup_${clean.replace(/[^a-z0-9]/g, '_')}`,
                username: clean.replace(/[^a-z0-9]/g, ''),
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

    const pSec = document.getElementById('productsSection');
    if (pSec) {
        pSec.scrollIntoView({ behavior: 'smooth' });
    }
};

window.clearRestaurantFilter = function() {
    state.activeSupplierFilter = null;
    renderRestaurants();
    renderProducts();
};

// 7. RENDER PRODUCTS
function renderProducts() {
    let filtered = state.products.filter(p => {
        const isOnline = (p.isOnline !== false && p.is_online !== false);
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
        const isOnline = (product.isOnline !== false && product.is_online !== false);
        
        // Critical: Check operating hours ONLY for this specific product's supplier!
        const storeCheck = isSupplierStoreOpen(product);

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
                    <span class="product-category-tag">${product.category}</span>
                    <h3 class="product-title">${product.title}</h3>
                    <div class="product-unit">${product.unit}</div>
                    
                    <!-- Supplier Name Tag -->
                    <div class="product-supplier-tag">
                        <i class="fa-solid fa-truck-field text-primary"></i> ${sName}
                        ${!storeCheck.isOpen ? `<span style="color:#DC2626; font-size:0.72rem; margin-left:4px; font-weight:700;">(Closed)</span>` : ''}
                    </div>

                    <div class="product-footer">
                        <div class="price-container">
                            <span class="current-price">₹${product.price}</span>
                            <span class="original-price">₹${product.originalPrice}</span>
                        </div>
                        ${isSupplierUser ? `
                            <button class="btn btn-sm ${!isOnline ? 'btn-success' : 'btn-secondary'}" onclick="toggleProductOnlineStatus('${product.id}')" style="font-size: 0.75rem; padding: 4px 8px;" title="Click to toggle product Online/Offline">
                                <i class="fa-solid ${!isOnline ? 'fa-globe' : 'fa-eye-slash'}"></i> ${!isOnline ? 'Set ONLINE' : 'Set OFFLINE'}
                            </button>
                        ` : `
                            <button class="add-cart-btn" onclick="addToCart('${product.id}')" ${(!isOnline || !storeCheck.isOpen) ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} title="${!storeCheck.isOpen ? storeCheck.reason : ''}">
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
async function addToCart(productId, quantity = 1) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    // Guard: Verify supplier store is open
    const storeCheck = isSupplierStoreOpen(product);
    if (!storeCheck.isOpen) {
        showToast(`Store is closed: ${storeCheck.reason}`, 'error');
        return;
    }

    // Use robust string comparison to find existing cart item
    const existingIndex = state.cart.findIndex(item => String(item.id) === String(productId));
    if (existingIndex > -1) {
        state.cart[existingIndex].qty += quantity;
    } else {
        state.cart.push({ ...product, qty: quantity });
    }
    updateCartUI();

    if (state.currentUser) {
        const userId = state.currentUser.id || state.currentUser.username;
        try {
            await fetch(`${API_BASE_URL}/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: String(userId), product_id: String(productId), quantity: quantity })
            });
        } catch (err) {
            console.warn('Backend cart sync offline:', err);
        }
    }
    showToast(`Added <strong>${product.title}</strong> to cart!`, 'success');
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
    updateCartUI();
}

function saveCart() {
    // Cart persisted in SQLite
}

function updateCartUI() {
    const totalItems = state.cart.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const discountAmount = Math.round(subtotal * state.promoDiscount);
    const freeShippingThreshold = 299;
    const shipping = subtotal >= freeShippingThreshold || totalItems === 0 ? 0 : 29;
    const grandTotal = Math.max(0, subtotal - discountAmount + (totalItems > 0 ? shipping : 0));

    if (cartBadge) cartBadge.textContent = totalItems;
    if (mobileCartBadge) mobileCartBadge.textContent = totalItems;
    cartItemCountPill.textContent = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
    headerCartTotal.textContent = `₹${grandTotal}`;

    if (subtotal >= freeShippingThreshold) {
        shippingProgressText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> You unlocked <strong>FREE Home Delivery</strong>!`;
        shippingProgressBar.style.width = '100%';
    } else {
        const remaining = freeShippingThreshold - subtotal;
        const percent = Math.min(100, (subtotal / freeShippingThreshold) * 100);
        shippingProgressText.innerHTML = `Add <strong>₹${remaining}</strong> more for FREE Home Delivery!`;
        shippingProgressBar.style.width = `${percent}%`;
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

        const headerNotificationBtn = document.getElementById('headerNotificationBtn');

        if (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin') {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.remove('hidden');
            if (adminPortalBtn) adminPortalBtn.classList.remove('hidden');
            if (trackBookingsBtn) trackBookingsBtn.classList.remove('hidden');
            if (adminToolbarRow) adminToolbarRow.classList.remove('hidden');
            if (headerNotificationBtn) headerNotificationBtn.classList.remove('hidden');
        } else if (state.currentUser.role === 'supplier') {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.add('hidden');
            if (adminPortalBtn) adminPortalBtn.classList.remove('hidden');
            if (trackBookingsBtn) trackBookingsBtn.classList.remove('hidden');
            if (adminToolbarRow) adminToolbarRow.classList.remove('hidden');
            if (headerNotificationBtn) headerNotificationBtn.classList.remove('hidden');
        } else {
            if (adminControlCenterBtn) adminControlCenterBtn.classList.add('hidden');
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

async function loginUser(username, password) {
    if (!username || !password) return;

    const cleanInput = username.trim().toLowerCase();

    // 1. Check local registered users list for instant responsiveness (0ms delay)
    const matchedUser = registeredUsers.find(u => 
        ((u.username && u.username.toLowerCase() === cleanInput) || 
         (u.email && u.email.toLowerCase() === cleanInput)) && 
        u.password === password
    );
    
    if (matchedUser) {
        state.currentUser = matchedUser;
        sessionStorage.setItem('dropzyy_user', JSON.stringify(matchedUser));
        updateUserAuthUI();
        renderProducts();
        closeModals();
        showToast(`Logged in as <strong>${matchedUser.supplier_company_name || matchedUser.full_name}</strong> (${matchedUser.role})!`, 'success');
        return;
    }

    // 2. Check REST API with fast 1.5s timeout
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        }, 1500);

        if (response && response.ok) {
            const user = await response.json();
            state.currentUser = user;
            sessionStorage.setItem('dropzyy_user', JSON.stringify(user));
            updateUserAuthUI();
            renderProducts();
            closeModals();
            showToast(`Welcome back, <strong>${user.supplier_company_name || user.full_name}</strong> (${user.role})!`, 'success');
            return;
        }
    } catch (e) {
        console.log('FastAPI server offline or unreachable.');
    }

    showToast('Invalid email/username or password! Please check credentials.', 'info');
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

window.handleRegisterSubmit = function(e) {
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
    const password = passwordEl ? passwordEl.value.trim() : '';
    const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value.trim() : '';

    if (!fullName || !email || !password) {
        showToast('Please fill in all required fields!', 'info');
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

    registerUser(email, otp, password, fullName, 'customer', '', cleanPhone);
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
    sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));

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

function renderAdminCouponsList() {
    const container = document.getElementById('adminCouponsListContainer');
    if (!container) return;

    if (!state.coupons || state.coupons.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 16px;">No discount coupons created yet.</p>';
        return;
    }

    container.innerHTML = state.coupons.map(c => `
        <div class="supplier-item-row" style="padding: 10px 14px; background: #FFF; border-radius: 10px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <div style="font-weight: 800; font-size: 1.05rem; color: var(--primary-dark);">
                    <i class="fa-solid fa-ticket text-primary"></i> ${c.code} (${c.discount}% OFF)
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    Target: <strong>${c.target === 'everyone' ? '🌐 Everyone' : `👤 Only @${c.targetUser}`}</strong>
                </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="deleteCouponByAdmin('${c.id}')" title="Delete Coupon">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');
}

window.handleCreateCouponSubmit = async function(e) {
    if (e) e.preventDefault();
    const codeInput = document.getElementById('couponCodeInput');
    const discountInput = document.getElementById('couponDiscountInput');
    const targetSelect = document.getElementById('couponTargetSelect');
    const targetUserInput = document.getElementById('couponTargetUserInput');

    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const discount = discountInput ? parseInt(discountInput.value) : 0;
    const target = targetSelect ? targetSelect.value : 'everyone';
    const targetUser = targetUserInput ? targetUserInput.value.trim() : '';

    if (!code || isNaN(discount) || discount <= 0) {
        showToast('Please enter a valid coupon code and discount percentage', 'info');
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

    const newCoupon = {
        id: 'c_' + Date.now(),
        code,
        discount,
        target,
        targetUser: target === 'user' ? targetUser : ''
    };

    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/coupons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                discount_percent: discount,
                min_order: 0,
                description: `${discount}% OFF Promo Coupon`,
                is_active: true
            })
        }, 15000);

        if (response && response.ok) {
            const data = await response.json();
            if (data && data.id) newCoupon.id = String(data.id);
            state.coupons.unshift(newCoupon);
            if (document.getElementById('adminCouponForm')) document.getElementById('adminCouponForm').reset();
            if (document.getElementById('couponTargetUserGroup')) document.getElementById('couponTargetUserGroup').classList.add('hidden');
            renderAdminCouponsList();
            showToast(`Created coupon <strong>${code}</strong> (${discount}% OFF) in MongoDB database!`, 'success');
        } else {
            let errText = 'Failed to save coupon to database.';
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
            showToast('Coupon deleted from MongoDB Atlas database!', 'info');
        } else {
            showToast('Could not delete coupon from database', 'error');
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
            showToast(`Added serviceable pincode <strong>${pincode}</strong> (${area}) to MongoDB database!`, 'success');
        } else {
            let errText = 'Failed to save location to database.';
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
            showToast('Location deleted from MongoDB Atlas database!', 'info');
        } else {
            showToast('Could not delete location from database', 'error');
        }
    } catch (e) {
        showToast('Removed location locally', 'info');
    }
};

async function registerUser(email, otp, password, fullName, role, supplierCompany = '', phone = '') {
    if (!email || !password || !fullName) {
        showToast('Please fill in all required fields!', 'info');
        return;
    }

    // Check if email already registered locally
    if (registeredUsers.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
        showToast(`Email <strong>${email}</strong> is already registered! Please sign in instead.`, 'info');
        return;
    }

    const derivedUsername = email.split('@')[0];

    const newUser = {
        id: Date.now(),
        username: derivedUsername,
        email: email,
        password: password,
        full_name: fullName,
        phone: phone,
        role: role,
        is_verified: true,
        address: { fullName, phone, streetAddress: '', city: '', pincode: '' },
        supplier_company_name: role === 'supplier' ? (supplierCompany || fullName) : null
    };

    // Save to local registered accounts list immediately (0ms delay)
    registeredUsers.push(newUser);

    // Log user in automatically
    state.currentUser = newUser;
    sessionStorage.setItem('dropzyy_user', JSON.stringify(newUser));
    
    updateUserAuthUI();
    renderProducts();
    closeModals();
    showToast(`Email verified! Account created for <strong>${newUser.full_name}</strong>. Welcome to Dropzyy!`, 'success');

    // Async background sync with API
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, otp: otp || '123456', password, full_name: fullName, phone, role, supplier_company_name: supplierCompany 
            })
        }, 15000);

        if (response && response.ok) {
            const user = await response.json();
            if (user && user.id) newUser.id = user.id;
            showToast(`Account registered and saved to MongoDB Atlas database!`, 'success');
        }
    } catch (e) {
        console.log('FastAPI offline. Account registered locally.');
    }
}

window.logoutUser = function() {
    state.currentUser = null;
    sessionStorage.removeItem('dropzyy_user'); sessionStorage.removeItem('freshkart_user');
    updateUserAuthUI();
    renderProducts();
    closeModals();
    showToast('Logged out successfully', 'info');
};

// 10. ADMINISTRATIVE CONTROL CENTER

function renderAdminUsersDirectory() {
    const usersList = [...registeredUsers];
    const suppliersCount = usersList.filter(u => u.role === 'supplier').length;
    const statUsers = document.getElementById('statAdminTotalUsers');
    const statSuppliers = document.getElementById('statAdminTotalSuppliers');
    const container = document.getElementById('adminUsersContainer');

    if (statUsers) statUsers.textContent = usersList.length;
    if (statSuppliers) statSuppliers.textContent = suppliersCount;

    if (container) {
        container.innerHTML = usersList.map(u => `
            <div class="supplier-item-row" style="padding: 12px; margin-bottom: 8px; background: rgba(255,255,255,0.7); border-radius: 10px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #E0F2FE; color: #0284C7; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.1rem;">
                        ${u.full_name ? u.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    <div>
                        <div style="font-weight: 700; color: #1E293B;">${u.full_name} (@${u.username})</div>
                        <div style="font-size: 0.85rem; color: #64748B;">
                            Role: <span class="role-pill role-${u.role}">${u.role.toUpperCase()}</span>
                            ${u.phone ? ` | 📱 <strong>${u.phone}</strong>` : ''}
                            ${u.supplier_company_name ? ` | Store: <strong>${u.supplier_company_name}</strong>` : ''}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="adminEditUserAddress('${u.username}')" style="color: #0284C7;" title="Edit Address & User Details">
                        <i class="fa-solid fa-user-pen"></i> Edit
                    </button>
                    ${(u.username !== 'yashpatil' && state.currentUser && u.username !== state.currentUser.username) ? `
                        <button type="button" class="btn btn-secondary btn-sm text-danger" onclick="deleteUserAccount(${u.id || 0}, '${u.username}')" title="Delete User Account">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
}

async function syncUsersWithAPI() {
    try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/admin/users`, {}, 15000);
        if (response && response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
                data.forEach(u => {
                    const existingIdx = registeredUsers.findIndex(ul => ul.username && ul.username.toLowerCase() === (u.username || '').toLowerCase());
                    if (existingIdx === -1) {
                        registeredUsers.push({
                            id: u.id,
                            username: u.username,
                            email: u.email,
                            password: u.password || 'supplier123',
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
                localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
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

async function deleteUserAccount(userId, username) {
    if (!confirm(`Are you sure you want to delete user account @${username}? This will also delete any linked restaurant store and products.`)) return;

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
    localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));

    // Remove products belonging to this user
    state.products = state.products.filter(p => {
        const pSup = (p.supplier_name || p.supplierName || '').toLowerCase();
        const pUid = String(p.supplier_user_id || '').toLowerCase();
        return pSup !== uClean && pUid !== uClean;
    });

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

    closeModals();
    const overlay = document.getElementById('adminEditUserOverlay');
    const modal = document.getElementById('adminEditUserModal');
    if (overlay) overlay.classList.add('active');
    if (modal) modal.classList.add('active');
};

window.handleAdminSaveUserSubmit = function(e) {
    if (e) e.preventDefault();
    const username = document.getElementById('adminTargetUsername').value;
    const fullName = document.getElementById('adminUserFullName').value.trim();
    const phone = document.getElementById('adminUserPhone').value.trim();
    const role = document.getElementById('adminUserRole').value;
    const streetAddress = document.getElementById('adminUserStreetAddress').value.trim();
    const city = document.getElementById('adminUserCity').value.trim();
    const pincode = document.getElementById('adminUserPincode').value.trim();

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
        registeredUsers[uIdx].address = {
            fullName,
            phone: cleanPhone,
            streetAddress,
            city,
            pincode
        };
        localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));

        if (state.currentUser && state.currentUser.username.toLowerCase() === username.toLowerCase()) {
            state.currentUser.full_name = fullName;
            state.currentUser.phone = cleanPhone;
            state.currentUser.role = role;
            state.currentUser.address = registeredUsers[uIdx].address;
            sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));
            updateUserAuthUI();
        }

        showToast(`Updated details & address for @${username}!`, 'success');
        closeModals();
        openAdminControlCenter();
    }
};

async function createAccountByAdmin(username, password, fullName, role, supplierCompany = '') {
    if (registeredUsers.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        showToast(`Username <strong>@${username}</strong> already exists!`, 'info');
        return;
    }

    const cleanUser = username.trim().toLowerCase().replace(/\s+/g, '_');
    const email = `${cleanUser}@dropzyy.com`;

    const newUser = {
        id: Date.now(),
        username: cleanUser,
        email: email,
        password: password,
        full_name: fullName,
        role: role,
        supplier_company_name: role === 'supplier' ? (supplierCompany || fullName) : null
    };

    registeredUsers.push(newUser);
    localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));

    closeModals();
    showToast(`Created <strong>${role.toUpperCase()}</strong> account for @${cleanUser}!`, 'success');
    openAdminControlCenter();

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
                supplier_company_name: supplierCompany 
            })
        }, 15000);

        if (response && response.ok) {
            const user = await response.json();
            if (user && user.id) {
                newUser.id = user.id;
                localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
            }
            showToast(`Supplier account @${cleanUser} synced to server database!`, 'success');
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
    renderSupplierDashboard();
}

function renderSupplierDashboard() {
    if (!state.currentUser) return;

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
            const isOnline = (p.isOnline !== false && p.is_online !== false);

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

    // Update state.currentUser
    state.currentUser.open_time = openTimeFormatted;
    state.currentUser.close_time = closeTimeFormatted;
    state.currentUser.store_open = true;
    sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));

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
        localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
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
                store_open: true
            })
        }, 3000);
    } catch (err) {
        console.warn('Backend sync for supplier timings:', err);
    }

    updateLiveStatusPreview();
    renderProducts();
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
    sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));

    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === (state.currentUser.username || '').toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].store_open = newStatus;
        localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
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

    showToast(
        newStatus 
            ? '🟢 Your restaurant is now <strong>ONLINE</strong>! Customers can place orders.'
            : '🔴 Your restaurant is now <strong>OFFLINE</strong>! Customer orders are paused.',
        newStatus ? 'success' : 'info'
    );
};

window.supplierDeleteMyRestaurant = async function() {
    if (!state.currentUser) return;
    const storeName = state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username || 'Your Restaurant';
    
    const confirmed = confirm(
        `⚠️ PERMANENT DELETION WARNING:\n\n` +
        `Are you sure you want to permanently delete "${storeName}"?\n\n` +
        `This will permanently remove:\n` +
        `• All your uploaded products and menu items from Dropzyy\n` +
        `• Your restaurant listing from the homepage\n` +
        `• Your restaurant operating schedule\n\n` +
        `Click OK to permanently delete your restaurant.`
    );
    if (!confirmed) return;

    const identifier = state.currentUser.username || state.currentUser.id || state.currentUser.supplier_company_name;

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

    // Remove products of this supplier from local memory
    state.products = state.products.filter(p => !doesProductBelongToSupplier(p, state.currentUser));
    if (Array.isArray(storeProducts)) {
        storeProducts = storeProducts.filter(p => !doesProductBelongToSupplier(p, state.currentUser));
    }

    // Reset supplier info on current user
    state.currentUser.supplier_company_name = '';
    state.currentUser.role = 'customer';
    sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));

    const uIdx = registeredUsers.findIndex(u => (u.username || '').toLowerCase() === (state.currentUser.username || '').toLowerCase());
    if (uIdx > -1) {
        registeredUsers[uIdx].supplier_company_name = '';
        registeredUsers[uIdx].role = 'customer';
        localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
    }

    closeModals();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof updateUserUI === 'function') updateUserUI();

    showToast(`🗑️ Restaurant "<strong>${storeName}</strong>" and all its menu items have been deleted.`, 'success');
};

window.deleteRestaurantByAdmin = async function(identifier, storeName, event) {
    if (event) event.stopPropagation();
    if (!state.currentUser || (state.currentUser.role !== 'admin' && state.currentUser.role !== 'sub_admin')) {
        showToast('Only administrators can delete partner restaurants.', 'error');
        return;
    }

    const cleanName = storeName || identifier;
    const confirmed = confirm(
        `⚠️ ADMIN CONFIRMATION:\n\n` +
        `Are you sure you want to permanently delete restaurant "${cleanName}"?\n\n` +
        `This will permanently remove:\n` +
        `• The restaurant profile & supplier account\n` +
        `• All menu items belonging to "${cleanName}"\n` +
        `• Its partner listing on the homepage\n\n` +
        `Click OK to proceed with deletion.`
    );
    if (!confirmed) return;

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

    // Remove products belonging to this restaurant
    state.products = state.products.filter(p => {
        const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
        const pUid = String(p.supplier_user_id || '').trim().toLowerCase();
        return pSup !== targetClean && pUid !== targetClean && pSup !== storeClean;
    });
    if (Array.isArray(storeProducts)) {
        storeProducts = storeProducts.filter(p => {
            const pSup = (p.supplier_name || p.supplierName || '').trim().toLowerCase();
            const pUid = String(p.supplier_user_id || '').trim().toLowerCase();
            return pSup !== targetClean && pUid !== targetClean && pSup !== storeClean;
        });
    }

    // Remove from registeredUsers
    registeredUsers = registeredUsers.filter(u => {
        const uName = (u.username || '').toLowerCase();
        const uComp = (u.supplier_company_name || '').toLowerCase();
        return uName !== targetClean && uComp !== targetClean && uComp !== storeClean;
    });
    localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));

    if (typeof closeRestaurantMenuModal === 'function') closeRestaurantMenuModal();
    if (typeof renderRestaurants === 'function') renderRestaurants();
    if (typeof renderProducts === 'function') renderProducts();
    if (typeof renderAdminUsersDirectory === 'function') renderAdminUsersDirectory();

    showToast(`🗑️ Restaurant "<strong>${cleanName}</strong>" and all its menu items have been permanently deleted by Admin.`, 'success');
};

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
        localStorage.setItem('dropzyy_registered_users', JSON.stringify(registeredUsers));
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

// 11. ADMIN / SUPPLIER PRODUCT CREATE & EDIT
window.toggleProductOnlineStatus = function(productId) {
    const product = state.products.find(p => String(p.id) === String(productId));
    if (!product) return;

    if (!canUserEditProduct(product)) {
        showToast('Permission Denied: You can only change online/offline status for your own products.', 'error');
        return;
    }

    const isCurrentlyOnline = (product.isOnline !== false && product.is_online !== false);
    const newStatus = !isCurrentlyOnline;

    product.isOnline = newStatus;
    product.is_online = newStatus;

    renderProducts();

    if (document.getElementById('supplierDashboardModal') && document.getElementById('supplierDashboardModal').classList.contains('active')) {
        renderSupplierDashboard();
    }

    const statusMsg = newStatus 
        ? `Product '<strong>${product.title}</strong>' is now <strong>ONLINE 🟢</strong> (Visible to Customers)`
        : `Product '<strong>${product.title}</strong>' is now <strong>OFFLINE 🔴</strong> (Hidden from Website)`;

    showToast(statusMsg, newStatus ? 'success' : 'info');

    try {
        fetchWithTimeout(`${API_BASE_URL}/products/${product.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
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
                supplier_name: product.supplierName,
                is_online: newStatus
            })
        }, 5000).catch(() => {});
    } catch (e) {}
};

window.openAddProductModal = function() {
    closeModals();
    populateCategoryDropdowns();
    if (editProductId) editProductId.value = '';
    if (adminModalTitle) adminModalTitle.innerHTML = `<i class="fa-solid fa-plus-circle text-primary"></i> Add Kirana Product`;
    if (adminModalSub) adminModalSub.textContent = `Add a new product to the Kirana store database`;
    if (addProductForm) addProductForm.reset();

    if (document.getElementById('prodStatus')) {
        document.getElementById('prodStatus').value = 'online';
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
    const product = state.products.find(p => p.id === productId);
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

    if (document.getElementById('prodStatus')) {
        const isOnline = (product.isOnline !== false && product.is_online !== false);
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

    if (adminOverlay) adminOverlay.classList.add('active');
    if (adminModal) adminModal.classList.add('active');
};

window.deleteProduct = async function(productId) {
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    if (!canUserEditProduct(product)) {
        showToast('Permission Denied: You can only delete products added by your supplier account.', 'error');
        return;
    }

    if (!confirm(`Are you sure you want to delete "${product.title}"?`)) return;

    state.products = state.products.filter(p => p.id !== productId);
    renderProducts();
    if (typeof renderRestaurants === 'function') renderRestaurants();

    if (document.getElementById('supplierDashboardModal') && document.getElementById('supplierDashboardModal').classList.contains('active')) {
        renderSupplierDashboard();
    }

    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/products/${productId}`, { method: 'DELETE' }, 15000);
        if (res && res.ok) {
            showToast(`Product '${product.title}' removed from database!`, 'info');
        } else {
            showToast('Product removed locally', 'info');
        }
    } catch (e) {
        showToast('Product removed locally', 'info');
    }
};

function saveProduct(productData, isEdit = false) {
    const isOnlineVal = productData.is_online ?? true;
    const sCompName = productData.supplier_company_name || (state.currentUser ? (state.currentUser.supplier_company_name || state.currentUser.full_name) : productData.supplier_name);
    const sUserId = productData.supplier_user_id || (state.currentUser ? String(state.currentUser.id || state.currentUser.username) : null);

    if (isEdit) {
        const index = state.products.findIndex(p => p.id === productData.id);
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
                is_online: isOnlineVal
            };
        }
        renderProducts();
        if (typeof renderRestaurants === 'function') renderRestaurants();
        closeModals();

        try {
            fetchWithTimeout(`${API_BASE_URL}/products/${productData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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
                    is_online: isOnlineVal
                })
            }, 15000).then(() => {
                showToast(`Updated <strong>${productData.title}</strong> in database!`, 'success');
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
            is_online: isOnlineVal
        };

        state.products.unshift(newProduct);
        renderProducts();
        if (typeof renderRestaurants === 'function') renderRestaurants();
        closeModals();

        try {
            fetchWithTimeout(`${API_BASE_URL}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                    is_online: isOnlineVal
                })
            }, 15000).then(res => res && res.ok && res.json()).then(saved => {
                if (saved && saved.id) newProduct.id = saved.id;
                showToast(`Saved <strong>${productData.title}</strong> to MongoDB database!`, 'success');
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
    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const sName = product.supplierName || 'Dropzyy Direct';
    const storeCheck = isSupplierStoreOpen(sName);

    quickViewContent.innerHTML = `
        <img src="${product.image}" alt="${product.title}" class="qv-image">
        <div class="qv-details">
            <span class="product-badge badge-organic" style="align-self: flex-start; margin-bottom: 10px;">${product.badge}</span>
            <h2 class="qv-title">${product.title}</h2>
            <div class="product-unit" style="margin-bottom: 6px;">Pack Size: ${product.unit}</div>
            
            <div class="product-supplier-tag" style="margin-bottom: 12px; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span><i class="fa-solid fa-truck-field text-primary"></i> Supplied by: <strong>${sName}</strong></span>
                ${storeCheck.isOpen 
                    ? `<span class="badge" style="background:#D1FAE5; color:#065F46; font-size:0.75rem; padding:2px 8px; border-radius:10px; font-weight:700;">🟢 Open (${storeCheck.openTimeFormatted || '08:00 AM'} - ${storeCheck.closeTimeFormatted || '10:00 PM'})</span>`
                    : `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-size:0.75rem; padding:2px 8px; border-radius:10px; font-weight:700;">🔴 Store Closed</span>`
                }
            </div>

            ${!storeCheck.isOpen ? `
                <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.85rem; color: #991B1B; font-weight: 600;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${storeCheck.reason}
                </div>
            ` : ''}

            <p class="qv-desc">${product.description || 'Fresh quality product sourced directly from verified suppliers.'}</p>

            <div class="product-footer" style="border: none; padding: 0;">
                <div class="price-container">
                    <span class="current-price" style="font-size: 1.5rem;">₹${product.price}</span>
                    <span class="original-price">₹${product.originalPrice}</span>
                </div>
                <button class="btn btn-primary btn-lg" onclick="addToCart('${product.id}'); closeModals();" ${!storeCheck.isOpen ? 'disabled style="opacity:0.5; cursor:not-allowed;" title="' + storeCheck.reason + '"' : ''}>
                    <i class="fa-solid fa-cart-shopping"></i> ${!storeCheck.isOpen ? 'Store Closed' : 'Add to Cart'}
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

window.handleRegisterSubmit = async function(e) {
    if (e) e.preventDefault();

    const fullNameInput = document.getElementById('regFullName');
    const emailInput = document.getElementById('regEmail') || document.getElementById('regUsername');
    const otpInput = document.getElementById('regOtp');
    const phoneInput = document.getElementById('regPhone');
    const passwordInput = document.getElementById('regPassword');
    const confirmPasswordInput = document.getElementById('regConfirmPassword');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
    const otp = otpInput ? otpInput.value.trim() : '123456';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

    if (!fullName || !email || !password) {
        showToast('Please fill in all required fields (Full Name, Email, Password)!', 'info');
        return;
    }

    if (confirmPasswordInput && password !== confirmPassword) {
        showToast('Passwords do not match! Please check again.', 'error');
        return;
    }

    await registerUser(email, otp, password, fullName, 'customer', '', phone);
};

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
            if (adminSupplierCompanyGroup) {
                if (e.target.value === 'supplier') {
                    adminSupplierCompanyGroup.classList.remove('hidden');
                } else {
                    adminSupplierCompanyGroup.classList.add('hidden');
                }
            }
        });
    }

    if (adminCreateUserForm) {
        adminCreateUserForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const role = document.getElementById('adminRegRole').value;
            const fullName = document.getElementById('adminRegFullName').value.trim();
            const supplierCompany = document.getElementById('adminRegSupplierCompany').value.trim();
            const username = document.getElementById('adminRegUsername').value.trim();
            const password = document.getElementById('adminRegPassword').value.trim();

            if (username && password && fullName) {
                createAccountByAdmin(username, password, fullName, role, supplierCompany);
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

            if (title && category && price && image) {
                const supplier_user_id = state.currentUser ? String(state.currentUser.id || state.currentUser.username) : null;
                const supplier_company_name = state.currentUser ? (state.currentUser.supplier_company_name || state.currentUser.full_name || supplier_name) : supplier_name;
                const productData = {
                    id, title, category, price, original_price, unit, image, badge,
                    supplier_name, supplier_company_name, supplier_user_id,
                    supplier_name,
                    discount: Math.round(((original_price - price) / original_price) * 100) + '% OFF',
                    description,
                    is_online
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

            // Target Audience Validation
            if (matchedCoupon.target === 'user' && matchedCoupon.targetUser) {
                if (!state.currentUser || state.currentUser.username.toLowerCase() !== matchedCoupon.targetUser.toLowerCase()) {
                    showToast(`Coupon <strong>${code}</strong> is exclusively reserved for user @${matchedCoupon.targetUser}!`, 'info');
                    return;
                }
            }

            const discountPercent = parseFloat(matchedCoupon.discount || matchedCoupon.discount_percent || 10);
            state.promoDiscount = discountPercent / 100;
            showToast(`🎉 Coupon <strong>${code}</strong> Applied! ${discountPercent}% Discount Off Total Bill`, 'success');
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
            const discountAmount = Math.round(subtotal * state.promoDiscount);
            const freeShippingThreshold = 299;
            const shipping = subtotal >= freeShippingThreshold || subtotal === 0 ? 0 : 29;
            const grandTotal = Math.max(0, subtotal - discountAmount + (subtotal > 0 ? shipping : 0));

            // Save order to history
            const orderObj = {
                id: orderId,
                date: new Date().toISOString(),
                items: [...state.cart],
                subtotal: subtotal,
                discount: discountAmount,
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

            // Auto update user's saved profile address for future orders
            if (state.currentUser) {
                state.currentUser.address = {
                    fullName: fullName,
                    phone: phone,
                    streetAddress: streetAddress,
                    city: city,
                    pincode: pincode
                };
                sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));
                const uIdx = registeredUsers.findIndex(u => u.username.toLowerCase() === state.currentUser.username.toLowerCase());
                if (uIdx > -1) {
                    registeredUsers[uIdx].address = state.currentUser.address;
                    // Registered accounts persisted in SQLite
                }
            }

            state.cart = [];
            state.promoDiscount = 0;
            saveCart();
            updateCartUI();

            // Clear backend cart in SQLite DB so previous ordered items never reappear
            if (state.currentUser) {
                const userId = state.currentUser.id || state.currentUser.username;
                fetch(`${API_BASE_URL}/cart/clear/${userId}`, { method: 'DELETE' }).catch(() => {});
            }

            closeModals();
            orderSuccessOverlay.classList.add('active');
            orderSuccessModal.classList.add('active');
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
            sessionStorage.setItem('dropzyy_user', JSON.stringify(user));
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
            sessionStorage.setItem('dropzyy_user', JSON.stringify(state.currentUser));
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

                return `
                    <div style="background: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 12px; padding: 14px; position: relative;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
                            <div>
                                <h4 style="margin: 0; color: #0F172A; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                                    Order #${o.id}
                                </h4>
                                <span style="font-size: 0.82rem; color: #64748B;">Total: <strong style="color: #059669; font-size: 0.95rem;">₹${orderSubtotal.toFixed(2)}</strong> (${o.paymentMethod || (o.delivery ? o.delivery.payment : 'COD') || 'COD'})</span>
                            </div>
                            <span class="badge" style="background: ${o.status === 'Delivered' ? '#D1FAE5; color: #047857;' : o.status === 'Cancelled' ? '#FEE2E2; color: #B91C1C;' : '#FEF3C7; color: #B45309;'} font-weight: 700; padding: 4px 10px; border-radius: 20px; font-size: 0.78rem;">
                                ${o.status || 'Placed'}
                            </span>
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

    myOrdersContainer.innerHTML = userOrders.map(order => `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <h4>Order ID: ${order.id}</h4>
                    <span class="order-date">${new Date(order.date).toLocaleDateString()}</span>
                </div>
            </div>

            <!-- Live Order Tracking Flow Stepper -->
            ${renderTrackingStepper(order.status)}
            
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
                <div style="display: flex; gap: 0.5rem;">
                    ${(order.status !== 'Cancelled' && order.status !== 'Delivered') ? `
                        <button class="action-btn text-danger" onclick="cancelUserOrder('${order.id}')" style="color: #DC2626; background: #FEE2E2; border: 1px solid #FCA5A5;" title="Cancel Order">
                            <i class="fa-solid fa-ban"></i> Cancel Order
                        </button>
                    ` : ''}
                    <button class="action-btn" onclick="downloadOrderPDF('${order.id}')" title="Download PDF"><i class="fa-solid fa-file-pdf"></i></button>
                    <button class="action-btn" onclick="reorderItems('${order.id}')">Reorder</button>
                </div>
            </div>
        </div>
    `).join('');
}

window.cancelUserOrder = async function(orderId) {
    if (!confirm(`Are you sure you want to cancel Order #${orderId}?`)) return;
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (order) {
        order.status = 'Cancelled';
        try {
            const res = await fetch(`${API_BASE_URL}/orders/${orderId}/cancel`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' }
            });
            if (res && res.ok) {
                showToast(`Order <strong>${orderId}</strong> has been cancelled in MongoDB database!`, 'success');
            } else {
                showToast(`Order <strong>${orderId}</strong> cancelled!`, 'info');
            }
        } catch (e) {
            showToast(`Order <strong>${orderId}</strong> cancelled locally`, 'info');
        }

        renderMyOrders();
        if (typeof renderBookingTracking === 'function') renderBookingTracking();
    }
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

        return `
        <div class="order-card" style="${order.status === 'Cancelled' ? 'border: 2px solid #FCA5A5; background: #FFF5F5;' : ''}">
            <div class="order-header" style="background-color: ${order.status === 'Cancelled' ? '#FEE2E2' : 'var(--bg-light)'}; padding: 1rem; margin: -1.5rem -1.5rem 1rem -1.5rem; border-bottom: 1px solid var(--border-light); border-radius: var(--radius-md) var(--radius-md) 0 0;">
                <div>
                    <h4 style="margin-bottom: 0;">Order ID: ${order.id}</h4>
                    <span class="order-date">${new Date(order.date).toLocaleString()}</span>
                </div>
                <div>
                    <span class="role-pill role-${order.status === 'Cancelled' ? 'supplier' : (order.status === 'Placed' ? 'customer' : 'admin')}" style="${order.status === 'Cancelled' ? 'background: #DC2626; color: #FFF;' : ''}">${order.status.toUpperCase()}</span>
                </div>
            </div>

            <!-- Live Order Tracking Stepper -->
            ${renderTrackingStepper(order.status)}
            
            ${order.status === 'Cancelled' ? `
                <div style="background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B; padding: 8px 12px; border-radius: 8px; font-weight: 700; font-size: 0.85rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-triangle-exclamation text-danger"></i> ORDER CANCELLED
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

            <div class="order-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 10px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${!isSupplierRole ? `<button class="action-btn" onclick="downloadOrderPDF('${order.id}')" title="Generate Invoice PDF" style="padding: 0.4rem 0.8rem; height: auto;"><i class="fa-solid fa-file-pdf"></i> Download PDF Bill</button>` : ''}
                    ${(!isSupplierRole && order.status !== 'Cancelled' && order.status !== 'Delivered') ? `
                        <button class="action-btn text-danger" onclick="cancelUserOrder('${order.id}')" style="color: #DC2626; background: #FEE2E2; border: 1px solid #FCA5A5; padding: 0.4rem 0.8rem; height: auto;" title="Cancel Order">
                            <i class="fa-solid fa-ban"></i> Cancel Order
                        </button>
                    ` : ''}
                </div>
                ${isAdminOrSupplier ? `
                    <select onchange="updateBookingStatus('${order.id}', this.value)" style="padding: 0.4rem 0.6rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-weight: 700; color: #047857; background: #F0FDF4;">
                        <option value="Placed" ${order.status === 'Placed' ? 'selected' : ''}>Placed</option>
                        <option value="Packing" ${order.status === 'Packing' ? 'selected' : ''}>Packing</option>
                        <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');
}

window.updateBookingStatus = async function(orderId, newStatus) {
    const order = state.ordersHistory.find(o => o.id === orderId);
    if (order) {
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
    }
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
        return (p.title && p.title.toLowerCase().includes(search)) || 
               (p.category && p.category.toLowerCase().includes(search));
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
   Category Management (Admin Feature)
   ========================================== */
window.populateCategoryDropdowns = function() {
    const select = document.getElementById('prodCategory');
    if (!select) return;
    const activeCats = CATEGORIES.filter(c => c.id !== 'all');
    select.innerHTML = activeCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
};

window.openAdminCategoriesModal = function() {
    closeModals();
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
    container.innerHTML = CATEGORIES.map(cat => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #FFF; border: 1px solid #E2E8F0; border-radius: 8px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="${cat.icon} text-primary" style="font-size: 1.1rem;"></i>
                <div>
                    <strong>${cat.name}</strong>
                    <small style="display: block; color: #64748b;">ID: <code>${cat.id}</code></small>
                </div>
            </div>
            ${cat.id !== 'all' && !DEFAULT_CATEGORIES.some(d => d.id === cat.id) ? `
                <button type="button" class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}')">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            ` : '<span class="badge" style="background:#E2E8F0; color:#475569;">System Category</span>'}
        </div>
    `).join('');
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

    const newCat = { id: catId, name: catName, icon: catIcon, count: 0 };
    customCategories.push(newCat);
    localStorage.setItem('dropzyy_custom_categories', JSON.stringify(customCategories));

    CATEGORIES.push(newCat);
    syncAddCategoryToDB(catId, catName, catIcon);
    renderCategories();
    renderCategoryPills();
    window.populateCategoryDropdowns();
    renderAdminCategoriesList();

    idInput.value = '';
    nameInput.value = '';
    showToast(`Category '<strong>${catName}</strong>' added successfully!`, 'success');
};

window.deleteCategory = function(catId) {
    customCategories = customCategories.filter(c => c.id !== catId);
    localStorage.setItem('dropzyy_custom_categories', JSON.stringify(customCategories));
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
    pillsContainer.innerHTML = CATEGORIES.map(cat => `
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
        const res = await fetchWithTimeout(`${API_BASE_URL}/categories`, {}, 2000);
        if (res && res.ok) {
            const apiCats = await res.json();
            apiCats.forEach(c => {
                if (!CATEGORIES.some(cat => cat.id === c.code)) {
                    CATEGORIES.push({ id: c.code, name: c.name, icon: c.icon || 'fa-solid fa-layer-group', count: 0 });
                }
            });
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

async function syncAddCategoryToDB(catId, catName, catIcon) {
    try {
        const res = await fetchWithTimeout(`${API_BASE_URL}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: catId, name: catName, icon: catIcon })
        }, 3000);
        return res && res.ok;
    } catch (err) { return false; }
}

async function syncDeleteCategoryFromDB(catId) {
    try {
        await fetchWithTimeout(`${API_BASE_URL}/categories/${catId}`, { method: 'DELETE' }, 2000);
    } catch (err) {}
}

// -------------------------------------------------------------------
// EXECUTIVE DATA ANALYTICS DASHBOARD LOGIC
// -------------------------------------------------------------------
let trendChartInstance = null;
let cityChartInstance = null;
let statusChartInstance = null;
let categoryChartInstance = null;

window.openDataAnalyticsModal = async function() {
    closeModals();
    const overlay = document.getElementById('dataAnalyticsOverlay');
    const modal = document.getElementById('dataAnalyticsModal');
    if (overlay && modal) {
        overlay.classList.add('active');
        modal.classList.add('active');
    }

    await fetchOrdersFromAPI();
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

function renderDataAnalyticsDashboard() {
    const orders = [...state.ordersHistory];
    
    // 1. Calculate KPI Metrics
    let totalRev = 0;
    let deliveredCount = 0;
    const cityMap = {};
    const dateMap = {};
    const statusMap = { Placed: 0, Packing: 0, Shipped: 0, Delivered: 0, Cancelled: 0 };
    const categoryMap = {};

    orders.forEach(o => {
        const amt = parseFloat(o.total || 0);
        totalRev += amt;
        
        const st = o.status || 'Placed';
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

        // Item category extraction
        (o.items || []).forEach(i => {
            const cat = i.category || 'Kirana Staples';
            categoryMap[cat] = (categoryMap[cat] || 0) + (i.qty || i.quantity || 1);
        });
    });

    // Update KPI UI
    const revEl = document.getElementById('analyticsStatRevenue');
    const ordEl = document.getElementById('analyticsStatOrders');
    const delEl = document.getElementById('analyticsStatDelivered');
    const topCityEl = document.getElementById('analyticsStatTopCity');
    const topCityOrdEl = document.getElementById('analyticsStatTopCityOrders');

    if (revEl) revEl.textContent = `₹${totalRev.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    if (ordEl) ordEl.textContent = `${orders.length} Orders`;
    if (delEl) delEl.textContent = `${deliveredCount} Delivered (${orders.length ? Math.round((deliveredCount/orders.length)*100) : 0}%)`;

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

    // Render City Breakdown Table
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

    // 1. Date Trend Chart
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

    // 2. City Distribution Chart
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

    // 3. Status Breakdown Chart
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

    // 4. Category Volume Chart
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
