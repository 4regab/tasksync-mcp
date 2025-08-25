# TaskSync MCP Server

 TaskSync provides tools for interactive user feedback and command execution in AI-assisted development with image view support.

[![Install with NPX in VS Code](https://img.shields.io/badge/Install%20with%20NPX-VS%20Code-007ACC?style=for-the-badge&logo=visual-studio-code)](https://insiders.vscode.dev/redirect/mcp/install?name=tasksync&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tasksync-mcp-server%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D)
[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/Install%20with%20NPX-VS%20Code%20Insiders-007ACC?style=for-the-badge&logo=visual-studio-code)](https://insiders.vscode.dev/redirect/mcp/install?name=tasksync&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tasksync-mcp-server%22%2C%22%24%7BworkspaceFolder%7D%22%5D%7D&quality=insiders)


## 🌟 Key Features

### 🔄 Continuous Review Feedback
- **ask_review** tool that reads `review.md` for real-time feedback
- File watcher automatically detects changes and notifies waiting processes
- Essential for iterative development and user feedback loops

### 🖼️ Media Processing
- **view_media** tool for images and audio files with base64 encoding
- Supports image formats: PNG, JPEG, GIF, WebP, BMP, SVG
- Supports audio formats: MP3, WAV, OGG, FLAC
- Efficient streaming for large files with proper MIME type detection

## 🛠️ Quick Setup

</details>

Add to `mcp.json`:
```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["-y", "tasksync-mcp-server", "/path/to/directory"]
    }
  }
}
```
</details>

## 🔨 Available Tools

- **ask_review** - Read review.md file for task feedback and workflow automation
- **view_media** - Read image/audio files (returns base64 with MIME type)

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
