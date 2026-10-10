const panes = ["left", "right"];
const layout = () => {
  void window.pilot.layout(panes.map((label) => {
    const rect = document.getElementById(label).getBoundingClientRect();
    return { label, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
};
const resize = new ResizeObserver(layout);
for (const label of panes) resize.observe(document.getElementById(label));
document.getElementById("open").addEventListener("click", async () => {
  const url = document.getElementById("url").value;
  const status = document.getElementById("status");
  status.textContent = "Loading…";
  try {
    for (const label of panes) await window.pilot.open(label, url);
    layout();
    status.textContent = "";
  } catch (error) {
    status.textContent = String(error);
  }
});
window.addEventListener("resize", layout);
document.getElementById("open").click();
