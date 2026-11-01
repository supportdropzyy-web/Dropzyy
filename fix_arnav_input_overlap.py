import os

css_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\style.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# Replace auth input padding in style.css
old_input_css = '''.auth-form input[type="text"],
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
}'''

new_input_css = '''.auth-form input[type="text"],
.auth-form input[type="email"],
.auth-form input[type="tel"],
.auth-form input[type="password"] {
    width: 100% !important;
    height: 48px !important;
    padding-left: 46px !important;
    padding-right: 44px !important;
    background: #F8FAFC !important;
    border: 1.5px solid #E2E8F0 !important;
    border-radius: 12px !important;
    font-size: 0.95rem !important;
    font-weight: 600 !important;
    color: #0F172A !important;
    transition: all 0.2s ease !important;
    box-sizing: border-box !important;
    outline: none !important;
}

.auth-form .form-group {
    position: relative;
    margin-bottom: 16px !important;
}

.auth-form .form-group div[style*="position: relative"] > i {
    position: absolute !important;
    left: 15px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    color: #94A3B8 !important;
    font-size: 1.05rem !important;
    pointer-events: none !important;
    z-index: 3 !important;
}

.auth-modal .close-modal-btn {
    top: 14px !important;
    right: 14px !important;
    width: 32px !important;
    height: 32px !important;
    border-radius: 50% !important;
    background: #F1F5F9 !important;
    border: none !important;
    color: #64748B !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
    z-index: 10 !important;
}

.auth-modal .close-modal-btn:hover {
    background: #E2E8F0 !important;
    color: #0F172A !important;
}

.auth-tabs {
    margin-top: 12px !important;
    margin-bottom: 22px !important;
}'''

if old_input_css in css:
    css = css.replace(old_input_css, new_input_css, 1)
    print("1. Replaced input padding in style.css with 46px left padding and positioned icons")
else:
    print("1. Target old_input_css not found, appending custom rule at end")
    css += "\n\n" + new_input_css

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

# Also check index.html inputs
index_path = r'C:\Users\lalkr\OneDrive\Desktop\dropzyy-main\index.html'
with open(index_path, 'r', encoding='utf-8') as f:
    html = f.read()

# Make sure style on input in index.html explicitly specifies padding-left: 46px !important
html = html.replace('style="padding-left: 38px;"', 'style="padding-left: 46px !important; padding-right: 44px !important;"')
html = html.replace('style="padding-left: 38px; padding-right: 42px;"', 'style="padding-left: 46px !important; padding-right: 44px !important;"')
html = html.replace('style="width: 100%; padding-left: 38px;"', 'style="width: 100%; padding-left: 46px !important; padding-right: 44px !important;"')

with open(index_path, 'w', encoding='utf-8') as f:
    f.write(html)
print("2. index.html inline padding updated with 46px left padding")

print("=== APPLIED ALL FIXES FOR INPUT OVERLAP AND CLOSE BUTTON ===")
