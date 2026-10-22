# Mix architecture patterns in Vivi Telematics

Vivi applies **Mix-style structural patterns** on its own Traccar/VPS data. It does **not** call MiX Integrate (`integrate.za.mixtelematics.com`).

## Mapping

| Mix concept | Vivi implementation |
|-------------|---------------------|
| Org category tree + site family | [`frontend/src/utils/viviCategories.ts`](../frontend/src/utils/viviCategories.ts) |
| Multi-site / multi-asset fleet filter | [`frontend/src/contexts/FleetFilterContext.tsx`](../frontend/src/contexts/FleetFilterContext.tsx) |
| Soft DB profile switch (Analyze) | [`frontend/src/contexts/DbProfileContext.tsx`](../frontend/src/contexts/DbProfileContext.tsx) |
| Unified live fleet row | [`frontend/src/services/liveFleetFeed.ts`](../frontend/src/services/liveFleetFeed.ts) |
| Filter strip UI | [`frontend/src/components/FleetFilterBar.tsx`](../frontend/src/components/FleetFilterBar.tsx) |

Hierarchy levels remain Vivi’s dealer → organisation → database → site (UI labels swap dealer ↔ organisation). Optional **site family** is derived from names like `CPP_TZ/Coating`.

## Isolation boundary (mandatory)

| Surface | Rule |
|---------|------|
| **Control** libraries, bindings, config groups, passengers | Strict **single active site** via OrgRibbon / `activateSiteContext`. Do not use FleetFilter multi-select to load or save Control settings. |
| **Track / Analyze** live fleet, dashboards, analysers | May use **FleetFilter** multi-site/asset selection within the active database. Empty selection = all sites/assets in current DB scope. |
| Persistence | Fleet filter + DB profile prefs are **user-scoped** (`userStorageKey`). Never store global sticky Mix-style keys. |

## Live row shape

Normalized fields: `registration`, `movementStatus`, `site`, `siteFamily`, `lat`/`lon`, `breadcrumb`, `assetId`. Live Tracking and EasyTrack filter through FleetFilter after OrgRibbon scope.

## Out of scope

- MiX OAuth / Worker proxy
- Mixing Control settings across sites for convenience
