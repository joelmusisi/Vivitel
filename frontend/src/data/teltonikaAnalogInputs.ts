/** Teltonika analogue inputs IO1–IO15 (mV) used for fuel / voltage computed attributes. */
export const TELTONIKA_ANALOG_INPUT_MAX = 15;

export const teltonikaAnalogInputNames = Array.from(
  { length: TELTONIKA_ANALOG_INPUT_MAX },
  (_, index) => `IO${index + 1}`
);

export type TeltonikaAnalogInputParameterRow = {
  name: string;
  type: string;
  units: string;
  availability?: string;
};

export function buildTeltonikaAnalogInputParameterRows(): TeltonikaAnalogInputParameterRow[] {
  return teltonikaAnalogInputNames.map((name) => ({
    name,
    type: "Value",
    units: "mV",
    availability: "Available"
  }));
}

/** Returns io1..io15 JEXL field name when the label is a Teltonika analogue input (IO1, IO 6, io12, …). */
export function mapTeltonikaAnalogInputFieldToJexl(field: string): string | null {
  const trimmed = String(field ?? "").trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(?:io|IO)\s*(\d{1,2})$/i);
  if (!match) return null;
  const channel = Number(match[1]);
  if (!Number.isFinite(channel) || channel < 1 || channel > TELTONIKA_ANALOG_INPUT_MAX) return null;
  return `io${channel}`;
}

/** Voltage read with device attribute fallbacks (for non-IO6 inputs or missing direct ioN). */
export function mapTeltonikaAnalogInputFieldToJexlWithFallback(field: string): string {
  const direct = mapTeltonikaAnalogInputFieldToJexl(field);
  if (!direct) return "";
  const channel = direct.replace(/^io/, "");
  return `(io${channel} != null ? io${channel} : (attributes.io${channel} != null ? attributes.io${channel} : attributes["IO${channel}"]))`;
}

export function isTeltonikaAnalogInputParameter(name: string): boolean {
  return mapTeltonikaAnalogInputFieldToJexl(name) != null;
}
