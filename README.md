# TaskSync MCP Server

 TaskSync provides tools for interactive user feedback and command execution in AI-assisted development with image view support.


## 🌟 Key Features

#### 🔄 Continuous Review Feedback
- **get_feedback** tool that reads `feedback.md` for real-time feedback
- Automatically creates `feedback.md` if it doesn't exist in the workspace
- File watcher automatically detects changes and notifies waiting processes
- Essential for iterative development and user feedback loops

#### 🖼️ Media Processing
- **view_media** tool for images files with base64 encoding
- Supports image formats: PNG, JPEG, GIF, WebP, BMP, SVG
- Efficient streaming for large files with proper MIME type detection

## 🛠️ Quick Setup

</details>

Add to `mcp.json`:
```json
{
  "mcpServers": {
    "tasksync": {
      "command": "npx",
      "args": ["-y", "tasksync-mcp-server@latest", "/path/to/workspace"]
    }
  }
}
```
</details>

## 🔨 Available Tools

- **get_feedback** - Read feedback.md file for user review/feedback (creates file if missing)
- **view_media** - Read image (returns base64 with MIME type)

## 🛟 Best Practices

### Agent Rules for Optimal Performance

For best results with TaskSync, add these rules to your AI agent configuration:

```
# MCP TaskSync Server Tool Rules

Strictly follow mcp_tasksync_get_feedback tool descriptions and instructions.
```

These rules ensure continuous feedback loops and proper error handling.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
