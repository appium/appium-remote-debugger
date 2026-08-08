import {COLOR_NAMES} from './colorNames.js';

// Extracted from the W3C CSS spec: http://www.w3.org/TR/CSS/#properties
const COLOR_PROPERTIES = new Set([
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'color',
  'outlineColor',
]);

const HEX_TRIPLET_RE = /#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])/;
const VALID_HEX_COLOR_RE = /^#(?:[0-9a-f]{3}){1,2}$/i;
const RGBA_COLOR_RE = /^(?:rgba)?\((\d{1,3}),\s?(\d{1,3}),\s?(\d{1,3}),\s?(0|1|0\.\d*)\)$/i;
const RGB_COLOR_RE = /^(?:rgb)?\((0|[1-9]\d{0,2}),\s?(0|[1-9]\d{0,2}),\s?(0|[1-9]\d{0,2})\)$/i;

/**
 * Converts a hex or CSS color-name representation of a color to RGB.
 * @return [r, g, b, 1] as ints in [0, 255], or null for invalid colors.
 */
function maybeConvertHexOrColorName(hexOrColorName: string): [number, number, number, number] | null {
  hexOrColorName = hexOrColorName.toLowerCase();
  let hex = COLOR_NAMES[hexOrColorName];
  if (!hex) {
    hex = hexOrColorName.charAt(0) === '#' ? hexOrColorName : `#${hexOrColorName}`;
    if (hex.length === 4) {
      // of the form #RGB
      hex = hex.replace(HEX_TRIPLET_RE, '#$1$1$2$2$3$3');
    }

    if (!VALID_HEX_COLOR_RE.test(hex)) {
      return null;
    }
  }

  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);

  return [r, g, b, 1];
}

/**
 * Attempts to parse a string as an rgba color: `(r, g, b, a)` or
 * `rgba(r, g, b, a)`, where r, g, b are ints in [0, 255] and a is a float in
 * [0, 1].
 */
function maybeParseRgbaColor(str: string): [number, number, number, number] | null {
  const m = str.match(RGBA_COLOR_RE);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const a = Number(m[4]);
    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255 && a >= 0 && a <= 1) {
      return [r, g, b, a];
    }
  }
  return null;
}

/**
 * Attempts to parse a string as an rgb color: `(r, g, b)` or `rgb(r, g, b)`,
 * where each component is an int in [0, 255].
 */
function maybeParseRgbColor(str: string): [number, number, number, number] | null {
  const m = str.match(RGB_COLOR_RE);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      return [r, g, b, 1];
    }
  }
  return null;
}

/**
 * Returns a property, with a standardized color if it contains a
 * convertible color.
 * @param propertyName Name of the CSS property in camelCase.
 * @param propertyValue The value of the CSS property.
 * @return The value, in a standardized format if it is a color property.
 */
export function standardizeColor(propertyName: string, propertyValue: string): string {
  if (!COLOR_PROPERTIES.has(propertyName)) {
    return propertyValue;
  }
  const rgba =
    maybeParseRgbaColor(propertyValue) ||
    maybeParseRgbColor(propertyValue) ||
    maybeConvertHexOrColorName(propertyValue);
  return rgba ? `rgba(${rgba.join(', ')})` : propertyValue;
}
