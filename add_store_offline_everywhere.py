import os

# 1. Update index.html
index_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

target_supplier_btn = '''<button class="action-btn supplier-dashboard-btn hidden" id="supplierDashboardBtn" title="Supplier Dashboard">
                    <i class="fa-solid fa-boxes-packing text-primary"></i>
                    <span>My Products</span>
                </button>'''

new_top_emergency_btn = target_supplier_btn + '''

                <button class="action-btn supplier-emergency-top-btn hidden" id="supplierEmergencyTopBtn" onclick="window.toggleCurrentSupplierEmergencyOffline()" title="Immediate Emergency Store Status Toggle" style="font-weight: 700; border-radius: 8px; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s;">
                    <i class="fa-solid fa-power-off"></i>
                    <span id="supplierEmergencyTopBtnText">Store: ONLINE 🟢</span>
                </button>'''

if 'id="supplierEmergencyTopBtn"' not in html:
    assert target_supplier_btn in html, "target_supplier_btn not found in index.html"
    html = html.replace(target_supplier_btn, new_top_emergency_btn, 1)
    print("Added supplierEmergencyTopBtn to index.html adminToolbar")

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("index.html successfully updated")


# 2. Update app.js
app_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\app.js'
with open(app_path, 'r', encoding='utf-8') as f:
    code = f.read()

# A. Add button reference & update logic in updateAuthUI
target_supplier_role_check = "if (supplierDashboardBtn) supplierDashboardBtn.classList.remove('hidden');"
assert target_supplier_role_check in code, "target_supplier_role_check not found in app.js"

top_btn_update_code = target_supplier_role_check + """
            const topEmergBtn = document.getElementById('supplierEmergencyTopBtn');
            const topEmergText = document.getElementById('supplierEmergencyTopBtnText');
            if (topEmergBtn) {
                topEmergBtn.classList.remove('hidden');
                const liveSup = registeredUsers.find(u => (u.username || '').toLowerCase() === (state.currentUser.username || '').toLowerCase()) || state.currentUser;
                const isStoreOpen = (liveSup.store_open !== false);
                if (isStoreOpen) {
                    topEmergBtn.style.background = '#ECFDF5';
                    topEmergBtn.style.color = '#047857';
                    topEmergBtn.style.border = '1.5px solid #10B981';
                    if (topEmergText) topEmergText.innerHTML = `Store: ONLINE 🟢 <small style="opacity:0.8; font-weight:600;">(Emergency Off)</small>`;
                } else {
                    topEmergBtn.style.background = '#DC2626';
                    topEmergBtn.style.color = '#FFFFFF';
                    topEmergBtn.style.border = '1.5px solid #991B1B';
                    if (topEmergText) topEmergText.innerHTML = `🚨 Store: EMERGENCY OFFLINE 🔴 <small style="opacity:0.9; font-weight:700;">(Turn ON)</small>`;
                }
            }"""

if 'supplierEmergencyTopBtn' not in code:
    code = code.replace(target_supplier_role_check, top_btn_update_code, 1)
    print("Added topEmergBtn handling to updateAuthUI")

# Also hide topEmergBtn for non-suppliers in updateAuthUI
target_hide_supplier_btn = "if (supplierDashboardBtn) supplierDashboardBtn.classList.add('hidden');"
hide_top_emerg_code = target_hide_supplier_btn + """
        const topEmergBtnHide = document.getElementById('supplierEmergencyTopBtn');
        if (topEmergBtnHide && (!state.currentUser || state.currentUser.role !== 'supplier')) {
            topEmergBtnHide.classList.add('hidden');
        }"""

if 'topEmergBtnHide' not in code:
    code = code.replace(target_hide_supplier_btn, hide_top_emerg_code, 1)
    print("Added topEmergBtnHide handling to updateAuthUI")


# B. Add 1-click Emergency button directly on Restaurant Card in renderRestaurants
target_rest_card_btn = """${state.currentUser && state.currentUser.role === 'supplier' && window.isSameSupplierEntity(sup, state.currentUser) ? `
                                <button type="button" onclick="openSupplierDashboard(); event.stopPropagation();" title="Manage your restaurant" style="background: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-gear"></i> Manage
                                </button>
                            ` : ''}"""

card_emergency_btn = target_rest_card_btn + """
                            ${(state.currentUser && (state.currentUser.role === 'admin' || (state.currentUser.role === 'supplier' && window.isSameSupplierEntity(sup, state.currentUser)))) ? `
                                <button type="button" onclick="window.toggleStoreEmergencyOfflineStatus(${isOpen ? 'false' : 'true'}, '${sup.username || sup.id}'); event.stopPropagation();" style="background: ${isOpen ? '#FEF2F2' : '#ECFDF5'}; color: ${isOpen ? '#DC2626' : '#047857'}; border: 1.5px solid ${isOpen ? '#FECACA' : '#A7F3D0'}; border-radius: 8px; padding: 6px 10px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="${isOpen ? 'Emergency take store offline immediately' : 'Bring store online'}">
                                    <i class="fa-solid ${isOpen ? 'fa-power-off' : 'fa-circle-check'}"></i> ${isOpen ? '🚨 Emergency Offline' : '🟢 Bring Online'}
                                </button>
                            ` : ''}"""

if "window.toggleStoreEmergencyOfflineStatus(${isOpen ? 'false' : 'true'}" not in code:
    assert target_rest_card_btn in code, "target_rest_card_btn not found in app.js"
    code = code.replace(target_rest_card_btn, card_emergency_btn, 1)
    print("Added Emergency button to restaurant card in renderRestaurants")


# C. Add 1-click Emergency button in Restaurant Menu Modal Header (renderRestaurantMenuModalContent)
target_modal_header_actions = """${state.currentUser && state.currentUser.role === 'supplier' && window.isSameSupplierEntity(target, state.currentUser) ? `
                        <button type="button" class="btn btn-sm" onclick="supplierDeleteMyRestaurant()" style="background: #DC2626; color: white; border: none; padding: 4px 10px; border-radius: 8px; font-size: 0.74rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-trash-can"></i> Delete Store
                        </button>
                    ` : ''}"""

modal_emergency_btn = """${(state.currentUser && (state.currentUser.role === 'admin' || (state.currentUser.role === 'supplier' && window.isSameSupplierEntity(target, state.currentUser)))) ? `
                        <button type="button" class="btn btn-sm" onclick="window.toggleStoreEmergencyOfflineStatus(${isOpen ? 'false' : 'true'}, '${target.username || target.id}')" style="background: ${isOpen ? '#DC2626' : '#10B981'}; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.78rem; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);" title="${isOpen ? 'Emergency Store Offline' : 'Bring Store Online'}">
                            <i class="fa-solid ${isOpen ? 'fa-power-off' : 'fa-circle-check'}"></i> ${isOpen ? '🚨 Emergency Offline' : '🟢 Bring Online'}
                        </button>
                    ` : ''}
                    """ + target_modal_header_actions

if "supplierDeleteMyRestaurant" in code and "onclick=\"window.toggleStoreEmergencyOfflineStatus(${isOpen ? 'false' : 'true'}, '${target.username" not in code:
    assert target_modal_header_actions in code, "target_modal_header_actions not found in app.js"
    code = code.replace(target_modal_header_actions, modal_emergency_btn, 1)
    print("Added Emergency button to Restaurant Menu Modal Header")

# D. In toggleStoreEmergencyOfflineStatus, ensure updateAuthUI is also called
target_refresh_call = "if (typeof renderSupplierDashboard === 'function') renderSupplierDashboard();"
refresh_with_auth = target_refresh_call + "\n            if (typeof updateAuthUI === 'function') updateAuthUI();"

if "if (typeof updateAuthUI === 'function') updateAuthUI();" not in code:
    code = code.replace(target_refresh_call, refresh_with_auth, 1)
    print("Added updateAuthUI call to toggleStoreEmergencyOfflineStatus")

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("app.js successfully updated with multi-location offline buttons!")
