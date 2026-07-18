# TEL — Tech for Easy Life website

Static multi-page website for TEL's education and practical-learning branch, built for GitHub Pages and `techforeasylife.in`.

## Pages

- `index.html` — Home
- `product.html` — TEL Model Rocket Kit and project two teaser
- `schools.html` — Institution and individual pathways
- `safety.html` — SAFEFLIGHT framework, readiness console and quiz
- `careers.html` — Careers and future areas
- `about.html` — Mission and founding team
- `contact.html` — Email-based enquiry form
- `404.html` — Branded not-found page

## Publish this update on GitHub

1. Download and extract `TEL-Website-Easy-Upload-v3.zip`.
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
- The official TEL logo is used in the header and footer.
- Product pricing is intentionally not public.
- Individual product access is marked coming soon; institutions are sent to direct enquiry.
- The SAFEFLIGHT page is a public educational demo and does not issue a real kit unlock code.
- Founder portraits for Harsh Das and Devangi Das are included on the About page, together with TEL classroom and field photographs on the Schools page.
- The Schools page includes the institution proposal, ecosystem integration formats, reasons to choose TEL, implementation pathway and institution FAQ.
