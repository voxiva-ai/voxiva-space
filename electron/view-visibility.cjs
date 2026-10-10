async function captureBeforeHide(view, emit, hide) {
  const version = view.visibilityVersion;
  try {
    const image = await view.webContents.capturePage();
    if (version === view.visibilityVersion && !image.isEmpty()) emit(image.toDataURL());
  } catch { /* Navigation can invalidate a capture; the browser remains available. */ }
  if (version === view.visibilityVersion) hide(view);
}

module.exports = { captureBeforeHide };
