import { describe, expect, it } from "vitest";
import { ribbonPageLabel } from "./ribbonPageLabel";

describe("ribbonPageLabel", () => {
  it("uses the page name on user, role, and security group screens", () => {
    expect(ribbonPageLabel("/Control/user-admin/users")).toBe("Users");
    expect(ribbonPageLabel("/Control/user-admin/users/create")).toBe("Create user");
    expect(ribbonPageLabel("/Control/user-admin/users/edit/2fdb3966-32f8-478a-a563-e1466a19991f")).toBe("Edit user");
    expect(ribbonPageLabel("/Control/user-admin/users/access/abc-123")).toBe("User access");
    expect(ribbonPageLabel("/Control/user-admin/roles")).toBe("Roles");
    expect(ribbonPageLabel("/Control/user-admin/roles/edit/role-1")).toBe("Edit role");
    expect(ribbonPageLabel("/Control/user-admin/security-groups")).toBe("Security Groups");
    expect(
      ribbonPageLabel("/Control/user-admin/security-groups/edit/2fdb3966-32f8-478a-a563-e1466a19991f")
    ).toBe("Edit security group");
  });
});
