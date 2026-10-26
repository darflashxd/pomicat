/**
 * SafeShare-AI — Chat id from a conversation URL.
 *
 * One vault and one placeholder map are kept per chat. The id has to be exact: if two different
 * chats map to the same string, a value protected in one chat can be shown in another.
 *
 * ChatGPT used to use plain UUIDs. Since Oct 2026 a new chat can be addressed as
 * "local-chatgpt:<uuid>" (the colon arrives percent-encoded as %3A), so the whole path segment
 * after the site's marker is the id, decoded.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SafeShareChatId = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MARKER = /(?:\/c\/|\/chat\/|\/a\/chat\/s\/)([^/?#]+)/;

  function of(url) {
    const match = String(url || "").match(MARKER);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch (_) {
      return match[1];
    }
  }

  /**
   * ChatGPT first writes "local-chatgpt:<id>" and replaces it with the server id a moment later.
   * A move from such an id to the real one is the same conversation, not a new chat.
   */
  function isTemporary(id) {
    return typeof id === "string" && /^local-/i.test(id);
  }

  return { of, isTemporary };
});
