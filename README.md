# Shelly Radnik — Personal Guidance Website

Premium Hebrew RTL static site, ready for GitHub Pages.

## Preview locally

```bash
python -m http.server 4173
```

Then open `http://localhost:4173/`.

## One required business setting

Edit `site-data.js` and set `whatsappNumber` to digits only including country code, for example:

```js
whatsappNumber: "9725XXXXXXXX"
```

When it is empty, WhatsApp opens with the prepared message and lets the visitor choose the recipient.

## Approval mode

The site currently includes:

```html
<meta name="robots" content="noindex,nofollow">
```

and a visible private-draft banner. Remove both only after content, legal copy, shop-link format and assets have written approval.

## Asset policy

All included visual assets are original abstract AI-generated images selected for this project. No official Forever logo, product packshot or packaging is included.

## Animation implementation

- requestAnimationFrame parallax for water backgrounds
- IntersectionObserver section reveals
- CSS intro and ambient water glow
- no scroll hijacking
- full `prefers-reduced-motion` fallback

The motion approach was informed by open-source animation patterns and implemented from scratch without copying project-specific code.

## Deploy

1. Push to `main`.
2. In **Settings → Pages**, choose **GitHub Actions**.
3. The included workflow publishes the site automatically.
