import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import MarketingBrandedDevice from "./MarketingBrandedDevice";
import { MARKETING_WELCOME_SLIDES } from "../../pages/marketing/marketingGarminExperience";

const INTERVAL_MS = 6500;

export default function MarketingWelcomeCarousel() {
  const slides = MARKETING_WELCOME_SLIDES;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => {
      setIndex((next + slides.length) % slides.length);
    },
    [slides.length]
  );

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  const slide = slides[index];

  return (
    <section
      className="marketing-welcome"
      aria-roledescription="carousel"
      aria-label="Featured collections"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="marketing-welcome__slides">
        {slides.map((item, i) => (
          <div
            key={item.id}
            className={`marketing-welcome__slide${i === index ? " is-active" : ""}`}
            style={{ backgroundImage: `url(${item.background})` }}
            aria-hidden={i !== index}
          />
        ))}
      </div>

      <div className="marketing-welcome__overlay" />

      <div className="marketing-welcome__content">
        <div className="marketing-welcome__copy">
          {slide.kicker ? <div className="marketing-welcome__kicker">{slide.kicker}</div> : null}
          <h1 className="marketing-welcome__title">{slide.title}</h1>
          <p className="marketing-welcome__subtitle">{slide.subtitle}</p>
          <Link to={slide.to} className="marketing-welcome__cta">
            {slide.cta}
          </Link>
        </div>

        {slide.productId || slide.usePitchHardware ? (
          <div className="marketing-welcome__devices">
            <MarketingBrandedDevice
              productId={slide.productId}
              usePitchHardware={slide.usePitchHardware}
              logoVariant="light"
            />
          </div>
        ) : null}
      </div>

      <div className="marketing-welcome__controls">
        <button
          type="button"
          className="marketing-welcome__pause"
          aria-label={paused ? "Resume carousel" : "Pause carousel"}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <div className="marketing-welcome__dots" role="tablist" aria-label="Slide selector">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={item.title}
              className={i === index ? "is-active" : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
