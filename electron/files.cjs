const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

const MAX_TEXT = 2 * 1024 * 1024;
const MAX_BINARY = 12 * 1024 * 1024;
const hidden = new Set([".git", "node_modules", "target", "dist"]);
const mime = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};
const inside = (root, target) => { const rel = path.relative(root, target); return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)); };

async function workspacePath(args, creating = false) {
  const root = await fs.realpath(args.workspaceRoot);
  if (!(await fs.stat(root)).isDirectory()) throw new Error("Invalid workspace root");
  const relative = args.relativePath;
  if (typeof relative !== "string" || path.isAbsolute(relative) || relative.split(/[\\/]+/).includes("..")) throw new Error("Invalid workspace-relative path");
  const target = path.resolve(root, relative);
  if (!inside(root, target)) throw new Error("Path escapes workspace");
  if (creating) {
    let ancestor = target;
    while (true) {
      try { ancestor = await fs.realpath(ancestor); break; } catch (error) { if (error.code !== "ENOENT") throw error; ancestor = path.dirname(ancestor); }
    }
    if (!inside(root, ancestor)) throw new Error("Path escapes workspace through a link");
    return { root, target };
  }
  const canonical = await fs.realpath(target);
  if (!inside(root, canonical)) throw new Error("Path escapes workspace through a link");
  return { root, target: canonical };
}

function fileInfo(root, target, size) {
  const relative = path.relative(root, target).split(path.sep).join("/");
  return { path: relative, absolutePath: target, mime: mime[path.extname(target).slice(1).toLowerCase()] || "application/octet-stream", size };
}

async function files(command, args) {
  if (command === "write_temp_file") {
    const ext = String(args.request?.extension || "").replace(/^\./, "").toLowerCase();
    if (!/^(png|jpe?g|gif|webp|bmp|ico|svg|pdf|txt|md|bin|mp4|webm|mov|avi|mkv|mp3|wav|weba|m4a|csv|docx?|xlsx?|pptx?)$/.test(ext)) throw new Error("Unsupported temp file type");
    const input = args.request?.contentsBase64;
    if (typeof input !== "string" || !/^[A-Za-z0-9+/\s]*={0,2}$/.test(input)) throw new Error("Invalid file data");
    const data = Buffer.from(input, "base64");
    if (!data.length || data.length > MAX_BINARY) throw new Error("Invalid file size");
    const dir = path.join(os.tmpdir(), "voxiva-paste");
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, `paste-${randomUUID()}.${ext}`);
    await fs.writeFile(target, data, { flag: "wx" });
    return target;
  }
  const { root, target } = await workspacePath(args, command === "write_text_file" || command === "create_workspace_dir");
  if (command === "list_workspace_dir") {
    const entries = await fs.readdir(target, { withFileTypes: true });
    const result = [];
    for (const entry of entries) {
      if (hidden.has(entry.name)) continue;
      const item = path.join(target, entry.name);
      const canonical = await fs.realpath(item).catch(() => null);
      if (!canonical || !inside(root, canonical)) continue;
      const stat = await fs.stat(canonical);
      result.push({ name: entry.name, path: path.relative(root, item).split(path.sep).join("/"), isDir: stat.isDirectory(), size: stat.isFile() ? stat.size : 0 });
    }
    return result.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  }
  if (command === "create_workspace_dir") {
    if (target === root) throw new Error("Folder path is empty");
    await fs.mkdir(target, { recursive: true });
    return path.relative(root, target).split(path.sep).join("/");
  }
  if (command === "write_text_file") {
    const content = args.content;
    if (typeof content !== "string" || Buffer.byteLength(content) > MAX_TEXT) throw new Error("Invalid text file size");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
    return { path: path.relative(root, target).split(path.sep).join("/"), content, size: Buffer.byteLength(content) };
  }
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("Workspace path is not a file");
  const info = fileInfo(root, target, stat.size);
  if (command === "workspace_file_info") return info;
  if (command === "read_text_file") {
    if (stat.size > MAX_TEXT) throw new Error("File exceeds the 2 MiB limit");
    const data = await fs.readFile(target);
    if (data.includes(0)) throw new Error("File appears to be binary");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(data);
    return { path: info.path, content, size: data.length };
  }
  if (command === "read_binary_file") {
    if (stat.size > MAX_BINARY) throw new Error("File is too large to preview");
    const data = await fs.readFile(target);
    return { path: info.path, base64: data.toString("base64"), mime: info.mime, size: data.length };
  }
  throw new Error("Unsupported file command");
}

module.exports = { files, workspacePath };
