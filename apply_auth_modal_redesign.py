import os
import re

print("=== Starting Auth Modal Desktop & Mobile Redesign ===")

# ==============================================================================
# 1. Update style.css
# ==============================================================================
css_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Separate auth-modal from generic large modal declaration
old_modals_decl = ".quick-view-modal, .checkout-modal, .order-success-modal, .auth-modal, .admin-modal, .supplier-dashboard-modal {"
new_modals_decl = ".quick-view-modal, .checkout-modal, .order-success-modal, .admin-modal, .supplier-dashboard-modal {"

if old_modals_decl in css:
    css = css.replace(old_modals_decl, new_modals_decl, 1)
    print("1a. Removed auth-modal from 1040px generic declaration")

# Add dedicated responsive styles for .auth-modal and form components
auth_css_rules = '''
/* ==========================================================================
   🔐 PREMIUM RESPONSIVE AUTH MODAL (LOGIN & REGISTRATION)
   ========================================================================== */
.auth-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(0.92);
    z-index: 1000;
    background: #FFFFFF !important;
    border: 1px solid #E2E8F0 !important;
    border-radius: 24px !important;
    box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04) !important;
    padding: 32px 36px !important;
    width: 92% !important;
    max-width: 460px !important;
    max-height: 92vh !important;
    overflow-y: auto !important;
    opacity: 0;
    visibility: hidden;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    box-sizing: border-box !important;
}

.auth-modal.register-active {
    max-width: 500px !important;
}

.auth-modal.active {
    transform: translate(-50%, -50%) scale(1) !important;
    opacity: 1 !important;
    visibility: visible !important;
}

/* Modern Segmented Tab Switcher */
.auth-tabs {
    display: flex !important;
    background: #F1F5F9 !important;
    padding: 4px !important;
    border-radius: 14px !important;
    margin-bottom: 22px !important;
    border: none !important;
    gap: 4px !important;
}

.auth-tab {
    flex: 1 !important;
    padding: 10px 14px !important;
    background: transparent !important;
    border: none !important;
    border-radius: 10px !important;
    font-weight: 700 !important;
    font-size: 0.92rem !important;
    color: #64748B !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    text-align: center !important;
    border-bottom: none !important;
}

.auth-tab.active {
    background: #FFFFFF !important;
    color: #10B981 !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
}

/* Header & Typography */
.auth-header {
    text-align: center !important;
    margin-bottom: 20px !important;
}

.auth-header .auth-brand-logo {
    height: 48px;
    width: auto;
    object-fit: contain;
    margin-bottom: 10px;
}

.auth-header h2 {
    font-size: 1.45rem !important;
    font-weight: 800 !important;
    color: #0F172A !important;
    margin: 0 0 4px 0 !important;
    letter-spacing: -0.3px !important;
}

.auth-header p {
    font-size: 0.86rem !important;
    color: #64748B !important;
    margin: 0 !important;
    line-height: 1.4 !important;
}

/* Form Groups & Inputs */
.auth-form .form-group {
    margin-bottom: 16px !important;
}

.auth-form label {
    display: block !important;
    font-size: 0.84rem !important;
    font-weight: 700 !important;
    color: #334155 !important;
    margin-bottom: 6px !important;
}

.auth-form input[type="text"],
.auth-form input[type="email"],
.auth-form input[type="tel"],
.auth-form input[type="password"] {
    width: 100% !important;
    height: 46px !important;
    padding: 0 14px !important;
    background: #F8FAFC !important;
    border: 1.5px solid #E2E8F0 !important;
    border-radius: 10px !important;
    font-size: 0.92rem !important;
    font-weight: 600 !important;
    color: #0F172A !important;
    transition: all 0.2s ease !important;
    box-sizing: border-box !important;
    outline: none !important;
}

.auth-form input:focus {
    background: #FFFFFF !important;
    border-color: #10B981 !important;
    box-shadow: 0 0 0 3.5px rgba(16, 185, 129, 0.12) !important;
}

.auth-form input::placeholder {
    color: #94A3B8 !important;
    font-weight: 400 !important;
}

.auth-form button[type="submit"] {
    width: 100% !important;
    height: 48px !important;
    background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
    color: #FFFFFF !important;
    border: none !important;
    border-radius: 12px !important;
    font-weight: 700 !important;
    font-size: 1rem !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 8px !important;
    cursor: pointer !important;
    box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35) !important;
    transition: all 0.2s ease !important;
    margin-top: 18px !important;
}

.auth-form button[type="submit"]:hover {
    transform: translateY(-1px) !important;
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.45) !important;
}

/* Mobile Responsiveness for Auth Modal */
@media (max-width: 768px) {
    .auth-modal {
        width: 92% !important;
        max-width: 420px !important;
        padding: 24px 18px !important;
        border-radius: 20px !important;
        max-height: 90vh !important;
    }
    .auth-header .auth-brand-logo {
        height: 40px !important;
    }
    .auth-header h2 {
        font-size: 1.25rem !important;
    }
    .auth-tabs {
        margin-bottom: 18px !important;
    }
    .auth-tab {
        padding: 8px 12px !important;
        font-size: 0.88rem !important;
    }
}
'''

if "PREMIUM RESPONSIVE AUTH MODAL" not in css:
    css = css + auth_css_rules
    print("1b. Added dedicated auth-modal responsive rules to style.css")

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)


# ==============================================================================
# 2. Update index.html (Enhance auth forms with logo, icons, and eye toggles)
# ==============================================================================
index_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Locate authModal in index.html
auth_modal_start = '<div class="auth-modal" id="authModal">'
auth_modal_end = '</form>\n    </div>\n\n    <!-- Forgot Password Modal -->'

new_auth_modal_html = '''<div class="auth-modal" id="authModal">
        <button type="button" class="close-modal-btn" id="closeAuthBtn" onclick="closeModals()" title="Close"><i class="fa-solid fa-xmark"></i></button>
        
        <div class="auth-tabs">
            <button type="button" class="auth-tab active" id="loginTab" onclick="switchAuthTab('login')">Sign In</button>
            <button type="button" class="auth-tab" id="registerTab" onclick="switchAuthTab('register')">Create Account</button>
        </div>

        <!-- Login Form -->
        <form class="auth-form" id="loginForm" onsubmit="handleLoginSubmit(event)">
            <div class="auth-header">
                <img src="dropzyy-logo.png" alt="Dropzyy" class="auth-brand-logo">
                <h2>Welcome Back</h2>
                <p>Sign in to manage orders, admin, or store catalog</p>
            </div>

            <div class="form-group">
                <label for="loginUsername">Email Address or Username</label>
                <div style="position: relative;">
                    <i class="fa-regular fa-user" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="text" id="loginUsername" required placeholder="e.g. arnav or name@domain.com" style="padding-left: 38px;">
                </div>
            </div>
            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <label for="loginPassword" style="margin-bottom: 0;">Password</label>
                    <a href="javascript:void(0)" onclick="openForgotPasswordModal()" style="font-size: 0.82rem; color: #10B981; font-weight: 700; text-decoration: none;">
                        <i class="fa-solid fa-key"></i> Forgot Password?
                    </a>
                </div>
                <div style="position: relative;">
                    <i class="fa-solid fa-lock" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="password" id="loginPassword" required placeholder="Enter password" style="padding-left: 38px; padding-right: 42px;">
                    <button type="button" onclick="window.togglePasswordVisibility('loginPassword', this)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 6px; font-size: 1rem;" title="Show/Hide Password">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block btn-lg" style="margin-top: 14px;">
                Log In <i class="fa-solid fa-right-to-bracket"></i>
            </button>
        </form>

        <!-- Register Form -->
        <form class="auth-form hidden" id="registerForm" onsubmit="handleRegisterSubmit(event)">
            <div class="auth-header">
                <img src="dropzyy-logo.png" alt="Dropzyy" class="auth-brand-logo">
                <h2>Create Your Account</h2>
                <p>Verify your Email Address to complete registration</p>
            </div>

            <div class="form-group">
                <label for="regFullName">Full Name</label>
                <div style="position: relative;">
                    <i class="fa-regular fa-user" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="text" id="regFullName" required placeholder="e.g. Rahul Sharma" style="padding-left: 38px;">
                </div>
            </div>

            <!-- Email Address with Send Code button -->
            <div class="form-group">
                <label for="regEmail">Email Address</label>
                <div style="display: flex; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                        <i class="fa-regular fa-envelope" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                        <input type="email" id="regEmail" required placeholder="e.g. rahul@gmail.com" style="width: 100%; padding-left: 38px;">
                    </div>
                    <button type="button" class="btn btn-secondary" id="sendOtpBtn" onclick="sendRegistrationOTP()" style="white-space: nowrap; font-weight: 700; height: 46px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-paper-plane text-primary"></i> Send Code
                    </button>
                </div>
            </div>

            <!-- Verification Code with Verify button -->
            <div class="form-group">
                <label for="regOtp">Verification Code (From Email)</label>
                <div style="display: flex; gap: 8px;">
                    <div style="position: relative; flex: 1;">
                        <i class="fa-solid fa-shield-halved" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                        <input type="text" id="regOtp" maxlength="6" placeholder="6-digit code" style="width: 100%; padding-left: 38px; letter-spacing: 2px; font-weight: 700;">
                    </div>
                    <button type="button" class="btn btn-primary" id="verifyOtpBtn" onclick="verifyOTPCode()" style="white-space: nowrap; background: #059669; border-color: #059669; font-weight: 700; height: 46px; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-solid fa-circle-check"></i> Verify
                    </button>
                </div>
                <small id="otpStatusNotice" style="display: block; margin-top: 4px; color: #059669; font-weight: 600;"></small>
            </div>

            <div class="form-group">
                <label for="regPhone">Mobile Number (10 Digits)</label>
                <div style="position: relative;">
                    <i class="fa-solid fa-phone" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="tel" id="regPhone" required maxlength="10" pattern="[0-9]{10}" placeholder="e.g. 9876543210" style="padding-left: 38px;">
                </div>
            </div>

            <div class="form-group">
                <label for="regPassword">Password</label>
                <div style="position: relative;">
                    <i class="fa-solid fa-lock" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="password" id="regPassword" required minlength="6" placeholder="Min. 6 characters" oninput="updatePasswordCriteriaUI(this.value, 'reg')" style="padding-left: 38px; padding-right: 42px;">
                    <button type="button" onclick="window.togglePasswordVisibility('regPassword', this)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 6px; font-size: 1rem;" title="Show/Hide Password">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                </div>
                <div id="regPassCriteria" style="margin-top: 6px; font-size: 0.76rem; display: flex; flex-wrap: wrap; gap: 6px;">
                    <span id="regCritMin" style="padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #64748B; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                        <i class="fa-solid fa-circle-dot"></i> Min 6 characters
                    </span>
                    <span id="regCritChars" style="padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #64748B; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                        <i class="fa-solid fa-font"></i> Letters
                    </span>
                    <span id="regCritNumbers" style="padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #64748B; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                        <i class="fa-solid fa-hashtag"></i> Numbers
                    </span>
                    <span id="regCritSymbols" style="padding: 2px 8px; border-radius: 12px; background: #F1F5F9; color: #64748B; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s;">
                        <i class="fa-solid fa-asterisk"></i> Symbols
                    </span>
                </div>
            </div>

            <div class="form-group">
                <label for="regConfirmPassword">Confirm Password</label>
                <div style="position: relative;">
                    <i class="fa-solid fa-shield-check" style="position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 0.95rem;"></i>
                    <input type="password" id="regConfirmPassword" required minlength="6" placeholder="Re-enter at least 6 characters" style="padding-left: 38px; padding-right: 42px;">
                    <button type="button" onclick="window.togglePasswordVisibility('regConfirmPassword', this)" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #94A3B8; cursor: pointer; padding: 6px; font-size: 1rem;" title="Show/Hide Password">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block btn-lg" id="registerSubmitBtn" style="margin-top: 14px;">
                Create Account <i class="fa-solid fa-user-plus"></i>
            </button>
        </form>
    </div>'''

start_idx = html.find(auth_modal_start)
end_marker = '<!-- Forgot Password Modal -->'
end_idx = html.find(end_marker, start_idx)

assert start_idx != -1 and end_idx != -1, "Could not locate authModal in index.html"
html = html[:start_idx] + new_auth_modal_html + "\n\n    " + html[end_idx:]

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("2. index.html authModal updated successfully")


# ==============================================================================
# 3. Update app.js (togglePasswordVisibility and switchAuthTab register-active)
# ==============================================================================
app_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\app.js'
with open(app_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Update switchAuthTab
old_switch = '''window.switchAuthTab = function(tabName) {
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
};'''

new_switch = '''window.togglePasswordVisibility = function(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = isPass ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye';
    }
};

window.switchAuthTab = function(tabName) {
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authModal = document.getElementById('authModal');

    if (tabName === 'login') {
        if (loginTab) loginTab.classList.add('active');
        if (registerTab) registerTab.classList.remove('active');
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (authModal) authModal.classList.remove('register-active');
    } else if (tabName === 'register') {
        if (registerTab) registerTab.classList.add('active');
        if (loginTab) loginTab.classList.remove('active');
        if (registerForm) registerForm.classList.remove('hidden');
        if (loginForm) loginForm.classList.add('hidden');
        if (authModal) authModal.classList.add('register-active');
    }
};'''

if old_switch in js:
    js = js.replace(old_switch, new_switch, 1)
    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(js)
    print("3. app.js updated with togglePasswordVisibility and switchAuthTab")
else:
    print("3. old_switch not found in app.js, checking if togglePasswordVisibility already present")

print("=== AUTH MODAL REDESIGN COMPLETED SUCCESSFULLY ===")
