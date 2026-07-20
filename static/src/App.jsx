import React, { useState, useEffect, useRef } from "react";
import { invoke, view } from "@forge/bridge";

const MIN_HEIGHT = 80;
const DEFAULT_HEIGHT = 400;

function App() {
  const [htmlContent, setHtmlContent] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [iframeHeight, setIframeHeight] = useState(200);
  const [heightInput, setHeightInput] = useState("");
  const [sandboxFlags] = useState("allow-scripts allow-same-origin allow-popups");
  const [showToolbar, setShowToolbar] = useState(false);
  const [uploading, setUploading] = useState(false);

  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);
  const contentHeightRef = useRef(0);
  const blobUrlRef = useRef(null);

  useEffect(() => {
    if (!htmlContent) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      return;
    }

    const enhanced = getEnhancedHtml(htmlContent);
    const blob = new Blob([enhanced], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
    }
    blobUrlRef.current = url;
    setBlobUrl(url);
  }, [htmlContent]);

  useEffect(() => {
    async function init() {
      try {
        const context = await view.getContext();
        const isEditing = context?.extension?.isEditing === true;
        setShowToolbar(isEditing);

        const saved = await invoke("getSavedAttachment");
        const atts = await invoke("getAttachments");
        setAttachments(atts);

        if (saved?.height) {
          setIframeHeight(saved.height);
          setHeightInput(String(saved.height));
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
    try {
      setLoading(true);
      setError(null);

      const first = await invoke("getAttachmentContent", { attachmentId, offset: 0 });

      if (first.done) {
        setHtmlContent(first.html);
        return;
      }

      const chunks = [first.html];
      let offset = first.html.length;
      const chunkSize = 4 * 1024 * 1024;

      while (offset < first.totalSize) {
        const next = await invoke("getAttachmentContent", { attachmentId, offset, chunkSize });
        chunks.push(next.html);
        offset += next.html.length;
        if (next.done) break;
      }

      setHtmlContent(chunks.join(""));
    } catch (err) {
      setError("Failed to load attachment: " + err.message);
    } finally {
      setLoading(false);
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
    } else {
      setHtmlContent(null);
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
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {showToolbar && (
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
        </div>
      )}

      {!blobUrl && !loading && (
        <div style={styles.empty}>
          No HTML attachment selected. Upload or select an HTML file.
        </div>
      )}

      {blobUrl && (
        <iframe
          ref={iframeRef}
          src={blobUrl}
          sandbox={sandboxFlags}
          style={{
            ...styles.iframe,
            height: iframeHeight + "px",
            borderRadius: showToolbar ? "0 0 3px 3px" : "3px",
          }}
          title="HTML Attachment"
        />
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
};

export default App;
