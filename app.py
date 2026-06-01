import streamlit as st
import pandas as pd
import joblib
import numpy as np

# ---------- PAGE CONFIG ----------
st.set_page_config(
    page_title="PSL 11 Auction Predictor | Elite",
    page_icon="🏏",
    layout="wide"
)

# ---------- ENHANCED CSS (meet.framer.media style) ----------
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,600;14..32,700&display=swap');

    * {
        font-family: 'Inter', sans-serif;
    }

    .main {
        background: radial-gradient(circle at 10% 20%, #0a0f1e, #03060c);
    }

    .stApp {
        background: transparent;
    }

    /* glass card */
    .glass-card {
        background: rgba(20, 30, 45, 0.55);
        backdrop-filter: blur(12px);
        border-radius: 2rem;
        border: 1px solid rgba(0, 212, 255, 0.2);
        box-shadow: 0 20px 35px -12px rgba(0,0,0,0.4);
        padding: 1.8rem;
        margin-bottom: 1.5rem;
        transition: all 0.2s ease;
    }

    .glass-card:hover {
        border-color: rgba(0, 212, 255, 0.5);
        box-shadow: 0 0 18px rgba(0, 212, 255, 0.15);
    }

    h1, h2, h3, .stMarkdown, label, p {
        color: #f0f3fa !important;
    }

    .neon-text {
        text-shadow: 0 0 8px #00d4ff, 0 0 2px #0077ff;
        letter-spacing: -0.02em;
    }

    /* custom inputs */
    div[data-baseweb="select"] > div, div[data-testid="stNumberInput"] input, div[data-testid="stTextInput"] input {
        background-color: #111827 !important;
        border: 1px solid #2d3748 !important;
        border-radius: 16px !important;
        color: white !important;
        padding: 0.6rem 1rem !important;
    }

    .stSlider > div {
        padding-top: 0.5rem;
    }

    .stButton > button {
        width: 100%;
        background: linear-gradient(105deg, #00c6ff, #0072ff);
        border: none;
        border-radius: 40px;
        padding: 0.8rem;
        font-weight: 700;
        font-size: 1.1rem;
        color: white;
        transition: 0.2s;
        box-shadow: 0 6px 14px rgba(0,114,255,0.3);
    }

    .stButton > button:hover {
        transform: scale(0.98);
        background: linear-gradient(105deg, #00b4f0, #0066e6);
        box-shadow: 0 10px 20px rgba(0,114,255,0.4);
    }

    /* result panel */
    .result-glow {
        background: radial-gradient(ellipse at 50% 30%, #132a42, #071224);
        border-radius: 2rem;
        border: 1px solid #00d4ff;
        padding: 2rem;
        text-align: center;
        margin-top: 1rem;
        box-shadow: 0 0 28px rgba(0,212,255,0.3);
    }

    .price-big {
        font-size: 4rem;
        font-weight: 800;
        background: linear-gradient(135deg, #ffffff, #7ac7ff);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        text-shadow: 0 2px 10px rgba(0,212,255,0.3);
    }

    .skill-badge {
        background: rgba(0,212,255,0.12);
        backdrop-filter: blur(4px);
        border-radius: 40px;
        padding: 0.25rem 1rem;
        font-size: 0.8rem;
        font-weight: 500;
        border: 0.5px solid rgba(0,212,255,0.4);
        display: inline-block;
    }

    hr {
        border-color: #1e2a44;
    }

    .metric-box {
        background: rgba(0,0,0,0.35);
        border-radius: 1.2rem;
        padding: 0.8rem;
        text-align: center;
    }
</style>
""", unsafe_allow_html=True)

# ---------- LOAD MODEL ----------
@st.cache_resource
def load_model():
    model = joblib.load("auction_model.pkl")
    columns = joblib.load("model_columns.pkl")
    return model, columns

try:
    ridge_model, feature_cols = load_model()
    model_ready = True
except Exception as e:
    model_ready = False
    st.error(f"⚠️ Model files missing: {e}. Place `auction_model.pkl` and `model_columns.pkl` in the app folder.")

# ---------- HEADER ----------
col_logo, col_title = st.columns([1, 5])
with col_logo:
    st.markdown("<h1 style='font-size:2.8rem;'>🏏</h1>", unsafe_allow_html=True)
with col_title:
    st.markdown("<h1 class='neon-text' style='margin-bottom:0;'>PSL 11 · ELITE AUCTION LAB</h1>", unsafe_allow_html=True)
    st.markdown("<p style='color:#8e9aaf; margin-top:-0.5rem;'>Predict sold price using name, base price & performance skills</p>", unsafe_allow_html=True)

st.divider()

# ---------- MAIN LAYOUT (2 columns) ----------
left, right = st.columns([1, 1], gap="large")

with left:
    with st.container():
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("### 🧑‍💼 Player Identity")
        player_name = st.text_input("Player Full Name", placeholder="e.g., Babar Azam, Rashid Khan", value="")
        
        base_price = st.number_input("💰 Base Price (PKR Crore)", min_value=0.5, max_value=30.0, value=5.0, step=0.5,
                                     help="PCB set base price")
        
        category = st.selectbox("⭐ Category", options=["Platinum", "Gold", "Silver", "Emerging"])
        player_type = st.selectbox("🏏 Playing Role", options=["Batter", "Bowler", "All-rounder", "Wicket-keeper Batter"])
        nationality = st.selectbox("🌍 Nationality", options=sorted([
            "Pakistan", "West Indies", "Australia", "England", "South Africa", "New Zealand",
            "Sri Lanka", "Afghanistan", "Bangladesh", "Zimbabwe", "Nepal", "Oman", "UAE", "United States", "India"
        ]))
        st.markdown("</div>", unsafe_allow_html=True)

    # skills section - modern sliders
    with st.container():
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.markdown("### 📊 Advanced Performance Skills")
        st.caption("These metrics directly influence the final price (skill multiplier)")
        
        col_s1, col_s2 = st.columns(2)
        with col_s1:
            batting_avg = st.slider("Batting Average (T20)", 0.0, 60.0, 28.0, 1.0, help="Career T20 average")
            strike_rate = st.slider("Strike Rate", 80.0, 180.0, 135.0, 5.0)
            recent_form = st.slider("Recent Tournament Form (1-10)", 1, 10, 6, help="Last 10 matches impact")
        with col_s2:
            bowling_economy = st.slider("Bowling Economy", 5.0, 12.0, 7.8, 0.2, help="Runs per over")
            wickets_24m = st.slider("Wickets (last 24 months)", 0, 60, 25, 5)
            t20_runs = st.slider("Career T20 Runs", 0, 8000, 1800, 100)
        
        # special ability flag
        finisher = st.checkbox("🏆 Clutch / Finisher reputation")
        st.markdown("</div>", unsafe_allow_html=True)

# ---------- RIGHT COLUMN : PREDICTION LOGIC ----------
with right:
    st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
    st.markdown("### 🧠 Auction Price Engine")
    st.caption("Hybrid AI: Ridge Regression (base) + Skill Multiplier")

    if st.button("🚀 PREDICT SOLD PRICE", use_container_width=True):
        if not model_ready:
            st.error("Model not loaded. Check .pkl files.")
        elif not player_name.strip():
            st.warning("Please enter a player name.")
        else:
            # ----- 1. BASE PREDICTION FROM RIDGE MODEL -----
            input_row = pd.DataFrame([{col: 0 for col in feature_cols}])
            
            if 'Base Price (PKR Crore)' in input_row.columns:
                input_row['Base Price (PKR Crore)'] = base_price
            
            cat_col = f"Category_{category}"
            if cat_col in input_row.columns:
                input_row[cat_col] = 1
            
            nat_col = f"Nationality_{nationality}"
            if nat_col in input_row.columns:
                input_row[nat_col] = 1
            
            type_col = f"Type of Player_{player_type}"
            if type_col in input_row.columns:
                input_row[type_col] = 1
            
            base_pred = ridge_model.predict(input_row)[0]
            base_pred = max(base_pred, base_price)   # never below base price
            
            # ----- 2. SKILL MULTIPLIER (expert rule-based) -----
            # Normalize skill metrics to range [0.75, 1.35] multiplier
            # Batting average: 20 avg -> 0.85 , 40+ avg -> 1.25
            bat_mult = 1.0
            if player_type in ["Batter", "All-rounder", "Wicket-keeper Batter"]:
                if batting_avg >= 35:
                    bat_mult += 0.18
                elif batting_avg >= 28:
                    bat_mult += 0.08
                elif batting_avg <= 18:
                    bat_mult -= 0.12
                
                # strike rate bonus
                if strike_rate >= 150:
                    bat_mult += 0.12
                elif strike_rate >= 135:
                    bat_mult += 0.06
                elif strike_rate <= 115:
                    bat_mult -= 0.08
            
            # bowling multiplier
            bowl_mult = 1.0
            if player_type in ["Bowler", "All-rounder"]:
                if bowling_economy <= 6.5:
                    bowl_mult += 0.20
                elif bowling_economy <= 7.5:
                    bowl_mult += 0.10
                elif bowling_economy >= 9.0:
                    bowl_mult -= 0.15
                
                if wickets_24m >= 35:
                    bowl_mult += 0.15
                elif wickets_24m >= 20:
                    bowl_mult += 0.07
            
            # recent form & runs
            form_mult = 1.0 + (recent_form - 6) * 0.035   # 10 gives +0.14, 1 gives -0.175
            runs_mult = 1.0 + min(0.2, (t20_runs / 5000) * 0.12)   # max +12%
            finisher_mult = 1.08 if finisher else 1.0
            
            # Combine multipliers (batter/bowler roles weighted)
            if player_type in ["Batter", "Wicket-keeper Batter"]:
                skill_factor = bat_mult * form_mult * runs_mult * finisher_mult
            elif player_type == "Bowler":
                skill_factor = bowl_mult * form_mult * finisher_mult
            else:  # all-rounder
                skill_factor = ((bat_mult + bowl_mult) / 2) * form_mult * runs_mult * finisher_mult
            
            # clamp sensible range
            skill_factor = np.clip(skill_factor, 0.70, 1.55)
            
            final_price = base_pred * skill_factor
            final_price = round(final_price, 2)
            
            # show premium detail
            base_contrib = base_pred
            skill_contrib = final_price - base_pred
            
            # ----- 3. DISPLAY RESULT WITH DESIGN GLOW -----
            st.markdown(f"""
            <div class="result-glow">
                <div style="font-size:1rem; letter-spacing:1px;">🏆 {player_name.upper()} • {category}</div>
                <div class="price-big">PKR {final_price:.2f} Cr</div>
                <div style="display:flex; justify-content:center; gap:1rem; margin:1rem 0 0.5rem;">
                    <span class="skill-badge">⚡ base: {base_contrib:.2f} Cr</span>
                    <span class="skill-badge">📈 skill adj: {skill_contrib:+.2f} Cr</span>
                    <span class="skill-badge">🎯 multiplier: {skill_factor:.2f}x</span>
                </div>
                <div style="color:#a0b2d0; font-size:0.85rem; margin-top:0.8rem;">
                    🧬 Bat avg {batting_avg} • SR {strike_rate} • Eco {bowling_economy} • Wkts {wickets_24m}
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # informative note
            st.markdown("""
            <div style="background: rgba(0,212,255,0.08); border-radius: 1rem; padding: 0.8rem; margin-top: 1rem; border-left: 3px solid #00d4ff;">
            <span style="font-size:0.8rem;">💡 <strong>Hybrid model</strong> : Ridge regression (trained on PSL 11 auction data) + 
            real‑time skill multiplier based on T20 metrics. Player skills now directly influence final price.</span>
            </div>
            """, unsafe_allow_html=True)
    
    st.markdown("</div>", unsafe_allow_html=True)

# ---------- FOOTER ----------
st.divider()
col_f1, col_f2, col_f3 = st.columns(3)
with col_f2:
    st.markdown("<p style='text-align:center; color:#5f6c84; font-size:0.7rem;'>⚡ PSL 11 Elite Predictor · Skills‑augmented AI · Glass UI</p>", unsafe_allow_html=True)