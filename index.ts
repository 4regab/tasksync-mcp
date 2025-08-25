#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  RootsListChangedNotificationSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream, watch, FSWatcher } from "fs";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import express from "express";
import { normalizePath, expandHome } from './path-utils.js';
import { getValidRootDirectories } from './roots-utils.js';
import {
  validatePath,
  readFileContent,
  tailFile,
  headFile,
  setAllowedDirectories,
} from './lib.js';

// Configuration interface
interface ServerConfig {
  // Configuration placeholder - can be extended later
}

// Parse configuration from environment variables or command line
function parseConfig(): ServerConfig {
  const config: ServerConfig = {};

  // Configuration can be added here later

  return config;
}

const serverConfig = parseConfig();

// Command line argument parsing with embedded mode support
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');
const useEmbedded = args.includes('--embedded') || (!args.includes('--sse') && !args.includes('--stdio'));
const ssePort = parseInt(args.find(arg => arg.startsWith('--port='))?.split('=')[1] || '3001');

// Filter out mode-specific args
const directoryArgs = args.filter(arg => 
  !arg.startsWith('--sse') && 
  !arg.startsWith('--port=') && 
  !arg.startsWith('--embedded') && 
  !arg.startsWith('--stdio')
);

// Default to stdio mode (standard MCP behavior)
const serverMode = useSSE ? 'sse' : 'stdio';

// Store allowed directories in normalized and resolved form
let allowedDirectories: string[] = [];

// Auto-detect current directory if no directories provided
if (directoryArgs.length === 0) {
  const currentDir = normalizePath(process.cwd());
  allowedDirectories = [currentDir];
  console.error(`Auto-detected allowed directory: ${currentDir}`);
} else {
  allowedDirectories = await Promise.all(
    directoryArgs.map(async (dir) => {
      const expanded = expandHome(dir);
      const absolute = path.resolve(expanded);
      try {
        // Security: Resolve symlinks in allowed directories during startup
        // This ensures we know the real paths and can validate against them later
        const resolved = await fs.realpath(absolute);
        return normalizePath(resolved);
      } catch (error) {
        // If we can't resolve (doesn't exist), use the normalized absolute path
        // This allows configuring allowed dirs that will be created later
        return normalizePath(absolute);
      }
    })
  );
}

// This is now handled above in the auto-detection logic

// Validate that all directories exist and are accessible
await Promise.all(allowedDirectories.map(async (dir) => {
  try {
    const stats = await fs.stat(dir);
    if (!stats.isDirectory()) {
      console.error(`Error: ${dir} is not a directory`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing directory ${dir}:`, error);
    process.exit(1);
  }
}));

// Initialize the global allowedDirectories in lib.ts
setAllowedDirectories(allowedDirectories);

// File watching state for ask_review
let lastFileModified: number | null = null;
let fileWatcher: FSWatcher | null = null;
const connectedTransports: Set<SSEServerTransport> = new Set();

// Waiting mechanism for ask_review
const waitingForFileChange: Array<{
  resolve: (content: string) => void;
  reject: (error: Error) => void;
}> = [];

// Lazy initialization state
let isInitialized = false;

// Schema definitions

const AskReviewArgsSchema = z.object({
  tail: z.number().optional().describe('If provided, returns only the last N lines of the review file'),
  head: z.number().optional().describe('If provided, returns only the first N lines of the review file')
});

const ReadMediaFileArgsSchema = z.object({
  path: z.string()
});

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

// Server setup
const server = new Server(
  {
    name: "tasksync-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      logging: {}, // Enable logging for notifications
    },
  },
);

// Lazy initialization for file watcher
async function ensureInitialized() {
  if (!isInitialized) {
    console.error("Initializing TaskSync server components...");
    await setupFileWatcher();
    isInitialized = true;
    console.error("TaskSync server initialized successfully");
  }
}

// File watching functions
async function setupFileWatcher() {
  const reviewPath = path.join(process.cwd(),'review.md');

  try {
    // Check if file exists, create if it doesn't
    try {
      await fs.access(reviewPath);
      console.error(`File exists: ${reviewPath}`);
    } catch {
      console.error(`Creating file: ${reviewPath}`);
      await fs.mkdir(path.dirname(reviewPath), { recursive: true });
      await fs.writeFile(reviewPath, 'No review content yet.');
    }

    // Get initial modification time
    const stats = await fs.stat(reviewPath);
    lastFileModified = stats.mtime.getTime();
    console.error(`Initial file modification time: ${lastFileModified}`);

    // Setup file watcher
    fileWatcher = watch(reviewPath, async (eventType, filename) => {
      console.error(`File watcher event: ${eventType} for ${filename}`);
      if (eventType === 'change') {
        console.error('File change detected, notifying clients...');
        await notifyClientsOfFileChange();
      }
    });

    console.error(`File watcher setup successfully for: ${reviewPath}`);
  } catch (error) {
    console.error(`Failed to setup file watcher: ${error}`);
    throw error; // Re-throw to see the error in the main process
  }
}

async function notifyClientsOfFileChange() {
  try {
    const reviewPath = path.join(process.cwd(),'review.md');
    const stats = await fs.stat(reviewPath);
    const currentModified = stats.mtime.getTime();

    if (lastFileModified === currentModified) {
      return; // No actual change
    }

    console.error(`File change detected: ${lastFileModified} -> ${currentModified}`);
    lastFileModified = currentModified;
    const content = await readFileContent(reviewPath);

    // Resolve all waiting ask_review calls
    const waitingCalls = waitingForFileChange.splice(0);
    console.error(`Resolving ${waitingCalls.length} waiting calls`);
    for (const { resolve } of waitingCalls) {
      resolve(content);
    }

    // Send notification to all connected clients
    for (const transport of connectedTransports) {
      try {
        await transport.send({
          jsonrpc: "2.0",
          method: "notifications/message",
          params: {
            level: "info",
            logger: "tasksync-server",
            data: {
              type: "file_changed",
              path: "review.md",
              content: content,
              timestamp: new Date().toISOString()
            }
          }
        });
      } catch (error) {
        console.error(`Failed to send notification to client: ${error}`);
      }
    }

    console.error(`File change notification sent to ${connectedTransports.size} clients and ${waitingCalls.length} waiting calls resolved`);
  } catch (error) {
    console.error(`Error in notifyClientsOfFileChange: ${error}`);
  }
}

// Reads a file as a stream of buffers, concatenates them, and then encodes
// the result to a Base64 string. This is a memory-efficient way to handle
// binary data from a stream before the final encoding.
async function readFileAsBase64Stream(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(chunk as Buffer);
    });
    stream.on('end', () => {
      const finalBuffer = Buffer.concat(chunks);
      resolve(finalBuffer.toString('base64'));
    });
    stream.on('error', (err) => reject(err));
  });
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "ask_review",
        description:
          "Read the contents of the review.md file specifically for getting review." +
          "During any process, task, or conversation, whether asking, replying, or completing phased tasks, you must call this tool to ask for review. " +
          "Only when the user explicitly indicates <end or no more interaction needed> can you stop calling this tool, and the process is considered complete.\n\n" +
          "MANDATORY USAGE RULES -PRIMARY DIRECTIVE:\n" +
          "1. CONTINUOUS FEEDBACK LOOP: During any process, task, or conversation, whether asking, replying, or completing phased tasks, you MUST call this tool to ask for feedback.\n" +
          "2. NO STOPPING WITHOUT PERMISSION: Unless receiving explicit termination instructions (\"end\", \"stop\", \"no more interaction needed\"), ALL steps must repeatedly call this tool.\n" +
          "3. RESPOND TO FEEDBACK: Whenever user feedback is received, if the feedback content is not empty, you MUST call this tool again and adjust behavior based on the feedback content.\n" +
          "4. TERMINATION CONDITIONS: Only when the user explicitly indicates \"end\", \"stop\", \"finished\", or \"no more interaction needed\" can you stop calling this tool.\n" +
          "5. PROVIDE CONTEXT: You should summarize what you have done and provide project context to help the user provide meaningful feedback for the next step.\n" +
          "6. KEEP ITERATING: If the user provides feedback, suggestions, or asks questions, continue the feedback loop by calling this tool again after addressing their input.\n" +
          "7. NEVER ASSUME COMPLETION: Do not assume a task is complete without explicit user confirmation through this feedback mechanism.\n\n",
        
        inputSchema: zodToJsonSchema(AskReviewArgsSchema) as ToolInput,
      },
      {
        name: "view_media",
        description:
          "Read an image or audio file. Returns the base64 encoded data and MIME type. " +
          "Only works within allowed directories.\n\n" +
          "SUPPORTED FORMATS:\n" +
          "Images: PNG, JPEG, GIF, WebP, BMP, SVG\n" +
          "Audio: MP3, WAV, OGG, FLAC\n\n" +
          "USAGE:\n" +
          "Use this tool to read and encode binary media files for analysis, display, or processing. " +
          "The tool streams files efficiently and returns base64-encoded data with proper MIME type detection.\n\n" +
          "Args:\n" +
          "    path: Absolute or relative path to the media file within allowed directories",
        inputSchema: zodToJsonSchema(ReadMediaFileArgsSchema) as ToolInput,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Ensure server is initialized on first tool call
    await ensureInitialized();
    
    const { name, arguments: args } = request.params;

    switch (name) {
      case "ask_review": {
        const parsed = AskReviewArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for ask_review: ${parsed.error}`);
        }

        // Hardcode the path to review.md in the tools directory
        const reviewPath = path.join(process.cwd(),'review.md');
        const validPath = await validatePath(reviewPath);

        // Get current file stats
        const stats = await fs.stat(validPath);
        const currentModified = stats.mtime.getTime();

        console.error(`ask_review: Current file modified: ${currentModified}, Last known: ${lastFileModified}`);

        // If this is the first call or file has changed, return content immediately
        if (lastFileModified === null || lastFileModified < currentModified) {
          console.error("ask_review: File has changed, returning content immediately");
          lastFileModified = currentModified;

          if (parsed.data.head && parsed.data.tail) {
            throw new Error("Cannot specify both head and tail parameters simultaneously");
          }

          if (parsed.data.tail) {
            const tailContent = await tailFile(validPath, parsed.data.tail);
            return {
              content: [{ type: "text", text: tailContent }],
            };
          }

          if (parsed.data.head) {
            const headContent = await headFile(validPath, parsed.data.head);
            return {
              content: [{ type: "text", text: headContent }],
            };
          }

          const content = await readFileContent(validPath);
          return {
            content: [{ type: "text", text: content }],
          };
        }

        // File hasn't changed - wait for file change using file watcher
        console.error("ask_review: File hasn't changed, waiting for modification...");
        console.error(`ask_review: Current waiting queue size: ${waitingForFileChange.length}`);
        
        const content = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            const index = waitingForFileChange.findIndex(w => w.resolve === resolve);
            if (index !== -1) {
              waitingForFileChange.splice(index, 1);
            }
            console.error("ask_review: Timeout reached after 5 minutes");
            reject(new Error("Timeout waiting for file change (5 minutes)"));
          }, 300000); // 5 minute timeout

          console.error("ask_review: Adding to waiting queue");
          waitingForFileChange.push({
            resolve: (content: string) => {
              console.error("ask_review: Promise resolved with content");
              clearTimeout(timeout);
              resolve(content);
            },
            reject: (error: Error) => {
              console.error(`ask_review: Promise rejected with error: ${error.message}`);
              clearTimeout(timeout);
              reject(error);
            }
          });
          console.error(`ask_review: Updated waiting queue size: ${waitingForFileChange.length}`);
        });

        // Apply head/tail filtering if requested
        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }

        if (parsed.data.tail) {
          const lines = content.split('\n');
          const tailLines = lines.slice(-parsed.data.tail);
          return {
            content: [{ type: "text", text: tailLines.join('\n') }],
          };
        }

        if (parsed.data.head) {
          const lines = content.split('\n');
          const headLines = lines.slice(0, parsed.data.head);
          return {
            content: [{ type: "text", text: headLines.join('\n') }],
          };
        }

        return {
          content: [{ type: "text", text: content }],
        };

        // This code is temporarily disabled while we fix the file watcher
        // It will be re-enabled once the blocking mechanism works properly
        /*
        // File hasn't changed - wait for file change
        console.error("ask_review: Waiting for file change...");
        console.error(`Current waiting queue size: ${waitingForFileChange.length}`);
        console.error(`File watcher status: ${fileWatcher ? 'ACTIVE' : 'INACTIVE'}`);

        const content = await new Promise<string>((resolve, reject) => {
          // Add timeout to prevent infinite waiting
          const timeout = setTimeout(() => {
            const index = waitingForFileChange.findIndex(w => w.resolve === resolve);
            if (index !== -1) {
              waitingForFileChange.splice(index, 1);
            }
            console.error("ask_review: Timeout reached, rejecting promise");
            reject(new Error("Timeout waiting for file change (60 seconds)"));
          }, 60000); // 60 second timeout

          console.error("ask_review: Adding to waiting queue");
          waitingForFileChange.push({
            resolve: (content: string) => {
              console.error("ask_review: Promise resolved with content");
              clearTimeout(timeout);
              resolve(content);
            },
            reject: (error: Error) => {
              console.error(`ask_review: Promise rejected with error: ${error.message}`);
              clearTimeout(timeout);
              reject(error);
            }
          });
          console.error(`Updated waiting queue size: ${waitingForFileChange.length}`);
        });

        // Apply head/tail filtering if requested
        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }

        if (parsed.data.tail) {
          const lines = content.split('\n');
          const tailLines = lines.slice(-parsed.data.tail);
          return {
            content: [{ type: "text", text: tailLines.join('\n') }],
          };
        }

        if (parsed.data.head) {
          const lines = content.split('\n');
          const headLines = lines.slice(0, parsed.data.head);
          return {
            content: [{ type: "text", text: headLines.join('\n') }],
          };
        }

        return {
          content: [{ type: "text", text: content }],
        };
        */
      }

      case "view_media": {
        const parsed = ReadMediaFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for view_media: ${parsed.error}`);
        }
        const validPath = await validatePath(parsed.data.path);
        const extension = path.extname(validPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".bmp": "image/bmp",
          ".svg": "image/svg+xml",
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".flac": "audio/flac",
        };
        const mimeType = mimeTypes[extension] || "application/octet-stream";
        const data = await readFileAsBase64Stream(validPath);
        const type = mimeType.startsWith("image/")
          ? "image"
          : mimeType.startsWith("audio/")
            ? "audio"
            : "blob";
        return {
          content: [{ type, data, mimeType }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Updates allowed directories based on MCP client roots
async function updateAllowedDirectoriesFromRoots(requestedRoots: Root[]) {
  const validatedRootDirs = await getValidRootDirectories(requestedRoots);
  if (validatedRootDirs.length > 0) {
    allowedDirectories = [...validatedRootDirs];
    setAllowedDirectories(allowedDirectories); // Update the global state in lib.ts
    console.error(`Updated allowed directories from MCP roots: ${validatedRootDirs.length} valid directories`);
  } else {
    console.error("No valid root directories provided by client");
  }
}

// Handles dynamic roots updates during runtime, when client sends "roots/list_changed" notification, server fetches the updated roots and replaces all allowed directories with the new roots.
server.setNotificationHandler(RootsListChangedNotificationSchema, async () => {
  try {
    // Request the updated roots list from the client
    const response = await server.listRoots();
    if (response && 'roots' in response) {
      await updateAllowedDirectoriesFromRoots(response.roots);
    }
  } catch (error) {
    console.error("Failed to request roots from client:", error instanceof Error ? error.message : String(error));
  }
});

// Handles post-initialization setup, specifically checking for and fetching MCP roots.
server.oninitialized = async () => {
  const clientCapabilities = server.getClientCapabilities();

  if (clientCapabilities?.roots) {
    try {
      const response = await server.listRoots();
      if (response && 'roots' in response) {
        await updateAllowedDirectoriesFromRoots(response.roots);
      } else {
        console.error("Client returned no roots set, keeping current settings");
      }
    } catch (error) {
      console.error("Failed to request initial roots from client:", error instanceof Error ? error.message : String(error));
    }
  } else {
    if (allowedDirectories.length > 0) {
      console.error("Client does not support MCP Roots, using allowed directories set from server args:", allowedDirectories);
    } else {
      throw new Error(`Server cannot operate: No allowed directories available. Server was started without command-line directories and client either does not support MCP roots protocol or provided empty roots. Please either: 1) Start server with directory arguments, or 2) Use a client that supports MCP roots protocol and provides valid root directories.`);
    }
  }
};

// Start server
async function runServer() {
  if (useSSE) {
    await runSSEServer();
  } else {
    await runStdioServer();
  }
}

async function runStdioServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TaskSync MCP Server running on stdio");
  console.error(`Allowed directories: ${allowedDirectories.join(', ')}`);
  console.error("Server will initialize components when first tool is called");
}

async function runSSEServer() {
  const app = express();

  // Enable CORS for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  app.use(express.json());

  // SSE endpoint
  app.get("/sse", async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    connectedTransports.add(transport);

    res.on("close", () => {
      connectedTransports.delete(transport);
      console.error(`Client disconnected. Active connections: ${connectedTransports.size}`);
    });

    console.error(`Client connected via SSE. Active connections: ${connectedTransports.size}`);
    await server.connect(transport);
  });

  // Messages endpoint for POST requests
  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = Array.from(connectedTransports).find(t => t.sessionId === sessionId);

    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No transport found for sessionId");
    }
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      server: "tasksync-mcp-server",
      version: "1.0.0",
      connections: connectedTransports.size,
      allowedDirectories: allowedDirectories.length
    });
  });

  // Setup file watcher
  await setupFileWatcher();

  app.listen(ssePort, () => {
    console.error(`TaskSync MCP Server running on SSE at http://localhost:${ssePort}`);
    console.error(`SSE endpoint: http://localhost:${ssePort}/sse`);
    console.error(`Health check: http://localhost:${ssePort}/health`);
    console.error(`Allowed directories: ${allowedDirectories.join(', ')}`);
    console.error(`File watcher active for: review.md`);
  });
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.error('\nShutting down server...');
  if (fileWatcher) {
    fileWatcher.close();
  }
  process.exit(0);
});

runServer().catch((error) => {
  console.error("Fatal error running TaskSync server:", error);
  process.exit(1);
});