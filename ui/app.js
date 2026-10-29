
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const newChat = document.querySelector("#new-chat");
const messages = document.querySelector("#messages");
const error = document.querySelector("#error");
const announcement = document.querySelector("#announcement");
const health = document.querySelector("#health");
const healthLabel = document.querySelector("#health-label");
const history = [];
const CONTEXT_THRESHOLD_CHARS = 12000;
const KEEP_RECENT_MESSAGES = 6;
let contextSummary = "";
let sending = false;

async function minimizeContext() {
  const contextChars =
    [...contextSummary].length +
    history.reduce((total, message) => total + [...message.content].length, 0);
  if (
    contextChars <= CONTEXT_THRESHOLD_CHARS ||
    history.length <= KEEP_RECENT_MESSAGES
  )
    return;

  send.textContent = "Condensing...";
  announcement.textContent = "Condensing earlier conversation.";
  const response = await fetch("/context/minimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      history,
      summary: contextSummary,
      threshold_chars: CONTEXT_THRESHOLD_CHARS,
      keep_recent_messages: KEEP_RECENT_MESSAGES,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok)
    throw new Error(
      "Context minimization failed. Your conversation was kept; please retry.",
    );
  const result = await response.json();
  if (result.minimized) {
    if (
      typeof result.summary !== "string" ||
      !result.summary.trim() ||
      !Array.isArray(result.history) ||
      result.history.some(
        (message) =>
          !["user", "assistant"].includes(message.role) ||
          typeof message.content !== "string",
      )
    )
      throw new Error(
        "Invalid context summary. Your conversation was kept; please retry.",
      );
    history.splice(0, history.length, ...result.history);
    contextSummary = result.summary;
  }
  send.textContent = "Thinking...";
}

newChat.addEventListener("click", () => {
  if (sending) return;
  history.length = 0;
  contextSummary = "";
  messages.replaceChildren();
  const empty = document.createElement("div");
  empty.id = "empty";
  empty.className = "empty";
  const heading = document.createElement("h2");
  heading.textContent = "What's on your mind?";
  empty.append(heading);
  messages.append(empty);
  input.value = "";
  error.hidden = true;
  error.textContent = "";
  announcement.textContent = "New chat started. Conversation context cleared.";
  input.focus();
});

async function checkHealth() {
  try {
    const response = await fetch("/health", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok || data.status !== "ok") throw new Error("Unhealthy");
    health.className = "health online";
    healthLabel.textContent = "API online";
  } catch {
    health.className = "health offline";
    healthLabel.textContent = "API offline";
  }
}

function addMessage(role, text) {
  document.querySelector("#empty")?.remove();
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const label = document.createElement("span");
  label.className = "message-label";
  label.textContent = role === "user" ? "You" : "Tandem";
  const content = document.createElement(role === "user" ? "p" : "div");
  content.className = "message-content";
  content.textContent = text;
  article.append(label, content);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return content;
}

function appendInlineMarkdown(container, text) {
  const tokens = /\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*/g;
  let position = 0;
  let match;

  while ((match = tokens.exec(text))) {
    if (match.index > position) {
      container.append(
        document.createTextNode(text.slice(position, match.index)),
      );
    }

    const token = match[0];
    const content = token.slice(
      token.startsWith("**") ? 2 : 1,
      -(token.startsWith("**") ? 2 : 1),
    );
    const element = document.createElement(
      token.startsWith("**") ? "strong" : token.startsWith("`") ? "code" : "em",
    );
    element.textContent = content;
    container.append(element);
    position = tokens.lastIndex;
  }

  if (position < text.length) {
    container.append(document.createTextNode(text.slice(position)));
  }
}

function appendMarkdown(container, text) {
  let paragraph;
  let list;
  let listType;

  for (const line of text.split("\n")) {
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    const item = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.*)$/);

    if (!line.trim()) {
      paragraph = undefined;
      list = undefined;
      listType = undefined;
      continue;
    }

    if (heading) {
      paragraph = undefined;
      list = undefined;
      listType = undefined;
      const element = document.createElement(`h${heading[1].length}`);
      appendInlineMarkdown(element, heading[2]);
      container.append(element);
      continue;
    }

    if (item) {
      paragraph = undefined;
      const nextListType = /^\d/.test(item[1]) ? "ol" : "ul";
      if (nextListType !== listType) {
        list = document.createElement(nextListType);
        container.append(list);
        listType = nextListType;
      }
      const element = document.createElement("li");
      appendInlineMarkdown(element, item[2]);
      list.append(element);
      continue;
    }

    list = undefined;
    listType = undefined;
    if (!paragraph) {
      paragraph = document.createElement("p");
      container.append(paragraph);
    } else {
      paragraph.append(document.createElement("br"));
    }
    appendInlineMarkdown(paragraph, line);
  }
}

function renderAssistantText(container, text) {
  const blocks = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  const fragment = document.createDocumentFragment();
  let position = 0;
  let match;

  while ((match = blocks.exec(text))) {
    if (match.index > position) {
      appendMarkdown(fragment, text.slice(position, match.index));
    }

    const language = match[1].trim();
    const code = match[2];
    const block = document.createElement("div");
    block.className = "code-block";
    const header = document.createElement("div");
    header.className = "code-header";
    const languageLabel = document.createElement("span");
    languageLabel.textContent = language || "Code";
    const copy = document.createElement("button");
    copy.className = "code-copy";
    copy.type = "button";
    copy.textContent = "Copy";
    copy.setAttribute("aria-label", `Copy ${language || "code"} snippet`);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copy.textContent = "Copied";
        window.setTimeout(() => {
          copy.textContent = "Copy";
        }, 1500);
      } catch {
        copy.textContent = "Copy failed";
      }
    });
    header.append(languageLabel, copy);

    const pre = document.createElement("pre");
    const codeElement = document.createElement("code");
    codeElement.textContent = code;
    pre.append(codeElement);
    block.append(header, pre);
    fragment.append(block);
    position = blocks.lastIndex;
  }

  if (position < text.length) {
    appendMarkdown(fragment, text.slice(position));
  }
  container.replaceChildren(fragment);
}

input.addEventListener("keydown", (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key === "Enter" &&
    !event.isComposing
  ) {
    event.preventDefault();
    if (!sending && !event.repeat) form.requestSubmit();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message || sending) return;
  sending = true;
  send.disabled = true;
  newChat.disabled = true;
  send.textContent = "Thinking...";
  messages.setAttribute("aria-busy", "true");
  error.hidden = true;
  announcement.textContent = "Waiting for response.";
  addMessage("user", message);
  input.value = "";
  const reply = addMessage("assistant", "Preparing response...");
  const thinking = document.createElement("details");
  thinking.className = "thinking";
  thinking.hidden = true;
  thinking.open = true;
  const thinkingLabel = document.createElement("summary");
  thinkingLabel.textContent = "Thinking...";
  const reasoning = document.createElement("p");
  thinking.append(thinkingLabel, reasoning);
  reply.before(thinking);
  let received = false;
  let completed = false;
  let replyText = "";

  function handleEvent(frame) {
    const data = frame.split("\n").find((line) => line.startsWith("data: "));
    if (!data) return;
    const event = JSON.parse(data.slice(6));
    if (event.type === "status" && !received) {
      reply.textContent = event.text;
    } else if (event.type === "reasoning") {
      thinking.hidden = false;
      reasoning.textContent += event.text;
    } else if (event.type === "content") {
      received = true;
      replyText += event.text;
      renderAssistantText(reply, replyText);
      send.textContent = "Responding...";
      thinkingLabel.textContent = "Reasoning";
    } else if (event.type === "done") {
      completed = true;
    } else if (event.type === "error") {
      throw new Error(event.text);
    }
    messages.scrollTop = messages.scrollHeight;
  }

  try {
    await minimizeContext();
    const response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history,
        summary: contextSummary,
        stream_events: true,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error(`Request failed (${response.status}). Please try again.`);
    if (!response.body)
      throw new Error("Streaming is unavailable in this browser.");
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          handleEvent(frame);
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!completed)
      throw new Error("The response was interrupted. Please try again.");
    if (!received) throw new Error("No response received. Please try again.");
    thinkingLabel.textContent = "Reasoning";
    thinking.open = false;
    history.push(
      { role: "user", content: message },
      { role: "assistant", content: replyText },
    );
    announcement.textContent = "Response complete.";
  } catch (failure) {
    thinkingLabel.textContent = "Reasoning (interrupted)";
    if (!received) reply.textContent = "No response received.";
    error.textContent =
      failure.name === "TimeoutError"
        ? "The response timed out. Please try again."
        : failure instanceof TypeError
          ? "Could not reach the API. Check your connection and try again."
          : failure.message;
    error.hidden = false;
    announcement.textContent = "Request failed.";
  } finally {
    sending = false;
    send.disabled = false;
    newChat.disabled = false;
    send.textContent = "Send";
    messages.setAttribute("aria-busy", "false");
    input.focus();
    checkHealth();
  }
});

checkHealth();
setInterval(checkHealth, 15000);