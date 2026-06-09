import streamlit as st
import pandas as pd
import joblib
import numpy as np
from players_db import PLAYER_DB, search_player

st.set_page_config(
    page_title="Under The Hammer | PSL Auction Engine",
    page_icon="🔨",
    layout="wide"
)

st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght=300;400;500;600;700;900&display=swap');
    @import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css');
    
    h1, h2, h3 {
        font-family: 'Inter', sans-serif !important;
        font-weight: 900 !important;
        letter-spacing: -0.04em !important;
    }
    * { font-family: 'Inter', sans-serif; }
    .main, .stApp { background-color: #0A0A0A !important; }

    .fintech-card {
        background: #141414;
        border-radius: 12px;
        border: 1px solid #222222;
        padding: 2rem;
        margin-bottom: 1.5rem;
        transition: border-color 0.3s ease;
    }
    .fintech-card:hover { border-color: #FF6B00; }
    h1, h2, h3, label, p, span { color: #FFFFFF !important; }
    .stMarkdown p { color: #A0A0A0 !important; }

    .saffron-accent {
        color: #FF6B00 !important;
        text-transform: uppercase;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.15em;
        margin-bottom: 0.5rem;
    }

    div[data-baseweb="select"] > div, 
    div[data-testid="stNumberInput"] input, 
    div[data-testid="stTextInput"] input {
        background-color: #0A0A0A !important;
        border: 1px solid #2A2A2A !important;
        border-radius: 6px !important;
        color: #FFFFFF !important;
    }

    .stButton > button {
        width: 100%;
        background: #FF6B00;
        border: none;
        border-radius: 6px;
        padding: 0.9rem;
        font-weight: 700;
        font-size: 1rem;
        color: #000000 !important;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        transition: all 0.2s ease;
    }
    .stButton > button:hover {
        background: #FF852D;
        box-shadow: 0 8px 20px rgba(255, 107, 0, 0.2);
    }

    .ledger-block {
        background: #0E0E0E;
        border: 1px solid #1A1A1A;
        border-radius: 12px;
        padding: 2.5rem;
        text-align: left;
        position: relative;
        overflow: hidden;
    }
    .ledger-block::before {
        content: '';
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 2px;
        background: linear-gradient(90deg, #FF6B00, #FFD700);
    }

    .valuation-headline {
        font-size: 4.2rem;
        font-weight: 900;
        letter-spacing: -0.05em;
        color: #FFFFFF !important;
        line-height: 1;
        margin: 1rem 0;
    }

    .badge-income {
        background: rgba(46, 199, 113, 0.1);
        color: #2EC771 !important;
        border: 1px solid rgba(46, 199, 113, 0.2);
        padding: 0.3rem 0.7rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-expense {
        background: rgba(231, 76, 60, 0.1);
        color: #E74C3C !important;
        border: 1px solid rgba(231, 76, 60, 0.2);
        padding: 0.3rem 0.7rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-gold {
        background: rgba(255, 215, 0, 0.1);
        color: #FFD700 !important;
        border: 1px solid rgba(255, 215, 0, 0.2);
        padding: 0.3rem 0.7rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .badge-found {
        background: rgba(255, 107, 0, 0.1);
        color: #FF6B00 !important;
        border: 1px solid rgba(255, 107, 0, 0.3);
        padding: 0.3rem 0.9rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 700;
    }
    .terminal-panel {
        background: #0D0D0D;
        border-radius: 8px;
        border-left: 3px solid #FF6B00;
        padding: 1.5rem;
        margin-top: 1rem;
    }
    hr { border-color: #1F1F1F; }

    .sold-to-block {
        margin-top: 1.8rem;
        padding-top: 1.5rem;
        border-top: 1px solid #1A1A1A;
    }
    .sold-to-label {
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #444444;
        margin-bottom: 10px;
        font-weight: 700;
    }
    .team-dot {
        width: 10px; height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
        display: inline-block;
        margin-right: 10px;
        animation: pulse-dot 2s infinite;
    }
    @keyframes pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.6; transform: scale(1.3); }
    }

    .footer-container { text-align: center; padding-bottom: 0.5rem; }
    .footer-social-links {
        display: flex; justify-content: center;
        gap: 1.5rem; margin-top: 1rem;
    }
    .footer-social-links a {
        color: #444444 !important;
        font-size: 2.0rem;
        transition: all 0.3s ease;
        text-decoration: none;
    }
    .footer-social-links a:hover {
        color: #FF6B00 !important;
        transform: translateY(-2px);
    }
</style>
""", unsafe_allow_html=True)

# ── PSL TEAMS ─────────────────────────────────────────────────
PSL_TEAMS = [
    {"name": "Karachi Kings",      "color": "#00A2E8"},
    {"name": "Lahore Qalandars",   "color": "#75F94D"},
    {"name": "Quetta Gladiators",  "color": "#EE8AF8"},
    {"name": "Rawalpindi Express", "color": "#FF8F35"},
    {"name": "Multan Sultans",     "color": "#22FFA8"},
    {"name": "Peshawar Zalmi",     "color": "#FFC90E"},
    {"name": "Islamabad United",   "color": "#FF1D1D"},
    {"name": "Hyderabad Kingsmen", "color": "#870015"},
]

# ── LOAD MODEL ────────────────────────────────────────────────
@st.cache_resource
def load_model():
    try:
        model   = joblib.load("auction_model.pkl")
        columns = joblib.load("model_columns.pkl")
        return model, columns, True
    except Exception:
        return None, None, False

ridge_model, feature_cols, model_ready = load_model()

# ── ALL PLAYER NAMES for autocomplete ─────────────────────────
ALL_PLAYER_NAMES = sorted(PLAYER_DB.keys())

# ── HEADER ────────────────────────────────────────────────────
col_title, col_status = st.columns([4, 1])
with col_title:
    st.markdown("<div class='saffron-accent'>HBL PSL AUCTION LIVE EXCHANGE</div>", unsafe_allow_html=True)
    st.markdown("<h1 style='font-size: 3rem; margin-top: -0.5rem; margin-bottom: 0;'>UNDER THE HAMMER</h1>", unsafe_allow_html=True)
    st.markdown("<p style='margin-top: 0rem;'>High-fidelity asset pricing model calibrated for HBL PSL auction matrices.</p>", unsafe_allow_html=True)
with col_status:
    status = "badge-income'>● ENGINE ONLINE" if model_ready else "badge-expense'>● DEV MODE (SIMULATED)"
    st.markdown(f"<div style='text-align:right;margin-top:1.5rem;'><span class='{status}</span></div>", unsafe_allow_html=True)

st.markdown("<hr style='margin-top:0.5rem; margin-bottom:2rem;'>", unsafe_allow_html=True)

# ── LAYOUT ────────────────────────────────────────────────────
col_inputs, col_ledger = st.columns([1.1, 0.9], gap="large")

with col_inputs:
    st.markdown("<div class='fintech-card'>", unsafe_allow_html=True)
    st.markdown("<div class='saffron-accent'>ASSET IDENTITY</div>", unsafe_allow_html=True)
    st.markdown("<h3 style='margin-top:-0.2rem; margin-bottom:1rem;'>Registry Parameters</h3>", unsafe_allow_html=True)

    # ── LIVE SEARCH — type to filter, select to auto-fill ─────
    # Sentinel value shown when nothing is selected yet
    PLACEHOLDER = "Type to search a player"

    selected_player = st.selectbox(
        "Player Name",
        options=[PLACEHOLDER] + ALL_PLAYER_NAMES,
        index=0,
        help="Start typing a name — the list filters instantly"
    )

    # Auto-fill as soon as a real player is chosen
    if selected_player != PLACEHOLDER:
        db      = PLAYER_DB[selected_player]
        db_hit  = True
        db_name = selected_player
        st.markdown(f"<span class='badge-found'>✓ Loaded — {db_name}</span>", unsafe_allow_html=True)
        st.markdown("<div style='height:8px'></div>", unsafe_allow_html=True)
    else:
        db      = {}
        db_hit  = False
        db_name = None

    # Expose player_name for ledger display
    player_name = selected_player if selected_player != PLACEHOLDER else ""

    row_meta1, row_meta2 = st.columns(2)

    tier_price_map = {"Platinum": 4.2, "Diamond": 2.2, "Gold": 1.1, "Emerging": 0.6}
    cat_options    = ["Platinum", "Diamond", "Gold", "Emerging"]
    role_options   = ["Batter", "Bowler", "All-rounder", "Wicket-keeper Batter"]

    db_cat  = db.get("category", "Gold")
    db_role = db.get("player_type", "Batter")
    db_cat_idx  = cat_options.index(db_cat)  if db_cat  in cat_options  else 2
    db_role_idx = role_options.index(db_role) if db_role in role_options else 0

    with row_meta1:
        category    = st.selectbox("Auction Tier Assignment", options=cat_options, index=db_cat_idx)
        player_type = st.selectbox("Role", options=role_options, index=db_role_idx)

    default_base = db.get("base_price", tier_price_map.get(category, 1.1))

    nations_list = [
        "Pakistan", "India", "Australia", "England", "South Africa", "New Zealand",
        "West Indies", "Sri Lanka", "Bangladesh", "Afghanistan", "Zimbabwe",
        "Ireland", "Scotland", "Netherlands", "UAE", "Nepal", "Oman",
        "United States", "Other (Specify)"
    ]
    db_nat     = db.get("nationality", "Pakistan")
    db_nat_idx = nations_list.index(db_nat) if db_nat in nations_list else 0

    with row_meta2:
        base_price      = st.number_input("Floor Evaluation (PKR Crore)", min_value=0.1, max_value=30.0, value=float(default_base), step=0.1)
        nationality_sel = st.selectbox("Sovereign Origin", options=nations_list, index=db_nat_idx)
        if nationality_sel == "Other (Specify)":
            nationality = st.text_input("Enter Country Identity", placeholder="e.g., Nepal")
            if not nationality.strip(): nationality = "Unspecified"
        else:
            nationality = nationality_sel

    st.markdown("</div>", unsafe_allow_html=True)

    # ── PERFORMANCE TELEMETRY ──────────────────────────────────
    st.markdown("<div class='fintech-card'>", unsafe_allow_html=True)
    st.markdown("<div class='saffron-accent'>PERFORMANCE TELEMETRY</div>", unsafe_allow_html=True)
    st.markdown("<h3 style='margin-top:-0.2rem; margin-bottom:1.5rem;'>Yield & Output Vectors</h3>", unsafe_allow_html=True)

    batting_avg          = db.get("batting_avg")     or 26.5
    strike_rate          = db.get("strike_rate")     or 132.5
    bowling_economy      = db.get("bowling_economy") or 7.6
    wickets_24m          = db.get("wickets_24m")     or 22
    wk_dismissals        = db.get("wk_dismissals")   or 1.0
    t20_runs_default     = db.get("t20_runs")        or 1400
    recent_form_default  = db.get("recent_form")     or 6
    finisher_default     = db.get("finisher")        or False
    playstyle_default    = db.get("playstyle")       or "Balanced / Anchor"
    playstyle_multiplier = 1.0

    playstyle_opts = ["Aggressive / Enforcer", "Balanced / Anchor", "Defensive / Accumulator"]
    ps_idx = playstyle_opts.index(playstyle_default) if playstyle_default in playstyle_opts else 1

    if player_type == "Batter":
        g1, g2 = st.columns(2)
        with g1:
            batting_avg = st.slider("Historical Average Yield (Runs/Out)", 0.0, 60.0, float(batting_avg), 0.5)
            strike_rate = st.slider("Velocity Coefficient (Strike Rate)", 80.0, 180.0, float(strike_rate), 2.5)
        with g2:
            t20_runs  = st.slider("Gross Career Volume (Accumulated Runs)", 0, 8000, int(t20_runs_default), 50)
            playstyle = st.selectbox("Strategic Approach", playstyle_opts, index=ps_idx)
            if playstyle == "Aggressive / Enforcer":   playstyle_multiplier = 1.08
            elif playstyle == "Balanced / Anchor":     playstyle_multiplier = 1.00
            else:                                      playstyle_multiplier = 0.95
        recent_form = st.slider("Momentum Coefficient (Last 10 Matches)", 1, 10, int(recent_form_default))

    elif player_type == "Wicket-keeper Batter":
        g1, g2 = st.columns(2)
        with g1:
            batting_avg   = st.slider("Historical Average Yield (Runs/Out)", 0.0, 60.0, float(batting_avg), 0.5)
            strike_rate   = st.slider("Velocity Coefficient (Strike Rate)", 80.0, 180.0, float(strike_rate), 2.5)
        with g2:
            t20_runs      = st.slider("Gross Career Volume (Accumulated Runs)", 0, 8000, int(t20_runs_default), 50)
            wk_dismissals = st.slider("Glovework Efficiency (Catches/Stumps per Match)", 0.0, 3.0, float(wk_dismissals), 0.1)
        recent_form = st.slider("Momentum Coefficient (Last 10 Matches)", 1, 10, int(recent_form_default))

    elif player_type == "Bowler":
        g1, g2 = st.columns(2)
        with g1:
            bowling_economy     = st.slider("Defensive Overhead (Economy Rate)", 5.0, 12.0, float(bowling_economy), 0.1)
            wickets_24m         = st.slider("Liquidation Event Frequency (24M Wickets)", 0, 60, int(wickets_24m), 1)
        with g2:
            recent_form         = st.slider("Momentum Coefficient (Last 10 Matches)", 1, 10, int(recent_form_default))
            bowling_strike_rate = st.slider("Lethality Index (Balls per Wicket)", 10.0, 30.0, 18.5, 0.5)

    elif player_type == "All-rounder":
        g1, g2 = st.columns(2)
        with g1:
            st.markdown("<p style='font-size:0.8rem; color:#FF6B00 !important; font-weight:700; margin-bottom:0;'>BATTING METRICS</p>", unsafe_allow_html=True)
            batting_avg     = st.slider("Historical Average Yield", 0.0, 60.0, float(batting_avg), 0.5)
            strike_rate     = st.slider("Velocity Coefficient (Strike Rate)", 80.0, 180.0, float(strike_rate), 2.5)
        with g2:
            st.markdown("<p style='font-size:0.8rem; color:#FF6B00 !important; font-weight:700; margin-bottom:0;'>BOWLING METRICS</p>", unsafe_allow_html=True)
            bowling_economy = st.slider("Defensive Overhead (Economy Rate)", 5.0, 12.0, float(bowling_economy), 0.1)
            wickets_24m     = st.slider("Liquidation Event Frequency", 0, 60, int(wickets_24m), 1)
        recent_form = st.slider("Combined Momentum Coefficient (Last 10 Matches)", 1, 10, int(recent_form_default))

    finisher = st.checkbox("High-Volatility High-Yield Asset (Clutch Profile)", value=finisher_default)
    st.markdown("</div>", unsafe_allow_html=True)

# ── RIGHT PANEL ───────────────────────────────────────────────
with col_ledger:
    st.markdown("<div class='saffron-accent'>VALUATION ENGINE STATUS</div>", unsafe_allow_html=True)
    st.markdown("<h3 style='margin-top:-0.2rem; margin-bottom:1.5rem;'>Real-Time Pricing Ledger</h3>", unsafe_allow_html=True)

    trigger_valuation = st.button("EXECUTE QUANTITATIVE MODEL")

    if trigger_valuation:
        if not player_name.strip():
            st.markdown("<div class='terminal-panel' style='border-left-color:#E74C3C;'><p style='color:#E74C3C !important; margin:0; font-weight:600;'>[ERROR] Execution halted: Select a player from the dropdown first.</p></div>", unsafe_allow_html=True)
        else:
            base_anchor = float(base_price)
            if category == "Platinum": base_anchor += 3.5
            elif category == "Diamond": base_anchor += 2.0
            elif category == "Gold":    base_anchor += 1.0

            bat_factor = 1.0
            if player_type in ["Batter", "All-rounder", "Wicket-keeper Batter"]:
                bat_factor += ((batting_avg - 25) * 0.012) + ((strike_rate - 130) * 0.005)
            if player_type == "Batter":
                bat_factor *= playstyle_multiplier
            elif player_type == "Wicket-keeper Batter":
                bat_factor += ((wk_dismissals - 1.0) * 0.05)

            bowl_factor = 1.0
            if player_type in ["Bowler", "All-rounder"]:
                bowl_factor += ((7.8 - bowling_economy) * 0.04) + ((wickets_24m - 20) * 0.008)

            form_factor  = 1.0 + (recent_form - 6) * 0.04
            clutch_bonus = 1.10 if finisher else 1.0

            if player_type == "All-rounder":
                structural_multiplier = ((bat_factor + bowl_factor) / 2) * form_factor * clutch_bonus
            elif player_type == "Bowler":
                structural_multiplier = bowl_factor * form_factor * clutch_bonus
            else:
                structural_multiplier = bat_factor * form_factor * clutch_bonus

            structural_multiplier = np.clip(structural_multiplier, 0.75, 1.60)
            calculated_valuation  = base_anchor * structural_multiplier
            if calculated_valuation < base_price:
                calculated_valuation = base_price

            net_delta    = calculated_valuation - base_price
            winning_team = PSL_TEAMS[np.random.randint(len(PSL_TEAMS))]
            display_name = db_name if (db_hit and db_name) else player_name.strip()

            st.markdown(f"""
            <div class='ledger-block'>
                <span class='saffron-accent'>PREDICTED AUCTION VALUE</span>
                <div class='valuation-headline'>PKR {calculated_valuation:.2f} CR</div>
                <div style='display:flex; gap:0.5rem; margin-top:1.5rem; flex-wrap:wrap;'>
                    <span class='badge-gold'>👑 {category.upper()} ASSET</span>
                    <span class='badge-income'>💸 GAIN: +{net_delta:.2f} CR</span>
                    <span class='badge-gold'>X-MULT: {structural_multiplier:.2f}x</span>
                </div>
                <hr style='margin:1.5rem 0;'>
                <div style='display:grid; grid-template-columns:1fr 1fr; gap:1rem;'>
                    <div>
                        <p style='margin:0; font-size:0.75rem; color:#666666 !important; text-transform:uppercase;'>Player Profile</p>
                        <p style='margin:0; font-size:1.1rem; font-weight:700; color:#FFF !important;'>{display_name.upper()}</p>
                    </div>
                    <div>
                        <p style='margin:0; font-size:0.75rem; color:#666666 !important; text-transform:uppercase;'>Sovereign Origin</p>
                        <p style='margin:0; font-size:1.1rem; font-weight:700; color:#FF6B00 !important;'>🌏 {nationality.upper()}</p>
                    </div>
                    <div>
                        <p style='margin:0; font-size:0.75rem; color:#666666 !important; text-transform:uppercase;'>Floor Value</p>
                        <p style='margin:0; font-size:1rem; font-weight:700; color:#FFF !important;'>💰 PKR {base_price:.2f} CR</p>
                    </div>
                    <div>
                        <p style='margin:0; font-size:0.75rem; color:#666666 !important; text-transform:uppercase;'>Operational Specs</p>
                        <p style='margin:0; font-size:1rem; font-weight:700; color:#FFF !important;'>🏏 {player_type}</p>
                    </div>
                </div>
                <div class='sold-to-block'>
                    <div class='sold-to-label'>🔨 Sold To</div>
                    <div>
                        <span class='team-dot' style='background:{winning_team["color"]};'></span>
                        <span style='font-size:1.45rem; font-weight:900; color:{winning_team["color"]};'>{winning_team["name"]}</span>
                    </div>
                    <div style='font-size:0.72rem; letter-spacing:0.12em; text-transform:uppercase; color:#444; margin-top:5px; margin-left:20px;'>
                        Winning bid · PKR {calculated_valuation:.2f} Crore
                    </div>
                </div>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div style='border:1px dashed #2A2A2A; border-radius:12px; padding:4rem 2rem; text-align:center;'>
            <p style='color:#666666 !important; font-size:0.9rem;'>Awaiting telemetry payload activation.<br>Define parameters and click the button above to synthesize asset value.</p>
        </div>
        """, unsafe_allow_html=True)

# ── FOOTER ────────────────────────────────────────────────────
st.markdown("<hr style='margin-top:2rem; margin-bottom:1rem;'>", unsafe_allow_html=True)
st.markdown("""
<div class='footer-container'>
    <p style='color:#888888 !important; font-size:0.85rem; line-height:1.5; margin-bottom:1rem;'>
        This is a fan-based app to predict your favorite player's price in the next auction just for fun! Enjoy experimenting with the numbers.<br>
        If you like the app and want to see me build bigger and better projects for the fans, consider supporting me on Patreon!
    </p>
    <div class='footer-social-links'>
        <a href='https://github.com/tahahssn/UNDER-THE-HAMMER' target='_blank' title='GitHub Repository'><i class='fab fa-github'></i></a>
        <a href='https://www.patreon.com/c/SyedTahaHassan' target='_blank' title='Support on Patreon'><i class='fab fa-patreon'></i></a>
    </div>
</div>
""", unsafe_allow_html=True)