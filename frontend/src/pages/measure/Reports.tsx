import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import "../../index.css";

const reportCategories = [
  "Cost Reports",
  "Custom Reports",
  "Dashboard Widgets",
  "Notification Reports",
  "Fuel Reports",
  "Hours Of Service Reports",
  "Journey Management Reports",
  "List Reports",
  "Materials Handling Reports",
  "Movement Reports",
  "Pre Production",
  "RAG Reports",
  "Risk Management Reports",
  "D-Monitor Reports",
  "Scoring Reports",
  "Trailer Reports",
  "Trip Reports"
];

const NotificationReports = [
  "Detailed Notification Report",
  "Notification Location Summary Report",
  "Overview Notification Report",
  "Summary Notification Report",
  "Terminal Notification Report"
];

const costReports = [
  "Cost per Distance Report",
  "Service History Report"
];

const dashboardWidgets = [
  "7 Day Dashboard",
  "Asset Performance Dashboard Report",
  "Road Speed Limit Dashboard"
];

const fuelReports = [
  "Comparative Fuel Report",
  "Daily Engine Hours Fuel Report",
  "Daily Fuel Notification Consumption Report",
  "Detailed Engine Hours Fuel Report",
  "Detailed Measured Fuel Report",
  "Engine Hours Fuel Report",
  "Entered Fuel Report",
  "Fuel Monthly Summary Report",
  "Fuel Operational Dashboard",
  "Measured Fuel Report",
  "Monthly Measured Fuel Report",
  "Summary Measured Fuel Report"
];

const listReports = [
  "Asset Configuration Report",
  "Asset Devices Configuration Report",
  "Asset Notifications Configuration Report",
  "Asset List by Data Downloaded Report",
  "Asset List By Unit Type Report",
  "Asset List Report",
  "Asset Manager Diagnostic Report",
  "Current Mobile Status Report",
  "Driver Certification Validity Report",
  "Driver Licence Validity Report",
  "Driver List Report",
  "Info Hub Notification Report",
  "Job Detail Report",
  "Summary and Detailed Task Report by Template and Date",
  "Timezone Changelog Report"
];

const materialsHandlingReports = [
  "Materials Handling Daily Trip Report",
  "Materials Handling Daily Utilisation Report",
  "Materials Handling Detailed Trip Report",
  "Materials Handling Notification Detail Report",
  "Materials Handling Notification Overview Report",
  "Materials Handling Notification Summary Report",
  "Materials Handling Impact Analysis Report",
  "Materials Handling Impact Notification Report",
  "Materials Handling Machine List Report",
  "Materials Handling Machine Performance Summary Report",
  "Materials Handling Monthly Hour Usage Report",
  "Materials Handling Monthly Trip Report",
  "Materials Handling Operator List Report",
  "Materials Handling Summary Trip Report"
];

const movementReports = [
  "Daily Movement Report",
  "Location Overview Report",
  "Location Visits By day Of Week Report",
  "Locations Not Visited Report",
  "Movement Overview Report",
  "Summary Movement Report"
];

const preProductionReports = [
  "Collection and Delivery Timeline Report",
  "Daily Movement Report ( XLS ERROR)",
  "Debrief Lite Report",
  "Debrief Report",
  "Driving Hours Exceptions Summary",
  "Entry And Exit Notification Duration Report",
  "Executive KPI Dashboard",
  "Executive KPI Dashboard Preprod",
  "Fleet Manager Exceptional Report",
  "Fleetco Movement Report",
  "Fuel Usage By Trip Report",
  "Geo Fence Report",
  "IFTA State Miles Report ( Legacy)",
  "Journey Management Distance Driven",
  "Materials Handling Monthly Hour Usage Report",
  "PDI Clocking Report",
  "Round Trip Time Report",
  "Scania Demo Report",
  "Service Reminder Report",
  "Shoprite Monthly Utilization Dashboard",
  "Summary pack page 3",
  "Summary pack page 4",
  "Task Template Report",
  "Temperature Analysis",
  "Tollgate Drivethrough Report",
  "topbottom10 Drivers drill",
  "Total - Base Violation Report",
  "Total - Continuous Driving Summary Report",
  "Total Energies - Violations Classification Report",
  "Trip Notifications By Week Part Report"
];

const ragReports = [
  "Augmented Daily RAG Report",
  "Augmented Summary RAG Report",
  "Driver Behaviour Report",
  "RAG Daily Report",
  "Rag Plus Daily Report",
  "RAG Summary Report",
  "RAG Year to Date Report"
];

const riskManagementReports = [
  "Collision Notification Report",
  "Collision PrNotificationion Report",
  "Driver Hours Out of Shift Report"
];

const dMonitorReports = [
  "D-Monitor Custom Driver Input Report"
];

const scoringReports = [
  "Advanced Scoring Report",
  "Daily Driving Performance Report",
  "Detailed Driving Performance Report",
  "Driver Debrief Report",
  "Driver Rating Detail Report",
  "Driver Rating Report",
  "Driver Scorecard Report",
  "Flexible Driver Scorecard Daily Report",
  "Flexible Driver Scorecard Report",
  "Flexible RAG Daily Report",
  "Flexible RAG Monthly Report",
  "Flexible RAG Summary Report",
  "Flexible RAG Year To Date Report",
  "Monthly Driving Performance Report",
  "Monthly Trend Report",
  "Standard Scoring and Driving Errors Trend Report",
  "Standard Scoring Report",
  "Summary Driving Performance Report"
];

const trailerReports = [
  "Trailer Summary Report",
  "Trailer Utilization Report"
];

const tripReports = [
  "Asset Performance Summary Report",
  "Asset Utilisation Report",
  "Daily Trip Report",
  "Daily Utilisation Report",
  "Detailed Trip Report",
  "Location Trip Report",
  "Logbook Report",
  "Monthly Trip Report",
  "Summary Trip Report"
];

const favoriteReports = [
  {
    id: "fav-1",
    description: "ECOPE Notifications (Customs)",
    report: "Detailed Notification Report",
    lastProcessed: "25/01/2025 05:12 (UTC)"
  },
  {
    id: "fav-2",
    description: "RE: STCL Daily/Monthly Score card for reference",
    report: "Flexible Driver Scorecard Report",
    lastProcessed: "25/01/2025 05:12 (UTC)"
  },
  {
    id: "fav-3",
    description: "STCL Notifications 30 days to date",
    report: "Detailed Notification Report",
    lastProcessed: "26/01/2025 23:43 (UTC)"
  },
  {
    id: "fav-4",
    description: "STCL Movement Rolling",
    report: "Daily Movement Report",
    lastProcessed: "07/11/2024 11:28 (UTC)"
  }
];

const dashboardByCategory: Record<
  string,
  { title: string; value: string; change: string; helper: string }[]
> = {
  "Cost Reports": [
    { title: "Cost per km", value: "$1.12", change: "-4.3%", helper: "30-day average" },
    { title: "Service spend", value: "$48.6k", change: "+6.1%", helper: "Month to date" },
    { title: "Unplanned costs", value: "$9.4k", change: "-1.2%", helper: "Last 14 days" }
  ],
  "Custom Reports": [
    { title: "Saved templates", value: "18", change: "+2", helper: "Last 30 days" },
    { title: "Run frequency", value: "3.4x", change: "+0.6", helper: "Per week" },
    { title: "Exports", value: "46", change: "+9", helper: "Month to date" }
  ],
  "Dashboard Widgets": [
    { title: "Widgets live", value: "7", change: "+1", helper: "Active dashboards" },
    { title: "Avg refresh", value: "5m", change: "-1m", helper: "Polling interval" },
    { title: "Coverage", value: "92%", change: "+3%", helper: "Assets reporting" }
  ],
  "Notification Reports": [
    { title: "Notifications", value: "214", change: "+8%", helper: "Last 7 days" },
    { title: "Critical", value: "12", change: "-2", helper: "Open alerts" },
    { title: "Avg response", value: "14m", change: "-3m", helper: "Dispatch" }
  ],
  "Fuel Reports": [
    { title: "Fuel efficiency", value: "3.4 km/L", change: "+0.2", helper: "Fleet avg" },
    { title: "Idle burn", value: "410 L", change: "-6%", helper: "Last 7 days" },
    { title: "Fuel variance", value: "2.1%", change: "+0.3%", helper: "Measured vs entered" }
  ],
  "Hours Of Service Reports": [
    { title: "Compliance", value: "96%", change: "+1%", helper: "Last 30 days" },
    { title: "Near limits", value: "7", change: "+2", helper: "Active shifts" },
    { title: "Violations", value: "3", change: "-1", helper: "This week" }
  ],
  "Journey Management Reports": [
    { title: "On-time", value: "88%", change: "+4%", helper: "Trips on schedule" },
    { title: "Exceptions", value: "14", change: "-3", helper: "Last 24h" },
    { title: "Avg dwell", value: "32m", change: "-5m", helper: "At hubs" }
  ],
  "List Reports": [
    { title: "Assets listed", value: "312", change: "+6", helper: "Total tracked" },
    { title: "Drivers", value: "148", change: "+3", helper: "Active" },
    { title: "Devices", value: "286", change: "+5", helper: "Provisioned" }
  ],
  "Materials Handling Reports": [
    { title: "Utilisation", value: "74%", change: "+2%", helper: "Daily avg" },
    { title: "Active machines", value: "46", change: "-1", helper: "Last shift" },
    { title: "Impact alerts", value: "6", change: "+2", helper: "This week" }
  ],
  "Movement Reports": [
    { title: "Trips", value: "128", change: "+9", helper: "Last 7 days" },
    { title: "Stops", value: "312", change: "+4", helper: "All assets" },
    { title: "Avg distance", value: "218 km", change: "+12 km", helper: "Per trip" }
  ],
  "Pre Production": [
    { title: "Test runs", value: "24", change: "+6", helper: "This month" },
    { title: "Known issues", value: "5", change: "-1", helper: "Open" },
    { title: "Pilot assets", value: "16", change: "+2", helper: "In scope" }
  ],
  "RAG Reports": [
    { title: "Green", value: "72%", change: "+3%", helper: "Score band" },
    { title: "Amber", value: "18%", change: "-1%", helper: "Score band" },
    { title: "Red", value: "10%", change: "-2%", helper: "Score band" }
  ],
  "Risk Management Reports": [
    { title: "High risk", value: "6", change: "+1", helper: "Open cases" },
    { title: "Incidents", value: "3", change: "-2", helper: "Last 30 days" },
    { title: "Avg response", value: "22m", change: "-4m", helper: "Escalation" }
  ],
  "D-Monitor Reports": [
    { title: "Driver inputs", value: "128", change: "+12", helper: "Last 24h" },
    { title: "Compliance", value: "94%", change: "+1%", helper: "Checklist" },
    { title: "Exceptions", value: "7", change: "-1", helper: "Open" }
  ],
  "Scoring Reports": [
    { title: "Avg score", value: "82", change: "+2", helper: "Fleet score" },
    { title: "Top drivers", value: "14", change: "+3", helper: "Above 90" },
    { title: "At risk", value: "9", change: "-2", helper: "Below 60" }
  ],
  "Trailer Reports": [
    { title: "Utilisation", value: "69%", change: "+4%", helper: "Active trailers" },
    { title: "Idle", value: "12", change: "-3", helper: "Units" },
    { title: "Maintenance", value: "5", change: "+1", helper: "Scheduled" }
  ],
  "Trip Reports": [
    { title: "Trips", value: "186", change: "+12", helper: "Last 7 days" },
    { title: "On-time", value: "86%", change: "+3%", helper: "Schedule" },
    { title: "Avg duration", value: "3h 12m", change: "-8m", helper: "Per trip" }
  ]
};


export default function Reports() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<"suite" | "favorites">("suite");
  const [selectedCategory, setSelectedCategory] = useState("Cost Reports");
  const [selectedNotificationReport, setSelectedNotificationReport] = useState(NotificationReports[0]);
  const [selectedCostReport, setSelectedCostReport] = useState(costReports[0]);
  const [selectedDashboardWidget, setSelectedDashboardWidget] = useState(dashboardWidgets[0]);
  const [selectedFuelReport, setSelectedFuelReport] = useState(fuelReports[0]);
  const [selectedListReport, setSelectedListReport] = useState(listReports[0]);
  const [selectedMaterialsHandlingReport, setSelectedMaterialsHandlingReport] = useState(materialsHandlingReports[0]);
  const [selectedMovementReport, setSelectedMovementReport] = useState(movementReports[0]);
  const [selectedPreProductionReport, setSelectedPreProductionReport] = useState(preProductionReports[0]);
  const [selectedRagReport, setSelectedRagReport] = useState(ragReports[0]);
  const [selectedRiskManagementReport, setSelectedRiskManagementReport] = useState(riskManagementReports[0]);
  const [selectedDMonitorReport, setSelectedDMonitorReport] = useState(dMonitorReports[0]);
  const [selectedScoringReport, setSelectedScoringReport] = useState(scoringReports[0]);
  const [selectedTrailerReport, setSelectedTrailerReport] = useState(trailerReports[0]);
  const [selectedTripReport, setSelectedTripReport] = useState(tripReports[0]);
  const [openFavoriteActions, setOpenFavoriteActions] = useState<string | null>(null);
  const isFavorites = activeTab === "favorites";

  useEffect(() => {
    const category = searchParams.get("category");
    const report = searchParams.get("report");
    if (category && reportCategories.includes(category)) {
      setSelectedCategory(category);
      setActiveTab("suite");
    }
    if (!report) return;
    switch (category) {
      case "Notification Reports":
        if (NotificationReports.includes(report)) setSelectedNotificationReport(report);
        break;
      case "Trip Reports":
        if (tripReports.includes(report)) setSelectedTripReport(report);
        break;
      case "Cost Reports":
        if (costReports.includes(report)) setSelectedCostReport(report);
        break;
      case "Dashboard Widgets":
        if (dashboardWidgets.includes(report)) setSelectedDashboardWidget(report);
        break;
      case "Fuel Reports":
        if (fuelReports.includes(report)) setSelectedFuelReport(report);
        break;
      case "List Reports":
        if (listReports.includes(report)) setSelectedListReport(report);
        break;
      case "Materials Handling Reports":
        if (materialsHandlingReports.includes(report)) setSelectedMaterialsHandlingReport(report);
        break;
      case "Movement Reports":
        if (movementReports.includes(report)) setSelectedMovementReport(report);
        break;
      case "Pre Production":
        if (preProductionReports.includes(report)) setSelectedPreProductionReport(report);
        break;
      case "RAG Reports":
        if (ragReports.includes(report)) setSelectedRagReport(report);
        break;
      case "Risk Management Reports":
        if (riskManagementReports.includes(report)) setSelectedRiskManagementReport(report);
        break;
      case "D-Monitor Reports":
        if (dMonitorReports.includes(report)) setSelectedDMonitorReport(report);
        break;
      case "Scoring Reports":
        if (scoringReports.includes(report)) setSelectedScoringReport(report);
        break;
      case "Trailer Reports":
        if (trailerReports.includes(report)) setSelectedTrailerReport(report);
        break;
      default:
        break;
    }
  }, [
    searchParams,
    selectedCategory,
    setSelectedCategory,
    setActiveTab,
    setSelectedNotificationReport,
    setSelectedTripReport,
    setSelectedCostReport,
    setSelectedDashboardWidget,
    setSelectedFuelReport,
    setSelectedListReport,
    setSelectedMaterialsHandlingReport,
    setSelectedMovementReport,
    setSelectedPreProductionReport,
    setSelectedRagReport,
    setSelectedRiskManagementReport,
    setSelectedDMonitorReport,
    setSelectedScoringReport,
    setSelectedTrailerReport
  ]);

  return (
    <div className="page reports-page">
      <div className="reports-topbar">
        <div className="reports-topbar-title">Report suite</div>
        <div className="reports-topbar-path">
          EA-Transfleet Services-… / Africa - ViviEA - Transfl… / China Petrol Pipeline En…
        </div>
      </div>

      <section className="reports-card">
        <div className="reports-header">
          <span className="reports-title">
            {isFavorites ? "Favourite reports" : `Report suite – ${selectedCategory}`}
          </span>
        </div>

        <div className="reports-layout">
          <aside className="reports-sidebar">
            <button
              className={`reports-tab ${activeTab === "suite" ? "active" : ""}`}
              onClick={() => setActiveTab("suite")}
              type="button"
            >
              Report suite
            </button>
            <button
              className={`reports-tab ${activeTab === "favorites" ? "active" : ""}`}
              onClick={() => setActiveTab("favorites")}
              type="button"
            >
              Favourite reports
            </button>
          </aside>

          <div className="reports-panel">
            {activeTab === "suite" ? (
              <>
                <div className="reports-label">Select report category</div>
                <select
                  className="reports-select"
                  size={12}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  {reportCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                {selectedCategory === "Notification Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select Notification report</div>
                    <select
                      className="reports-select-single"
                      value={selectedNotificationReport}
                      onChange={(e) => setSelectedNotificationReport(e.target.value)}
                    >
                      {NotificationReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Trip Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select trip report</div>
                    <select
                      className="reports-select-single"
                      value={selectedTripReport}
                      onChange={(e) => setSelectedTripReport(e.target.value)}
                    >
                      {tripReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Cost Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select cost report</div>
                    <select
                      className="reports-select-single"
                      value={selectedCostReport}
                      onChange={(e) => setSelectedCostReport(e.target.value)}
                    >
                      {costReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Dashboard Widgets" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select dashboard widget</div>
                    <select
                      className="reports-select-single"
                      value={selectedDashboardWidget}
                      onChange={(e) => setSelectedDashboardWidget(e.target.value)}
                    >
                      {dashboardWidgets.map((widget) => (
                        <option key={widget} value={widget}>
                          {widget}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Fuel Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select fuel report</div>
                    <select
                      className="reports-select-single"
                      value={selectedFuelReport}
                      onChange={(e) => setSelectedFuelReport(e.target.value)}
                    >
                      {fuelReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "List Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select list report</div>
                    <select
                      className="reports-select-single"
                      value={selectedListReport}
                      onChange={(e) => setSelectedListReport(e.target.value)}
                    >
                      {listReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Materials Handling Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select materials handling report</div>
                    <select
                      className="reports-select-single"
                      value={selectedMaterialsHandlingReport}
                      onChange={(e) => setSelectedMaterialsHandlingReport(e.target.value)}
                    >
                      {materialsHandlingReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Movement Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select movement report</div>
                    <select
                      className="reports-select-single"
                      value={selectedMovementReport}
                      onChange={(e) => setSelectedMovementReport(e.target.value)}
                    >
                      {movementReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Pre Production" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select pre production report</div>
                    <select
                      className="reports-select-single"
                      value={selectedPreProductionReport}
                      onChange={(e) => setSelectedPreProductionReport(e.target.value)}
                    >
                      {preProductionReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "RAG Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select RAG report</div>
                    <select
                      className="reports-select-single"
                      value={selectedRagReport}
                      onChange={(e) => setSelectedRagReport(e.target.value)}
                    >
                      {ragReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Risk Management Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select risk management report</div>
                    <select
                      className="reports-select-single"
                      value={selectedRiskManagementReport}
                      onChange={(e) => setSelectedRiskManagementReport(e.target.value)}
                    >
                      {riskManagementReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "D-Monitor Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select D-Monitor report</div>
                    <select
                      className="reports-select-single"
                      value={selectedDMonitorReport}
                      onChange={(e) => setSelectedDMonitorReport(e.target.value)}
                    >
                      {dMonitorReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Scoring Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select scoring report</div>
                    <select
                      className="reports-select-single"
                      value={selectedScoringReport}
                      onChange={(e) => setSelectedScoringReport(e.target.value)}
                    >
                      {scoringReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {selectedCategory === "Trailer Reports" && (
                  <div className="reports-Notification">
                    <div className="reports-label">Select trailer report</div>
                    <select
                      className="reports-select-single"
                      value={selectedTrailerReport}
                      onChange={(e) => setSelectedTrailerReport(e.target.value)}
                    >
                      {trailerReports.map((report) => (
                        <option key={report} value={report}>
                          {report}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="reports-analytics">
                  <div className="reports-label">
                    Analytics snapshot for {selectedCategory}
                  </div>
                  <div className="reports-analytics-grid">
                    {dashboardByCategory[selectedCategory]?.map((card) => (
                      <div key={card.title} className="reports-analytics-card">
                        <div className="reports-analytics-title">{card.title}</div>
                        <div className="reports-analytics-value">{card.value}</div>
                        <div className="reports-analytics-meta">
                          <span className="reports-analytics-change">{card.change}</span>
                          <span>{card.helper}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="reports-favorites">
                <div className="reports-label">Reports available in this category</div>
                <div className="reports-fav-table">
                  <div className="reports-fav-row reports-fav-head">
                    <div>Report description</div>
                    <div>Report</div>
                    <div>Date last processed</div>
                    <div className="reports-fav-actions" aria-hidden="true">⋯</div>
                  </div>
                  {favoriteReports.map((fav) => (
                    <div key={fav.id} className="reports-fav-row">
                      <div className="reports-fav-link">{fav.description}</div>
                      <div>{fav.report}</div>
                      <div>{fav.lastProcessed}</div>
                      <div className="reports-fav-actions">
                        <button
                          type="button"
                          className="reports-fav-btn"
                          aria-label="Actions"
                          onClick={() =>
                            setOpenFavoriteActions((prev) => (prev === fav.id ? null : fav.id))
                          }
                        >
                          ⋯
                        </button>
                        {openFavoriteActions === fav.id && (
                          <div className="reports-fav-menu" role="menu">
                            <button type="button" role="menuitem">Remove</button>
                            <button type="button" role="menuitem">Run</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
