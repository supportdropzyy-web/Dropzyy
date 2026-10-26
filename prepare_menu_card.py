from PIL import Image
import io
import base64
import os
import mongo_db

input_path = 'uploads/banjos_menu_card_page_1.jpg'
img = Image.open(input_path)
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=85, optimize=True)
compressed_bytes = buf.getvalue()

with open('uploads/banjos_menu_card_page_1.jpg', 'wb') as f:
    f.write(compressed_bytes)

if not os.path.exists('C:/uploads'):
    os.makedirs('C:/uploads', exist_ok=True)
with open('C:/uploads/banjos_menu_card_page_1.jpg', 'wb') as f:
    f.write(compressed_bytes)

try:
    mongo_db.mongo_save_image('banjos_menu_card_page_1.jpg', 'banjos_menu_card_page_1.jpg', 'image/jpeg', compressed_bytes, 'banjos')
    print("Saved to MongoDB Atlas!")
except Exception as e:
    print("MongoDB save warning:", e)

b64_str = base64.b64encode(compressed_bytes).decode('ascii')
with open('menu_card_data.js', 'w', encoding='utf-8') as f:
    f.write(f'window.BANJOS_MENU_CARD_DATA = "data:image/jpeg;base64,{b64_str}";\n')

print(f"Generated menu_card_data.js: {os.path.getsize('menu_card_data.js')} bytes")
