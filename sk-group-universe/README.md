# SK Group · A world of possibilities

A complete, image-led frontend demonstration prepared by TeMark, a TEL initiative. The design combines large photographs, pearl surfaces, lavender accents and a deep-indigo night theme.

## View the demo

Open `dist/index.html` in a browser, or serve the `dist` directory with any static web server. The site uses local photos, fonts, CSS and JavaScript; no build step or external runtime dependency is required.

The ten screens cover the homepage, vehicle collection, five brand views, showrooms, ownership and calculators, request wizard, group story, saved vehicles, feature roadmap and sample admin studio.

## Cloudflare Pages

Create a separate Pages project using Direct Upload and upload the contents of `dist`, with `index.html` at the upload root. The supplied Cloudflare demo ZIP has this structure. A custom domain is optional. This demo does not require a database, functions or paid add-ons.

If using Wrangler with an authenticated Cloudflare account, deploy with `npx wrangler pages deploy dist --project-name sk-group-universe-demo` from this project directory. Choose an available project name when creating the Pages project.

## Demonstration boundaries

- Requests are UI previews. They do not send messages, reserve appointments, create real leads or store contact details.
- My Garage uses this browser's local storage. Comparison choices use session storage.
- The admin studio contains eight fictional sample enquiries and is a visual preview, without authentication or a connected CRM.
- Calculators use the visitor's inputs; they are illustrative calculations rather than finance quotations.
- Vehicle images and model references illustrate the brands. Current stock, pricing, specifications, showroom hours and appointment availability require confirmation.
- Two Royal Enfield branches have public contact details. Other branch contact information is deliberately left for client verification.
- `FEATURES.md` and the interactive roadmap contain 120 ideas; 45 have UI previews and 75 are proposed later work.

## Editing

Edit `dist/app.js`, `dist/base.css` and `dist/universe.css` directly. Page templates and source data live in `source/build.py` and `source/gallery.json`. Run `python3 source/build.py` to rebuild HTML, `data.js` and the feature catalogue. This retains the shared CSS, JavaScript, photos and fonts.

The on-site credit panel identifies imagery sources. Sora and DM Sans licence notices are included under `dist/assets/fonts`.
