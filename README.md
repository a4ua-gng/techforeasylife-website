# TEL — Tech for Easy Life website

Static multi-page website for TEL's education and practical-learning branch, built for GitHub Pages and `techforeasylife.in`.

## Pages

- `index.html` — Home
- `product.html` — TEL Model Rocket Kit and project two teaser
- `schools.html` — Institution and individual pathways
- `safety.html` — SafeFlight access, learning, weather, quiz, Mission Control and STEM tools
- `play.html` — TEL Play Lab browser games
- `careers.html` — Contribution areas and open applications
- `about.html` — Mission and founding team
- `contact.html` — Email-based enquiry form
- `404.html` — Branded not-found page

## Publish this update on GitHub

1. Download and extract the latest TEL website ZIP.
2. Open the `techforeasylife-website` repository on GitHub.
3. Select **Add file → Upload files**.
4. Select **every extracted file at once** and drag them into the upload area. This release deliberately has no folders: every `.html`, `.webp`, `.css`, `.js`, `.svg`, `.txt` and `.xml` file belongs beside `index.html` in the repository root.
5. Check that image names such as `kit-box.webp`, `tel-logo.webp` and `stem-classroom.webp` appear in the upload list. Do not upload the ZIP itself.
6. Enter a commit message such as `Update TEL education website`.
7. Select **Commit changes**.
8. Open **Actions** and wait for the Pages deployment to show a green check.
9. Refresh the live GitHub Pages URL. A hard refresh with `Ctrl + Shift + R` may be needed.

GitHub Pages should remain configured as **Deploy from a branch → main → /(root)**.

## Custom domain

Connect `techforeasylife.in` only after the GitHub Pages preview looks correct. In repository **Settings → Pages**, enter the domain under **Custom domain** and then follow GitHub's DNS check. Do not add a `CNAME` file before the domain is ready to move from the current host.

## Notes

- The contact form opens the visitor's email app; there is no server or database.
- Kit sales and institution proposals route to `techforeasylife.sales@gmail.com`.
- Careers, operations and general questions route to `techforeasylife.operations@gmail.com`.
- All website images are flattened into the repository root to avoid missed-folder uploads on GitHub.
- The official TEL logo is used in the header, footer, About brand panel and browser favicon.
- The TEL Model Rocket Kit is the main visual focus, led by the line “Why skies? Go beyond it!”
- The supplied TEL rocket render is presented beside the kit box and on the Product page.
- Both real kit gallery photographs use a matte-black studio background and full-product framing.
- The Product gallery includes a real TEL rocket prototype photograph, and Schools includes a supervised field-test photograph supplied by TEL.
- Product pricing is intentionally not public.
- Individual product access is marked coming soon; institutions are sent to direct enquiry.
- The SafeFlight page is a public educational demo and does not issue a real kit unlock code. Real serial/code validation and teacher overrides require a secure authenticated backend.
- Current weather awareness is supplied through Open-Meteo and never acts as automatic practical authorization.
- TEL Play Lab includes a visual digital-model puzzle and a fictional arcade game; neither contains physical assembly or practical flight instructions.
- Careers is visible in the desktop and mobile navigation and on the homepage.
- Founder portraits for Harsh Das and Devangi Das are included on the About page, together with TEL classroom and field photographs on the Schools page.
- The Schools page includes the institution proposal, ecosystem integration formats, reasons to choose TEL, implementation pathway and institution FAQ.
