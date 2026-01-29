/**
 * PatriciaX - WCAG Contrast Calculator
 * Implements WCAG 2.1 color contrast calculation (AA and AAA levels)
 */

export interface ContrastResult {
  ratio: number
  passAA: boolean
  passAAA: boolean
  passAALarge: boolean
  passAAALarge: boolean
}

/**
 * Parse RGB color from CSS format (rgb(), rgba(), hex)
 */
export function parseColor(color: string): [number, number, number] {
  // Handle rgb(a) format
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbMatch) {
    return [Number.parseInt(rgbMatch[1]), Number.parseInt(rgbMatch[2]), Number.parseInt(rgbMatch[3])]
  }

  // Handle hex format
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (hexMatch) {
    return [
      Number.parseInt(hexMatch[1], 16),
      Number.parseInt(hexMatch[2], 16),
      Number.parseInt(hexMatch[3], 16),
    ]
  }

  // Fallback to black
  return [0, 0, 0]
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const sRGB = val / 255
    return sRGB <= 0.03928 ? sRGB / 12.92 : ((sRGB + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Calculate contrast ratio between two colors
 */
export function calculateContrast(color1: string, color2: string): ContrastResult {
  const rgb1 = parseColor(color1)
  const rgb2 = parseColor(color2)

  const lum1 = getRelativeLuminance(rgb1)
  const lum2 = getRelativeLuminance(rgb2)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  const ratio = (lighter + 0.05) / (darker + 0.05)

  return {
    ratio,
    passAA: ratio >= 4.5, // Normal text
    passAAA: ratio >= 7, // Normal text (enhanced)
    passAALarge: ratio >= 3, // Large text (18pt+ or 14pt+ bold)
    passAAALarge: ratio >= 4.5, // Large text (enhanced)
  }
}

/**
 * Determine if contrast passes WCAG criteria
 */
export function meetsWCAG(
  color1: string,
  color2: string,
  level: 'AA' | 'AAA' = 'AA',
  largeText = false
): boolean {
  const result = calculateContrast(color1, color2)

  if (level === 'AA') {
    return largeText ? result.passAALarge : result.passAA
  }

  return largeText ? result.passAAALarge : result.passAAA
}
