import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { tryAdminLogin } from "@/lib/adminBypass";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ═══════════════════════════════════════════════════════════════
   CSS — scoped under #lp-root, globals only for fixed elements
═══════════════════════════════════════════════════════════════ */
const LANDING_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Instrument+Serif:ital@0;1&display=swap');

#lp-root{background:#0a0a0d;color:#f0f0f0;font-family:'Geist',sans-serif;font-size:15px;line-height:1.6;overflow-x:hidden;cursor:none}
#lp-root *{box-sizing:border-box;margin:0;padding:0}

/* CURSOR */
#lp-cursor{position:fixed;width:12px;height:12px;border-radius:50%;background:#e03030;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);mix-blend-mode:difference;transition:width .2s,height .2s}
#lp-cursor-ring{position:fixed;width:36px;height:36px;border-radius:50%;border:1px solid rgba(224,48,48,.5);pointer-events:none;z-index:9998;transform:translate(-50%,-50%);transition:all .12s ease}

/* INTRO */
#lp-intro{position:fixed;inset:0;z-index:500;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
#lp-intro.out{animation:lp-iout .8s cubic-bezier(.4,0,.2,1) forwards;pointer-events:none}
@keyframes lp-iout{0%{opacity:1;clip-path:inset(0 0 0 0)}100%{opacity:0;clip-path:inset(0 0 100% 0)}}
#lp-intro-logo{opacity:0;transition:opacity .4s ease}
#lp-intro-logo.in{opacity:1}
.lp-il-track{fill:none;stroke:#1a1a1a;stroke-width:2}
.lp-il-spin{fill:none;stroke:#e03030;stroke-width:2;stroke-linecap:round;stroke-dasharray:260;stroke-dashoffset:260;transform-origin:60px 60px;animation:lp-ilspin 1.8s cubic-bezier(.4,0,.2,1) forwards}
@keyframes lp-ilspin{0%{stroke-dashoffset:260;transform:rotate(-90deg)}65%{stroke-dashoffset:0;transform:rotate(200deg)}100%{stroke-dashoffset:0;transform:rotate(290deg)}}
.lp-il-pulse{fill:none;stroke:rgba(224,48,48,.15);stroke-width:8;transform-origin:60px 60px;animation:lp-ilpulse 1.8s ease-out forwards}
@keyframes lp-ilpulse{0%{stroke-width:8;opacity:.5}100%{stroke-width:28;opacity:0}}
.lp-il-dot{fill:#e03030;transform-origin:60px 60px;animation:lp-ildot .35s ease forwards 1s;opacity:0;transform:scale(0)}
@keyframes lp-ildot{to{opacity:1;transform:scale(1)}}
.lp-il-gex{font-family:'Instrument Serif',serif;font-size:13px;letter-spacing:.15em;fill:#555;text-anchor:middle;animation:lp-ilgex .5s ease forwards 1.1s;opacity:0}
@keyframes lp-ilgex{to{opacity:1}}
#lp-intro-lines{display:flex;flex-direction:column;gap:6px;opacity:0;transition:opacity .5s ease .5s}
#lp-intro-lines.in{opacity:1}
.lp-iline{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2a2a2a}
.lp-ibar{width:0;height:1px;background:linear-gradient(90deg,#e03030,transparent);transition:width .7s ease}
#lp-intro-lines.in .lp-iline:nth-child(1) .lp-ibar{width:40px;transition-delay:.7s}
#lp-intro-lines.in .lp-iline:nth-child(2) .lp-ibar{width:60px;transition-delay:.9s}
#lp-intro-lines.in .lp-iline:nth-child(3) .lp-ibar{width:30px;transition-delay:1.1s}
#lp-intro-pct{font-size:11px;letter-spacing:.12em;color:#2a2a2a;font-variant-numeric:tabular-nums;transition:color .3s}
#lp-intro-pct.done{color:#e03030}

/* SCROLL FX */
.lp-fu{opacity:0;transform:translateY(36px);filter:blur(6px);transition:opacity .9s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1),filter .8s ease}
.lp-fu.in{opacity:1;transform:translateY(0);filter:blur(0)}
.lp-fu.d1{transition-delay:.07s}.lp-fu.d2{transition-delay:.14s}.lp-fu.d3{transition-delay:.21s}.lp-fu.d4{transition-delay:.28s}.lp-fu.d5{transition-delay:.35s}
.lp-mr{clip-path:inset(0 100% 0 0);transition:clip-path 1.3s cubic-bezier(.16,1,.3,1)}
.lp-mr.in{clip-path:inset(0 0% 0 0)}

/* NAV */
#lp-nav{position:sticky;top:0;z-index:100;background:rgba(10,10,13,.88);backdrop-filter:blur(28px);border-bottom:1px solid #1e1e22;padding:13px 40px;display:flex;align-items:center;justify-content:space-between;transform:translateY(-100%);opacity:0;transition:transform .7s cubic-bezier(.22,1,.36,1),opacity .5s ease}
#lp-nav.in{transform:translateY(0);opacity:1}
.lp-logo{font-weight:700;font-size:17px;letter-spacing:.05em;display:flex;align-items:center;gap:9px;color:#f0f0f0;cursor:pointer}
.lp-pulse{width:7px;height:7px;border-radius:50%;background:#e03030;display:inline-block;animation:lp-pu 2.2s infinite;flex-shrink:0}
@keyframes lp-pu{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.5)}}
.lp-nav-links{display:flex;gap:32px;font-size:13px}
.lp-nav-links a{color:#666;text-decoration:none;cursor:pointer;transition:color .2s;letter-spacing:.04em}
.lp-nav-links a:hover{color:#f0f0f0}
.lp-nav-cta{display:flex;align-items:center;gap:10px}
.lp-nbg{padding:7px 16px;border-radius:7px;background:transparent;border:1px solid #1e1e22;color:#666;font-size:13px;cursor:pointer;transition:all .2s;font-family:'Geist',sans-serif}
.lp-nbg:hover{border-color:rgba(224,48,48,.4);color:#f0f0f0}
.lp-nb{padding:7px 18px;border-radius:7px;background:#e03030;color:#fff;font-weight:500;font-size:13px;border:none;cursor:pointer;font-family:'Geist',sans-serif;transition:opacity .2s}
.lp-nb:hover{opacity:.85}

/* DISCOUNT BAR */
#lp-dbar{background:rgba(224,48,48,.07);border-bottom:1px solid rgba(224,48,48,.15);padding:9px 40px;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;font-size:12px;letter-spacing:.04em;opacity:0;transition:opacity .5s ease}
#lp-dbar.in{opacity:1}
.lp-dbadge{display:inline-flex;align-items:center;gap:7px;background:rgba(224,48,48,.1);border:1px solid rgba(224,48,48,.25);border-radius:20px;padding:4px 12px}
.lp-dcode{font-weight:700;letter-spacing:.12em;font-size:11px;color:#e05050}
.lp-doff{color:#666;font-size:11px}
.lp-dcopy{background:none;border:none;color:#e03030;font-size:10px;font-weight:600;cursor:pointer;padding:0 4px;font-family:'Geist',sans-serif;letter-spacing:.08em}
.lp-dcopy:hover{text-decoration:underline}
.lp-dlabel{color:#666;letter-spacing:.12em;text-transform:uppercase;font-size:10px}

/* TICKER */
.lp-tick-wrap{border-bottom:1px solid #1e1e22;background:#111114;overflow:hidden;opacity:0;transition:opacity .6s ease}
.lp-tick-wrap.in{opacity:1}
.lp-tick-inner{display:flex;white-space:nowrap;animation:lp-tick 50s linear infinite}
.lp-ti{display:inline-flex;align-items:center;gap:10px;padding:10px 28px;font-size:12px;border-right:1px solid #1e1e22;flex-shrink:0}
.lp-ts{font-weight:600;letter-spacing:.07em;font-size:11px;color:#f0f0f0}
.lp-tp{color:#666}
.lp-up{color:#3ecf6e}.lp-dn{color:#e03030}
@keyframes lp-tick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

/* HERO */
.lp-hero{padding:90px 40px 70px;text-align:center;position:relative;overflow:hidden;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
#lp-pcv{position:absolute;inset:0;pointer-events:none;z-index:0;width:100%;height:100%}
.lp-hero-bg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 60% at 50% -5%,rgba(224,48,48,.12),transparent 70%);z-index:1}
.lp-hero-cnt{position:relative;z-index:2;width:100%;max-width:900px;margin:0 auto}
.lp-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#e03030;background:rgba(224,48,48,.08);border:1px solid rgba(224,48,48,.2);border-radius:20px;padding:5px 14px;margin-bottom:28px}
.lp-hero h1{font-size:clamp(38px,6.5vw,80px);font-weight:700;line-height:1.04;letter-spacing:-.035em;margin-bottom:22px;color:#f0f0f0}
.lp-hero h1 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}
.lp-shimmer{background:linear-gradient(90deg,rgba(240,240,240,0) 0%,rgba(240,240,240,1) 45%,rgba(240,240,240,0) 100%);background-size:220% 100%;animation:lp-shim 3.5s infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
@keyframes lp-shim{to{background-position:220% 0}}
.lp-hsub{color:#666;font-size:17px;max-width:580px;margin:0 auto 40px;line-height:1.75}
.lp-hbtns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:60px}
.lp-btnp{padding:14px 34px;border-radius:8px;background:#e03030;color:#fff;font-weight:600;font-size:15px;letter-spacing:.03em;border:none;cursor:pointer;font-family:'Geist',sans-serif;transition:box-shadow .25s,transform .15s;position:relative;overflow:hidden}
.lp-btnp:hover{box-shadow:0 8px 32px rgba(224,48,48,.45);transform:translateY(-1px)}
.lp-btno{padding:14px 34px;border-radius:8px;border:1px solid #1e1e22;background:transparent;color:#f0f0f0;font-size:15px;cursor:pointer;font-family:'Geist',sans-serif;transition:border-color .2s,background .2s}
.lp-btno:hover{border-color:rgba(224,48,48,.35);background:rgba(224,48,48,.04)}

/* STATS */
.lp-stats{display:flex;justify-content:center;margin-bottom:64px;border:1px solid #1e1e22;border-radius:12px;overflow:hidden;background:#111114;max-width:520px;margin-left:auto;margin-right:auto}
.lp-si{flex:1;padding:22px 28px;text-align:center}
.lp-si+.lp-si{border-left:1px solid #1e1e22}
.lp-sn{font-size:30px;font-weight:700;color:#f0f0f0;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.lp-sl{font-size:10px;color:#666;margin-top:3px;letter-spacing:.1em;text-transform:uppercase}
.lp-sa{width:24px;height:2px;background:#e03030;border-radius:2px;margin:6px auto 0}

/* CHART */
.lp-chart{max-width:880px;margin:0 auto;background:#111114;border:1px solid #1e1e22;border-radius:14px;padding:28px;position:relative;overflow:hidden}
.lp-chart::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(224,48,48,.4),transparent)}
.lp-ch{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-bottom:16px;color:#666;letter-spacing:.06em}
.lp-chl{display:flex;align-items:center;gap:10px}
.lp-ldot{width:6px;height:6px;border-radius:50%;background:#e03030;animation:lp-pu 1.5s infinite;flex-shrink:0}
.lp-llabel{color:#e03030;font-weight:600;font-size:11px;letter-spacing:.1em}
.lp-cbadge{font-size:10px;background:rgba(224,48,48,.1);border:1px solid rgba(224,48,48,.2);color:rgba(224,80,80,.9);padding:2px 8px;border-radius:4px;letter-spacing:.06em}
#lp-ay{position:absolute;left:28px;top:44px;display:flex;flex-direction:column;justify-content:space-between;height:220px;font-size:10px;color:#444;letter-spacing:.04em;pointer-events:none;font-variant-numeric:tabular-nums}
#lp-tt{position:absolute;pointer-events:none;z-index:20;background:rgba(10,10,13,.95);border:1px solid rgba(224,48,48,.35);border-radius:10px;padding:12px 16px;font-size:12px;display:none;white-space:nowrap;backdrop-filter:blur(12px)}
.lp-tts{font-weight:700;margin-bottom:6px;font-size:13px;letter-spacing:.04em;color:#f0f0f0}
.lp-ttr{color:#666;margin-bottom:2px;display:flex;justify-content:space-between;gap:16px}
.lp-ttv{color:#f0f0f0;font-weight:500}

/* SECTIONS */
.lp-sec{padding:90px 40px}
.lp-con{max-width:1040px;margin:0 auto}
.lp-stitle{text-align:center;margin-bottom:56px}
.lp-slabel{display:inline-flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#e03030;margin-bottom:14px}
.lp-stitle h2{font-size:clamp(26px,4.5vw,50px);font-weight:700;letter-spacing:-.025em;margin-bottom:14px;color:#f0f0f0}
.lp-stitle h2 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}
.lp-stitle p{color:#666;max-width:520px;margin:0 auto;line-height:1.75;font-size:16px}
.lp-div{width:100%;height:1px;background:linear-gradient(90deg,transparent,#1e1e22,transparent)}

/* FEATURES */
.lp-fgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.lp-fc{background:#111114;border:1px solid #1e1e22;border-radius:16px;padding:36px 30px;transition:border-color .3s,transform .3s;position:relative;overflow:hidden}
.lp-fc::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(224,48,48,.3),transparent);opacity:0;transition:opacity .3s}
.lp-fc:hover{border-color:rgba(224,48,48,.25);transform:translateY(-4px)}
.lp-fc:hover::before{opacity:1}
.lp-ficon{width:46px;height:46px;border-radius:11px;background:rgba(224,48,48,.08);border:1px solid rgba(224,48,48,.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.lp-ficon svg{width:20px;height:20px;stroke:rgba(200,70,70,.95);fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.lp-ftag{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#e03030;background:rgba(224,48,48,.08);border:1px solid rgba(224,48,48,.18);border-radius:4px;padding:2px 8px;margin-bottom:12px}
.lp-fc h3{font-size:16px;font-weight:600;letter-spacing:-.02em;margin-bottom:9px;color:#f0f0f0}
.lp-fc p{color:#666;font-size:13px;line-height:1.8}

/* TESTIMONIALS */
.lp-tw{overflow:hidden;position:relative;padding:16px 0}
.lp-tw::before,.lp-tw::after{content:'';position:absolute;top:0;bottom:0;width:100px;z-index:2;pointer-events:none}
.lp-tw::before{left:0;background:linear-gradient(90deg,#0a0a0d,transparent)}
.lp-tw::after{right:0;background:linear-gradient(-90deg,#0a0a0d,transparent)}
.lp-tt2{display:flex;gap:16px;animation:lp-ts 40s linear infinite;width:max-content;padding:0 16px}
.lp-tt2:hover{animation-play-state:paused}
.lp-tc{background:#111114;border:1px solid #1e1e22;border-radius:14px;padding:24px 26px;width:300px;flex-shrink:0}
.lp-tst{display:flex;gap:3px;margin-bottom:12px}
.lp-star{width:12px;height:12px;background:#e03030;clip-path:polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%);flex-shrink:0}
.lp-txt{font-size:13px;color:#666;line-height:1.75;margin-bottom:16px;font-style:italic}
.lp-txt::before{content:'"';color:#e03030;font-size:18px;font-family:'Instrument Serif',serif;margin-right:2px}
.lp-tauth{display:flex;align-items:center;gap:10px}
.lp-tav{width:32px;height:32px;border-radius:50%;background:rgba(224,48,48,.15);border:1px solid rgba(224,48,48,.25);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:rgba(224,100,100,.9);flex-shrink:0}
.lp-tname{font-size:13px;font-weight:600;color:#f0f0f0}
.lp-trole{font-size:11px;color:#666}
.lp-textra{font-size:10px;color:#3ecf6e;margin-top:2px;letter-spacing:.04em}
@keyframes lp-ts{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}

/* PLANS */
.lp-pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
.lp-pc{background:#111114;border:1px solid #1e1e22;border-radius:14px;padding:32px;position:relative;transition:transform .3s}
.lp-pc.hot{border-color:rgba(224,48,48,.4);background:rgba(224,48,48,.03)}
.lp-pc.hot::before{content:'';position:absolute;inset:0;border-radius:14px;background:radial-gradient(ellipse at top,rgba(224,48,48,.07),transparent 70%);pointer-events:none}
.lp-pbadge{display:inline-block;padding:4px 12px;border-radius:20px;background:#e03030;color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;margin-bottom:12px;text-transform:uppercase}
.lp-pname{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:4px;color:#f0f0f0}
.lp-pdesc{color:#666;font-size:13px;margin-bottom:22px}
.lp-pprice{display:flex;align-items:baseline;gap:4px;margin-bottom:28px}
.lp-pamt{font-size:46px;font-weight:700;letter-spacing:-.04em;color:#f0f0f0}
.lp-pper{font-size:14px;color:#666}
.lp-pfeat{list-style:none;margin-bottom:28px;display:flex;flex-direction:column;gap:10px}
.lp-pfeat li{font-size:13px;display:flex;align-items:flex-start;gap:10px;color:#666}
.lp-chk{color:#3ecf6e;flex-shrink:0;font-size:14px}
.lp-pbtn{width:100%;padding:13px;border-radius:8px;font-weight:600;font-size:14px;letter-spacing:.03em;cursor:pointer;font-family:'Geist',sans-serif;transition:all .2s}
.lp-pbtn.pr{background:#e03030;color:#fff;border:none}
.lp-pbtn.pr:hover{box-shadow:0 6px 24px rgba(224,48,48,.35);transform:translateY(-1px)}
.lp-pbtn.ou{background:transparent;border:1px solid #1e1e22;color:#f0f0f0}
.lp-pbtn.ou:hover{border-color:rgba(224,48,48,.3)}

/* FAQ */
.lp-faqw{max-width:700px;margin:0 auto}
.lp-faqitem{background:#111114;border:1px solid #1e1e22;border-radius:11px;margin-bottom:10px;overflow:hidden;transition:border-color .25s}
.lp-faqitem.open{border-color:rgba(224,48,48,.25)}
.lp-faqq{width:100%;text-align:left;background:transparent;border:none;color:#f0f0f0;font-size:14px;font-weight:500;padding:20px 24px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-family:'Geist',sans-serif;letter-spacing:.01em}
.lp-faqa-arr{transition:transform .35s cubic-bezier(.22,1,.36,1);color:#666;font-size:16px;flex-shrink:0}
.lp-faqitem.open .lp-faqa-arr{transform:rotate(45deg);color:#e03030}
.lp-faqa{max-height:0;overflow:hidden;transition:max-height .4s cubic-bezier(.22,1,.36,1);font-size:13px;color:#666;line-height:1.8;padding:0 24px}
.lp-faqitem.open .lp-faqa{max-height:300px;padding:0 24px 20px}

/* CTA */
.lp-cta{padding:100px 40px;text-align:center;position:relative;overflow:hidden}
.lp-cta-grid{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(#1e1e22 1px,transparent 1px),linear-gradient(90deg,#1e1e22 1px,transparent 1px);background-size:60px 60px;opacity:.3}
.lp-ctai{position:relative;max-width:680px;margin:0 auto}
.lp-cta h2{font-size:clamp(28px,5vw,56px);font-weight:700;letter-spacing:-.03em;margin-bottom:18px;color:#f0f0f0}
.lp-cta h2 em{font-family:'Instrument Serif',serif;font-style:italic;font-weight:400}
.lp-ctap{color:#666;max-width:500px;margin:0 auto 36px;line-height:1.75;font-size:16px}
.lp-ctaform{display:flex;gap:10px;max-width:460px;margin:0 auto;flex-wrap:wrap;justify-content:center}
.lp-ctain{flex:1;min-width:210px;padding:13px 18px;background:#111114;border:1px solid #1e1e22;border-radius:8px;color:#f0f0f0;font-size:14px;outline:none;font-family:'Geist',sans-serif;transition:border-color .2s}
.lp-ctain:focus{border-color:rgba(224,48,48,.4)}
.lp-ctain::placeholder{color:#444}
.lp-ctasub{padding:13px 26px;background:#e03030;color:#fff;font-weight:600;font-size:14px;border:none;border-radius:8px;cursor:pointer;font-family:'Geist',sans-serif;transition:box-shadow .2s,transform .15s;white-space:nowrap}
.lp-ctasub:hover{box-shadow:0 6px 24px rgba(224,48,48,.35);transform:translateY(-1px)}
.lp-ctaok{margin-top:16px;font-size:13px;color:#3ecf6e;letter-spacing:.03em}
.lp-trust{margin-top:24px;display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap}
.lp-tri{display:flex;align-items:center;gap:6px;font-size:12px;color:#444}
.lp-trd{width:5px;height:5px;border-radius:50%;background:#3ecf6e;flex-shrink:0}

/* FOOTER */
.lp-footer{border-top:1px solid #1e1e22;padding:56px 40px 32px;background:#0a0a0d}
.lp-fgr{display:grid;grid-template-columns:2.5fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px;max-width:1040px;margin-left:auto;margin-right:auto}
.lp-fbrand p{color:#666;font-size:13px;margin-top:12px;line-height:1.7;max-width:260px}
.lp-footer h4{font-size:10px;font-weight:700;margin-bottom:16px;letter-spacing:.12em;text-transform:uppercase;color:#444}
.lp-footer ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.lp-footer ul li a{color:#666;text-decoration:none;font-size:13px;transition:color .2s;cursor:pointer}
.lp-footer ul li a:hover{color:#f0f0f0}
.lp-fcopy{text-align:center;font-size:11px;color:#444;padding-top:28px;border-top:1px solid #1e1e22;max-width:1040px;margin:0 auto;letter-spacing:.04em}
.lp-fdisc{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;background:rgba(88,101,242,.12);border:1px solid rgba(88,101,242,.25);border-radius:8px;color:rgba(150,158,255,.9);font-size:13px;font-weight:500;text-decoration:none;margin-top:16px;transition:background .2s}
.lp-fdisc:hover{background:rgba(88,101,242,.2)}

/* TOAST */
#lp-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(80px);background:rgba(10,10,13,.95);border:1px solid rgba(62,207,110,.4);border-radius:8px;padding:10px 20px;font-size:13px;color:#3ecf6e;z-index:9999;transition:transform .3s cubic-bezier(.22,1,.36,1),opacity .3s;opacity:0;pointer-events:none;backdrop-filter:blur(12px)}
#lp-toast.show{transform:translateX(-50%) translateY(0);opacity:1}

/* MODAL SHARED */
.lp-moverlay{display:none;position:fixed;inset:0;z-index:400;backdrop-filter:blur(12px);align-items:center;justify-content:center}
.lp-moverlay.open{display:flex}
.lp-mbox{border-radius:18px;padding:36px 32px;width:100%;max-width:400px;position:relative;margin:20px}
.lp-flabel{font-size:12px;color:#555;letter-spacing:.06em;text-transform:uppercase;display:block;margin-bottom:7px}
.lp-finput{width:100%;padding:12px 14px;background:#0a0a0d;border:1px solid #1e1e22;border-radius:8px;color:#f0f0f0;font-size:14px;outline:none;font-family:'Geist',sans-serif;box-sizing:border-box}
.lp-finput:focus{border-color:rgba(224,48,48,.4)}
.lp-mbtn{width:100%;padding:14px;background:#e03030;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Geist',sans-serif}
.lp-mbtn:hover{opacity:.9}
.lp-mclose{position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;font-family:'Geist',sans-serif}

@media(max-width:768px){
  .lp-fgr{grid-template-columns:1fr 1fr;gap:28px}
  #lp-nav .lp-nav-links{display:none}
  .lp-sec{padding:60px 20px}
  .lp-hero{padding:60px 20px 40px;min-height:auto}
  .lp-cta{padding:60px 20px}
}
`;

/* ═══════════════════════════════════════════════════════════════
   STATIC DATA
═══════════════════════════════════════════════════════════════ */
const TICKERS = [
  {s:'SPX',p:'5,680.50',c:'+0.85%'},{s:'NDX',p:'19,842.30',c:'+1.12%'},
  {s:'RUT',p:'2,234.80',c:'-0.34%'},{s:'AAPL',p:'234.56',c:'+0.92%'},
  {s:'NVDA',p:'138.45',c:'+2.41%'},{s:'TSLA',p:'248.90',c:'-1.23%'},
  {s:'META',p:'582.10',c:'+0.67%'},{s:'MSFT',p:'445.32',c:'+0.45%'},
  {s:'VIX',p:'14.25',c:'-3.45%'},{s:'SPY',p:'567.20',c:'+0.81%'},
  {s:'QQQ',p:'482.15',c:'+1.05%'},{s:'GLD',p:'214.30',c:'+0.22%'},
];
const TESTIMONIALS = [
  {name:'Carlos M.',role:'Day Trader · SPX',text:'Llevo 8 meses con GEXSATELIT. El gamma flip me salvó de varios drawdowns brutales. Imprescindible.',extra:'Cliente desde 2024 · +320% portfolio'},
  {name:'Ana L.',role:'Options Trader · QQQ',text:'Las call/put walls funcionan como imanes. Es la herramienta más precisa que he probado.',extra:'Win rate subió del 54% al 71%'},
  {name:'David R.',role:'Quant · Hedge Fund',text:'La latencia y la calidad de datos son institucionales. El precio es ridículamente bajo para lo que entrega.',extra:'Reemplazó software de $2k/mes'},
  {name:'Sofía P.',role:'Swing Trader',text:'El AI Bias me dice exactamente cuándo el régimen cambia. Operar contra dealers ya no me pasa.',extra:'Suscriptora Pro Elite'},
  {name:'Miguel A.',role:'Scalper · Futuros',text:'El regime indicator en tiempo real cambió cómo gestiono riesgo intradiario.',extra:'6 meses activo'},
  {name:'Laura T.',role:'Gestora · Portafolio',text:'Integré el API en mi modelo. Los datos superan a Bloomberg en GEX.',extra:'Plan Elite'},
];
const FAQ_DATA = [
  {q:'¿Qué es Gamma Exposure (GEX)?',a:'GEX mide la exposición a gamma de los market makers por strike. Cuando el mercado cotiza por encima del gamma flip, los dealers suavizan movimientos. Por debajo, los amplifican. Es el mapa invisible del mercado.'},
  {q:'¿Los datos son en tiempo real?',a:'Sí, con latencia menor a 200ms para planes Pro/Elite. El plan Starter recibe actualizaciones cada 15 minutos con datos verificados de CBOE.'},
  {q:'¿Puedo cancelar en cualquier momento?',a:'Absolutamente. Sin permanencia mínima. Cancelas desde tu perfil y el acceso se mantiene hasta el fin del período pagado.'},
  {q:'¿Qué diferencia hay entre GEX y DEX?',a:'GEX mide exposición a gamma (velocidad del delta). DEX mide exposición a delta total. Combinados, revelan cómo los dealers deben hacer hedging y qué niveles defienden.'},
  {q:'¿Tienen plan API?',a:'Sí, disponible en el plan Elite. Acceso completo a todos los endpoints con tu API key personal y documentación completa.'},
];
const STRIKES = [5580,5600,5620,5640,5660,5680,5700,5720,5740,5760,5780];
const GEX_DATA = [-2.1,-1.4,-0.6,0.3,1.1,2.8,3.4,2.1,1.2,0.5,-0.3];
const FEATURES = [
  {tag:'Real-time',title:'Perfil GEX en vivo',desc:'Actualizado cada segundo con datos de opciones de todas las exchanges principales de EEUU.',
   svg:<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></>},
  {tag:'Automático',title:'Niveles intradiarios',desc:'Call walls, put walls, gamma flip y zero gamma calculados automáticamente sin intervención manual.',
   svg:<><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></>},
  {tag:'Avanzado',title:'Griegas de segundo orden',desc:'Delta, Vega, Vanna y Charm exposure agregados para entender el posicionamiento dealer profundo.',
   svg:<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>},
  {tag:'Inteligente',title:'Alertas instantáneas',desc:'Notificaciones push cuando el precio toca niveles clave o el régimen gamma cambia de signo.',
   svg:<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>},
  {tag:'Multi-ticker',title:'Watchlist personalizada',desc:'Sigue SPX, SPY, QQQ, NDX y tus tickers favoritos en un solo panel centralizado.',
   svg:<><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>},
  {tag:'Seguro',title:'Acceso protegido',desc:'Tu cuenta y watchlist protegidas con autenticación moderna y cifrado de extremo a extremo.',
   svg:<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>},
];
const DELAYS = ['','d1','d2','d3','d4','d5'];

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function Landing() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const [authOpen, setAuthOpen]   = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [authTab, setAuthTab]     = useState<'login'|'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPwd,   setLoginPwd]   = useState('');
  const [adminUser,  setAdminUser]  = useState('');
  const [adminPwd,   setAdminPwd]   = useState('');
  const [adminErr,   setAdminErr]   = useState(false);
  const [ctaSent,    setCtaSent]    = useState(false);
  const [ctaEmail,   setCtaEmail]   = useState('');
  const [faqOpen,    setFaqOpen]    = useState<number|null>(null);

  /* inject / remove CSS */
  useEffect(() => {
    const s = document.createElement('style');
    s.id = 'lp-css';
    s.textContent = LANDING_CSS;
    document.head.appendChild(s);
    return () => { document.getElementById('lp-css')?.remove(); };
  }, []);

  /* cursor + intro + particles + chart + scroll observer */
  useEffect(() => {
    const cleanups: (() => void)[] = [];

    /* ── CURSOR ─────────────────────────────── */
    const cur  = document.getElementById('lp-cursor');
    const curR = document.getElementById('lp-cursor-ring');
    let mx = 0, my = 0, rx = 0, ry = 0, rafC = 0;
    const onMM = (e: MouseEvent) => {
      mx = e.clientX; my = e.clientY;
      if (cur) { cur.style.left = mx+'px'; cur.style.top = my+'px'; }
    };
    const tickC = () => {
      rx += (mx-rx)*0.12; ry += (my-ry)*0.12;
      if (curR) { curR.style.left = rx+'px'; curR.style.top = ry+'px'; }
      rafC = requestAnimationFrame(tickC);
    };
    document.addEventListener('mousemove', onMM);
    tickC();
    cleanups.push(() => { document.removeEventListener('mousemove', onMM); cancelAnimationFrame(rafC); });

    /* ── INTRO ──────────────────────────────── */
    const logo    = document.getElementById('lp-intro-logo');
    const lines   = document.getElementById('lp-intro-lines');
    const pctEl   = document.getElementById('lp-intro-pct');
    const introEl = document.getElementById('lp-intro');
    const navEl   = document.getElementById('lp-nav');
    const dbarEl  = document.getElementById('lp-dbar');
    const tickEl  = document.getElementById('lp-tw');

    setTimeout(() => logo?.classList.add('in'), 100);
    setTimeout(() => lines?.classList.add('in'), 500);

    let pct = 0;
    const countId = setInterval(() => {
      pct += Math.random()*6+2;
      if (pct >= 100) {
        pct = 100; clearInterval(countId);
        if (pctEl) { pctEl.textContent = '100%'; pctEl.classList.add('done'); }
        setTimeout(() => {
          introEl?.classList.add('out');
          setTimeout(() => {
            if (introEl) introEl.style.display = 'none';
            navEl?.classList.add('in');
            dbarEl?.classList.add('in');
            tickEl?.classList.add('in');
          }, 800);
        }, 400);
        return;
      }
      if (pctEl) pctEl.textContent = Math.floor(pct)+'%';
    }, 40);
    cleanups.push(() => clearInterval(countId));

    /* ── PARTICLES ──────────────────────────── */
    const canvas = document.getElementById('lp-pcv') as HTMLCanvasElement|null;
    let rafP = 0;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      let W = 0, H = 0;
      type Pt = {x:number;y:number;vx:number;vy:number;r:number;a:number};
      const pts: Pt[] = [];
      const resize = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
      const init   = () => { pts.length=0; for(let i=0;i<80;i++) pts.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*.3,vy:(Math.random()-.5)*.3,r:Math.random()*1.5+.3,a:Math.random()}); };
      resize(); init();
      const onR = () => { resize(); init(); };
      window.addEventListener('resize', onR);
      const draw = () => {
        ctx.clearRect(0,0,W,H);
        pts.forEach(p => {
          p.x+=p.vx; p.y+=p.vy;
          if(p.x<0||p.x>W) p.vx*=-1;
          if(p.y<0||p.y>H) p.vy*=-1;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
          ctx.fillStyle=`rgba(224,48,48,${p.a*.35})`; ctx.fill();
        });
        pts.forEach((p,i) => {
          for(let j=i+1;j<pts.length;j++){
            const dx=p.x-pts[j].x,dy=p.y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
            if(d<120){ ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(pts[j].x,pts[j].y);
              ctx.strokeStyle=`rgba(224,48,48,${(1-d/120)*.08})`; ctx.lineWidth=.5; ctx.stroke(); }
          }
        });
        rafP = requestAnimationFrame(draw);
      };
      draw();
      cleanups.push(() => { window.removeEventListener('resize', onR); cancelAnimationFrame(rafP); });
    }

    /* ── CHART ──────────────────────────────── */
    const svgEl = document.getElementById('lp-chart-svg');
    const ttEl  = document.getElementById('lp-tt');
    const ayEl  = document.getElementById('lp-ay');
    if (svgEl && ayEl) {
      const ns = 'http://www.w3.org/2000/svg';
      const el = (tag: string, a: Record<string,string|number>) => {
        const e = document.createElementNS(ns, tag);
        Object.entries(a).forEach(([k,v]) => e.setAttribute(k,String(v))); return e;
      };
      const maxG = Math.max(...GEX_DATA.map(Math.abs));
      const totG = GEX_DATA.reduce((s,g)=>s+Math.abs(g),0);
      const bY=155, bw=46, gap=24, maxH=110;
      const totW = STRIKES.length*(bw+gap)-gap;
      const sX   = (760-totW)/2;
      [40,100,155,210,260].forEach(y => svgEl.appendChild(el('line',{x1:0,y1:y,x2:760,y2:y,stroke:'#1a1a1e','stroke-width':y===155?1.2:.8})));
      ayEl.innerHTML='<span>+3B</span><span>+1.5B</span><span>0</span><span>−1.5B</span><span>−3B</span>';
      const bars: any[] = [];
      STRIKES.forEach((strike,i) => {
        const gex=GEX_DATA[i], x=sX+i*(bw+gap);
        const col=gex>0?'#3ecf6e':'#e03030', colDim=gex>0?'rgba(62,207,110,.3)':'rgba(224,48,48,.3)';
        const pct=((Math.abs(gex)/totG)*100).toFixed(1), tH=Math.abs(gex)/maxG*maxH;
        const bg=el('rect',{x,y:gex>0?bY-maxH:bY,width:bw,height:maxH,fill:colDim,rx:4,opacity:0});
        svgEl.appendChild(bg);
        const bar=el('rect',{x,y:bY,width:bw,height:0,fill:col,rx:4,opacity:.88});
        svgEl.appendChild(bar);
        const lbl=el('text',{x:x+bw/2,y:270,'text-anchor':'middle',fill:'#444','font-size':10,'font-family':'Geist,sans-serif'});
        lbl.textContent=String(strike); svgEl.appendChild(lbl);
        const hitbox=el('rect',{x,y:gex>0?bY-tH:bY,width:bw,height:tH+1,fill:'transparent',style:'cursor:crosshair'});
        svgEl.appendChild(hitbox);
        const b={bar,bg,gex,bY,col,colDim,pct,strike,tH,cH:0};
        bars.push(b);
        hitbox.addEventListener('mouseenter',()=>{
          bars.forEach(bb=>bb.bar.setAttribute('opacity','.25'));
          bar.setAttribute('opacity','1'); bg.setAttribute('opacity','1');
          if(ttEl){
            (ttEl.querySelector('.lp-tts') as any).textContent='Strike '+strike;
            (ttEl.querySelector('#lp-tt-gex') as any).textContent=(gex>0?'+':'')+gex.toFixed(2)+'B';
            (ttEl.querySelector('#lp-tt-pct') as any).textContent=pct+'%';
            (ttEl.querySelector('#lp-tt-type') as any).textContent=gex>0?'Gamma Positivo ↑':'Gamma Negativo ↓';
            const ttbar=ttEl.querySelector('#lp-tt-bar') as HTMLElement;
            if(ttbar) ttbar.style.cssText=`width:${pct}%;background:${col};height:3px;border-radius:2px;margin-top:8px`;
            ttEl.style.display='block';
          }
        });
        hitbox.addEventListener('mousemove',(ev:Event)=>{
          const me=ev as MouseEvent;
          const wrap=document.getElementById('lp-hchart');
          if(wrap&&ttEl){const r=wrap.getBoundingClientRect();ttEl.style.left=Math.min(me.clientX-r.left+14,r.width-180)+'px';ttEl.style.top=Math.max(me.clientY-r.top-70,4)+'px';}
        });
        hitbox.addEventListener('mouseleave',()=>{
          bars.forEach(bb=>{bb.bar.setAttribute('opacity','.88');bb.bg.setAttribute('opacity','0');});
          if(ttEl) ttEl.style.display='none';
        });
      });
      const priceX=sX+5*(bw+gap)+bw/2;
      svgEl.appendChild(el('line',{x1:priceX,y1:15,x2:priceX,y2:265,stroke:'rgba(240,240,240,.5)','stroke-width':1,'stroke-dasharray':'4 3'}));
      const cpl=el('text',{x:priceX,y:11,'text-anchor':'middle',fill:'rgba(240,240,240,.7)','font-size':10,'font-family':'Geist,sans-serif','font-weight':600});
      cpl.textContent='5680 ▾'; svgEl.appendChild(cpl);
      const animBars=()=>{
        bars.forEach(b=>{
          if(b.cH<b.tH){b.cH=Math.min(b.cH+b.tH*.04,b.tH);const h=b.cH;
            if(b.gex>0){b.bar.setAttribute('y',String(b.bY-h));b.bar.setAttribute('height',String(h));}
            else{b.bar.setAttribute('y',String(b.bY));b.bar.setAttribute('height',String(h));}}
        });
        if(bars.some(b=>b.cH<b.tH)) requestAnimationFrame(animBars);
      };
      setTimeout(animBars, 300);
    }

    /* ── SCROLL OBSERVER ────────────────────── */
    const obs = new IntersectionObserver(entries=>{
      entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); obs.unobserve(e.target); }});
    },{threshold:.08});
    document.querySelectorAll('[data-obs]').forEach(e=>obs.observe(e));
    cleanups.push(()=>obs.disconnect());

    /* ── STAT COUNTERS ──────────────────────── */
    const counter=(id:string,target:number,pre='',suf='',dec=0)=>{
      const el=document.getElementById(id); if(!el) return;
      let v=0; const step=target/80;
      const id2=setInterval(()=>{
        v+=step; if(v>=target){v=target;clearInterval(id2);}
        el.textContent=pre+(dec>0?v.toFixed(dec):Math.floor(v).toLocaleString())+suf;
      },16);
    };
    const sObs=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){
        counter('lp-ct',2408,'+',''); counter('lp-ca',12,'','M+'); counter('lp-cu',99.9,'','%',1);
        sObs.disconnect();
      }});
    },{threshold:.5});
    const sEl=document.getElementById('lp-hstats'); if(sEl) sObs.observe(sEl);
    cleanups.push(()=>sObs.disconnect());

    return ()=>{ cleanups.forEach(fn=>fn()); };
  }, []);

  /* helpers */
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    const t=document.getElementById('lp-toast');
    if(t){t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
  };
  const scrollTo=(id:string)=>{ document.getElementById(id)?.scrollIntoView({behavior:'smooth'}); };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPwd});
      if(error) throw error;
      toast.success('¡Bienvenido!'); setAuthOpen(false); navigate('/dashboard');
    } catch(err:any){ toast.error(err.message??'Error de autenticación'); }
  };
  const handleAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if(tryAdminLogin(adminUser,adminPwd)){toast.success('Acceso admin concedido');setAdminOpen(false);navigate('/dashboard');}
    else setAdminErr(true);
  };

  /* ── JSX ──────────────────────────────────────────────────── */
  return (
    <>
      {/* Fixed elements (outside #lp-root so cursor:none doesn't inherit wrong) */}
      <div id="lp-cursor" />
      <div id="lp-cursor-ring" />
      <div id="lp-toast">✓ Código copiado</div>

      {/* INTRO */}
      <div id="lp-intro">
        <div id="lp-intro-logo">
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle className="lp-il-pulse" cx="60" cy="60" r="50"/>
            <circle className="lp-il-track" cx="60" cy="60" r="50"/>
            <circle className="lp-il-spin"  cx="60" cy="60" r="50"/>
            <circle className="lp-il-dot"   cx="60" cy="60" r="5"/>
            <text className="lp-il-gex" x="60" y="64">GEX</text>
          </svg>
        </div>
        <div id="lp-intro-lines">
          <div className="lp-iline"><div className="lp-ibar"/><span>Gamma Exposure</span></div>
          <div className="lp-iline"><div className="lp-ibar"/><span>Real Time Data</span></div>
          <div className="lp-iline"><div className="lp-ibar"/><span>Pro Platform</span></div>
        </div>
        <div id="lp-intro-pct">0%</div>
      </div>

      {/* ROOT */}
      <div id="lp-root">

        {/* NAV */}
        <nav id="lp-nav">
          <div className="lp-logo">GEX SATELIT <span className="lp-pulse"/></div>
          <div className="lp-nav-links">
            <a onClick={()=>scrollTo('lp-producto')}>Producto</a>
            <a onClick={()=>scrollTo('lp-testimonios')}>Traders</a>
            <a onClick={()=>scrollTo('lp-precios')}>Precios</a>
            <a onClick={()=>scrollTo('lp-faq')}>FAQ</a>
          </div>
          <div className="lp-nav-cta">
            <button className="lp-nbg" onClick={()=>scrollTo('lp-precios')}>Ver planes</button>
            <button className="lp-nbg" style={{borderColor:'rgba(45,212,191,.3)',color:'rgba(45,212,191,.8)',fontSize:12,letterSpacing:'.06em'}} onClick={()=>setAdminOpen(true)}>⬡ Admin</button>
            <button className="lp-nb" onClick={()=>user?navigate('/dashboard'):setAuthOpen(true)}>Acceder →</button>
          </div>
        </nav>

        {/* DISCOUNT BAR */}
        <div id="lp-dbar">
          <span className="lp-dlabel">Códigos activos</span>
          {[{c:'GAMMA30',o:'−30% primer mes'},{c:'ELITE50',o:'−50% Elite anual'},{c:'FLIP15',o:'−15% todos'}].map(d=>(
            <div key={d.c} className="lp-dbadge">
              <span className="lp-dcode">{d.c}</span>
              <span className="lp-doff">{d.o}</span>
              <button className="lp-dcopy" onClick={()=>copyCode(d.c)}>COPIAR</button>
            </div>
          ))}
        </div>

        {/* TICKER */}
        <div className="lp-tick-wrap" id="lp-tw">
          <div className="lp-tick-inner">
            {[...TICKERS,...TICKERS].map((t,i)=>(
              <div key={i} className="lp-ti">
                <span className="lp-ts">{t.s}</span>
                <span className="lp-tp">{t.p}</span>
                <span className={t.c[0]==='+'?'lp-up':'lp-dn'}>{t.c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* HERO */}
        <section className="lp-hero">
          <canvas id="lp-pcv"/>
          <div className="lp-hero-bg"/>
          <div className="lp-hero-cnt">
            <div className="lp-eyebrow lp-fu" data-obs="1">
              <span className="lp-pulse" style={{width:5,height:5}}/> Plataforma de opciones profesional
            </div>
            <h1 className="lp-fu" data-obs="1">
              Gamma <span className="lp-shimmer">Exposure</span><br/>en <em>tiempo real</em>
            </h1>
            <p className="lp-hsub lp-fu d1" data-obs="1">
              Visualiza GEX, Call/Put Walls y Gamma Flip del SPX antes que el resto del mercado.
            </p>
            <div className="lp-hbtns lp-fu d2" data-obs="1">
              <button className="lp-btnp" onClick={()=>scrollTo('lp-precios')}>Empezar ahora →</button>
              <button className="lp-btno" onClick={()=>scrollTo('lp-hchart')}>Ver demo</button>
            </div>

            {/* STATS */}
            <div className="lp-stats lp-fu d3" id="lp-hstats" data-obs="1">
              <div className="lp-si"><div className="lp-sn" id="lp-ct">+0</div><div className="lp-sl">Traders</div><div className="lp-sa"/></div>
              <div className="lp-si"><div className="lp-sn" id="lp-ca">0M+</div><div className="lp-sl">Análisis</div><div className="lp-sa"/></div>
              <div className="lp-si"><div className="lp-sn" id="lp-cu">0%</div><div className="lp-sl">Uptime</div><div className="lp-sa"/></div>
            </div>

            {/* CHART */}
            <div className="lp-chart lp-fu d4" id="lp-hchart" data-obs="1">
              <div className="lp-ch">
                <div className="lp-chl"><div className="lp-ldot"/><span className="lp-llabel">LIVE</span><span className="lp-cbadge">SPX GEX Profile</span></div>
                <span style={{fontSize:11}}>May 13, 2026 · ~15min delay</span>
              </div>
              <div style={{position:'relative',paddingLeft:36}}>
                <div id="lp-ay"/>
                <div id="lp-tt">
                  <div className="lp-tts"/>
                  <div className="lp-ttr"><span>GEX Exposure</span><span className="lp-ttv" id="lp-tt-gex"/></div>
                  <div className="lp-ttr"><span>Gamma share</span><span className="lp-ttv" id="lp-tt-pct"/></div>
                  <div className="lp-ttr"><span>Tipo</span><span className="lp-ttv" id="lp-tt-type"/></div>
                  <div id="lp-tt-bar"/>
                </div>
                <svg id="lp-chart-svg" viewBox="0 0 760 280" style={{width:'100%',height:'auto',display:'block'}}/>
              </div>
            </div>
          </div>
        </section>

        <div className="lp-div"/>

        {/* FEATURES */}
        <section className="lp-sec" id="lp-producto">
          <div className="lp-con">
            <div className="lp-stitle">
              <div className="lp-slabel lp-mr" data-obs="1">✦ Funcionalidades</div>
              <h2 className="lp-fu" data-obs="1">Todo lo que necesitas para operar<br/>con <em>ventaja institucional</em></h2>
              <p className="lp-fu d1" data-obs="1">Datos de calidad institucional, visualizaciones claras y alertas precisas en una sola plataforma.</p>
            </div>
            <div className="lp-fgrid">
              {FEATURES.map((f,i)=>(
                <div key={f.title} className={`lp-fc lp-fu ${DELAYS[i]}`} data-obs="1">
                  <div className="lp-ficon"><svg viewBox="0 0 24 24">{f.svg}</svg></div>
                  <div className="lp-ftag">{f.tag}</div>
                  <h3>{f.title}</h3><p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-div"/>

        {/* TESTIMONIALS */}
        <section className="lp-sec" id="lp-testimonios" style={{paddingTop:70,paddingBottom:70}}>
          <div className="lp-con">
            <div className="lp-stitle">
              <div className="lp-slabel lp-mr" data-obs="1">✦ Testimonios</div>
              <h2 className="lp-fu" data-obs="1">Lo que dicen los <em>traders</em></h2>
            </div>
          </div>
          <div className="lp-tw lp-fu" data-obs="1">
            <div className="lp-tt2">
              {[...TESTIMONIALS,...TESTIMONIALS].map((t,i)=>(
                <div key={i} className="lp-tc">
                  <div className="lp-tst">{[0,1,2,3,4].map(s=><div key={s} className="lp-star"/>)}</div>
                  <div className="lp-txt">{t.text}</div>
                  <div className="lp-tauth">
                    <div className="lp-tav">{t.name[0]}</div>
                    <div>
                      <div className="lp-tname">{t.name}</div>
                      <div className="lp-trole">{t.role}</div>
                      <div className="lp-textra">{t.extra}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-div"/>

        {/* PRICING */}
        <section className="lp-sec" id="lp-precios">
          <div className="lp-con">
            <div className="lp-stitle">
              <div className="lp-slabel lp-mr" data-obs="1">✦ Precios</div>
              <h2 className="lp-fu" data-obs="1">Planes <em>transparentes</em></h2>
              <p className="lp-fu d1" data-obs="1">Sin contratos. Sin permanencia. Cancela cuando quieras.</p>
            </div>
            <div className="lp-pgrid">
              {/* Starter */}
              <div className="lp-pc lp-fu" data-obs="1">
                <div className="lp-pname">Starter</div><div className="lp-pdesc">Para traders que empiezan</div>
                <div className="lp-pprice"><span className="lp-pamt">$29</span><span className="lp-pper">/mes</span></div>
                <ul className="lp-pfeat">{['Datos con 15min delay','3 tickers','Perfil GEX básico','Call/Put Walls'].map(f=><li key={f}><span className="lp-chk">✓</span>{f}</li>)}</ul>
                <button className="lp-pbtn ou" onClick={()=>user?navigate('/dashboard'):setAuthOpen(true)}>Empezar</button>
              </div>
              {/* Pro */}
              <div className="lp-pc hot lp-fu d1" data-obs="1">
                <div className="lp-pbadge">🔥 Más popular · −62% OFF</div>
                <div className="lp-pname">Pro</div><div className="lp-pdesc">Para traders activos</div>
                <div className="lp-pprice" style={{flexDirection:'column',alignItems:'flex-start',gap:4}}>
                  <span style={{fontSize:14,color:'#666',textDecoration:'line-through',fontWeight:400}}>$130/mes</span>
                  <div style={{display:'flex',alignItems:'baseline',gap:4}}><span className="lp-pamt">$49</span><span className="lp-pper">/mes</span></div>
                </div>
                <ul className="lp-pfeat">{['Tiempo real (1s)','25 tickers','Alertas ilimitadas','Griegas avanzadas','AI Bias diario'].map(f=><li key={f}><span className="lp-chk">✓</span>{f}</li>)}</ul>
                <button className="lp-pbtn pr" onClick={()=>user?navigate('/dashboard'):setAuthOpen(true)}>Empezar prueba gratis</button>
              </div>
              {/* Elite */}
              <div className="lp-pc lp-fu d2" data-obs="1">
                <div className="lp-pname">Elite</div><div className="lp-pdesc">Para fondos y prop firms</div>
                <div className="lp-pprice"><span className="lp-pamt">$159</span><span className="lp-pper">/mes</span></div>
                <ul className="lp-pfeat">{['Todo en Pro +','API access','IV Surface 3D','SLA 99.99%','Soporte dedicado'].map(f=><li key={f}><span className="lp-chk">✓</span>{f}</li>)}</ul>
                <button className="lp-pbtn ou" onClick={()=>user?navigate('/dashboard'):setAuthOpen(true)}>Contactar</button>
              </div>
            </div>
          </div>
        </section>

        <div className="lp-div"/>

        {/* FAQ */}
        <section className="lp-sec" id="lp-faq">
          <div className="lp-con">
            <div className="lp-stitle">
              <div className="lp-slabel lp-mr" data-obs="1">✦ FAQ</div>
              <h2 className="lp-fu" data-obs="1">Preguntas <em>frecuentes</em></h2>
            </div>
            <div className="lp-faqw">
              {FAQ_DATA.map((item,i)=>(
                <div key={i} className={`lp-faqitem${faqOpen===i?' open':''}`}>
                  <button className="lp-faqq" onClick={()=>setFaqOpen(faqOpen===i?null:i)}>
                    {item.q}<span className="lp-faqa-arr">+</span>
                  </button>
                  <div className="lp-faqa">{item.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="lp-div"/>

        {/* CTA */}
        <section className="lp-cta">
          <div className="lp-cta-grid"/>
          <div className="lp-ctai">
            <div className="lp-slabel lp-mr" data-obs="1" style={{justifyContent:'center',marginBottom:18}}>✦ Empieza hoy</div>
            <h2 className="lp-fu" data-obs="1">Opera con <span className="lp-shimmer"><em>ventaja real</em></span></h2>
            <p className="lp-ctap lp-fu d1" data-obs="1">Únete a más de 2,400 traders que ya usan GEX SATELIT para identificar niveles clave antes que el mercado.</p>
            {ctaSent
              ? <div className="lp-ctaok">✓ ¡Listo! Te contactaremos pronto.</div>
              : <form className="lp-ctaform lp-fu d2" data-obs="1" onSubmit={e=>{e.preventDefault();setCtaSent(true);}}>
                  <input className="lp-ctain" type="email" placeholder="tu@email.com" value={ctaEmail} onChange={e=>setCtaEmail(e.target.value)} required/>
                  <button type="submit" className="lp-ctasub">Solicitar acceso →</button>
                </form>
            }
            <div className="lp-trust lp-fu d3" data-obs="1">
              <div className="lp-tri"><div className="lp-trd"/>Sin tarjeta requerida</div>
              <div className="lp-tri"><div className="lp-trd"/>Cancela cuando quieras</div>
              <div className="lp-tri"><div className="lp-trd"/>Datos verificados CBOE</div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-fgr">
            <div className="lp-fbrand lp-fu" data-obs="1">
              <div className="lp-logo" style={{fontSize:15}}>GEX SATELIT <span className="lp-pulse"/></div>
              <p>Gamma Exposure en tiempo real para traders profesionales. Datos verificados, plataforma segura.</p>
              <a href="https://discord.gg/f7UpW2Kx8" target="_blank" rel="noopener noreferrer" className="lp-fdisc">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.075.075 0 0 0-.079.037c-.34.607-.719 1.4-.984 2.025a18.27 18.27 0 0 0-5.487 0 12.51 12.51 0 0 0-1-2.025.077.077 0 0 0-.079-.037c-1.32.227-2.586.62-3.76 1.169a.07.07 0 0 0-.032.027C2.07 8.046 1.36 11.62 1.71 15.144a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.106c.36.699.772 1.364 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-4.177-.838-7.72-3.549-10.748a.061.061 0 0 0-.031-.028z"/></svg>
                Únete al Discord
              </a>
            </div>
            <div className="lp-fu d1" data-obs="1"><h4>Producto</h4><ul><li><a>Features</a></li><li><a>Precios</a></li><li><a>API</a></li><li><a>Changelog</a></li></ul></div>
            <div className="lp-fu d2" data-obs="1"><h4>Empresa</h4><ul><li><a>Sobre nosotros</a></li><li><a>Blog</a></li><li><a>Careers</a></li><li><a>Contacto</a></li></ul></div>
            <div className="lp-fu d3" data-obs="1"><h4>Legal</h4><ul><li><a>Privacidad</a></li><li><a>Términos</a></li><li><a>Disclaimer</a></li><li><a>Cookies</a></li></ul></div>
          </div>
          <div className="lp-fcopy lp-fu" data-obs="1">© 2026 GEX Satelit · Plataforma verificada · Datos en tiempo real · Retraso ~15 min (CBOE) · Trading de opciones implica riesgo de pérdida</div>
        </footer>
      </div>

      {/* AUTH MODAL */}
      <div className={`lp-moverlay${authOpen?' open':''}`} style={{background:'rgba(0,0,0,.85)'}} onClick={()=>setAuthOpen(false)}>
        <div className="lp-mbox" style={{background:'#0d0d10',border:'1px solid #1e1e22'}} onClick={e=>e.stopPropagation()}>
          <button className="lp-mclose" style={{color:'#555'}} onClick={()=>setAuthOpen(false)}>×</button>
          <div style={{textAlign:'center',marginBottom:28}}>
            <div style={{fontWeight:700,fontSize:20,letterSpacing:'-.02em',color:'#f0f0f0',marginBottom:6}}>GEX SATELIT</div>
            <div style={{fontSize:13,color:'#555'}}>Accede a tu cuenta</div>
          </div>
          <div style={{display:'flex',border:'1px solid #1e1e22',borderRadius:10,overflow:'hidden',marginBottom:28}}>
            <button onClick={()=>setAuthTab('login')} style={{flex:1,padding:11,background:authTab==='login'?'#e03030':'transparent',border:'none',color:authTab==='login'?'#fff':'#555',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Geist',sans-serif",transition:'all .2s'}}>Iniciar sesión</button>
            <button onClick={()=>setAuthTab('register')} style={{flex:1,padding:11,background:authTab==='register'?'rgba(224,48,48,.1)':'transparent',border:'none',color:authTab==='register'?'#e03030':'#555',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:"'Geist',sans-serif",transition:'all .2s',position:'relative'}}>
              Crear cuenta
              <span style={{position:'absolute',top:'50%',right:12,transform:'translateY(-50%)',fontSize:10,background:'rgba(224,48,48,.15)',border:'1px solid rgba(224,48,48,.3)',color:'#e03030',padding:'2px 7px',borderRadius:4,letterSpacing:'.06em'}}>🔒 PRO</span>
            </button>
          </div>
          {authTab==='login'
            ? <form onSubmit={handleLogin}>
                <div style={{marginBottom:16}}><label className="lp-flabel">Email</label><input type="email" className="lp-finput" placeholder="tu@email.com" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} required/></div>
                <div style={{marginBottom:24}}><label className="lp-flabel">Contraseña</label><input type="password" className="lp-finput" placeholder="••••••••" value={loginPwd} onChange={e=>setLoginPwd(e.target.value)} required/></div>
                <button type="submit" className="lp-mbtn" style={{marginBottom:12}}>Iniciar sesión →</button>
                <div style={{textAlign:'center',fontSize:12,color:'#444'}}>¿Olvidaste tu contraseña? <span style={{color:'#e03030',cursor:'pointer'}}>Recuperar</span></div>
              </form>
            : <div>
                <div style={{background:'rgba(224,48,48,.06)',border:'1px solid rgba(224,48,48,.2)',borderRadius:12,padding:20,textAlign:'center',marginBottom:20}}>
                  <div style={{fontSize:28,marginBottom:10}}>🔒</div>
                  <div style={{fontSize:14,fontWeight:600,color:'#f0f0f0',marginBottom:6}}>Requiere suscripción activa</div>
                  <div style={{fontSize:13,color:'#555',lineHeight:1.6}}>Para crear una cuenta necesitas un plan Pro o Elite. Elige tu plan y recibirás acceso inmediato.</div>
                </div>
                <button className="lp-mbtn" onClick={()=>{setAuthOpen(false);scrollTo('lp-precios');}}>Ver planes →</button>
              </div>
          }
        </div>
      </div>

      {/* ADMIN MODAL */}
      <div className={`lp-moverlay${adminOpen?' open':''}`} style={{background:'rgba(0,0,0,.88)'}} onClick={()=>{setAdminOpen(false);setAdminErr(false);}}>
        <div style={{background:'linear-gradient(180deg,#081e1c,#041212)',border:'1.5px solid #2DD4BF',borderRadius:18,padding:'36px 32px',width:'100%',maxWidth:380,position:'relative',margin:20,boxShadow:'0 0 60px -10px rgba(45,212,191,.3)',fontFamily:"'Geist',sans-serif"}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>{setAdminOpen(false);setAdminErr(false);}} style={{position:'absolute',top:14,right:16,background:'none',border:'none',color:'#2DD4BF',fontSize:22,cursor:'pointer'}}>×</button>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
            <span style={{fontSize:18}}>⬡</span>
            <div style={{fontWeight:700,fontSize:18,color:'#f0f0f0',letterSpacing:'-.02em'}}>Acceso Admin</div>
          </div>
          <div style={{fontSize:13,color:'#2DD4BF',opacity:.6,marginBottom:24,letterSpacing:'.04em'}}>Terminal de control · Acceso restringido</div>
          <form onSubmit={handleAdmin}>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:11,color:'#2DD4BF',opacity:.7,letterSpacing:'.1em',textTransform:'uppercase',display:'block',marginBottom:7}}>Usuario</label>
              <input type="text" placeholder="admin" value={adminUser} onChange={e=>{setAdminUser(e.target.value);setAdminErr(false);}} style={{width:'100%',padding:'12px 14px',background:'rgba(0,0,0,.5)',border:'1px solid rgba(45,212,191,.3)',borderRadius:8,color:'#f0f0f0',fontSize:14,outline:'none',fontFamily:"'Geist',sans-serif",boxSizing:'border-box'}} required/>
            </div>
            <div style={{marginBottom:24}}>
              <label style={{fontSize:11,color:'#2DD4BF',opacity:.7,letterSpacing:'.1em',textTransform:'uppercase',display:'block',marginBottom:7}}>Contraseña</label>
              <input type="password" placeholder="••••••••" value={adminPwd} onChange={e=>{setAdminPwd(e.target.value);setAdminErr(false);}} style={{width:'100%',padding:'12px 14px',background:'rgba(0,0,0,.5)',border:'1px solid rgba(45,212,191,.3)',borderRadius:8,color:'#f0f0f0',fontSize:14,outline:'none',fontFamily:"'Geist',sans-serif",boxSizing:'border-box'}} required/>
            </div>
            <button type="submit" style={{width:'100%',padding:14,background:'linear-gradient(180deg,#2DD4BF,#14b8a6)',color:'#021a18',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer',fontFamily:"'Geist',sans-serif",letterSpacing:'.04em'}}>Entrar al terminal →</button>
            {adminErr&&<div style={{marginTop:12,textAlign:'center',fontSize:13,color:'#e03030'}}>Credenciales incorrectas</div>}
          </form>
        </div>
      </div>
    </>
  );
}
