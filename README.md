# TaskSync MCP Server

 TaskSync provides tools for interactive user feedback and command execution in AI-assisted development with image view support.


## 🌟 Key Features

#### 🔄 Continuous Review Feedback
- **ask_review** tool that reads `review.md` for real-time feedback
- File watcher automatically detects changes and notifies waiting processes
- Essential for iterative development and user feedback loops

#### 🖼️ Media Processing
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
      "args": ["-y", "tasksync-mcp-server@latest", "/path/to/workspace"]
    }
  }
}
```
</details>

## 🔨 Available Tools

- **ask_review** - Read review.md file for user review/feedback
- **view_media** - Read image/audio files (returns base64 with MIME type)

## 🛟 Best Practices

### Agent Rules for Optimal Performance

For best results with TaskSync, add these rules to your AI agent configuration:

```
# MCP TaskSync Review Rules

1. You first need to search for the `review.md` file in the workspace before using the tool.
2. After searching for the file use the correct file path when calling the `ask_review` tool.
3. If an error occurs, retry the tool until it succeeds.
4. You are not allowed to end the chat; you must keep this loop forever.
5. If `review.md` returns the same content, prompt the user again.

Success criteria: Always follow the MCP TaskSync instructions.
```

These rules ensure continuous feedback loops and proper error handling.

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
