import Resolver from "@forge/resolver";
import api, { route, assumeTrustedRoute } from "@forge/api";

const resolver = new Resolver();

/**
 * List all HTML attachments on the current page (v2 API)
 */
resolver.define("getAttachments", async ({ payload, context }) => {
  const pageId = context.extension.content.id;

  const response = await api.asUser().requestConfluence(
    route`/wiki/api/v2/pages/${pageId}/attachments?limit=100&status=current`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch attachments: ${response.status} - ${text}`);
  }

  const data = await response.json();

  // Filter to HTML files only
  const htmlAttachments = data.results.filter((att) => {
    const mediaType = att.mediaType || "";
    const filename = att.title || "";
    return (
      mediaType === "text/html" ||
      mediaType === "application/xhtml+xml" ||
      filename.endsWith(".html") ||
      filename.endsWith(".htm")
    );
  });

  return htmlAttachments.map((att) => ({
    id: att.id,
    title: att.title,
    mediaType: att.mediaType,
    downloadUrl: att.downloadLink,
    version: att.version?.number,
  }));
});

/**
 * Fetch the HTML content of a specific attachment (v2 API)
 */
resolver.define("getAttachmentContent", async ({ payload, context }) => {
  const { attachmentId } = payload;

  const metaResponse = await api.asUser().requestConfluence(
    route`/wiki/api/v2/attachments/${attachmentId}`,
    { headers: { Accept: "application/json" } }
  );

  if (!metaResponse.ok) {
    const text = await metaResponse.text();
    throw new Error(`Failed to fetch attachment metadata: ${metaResponse.status} - ${text}`);
  }

  const meta = await metaResponse.json();
  const pageId = meta.pageId;
  const title = meta.title;

  if (!pageId || !title) {
    throw new Error("Attachment metadata missing pageId or title");
  }

  const contentResponse = await api.asUser().requestConfluence(
    route`/wiki/rest/api/content/${pageId}/child/attachment/${attachmentId}/download`,
    { headers: { Accept: "text/html, */*" } }
  );

  if (!contentResponse.ok) {
    throw new Error(`Failed to download attachment: ${contentResponse.status}`);
  }

  const htmlContent = await contentResponse.text();
  return { html: htmlContent, title };
});

/**
 * Get macro configuration
 */
resolver.define("getConfig", async ({ context }) => {
  const config = context.extension.config || {};
  return {
    attachmentId: config.attachmentId || null,
    height: config.height || 0,
    sandboxPermissions: config.sandboxPermissions || "allow-scripts",
  };
});

export const handler = resolver.getDefinitions();
