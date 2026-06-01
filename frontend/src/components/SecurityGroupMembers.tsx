import type { RbacRole, RbacUser } from "../utils/api";

type Props = {
  roles: RbacRole[];
  users: RbacUser[];
  roleIds: string[];
  userIds: string[];
  disabled?: boolean;
  onChange: (next: { roleIds: string[]; userIds: string[] }) => void;
};

export function SecurityGroupMembers({ roles, users, roleIds, userIds, disabled, onChange }: Props) {
  const toggle = (list: string[], id: string, on: boolean) => {
    const set = new Set(list);
    if (on) set.add(id);
    else set.delete(id);
    return Array.from(set);
  };

  return (
    <div className="admin-modal-field" style={{ gap: 12 }}>
      <span>Group membership</span>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div className="admin-permissions-title">Roles in this group</div>
          <div className="admin-permissions-list">
            {roles.map((role) => (
              <label key={role.id} className="admin-permission-item">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={roleIds.includes(role.id)}
                  onChange={(e) =>
                    onChange({
                      roleIds: toggle(roleIds, role.id, e.target.checked),
                      userIds
                    })
                  }
                />
                {role.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="admin-permissions-title">Users in this group</div>
          <div className="admin-permissions-list">
            {users.map((user) => (
              <label key={user.id} className="admin-permission-item">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={userIds.includes(user.id)}
                  onChange={(e) =>
                    onChange({
                      roleIds,
                      userIds: toggle(userIds, user.id, e.target.checked)
                    })
                  }
                />
                {user.name} ({user.email})
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
