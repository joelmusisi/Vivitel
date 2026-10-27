import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { MarketingCropBackground } from "../../components/marketing/MarketingImageCrop";
import { MARKETING_INFO_PAGES } from "./marketingSiteStructure";

type RouteParams = {
  section?: string;
  page?: string;
};

export default function MarketingInfoPage() {
  const { section = "", page = "" } = useParams<RouteParams>();
  const location = useLocation();
  const pathSection = location.pathname.split("/").filter(Boolean)[0] ?? "";
  const area = pathSection || section;
  const key = page || section;
  const info = key ? MARKETING_INFO_PAGES[key] : undefined;

  if (!info) {
    if (area === "company" || ["blog", "news", "careers", "sustainability"].includes(key)) {
      return <MarketingGenericCompanyPage section={key || area} />;
    }
    if (area === "support" || ["onboarding", "warranty", "data"].includes(key)) {
      return <MarketingGenericSupportPage topic={key} />;
    }
    if (area === "discover" || area === "business") {
      return <MarketingGenericDiscoverPage topic={key} section={area} />;
    }
    return <Navigate to="/support" replace />;
  }

  return (
    <>
      {info.image ? (
        <section className="marketing-feature marketing-feature--short">
          <div className="marketing-feature__media">
            <MarketingCropBackground crop={info.image} />
          </div>
        </section>
      ) : null}

      <section className="marketing-section marketing-info-page">
        <div className="marketing-kicker">{info.eyebrow}</div>
        <h1 className="marketing-title">{info.title}</h1>
        {info.body.map((paragraph) => (
          <p key={paragraph} className="marketing-prose">
            {paragraph}
          </p>
        ))}
        {key === "video-tour" ? (
          <div className="marketing-video-frame" aria-label="Product overview media">
            <div className="marketing-video-frame__poster" />
            <p className="marketing-video-frame__caption">
              Product storyboard preview — open{" "}
              <Link to="/solutions/tracking">live tracking</Link> or <Link to="/login">sign in</Link> for the full
              interactive experience.
            </p>
          </div>
        ) : null}
        <div className="marketing-capabilities marketing-capabilities--compact">
          {info.links.map((link) => (
            <Link key={link.to} to={link.to} className="marketing-capability">
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function MarketingGenericCompanyPage({ section }: { section: string }) {
  const titles: Record<string, string> = {
    blog: "VIVI Telematics blog",
    news: "Newsroom",
    careers: "Career opportunities",
    sustainability: "Sustainability"
  };
  return (
    <section className="marketing-section marketing-info-page">
      <div className="marketing-kicker">Company</div>
      <h1 className="marketing-title">{titles[section] ?? "Company"}</h1>
      <p className="marketing-prose">
        Full copy for this company page is being published. Meanwhile, read VIVI Stories, the about page, or contact
        care@vivitelematics.com for press and careers.
      </p>
      <div className="marketing-hero__actions">
        <Link to="/company/about" className="marketing-btn marketing-btn--ghost">
          About us
        </Link>
        <Link to="/contact" className="marketing-btn marketing-btn--primary">
          Contact us
        </Link>
      </div>
    </section>
  );
}

function MarketingGenericDiscoverPage({ topic, section }: { topic: string; section: string }) {
  const title = topic
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return (
    <section className="marketing-section marketing-info-page">
      <div className="marketing-kicker">{section === "business" ? "For business" : "Discover"}</div>
      <h1 className="marketing-title">{title}</h1>
      <p className="marketing-prose">
        VIVI Telematics programmes for {title.toLowerCase()} are described here inside the application. Our specialists can
        tailor tracking, video, fuel, and reporting modules to your operation.
      </p>
      <div className="marketing-hero__actions">
        <Link to="/solutions/platform" className="marketing-btn marketing-btn--primary">
          Platform overview
        </Link>
        <Link to="/solutions/tracking" className="marketing-btn marketing-btn--ghost">
          Explore solutions
        </Link>
      </div>
    </section>
  );
}

function MarketingGenericSupportPage({ topic }: { topic: string }) {
  const titles: Record<string, string> = {
    onboarding: "Implementation & onboarding",
    warranty: "Warranty & hardware",
    data: "Data management"
  };
  return (
    <section className="marketing-section marketing-info-page">
      <div className="marketing-kicker">Support</div>
      <h1 className="marketing-title">{titles[topic] ?? "Support topic"}</h1>
      <p className="marketing-prose">
        Our fleet specialists can walk you through deployment, device warranty, and data retention for your programme.
      </p>
      <Link to="/support" className="marketing-btn marketing-btn--primary">
        Support center
      </Link>
    </section>
  );
}
