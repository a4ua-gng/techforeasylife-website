"""Build the public SK Group X pages from the branch and photography registry."""
from html import escape
import json
from pathlib import Path
from urllib.parse import quote

BASE = Path(__file__).resolve().parents[1]
DATA = json.loads(Path(__file__).with_name("content.json").read_text(encoding="utf-8"))
ORIGIN = "https://techforeasylife.in/sk-group-final/"
VERSION = "20261105-dealers-v2"
EMAIL = DATA["email"]
DEALERS = DATA["dealers"]
PHOTOS = DATA["photos"]
MARKS = DATA["marks"]
MOBILITY = DATA["other_mobility"]
BUSINESSES = DATA["businesses"]


def h(value):
    return escape(str(value), quote=True)


def route(d):
    return "dealerships/" + d["id"] + "/"


def mail(subject):
    return "mailto:" + EMAIL + "?subject=" + quote(subject)


def location(d):
    return "https://www.google.com/maps/search/?api=1&query=" + quote(d["map"])


def phone(d):
    return "+91 " + d["phone"][:5] + " " + d["phone"][5:]


def tel(d):
    return "tel:+91" + d["phone"]


def textlink(label, url, cls="line-link", external=False, extra=""):
    target = ' target="_blank" rel="noopener noreferrer"' if external else ""
    return f'<a class="{cls}" href="{h(url)}"{target}{extra}>{h(label)} <span aria-hidden="true">↗</span></a>'


def image(meta, prefix, *, eager=False, css="", sizes="100vw", decorative=False):
    src = h(prefix + "assets/" + meta["file"])
    alt = "" if decorative else h(meta["alt"])
    responsive = ""
    if meta.get("small"):
        responsive = f' srcset="{h(prefix + "assets/" + meta["small"])} 800w, {src} {meta["width"]}w" sizes="{h(sizes)}"'
    priority = ' fetchpriority="high"' if eager else ' loading="lazy" decoding="async"'
    return (f'<img class="{h(css)}" src="{src}"{responsive} alt="{alt}" '
            f'width="{meta["width"]}" height="{meta["height"]}"{priority}>')


def eyebrow(label):
    return f'<p class="eyebrow"><span aria-hidden="true"></span>{h(label)}</p>'


def brand(prefix):
    return f'''<a class="brand" href="{prefix}" aria-label="SK Group X home">
      <span class="brand-symbol" aria-hidden="true">SK</span>
      <span class="brand-name">SK GROUP X<small>ASSAM, INDIA</small></span>
    </a>'''


def header(prefix, sub=False):
    cta_url = "#visit" if sub else prefix + "#contact"
    cta_attr = ' data-branch-contact' if sub else ' data-enquire'
    cta_text = "Contact branch" if sub else "Get in touch"
    return f'''<a class="skip" href="#main">Skip to content</a>
    <header class="header"><div class="header-wrap">
      {brand(prefix)}
      <button class="menu" type="button" aria-controls="nav" aria-expanded="false" hidden>Menu <span aria-hidden="true">☰</span></button>
      <nav id="nav" class="nav" aria-label="Main navigation">
        <a href="{prefix}#dealerships">Dealerships</a><a href="{prefix}#businesses">Our businesses</a><a href="{prefix}#gallery">Photography</a>
      </nav>
      {textlink(cta_text, cta_url, "button header-button", extra=cta_attr)}
    </div></header>'''


def footer(prefix):
    return f'''<footer class="footer"><div class="wrap footer-grid">
      {brand(prefix)}
      <p>SK Group X (OPC) Pvt. Ltd.<br>Assam, India</p>
      <div><a href="mailto:{EMAIL}">{EMAIL}</a><a href="{prefix}photo-credits.html">Photo credits</a></div>
    </div></footer>'''


def document(title, description, prefix, path, content, *, page="home", social=None, schema=None):
    absolute = ORIGIN + path
    meta_image = (f'<meta property="og:image" content="{h(ORIGIN + "assets/" + social)}">' if social else "")
    structured = ""
    if schema:
        structured = ('<script type="application/ld+json">' +
                      json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c") + "</script>")
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#f4f0e7">
  <title>{h(title)}</title>
  <meta name="description" content="{h(description)}">
  <link rel="canonical" href="{h(absolute)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{h(title)}">
  <meta property="og:description" content="{h(description)}">
  <meta property="og:url" content="{h(absolute)}">
  {meta_image}
  <link rel="icon" href="{prefix}assets/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{prefix}style.css?v={VERSION}">
  <script src="{prefix}app.js?v={VERSION}" defer></script>
  {structured}
</head>
<body class="{h(page)}">
{content}
</body>
</html>
'''


def mark(d, prefix, css="mark"):
    return image(MARKS[d["mark"]], prefix, css=css, decorative=True)


def media_panel(d, prefix, *, eager=False):
    if d.get("photo"):
        p = PHOTOS[d["photo"]]
        sizes = "(max-width: 720px) 94vw, 50vw"
        return (f'<figure class="dealer-image" style="--focal:{h(p["position"])}">'
                f'{image(p, prefix, eager=eager, sizes=sizes)}'
                f'<figcaption>{h(p["caption"])}</figcaption></figure>')
    cls = h(d["mark"])
    return (f'<div class="brand-panel brand-panel-{cls}">'
            f'<span class="panel-label">SK GROUP X / DEALERSHIP NETWORK</span>'
            f'{mark(d, prefix)}<span class="panel-place">{h(d["operator"])} · {h(d["place"])}</span></div>')


def dealer_card(d, i, prefix="./"):
    search = " ".join([d["brand"], d["operator"], d["place"], d["address"], d["kind"]])
    detail = prefix + route(d)
    return f'''<article class="dealer-card" data-dealer data-type="{h(d["category"])}" data-search="{h(search)}">
      <a class="card-media" href="{detail}" aria-label="Visit {h(d["brand"])} in {h(d["place"])}">
        {media_panel(d, prefix)}<span class="card-number" aria-hidden="true">{i:02d}</span>
      </a>
      <div class="card-body">
        <p class="card-kicker">{h(d["place"])}</p><h3>{h(d["brand"])}</h3>
        <p class="operator">{h(d["operator"])}</p><p>{h(d["short"])}</p>
        <div class="card-actions">
          {textlink("View dealership", detail, "card-visit")}
          <a class="call-link" href="{h(tel(d))}" aria-label="Call {h(d["brand"])} in {h(d["place"])}">Call branch</a>
        </div>
      </div>
    </article>'''


def photo_card(p, prefix):
    full = prefix + "assets/" + p["file"]
    attrs = f' data-photo data-title="{h(p["title"])}" data-caption="{h(p["caption"])}" data-credit="{h(p["credit"])}"'
    return f'''<a class="gallery-tile" href="{h(full)}"{attrs}>
      <figure style="--focal:{h(p["position"])}">
        {image(p, prefix, sizes="(max-width: 540px) 48vw, 38vw")}
        <figcaption><span>{h(p["title"])}<small>{h(p["caption"])}</small></span><span aria-hidden="true">↗</span></figcaption>
      </figure>
    </a>'''


def lightbox():
    return '''<dialog id="photo-dialog" class="photo-dialog" aria-labelledby="photo-title">
      <button type="button" class="dialog-close" data-dismiss aria-label="Close photo" autofocus>×</button>
      <figure><img id="photo-view" alt=""><figcaption>
        <div><h2 id="photo-title">Photograph</h2><p id="photo-caption"></p><small id="photo-credit"></small></div>
        <div class="photo-controls" aria-label="Photo navigation">
          <button type="button" data-photo-step="-1" aria-label="Previous photo">←</button>
          <button type="button" data-photo-step="1" aria-label="Next photo">→</button>
        </div>
      </figcaption></figure>
    </dialog>'''


def portfolio():
    parts = []
    for i, sector in enumerate(BUSINESSES, start=3):
        entries = []
        for entry in sector["entries"]:
            subject = entry["name"] + " · " + entry["place"]
            entries.append(f'''<div class="business-entry">
              <div><h4>{h(entry["name"])}</h4><small>{h(entry["place"])}</small><p>{h(entry["text"])}</p></div>
              {textlink("Enquire", "#contact", extra=' data-enquire data-business="' + h(subject) + '"')}
            </div>''')
        parts.append(f'''<details class="business-card" id="business-{h(sector["id"])}">
          <summary><span class="business-index">{i:02d}</span><span><strong>{h(sector["name"])}</strong><small>{h(sector["intro"])}</small></span><span class="expand" aria-hidden="true">+</span></summary>
          <div class="business-items">{"".join(entries)}</div>
        </details>''')
    return "".join(parts)


def enquiry_dialog():
    options = ['<option value="General group enquiry">General group enquiry</option>']
    items = [(d["brand"] + " · " + d["place"]) for d in DEALERS]
    items.extend(m["name"] + " · " + m["place"] for m in MOBILITY)
    items.extend(e["name"] + " · " + e["place"] for s in BUSINESSES for e in s["entries"])
    for item in items:
        options.append(f'<option>{h(item)}</option>')
    return f'''<dialog id="group-enquiry" class="contact-dialog group-dialog" aria-labelledby="group-title">
      <button type="button" class="dialog-close" data-dismiss aria-label="Close enquiry" autofocus>×</button>
      {eyebrow("CONTACT SK GROUP X")}<h2 id="group-title">How can we help?</h2>
      <form id="enquiry-form" data-email="{EMAIL}">
        <label>Business <select name="business">{"".join(options)}</select></label>
        <label>Your name <input name="name" autocomplete="name" required maxlength="100"></label>
        <label>Email or phone <input name="reply" required maxlength="100"></label>
        <label>What would you like to know? <textarea name="message" required rows="3" maxlength="1000"></textarea></label>
        <button class="button primary" type="submit">Open email draft <span aria-hidden="true">↗</span></button>
        <p class="form-hint">Review and send your enquiry in your email app.</p>
        <p class="form-status" aria-live="polite"></p>
      </form>
    </dialog>'''


def home():
    prefix = "./"
    p = PHOTOS["montra-ceremony"]
    dealer_cards = "".join(dealer_card(d, i) for i, d in enumerate(DEALERS, start=1))
    group_photos = "".join(photo_card(photo, prefix) for photo in PHOTOS.values())
    other = "".join(f'''<article><div><h3>{h(m["name"])}</h3><p>{h(m["text"])}</p></div>
      {textlink("Enquire", "#contact", extra=' data-enquire data-business="' + h(m["name"] + " · " + m["place"]) + '"')}</article>''' for m in MOBILITY)
    content = f'''{header(prefix)}
    <main id="main">
      <section class="home-hero" aria-labelledby="hero-title">
        <div class="hero-media" style="--focal:{h(p["position"])}">{image(p, prefix, eager=True, css="hero-image")}</div>
        <div class="wrap hero-wrap">
          <div class="hero-copy">{eyebrow("SK GROUP X · ASSAM")}
            <h1 id="hero-title">Rooted here.<br><em>Growing together.</em></h1>
            <p>Local dealerships. Diverse businesses. One group based in Assam.</p>
            <div class="buttons">
              {textlink("Explore dealerships", "#dealerships", "button primary")}
              {textlink("Our businesses", "#businesses", "button light")}
            </div>
          </div>
          <div class="hero-foot"><span>THE BETKUCHI OPENING <span aria-hidden="true">·</span> MONTRA ELECTRIC</span>
            <a href="{prefix}{route(DEALERS[0])}">Guwahati, Assam <span aria-hidden="true">↗</span></a></div>
        </div>
      </section>
      <section id="dealerships" class="network band" aria-labelledby="network-title">
        <div class="wrap">
          <div class="section-head">
            <div>{eyebrow("01 / DEALERSHIP NETWORK")}<h2 id="network-title">Find your <em>dealership.</em></h2></div>
            <p>Choose a branch for its contact details, directions and showroom information.</p>
          </div>
          <div class="filter-bar" hidden data-filters>
            <div class="filter-options" role="group" aria-label="Vehicle category">
              <button type="button" data-filter="all" aria-pressed="true">All branches</button>
              <button type="button" data-filter="motorcycles" aria-pressed="false">Two-wheelers</button>
              <button type="button" data-filter="electric" aria-pressed="false">Electric three-wheelers</button>
            </div>
            <label class="search"><span class="sr-only">Search dealerships</span><input type="search" id="dealer-search" placeholder="Search dealer or town" autocomplete="off"></label>
          </div>
          <p class="sr-only" id="dealer-count" aria-live="polite"></p>
          <div class="dealer-grid">{dealer_cards}</div>
          <p class="empty" hidden id="dealer-empty">No branches match that search. Try another dealer or town.</p>
          <div class="other-mobility">
            <div>{eyebrow("GROUP ENQUIRIES")}<h3>Other automotive businesses</h3></div>
            <div>{other}</div>
          </div>
        </div>
      </section>
      <section id="businesses" class="band businesses" aria-labelledby="businesses-title">
        <div class="wrap">
          <div class="section-head">
            <div>{eyebrow("02 / THE WIDER GROUP")}<h2 id="businesses-title">More from <em>SK Group X.</em></h2></div>
            <p>Across Assam, our businesses span hospitality, energy, retail, food and more.</p>
          </div>
          <div class="business-grid">{portfolio()}</div>
        </div>
      </section>
      <section id="gallery" class="band gallery" aria-labelledby="gallery-title">
        <div class="wrap">
          <div class="section-head">
            <div>{eyebrow("03 / PHOTOGRAPHY")}<h2 id="gallery-title">From our <em>showrooms.</em></h2></div>
            {textlink("Photo credits", prefix + "photo-credits.html")}
          </div>
          <div class="gallery-grid">{group_photos}</div>
        </div>
      </section>
      <section id="contact" class="band group-contact" aria-labelledby="contact-title">
        <div class="wrap contact-wrap">
          <div>{eyebrow("04 / CONNECT")}<h2 id="contact-title">Let’s <em>talk.</em></h2><p>For group enquiries and partnerships, write to SK Group X.</p></div>
          <div class="contact-ctas">
            {textlink("Make an enquiry", mail("SK Group X enquiry"), "button primary", extra=" data-enquire")}
            <a href="mailto:{EMAIL}">{EMAIL}</a><small>Group enquiry hours · 9 AM–8 PM IST</small>
          </div>
        </div>
      </section>
    </main>
    {footer(prefix)}
    {enquiry_dialog()}
    {lightbox()}'''
    schema = {"@context": "https://schema.org", "@type": "Organization", "@id": ORIGIN + "#group",
              "name": "SK Group X (OPC) Pvt. Ltd.", "url": ORIGIN, "email": EMAIL,
              "areaServed": {"@type": "AdministrativeArea", "name": "Assam"}}
    return document("SK Group X — Rooted in Assam", "Explore SK Group X dealerships and businesses across Assam, from Royal Enfield and TVS to Montra Electric, hospitality and more.", prefix, "", content, social=p["file"], schema=schema)


def branch_dialog(d):
    return f'''<dialog id="branch-contact" class="contact-dialog branch-dialog" data-auto-contact="{h(d["id"])}" aria-labelledby="branch-contact-title" aria-describedby="branch-contact-place">
      <button type="button" class="dialog-close" data-dismiss aria-label="Close branch contact" autofocus>×</button>
      {eyebrow("CONTACT THIS BRANCH")}
      <h2 id="branch-contact-title">{h(d["brand"])}</h2>
      <p class="branch-contact-place" id="branch-contact-place">{h(d["operator"])} · {h(d["place"])}</p>
      <address>{h(d["address"])}</address>
      <div class="dialog-actions">
        {textlink("Call " + phone(d), tel(d), "button primary")}
        {textlink("Get directions", location(d), "button outline", True)}
      </div>
      {textlink("Email SK Group", mail("Enquiry: " + d["brand"] + " · " + d["place"]))}
    </dialog>'''


def branch(d):
    prefix = "../../"
    offerings = "".join(f'<article><span class="business-index">{i:02d}</span><h3>{h(label)}</h3><p>{h(copy)}</p></article>'
                        for i, (label, copy) in enumerate(d["offerings"], start=1))
    name = d["brand"] + " · " + d["place"]
    mail_link = mail("Enquiry: " + name)
    hours = (f'<div><dt>Showroom hours</dt><dd>{h(d["hours"])}</dd></div>' if d.get("hours")
             else '<div><dt>Opening hours</dt><dd>Call the branch before visiting.</dd></div>')
    branch_photos = ([d["photo"]] if d.get("photo") else []) + d.get("gallery", [])
    gallery = ""
    if branch_photos:
        gallery = f'''<section class="band gallery branch-gallery" aria-labelledby="branch-gallery-title">
          <div class="wrap">
            <div class="section-head"><div>{eyebrow("AT THIS LOCATION")}<h2 id="branch-gallery-title">Through the <em>lens.</em></h2></div>
              {textlink("Photo credits", prefix + "photo-credits.html")}</div>
            <div class="gallery-grid">{"".join(photo_card(PHOTOS[key], prefix) for key in branch_photos)}</div>
          </div>
        </section>'''
    related = "".join(f'<li>{textlink(x["brand"] + " · " + x["place"], prefix + route(x))}</li>' for x in DEALERS if x != d)
    content = f'''{header(prefix, sub=True)}
    <main id="main">
      <div class="wrap trail"><a href="{prefix}#dealerships">← All dealerships</a><span>{h(d["kind"])} / {h(d["district"])}</span></div>
      <section class="branch-hero wrap" aria-labelledby="branch-title">
        <div class="branch-intro">
          {eyebrow(d["place"].upper() + " · ASSAM")}
          <h1 id="branch-title">{h(d["brand"])}</h1>
          <p class="branch-operator">{h(d["operator"])}</p>
          <p class="branch-summary">{h(d["intro"])}</p>
          <div class="buttons">
            {textlink("Contact branch", "#visit", "button primary", extra=" data-branch-contact")}
            {textlink("Get directions", location(d), "button outline", True)}
          </div>
        </div>
        {media_panel(d, prefix, eager=True)}
      </section>
      <section id="visit" class="visit wrap" aria-labelledby="visit-title">
        <div>{eyebrow("PLAN YOUR VISIT")}<h2 id="visit-title">Reach the <em>showroom.</em></h2>
          <div class="visit-links">
            {textlink("Email SK Group", mail_link)}
            {textlink(d["source_label"], d["source"], external=True)}
          </div>
        </div>
        <dl class="visit-details">
          <div><dt>Address</dt><dd><address>{h(d["address"])}</address></dd></div>
          <div><dt>Call this branch</dt><dd><a href="{h(tel(d))}">{h(phone(d))}</a></dd></div>
          {hours}
        </dl>
      </section>
      <section class="band offerings" aria-labelledby="offerings-title">
        <div class="wrap">
          <div class="section-head"><div>{eyebrow("AT THE SHOWROOM")}<h2 id="offerings-title">What we can <em>help with.</em></h2></div></div>
          <div class="offering-grid">{offerings}</div>
        </div>
      </section>
      {gallery}
      <section class="band more-dealers" aria-labelledby="more-title"><div class="wrap">
        <div class="section-head"><div>{eyebrow("SK GROUP X / ASSAM")}<h2 id="more-title">Explore other <em>branches.</em></h2></div></div>
        <ul>{related}</ul>
      </div></section>
    </main>
    {footer(prefix)}
    <div class="mobile-branch-actions" aria-label="Branch actions">
      {textlink("Call branch", tel(d), "button outline")}
      {textlink("Contact branch", "#visit", "button primary", extra=" data-branch-contact")}
    </div>
    {branch_dialog(d)}
    {lightbox() if branch_photos else ""}'''
    schema = {"@context": "https://schema.org", "@type": "AutoDealer", "name": d["brand"] + " — " + d["operator"] + " (" + d["place"] + ")",
              "url": ORIGIN + route(d), "description": d["intro"], "telephone": "+91" + d["phone"],
              "address": {"@type": "PostalAddress", "streetAddress": d["address"], "addressLocality": d["district"],
                          "addressRegion": "Assam", "addressCountry": "IN"}}
    social = PHOTOS[d["photo"]]["file"] if d.get("photo") else MARKS[d["mark"]]["file"]
    if d.get("photo"):
        schema["image"] = ORIGIN + "assets/" + social
    return document(name + " | SK Group X", d["short"], prefix, route(d), content, page="branch-page", social=social, schema=schema)


def credits():
    parts = []
    for p in PHOTOS.values():
        parts.append(f'<li><strong>{h(p["title"])}</strong><p>{h(p["caption"])}<br>{h(p["credit"])}.</p></li>')
    content = f'''{header("./")}
    <main id="main" class="band"><div class="wrap credits-page">
      {eyebrow("SK GROUP X / PHOTOGRAPHY")}<h1>Photo credits.</h1>
      <p>Showroom and opening-day photography from SK Group’s locations in Assam.</p>
      <ul>{"".join(parts)}</ul>
      <p>Brand and dealership marks identify the businesses featured on their respective pages.</p>
      {textlink("Back to the gallery", "./#gallery")}
    </div></main>{footer("./")}'''
    return document("Photo credits | SK Group X", "Credits for SK Group X showroom and launch photography.", "./", "photo-credits.html", content, page="credits")


def validate():
    ids = {d["id"] for d in DEALERS}
    assert len(ids) == len(DEALERS)
    for d in DEALERS:
        assert d["phone"].isascii() and d["phone"].isdigit() and len(d["phone"]) == 10, d["id"]
        for key in ([d["photo"]] if d.get("photo") else []) + d.get("gallery", []):
            assert PHOTOS[key]["owner"] == d["id"], (d["id"], key)
    for p in [*PHOTOS.values(), *MARKS.values()]:
        assert (BASE / "assets" / p["file"]).is_file(), p["file"]
        if p.get("small"):
            assert (BASE / "assets" / p["small"]).is_file(), p["small"]
    assert all(p["owner"] in ids for p in PHOTOS.values())


def write(path, body):
    output = BASE / path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(body, encoding="utf-8")


if __name__ == "__main__":
    validate()
    write("index.html", home())
    write("photo-credits.html", credits())
    for dealership in DEALERS:
        write(route(dealership) + "index.html", branch(dealership))
