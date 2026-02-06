// ─────────────────────────────────────────────────────────────
//  Chainlit-WS — Client-side chat application
//
//  Handles:
//  - WebSocket lifecycle (connect, reconnect, heartbeat)
//  - Conversation CRUD via WS protocol
//  - Message rendering with streaming tokens
//  - Auto-scroll, textarea auto-resize, keyboard shortcuts
// ─────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────────

  let ws = null;
  let sessionId = null;
  let activeConversationId = null;
  let conversations = [];
  let isStreaming = false;
  let currentStreamRequestId = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 1000;
  let pendingCallbacks = new Map(); // requestId -> callback

  // ── DOM References ───────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const conversationListEl = $(".conversation-list");
  const messagesContainer = $(".messages-container");
  const textarea = $(".input-wrapper textarea");
  const sendBtn = $(".btn-send");
  const statusDot = $(".status-dot");
  const statusText = $(".status-text");
  const chatTitle = $(".chat-header .title");
  const newChatBtn = $(".btn-new-chat");

  // ── Utility ──────────────────────────────────────────────────

  function generateId() {
    return "req_" + Math.random().toString(36).slice(2, 12);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /** Simple markdown-like formatting (bold, italic, code, code blocks) */
  function formatContent(text) {
    // Code blocks: ```...```
    text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, function (_m, _lang, code) {
      return '<pre><code>' + escapeHtml(code.trim()) + '</code></pre>';
    });
    // Inline code: `...`
    text = text.replace(/`([^`]+)`/g, function (_m, code) {
      return '<code>' + escapeHtml(code) + '</code>';
    });
    // Bold: **...**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic: *...*
    text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  // ── WebSocket ────────────────────────────────────────────────

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${location.host}/ws`;

    setStatus("connecting");
    ws = new WebSocket(url);

    ws.onopen = function () {
      reconnectAttempts = 0;
      setStatus("connected");
      console.log("[WS] Connected");
    };

    ws.onmessage = function (event) {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = function (event) {
      console.log("[WS] Closed:", event.code, event.reason);
      setStatus("disconnected");
      scheduleReconnect();
    };

    ws.onerror = function (err) {
      console.error("[WS] Error:", err);
    };
  }

  function scheduleReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("disconnected");
      console.error("[WS] Max reconnect attempts reached");
      return;
    }

    const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
    setTimeout(connect, delay);
  }

  function sendMessage(type, payload, callback) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const requestId = generateId();
    const msg = { type, requestId, payload };

    if (callback) {
      pendingCallbacks.set(requestId, callback);
    }

    ws.send(JSON.stringify(msg));
    return requestId;
  }

  function setStatus(state) {
    statusDot.className = "status-dot " + state;
    const labels = {
      connected: "Connected",
      connecting: "Connecting...",
      disconnected: "Disconnected",
    };
    statusText.textContent = labels[state] || state;
  }

  // ── Server message router ──────────────────────────────────

  function handleServerMessage(msg) {
    const { type, requestId, payload } = msg;

    // Check for pending callbacks
    if (requestId && pendingCallbacks.has(requestId)) {
      const cb = pendingCallbacks.get(requestId);
      pendingCallbacks.delete(requestId);
      cb(payload);
    }

    switch (type) {
      case "session:established":
        sessionId = payload.sessionId;
        console.log("[Session]", sessionId);
        // Load conversations
        loadConversations();
        break;

      case "conversation:created":
        conversations.unshift(payload.conversation);
        renderConversationList();
        selectConversation(payload.conversation.id);
        break;

      case "conversation:listed":
        conversations = payload.conversations || [];
        renderConversationList();
        // Auto-select the first if none active
        if (conversations.length > 0 && !activeConversationId) {
          selectConversation(conversations[0].id);
        } else if (conversations.length === 0) {
          showWelcome();
        }
        break;

      case "conversation:history_loaded":
        renderHistory(payload.messages || []);
        break;

      case "conversation:deleted":
        conversations = conversations.filter(
          (c) => c.id !== payload.conversationId
        );
        renderConversationList();
        if (activeConversationId === payload.conversationId) {
          activeConversationId = null;
          if (conversations.length > 0) {
            selectConversation(conversations[0].id);
          } else {
            showWelcome();
          }
        }
        break;

      case "chat:token":
        appendToken(payload.token);
        break;

      case "chat:message_complete":
        finalizeStream(payload);
        break;

      case "chat:error":
        handleStreamError(payload.message);
        break;

      case "pong":
        break;

      case "error":
        console.error("[Server Error]", payload.message);
        if (isStreaming) {
          handleStreamError(payload.message);
        }
        break;
    }
  }

  // ── Conversation Management ────────────────────────────────

  function loadConversations() {
    sendMessage("conversation:list", {});
  }

  function createConversation() {
    sendMessage("conversation:create", {});
  }

  function selectConversation(id) {
    activeConversationId = id;

    // Highlight in sidebar
    document.querySelectorAll(".conversation-item").forEach(function (el) {
      el.classList.toggle("active", el.dataset.id === id);
    });

    // Update header title
    const conv = conversations.find(function (c) { return c.id === id; });
    chatTitle.textContent = conv ? conv.title : "Chat";

    // Load history
    sendMessage("conversation:history", { conversationId: id });
  }

  function deleteConversation(id) {
    sendMessage("conversation:delete", { conversationId: id });
  }

  function renderConversationList() {
    conversationListEl.innerHTML = "";

    conversations.forEach(function (conv) {
      const el = document.createElement("div");
      el.className =
        "conversation-item" +
        (conv.id === activeConversationId ? " active" : "");
      el.dataset.id = conv.id;

      el.innerHTML =
        '<span class="title">' +
        escapeHtml(conv.title) +
        "</span>" +
        '<button class="delete-btn" title="Delete">&times;</button>';

      el.addEventListener("click", function (e) {
        if (e.target.classList.contains("delete-btn")) {
          e.stopPropagation();
          deleteConversation(conv.id);
          return;
        }
        selectConversation(conv.id);
      });

      conversationListEl.appendChild(el);
    });
  }

  // ── Message Rendering ──────────────────────────────────────

  function showWelcome() {
    messagesContainer.innerHTML =
      '<div class="welcome-screen">' +
      "<h2>Chainlit-WS</h2>" +
      "<p>Start a new conversation to chat with the AI assistant. " +
      "Your conversations are persisted and can be resumed later.</p>" +
      "</div>";
  }

  function renderHistory(messages) {
    messagesContainer.innerHTML = "";

    if (messages.length === 0) {
      messagesContainer.innerHTML =
        '<div class="welcome-screen">' +
        "<p>Send a message to start the conversation.</p>" +
        "</div>";
      return;
    }

    messages.forEach(function (msg) {
      if (msg.role === "system") return;
      appendMessageBubble(msg.role, msg.content);
    });

    scrollToBottom();
  }

  function appendMessageBubble(role, content) {
    // Remove welcome screen if present
    var welcome = messagesContainer.querySelector(".welcome-screen");
    if (welcome) welcome.remove();

    var msgEl = document.createElement("div");
    msgEl.className = "message " + role;

    var avatarLabel = role === "user" ? "U" : "AI";

    msgEl.innerHTML =
      '<div class="message-avatar">' +
      avatarLabel +
      "</div>" +
      '<div class="message-body">' +
      formatContent(content) +
      "</div>";

    messagesContainer.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  /** Start a new streaming assistant message */
  function startStreamBubble() {
    var welcome = messagesContainer.querySelector(".welcome-screen");
    if (welcome) welcome.remove();

    var msgEl = document.createElement("div");
    msgEl.className = "message assistant";
    msgEl.id = "streaming-message";

    msgEl.innerHTML =
      '<div class="message-avatar">AI</div>' +
      '<div class="message-body">' +
      '<div class="typing-indicator"><span></span><span></span><span></span></div>' +
      "</div>";

    messagesContainer.appendChild(msgEl);
    scrollToBottom();
  }

  function appendToken(token) {
    var streamEl = document.getElementById("streaming-message");
    if (!streamEl) {
      startStreamBubble();
      streamEl = document.getElementById("streaming-message");
    }

    var bodyEl = streamEl.querySelector(".message-body");

    // Remove typing indicator on first real token
    var typing = bodyEl.querySelector(".typing-indicator");
    if (typing) {
      typing.remove();
      bodyEl.dataset.raw = "";
    }

    // Accumulate raw text, then render formatted
    bodyEl.dataset.raw = (bodyEl.dataset.raw || "") + token;
    bodyEl.innerHTML = formatContent(bodyEl.dataset.raw);

    scrollToBottom();
  }

  function finalizeStream(payload) {
    var streamEl = document.getElementById("streaming-message");
    if (streamEl) {
      streamEl.removeAttribute("id");

      var bodyEl = streamEl.querySelector(".message-body");
      // Re-render with final content from server
      if (payload.message && payload.message.content) {
        bodyEl.innerHTML = formatContent(payload.message.content);
      }
    }

    isStreaming = false;
    currentStreamRequestId = null;
    updateSendButton();

    // Refresh conversation list to pick up title changes
    loadConversations();
  }

  function handleStreamError(message) {
    var streamEl = document.getElementById("streaming-message");
    if (streamEl) {
      var bodyEl = streamEl.querySelector(".message-body");
      bodyEl.innerHTML =
        '<span style="color: var(--danger);">Error: ' +
        escapeHtml(message || "Something went wrong") +
        "</span>";
      streamEl.removeAttribute("id");
    }

    isStreaming = false;
    currentStreamRequestId = null;
    updateSendButton();
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // ── Send / Stop ────────────────────────────────────────────

  function sendChat() {
    var content = textarea.value.trim();
    if (!content || isStreaming) return;

    // Auto-create a conversation if none selected
    if (!activeConversationId) {
      sendMessage("conversation:create", {}, function (payload) {
        conversations.unshift(payload.conversation);
        renderConversationList();
        activeConversationId = payload.conversation.id;
        chatTitle.textContent = payload.conversation.title;
        doSend(content);
      });
      return;
    }

    doSend(content);
  }

  function doSend(content) {
    // Show user bubble immediately
    appendMessageBubble("user", content);

    // Clear input
    textarea.value = "";
    autoResize();

    // Start streaming state
    isStreaming = true;
    startStreamBubble();
    updateSendButton();

    // Send via WS
    currentStreamRequestId = sendMessage("chat:send", {
      conversationId: activeConversationId,
      content: content,
    });
  }

  function stopStream() {
    if (!isStreaming || !currentStreamRequestId) return;

    sendMessage("chat:stop", {
      requestId: currentStreamRequestId,
    });

    isStreaming = false;
    currentStreamRequestId = null;
    updateSendButton();
  }

  function updateSendButton() {
    if (isStreaming) {
      sendBtn.classList.add("btn-stop");
      sendBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
      sendBtn.disabled = false;
    } else {
      sendBtn.classList.remove("btn-stop");
      sendBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
      sendBtn.disabled = !textarea.value.trim();
    }
  }

  // ── Textarea auto-resize ───────────────────────────────────

  function autoResize() {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
  }

  // ── Event bindings ─────────────────────────────────────────

  textarea.addEventListener("input", function () {
    autoResize();
    updateSendButton();
  });

  textarea.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) return;
      sendChat();
    }
  });

  sendBtn.addEventListener("click", function () {
    if (isStreaming) {
      stopStream();
    } else {
      sendChat();
    }
  });

  newChatBtn.addEventListener("click", function () {
    createConversation();
  });

  // Mobile sidebar toggle
  var mobileToggle = $(".mobile-toggle");
  var sidebar = $(".sidebar");
  if (mobileToggle) {
    mobileToggle.addEventListener("click", function () {
      sidebar.classList.toggle("open");
    });
  }

  // ── Heartbeat (client-side ping) ───────────────────────────

  setInterval(function () {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendMessage("ping", {});
    }
  }, 25000);

  // ── Init ───────────────────────────────────────────────────

  showWelcome();
  updateSendButton();
  connect();
})();
