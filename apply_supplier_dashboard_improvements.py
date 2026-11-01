import os
import re

print("=== Starting Supplier Dashboard Improvements ===")

# ==============================================================================
# 1. Update main.py
# ==============================================================================
main_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\main.py'
with open(main_path, 'r', encoding='utf-8') as f:
    main_code = f.read()

old_return = '''    return {
        "status": "success",
        "username": target_username,
        "store_open": store_open,
        "message": f"Restaurant is now {'ONLINE (Open) 🟢' if store_open else 'OFFLINE (Closed) 🔴'}"
    }'''

new_return = '''    return {
        "status": "success",
        "success": True,
        "username": target_username,
        "store_open": store_open,
        "message": f"Restaurant is now {'ONLINE (Open) 🟢' if store_open else 'OFFLINE (Closed) 🔴'}"
    }'''

if old_return in main_code:
    main_code = main_code.replace(old_return, new_return, 1)
    with open(main_path, 'w', encoding='utf-8') as f:
        f.write(main_code)
    print("1. main.py updated with 'success': True")
else:
    print("1. main.py already has updated return or target not found")


# ==============================================================================
# 2. Update index.html (Add search & filter bar in Supplier Dashboard)
# ==============================================================================
index_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

target_supplier_container = '<div class="supplier-products-container" id="supplierProductsContainer">'

filter_bar_html = '''<!-- Search & Filter Controls for Supplier Products -->
        <div class="supplier-products-filter-bar" style="margin: 14px 0 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 220px; position: relative;">
                <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                <input type="text" id="supplierProductSearchInput" oninput="window.filterSupplierDashboardProducts(this.value)" placeholder="Search your items by title, category, or price..." style="width: 100%; padding: 10px 14px 10px 38px; border: 1.5px solid #CBD5E1; border-radius: 10px; font-size: 0.9rem; font-weight: 600; color: #1E293B; background: #FFFFFF; outline: none; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;" id="supplierStatusFilterButtonGroup">
                <button type="button" class="btn btn-sm" onclick="window.filterSupplierDashboardStatus('all')" id="btnFilterSupAll" style="background: #0284C7; color: white; border: none; font-weight: 700; border-radius: 8px; padding: 7px 12px; cursor: pointer;">All Items</button>
                <button type="button" class="btn btn-sm" onclick="window.filterSupplierDashboardStatus('online')" id="btnFilterSupOnline" style="background: #F1F5F9; color: #047857; border: 1px solid #CBD5E1; font-weight: 700; border-radius: 8px; padding: 7px 12px; cursor: pointer;">🟢 Online</button>
                <button type="button" class="btn btn-sm" onclick="window.filterSupplierDashboardStatus('offline')" id="btnFilterSupOffline" style="background: #F1F5F9; color: #DC2626; border: 1px solid #CBD5E1; font-weight: 700; border-radius: 8px; padding: 7px 12px; cursor: pointer;">🔴 Offline</button>
                <button type="button" class="btn btn-sm" onclick="window.filterSupplierDashboardStatus('outofstock')" id="btnFilterSupOOS" style="background: #F1F5F9; color: #B45309; border: 1px solid #CBD5E1; font-weight: 700; border-radius: 8px; padding: 7px 12px; cursor: pointer;">⚠️ Out of Stock</button>
            </div>
        </div>

        ''' + target_supplier_container

if 'id="supplierProductSearchInput"' not in html:
    assert target_supplier_container in html, "target_supplier_container not found in index.html"
    html = html.replace(target_supplier_container, filter_bar_html, 1)
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print("2. index.html updated with search and filter bar")
else:
    print("2. index.html already contains search and filter bar")


# ==============================================================================
# 3. Update style.css (Expand modal width, improve product rows for desktop & mobile)
# ==============================================================================
css_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Replace desktop supplier-dashboard-modal width
old_modal_css = '''.supplier-dashboard-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    z-index: 1000;
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-hover);
    padding: 28px;
    width: 90%;
    max-width: 620px;
    max-height: 90vh;
    overflow-y: auto;
    opacity: 0;
    visibility: hidden;
    transition: var(--transition);
}'''

new_modal_css = '''.supplier-dashboard-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.9);
    z-index: 1000;
    background: var(--bg-card);
    border-radius: 20px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
    padding: 28px 32px;
    width: 94%;
    max-width: 1040px;
    max-height: 92vh;
    overflow-y: auto;
    opacity: 0;
    visibility: hidden;
    transition: var(--transition);
}'''

if old_modal_css in css:
    css = css.replace(old_modal_css, new_modal_css, 1)
    print("3a. style.css updated modal desktop width to 1040px")

# Replace supplier-products-container max-height
old_prod_container = '''.supplier-products-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 320px;
    overflow-y: auto;
}'''

new_prod_container = '''.supplier-products-container {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-height: 580px;
    overflow-y: auto;
    padding-right: 6px;
}
.supplier-products-container::-webkit-scrollbar {
    width: 6px;
}
.supplier-products-container::-webkit-scrollbar-thumb {
    background: #CBD5E1;
    border-radius: 4px;
}'''

if old_prod_container in css:
    css = css.replace(old_prod_container, new_prod_container, 1)
    print("3b. style.css updated supplier-products-container max-height to 580px")

# Replace supplier-item-row styles
old_item_row = '''.supplier-item-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
}
.supplier-item-thumb {
    width: 50px;
    height: 50px;
    border-radius: var(--radius-sm);
    object-fit: cover;
}
.supplier-item-info {
    flex: 1;
}
.supplier-item-title { font-weight: 700; font-size: 0.9rem; }
.supplier-item-meta { font-size: 0.78rem; color: var(--text-muted); }
.supplier-item-actions { display: flex; gap: 8px; }'''

new_item_row = '''.supplier-item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    background: #FFFFFF;
    border: 1.5px solid #E2E8F0;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.03);
    transition: all 0.2s ease;
}
.supplier-item-row:hover {
    border-color: #CBD5E1;
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.supplier-item-thumb {
    width: 66px;
    height: 66px;
    border-radius: 12px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid #E2E8F0;
}
.supplier-item-info {
    flex: 1;
    min-width: 0;
}
.supplier-item-title {
    font-weight: 800;
    font-size: 1.02rem;
    color: #0F172A;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}
.supplier-item-meta {
    font-size: 0.85rem;
    color: #64748B;
    line-height: 1.4;
}
.supplier-item-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: nowrap;
    flex-shrink: 0;
}
.supplier-item-actions .btn {
    white-space: nowrap !important;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 8px 12px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    box-sizing: border-box;
    transition: all 0.15s ease;
}'''

if old_item_row in css:
    css = css.replace(old_item_row, new_item_row, 1)
    print("3c. style.css updated supplier-item-row styles")

# Responsive styles for mobile (max-width: 768px)
mobile_supplier_styles = '''
/* Supplier Dashboard Mobile Responsiveness Improvements */
@media (max-width: 768px) {
    .supplier-dashboard-modal {
        width: 96% !important;
        max-width: 96% !important;
        padding: 16px 12px !important;
        border-radius: 16px !important;
        max-height: 94vh !important;
    }
    .supplier-products-container {
        max-height: 65vh !important;
    }
    .supplier-item-row {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 12px !important;
        padding: 14px !important;
        border-radius: 14px !important;
    }
    .supplier-item-row-top {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        width: 100% !important;
    }
    .supplier-item-actions {
        width: 100% !important;
        display: grid !important;
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 8px !important;
        margin-top: 6px !important;
        padding-top: 10px !important;
        border-top: 1px dashed #E2E8F0 !important;
    }
    .supplier-item-actions .btn {
        width: 100% !important;
        justify-content: center !important;
        font-size: 0.76rem !important;
        padding: 8px 6px !important;
        height: 38px !important;
    }
    .supplier-item-actions .btn-delete-mobile-span {
        grid-column: span 2 !important;
    }
}
'''

if "Supplier Dashboard Mobile Responsiveness Improvements" not in css:
    css = css + mobile_supplier_styles
    print("3d. style.css added mobile responsiveness rules")

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)


# ==============================================================================
# 4. Update app.js (Emergency toggle condition, improved rows, search/filter logic)
# ==============================================================================
app_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\app.js'
with open(app_path, 'r', encoding='utf-8') as f:
    js = f.read()

# 4a. Fix if (res.ok && data.success) in toggleStoreEmergencyOfflineStatus
old_condition = "if (res.ok && data.success) {"
new_condition = "if (res.ok && (data.success || data.status === 'success' || data.store_open !== undefined)) {"
if old_condition in js:
    js = js.replace(old_condition, new_condition, 1)
    print("4a. app.js fixed toggleStoreEmergencyOfflineStatus success condition")

# 4b. Update renderSupplierDashboard product row template
old_map_start = "supplierProductsContainer.innerHTML = supplierProducts.map(p => {"
assert old_map_start in js, "old_map_start not found in app.js"

# Find end of map
map_pos = js.find(old_map_start)
map_end = js.find("}).join('');", map_pos)
assert map_end != -1, "map_end not found"

new_map_code = '''// Store active filter state for supplier dashboard
    window._supplierProductsListCache = supplierProducts;
    window._supplierDashboardFilterQuery = window._supplierDashboardFilterQuery || '';
    window._supplierDashboardFilterStatus = window._supplierDashboardFilterStatus || 'all';

    renderFilteredSupplierProductsList();
    }'''

# Replace the supplierProductsContainer.innerHTML = ... block
old_block = js[map_pos:map_end + len("}).join('');")]

new_render_helper = '''window.renderFilteredSupplierProductsList = function() {
        const container = document.getElementById('supplierProductsContainer');
        if (!container) return;

        let list = window._supplierProductsListCache || [];
        const q = (window._supplierDashboardFilterQuery || '').trim().toLowerCase();
        const stat = window._supplierDashboardFilterStatus || 'all';

        // Filter by search query
        if (q) {
            list = list.filter(p => 
                (p.title && p.title.toLowerCase().includes(q)) ||
                (p.category && p.category.toLowerCase().includes(q)) ||
                (p.price && String(p.price).includes(q))
            );
        }

        // Filter by status
        if (stat === 'online') {
            list = list.filter(p => isProductOnline(p));
        } else if (stat === 'offline') {
            list = list.filter(p => !isProductOnline(p));
        } else if (stat === 'outofstock') {
            list = list.filter(p => (p.in_stock === false || (p.stock_quantity !== undefined && p.stock_quantity !== null && Number(p.stock_quantity) <= 0)));
        }

        if (list.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 36px 20px; color: #64748B; background: #F8FAFC; border-radius: 12px; border: 1.5px dashed #CBD5E1;">
                <i class="fa-solid fa-box-open" style="font-size: 2rem; color: #94A3B8; margin-bottom: 8px;"></i>
                <p style="margin: 0; font-weight: 700; font-size: 0.95rem;">No products match your search or filter.</p>
                <small style="color: #94A3B8;">Try changing keywords or clearing the active filter.</small>
            </div>`;
            return;
        }

        const isSystemAdmin = state.currentUser && (state.currentUser.role === 'admin' || state.currentUser.role === 'sub_admin');
        const companyName = (state.currentUser && (state.currentUser.supplier_company_name || state.currentUser.full_name || state.currentUser.username)) || 'Store';

        container.innerHTML = list.map(p => {
            const isOnline = isProductOnline(p);
            const isOOS = (p.in_stock === false || (p.stock_quantity !== undefined && p.stock_quantity !== null && Number(p.stock_quantity) <= 0));
            const isCustVisible = p.show_stock_to_customer !== false;

            return `
                <div class="supplier-item-row" style="${!isOnline ? 'background: #FFF8F8; border: 1.5px solid #FECACA;' : ''}">
                    <div class="supplier-item-row-top" style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
                        <img src="${p.image}" alt="${p.title}" class="supplier-item-thumb">
                        <div class="supplier-item-info">
                            <div class="supplier-item-title">
                                <span style="font-weight: 800; font-size: 1rem; color: #0F172A;">${p.title}</span>
                                <span class="badge" style="background: ${isOnline ? '#ECFDF5' : '#FEF2F2'}; color: ${isOnline ? '#047857' : '#DC2626'}; border: 1px solid ${isOnline ? '#A7F3D0' : '#FECACA'}; font-weight: 800; font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid ${isOnline ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> ${isOnline ? 'ONLINE' : 'OFFLINE'}
                                </span>
                                ${isOOS
                                    ? `<span class="badge" style="background:#FEF2F2; color:#991B1B; border:1px solid #FECACA; font-size:0.72rem; padding:3px 8px; border-radius:6px; font-weight:800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-ban"></i> OUT OF STOCK</span>`
                                    : `<span class="badge" style="background:#ECFDF5; color:#065F46; border:1px solid #A7F3D0; font-size:0.72rem; padding:3px 8px; border-radius:6px; font-weight:800; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-boxes-stacked"></i> Stock: ${p.stock_quantity ?? 50}</span>`
                                }
                                ${isCustVisible
                                    ? `<span class="badge" style="background:#EFF6FF; color:#1E40AF; border:1px solid #BFDBFE; font-size:0.72rem; padding:3px 8px; border-radius:6px; font-weight:700; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-eye"></i> Visible</span>`
                                    : `<span class="badge" style="background:#F8FAFC; color:#64748B; border:1px solid #CBD5E1; font-size:0.72rem; padding:3px 8px; border-radius:6px; font-weight:700; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-eye-slash"></i> Hidden</span>`
                                }
                            </div>
                            <div class="supplier-item-meta" style="margin-top: 3px;">
                                <span style="font-weight: 600; color: #475569;">${p.category || 'General'}</span>
                                ${p.unit ? ` • <span style="color: #64748B;">${p.unit}</span>` : ''}
                                • <strong style="color: #059669; font-size: 0.95rem;">₹${p.price}</strong>
                                ${(p.supplierName || companyName) ? ` • <span style="color: #6366F1; font-weight: 600;"><i class="fa-solid fa-store"></i> ${p.supplierName || companyName}</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div class="supplier-item-actions">
                        <button type="button" class="btn btn-sm" onclick="toggleProductOnlineStatus('${p.id}')" style="background: ${isOnline ? '#FEF2F2' : '#ECFDF5'}; color: ${isOnline ? '#DC2626' : '#047857'}; border: 1px solid ${isOnline ? '#FECACA' : '#A7F3D0'};" title="${isOnline ? 'Take product offline' : 'Bring product online'}">
                            <i class="fa-solid ${isOnline ? 'fa-power-off' : 'fa-circle-check'}"></i> ${isOnline ? 'Set Offline' : 'Set Online'}
                        </button>
                        <button type="button" class="btn btn-sm" onclick="toggleProductStockStatus('${p.id}')" style="background: ${isOOS ? '#ECFDF5' : '#FFFBEB'}; color: ${isOOS ? '#047857' : '#B45309'}; border: 1px solid ${isOOS ? '#A7F3D0' : '#FDE68A'};" title="Toggle stock availability">
                            <i class="fa-solid ${isOOS ? 'fa-box-archive' : 'fa-ban'}"></i> ${isOOS ? 'Set In Stock' : 'Set Out Stock'}
                        </button>
                        <button type="button" class="btn btn-sm" onclick="toggleProductStockVisibility('${p.id}')" style="background: ${isCustVisible ? '#EFF6FF' : '#F8FAFC'}; color: ${isCustVisible ? '#1D4ED8' : '#64748B'}; border: 1px solid ${isCustVisible ? '#BFDBFE' : '#CBD5E1'};" title="Toggle customer stock visibility">
                            <i class="fa-solid ${isCustVisible ? 'fa-eye' : 'fa-eye-slash'}"></i> ${isCustVisible ? 'Cust: Visible' : 'Cust: Hidden'}
                        </button>
                        <button type="button" class="btn btn-sm" onclick="openEditProductModal('${p.id}')" style="background: #F1F5F9; color: #334155; border: 1px solid #CBD5E1;" title="Edit product details">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button type="button" class="btn btn-sm btn-delete-mobile-span" onclick="deleteProduct('${p.id}')" style="background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA;" title="Delete product">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    };

    window.filterSupplierDashboardProducts = function(query) {
        window._supplierDashboardFilterQuery = query || '';
        if (typeof window.renderFilteredSupplierProductsList === 'function') {
            window.renderFilteredSupplierProductsList();
        }
    };

    window.filterSupplierDashboardStatus = function(status) {
        window._supplierDashboardFilterStatus = status || 'all';
        const btns = {
            'all': document.getElementById('btnFilterSupAll'),
            'online': document.getElementById('btnFilterSupOnline'),
            'offline': document.getElementById('btnFilterSupOffline'),
            'outofstock': document.getElementById('btnFilterSupOOS')
        };
        Object.keys(btns).forEach(k => {
            const b = btns[k];
            if (!b) return;
            if (k === status) {
                b.style.background = '#0284C7';
                b.style.color = '#FFFFFF';
                b.style.border = 'none';
            } else {
                b.style.background = '#F1F5F9';
                b.style.color = (k === 'online' ? '#047857' : (k === 'offline' ? '#DC2626' : (k === 'outofstock' ? '#B45309' : '#334155')));
                b.style.border = '1px solid #CBD5E1';
            }
        });
        if (typeof window.renderFilteredSupplierProductsList === 'function') {
            window.renderFilteredSupplierProductsList();
        }
    };

    '''

new_block = '''// Store active catalog cache and render helper
    window._supplierProductsListCache = supplierProducts;
    window._supplierDashboardFilterQuery = window._supplierDashboardFilterQuery || '';
    window._supplierDashboardFilterStatus = window._supplierDashboardFilterStatus || 'all';

    window.renderFilteredSupplierProductsList();
    }'''

js = js[:map_pos] + new_render_helper + js[map_end + len("}).join('');"): ]
print("4b. app.js updated renderSupplierDashboard with enhanced responsive product rows and search/filters")

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(js)

print("=== ALL IMPROVEMENTS APPLIED SUCCESSFULLY ===")
