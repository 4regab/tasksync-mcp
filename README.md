# TaskSync MCP Server

A Node.js server implementing the Model Context Protocol (MCP) designed for automated workflows and continuous feedback loops. TaskSync provides specialized tools for file system operations, media handling, and real-time review feedback collection.

## 🎯 Core Concept

This is an [MCP server](https://modelcontextprotocol.io/) that establishes **feedback-oriented development workflows**, providing **real-time review feedback** and **media processing capabilities**. By enabling AI agents to request human feedback and process media files seamlessly, it creates efficient human-in-the-loop automation systems perfect for iterative development and quality assurance processes.

**Supported Platforms:** [Cursor](https://www.cursor.com) | [Cline](https://cline.bot) | [Windsurf](https://windsurf.com) | [Augment](https://www.augmentcode.com) | [Claude Desktop](https://claude.ai/desktop)

### 🔄 Workflow

1. **AI Call** → `tasksync-mcp-server` tools
2. **File Monitoring** → Watch `review.md` for real-time feedback
3. **Media Processing** → Handle images and audio files with base64 encoding
4. **Real-time Response** → File watcher delivers information to AI instantly
5. **Process Continuation** → AI adjusts behavior based on feedback

## 🌟 Key Features

### 🔄 Continuous Review Feedback
- **ask_review** tool that watches `review.md` for real-time feedback
- File watcher automatically detects changes and notifies waiting processes
- Supports partial content reading with head/tail parameters
- Essential for iterative development and user feedback loops

### 🖼️ Media Processing
- **view_media** tool for images and audio files with base64 encoding
- Supports image formats: PNG, JPEG, GIF, WebP, BMP, SVG
- Supports audio formats: MP3, WAV, OGG, FLAC
- Efficient streaming for large files with proper MIME type detection

### 🔐 Security & Access Control
- Directory access control via command-line arguments or MCP Roots
- Real-time directory permission updates
- Symlink attack prevention and security validation
- Auto-detection of current directory when no paths specified

## 🚀 Quick Start

### 1. Installation & Testing

```bash
# Install via NPX (Recommended)
npx tasksync-mcp-server .

# Or install globally
npm install -g tasksync-mcp-server
tasksync-mcp-server .
```

### 2. Configure MCP

**Basic Configuration** (suitable for most users):

```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["tasksync-mcp-server", "."],
      "timeout": 600,
      "autoApprove": ["ask_review", "view_media"]
    }
  }
}
```

**Advanced Configuration** (with custom environment):

```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["tasksync-mcp-server", "."],
      "timeout": 600,
      "env": {
        "TASKSYNC_DEBUG": "false",
        "TASKSYNC_TIMEOUT": "60"
      },
      "autoApprove": ["ask_review", "view_media"]
    }
  }
}
```

### 3. Prompt Engineering Setup

For optimal results, add the following rules to your AI assistant:

```
# MCP Tasksync ask for review Rules
follow mcp-tasksync instructions
```

## Available Tools

### 🔍 ask_review
**Purpose**: Real-time feedback collection

- Monitors `review.md` for changes using file watcher
- Returns content immediately if file has been modified
- Waits for file changes if content is unchanged (60-second timeout)
- Critical for automated feedback loops and user interaction
- Cannot specify both head and tail parameters simultaneously

**Parameters:**
- `head` (optional): Returns only the first N lines
- `tail` (optional): Returns only the last N lines

### 🖼️ view_media
**Purpose**: Read and encode binary media files

- Supports multiple image and audio formats
- Returns base64-encoded data with proper MIME type
- Efficient streaming for large files
- Respects directory access controls

**Supported Formats:**
- **Images**: PNG, JPEG, GIF, WebP, BMP, SVG
- **Audio**: MP3, WAV, OGG, FLAC

## Server Modes

### Standard Mode (stdio)
Default MCP behavior for direct client integration:
```bash
tasksync-mcp-server .
# or
tasksync-mcp-server . --stdio
```

### SSE Mode (Server-Sent Events)
Web-based integration with HTTP endpoints:
```bash
tasksync-mcp-server . --sse --port=3001
```

**Available endpoints:**
- `GET /sse` - Server-Sent Events for real-time communication
- `POST /messages` - Message handling endpoint
- `GET /health` - Server status and configuration info

## ⚙️ Advanced Settings

### Directory Access Control

The server uses a flexible directory access control system with multiple configuration methods:

#### Method 1: Command-line Arguments
Specify allowed directories when starting the server:

```bash
tasksync-mcp-server . /path/to/additional/dir
```

#### Method 2: MCP Roots (Recommended)
Dynamic directory management via MCP client capabilities:

```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["tasksync-mcp-server"],
      "roots": [
        {
          "name": "project",
          "uri": "file:///path/to/project"
        }
      ]
    }
  }
}
```

#### Auto-Detection
If no directories are specified, the server automatically allows the current working directory:

```bash
cd /my/project
tasksync-mcp-server .  # Explicitly allows current directory
```

### Environment Variables

| Variable | Purpose | Values | Default |
|----------|---------|---------|---------|
| `TASKSYNC_DEBUG` | Debug mode | `true`/`false` | `false` |
| `TASKSYNC_TIMEOUT` | Review timeout (seconds) | `1-3600` | `60` |
| `TASKSYNC_PORT` | SSE mode port | `1024-65535` | `3001` |

### Testing Options

```bash
# Version check
npx tasksync-mcp-server --version

# Test functionality
npx tasksync-mcp-server . --test

# Debug mode
TASKSYNC_DEBUG=true npx tasksync-mcp-server .

# SSE mode testing
npx tasksync-mcp-server . --sse --port=3001
```

## Development

### Building
```bash
npm run build
```

### Testing
```bash
npm test
```

### Development Server
```bash
npm run dev         # Start in stdio mode
npm run dev:sse     # Start in SSE mode
```

## Example MCP Client Configuration

### Claude Desktop
```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["tasksync-mcp-server", "."],
      "timeout": 600,
      "autoApprove": ["ask_review", "view_media"]
    }
  }
}
```

### VS Code MCP Extension
```json
{
  "servers": {
    "tasksync": {
      "command": "npx",
      "args": ["-y", "tasksync-mcp-server", "${workspaceFolder}"]
    }
  }
}
```

### Custom Client
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: { roots: {} } }
);

// Use stdio transport
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tasksync-mcp-server", "."]
});

await client.connect(transport);
```

## Workflow Integration

TaskSync is designed for automated workflows requiring human feedback:

1. **Automated Process**: AI agent performs tasks
2. **Review Request**: Agent calls `ask_review` to request feedback
3. **Human Review**: User edits `review.md` with feedback
4. **Automatic Detection**: File watcher detects changes
5. **Process Continuation**: Agent receives feedback and continues

This creates a seamless human-in-the-loop automation system perfect for:
- Code review workflows
- Content creation pipelines  
- Quality assurance processes
- Interactive development environments

## 🐛 Common Issues

### Q: File watcher not detecting changes
**A:** Ensure the `review.md` file exists and is writable. The file watcher monitors the specific file path.

### Q: Media files not processing
**A:** Check file format support and ensure the file path is within allowed directories.

### Q: Timeout issues with ask_review
**A:** Adjust the `TASKSYNC_TIMEOUT` environment variable or use the timeout parameter in your MCP configuration.

### Q: Permission denied errors
**A:** Verify directory access permissions and ensure the server has read/write access to the specified directories.

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

**🌟 Welcome to Star and share with more developers!**
