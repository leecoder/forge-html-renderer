import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke, view } from "@forge/bridge";

const RESIZE_HANDLE_HEIGHT = 8;
const MIN_HEIGHT = 100;
const DEFAULT_HEIGHT = 400;

/**
 * Main App component - renders HTML attachment in a sandboxed iframe
 * with auto-height detection and manual resize handle.
 */
function App() {
  const [htmlContent, setHtmlContent] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [iframeHeight, setIframeHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [sandboxFlags, setSandboxFlags] = useState("allow-scripts");
  const [isEditMode, setIsEditMode] = useState(false);

  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Load config and attachments on mount
  useEffect(() => {
    async function init() {
      try {
        const context = await view.getContext();
        const renderMode = context?.extension?.renderMode;
        setIsEditMode(renderMode === "edit");

        const cfg = await invoke("getConfig");
        setConfig(cfg);
        setSandboxFlags(cfg.sandboxPermissions || "allow-scripts");

        if (cfg.height > 0) {
          setIframeHeight(cfg.height);
        }

        const atts = await invoke("getAttachments");
        setAttachments(atts);

        // If config has a selected attachment, load it
        if (cfg.attachmentId) {
          setSelectedAttachment(cfg.attachmentId);
          await loadContent(cfg.attachmentId);
        } else if (atts.length === 1) {
          // Auto-select if only one HTML attachment
          setSelectedAttachment(atts[0].id);
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
      await loadContent(attId);
    } else {
      setHtmlContent(null);
    }
  };

  // Auto-height: listen for postMessage from iframe content
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === "resize" && event.data.height) {
        const configHeight = config?.height || 0;
        if (configHeight === 0) {
          // Auto mode
          setIframeHeight(Math.max(MIN_HEIGHT, event.data.height));
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [config]);

  // Inject auto-height reporting script into HTML content
  const getEnhancedHtml = useCallback(() => {
    if (!htmlContent) return "";

    const heightScript = `
      <script>
        (function() {
          function reportHeight() {
            var height = Math.max(
              document.body.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.scrollHeight,
              document.documentElement.offsetHeight
            );
            window.parent.postMessage({ type: 'resize', height: height + 20 }, '*');
          }

          // Report on load
          if (document.readyState === 'complete') {
            reportHeight();
          } else {
            window.addEventListener('load', reportHeight);
          }

          // Report on mutations (dynamic content)
          var observer = new MutationObserver(function() {
            setTimeout(reportHeight, 100);
          });
          observer.observe(document.body, {
            childList: true, subtree: true, attributes: true
          });

          // Report on resize
          window.addEventListener('resize', reportHeight);

          // Periodic check for first 5 seconds (lazy-loaded content)
          var checks = 0;
          var interval = setInterval(function() {
            reportHeight();
            checks++;
            if (checks > 10) clearInterval(interval);
          }, 500);
        })();
      </script>
    `;

    // Inject script before </body> or at the end
    if (htmlContent.includes("</body>")) {
      return htmlContent.replace("</body>", `${heightScript}</body>`);
    }
    return htmlContent + heightScript;
  }, [htmlContent]);

  // Manual resize handle
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = iframeHeight;
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const delta = e.clientY - startYRef.current;
      const newHeight = Math.max(MIN_HEIGHT, startHeightRef.current + delta);
      setIframeHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Render
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
    <div ref={containerRef} style={styles.container}>
      {/* Attachment selector (shown when no config or multiple attachments) */}
      {!config?.attachmentId && attachments.length > 1 && (
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

      {/* No HTML attachments found */}
      {attachments.length === 0 && !loading && (
        <div style={styles.empty}>
          No HTML attachments found on this page. Upload an .html file as a page attachment first.
        </div>
      )}

      {/* Rendered iframe */}
      {htmlContent && (
        <>
          <iframe
            ref={iframeRef}
            srcDoc={getEnhancedHtml()}
            sandbox={sandboxFlags}
            style={{
              ...styles.iframe,
              height: `${iframeHeight}px`,
            }}
            title="HTML Attachment"
          />
          {/* Resize handle */}
          <div
            style={{
              ...styles.resizeHandle,
              cursor: isResizing ? "ns-resize" : "ns-resize",
            }}
            onMouseDown={handleMouseDown}
          >
            <div style={styles.resizeBar} />
          </div>
          {/* Height indicator while resizing */}
          {isResizing && (
            <div style={styles.heightIndicator}>{Math.round(iframeHeight)}px</div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: "100%",
    position: "relative",
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
    borderRadius: "3px",
    display: "block",
  },
  resizeHandle: {
    width: "100%",
    height: `${RESIZE_HANDLE_HEIGHT}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F5F7",
    borderBottomLeftRadius: "3px",
    borderBottomRightRadius: "3px",
    borderLeft: "1px solid #DFE1E6",
    borderRight: "1px solid #DFE1E6",
    borderBottom: "1px solid #DFE1E6",
    userSelect: "none",
  },
  resizeBar: {
    width: "40px",
    height: "3px",
    backgroundColor: "#C1C7D0",
    borderRadius: "2px",
  },
  heightIndicator: {
    position: "absolute",
    bottom: "16px",
    right: "8px",
    padding: "2px 6px",
    backgroundColor: "rgba(0,0,0,0.7)",
    color: "#fff",
    fontSize: "11px",
    borderRadius: "3px",
  },
};

export default App;
