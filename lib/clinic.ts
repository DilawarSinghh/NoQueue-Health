// Clinic identity — single source of truth for the MVP.
//
// TODO(later): derive from URL param (?hospital=xyz) via `searchParams` in
// each page + a lookup table of clinic configs. For now, one hardcoded test
// clinic, exactly as spec'd (§4, landing screen).
export const CLINIC_NAME = "Test Clinic";
