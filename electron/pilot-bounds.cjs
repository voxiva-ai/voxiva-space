function bounds(value, windowBounds) {
  if (!value || !windowBounds) throw new Error("Missing pane bounds");
  const result = Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Math.round(value[key])]));
  if (Object.values(result).some((number) => !Number.isFinite(number))) throw new Error("Invalid pane bounds");
  result.x = Math.max(0, Math.min(result.x, windowBounds.width));
  result.y = Math.max(0, Math.min(result.y, windowBounds.height));
  result.width = Math.max(0, Math.min(result.width, windowBounds.width - result.x));
  result.height = Math.max(0, Math.min(result.height, windowBounds.height - result.y));
  return result;
}

module.exports = { bounds };
