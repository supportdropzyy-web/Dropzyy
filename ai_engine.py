"""
Dropzyy AI Conversational Food Assistant Engine
Zero-latency multilingual NLP processor for restaurant menu search, dietary filters, budget limits & autonomous cart actions.
Supports: English, Marathi (मराठी), and Hindi (हिंदी).
"""
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class AIChatRequest(BaseModel):
    query: str
    language: Optional[str] = "auto"
    user_id: Optional[str] = None

# Multilingual keyword transliteration map (Marathi/Hindi to English search keys)
TRANSLATION_MAP = {
    "बिर्याणी": "biryani",
    "बिरयानी": "biryani",
    "चिकन": "chicken",
    "कोंबडी": "chicken",
    "पिझ्झा": "pizza",
    "पिज़्ज़ा": "pizza",
    "बर्गर": "burger",
    "बँजो": "banjo",
    "पनीर": "paneer",
    "रोटी": "roti",
    "नान": "naan",
    "भाजी": "bhaji",
    "शेव": "shev",
    "दाल": "dal",
    "डाळ": "dal",
    "भात": "rice",
    "तांदूळ": "rice",
    "अंडा": "egg",
    "अंडी": "egg",
    "सँडविच": "sandwich",
    "पास्ता": "pasta",
    "मसाला": "masala",
    "तंदूर": "tandoor",
    "तंदूरी": "tandoori",
    "टिक्का": "tikka",
    "कट्टा": "katta",
    "तडका": "tadka"
}

MARATHI_INDICATORS = [
    "पाहिजे", "हवं", "हवे", "द्या", "ऑर्डर", "आहे", "काय", "कमी", "आत", "जेवण", 
    "मिळेल", "दाखवा", "सुचवा", "शाकाहारी", "मांसाहारी", "कट्टा", "भाजी", "रोटी", "करा", "घेऊन"
]

HINDI_INDICATORS = [
    "चाहिए", "दिखाओ", "खाना", "कितने", "का", "सस्ता", "अंदर", "बताओ", "ऑर्डर", 
    "करना", "भेजो", "लाओ", "वेज", "नॉनवेज", "करो", "दीजिए"
]

def detect_language(text: str, default: str = "auto") -> str:
    """Detect language if auto, otherwise honor provided selection."""
    if default in ["en", "mr", "hi"]:
        return default
    text_lower = text.lower()
    for w in MARATHI_INDICATORS:
        if w in text_lower:
            return "mr"
    for w in HINDI_INDICATORS:
        if w in text_lower:
            return "hi"
    return "en"

def normalize_query_tokens(text: str) -> List[str]:
    """Extract English and transliterated tokens from multilingual input."""
    raw_tokens = [w.strip() for w in re.split(r'[\s,!?]+', text.lower()) if len(w.strip()) > 1]
    tokens = []
    for t in raw_tokens:
        tokens.append(t)
        # Check if transliteration exists
        if t in TRANSLATION_MAP:
            tokens.append(TRANSLATION_MAP[t])
    return list(set(tokens))

def extract_budget(text: str) -> Optional[float]:
    """Extract price budget ceiling like 'under 200', '150 च्या आत', 'below ₹300'."""
    patterns = [
        r'(?:under|below|less than|within|upto|up to|कमी|च्या आत|च्या खाली|के अंदर|तक)\s*(?:₹|rs\.?|inr)?\s*(\d+)',
        r'(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:रुपये|rupees|rs)?\s*(?:under|below|कमी|च्या आत|के अंदर|तक)',
        r'(?:₹|rs\.?)\s*(\d+)'
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if m:
            try:
                return float(m.group(1))
            except:
                pass
    return None

def extract_dietary(text: str) -> Optional[str]:
    """Detect veg, non-veg, or jain preference."""
    t = text.lower()
    if any(k in t for k in ["pure veg", "pure-veg", "शाकाहारी", "vegetarian", "only veg"]):
        return "veg"
    if any(k in t for k in ["non veg", "non-veg", "chicken", "चिकन", "मांसाहारी", "egg", "अंडा", "mutton"]):
        return "non_veg"
    if any(k in t for k in ["veg", "वेज", "paneer", "पनीर"]):
        return "veg"
    return None

def check_checkout_intent(text: str) -> bool:
    """Detect if customer wants to directly checkout or order now."""
    t = text.lower()
    checkout_terms = [
        "checkout", "check out", "order now", "direct checkout", "buy now", 
        "order kar do", "ऑर्डर करा", "घेऊन टाक", "पेमेंट", "payment", "book kar",
        "order", "ऑर्डर"
    ]
    return any(term in t for term in checkout_terms)

def scan_and_rank_dishes(
    query: str, 
    products: List[Dict[str, Any]], 
    budget: Optional[float] = None, 
    dietary: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Score and rank live products against user query with high precision."""
    q_tokens = normalize_query_tokens(query)
    
    stop_words = {
        "under", "below", "want", "show", "give", "food", "order", "me", "the", 
        "and", "from", "for", "please", "with", "like", "get", "need", "some",
        "पाहिजे", "हवं", "हवे", "द्या", "दाखवा", "चाहिए", "दिखाओ", "करो", "करा"
    }
    meaningful_tokens = [t for t in q_tokens if t not in stop_words]
    
    scored_items = []
    for p in products:
        # Ignore out of stock items
        if p.get("in_stock") is False:
            continue
        
        title = str(p.get("title", "")).lower()
        desc = str(p.get("description", "")).lower()
        category = str(p.get("category", "")).lower()
        price = float(p.get("price", 0.0))
        
        # Determine veg/non-veg
        is_veg = True
        combined_text = title + " " + desc + " " + category
        if any(nv in combined_text for nv in ["chicken", "omelette", "egg", "non-veg", "mutton", "fish"]):
            is_veg = False
        
        # Hard dietary filter
        if dietary == "veg" and not is_veg:
            continue
        if dietary == "non_veg" and is_veg:
            continue
            
        # Hard budget ceiling filter (allow +10 Rs tolerance if high quality)
        if budget is not None and price > (budget + 10):
            continue
            
        score = 0.0
        has_keyword_match = False
        
        # Token matching
        for token in meaningful_tokens:
            if token in title:
                score += 30.0
                has_keyword_match = True
            elif token in category:
                score += 15.0
                has_keyword_match = True
            elif token in desc:
                score += 8.0
                has_keyword_match = True
                
        # Category-specific boost
        if "biryani" in meaningful_tokens and "biryani" in title:
            score += 40.0
            has_keyword_match = True
        if "pizza" in meaningful_tokens and "pizza" in title:
            score += 40.0
            has_keyword_match = True
        if "burger" in meaningful_tokens and ("burger" in title or "banjo" in title):
            score += 40.0
            has_keyword_match = True
        if "paneer" in meaningful_tokens and "paneer" in title:
            score += 30.0
            has_keyword_match = True
            
        # If user gave a general category or budget without specific food token:
        if not meaningful_tokens and (budget is not None or dietary is not None):
            has_keyword_match = True
            score += 10.0
            
        # Only add rating and budget bonus if item actually matched!
        if has_keyword_match:
            if budget is not None and price <= budget:
                score += 15.0
            rating = float(p.get("rating", 4.5))
            score += rating * 3.0
            
            p_clean = {
                "id": str(p.get("id", p.get("_id", ""))),
                "title": p.get("title", ""),
                "category": p.get("category", ""),
                "price": price,
                "original_price": float(p.get("original_price") or price),
                "image": p.get("image", ""),
                "rating": rating,
                "is_veg": is_veg,
                "restaurant": p.get("category", "Dropzyy Partner").capitalize(),
                "score": score
            }
            scored_items.append(p_clean)
            
    # Sort by score descending
    scored_items.sort(key=lambda x: x["score"], reverse=True)
    return scored_items

def generate_multilingual_reply(
    lang: str, 
    dishes: List[Dict[str, Any]], 
    query: str, 
    budget: Optional[float], 
    is_checkout: bool
) -> str:
    """Generate friendly, contextual response in target language."""
    count = len(dishes)
    
    if is_checkout and count > 0:
        top = dishes[0]
        if lang == "mr":
            return f"उत्कृष्ट निवड! आम्ही तुमच्यासाठी {top['title']} (Rs {int(top['price'])}) कार्ट मध्ये जोडत आहोत आणि थेट चेकआउट स्क्रीन उघडत आहोत. 🚀"
        elif lang == "hi":
            return f"बढ़िया पसंद! हम आपके लिए {top['title']} (Rs {int(top['price'])}) कार्ट में जोड़कर सीधे चेकआउट स्क्रीन खोल रहे हैं. 🚀"
        else:
            return f"Great choice! Adding {top['title']} (Rs {int(top['price'])}) to your cart and opening direct checkout now. 🚀"
            
    if count == 0:
        if lang == "mr":
            return "माफ करा, तुमच्या विनंतीनुसार आत्ता थेट पदार्थ सापडला नाही. पण तुम्ही चॉपड्यातील आमचे लोकप्रिय बर्गर, पिझ्झा किंवा दम बिर्याणी ट्राय करू शकता! 🍲"
        elif lang == "hi":
            return "माफ़ कीजिए, आपकी खोज के अनुसार अभी कोई आइटम नहीं मिला. पर आप चोपडा के मशहूर पिज़्ज़ा, बर्गर या स्पेशल दम बिरयानी देख सकते हैं! 🍲"
        else:
            return f"I couldn't find an exact match for '{query}', but you can explore Chopda's most popular top-rated dishes on Dropzyy! 🍲"
            
    top_dish = dishes[0]
    top_name = top_dish["title"]
    top_price = int(top_dish["price"])
    rest = top_dish["restaurant"]
    
    if lang == "mr":
        return f"आम्ही तुमच्यासाठी {rest} व इतर लोकप्रिय ठिकाणांहून {count} सर्वोत्तम पर्याय शोधले आहेत! (उदा. {top_name} फक्त Rs {top_price}). खाली '+ Add' दाबून थेट ऑर्डर करा! 🍲"
    elif lang == "hi":
        return f"हमने आपके लिए {rest} से {count} स्वादिष्ट विकल्प ढूंढे हैं! (जैसे {top_name} मात्र Rs {top_price}). नीचे दिए गए '+ Add' बटन से तुरंत कार्ट में जोड़ें! 🍲"
    else:
        return f"I found {count} top-rated delicious options matching your taste from {rest}! (e.g. {top_name} at Rs {top_price}). Tap '+ Add' on any dish to order instantly. 🍲"

import os

def call_gemini_chef(query: str, lang: str, dishes: List[Dict[str, Any]], api_key: Optional[str] = None) -> Optional[str]:
    """Call Google Gemini to generate intelligent, context-aware food recommendations."""
    key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        return None
    try:
        import requests
        lang_label = "Marathi" if lang == "mr" else ("Hindi" if lang == "hi" else "English")
        dish_summaries = ", ".join([f"{d.get('title')} (Rs {int(d.get('price', 0))}) from {d.get('restaurant')}" for d in dishes[:4]])
        
        prompt = (
            f"You are Dropzyy AI Chef, an energetic, friendly food delivery AI for Dropzyy in Chopda, Maharashtra.\n"
            f"Customer query: '{query}'\n"
            f"Available live dishes: {dish_summaries}\n"
            f"Language to respond in: {lang_label}\n"
            f"Instruction: Write a warm, appetizing 1 or 2 sentence recommendation encouraging them to tap '+ Add'. Mention the top dishes and prices. Keep it short, helpful and mouthwatering."
        )
        
        endpoints = [
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key={key}",
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={key}"
        ]
        
        for ep in endpoints:
            try:
                res = requests.post(ep, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=3.5)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates and "content" in candidates[0] and "parts" in candidates[0]["content"]:
                        reply = candidates[0]["content"]["parts"][0].get("text", "").strip()
                        if reply:
                            return reply
            except Exception:
                continue
    except Exception as e:
        print("[GEMINI NOTICE]", e)
    return None
