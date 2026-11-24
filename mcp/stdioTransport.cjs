'use strict';

const {
  DEFAULT_PROTOCOL_VERSION,
  negotiateProtocolVersion,
  handleJsonRpcRequest,
} = require('./rpcRouter.cjs');

const MAX_FRAME_BYTES = 10 * 1024 * 1024;

function startMcpServer() {
  let useContentLengthFraming = false;
  let pendingRequests = 0;
  let stdinEnded = false;
  const sessionState = {
    protocolVersion: negotiateProtocolVersion(DEFAULT_PROTOCOL_VERSION),
    subscribedUris: new Set(),
  };

  function sendMessage(payload) {
    const json = JSON.stringify(payload);
    if (useContentLengthFraming) {
      const byteLen = Buffer.byteLength(json, 'utf8');
      process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
    } else {
      process.stdout.write(`${json}\n`);
    }
  }

  function sendParseError(detail) {
    sendMessage({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: detail ? `Parse error: ${detail}` : 'Parse error: Invalid JSON received.',
      },
    });
  }

  function maybeExit() {
    if (stdinEnded && pendingRequests === 0) {
      process.exit(0);
    }
  }

  async function handleRequest(msg) {
    const { response, notifications } = await handleJsonRpcRequest(msg, sessionState);
    if (response) {
      sendMessage(response);
    }
    if (Array.isArray(notifications)) {
      for (const note of notifications) {
        sendMessage(note);
      }
    }
  }

  function dispatchMessage(parsed) {
    pendingRequests += 1;
    Promise.resolve(handleRequest(parsed)).finally(() => {
      pendingRequests -= 1;
      maybeExit();
    });
  }

  let incomingBuffer = Buffer.alloc(0);

  function processBuffer() {
    while (incomingBuffer.length > 0) {
      while (
        incomingBuffer.length > 0 &&
        (incomingBuffer[0] === 0x0d || incomingBuffer[0] === 0x0a)
      ) {
        incomingBuffer = incomingBuffer.subarray(1);
      }
      if (incomingBuffer.length === 0) return;

      const headText = incomingBuffer
        .subarray(0, Math.min(incomingBuffer.length, 64))
        .toString('utf8');
      if (/^content-length:/i.test(headText)) {
        useContentLengthFraming = true;
        const headerEnd = incomingBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          if (incomingBuffer.length > 8192) {
            incomingBuffer = Buffer.alloc(0);
            sendParseError('Header too large');
          }
          return;
        }
        const header = incomingBuffer.subarray(0, headerEnd).toString('utf8');
        const match = /content-length:\s*(\d+)/i.exec(header);
        if (!match) {
          incomingBuffer = incomingBuffer.subarray(headerEnd + 4);
          sendParseError('Missing numeric Content-Length header');
          continue;
        }
        const length = Number.parseInt(match[1], 10);
        if (!Number.isFinite(length) || length < 0 || length > MAX_FRAME_BYTES) {
          incomingBuffer = Buffer.alloc(0);
          sendParseError('Content-Length exceeds maximum allowed frame size');
          return;
        }
        const totalLen = headerEnd + 4 + length;
        if (incomingBuffer.length < totalLen) return;
        const bodyStr = incomingBuffer.subarray(headerEnd + 4, totalLen).toString('utf8');
        incomingBuffer = incomingBuffer.subarray(totalLen);
        try {
          dispatchMessage(JSON.parse(bodyStr));
        } catch (err) {
          sendParseError(err instanceof Error ? err.message : 'Malformed JSON frame');
        }
        continue;
      }

      const newlineIdx = incomingBuffer.indexOf(0x0a);
      if (newlineIdx === -1) {
        if (incomingBuffer.length > MAX_FRAME_BYTES) {
          incomingBuffer = Buffer.alloc(0);
          sendParseError('JSON line exceeds maximum allowed frame size');
        }
        return;
      }
      const line = incomingBuffer.subarray(0, newlineIdx).toString('utf8').trim();
      incomingBuffer = incomingBuffer.subarray(newlineIdx + 1);
      if (!line) continue;
      try {
        dispatchMessage(JSON.parse(line));
      } catch (err) {
        sendParseError(err instanceof Error ? err.message : 'Malformed JSON line');
      }
    }
  }

  process.stdin.on('data', (chunk) => {
    incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
    processBuffer();
  });

  process.stdin.on('end', () => {
    if (incomingBuffer.length > 0) {
      const tail = incomingBuffer.toString('utf8').trim();
      incomingBuffer = Buffer.alloc(0);
      if (tail && !/^content-length:/i.test(tail)) {
        try {
          dispatchMessage(JSON.parse(tail));
        } catch (err) {
          sendParseError(err instanceof Error ? err.message : 'Incomplete JSON tail');
        }
      }
    }
    stdinEnded = true;
    maybeExit();
  });
}

module.exports = {
  startMcpServer,
};
