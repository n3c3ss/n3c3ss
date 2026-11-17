 "use client";

import { useEffect, useRef } from "react";
import { content } from "@/lib/content";
import { scenes, scrollFromStory, trackVh } from "@/lib/timeline";
import { mountExperience } from "@/lib/client/controller";

function HudNavigation() {
  return (
    <nav className="hud-nav" aria-label="Навигация по сценам">
      {scenes.map((scene, index) => (
        <a key={scene.id} href={`#${scene.id}-anchor`} data-nav-index={index}>
          {scene.kind}
        </a>
      ))}
    </nav>
  );
}

function MainButton({ compact = false, place = "unknown" }: { compact?: boolean; place?: string }) {
  return (
    <a
      className={`main-button${compact ? " main-button--compact" : ""}`}
      href={content.cta.href}
      data-glitch
      data-text={content.cta.label}
      data-track="cta"
      data-place={place}
      aria-label={`${content.cta.label}: написать в Telegram`}
    >
      <span data-text={content.cta.label}>{content.cta.label}</span>
      <span className="button-arrow" aria-hidden="true">→</span>
    </a>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <div className="section-label"><span>{children}</span><i /></div>;
}

function WordmarkFrame() {
  return (
    <svg className="wordmark-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path className="frame-outline" pathLength="1" d="M8 1 H62 M72 1 H92 L99 8 V78 L92 99 H31 M22 99 H8 L1 92 V8 Z" />
      <path className="frame-ticks" d="M62 1 v5 M72 1 v5 M22 99 v-5 M31 99 v-5 M1 49 h6 M99 49 h-6" />
      <path className="frame-accents" d="M1 25 V8 L8 1 H25 M75 99 H92 L99 92 V75" />
    </svg>
  );
}

export default function Experience() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return mountExperience(rootRef.current);
  }, []);

  return (
    <main className="experience" ref={rootRef}>
      <a className="skip-link" href="#hero-title">Перейти к содержимому</a>
      <div className="stage" data-stage>
        <canvas className="terrain" data-terrain aria-hidden="true" />
        <div className="grain" data-grain aria-hidden="true" />

        <header className="hud hud-top">
          <div className="hud-left">
            <span className="hud-brand">{content.brand}</span>
            <span data-hud-scene>SCN 01/04 · HERO</span>
          </div>
          <div className="hud-right">
            <span data-hud-time>T+00.00 / 19.00</span>
            <div className="progress-track" data-hud-progressbar role="progressbar" aria-label="Прогресс истории" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
              <i data-hud-progress />
            </div>
            <HudNavigation />
            <MainButton compact place="hud" />
          </div>
        </header>

        <div className="frame">
          <section className="scene scene-hero" data-scene="hero" aria-labelledby="hero-title">
            <div className="hero-center">
              <h1 id="hero-title" tabIndex={-1} className="wordmark" data-glitch data-text={content.brand}>
                {content.brand}<span className="sr-only"> — {content.offer.title}</span>
                <WordmarkFrame />
              </h1>
              <div className="wordmark-reflection" aria-hidden="true">{content.brand}</div>
              <p className="hero-slogan decode-text" data-decode aria-label={content.slogan}>{content.slogan}</p>
              <MainButton place="hero" />
              <p className="microcopy">{content.cta.micro}</p>
            </div>
            <div className="scroll-cue" aria-hidden="true">
              <span className="mouse-outline"><i /></span>
              <span>SCROLL TO EXPLORE</span>
              <span className="chevrons">⌄<br />⌄</span>
            </div>
            <span className="scene-index">01 / 04</span>
          </section>

          <section className="scene scene-offer" data-scene="offer" aria-labelledby="offer-title">
            <div className="scene-copy">
              <SectionLabel>{content.offer.label}</SectionLabel>
              <h2 id="offer-title" className="display-title" data-decode aria-label={content.offer.title}>{content.offer.title}</h2>
              {content.offer.subtitle && <p className="scene-subtitle" data-decode aria-label={content.offer.subtitle}>{content.offer.subtitle}</p>}
              <div className="offer-services">
                <div className="service-line"><span>01</span><b>WEB / DEVELOPMENT</b><i /></div>
                <div className="service-line"><span>02</span><b>TELEGRAM / BOTS</b><i /></div>
              </div>
              <div className="offer-bottom">
                <MainButton place="offer" />
                <p className="microcopy">{content.cta.micro}</p>
              </div>
            </div>
            <div className="offer-map" aria-hidden="true">
              <div className="map-cross cross-a" /><div className="map-cross cross-b" />
              <div className="map-readout"><span>FIELD / 02</span><b>REQUEST → RESULT</b><small>WEB · AUTOMATION · IDEAS</small></div>
              <div className="map-ring ring-a" /><div className="map-ring ring-b" />
            </div>
            <span className="scene-index">02 / 04</span>
          </section>

          <section className="scene scene-faq" data-scene="faq" aria-labelledby="faq-title">
            <div className="faq-wrap" role="region" aria-label="Вопросы и ответы" tabIndex={0}>
              <SectionLabel>{content.faq.label}</SectionLabel>
              <h2 id="faq-title" className="display-title faq-heading">КТО ЗА ЭТИМ СТОИТ<span>?</span></h2>
              <div className="faq-list">
                {content.faq.items.map((item, index) => (
                  <article className="faq-item" key={item.q}>
                    <span className="faq-number">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{item.q}</h3><p>{item.a}</p></div>
                  </article>
                ))}
              </div>
            </div>
            <span className="scene-index">03 / 04</span>
          </section>

          <section className="scene scene-final" data-scene="final" aria-labelledby="final-title">
            <div className="final-content">
              <SectionLabel>// СЛЕДУЮЩИЙ ШАГ</SectionLabel>
              <h2 className="final-wordmark" id="final-title" data-glitch data-text={content.brand}>
                {content.brand}<WordmarkFrame />
              </h2>
              <p className="final-call">ЕСТЬ ИДЕЯ?<br /><span>ДАВАЙ СОЗДАДИМ.</span></p>
              <MainButton place="final" />
              <p className="microcopy">{content.cta.micro}</p>
              <a className="secondary-link" href={content.secondary.href} target="_blank" rel="noopener noreferrer" data-track="secondary" data-place="final">
                {content.secondary.label} <span>↗</span>
              </a>
            </div>
            <span className="scene-index">04 / 04</span>
          </section>
        </div>

        <footer className="hud hud-bottom">
          <span data-hud-coords>X +0000.0  Y +0000.0  Z 1.00</span>
          <span data-hud-elev>ELEV 0090 M</span>
          <span data-hud-nodes>NODES 000</span>
        </footer>
      </div>

      <div className="scroll-track" data-scroll-track style={{ height: `${trackVh}vh` }} aria-label="Навигация по разделам">
        {scenes.map((scene) => (
          <span
            key={scene.id}
            id={`${scene.id}-anchor`}
            className="scene-anchor"
            style={{ top: `${scrollFromStory(scene.restS)}vh` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mobile-cta">
        <span>n3c3ss <small>WEB / TG</small></span>
        <MainButton place="mobile-faq" />
      </div>
      <noscript>
        <div className="no-js-content">
          <h1>n3c3ss — {content.slogan}</h1>
          <p>{content.offer.title}. {content.offer.subtitle}</p>
          <p><a href={content.cta.href}>{content.cta.label}: {content.cta.micro}</a></p>
          <h2 id="faq">FAQ</h2>
          {content.faq.items.map((item) => <p key={item.q}><b>{item.q}</b> {item.a}</p>)}
          <p><a href={content.secondary.href}>{content.secondary.label}</a></p>
        </div>
      </noscript>
    </main>
  );
}
