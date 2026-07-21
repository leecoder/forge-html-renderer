import React, { useState, useEffect, useRef } from "react";
import { invoke, view, Modal } from "@forge/bridge";

const MIN_HEIGHT = 80;
const DEFAULT_HEIGHT = 400;

// Keep in sync with manifest.yml permissions.external.scripts / .styles
const ALLOWED_SCRIPTS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "d3js.org",
  "cdn.plot.ly",
  "cdn.datatables.net",
  "code.highcharts.com",
  "www.gstatic.com",
  "ajax.googleapis.com",
  "code.jquery.com",
  "cdn.tailwindcss.com",
  "cdn.bokeh.org",
  "cdn.rawgit.com",
  "raw.githubusercontent.com",
];

const ALLOWED_STYLES = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "d3js.org",
  "cdn.datatables.net",
  "fonts.googleapis.com",
  "cdn.tailwindcss.com",
  "netdna.bootstrapcdn.com",
];

function getBlockedDomains(html) {
  if (!html) return [];
  const blocked = new Set();

  const doc = new DOMParser().parseFromString(html, "text/html");

  // Scripts: <script src="...">
  doc.querySelectorAll("script[src]").forEach((el) => {
    checkBlocked(el.getAttribute("src"), ALLOWED_SCRIPTS, "script", blocked);
  });

  // Stylesheets: <link> where rel token list includes "stylesheet"
  doc.querySelectorAll("link[href]").forEach((el) => {
    const rel = (el.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    if (rel.includes("stylesheet")) {
      checkBlocked(el.getAttribute("href"), ALLOWED_STYLES, "style", blocked);
    }
  });

  return [...blocked];
}

function checkBlocked(raw, allowedList, label, blocked) {
  if (!raw) return;
  try {
    const url = raw.startsWith("//") ? "https:" + raw : raw;
    const parsed = new URL(url, "https://placeholder.invalid");
    // Only external (absolute) URLs matter
    if (parsed.hostname === "placeholder.invalid") return;
    if (parsed.protocol !== "https:") {
      blocked.add(`${parsed.hostname} (${label}, http not allowed)`);
      return;
    }
    if (!allowedList.includes(parsed.hostname)) {
      blocked.add(`${parsed.hostname} (${label})`);
    }
  } catch (_) { /* malformed URL — skip */ }
}

function App() {
  const [htmlContent, setHtmlContent] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [iframeHeight, setIframeHeight] = useState(200);
  const [heightInput, setHeightInput] = useState("");
  const [sandboxFlags] = useState("allow-scripts allow-same-origin allow-popups");
  const [showToolbar, setShowToolbar] = useState(false);
  const [viewModeToolbar, setViewModeToolbar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isLivePage, setIsLivePage] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [blockedDomains, setBlockedDomains] = useState([]);

  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);
  const contentHeightRef = useRef(0);
  const loadVersionRef = useRef(0);

  useEffect(() => {
    async function init() {
      try {
        const context = await view.getContext();
        const editing = context?.extension?.isEditing === true;
        const livePage = context?.extension?.content?.subtype === "live";
        setIsEditing(editing);
        setIsLivePage(livePage);

        const saved = await invoke("getSavedAttachment");
        const atts = await invoke("getAttachments");
        setAttachments(atts);

        if (saved?.height) {
          setIframeHeight(saved.height);
          setHeightInput(String(saved.height));
        }

        const hasFile = !!(saved?.attachmentId || atts.length === 1);
        if (editing && !livePage) {
          setShowToolbar(true);
        } else {
          setShowToolbar(!hasFile);
        }

        if (saved?.attachmentId) {
          setSelectedAttachment(saved.attachmentId);
          await loadContent(saved.attachmentId);
        } else if (atts.length === 1) {
          setSelectedAttachment(atts[0].id);
          await saveSelection(atts[0].id, atts[0].title, null);
          await loadContent(atts[0].id);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === "htmlRendererHeight" && event.data.height > 0) {
        contentHeightRef.current = event.data.height;
        if (!heightInput) {
          const autoHeight = Math.max(MIN_HEIGHT, event.data.height);
          setIframeHeight(autoHeight > DEFAULT_HEIGHT ? DEFAULT_HEIGHT : autoHeight);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [heightInput]);

  const getEnhancedHtml = (html) => {
    const heightScript = '<script>(function(){function r(){var h=Math.max(document.body.scrollHeight,document.body.offsetHeight,document.documentElement.scrollHeight,document.documentElement.offsetHeight);window.parent.postMessage({type:"htmlRendererHeight",height:h},"*")}if(document.readyState==="complete")r();else window.addEventListener("load",r);new MutationObserver(function(){setTimeout(r,50)}).observe(document.body,{childList:true,subtree:true,attributes:true});window.addEventListener("resize",r)})()<\/script>';
    if (html.includes("</body>")) {
      return html.replace("</body>", heightScript + "</body>");
    }
    return html + heightScript;
  };

  const loadContent = async (attachmentId) => {
    const currentVersion = ++loadVersionRef.current;

    try {
      setLoading(true);
      setError(null);

      const first = await invoke("getAttachmentContent", { attachmentId, offset: 0 });
      if (loadVersionRef.current !== currentVersion) return;

      if (first.done) {
        setHtmlContent(first.html);
        setBlockedDomains(getBlockedDomains(first.html));
        return;
      }

      const chunks = [first.html];
      let offset = first.nextOffset || first.html.length;
      const expectedVersion = first.version;

      while (offset < first.totalSize) {
        const next = await invoke("getAttachmentContent", { attachmentId, offset });
        if (loadVersionRef.current !== currentVersion) return;

        if (expectedVersion != null && next.version != null && next.version !== expectedVersion) {
          setError("File was updated during loading. Please retry.");
          return;
        }

        chunks.push(next.html);
        offset = next.nextOffset || (offset + next.html.length);
        if (next.done) break;
      }

      if (loadVersionRef.current !== currentVersion) return;
      const fullHtml = chunks.join("");
      setHtmlContent(fullHtml);
      setBlockedDomains(getBlockedDomains(fullHtml));
    } catch (err) {
      if (loadVersionRef.current !== currentVersion) return;
      setError("Failed to load attachment: " + err.message);
    } finally {
      if (loadVersionRef.current === currentVersion) {
        setLoading(false);
      }
    }
  };

  const saveSelection = async (attachmentId, title, height) => {
    await invoke("saveSelectedAttachment", { attachmentId, title, height });
  };

  const handleAttachmentChange = async (e) => {
    const attId = e.target.value;
    setSelectedAttachment(attId);
    if (attId) {
      const att = attachments.find((a) => a.id === attId);
      await saveSelection(attId, att?.title || "", null);
      await loadContent(attId);
      if (isLivePage && !isEditing) {
        setShowToolbar(false);
      }
    } else {
      setHtmlContent(null);
      setBlockedDomains([]);
    }
  };

  const handleHeightChange = (e) => {
    const val = e.target.value;
    setHeightInput(val);
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= MIN_HEIGHT) {
      setIframeHeight(num);
    } else if (val === "" || val === "0") {
      setIframeHeight(Math.max(MIN_HEIGHT, contentHeightRef.current || DEFAULT_HEIGHT));
    }
  };

  const handleHeightBlur = async () => {
    const num = parseInt(heightInput, 10);
    const finalHeight = (!isNaN(num) && num >= MIN_HEIGHT) ? num : null;
    if (selectedAttachment) {
      const att = attachments.find((a) => a.id === selectedAttachment);
      await saveSelection(selectedAttachment, att?.title || "", finalHeight);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await invoke("uploadAttachment", {
        filename: file.name,
        contentBase64: base64,
      });

      setSelectedAttachment(result.id);
      await saveSelection(result.id, result.title, null);

      const atts = await invoke("getAttachments");
      setAttachments(atts);

      await loadContent(result.id);

      if (isLivePage && !isEditing) {
        setShowToolbar(false);
      }
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openFullView = () => {
    if (!selectedAttachment) return;
    const modal = new Modal({
      resource: 'fullview',
      size: 'fullscreen',
      context: {
        attachmentId: selectedAttachment,
      },
    });
    modal.open();
  };

  if (loading && !htmlContent) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        {showToolbar && (
          <div style={styles.toolbar}>
            <label style={styles.uploadLabel}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileUpload}
                style={styles.fileInput}
              />
              Upload HTML
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {(showToolbar || viewModeToolbar || !selectedAttachment) && (
        <div style={styles.toolbar}>
          {attachments.length > 1 && (
            <select
              value={selectedAttachment || ""}
              onChange={handleAttachmentChange}
              style={styles.select}
            >
              <option value="">-- Select --</option>
              {attachments.map((att) => (
                <option key={att.id} value={att.id}>
                  {att.title}
                </option>
              ))}
            </select>
          )}
          <label style={styles.uploadLabel}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              onChange={handleFileUpload}
              style={styles.fileInput}
              disabled={uploading}
            />
            {uploading ? "Uploading..." : "Upload HTML"}
          </label>
          <span style={styles.separator} />
          <label style={styles.heightLabel}>H:</label>
          <input
            type="number"
            value={heightInput}
            onChange={handleHeightChange}
            onBlur={handleHeightBlur}
            placeholder="auto"
            min={MIN_HEIGHT}
            max={9999}
            style={styles.heightInput}
          />
          <span style={styles.heightUnit}>px</span>
          <button
            onClick={openFullView}
            style={styles.expandToolbarButton}
            title="Full screen"
            aria-label="Full screen"
            disabled={!selectedAttachment}
          >
            ⛶
          </button>
        </div>
      )}

      {showToolbar && blockedDomains.length > 0 && (
        <div style={styles.warning}>
          ⚠️ CSP blocked domains: {blockedDomains.join(", ")}
          <div style={styles.warningHint}>
            These external resources may not load. Add them to manifest.yml to allow.
          </div>
        </div>
      )}

      {!htmlContent && !loading && (
        <div style={styles.empty}>
          No HTML attachment selected. Upload or select an HTML file.
        </div>
      )}

      {htmlContent && (
        <div style={{ position: "relative" }}>
          <iframe
            ref={iframeRef}
            srcDoc={getEnhancedHtml(htmlContent)}
            sandbox={sandboxFlags}
            style={{
              ...styles.iframe,
              height: iframeHeight + "px",
              borderRadius: (showToolbar || viewModeToolbar) ? "0 0 3px 3px" : "3px",
            }}
            title="HTML Attachment"
          />
          {!showToolbar && (
            <>
              <button
                onClick={() => setViewModeToolbar((v) => !v)}
                style={{
                  ...styles.expandButton,
                  right: "44px",
                }}
                title="Edit settings"
                aria-label="Edit settings"
                aria-expanded={viewModeToolbar}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{transform: "scaleX(-1)"}}>
                  <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/>
                </svg>
              </button>
              <button
                onClick={openFullView}
                style={styles.expandButton}
                title="Full screen"
                aria-label="Full screen"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 10v4h4M14 6V2h-4M2 6V2h4M14 10v4h-4"/>
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  loading: {
    padding: "16px",
    textAlign: "center",
    color: "#6B778C",
    fontSize: "14px",
  },
  error: {
    padding: "12px 16px",
    backgroundColor: "#FFEBE6",
    border: "1px solid #FF5630",
    borderRadius: "3px",
    color: "#BF2600",
    fontSize: "14px",
    marginBottom: "8px",
  },
  warning: {
    padding: "8px 12px",
    backgroundColor: "#FFFAE6",
    border: "1px solid #FF991F",
    borderRadius: "3px",
    color: "#974F0C",
    fontSize: "12px",
    marginBottom: "4px",
  },
  warningHint: {
    fontSize: "11px",
    color: "#8C6D1F",
    marginTop: "2px",
  },
  empty: {
    padding: "20px",
    textAlign: "center",
    color: "#6B778C",
    fontSize: "14px",
    backgroundColor: "#F4F5F7",
    borderRadius: "3px",
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 8px",
    backgroundColor: "#F4F5F7",
    borderRadius: "3px 3px 0 0",
    border: "1px solid #DFE1E6",
    borderBottom: "none",
  },
  select: {
    padding: "4px 8px",
    fontSize: "13px",
    borderRadius: "3px",
    border: "1px solid #DFE1E6",
    backgroundColor: "#fff",
    maxWidth: "200px",
  },
  uploadLabel: {
    padding: "4px 10px",
    fontSize: "12px",
    color: "#0052CC",
    border: "1px solid #0052CC",
    borderRadius: "3px",
    fontWeight: 500,
    cursor: "pointer",
    display: "inline-block",
  },
  fileInput: {
    display: "none",
  },
  separator: {
    flex: 1,
  },
  heightLabel: {
    fontSize: "12px",
    color: "#6B778C",
  },
  heightInput: {
    width: "55px",
    padding: "3px 6px",
    fontSize: "12px",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    textAlign: "right",
  },
  heightUnit: {
    fontSize: "11px",
    color: "#6B778C",
  },
  iframe: {
    width: "100%",
    border: "1px solid #DFE1E6",
    display: "block",
    overflow: "auto",
  },
  expandButton: {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    cursor: "pointer",
    fontSize: "16px",
    color: "#42526E",
    lineHeight: 1,
  },
  expandToolbarButton: {
    marginLeft: "8px",
    padding: "4px 8px",
    fontSize: "14px",
    color: "#42526E",
    backgroundColor: "#fff",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    cursor: "pointer",
    lineHeight: 1,
  },
};

export default App;
