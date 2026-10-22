import { Link } from "react-router-dom";
import { JOURNEY_PIPELINE, type JourneyStage } from "../../utils/journeyCatalog";

type JourneyPipelineNavProps = {
  active: JourneyStage;
};

/** Visual routes lifecycle: Libraries → Workflow → Resources → Tracking */
export default function JourneyPipelineNav({ active }: JourneyPipelineNavProps) {
  return (
    <nav className="journey-pipeline" aria-label="Routes stages">
      {JOURNEY_PIPELINE.map((stage, index) => {
        const isActive = stage.id === active;
        return (
          <div key={stage.id} className="journey-pipeline-item-wrap">
            {index > 0 && <span className="journey-pipeline-arrow" aria-hidden="true">→</span>}
            <Link
              to={stage.path}
              className={`journey-pipeline-item${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="journey-pipeline-step">{index + 1}</span>
              <span className="journey-pipeline-copy">
                <strong>{stage.label}</strong>
                <small>{stage.blurb}</small>
              </span>
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
