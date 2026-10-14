const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

module.exports = function withAdaptiveIconSafeZone(config) {
  return withDangerousMod(config, ["android", async (modConfig) => {
    const res = path.join(modConfig.modRequest.platformProjectRoot, "app/src/main/res");
    const insetPath = path.join(res, "drawable", "ic_launcher_foreground_safe.xml");
    await fs.writeFile(insetPath, `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@mipmap/ic_launcher_foreground"
    android:inset="17%" />
`);

    for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      const iconPath = path.join(res, "mipmap-anydpi-v26", name);
      const xml = await fs.readFile(iconPath, "utf8");
      const updated = xml.replace(
        /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\s*\/>/,
        '<foreground android:drawable="@drawable/ic_launcher_foreground_safe" />',
      );
      if (updated === xml) throw new Error(`Could not patch ${name}; Expo icon resources changed.`);
      await fs.writeFile(iconPath, updated);
    }
    return modConfig;
  }]);
};
