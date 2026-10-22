import { useLocation } from "react-router-dom";
import { parseUserAdminRoute, ROLES_PATH, SECURITY_GROUPS_PATH, USERS_PATH } from "./paths";
import RolesListPage from "./RolesListPage";
import RoleEditorPage from "./RoleEditorPage";
import SecurityGroupsListPage from "./SecurityGroupsListPage";
import SecurityGroupEditorPage from "./SecurityGroupEditorPage";
import UsersListPage from "./UsersListPage";
import UserEditorPage from "./UserEditorPage";
import UserAccessPage from "./UserAccessPage";

export default function UserAdminRouter() {
  const location = useLocation();
  const route = parseUserAdminRoute(location.pathname);

  if (route.base === USERS_PATH) {
    if (route.mode === "create") return <UserEditorPage mode="create" />;
    if (route.mode === "edit") return <UserEditorPage mode="edit" entityId={route.entityId} />;
    if (route.mode === "access") return <UserAccessPage />;
    return <UsersListPage />;
  }

  if (route.base === ROLES_PATH) {
    if (route.mode === "create") return <RoleEditorPage mode="create" />;
    if (route.mode === "edit") return <RoleEditorPage mode="edit" entityId={route.entityId} />;
    return <RolesListPage />;
  }

  if (route.base === SECURITY_GROUPS_PATH) {
    if (route.mode === "create") return <SecurityGroupEditorPage mode="create" />;
    if (route.mode === "edit") return <SecurityGroupEditorPage mode="edit" />;
    return <SecurityGroupsListPage />;
  }

  return (
    <div className="page admin-page">
      <div className="admin-empty">User Admin page not found.</div>
    </div>
  );
}
