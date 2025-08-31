import path from "path";
import os from 'os';

/**
 * Converts WSL or Unix-style Windows paths to Windows format
 * @param p The path to convert
 * @returns Converted Windows path
 */
export function convertToWindowsPath(p: string): string {
  if (p.startsWith('/mnt/')) return `${p.charAt(5).toUpperCase()}:${p.slice(6).replace(/\//g, '\\')}`;
  if (p.match(/^\/[a-zA-Z]\//)) return `${p.charAt(1).toUpperCase()}:${p.slice(2).replace(/\//g, '\\')}`;
  return p.match(/^[a-zA-Z]:/) ? p.replace(/\//g, '\\') : p;
}

/**
 * Normalizes path by standardizing format while preserving OS-specific behavior
 * @param p The path to normalize
 * @returns Normalized path
 */
export function normalizePath(p: string): string {
  p = p.trim().replace(/^["']|["']$/g, '');
  
  const isUnixPath = p.startsWith('/') && !p.match(/^\/mnt\/[a-z]\//i) && !p.match(/^\/[a-zA-Z]\//);
  if (isUnixPath) return p.replace(/\/+/g, '/').replace(/\/+$/, '');
  
  p = convertToWindowsPath(p);
  p = p.startsWith('\\\\') ? '\\\\' + p.substring(2).replace(/\\\\/g, '\\') : p.replace(/\\\\/g, '\\');
  
  let normalized = path.normalize(p);
  if (p.startsWith('\\\\') && !normalized.startsWith('\\\\')) normalized = '\\' + normalized;
  
    if (normalized.match(/^[a-zA-Z]:/)) {
    const result = normalized.replace(/\//g, '');
    return result.replace(/^[a-z]:/, m => m.toUpperCase());
  }
  
  return normalized.replace(/\//g, '\\');
}

/**
 * Expands home directory tildes in paths
 * @param filepath The path to expand
 * @returns Expanded path
 */
export function expandHome(filepath: string): string {
  return (filepath.startsWith('~/') || filepath === '~') ? path.join(os.homedir(), filepath.slice(1)) : filepath;
}
