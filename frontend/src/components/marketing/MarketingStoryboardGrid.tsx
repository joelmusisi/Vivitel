import { Link } from "react-router-dom";
import { MARKETING_STORY_PANELS } from "../../pages/marketing/marketingStoryPanels";

type Props = {
  heading?: string;
  description?: string;
  compact?: boolean;
};

/** Clickable storyboard cells — each opens its own solution page */
export default function MarketingStoryboardGrid({
  heading = "Storyboard — click to open each topic",
  description = "Every picture opens a separate page in this application. No mixed content between topics.",
  compact = false
}: Props) {
  return (
    <section className={`marketing-storyboard${compact ? " marketing-storyboard--compact" : ""}`} aria-labelledby="storyboard-heading">
      <div className="marketing-section__head">
        <h2 id="storyboard-heading">{heading}</h2>
        <p>{description}</p>
      </div>
      <div className="marketing-storyboard__grid">
        {MARKETING_STORY_PANELS.map((panel) => (
          <Link key={panel.id} to={panel.to} className="marketing-storyboard__cell">
            <img src={panel.image} alt="" loading="lazy" />
            <div className="marketing-storyboard__shade" />
            <div className="marketing-storyboard__copy">
              <span className="marketing-storyboard__label">{panel.label}</span>
              <span className="marketing-storyboard__caption">{panel.caption}</span>
              <span className="marketing-storyboard__open">Open page</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
