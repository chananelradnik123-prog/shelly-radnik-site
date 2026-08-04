const ASSET_PARTS=["hero-desktop.0","hero-desktop.1"];async function loadVisualAssets(){try{const data=(await Promise.all(ASSET_PARTS.map(async p=>{const r=await fetch(`assets/${p}`,{cache:"force-cache"});if(!r.ok)throw new Error(`HTTP ${r.status}`);return(await r.text()).trim()}))).join("");const url=`url("data:image/webp;base64,${data}")`;["--hero-desk","--hero-mobile","--section-light","--cta-dark","--honey-bg","--aloe-square","--liquid-wide","--portrait"].forEach(v=>document.documentElement.style.setProperty(v,url));document.body.classList.add("visuals-ready")}catch(err){console.warn("visual asset failed",err)}}loadVisualAssets();
const CONFIG = {
      whatsappNumber: '',
      officialShopUrl: 'https://flpil.co.il/?agent=64213'
    };

    const header = document.getElementById('header');
    const reveals = [...document.querySelectorAll('.reveal')];
    const mobileBar = document.getElementById('mobileBar');
    const hero = document.getElementById('top');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, {threshold: .14});
    reveals.forEach(el => revealObserver.observe(el));

    const toggleHeader = () => {
      header.classList.toggle('scrolled', window.scrollY > 24);
      mobileBar.classList.toggle('show', window.innerWidth <= 760 && window.scrollY > hero.offsetHeight * .62 && document.getElementById('guidance').getBoundingClientRect().top > window.innerHeight * 0.35);
      if (!prefersReduced) {
        const y = Math.min(window.scrollY, hero.offsetHeight);
        document.querySelector('.hero-media').style.transform = `translateY(${y * 0.06}px) scale(1.02)`;
        document.querySelector('.hero-orb').style.transform = `translate3d(${y * -0.03}px, ${y * 0.03}px, 0)`;
        document.querySelector('.hero-orb2').style.transform = `translate3d(${y * 0.02}px, ${y * -0.02}px, 0)`;
      }
    };
    toggleHeader();
    addEventListener('scroll', toggleHeader, {passive:true});
    addEventListener('resize', toggleHeader);

    const form = document.getElementById('guideForm');
    const status = document.getElementById('status');
    const mobileWa = document.getElementById('mobileWa');
    const openWa = (text='שלום שלי, אני רוצה לקבל ליווי אישי דרך האתר.') => {
      const url = CONFIG.whatsappNumber ? `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      location.href = url;
    };
    mobileWa.addEventListener('click', e => { e.preventDefault(); openWa(); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = new FormData(form);
      const name = (data.get('name')||'').toString().trim();
      const phone = (data.get('phone')||'').toString().trim();
      const interest = (data.get('interest')||'').toString().trim();
      const contactTime = (data.get('contactTime')||'').toString().trim();
      const message = (data.get('message')||'').toString().trim();
      if (!name || !phone || !interest) {
        status.textContent = 'נא למלא שם, טלפון ותחום עניין.';
        return;
      }
      status.textContent = 'ההודעה מוכנה — עוברים ל־WhatsApp.';
      const text = `שלום שלי, אני רוצה לקבל ליווי אישי דרך האתר.\n\nשם: ${name}\nטלפון: ${phone}\nתחום עניין: ${interest}\nמתי נוח לחזור: ${contactTime || 'לא צוין'}\nהערה: ${message || 'לא נכתבה הערה'}`;
      setTimeout(()=>openWa(text), 450);
    });

    const progress = document.getElementById('scrollProgress');
    const backToTop = document.getElementById('backToTop');
    const visualBreak = document.querySelector('.visual-break');
    const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
    const sections = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

    function updatePremiumMotion(){
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const ratio = Math.min(1, Math.max(0, scrollY / max));
      progress.style.transform = `scaleX(${ratio})`;
      backToTop.classList.toggle('show', scrollY > innerHeight * .9);
      if (visualBreak && !prefersReduced){
        const r = visualBreak.getBoundingClientRect();
        const delta = (innerHeight - r.top) * .035;
        visualBreak.style.setProperty('--break-shift', `${Math.max(-24, Math.min(24, delta))}px`);
        visualBreak.style.backgroundPositionY = `${delta * .35}px`;
      }
      let active = null;
      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= innerHeight * .42 && rect.bottom >= innerHeight * .3) active = section.id;
      });
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${active}`));
    }
    addEventListener('scroll', updatePremiumMotion, {passive:true});
    addEventListener('resize', updatePremiumMotion);
    updatePremiumMotion();

    document.querySelectorAll('.spotlight-card').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX-r.left}px`);
        card.style.setProperty('--my', `${e.clientY-r.top}px`);
        if (innerWidth > 980 && !prefersReduced){
          const rx = ((e.clientY-r.top)/r.height-.5)*-2.2;
          const ry = ((e.clientX-r.left)/r.width-.5)*2.2;
          card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
        }
      });
      card.addEventListener('pointerleave', () => card.style.transform='');
    });

    setTimeout(() => {
      document.querySelectorAll('.reveal,.reveal-group').forEach(el => el.classList.add('is-visible'));
    }, 1600);
