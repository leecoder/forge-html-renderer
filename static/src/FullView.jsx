import React, { useState, useEffect, useRef } from "react";
import { invoke, view } from "@forge/bridge";

function FullView() {
  const [htmlContent, setHtmlContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const iframeRef = useRef(null);
  const loadVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const context = await view.getContext();
        const attachmentId = context?.extension?.modal?.attachmentId;

        if (!attachmentId) {
          if (!cancelled) {
            setError("No attachment specified.");
            setLoading(false);
          }
          return;
        }

        await loadContent(attachmentId, cancelled);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }
    init();

    return () => { cancelled = true; };
  }, []);

  const loadContent = async (attachmentId, cancelled) => {
    const currentVersion = ++loadVersionRef.current;

    try {
      setLoading(true);
      setError(null);

      const first = await invoke("getAttachmentContent", { attachmentId, offset: 0 });

      if (cancelled || loadVersionRef.current !== currentVersion) return;

      if (first.done) {
        setHtmlContent(first.html);
        setLoading(false);
        return;
      }

      const chunks = [first.html];
      let offset = first.nextOffset || first.html.length;
      const expectedVersion = first.version;

      while (offset < first.totalSize) {
        const next = await invoke("getAttachmentContent", { attachmentId, offset });

        if (cancelled || loadVersionRef.current !== currentVersion) return;

        if (expectedVersion != null && next.version != null && next.version !== expectedVersion) {
          setError("File was updated during loading. Please retry.");
          setLoading(false);
          return;
        }

        chunks.push(next.html);
        offset = next.nextOffset || (offset + next.html.length);
        if (next.done) break;
      }

      if (cancelled || loadVersionRef.current !== currentVersion) return;

      setHtmlContent(chunks.join(""));
    } catch (err) {
      if (cancelled || loadVersionRef.current !== currentVersion) return;
      setError("Failed to load attachment: " + err.message);
    } finally {
      if (!cancelled && loadVersionRef.current === currentVersion) {
        setLoading(false);
      }
    }
  };

  const handleClose = () => {
    view.close();
  };

  if (loading) {
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
        <button onClick={handleClose} style={styles.closeButton}>Close</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={handleClose} style={styles.closeButton}>✕ Close</button>
      </div>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        sandbox="allow-scripts allow-same-origin allow-popups"
        style={styles.iframe}
        title="HTML Full View"
      />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "8px 12px",
    backgroundColor: "#F4F5F7",
    borderBottom: "1px solid #DFE1E6",
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
    margin: "16px",
  },
  closeButton: {
    padding: "6px 12px",
    fontSize: "13px",
    color: "#42526E",
    backgroundColor: "#fff",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    cursor: "pointer",
    fontWeight: 500,
  },
  iframe: {
    flex: 1,
    width: "100%",
    border: "none",
    display: "block",
  },
};

export default FullView;
