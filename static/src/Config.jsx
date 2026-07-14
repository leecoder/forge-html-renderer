import React, { useState, useEffect } from "react";
import { invoke, view } from "@forge/bridge";

/**
 * Configuration panel component shown in the macro editor.
 * Allows users to pick an HTML attachment and set display options.
 */
function Config({ onSave }) {
  const [attachments, setAttachments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [height, setHeight] = useState(0);
  const [sandboxPermissions, setSandboxPermissions] = useState("allow-scripts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleSubmit = () => {
    view.submit({
      attachmentId: selectedId,
      height,
      sandboxPermissions,
    });
  };

  const handleClose = () => {
    view.close();
  };

  useEffect(() => {
    async function load() {
      try {
        const atts = await invoke("getAttachments");
        setAttachments(atts);

        const cfg = await invoke("getConfig");
        if (cfg.attachmentId) setSelectedId(cfg.attachmentId);
        if (cfg.height) setHeight(cfg.height);
        if (cfg.sandboxPermissions) setSandboxPermissions(cfg.sandboxPermissions);
      } catch (err) {
        setError(err.message || "Failed to load configuration");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return <div style={styles.loading}>Loading attachments...</div>;
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <div style={styles.buttonRow}>
          <button onClick={handleClose} style={styles.cancelButton}>
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.field}>
        <label style={styles.label}>HTML Attachment</label>
        {attachments.length === 0 ? (
          <div style={styles.hint}>
            No HTML attachments found. Upload a .html file to this page first.
          </div>
        ) : (
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={styles.select}
          >
            <option value="">-- Select --</option>
            {attachments.map((att) => (
              <option key={att.id} value={att.id}>
                {att.title} (v{att.version})
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Height (px)</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(parseInt(e.target.value, 10) || 0)}
          min={0}
          placeholder="0 = auto"
          style={styles.input}
        />
        <div style={styles.hint}>Set to 0 for automatic height based on content.</div>
      </div>

      <div style={styles.field}>
        <label style={styles.label}>Sandbox Permissions</label>
        <div style={styles.checkboxGroup}>
          <CheckboxItem
            label="Allow Scripts (JS execution)"
            flag="allow-scripts"
            value={sandboxPermissions}
            onChange={setSandboxPermissions}
          />
          <CheckboxItem
            label="Allow Same Origin"
            flag="allow-same-origin"
            value={sandboxPermissions}
            onChange={setSandboxPermissions}
          />
          <CheckboxItem
            label="Allow Forms"
            flag="allow-forms"
            value={sandboxPermissions}
            onChange={setSandboxPermissions}
          />
          <CheckboxItem
            label="Allow Popups"
            flag="allow-popups"
            value={sandboxPermissions}
            onChange={setSandboxPermissions}
          />
        </div>
        <div style={styles.hint}>
          Controls what the embedded HTML is allowed to do. Enable only what's needed.
        </div>
      </div>

      <div style={styles.buttonRow}>
        <button onClick={handleSubmit} style={styles.submitButton}>
          Save
        </button>
        <button onClick={handleClose} style={styles.cancelButton}>
          Close
        </button>
      </div>
    </div>
  );
}

function CheckboxItem({ label, flag, value, onChange }) {
  const flags = value.split(" ").filter(Boolean);
  const checked = flags.includes(flag);

  const toggle = () => {
    if (checked) {
      onChange(flags.filter((f) => f !== flag).join(" "));
    } else {
      onChange([...flags, flag].join(" "));
    }
  };

  return (
    <label style={styles.checkbox}>
      <input type="checkbox" checked={checked} onChange={toggle} />
      <span style={styles.checkboxLabel}>{label}</span>
    </label>
  );
}

const styles = {
  container: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  loading: {
    padding: "16px",
    color: "#6B778C",
    fontSize: "14px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#172B4D",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  select: {
    padding: "8px 12px",
    fontSize: "14px",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    backgroundColor: "#FAFBFC",
  },
  input: {
    padding: "8px 12px",
    fontSize: "14px",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    backgroundColor: "#FAFBFC",
    width: "120px",
  },
  hint: {
    fontSize: "12px",
    color: "#6B778C",
    marginTop: "2px",
  },
  checkboxGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    marginTop: "4px",
  },
  checkbox: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    fontSize: "14px",
  },
  checkboxLabel: {
    color: "#172B4D",
  },
  buttonRow: {
    display: "flex",
    gap: "8px",
    marginTop: "8px",
  },
  submitButton: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#fff",
    backgroundColor: "#0052CC",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
  },
  cancelButton: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    color: "#172B4D",
    backgroundColor: "#F4F5F7",
    border: "1px solid #DFE1E6",
    borderRadius: "3px",
    cursor: "pointer",
  },
  error: {
    padding: "12px 16px",
    backgroundColor: "#FFEBE6",
    border: "1px solid #FF5630",
    borderRadius: "3px",
    color: "#BF2600",
    fontSize: "14px",
  },
};

export default Config;
