from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [ROOT / "public/resources/xrt-pathfinder-training-kit.pdf", ROOT.parent / "output/pdf/xrt-pathfinder-training-kit.pdf"]
NAVY, INK, CYAN, GOLD, TEAL, ROSE, MINT, LINE = colors.HexColor("#061217"), colors.HexColor("#17252b"), colors.HexColor("#20cde2"), colors.HexColor("#d6a93e"), colors.HexColor("#178e96"), colors.HexColor("#c95172"), colors.HexColor("#39a66f"), colors.HexColor("#b9c8cc")
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="KitTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=27, textColor=NAVY, spaceAfter=12))
styles.add(ParagraphStyle(name="KitH1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=NAVY, spaceBefore=8, spaceAfter=8))
styles.add(ParagraphStyle(name="KitH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=TEAL, spaceBefore=7, spaceAfter=4))
styles.add(ParagraphStyle(name="KitBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=INK, spaceAfter=5))
styles.add(ParagraphStyle(name="KitSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=7, leading=9, textColor=INK))
styles.add(ParagraphStyle(name="KitCenter", parent=styles["KitBody"], alignment=TA_CENTER))

class Rule(Flowable):
    def __init__(self, color=CYAN, width=1): super().__init__(); self.color=color; self.width=width; self.height=8
    def wrap(self, availWidth, availHeight): self.rule_width=availWidth; return availWidth, self.height
    def draw(self): self.canv.setStrokeColor(self.color); self.canv.setLineWidth(self.width); self.canv.line(0, 4, self.rule_width, 4)

def P(text, style="KitBody"): return Paragraph(text, styles[style])
def checkbox(text): return P("[ ]  " + text)
def lines(count=4): return Table([[""] for _ in range(count)], colWidths=[7.1*inch], rowHeights=[0.28*inch]*count, style=TableStyle([("LINEBELOW",(0,0),(-1,-1),.4,LINE)]))
def table(rows, widths, header=True):
    commands=[("VALIGN",(0,0),(-1,-1),"TOP"),("GRID",(0,0),(-1,-1),.45,LINE),("LEFTPADDING",(0,0),(-1,-1),5),("RIGHTPADDING",(0,0),(-1,-1),5),("TOPPADDING",(0,0),(-1,-1),5),("BOTTOMPADDING",(0,0),(-1,-1),5)]
    if header: commands += [("BACKGROUND",(0,0),(-1,0),NAVY),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold")]
    return Table([[P(str(cell), "KitSmall") for cell in row] for row in rows], colWidths=widths, repeatRows=1 if header else 0, style=TableStyle(commands))

segments = [
 ("9:00", "KNOW", "Welcome + three pillars", "Names, hopes, KNOW / DO / BE"),("9:15", "KNOW", "AI fundamentals", "Planning, differentiation, formative checks"),("9:30", "KNOW", "VR / AR / MR", "Definitions, teen safety, motion guardrails"),("9:45", "KNOW", "Integration triangle", "Topic -> Reading anchor -> Math check"),
 ("10:00", "DO", "AI lesson build", "Three-day mini-unit"),("10:15", "DO", "Quest rotation", "Five minutes each + debrief"),("10:30", "DO", "Integrated mini-project", "30-minute learner activity"),("10:45", "DO", "Share-out", "90 seconds + strength + bump-up"),
 ("11:00", "BE", "Educator identity", "Private written reflection"),("11:20", "BE", "Teach-back", "Five minutes each"),("11:40", "BE", "Q&A + pathways", "Support and partner next step"),("11:50", "BE", "Certification", "Commitment, certificates, photo")]
competencies = ["Explains AI, VR, AR, and MR", "Drafts a three-day AI-assisted lesson", "Supervises a Quest XR experience", "Designs a STEM / Reading / Math activity", "Delivers a five-minute teach-back", "Writes an Ambassador identity reflection", "Receives completion certification"]

def header_footer(canvas, doc):
    canvas.saveState(); canvas.setFillColor(NAVY); canvas.rect(0, letter[1]-28, letter[0], 28, fill=1, stroke=0); canvas.setFillColor(colors.white); canvas.setFont("Helvetica-Bold",8); canvas.drawString(36, letter[1]-18, "AMX AIR HUBS.CC  /  XRT PATHFINDER EDUCATOR TRAINING"); canvas.setFillColor(INK); canvas.setFont("Helvetica",7); canvas.drawRightString(letter[0]-36, 22, f"AUGUST 7, 2026  /  PAGE {doc.page}"); canvas.restoreState()

def build(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    doc=SimpleDocTemplate(str(path), pagesize=letter, rightMargin=.55*inch,leftMargin=.55*inch,topMargin=.58*inch,bottomMargin=.45*inch, title="XRT Pathfinder Staff and Educator Training Kit")
    s=[]
    s += [Spacer(1,.35*inch), P("XRT Pathfinder", "KitTitle"), P("STAFF & EDUCATOR TRAINING KIT", "KitH1"), Rule(GOLD,3), P("August 7, 2026  /  9:00 AM - 12:00 PM  /  Black Koffee", "KitH2"), P("Three staff learners. Two trainers. One practical mission: equip educators to lead AI, XR, STEM & STEAM, Reading, and Math through the KNOW / DO / BE progression."), Spacer(1,.15*inch)]
    s.append(table([["KNOW", "DO", "BE"],["Foundations and mental models", "Tools, practice, and project design", "Identity, voice, and teach-back"]],[2.35*inch]*3))
    s += [Spacer(1,.25*inch), P("KIT CONTENTS", "KitH2"), P("1. Facilitator run sheet and pre-flight checklist<br/>2. Learner mission worksheet and integration triangle<br/>3. AI-assisted lesson planning scaffold<br/>4. XR safety and rotation protocol<br/>5. Teach-back cards and feedback form<br/>6. Competency sign-off and certificates<br/>7. Partner pathways, contingency plans, and follow-up"), PageBreak()]

    s += [P("Facilitator Run Sheet", "KitH1"), P("Use the visible timer. Protect the teach-back block. Give a two-minute warning before every transition."), table([["START","PILLAR","BLOCK","DELIVERABLE"]]+[list(x) for x in segments],[.55*inch,.55*inch,2.25*inch,3.55*inch]), PageBreak()]
    s += [P("8:30 AM Pre-Flight", "KitH1")]
    for item in ["Walk venue; confirm seating, outlets, projection, and quiet XR corner", "Verify Wi-Fi, learner devices, AI tool logins, and backup recording", "Charge and clean both Quest headsets; stage liners and lens wipes", "Test projector, screen share, speaker, and ambient slide", "Place agenda, name card, worksheets, feedback form, and teach-back card at each seat", "Stage certificates, partner resource cards, refreshments, and water", "Complete 8:55 trainer huddle: roles, timing, absence plan, learner support"]: s.append(checkbox(item))
    s += [P("TRAINER ASSIGNMENT", "KitH2"), table([["ROLE","PRIMARY RESPONSIBILITY","NAME / CONTACT"],["Tech Lead","Content, AI/XR setup, accuracy, opening and closing",""],["Jr Lead","Timing, logistics, hospitality, feedback, roster",""],["Partner","Pathway story, resource cards, first-session mentor","Social-Tech-Trade Sessions"]],[1*inch,3.35*inch,2.55*inch]), P("Venue notes", "KitH2"), lines(5), PageBreak()]

    s += [P("Learner Mission Worksheet", "KitH1"), P("Learner: _____________________________________   Role: ____________________   Date: ______________"), P("KNOW - Explain the landscape", "KitH2"), P("In your own words, distinguish AI, VR, AR, and MR. Name one safe educator use for each."), lines(6), P("DO - Build the integration triangle", "KitH2"), table([["STEM / STEAM TOPIC","READING ANCHOR","MATH CHECK"],["","",""]],[2.3*inch]*3), Spacer(1,.12*inch), P("Write the 30-minute activity flow. Include the AI or XR hook, learner action, and evidence of understanding."), lines(6), P("BE - Ambassador reflection", "KitH2"), P("A teen I want to reach is...  /  The educator I want to be is...  /  What I carry is...  /  What I will lay down is..."), lines(6), PageBreak()]

    s += [P("AI-Assisted Lesson Planning Scaffold", "KitH1"), P("Prompt starter: Generate a three-day mini-unit on [topic] for ages 14-17 that includes a Reading passage, two Math checks, differentiation, and a responsible AI note."), table([["DAY","LEARNING TARGET","LEARNER EXPERIENCE","READING + MATH EVIDENCE"],["1","","",""],["2","","",""],["3","","",""]],[.45*inch,1.75*inch,2.35*inch,2.35*inch]), P("Educator edit check", "KitH2")]
    for x in ["I verified accuracy and age appropriateness", "I removed personal or sensitive learner data", "I added differentiation for emerging and advanced learners", "I can explain why each AI suggestion belongs in the lesson"]: s.append(checkbox(x))
    s += [P("Final lesson notes", "KitH2"), lines(8), PageBreak()]

    s += [P("XR Safety & Rotation Protocol", "KitH1"), P("One learner in the headset, two observing. Five-minute cap per learner. Stop immediately for discomfort."), table([["BEFORE","DURING","AFTER"],["Clear boundary; check fit; explain stop signal; confirm consent","Chaperone continuously; keep cable-free; monitor balance and comfort","Remove slowly; sanitize liner; record one wow moment; debrief Reading + Math hooks"]],[2.3*inch]*3)]
    for x in ["Play space cleared and guardian protocol understood", "Headset charged, tracking stable, and lenses clean", "Learner knows how to pause and ask for help", "Motion discomfort check completed", "Debrief captured: What happened? What did you notice? What could learners measure or read?"]: s.append(checkbox(x))
    s += [P("Rotation observations", "KitH2"), table([["LEARNER","WOW MOMENT","SAFETY / SUPPORT NOTE"],["1","",""],["2","",""],["3","",""]],[1.2*inch,2.85*inch,2.85*inch]), PageBreak()]

    s += [P("Teach-Back Cards", "KitH1"), P("Cut on the borders. Draw one card per learner. Five-minute maximum."), Spacer(1,.1*inch)]
    cards=[("AI LESSON PROMPT","Teach a colleague how to turn a topic into a safe three-day AI-assisted mini-unit."),("XR SAFETY PROTOCOL","Teach a colleague how to prepare, supervise, stop, and debrief a Quest experience."),("INTEGRATION TRIANGLE","Teach a colleague how Topic -> Reading Anchor -> Math Check turns technology into learning.")]
    for title,body in cards: s.append(KeepTogether([Table([[P(title,"KitH2")],[P(body)],[P("Opening: __________________________  Key example: __________________________  Closing: __________________________")]],colWidths=[7.1*inch],rowHeights=[.42*inch,.72*inch,.55*inch],style=TableStyle([("BOX",(0,0),(-1,-1),1.2,TEAL),("LINEBELOW",(0,0),(-1,1),.5,LINE),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),12)])),Spacer(1,.18*inch)]))
    s += [P("Peer feedback rule", "KitH2"), P("One strength: ______________________________________    One precise bump-up: ______________________________________"), PageBreak()]

    s += [P("Assessment, Feedback & Sign-Off", "KitH1"), table([["#","COMPETENCY","TECH LEAD","JR LEAD","DATE"]]+[[str(i+1),c,"[ ]","[ ]",""] for i,c in enumerate(competencies)],[.3*inch,4.3*inch,.85*inch,.85*inch,.8*inch]), P("Learner confidence and feedback", "KitH2"), P("AI-assisted lesson confidence (1-5): ____    XR supervision confidence (1-5): ____"), P("Which moment surprised you most?"), lines(3), P("What would you change about the flow?"), lines(3), P("What support do you want during your first 30 days?"), lines(3), PageBreak()]

    for n in range(1,4):
        s += [Spacer(1,.35*inch), Rule(GOLD,3), Spacer(1,.25*inch), P("CERTIFICATE OF COMPLETION", "KitCenter"), P("XRT Pathfinder Staff & Educator Training", "KitTitle"), P("Awarded to", "KitCenter"), Spacer(1,.2*inch), P("________________________________________________________", "KitCenter"), Spacer(1,.15*inch), P("for completing the August 7, 2026 training at Black Koffee and demonstrating readiness across KNOW / DO / BE.", "KitCenter"), Spacer(1,.35*inch), table([["TECH LEAD","JR LEAD","DATE"],["________________________","________________________","________________"]],[2.55*inch,2.55*inch,1.8*inch]), Spacer(1,.35*inch), P("Build the future. Lift the Kingdom. Lead with technology.", "KitCenter")]
        if n < 3: s.append(PageBreak())
    s += [PageBreak(), P("Contingencies, Partner Pathway & Follow-Up", "KitH1"), table([["CONDITION","IMMEDIATE RESPONSE"],["Wi-Fi failure","Use recorded AI demo, paper prototype, and observer XR flow."],["Quest failure","Use browser WebXR; preserve Reading and Math objectives."],["One trainer absent","Defer one share-out, remove ambient media, protect teach-back."],["Learner discomfort","Offer quiet corner, five-minute reset, or written teach-back."],["Behind by 10 minutes","Compress one DO block; never remove identity or teach-back."]],[1.55*inch,5.35*inch]), P("SOCIAL-TECH-TRADE SESSIONS", "KitH2"), P("Optional welcome, pathway story, apprenticeship resources, first-live-session mentor, joint capstone showcase, and trade-site field trip."), P("48-HOUR FOLLOW-UP", "KitH2")]
    for x in ["Add graduates to the Pathfinder Educator Roster within 24 hours", "Send certificates, syllabus, and feedback summary within 48 hours", "Schedule a 30-minute office-hours huddle within 14 days", "Pair each educator with a mentor for the first live teen session", "Invite graduates to the alumni and peer-support channel"]: s.append(checkbox(x))
    s += [P("Contacts and commitments", "KitH2"), lines(6)]
    doc.build(s, onFirstPage=header_footer, onLaterPages=header_footer)

for output in OUTPUTS: build(output)
print("\n".join(str(path) for path in OUTPUTS))
