# TEL Ventures + teMark | staged website update

**Status:** review only. These changes are on `tel-ventures-temark-preview`, not on `main`.

## Scope

- TEL homepage repositioned as an umbrella venture brand. Existing TEL styling, header, cosmic background, controls, and footer system retained.
- New `temark.html` page for teMark creative and marketing services.
- The supplied teMark logo has been traced to `temark-logo.svg` for scalable staging use.
- TEL Education, product, schools, and safety pages remain. Public copy identifies their full rollout as planned for early 2027.
- Navigation synchronized across existing public pages.
- `data/ventures.json` provides company positioning, venture status, services, and SK Group-related portfolio entries.
- `venture-site.js` renders saved venture content using text-only DOM updates. `venture-site.css` layers atop existing design.
- `data/site-content.json` updated to add editable image slots for new homepage/teMark visuals while preserving existing education/leadership slots.

## Client attribution

Current list has been supplied by TEL and may require client approval before public display. The portfolio names correspond to dealerships/business locations within the SK Group servicing scope, not direct relationships with national manufacturers. No invented campaign results or metrics are shown.

## Deployment order (do not skip)

1. Review and merge this branch into main after checking wording, logos, client approvals and mobile layout.
2. Deploy the **TEL_Admin_API_v4_2_TeMark.js** Cloudflare Worker on the existing `tel-website-admin-api` Worker. It preserves the existing route set and fixes the v4.1.0 visual-selector bug as in v4.1.1, and adds authenticated venture saving.
3. Upload **TEL_Admin_v4_2_TeMark_Cloudflare_Direct_Upload.zip** to the existing Cloudflare Pages project for `admin.techforeasylife.in`.
4. Check `/health` version `4.2.0`, `/api/ventures`, admin login, Ventures Manager, image uploads, visual saves, draft → preview → publish, rollback, main site, mobile nav and all original educational pages.
5. If anything fails, restore the previous Cloudflare Worker revision, redeploy the previous Admin ZIP, and revert the website commit. Do not change existing Worker bindings/secrets.

## Important limitations

- The website is staged in GitHub, not published to production.
- A browser-based live-site screenshot has not been verified in this session.
- The teMark logo is a vector trace for preview. You may replace it with the supplied full-resolution master after approval.
- Ventures Manager saves directly to `data/ventures.json`, independent of the existing announcement draft/publish workflow; this is shown explicitly in its UI.

**Existing domains remain:** `techforeasylife.in` and `admin.techforeasylife.in`.
