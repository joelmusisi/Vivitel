export type LocationLibraryRow = {
  name: string;
  type: string;
  speed?: string;
  availability?: string;
  site?: string;
};

/** Legacy demo seed names — stripped from stored library on load. */
export const legacyLocationLibrarySeedNames = new Set(
  [
    "Main Road, gravel / 30.0 kmph / Uganda 46",
    "Main Road, gravel / 50.0 kmph / Uganda 3",
    "tertiary / 45.0 kmph / Tanzania 11",
    "29 July Accident CPP/Motobike (30km/h)",
    "Al-Mansor 50kph",
    "Araa Vilager-Kondoa 50kph",
    "Araa-Mlima Wa Simu / secondary / 50.0 kmph / Tanza 7",
    "Arusha (50km/h)",
    "Arusha 2 (50km/h)",
    "Arusha Airport",
    "B01 / MLBV / UG 31",
    "B27 / MLBV Access Road / 30km/hr 51",
    "B52 / MLBV / TZ 80",
    "B53 / MLBV / TZ 79",
    "B54 / MLBV / TZ 84",
    "B61 / MLBV / TZ 88",
    "B62 / MLBV + EHT / TZ 78",
    "B73 / MLBV / TZ 90",
    "B74 / MLBV + EHT / TZ 82",
    "Babati 2 (50km/h)"
  ].map((name) => name.toLowerCase())
);

export const locationLibraryRows: LocationLibraryRow[] = [];
