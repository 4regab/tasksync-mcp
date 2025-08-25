#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
  RootsListChangedNotificationSchema,
  type Root,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
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
  sleepDefaultDuration?: number;
  sleepMaxDuration?: number;
}

// Parse configuration from environment variables or command line
function parseConfig(): ServerConfig {
  const config: ServerConfig = {};

  // Check for configuration via environment variables
  if (process.env.TASKSYNC_SLEEP_DEFAULT) {
    config.sleepDefaultDuration = parseInt(process.env.TASKSYNC_SLEEP_DEFAULT, 10);
  }

  if (process.env.TASKSYNC_SLEEP_MAX) {
    config.sleepMaxDuration = parseInt(process.env.TASKSYNC_SLEEP_MAX, 10);
  }

  return config;
}

const serverConfig = parseConfig();

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: tasksync-mcp-server [allowed-directory] [additional-directories...]");
  console.error("Note: Allowed directories can be provided via:");
  console.error("  1. Command-line arguments (shown above)");
  console.error("  2. MCP roots protocol (if client supports it)");
  console.error("At least one directory must be provided by EITHER method for the server to operate.");
  console.error("");
  console.error("Configuration via environment variables:");
  console.error("  TASKSYNC_SLEEP_DEFAULT - Default sleep duration in seconds (default: 10)");
  console.error("  TASKSYNC_SLEEP_MAX - Maximum sleep duration in seconds (default: 300)");
}

// Store allowed directories in normalized and resolved form
let allowedDirectories = await Promise.all(
  args.map(async (dir) => {
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

// Schema definitions

const AskReviewArgsSchema = z.object({
  tail: z.number().optional().describe('If provided, returns only the last N lines of the review file'),
  head: z.number().optional().describe('If provided, returns only the first N lines of the review file')
});

const ReadMediaFileArgsSchema = z.object({
  path: z.string()
});

const SleepArgsSchema = z.object({
  duration: z.number().optional().describe('Sleep duration in seconds (default: 10)'),
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
    },
  },
);

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
          "Read the contents of the review.md file specifically for getting feedback during tasks. " +
          "During any process, task, or conversation, whether asking, replying, or completing phased tasks, you must call this tool to ask for feedback. " +
          "Only when the user explicitly indicates <end or no more interaction needed> can you stop calling this tool, and the process is considered complete.",
        inputSchema: zodToJsonSchema(AskReviewArgsSchema) as ToolInput,
      },
      {
        name: "view_image",
        description:
          "Read an image or audio file. Returns the base64 encoded data and MIME type. " +
          "Only works within allowed directories.",
        inputSchema: zodToJsonSchema(ReadMediaFileArgsSchema) as ToolInput,
      },
      {
        name: "sleep",
        description:
          "Pause execution for a specified duration. Useful for adding delays in automated " +
          "workflows, testing scenarios, or when executing tasks. " +
          "Unless receiving termination instructions, all steps must repeatedly call this tool. The duration can be " +
          `configured in the MCP server settings, with a default of ${serverConfig.sleepDefaultDuration ?? 10} seconds.`,
        inputSchema: zodToJsonSchema(SleepArgsSchema) as ToolInput,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "ask_review": {
        const parsed = AskReviewArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for ask_review: ${parsed.error}`);
        }
        
        // Hardcode the path to review.md in the tools directory
        const reviewPath = path.join(process.cwd(), 'tools', 'review.md');
        const validPath = await validatePath(reviewPath);

        if (parsed.data.head && parsed.data.tail) {
          throw new Error("Cannot specify both head and tail parameters simultaneously");
        }

        if (parsed.data.tail) {
          // Use memory-efficient tail implementation for large files
          const tailContent = await tailFile(validPath, parsed.data.tail);
          return {
            content: [{ type: "text", text: tailContent }],
          };
        }

        if (parsed.data.head) {
          // Use memory-efficient head implementation for large files
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

      case "view_image": {
        const parsed = ReadMediaFileArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for view_image: ${parsed.error}`);
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

      case "sleep": {
        const parsed = SleepArgsSchema.safeParse(args);
        if (!parsed.success) {
          throw new Error(`Invalid arguments for sleep: ${parsed.error}`);
        }

        const defaultDuration = serverConfig.sleepDefaultDuration ?? 10;
        const maxDuration = serverConfig.sleepMaxDuration ?? 300;
        const duration = parsed.data.duration ?? defaultDuration;

        if (duration < 0) {
          throw new Error("Sleep duration must be non-negative");
        }

        if (duration > maxDuration) {
          throw new Error(`Sleep duration cannot exceed ${maxDuration} seconds`);
        }

        const startTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        const actualDuration = (Date.now() - startTime) / 1000;

        return {
          content: [{
            type: "text",
            text: `Slept for ${actualDuration.toFixed(2)} seconds`
          }],
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TaskSync MCP Server running on stdio");
  if (allowedDirectories.length === 0) {
    console.error("Started without allowed directories - waiting for client to provide roots via MCP protocol");
  }
}

runServer().catch((error) => {
  console.error("Fatal error running TaskSync server:", error);
  process.exit(1);
});