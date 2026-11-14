#!/usr/bin/env node
'use strict';

/**
 *   只用 Node 内置模块。
 *
 *   node server.js
 *   PORT=8080 node server.js
 *
 * 接口：
 *   GET /api/posts          全部文章元信息（不含正文）
 *   GET /api/posts/:slug    单篇文章（含正文 markdown）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const POSTS_DIR = path.join(ROOT, 'posts');
const PORT = Number(process.env.PORT) || 3000;

if (!fs.existsSync(POSTS_DIR)) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  console.log('[init] 已创建 posts/ 目录，把 .md 文件放进去即可。');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

/* 解析 front matter（已同步 build.js 的多行数组修复） */
function parseFrontMatter(raw) {
  const m = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(raw);
  if (!m) return { data: {}, body: raw };

  const data = {};
  const lines = m[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    
    let val = line.slice(idx + 1).trim();

    // 1. 多行 YAML 数组
    if (val === '' && i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
      val = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        i++;
        val.push(lines[i].replace(/^\s*-\s+/, '').replace(/^["']|["']$/g, '').trim());
      }
    } 
    // 2. 单行数组
    else if (/^\[.*\]$/.test(val)) {
      val = val.slice(1, -1).split(',').map((s) =>
        s.trim().replace(/^["']|["']$/g, '')
      ).filter(Boolean);
    } 
    // 3. 普通字符串
    else {
      val = val.replace(/^["']|["']$/g, '');
    }
    
    data[key] = val;
  }

  return { data, body: raw.slice(m[0].length) };
}

/* 从正文生成摘要 */
function makeExcerpt(body, len) {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > len ? text.slice(0, len).trim() + '…' : text;
}

function listPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const posts = files.map((f) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, f), 'utf8');
    const { data, body } = parseFrontMatter(raw);
    const slug = f.replace(/\.md$/, '');
    const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);
    return {
      slug,
      title: data.title || slug,
      date: data.date || '',
      tags,
      excerpt: data.excerpt || makeExcerpt(body, 90),
      readingTime: Math.max(1, Math.round(body.replace(/\s/g, '').length / 350))
    };
  });

  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return posts;
}

function getPost(slug) {
  if (!/^[\w\u4e00-\u9fa5.\-]+$/.test(slug)) return null;

  const file = path.join(POSTS_DIR, slug + '.md');
  // 修复路径检查（使用 path.relative 防止 ../ 逃逸）
  const relative = path.relative(POSTS_DIR, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  if (!fs.existsSync(file)) return null;

  const raw = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontMatter(raw);
  const tags = Array.isArray(data.tags) ? data.tags : (data.tags ? [data.tags] : []);

  return {
    slug,
    title: data.title || slug,
    date: data.date || '',
    tags,
    body
  };
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function serveStatic(res, pathname) {
  const p = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, p));

  // 修复路径穿越漏洞（使用 path.relative）
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + p);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end('bad request');
    return;
  }

  if (pathname === '/api/posts') {
    try {
      sendJSON(res, 200, listPosts());
    } catch (e) {
      sendJSON(res, 500, { error: String(e) });
    }
    return;
  }

  if (pathname.startsWith('/api/posts/')) {
    const slug = pathname.slice('/api/posts/'.length);
    try {
      const post = getPost(slug);
      if (!post) return sendJSON(res, 404, { error: 'post not found' });
      sendJSON(res, 200, post);
    } catch (e) {
      sendJSON(res, 500, { error: String(e) });
    }
    return;
  }

  serveStatic(res, pathname);
}).listen(PORT, () => {
  console.log('');
  console.log('  博客已成功启动');
  console.log('  → http://localhost:' + PORT);
  console.log('');
  console.log('  文章目录: ' + POSTS_DIR);
  console.log('  往 posts/ 里放 .md 文件，刷新页面即可看到。');
  console.log('');
});