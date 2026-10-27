import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { JourneyRouteDetail } from "./journeyRouteDetails";

function safeFilenamePart(value: string): string {
  return value.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "route";
}

function tableEndY(doc: jsPDF, fallback: number): number {
  const last = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof last?.finalY === "number" ? last.finalY + 8 : fallback;
}

/** Download a one-page PDF summary of a tracked journey route. */
export function downloadJourneyRoutePdf(detail: JourneyRouteDetail): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 14;
  let y = 16;

  doc.setFontSize(14);
  doc.text(detail.routeName || "Route tracking", margin, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`${detail.workflowName} · ${detail.site} · ${detail.lead}`, margin, y);
  doc.setTextColor(0);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Field", "Value"]],
    body: [
      ["Status", detail.started ? `${detail.progressPercent}% covered` : "Not started"],
      ["Distance", `${detail.coveredKm} / ${detail.distanceKm} km`],
      ["Driver", `${detail.driver.name} (${detail.driver.phone})`],
      ["License", detail.driver.license],
      ["Registration", detail.vehicle.registration],
      ["Vehicle", `${detail.vehicle.make} · ${detail.vehicle.type}`],
      ["Site", detail.site],
      ["Region / lead", detail.region],
      ["Departed", detail.departedAt ?? "—"],
      ["ETA destination", detail.etaDestination],
      ["Health", detail.exception ? `${detail.health} · ${detail.exception}` : detail.health],
      ["Fuel used", detail.started ? `${detail.fuelUsedLiters} L` : "—"],
      ["Avg speed", detail.started ? `${detail.speedAvgKph} km/h` : "—"]
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 118, 110] },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: "auto" } },
    margin: { left: margin, right: margin }
  });

  y = tableEndY(doc, y);

  autoTable(doc, {
    startY: y,
    head: [["#", "Stop", "Kind", "Status", "ETA"]],
    body: detail.stops.map((stop, index) => [
      String(index + 1),
      stop.name,
      stop.kind,
      stop.status,
      stop.eta
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 118, 110] },
    margin: { left: margin, right: margin }
  });

  y = tableEndY(doc, y);

  if (detail.timeline.length) {
    autoTable(doc, {
      startY: y,
      head: [["When", "Event", "Detail"]],
      body: detail.timeline.map((event) => [event.at, event.title, event.detail]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110] },
      margin: { left: margin, right: margin }
    });
  }

  doc.save(`route-tracking-${safeFilenamePart(detail.routeName)}.pdf`);
}
