import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAccess } from "./context/AccessContext";
import { TopNav } from "./components/TopNav";
import { manageNav, monitorNav, measureNav } from "./navData";
import Home from "./pages/Home";
import PageShell from "./components/PageShell";
import Dashboards from "./pages/measure/Dashboards";
import Reports from "./pages/measure/Reports";
import InsightAgility from "./pages/measure/InsightAgility";
import Subscriptions from "./pages/measure/Subscriptions";
import NotificationAnalyser from "./pages/measure/EventAnalyser";
import LocationAnalyser from "./pages/measure/LocationAnalyser";
import LiveTracking from "./pages/LiveTracking";
import HistoricalTracking from "./pages/HistoricalTracking";
import Assets from "./pages/Assets";
import Drivers from "./pages/Drivers";
import Passengers from "./pages/Passengers";
import VideoGallery from "./pages/VideoGallery";
import LiveVideoStreaming from "./pages/LiveVideoStreaming";
import DeviceRemoteActions from "./pages/DeviceRemoteActions";
import VideoTelematicsDashboard from "./pages/VideoTelematicsDashboard";
import Libraries from "./pages/manage/Libraries";
import Bindings from "./pages/manage/Bindings";
import MobileDeviceAdmin from "./pages/manage/MobileDeviceAdmin";
import TripTimeline from "./pages/TripTimeline";
import OrgRibbon from "./components/OrgRibbon";
import DefaultOptions from "./pages/monitor/DefaultOptions";
import MessageBox from "./pages/monitor/MessageBox";
import InstantMessaging from "./pages/monitor/InstantMessaging";
import Tasks from "./pages/monitor/Tasks";
import Templates from "./pages/monitor/Templates";
import Workers from "./pages/monitor/Workers";
import Customers from "./pages/monitor/Customers";
import { saveToApi } from "./utils/api";
import Workflow from "./pages/monitor/journey/Workflow";
import JourneyLibraries from "./pages/monitor/journey/Libraries";
import JourneyMonitoring from "./pages/monitor/journey/Monitoring";
import ResourceAllocation from "./pages/monitor/journey/ResourceAllocation";
import HosDashboard from "./pages/monitor/hos/Dashboard";
import HosOverview from "./pages/monitor/hos/Overview";
import HosTimeline from "./pages/monitor/hos/Timeline";
import HosLogViewer from "./pages/monitor/hos/LogViewer";
import HosNotifications from "./pages/monitor/hos/Notifications";
import HosTimeclock from "./pages/monitor/hos/Timeclock";
import EasyTrack from "./pages/monitor/tracking/EasyTrack";
import ManageLocations from "./pages/monitor/tracking/ManageLocations";
import ManageRoadHazards from "./pages/monitor/tracking/ManageRoadHazards";
import Streams from "./pages/monitor/infoHub/Streams";
import ConfigAdmin from "./pages/manage/ConfigAdmin";
import OperationsAdmin from "./pages/manage/OperationsAdmin";
import ContactsAdmin from "./pages/manage/ContactsAdmin";
import UserAdmin from "./pages/manage/UserAdmin";
import NotificationsAdmin from "./pages/manage/NotificationsAdmin";
import UserSettingsAdmin from "./pages/manage/UserSettingsAdmin";
import Login from "./pages/Login";
import { AuthGate } from "./components/AuthGate";
import AccessDenied from "./components/AccessDenied";
import { ProtectedRoute } from "./components/ProtectedRoute";

function routeElements() {
  const routes: { path: string; title: string; description?: string }[] = [];
  monitorNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  manageNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  measureNav.forEach((group) => {
    group.items.forEach((item) => routes.push({ path: item.path, title: item.label, description: group.title }));
  });
  return routes;
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loading, canViewPath } = useAccess();

  useEffect(() => {
    if (loading) return;
    if (location.pathname === "/access-denied" || location.pathname === "/") return;
    if (!canViewPath(location.pathname)) {
      navigate("/access-denied", { replace: true, state: { from: location.pathname } });
    }
  }, [loading, location.pathname, canViewPath, navigate]);

  const [modal, setModal] = useState<{
    title: string;
    subtitle?: string;
    fields: string[];
  } | null>(null);
  const [modalValues, setModalValues] = useState<Record<string, string>>({});
  const generatedRoutes = routeElements();
  const customComponents: Record<string, JSX.Element> = {
    "/measure/insights/dashboards": <Dashboards />,
    "/measure/insights/reports": <Reports />,
    "/measure/insights/Vivi-insight-agility": <InsightAgility />,
    "/measure/insights/subscriptions": <Subscriptions />,
    "/measure/insights/Notification-analyser": <NotificationAnalyser />,
    "/measure/insights/location-analyser": <LocationAnalyser />,
    "/monitor/tracking/live": <LiveTracking />,
    "/monitor/tracking/historical": <HistoricalTracking />,
    "/monitor/activity/trip-timeline": <TripTimeline />,
    "/monitor/videos/dashboard": <VideoTelematicsDashboard />,
    "/monitor/videos/video-gallery": <VideoGallery />,
    "/monitor/videos/live-video-streaming": <LiveVideoStreaming />,
    "/monitor/videos/device-remote-actions": <DeviceRemoteActions />,
    "/monitor/fleet/assets": <Assets />,
    "/monitor/fleet/drivers": <Drivers />,
    "/monitor/fleet/passengers": <Passengers />,
    "/manage/config/libraries": <Libraries />,
    "/manage/config/templates": <Bindings />,
    "/manage/mobile-device-admin": <MobileDeviceAdmin />,
    "/monitor/jobs/default-options": <DefaultOptions />,
    "/monitor/jobs/message-box": <MessageBox />,
    "/monitor/jobs/instant-messaging": <InstantMessaging />,
    "/monitor/tasks/tasks": <Tasks />,
    "/monitor/tasks/templates": <Templates />,
    "/monitor/tasks/workers": <Workers />,
    "/monitor/fleet/customers": <Customers />,
    "/monitor/journey/workflow": <Workflow />,
    "/monitor/journey/libraries": <JourneyLibraries />,
    "/monitor/journey/monitoring": <JourneyMonitoring />,
    "/monitor/journey/resource-allocation": <ResourceAllocation />,
    "/monitor/hos/dashboard": <HosDashboard />,
    "/monitor/hos/overview": <HosOverview />,
    "/monitor/hos/timeline": <HosTimeline />,
    "/monitor/hos/log-viewer": <HosLogViewer />,
    "/monitor/hos/notifications": <HosNotifications />,
    "/monitor/hos/timeclock": <HosTimeclock />,
    "/monitor/tracking/easytrack": <EasyTrack />,
    "/monitor/tracking/manage-locations": <ManageLocations />,
    "/monitor/tracking/manage-road-hazards": <ManageRoadHazards />,
    "/monitor/info-hub/streams": <Streams />,
    "/manage/config/configuration-groups": <ConfigAdmin />,
    "/manage/config/Vivi-d-monitor-configuration": <ConfigAdmin />,
    "/manage/config/task-management-configuration": <ConfigAdmin />,
    "/manage/config/asset-commissioning": <ConfigAdmin />,
    "/manage/operations/database-administration": <OperationsAdmin />,
    "/manage/operations/dealer-administration": <OperationsAdmin />,
    "/manage/operations/organisation-settings": <OperationsAdmin />,
    "/manage/operations/data-exclusion": <OperationsAdmin />,
    "/manage/operations/release-management": <OperationsAdmin />,
    "/manage/operations/organisation-goals": <OperationsAdmin />,
    "/manage/operations/organisation-groups": <OperationsAdmin />,
    "/manage/contacts/manage-contacts": <ContactsAdmin />,
    "/manage/user-admin/users": <UserAdmin />,
    "/manage/user-admin/roles": <UserAdmin />,
    "/manage/user-admin/security-groups": <UserAdmin />,
    "/manage/notifications/satellite-assisted-notifications": <NotificationsAdmin />,
    "/manage/user-settings/user-scoring": <UserSettingsAdmin />,
    "/manage/user-settings/personal-access-tokens": <UserSettingsAdmin />,
    "/manage/user-settings/personal-settings": <UserSettingsAdmin />
  };

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest("button");
      if (!button) return;
      const navTarget = button.getAttribute("data-nav");
      if (navTarget) {
        navigate(navTarget);
        return;
      }
      const modalTitle = button.getAttribute("data-modal");
      if (modalTitle) {
        const fieldsAttr = button.getAttribute("data-modal-fields");
        const fields = (fieldsAttr ? fieldsAttr.split("|") : ["Name", "Owner", "Notes"])
          .map((field) => field.trim())
          .filter(Boolean);
        const initialValues = fields.reduce<Record<string, string>>((acc, field) => {
          acc[field] = "";
          return acc;
        }, {});
        setModalValues(initialValues);
        setModal({
          title: modalTitle,
          subtitle: button.getAttribute("data-modal-sub") ?? undefined,
          fields
        });
        return;
      }
      if (button.hasAttribute("data-toast-ignore")) return;
      const label =
        button.getAttribute("data-toast") ||
        button.getAttribute("aria-label") ||
        button.textContent?.trim();
      if (!label) return;
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [navigate]);

  return (
    <AuthGate>
    <div className="app-shell">
      <TopNav />
      <OrgRibbon />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/access-denied" element={<AccessDenied />} />
        {generatedRoutes.map((r) => (
          <Route
            key={r.path}
            path={r.path}
            element={
              <ProtectedRoute>
                {customComponents[r.path] ?? <PageShell title={r.title} description={r.description} />}
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="/monitor/videos/video-gallery" element={<ProtectedRoute><VideoGallery /></ProtectedRoute>} />
        <Route path="/monitor/videos/live-video-streaming" element={<ProtectedRoute><LiveVideoStreaming /></ProtectedRoute>} />
        <Route path="/monitor/videos/device-remote-actions" element={<ProtectedRoute><DeviceRemoteActions /></ProtectedRoute>} />
        <Route path="*" element={<PageShell title="Not Found" description="The requested page does not exist." />} />
      </Routes>
      {modal && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setModal(null)}
        >
          <div className="admin-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-modal-title">{modal.title}</div>
                {modal.subtitle && <div className="admin-modal-sub">{modal.subtitle}</div>}
              </div>
              <button
                type="button"
                className="admin-modal-close"
                aria-label="Close"
                data-toast-ignore
                onClick={() => setModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {modal.fields.map((field) => (
                <label key={field} className="admin-modal-field">
                  <span>{field}</span>
                  <input
                    type="text"
                    value={modalValues[field] ?? ""}
                    placeholder={`Enter ${field.toLowerCase()}`}
                    onChange={(event) =>
                      setModalValues((current) => ({ ...current, [field]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-modal-btn ghost"
                data-toast-ignore
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-modal-btn"
                data-toast-ignore
                onClick={() => {
                  if (modal) {
                    void saveToApi(`admin-modal:${modal.title}`, {
                      title: modal.title,
                      values: modalValues,
                      updatedAt: new Date().toISOString()
                    });
                  }
                  setModal(null);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AuthGate>
  );
}

export default App;
