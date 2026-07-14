import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";

const resolver = new Resolver();

/**
 * List all HTML attachments on the current page
 */
resolver.define("getAttachments", async ({ payload, context }) => {
  const pageId = context.extension.content.id;

  const response = await api.asUser().requestConfluence(
    route`/wiki/rest/api/content/${pageId}/child/attachment?expand=version,metadata.mediaType&limit=100`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch attachments: ${response.status} - ${text}`);
  }

  const data = await response.json();

  // Filter to HTML files only
  const htmlAttachments = data.results.filter((att) => {
    const mediaType = att.metadata?.mediaType || "";
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
    mediaType: att.metadata?.mediaType,
    downloadUrl: att._links?.download,
    version: att.version?.number,
  }));
});

/**
 * Fetch the HTML content of a specific attachment
 */
resolver.define("getAttachmentContent", async ({ payload, context }) => {
  const { attachmentId } = payload;
  const pageId = context.extension.content.id;

  // First get the attachment metadata to find the download link
  const metaResponse = await api.asUser().requestConfluence(
    route`/wiki/rest/api/content/${attachmentId}?expand=_links`,
    { headers: { Accept: "application/json" } }
  );

  if (!metaResponse.ok) {
    throw new Error(`Failed to fetch attachment metadata: ${metaResponse.status}`);
  }

  const meta = await metaResponse.json();
  const downloadPath = meta._links?.download;

  if (!downloadPath) {
    throw new Error("Download link not found for attachment");
  }

  // Fetch the actual HTML content
  const contentResponse = await api.asUser().requestConfluence(
    route`/wiki${downloadPath}`,
    { headers: { Accept: "text/html, */*" } }
  );

  if (!contentResponse.ok) {
    throw new Error(`Failed to download attachment: ${contentResponse.status}`);
  }

  const htmlContent = await contentResponse.text();
  return { html: htmlContent, title: meta.title };
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
