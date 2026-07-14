import React, { useState, useEffect, useRef } from "react";
import { invoke, view } from "@forge/bridge";

const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;

function App() {
  const [htmlContent, setHtmlContent] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [iframeHeight, setIframeHeight] = useState(null);
  const [sandboxFlags] = useState("allow-scripts allow-same-origin");
  const [isEditMode, setIsEditMode] = useState(false);
  const [uploading, setUploading] = useState(false);

  const iframeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function init() {
      try {
        const context = await view.getContext();
        const mode = context?.extension?.renderMode;
        const isInEditor = window.location.href.includes("/edit-v2/") || window.location.href.includes("/edit/");
        setIsEditMode(isInEditor);

        const saved = await invoke("getSavedAttachment");
        const atts = await invoke("getAttachments");
        setAttachments(atts);

        if (saved?.attachmentId) {
          setSelectedAttachment(saved.attachmentId);
          await loadContent(saved.attachmentId);
        } else if (atts.length === 1) {
          setSelectedAttachment(atts[0].id);
          await saveSelection(atts[0].id, atts[0].title);
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

  const loadContent = async (attachmentId) => {
    try {
      setLoading(true);
      setError(null);
      const result = await invoke("getAttachmentContent", { attachmentId });
      setHtmlContent(result.html);
    } catch (err) {
      setError(`Failed to load attachment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveSelection = async (attachmentId, title) => {
    await invoke("saveSelectedAttachment", { attachmentId, title });
  };

  const handleAttachmentChange = async (e) => {
    const attId = e.target.value;
    setSelectedAttachment(attId);
    if (attId) {
      const att = attachments.find((a) => a.id === attId);
      await saveSelection(attId, att?.title || "");
      await loadContent(attId);
    } else {
      setHtmlContent(null);
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
      await saveSelection(result.id, result.title);

      const atts = await invoke("getAttachments");
      setAttachments(atts);

      await loadContent(result.id);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!htmlContent || !iframeRef.current) return;

    const measureHeight = () => {
      try {
        const doc = iframeRef.current.contentDocument;
        if (doc && doc.body) {
          const height = Math.max(
            doc.body.scrollHeight,
            doc.body.offsetHeight,
            doc.documentElement.scrollHeight,
            doc.documentElement.offsetHeight
          );
          if (height > 0) {
            setIframeHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height + 20)));
          }
        }
      } catch (e) {
        setIframeHeight(MAX_HEIGHT);
      }
    };

    const iframe = iframeRef.current;
    const onLoad = () => {
      measureHeight();
      let checks = 0;
      const interval = setInterval(() => {
        measureHeight();
        checks++;
        if (checks > 10) clearInterval(interval);
      }, 500);
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [htmlContent]);

  if (loading && !htmlContent) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading HTML attachment...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
        {isEditMode && (
          <div style={styles.toolbar}>
            <label style={styles.uploadLabel}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleFileUpload}
                style={styles.fileInput}
              />
              📎 Upload HTML
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {isEditMode && (
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
            {uploading ? "Uploading..." : "📎 Upload HTML"}
          </label>
        </div>
      )}

      {!htmlContent && !loading && (
        <div style={styles.empty}>
          No HTML attachment selected.
          {isEditMode ? " Upload or select an HTML file above." : ""}
        </div>
      )}

      {htmlContent && (
        <iframe
          ref={iframeRef}
          srcDoc={htmlContent}
          sandbox={sandboxFlags}
          style={{
            ...styles.iframe,
            height: iframeHeight ? `${iframeHeight}px` : `${MAX_HEIGHT}px`,
            maxHeight: `${MAX_HEIGHT}px`,
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
    padding: "20px",
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
    maxWidth: "250px",
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
  iframe: {
    width: "100%",
    border: "1px solid #DFE1E6",
    borderRadius: "0 0 3px 3px",
    display: "block",
    overflow: "auto",
  },
};

export default App;
