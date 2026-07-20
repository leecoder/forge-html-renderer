import Resolver from "@forge/resolver";
import api, { route } from "@forge/api";
import { kvs } from "@forge/kvs";

const resolver = new Resolver();

resolver.define("getAttachments", async ({ payload, context }) => {
  const pageId = context.extension.content.id;
  const allAttachments = [];
  let cursor = null;

  do {
    const attachmentsPath = cursor
      ? route`/wiki/api/v2/pages/${pageId}/attachments?limit=100&status=current&cursor=${cursor}`
      : route`/wiki/api/v2/pages/${pageId}/attachments?limit=100&status=current`;
    const response = await api.asUser().requestConfluence(
      attachmentsPath,
      { headers: { Accept: "application/json" } }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch attachments: ${response.status} - ${text}`);
    }

    const data = await response.json();
    allAttachments.push(...(data.results || []));
    cursor = data._links?.next ? new URLSearchParams(data._links.next.split("?")[1]).get("cursor") : null;
  } while (cursor);

  const htmlAttachments = allAttachments.filter((att) => {
    const mediaType = att.mediaType || "";
    const filename = (att.title || "").toLowerCase();
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

resolver.define("getAttachmentContent", async ({ payload, context }) => {
  const MAX_CHUNK_BYTES = 3.5 * 1024 * 1024;
  const MIN_CHUNK_BYTES = 1024;

  let { attachmentId, offset = 0, chunkSize } = payload;

  offset = Number(offset);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  chunkSize = chunkSize != null ? Number(chunkSize) : MAX_CHUNK_BYTES;
  if (!Number.isFinite(chunkSize) || chunkSize < MIN_CHUNK_BYTES) chunkSize = MIN_CHUNK_BYTES;
  if (chunkSize > MAX_CHUNK_BYTES) chunkSize = MAX_CHUNK_BYTES;

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
  const version = meta.version?.number || null;

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
  const totalBytes = Buffer.byteLength(htmlContent, "utf-8");

  if (totalBytes <= chunkSize && offset === 0) {
    return { html: htmlContent, title, totalSize: totalBytes, done: true, version };
  }

  const buf = Buffer.from(htmlContent, "utf-8");
  let sliceEnd = Math.min(offset + chunkSize, buf.length);
  while (sliceEnd > offset && sliceEnd < buf.length && (buf[sliceEnd] & 0xc0) === 0x80) {
    sliceEnd -= 1;
  }
  const chunk = buf.slice(offset, sliceEnd).toString("utf-8");
  const nextOffset = sliceEnd;
  const done = nextOffset >= totalBytes;

  return { html: chunk, title, totalSize: totalBytes, offset, nextOffset, done, version };
});

resolver.define("getSavedAttachment", async ({ payload, context }) => {
  const macroId = context.extension.macro?.id || context.localId || context.extension.content.id;
  const saved = await kvs.get(`macro-${macroId}`);
  return saved || null;
});

resolver.define("saveSelectedAttachment", async ({ payload, context }) => {
  const { attachmentId, title, height } = payload;
  const macroId = context.extension.macro?.id || context.localId || context.extension.content.id;
  const data = { attachmentId, title };
  if (height !== null && height !== undefined) data.height = height;
  await kvs.set(`macro-${macroId}`, data);
  return { success: true };
});

resolver.define("uploadAttachment", async ({ payload, context }) => {
  const { filename, contentBase64 } = payload;
  const pageId = context.extension.content.id;

  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const binaryContent = Buffer.from(contentBase64, "base64");

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: text/html\r\n\r\n`
    ),
    binaryContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await api.asUser().requestConfluence(
    route`/wiki/rest/api/content/${pageId}/child/attachment`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "X-Atlassian-Token": "nocheck",
      },
      body,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const att = data.results?.[0] || data;
  return { id: att.id, title: att.title };
});

resolver.define("getFullViewUrl", async ({ payload, context }) => {
  const { attachmentId } = payload;
  const pageId = context.extension.content.id;
  return `/wiki/rest/api/content/${pageId}/child/attachment/${attachmentId}/download`;
});

export const handler = resolver.getDefinitions();
