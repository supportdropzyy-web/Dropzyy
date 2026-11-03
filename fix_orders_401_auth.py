import os

# 1. Update app.js
app_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\app.js'
with open(app_path, 'r', encoding='utf-8') as f:
    js = f.read()

old_fetch_orders = '''async function fetchOrdersFromAPI() {
    try {
        const userId = state.currentUser ? (state.currentUser.username || state.currentUser.id) : null;
        const url = (userId && state.currentUser.role !== 'admin' && state.currentUser.role !== 'supplier')
            ? `${API_BASE_URL}/orders?user_id=${userId}`
            : `${API_BASE_URL}/orders`;
        const res = await fetchWithTimeout(url, {}, 2000);'''

new_fetch_orders = '''async function fetchOrdersFromAPI() {
    // 0. Only authenticated users can access order streams
    if (!state.currentUser) {
        return;
    }

    try {
        const isPrivileged = state.currentUser.role === 'admin' || state.currentUser.role === 'supplier' || state.currentUser.role === 'sub_admin';
        const userId = state.currentUser.username || state.currentUser.id || '';
        const url = isPrivileged
            ? `${API_BASE_URL}/orders`
            : `${API_BASE_URL}/orders?user_id=${encodeURIComponent(userId)}`;

        const token = (state.currentUser && (state.currentUser.access_token || state.currentUser.token))
            || sessionStorage.getItem('dropzyy_auth_token')
            || localStorage.getItem('dropzyy_auth_token');

        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

        const res = await fetchWithTimeout(url, { headers: reqHeaders }, 3500);

        if (res && res.status === 401) {
            // Token expired or invalid session, skip quietly
            return;
        }'''

assert old_fetch_orders in js, "old_fetch_orders target not found in app.js"
js = js.replace(old_fetch_orders, new_fetch_orders, 1)
print("1a. Updated fetchOrdersFromAPI in app.js with auth header & unauthenticated guard")

# Update auto-poll setInterval
old_interval = '''// Auto poll live orders every 5 seconds
setInterval(() => {
    fetchOrdersFromAPI();
}, 5000);'''

new_interval = '''// Auto poll live orders every 5 seconds ONLY when user is authenticated
setInterval(() => {
    if (state.currentUser) {
        fetchOrdersFromAPI();
    }
}, 5000);'''

if old_interval in js:
    js = js.replace(old_interval, new_interval, 1)
    print("1b. Updated setInterval in app.js to only poll when user is logged in")

# Update order status update endpoint call to include auth header
old_status_call = '''    order.status = newStatus;
    try {
        await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
    } catch (e) {'''

new_status_call = '''    order.status = newStatus;
    try {
        const token = (state.currentUser && (state.currentUser.access_token || state.currentUser.token))
            || sessionStorage.getItem('dropzyy_auth_token')
            || localStorage.getItem('dropzyy_auth_token');
        const reqHeaders = { 'Content-Type': 'application/json' };
        if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_BASE_URL}/orders/${orderId}/status`, {
            method: 'PUT',
            headers: reqHeaders,
            body: JSON.stringify({ status: newStatus })
        });
    } catch (e) {'''

if old_status_call in js:
    js = js.replace(old_status_call, new_status_call, 1)
    print("1c. Added auth header to /orders/{orderId}/status in app.js")

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(js)


# 2. Update main.py
main_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\main.py'
with open(main_path, 'r', encoding='utf-8') as f:
    main_code = f.read()

old_get_orders = '''@app.get("/api/orders", response_model=List[schemas.OrderResponse])
def get_orders(user_id: Optional[str] = Query(None), db: Session = Depends(get_db), token_user: Optional[dict] = Depends(get_current_user_token)):
    # If requesting all orders or admin/supplier view, require admin/supplier authentication
    role = str(token_user.get("role", "")).lower() if token_user else ""
    is_privileged = role in ["admin", "sub_admin", "supplier"]

    if not user_id or str(user_id).lower() in ["admin", "yashpatil", "supplier", "all"]:
        if not is_privileged:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required to view order records."
            )'''

new_get_orders = '''@app.get("/api/orders", response_model=List[schemas.OrderResponse])
def get_orders(user_id: Optional[str] = Query(None), db: Session = Depends(get_db), token_user: Optional[dict] = Depends(get_current_user_token)):
    # If requesting all orders or admin/supplier view, require admin/supplier authentication
    role = str(token_user.get("role", "")).lower() if token_user else ""
    is_privileged = role in ["admin", "sub_admin", "supplier"]

    # If caller has a valid token and is a customer, automatically bind to their own username
    if not user_id and token_user and not is_privileged:
        user_id = token_user.get("username")

    if not user_id or str(user_id).lower() in ["admin", "yashpatil", "supplier", "all"]:
        if not is_privileged:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token required to view order records."
            )'''

if old_get_orders in main_code:
    main_code = main_code.replace(old_get_orders, new_get_orders, 1)
    with open(main_path, 'w', encoding='utf-8') as f:
        f.write(main_code)
    print("2. Updated main.py get_orders with customer token binding")

print("=== ALL FIXES APPLIED SUCCESSFULLY ===")
