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
  const [downloadUrl, setDownloadUrl] = useState(null);

  const iframeRef = useRef(null);

  useEffect(() => {
    async function init() {
      try {
        const atts = await invoke("getAttachments");
        setAttachments(atts);

        if (atts.length === 1) {
          setSelectedAttachment(atts[0].id);
          setDownloadUrl(atts[0].downloadUrl);
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

  const handleAttachmentChange = async (e) => {
    const attId = e.target.value;
    setSelectedAttachment(attId);
    if (attId) {
      const att = attachments.find((a) => a.id === attId);
      setDownloadUrl(att?.downloadUrl || null);
      await loadContent(attId);
    } else {
      setHtmlContent(null);
      setDownloadUrl(null);
    }
  };

  const openInNewWindow = async () => {
    const url = await invoke("getAttachmentDownloadUrl", { attachmentId: selectedAttachment });
    if (url) {
      window.open(url, "_blank");
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
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {attachments.length > 1 && (
        <div style={styles.selector}>
          <label style={styles.label}>HTML Attachment: </label>
          <select
            value={selectedAttachment || ""}
            onChange={handleAttachmentChange}
            style={styles.select}
          >
            <option value="">-- Select an attachment --</option>
            {attachments.map((att) => (
              <option key={att.id} value={att.id}>
                {att.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {attachments.length === 0 && !loading && (
        <div style={styles.empty}>
          No HTML attachments found on this page. Upload an .html file as a page attachment first.
        </div>
      )}

      {htmlContent && (
        <>
          <div style={styles.toolbar}>
            <button onClick={openInNewWindow} style={styles.openButton}>
              ↗ Open in new window
            </button>
          </div>
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
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  },
  empty: {
    padding: "20px",
    textAlign: "center",
    color: "#6B778C",
    fontSize: "14px",
    backgroundColor: "#F4F5F7",
    borderRadius: "3px",
  },
  selector: {
    padding: "8px 0",
    marginBottom: "8px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 500,
    color: "#172B4D",
  },
  select: {
    padding: "6px 12px",
    fontSize: "14px",
    borderRadius: "3px",
    border: "1px solid #DFE1E6",
    backgroundColor: "#FAFBFC",
    flex: 1,
    maxWidth: "400px",
  },
  iframe: {
    width: "100%",
    border: "1px solid #DFE1E6",
    borderRadius: "0 0 3px 3px",
    display: "block",
    overflow: "auto",
  },
  toolbar: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "4px 8px",
    backgroundColor: "#F4F5F7",
    borderRadius: "3px 3px 0 0",
    border: "1px solid #DFE1E6",
    borderBottom: "none",
  },
  openButton: {
    padding: "4px 10px",
    fontSize: "12px",
    color: "#0052CC",
    backgroundColor: "transparent",
    border: "1px solid #0052CC",
    borderRadius: "3px",
    cursor: "pointer",
    fontWeight: 500,
  },
};

export default App;
